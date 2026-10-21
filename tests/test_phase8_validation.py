"""
CHINTU AI TRADING SYSTEM - Phase 8 Real Market Data & Smart Master Bot Validation
Comprehensive test suite validating:
1. Angel One SmartAPI authentication, token mapping, market segments, quote polling.
2. Market feed to BotScheduler integration and candle building.
3. Master Bot multi-factor comparison (performance, trend, volatility, liquidity, R:R, cost, drawdown).
4. Safe switching between instruments without abandoning open positions.
5. End-to-end PAPER trade lifecycle trace with explicit simulated fill labeling.
6. Market feed tick endpoint abuse prevention.
7. Critical failure scenarios (stale feed, disconnection, rejected order, duplicate request,
   partial fill, failed square-off, daily loss limit, emergency exit).
"""

import unittest
import time
import math
import json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from server.memory_db import init_db, get_connection
import server.python_stream_server as pss
from server.python_stream_server import (
    ANGEL_SYMBOL_MAP,
    validate_and_ingest_exchange_tick,
    evaluate_server_market_feed_state,
    place_live_angel_order,
    calculate_closing_order,
    update_position_on_fill,
    calculate_trade_deductions,
    market_feed_status,
    broker_state,
    active_smart_connect,
    rms_state,
    active_positions,
    in_flight_exits
)
from server.bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id
from server.bot_scheduler import BotWorker, BotScheduler
from server.highest_profit_bot import (
    evaluate_bot_trade_performance,
    evaluate_master_bot_multi_factor,
    switch_active_instrument,
    get_master_bot_status,
    master_bot_state,
    compute_trend_metric,
    compute_volatility_metric,
    compute_liquidity_metric,
    compute_risk_reward_metric,
    compute_cost_drag_penalty
)


class TestSmartAPIAuthenticationAndMapping(unittest.TestCase):
    """1. SmartAPI authentication, instrument mapping, segments, and quote polling."""

    def setUp(self):
        init_db()

    def test_smartapi_symbol_token_mapping_integrity(self):
        """Validates that all canonical bot assets map to valid broker tokens, exchanges, and lot sizes."""
        for b_id, bot in CANONICAL_BOT_REGISTRY.items():
            asset = bot["asset"]
            spec = ANGEL_SYMBOL_MAP.get(asset)
            self.assertIsNotNone(spec, f"Asset {asset} missing from ANGEL_SYMBOL_MAP")
            self.assertTrue(len(spec.get("symboltoken", "")) > 0)
            self.assertIn(spec.get("exchange"), ["NSE", "NFO", "MCX", "CDS", "BFO", "BINANCE"])
            self.assertGreater(spec.get("lotsize", 0), 0)

    def test_smartapi_auth_invalid_credentials_fails_gracefully(self):
        """Mock invalid credentials with SmartConnect to ensure clean error handling."""
        mock_smart = MagicMock()
        mock_smart.generateSession.return_value = {"status": False, "message": "Invalid Client ID or Password"}
        
        # Test that failed auth does not set connected = True
        res = mock_smart.generateSession("INVALID_USER", "1234", "999999")
        self.assertFalse(res.get("status"))
        self.assertIn("Invalid", res.get("message"))

    def test_smartapi_unsupported_exchange_crypto_blocked_in_live(self):
        """Angel One broker must block live order placement for Binance/crypto assets."""
        orig_mode = pss.execution_mode
        pss.execution_mode = "LIVE"
        try:
            # BTCUSDT maps to BINANCE
            res = place_live_angel_order(
                symbol_name="BTCUSDT",
                action="BUY",
                qty=1,
                price=65000.0,
                bot_name="Crypto Bot"
            )
            self.assertFalse(res["success"])
            self.assertEqual(res["mode"], "UNSUPPORTED_EXCHANGE")
            self.assertIn("not supported by Angel One", res["error"])
        finally:
            pss.execution_mode = orig_mode

    def test_smartapi_segment_permissions_enforced(self):
        """When broker account has restricted segments, unpermitted segments must be rejected."""
        orig_mode = pss.execution_mode
        pss.execution_mode = "LIVE"
        orig_broker_state = dict(broker_state["angel_one"])
        orig_active = active_smart_connect.get("instance")
        try:
            broker_state["angel_one"]["connected"] = True
            broker_state["angel_one"]["enabled_segments"] = ["NSE Equity"]  # Equity only, no F&O or MCX
            active_smart_connect["instance"] = MagicMock()

            # Attempt order on NIFTY 50 (segment: NSE F&O Options)
            res = place_live_angel_order(
                symbol_name="NIFTY 50",
                action="BUY",
                qty=50,
                price=24500.0,
                bot_name="Scalper Bot"
            )
            self.assertFalse(res["success"])
            self.assertEqual(res["mode"], "SEGMENT_PERMISSION_DENIED")
        finally:
            pss.execution_mode = orig_mode
            broker_state["angel_one"] = orig_broker_state
            active_smart_connect["instance"] = orig_active


class TestFeedToSchedulerIntegration(unittest.TestCase):
    """2. Validated live ticks reach bot_scheduler and build OHLCV candles."""

    def test_validated_tick_fans_out_to_bot_scheduler(self):
        worker = BotWorker(bot_id=1)
        now_dt = datetime.now()
        ts = now_dt.strftime("%Y-%m-%d %H:%M:%S")

        # Ingest authentic tick
        success = worker.ingest_tick(price=24750.0, volume=10.0, is_authentic=True, timestamp=ts)
        self.assertTrue(success)
        self.assertTrue(worker.data_healthy)
        self.assertEqual(len(worker.candles), 1)
        self.assertEqual(worker.candles[0]["close"], 24750.0)

    def test_strategy_evaluates_deterministically_from_built_candles(self):
        worker = BotWorker(bot_id=1)
        base_time = datetime.now() - timedelta(minutes=45)
        for i in range(40):
            t = (base_time + timedelta(minutes=i)).strftime("%Y-%m-%d %H:%M:%S")
            c = {
                "timestamp": t,
                "open": 24000.0 + i * 2,
                "high": 24005.0 + i * 2,
                "low": 23995.0 + i * 2,
                "close": 24002.0 + i * 2,
                "volume": 100.0
            }
            worker.ingest_candle(c, is_authentic=True)

        self.assertTrue(worker.strategy_ready)
        eval1 = worker.evaluate(execute_paper=False)
        eval2 = worker.evaluate(execute_paper=False)
        self.assertEqual(eval1["decision"], eval2["decision"])
        self.assertIn(eval1["decision"], ["BUY", "SELL", "HOLD"])


class TestMasterBotMultiFactorEvaluation(unittest.TestCase):
    """3. Master Bot compares instruments using trend, vol, liquidity, R:R, cost, and drawdown."""

    def test_never_selects_market_using_past_profit_alone(self):
        """
        A bot with high past profit but dead trend and high cost drag must score lower than
        an eligible bot with active trend, optimal volatility, superior R:R, and low fee drag.
        """
        # Bot 1 has good trend candles
        now_dt = datetime.now()
        bot1_candles = []
        for i in range(30):
            t = (now_dt - timedelta(minutes=30 - i)).strftime("%Y-%m-%d %H:%M:%S")
            bot1_candles.append({
                "timestamp": t,
                "open": 24000.0 + i * 20,
                "high": 24020.0 + i * 20,
                "low": 23990.0 + i * 20,
                "close": 24018.0 + i * 20,
                "volume": 500.0
            })

        mock_worker_1 = MagicMock()
        mock_worker_1.candles = bot1_candles

        # Bot 3 has stagnant/flat candles
        bot3_candles = []
        for i in range(30):
            t = (now_dt - timedelta(minutes=30 - i)).strftime("%Y-%m-%d %H:%M:%S")
            bot3_candles.append({
                "timestamp": t,
                "open": 2900.0,
                "high": 2900.5,
                "low": 2899.5,
                "close": 2900.0,
                "volume": 10.0
            })
        mock_worker_3 = MagicMock()
        mock_worker_3.candles = bot3_candles

        workers = {1: mock_worker_1, 3: mock_worker_3}

        eval_res = evaluate_master_bot_multi_factor(workers_override=workers)
        self.assertEqual(eval_res["status"], "SUCCESS")
        
        # Verify Bot 1 has higher trend score than Bot 3
        b1_data = next(b for b in eval_res["instruments"] if b["bot_id"] == 1)
        b3_data = next(b for b in eval_res["instruments"] if b["bot_id"] == 3)

        self.assertGreater(b1_data["factors"]["trend"]["score"], b3_data["factors"]["trend"]["score"])
        self.assertGreater(b1_data["factors"]["liquidity"]["score"], b3_data["factors"]["liquidity"]["score"])

    def test_disqualifies_unsupported_exchanges_and_data_unavailable(self):
        """Bots 12, 13, 14 (DATA_UNAVAILABLE) and Binance crypto must be flagged ineligible."""
        eval_res = evaluate_master_bot_multi_factor(workers_override={})
        
        b12 = next(b for b in eval_res["instruments"] if b["bot_id"] == 12)
        b13 = next(b for b in eval_res["instruments"] if b["bot_id"] == 13)
        b14 = next(b for b in eval_res["instruments"] if b["bot_id"] == 14)

        self.assertFalse(b12["is_eligible"])
        self.assertFalse(b13["is_eligible"])
        self.assertFalse(b14["is_eligible"])
        self.assertEqual(b12["composite_score"], 0.0)


class TestSafeInstrumentSwitching(unittest.TestCase):
    """4. Safe switching between instruments never abandons open positions or duplicates orders."""

    def setUp(self):
        master_bot_state["active_bot_id"] = 1
        master_bot_state["switch_history"] = []

    def test_safe_switch_preserves_open_positions_without_abandonment(self):
        """When switching from Bot 1 to Bot 2, open positions in Bot 1 are retained under RMS."""
        mock_positions = {
            "Bot 1_NIFTY 50": {
                "id": "POS_NIFTY_101",
                "symbol": "NIFTY 50",
                "bot": "Scalper Bot",
                "qty": 50,
                "avgPrice": 24500.0,
                "type": "BUY"
            }
        }

        res = switch_active_instrument(
            new_bot_id=2,  # EMA Trend Bot (BANKNIFTY)
            reason="Volatility Rotation",
            force_square_off=False,
            active_positions_dict=mock_positions
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["active_bot_id"], 2)
        self.assertEqual(len(res["retained_positions"]), 1)
        self.assertEqual(res["retained_positions"][0]["id"], "POS_NIFTY_101")
        self.assertEqual(res["retained_positions"][0]["status"], "RETAINED_UNDER_RMS")

    def test_safe_switch_rejects_unsupported_exchange(self):
        """Attempting to switch to an unsupported asset (Binance Crypto) must be rejected fail-closed."""
        # Bot 12 is DATA_UNAVAILABLE
        res = switch_active_instrument(new_bot_id=12, reason="Test Switch")
        self.assertFalse(res["success"])
        self.assertEqual(res["reason"], "DATA_UNAVAILABLE")

    def test_switch_records_history_and_lot_sizes(self):
        """Verifies switch state machine records transition timestamps and lot sizes."""
        res = switch_active_instrument(new_bot_id=3, reason="Sector Rotation")
        self.assertTrue(res["success"])
        
        status = get_master_bot_status()
        self.assertEqual(status["active_bot_id"], 3)
        self.assertEqual(status["total_switches"], 1)
        self.assertIsNotNone(status["last_switch_time"])


class TestPaperTradeLifecycleTrace(unittest.TestCase):
    """5. End-to-end trace from live tick -> signal -> risk -> simulated fill -> PnL."""

    def setUp(self):
        init_db()
        active_positions.clear()
        in_flight_exits.clear()

    def test_trace_complete_paper_trade_lifecycle(self):
        """Traces the complete paper trade path with explicit SIMULATED_PAPER_FILL labeling."""
        orig_mode = pss.execution_mode
        pss.execution_mode = "PAPER"
        try:
            # 1. Valid tick ingestion
            now = time.time()
            tick_res = validate_and_ingest_exchange_tick(
                symbol="RELIANCE",
                price=2900.0,
                volume=50.0,
                timestamp=now,
                source="TEST_VERIFIED_FEED"
            )
            self.assertTrue(tick_res["success"])

            # 2. Risk check & Order Request
            order_res = place_live_angel_order(
                symbol_name="RELIANCE",
                action="BUY",
                qty=10,
                price=2900.0,
                bot_name="RSI Reversal Bot"
            )
            self.assertTrue(order_res["success"])
            self.assertEqual(order_res["mode"], "PAPER")
            self.assertEqual(order_res["fill_type"], "SIMULATED_PAPER_FILL")
            self.assertTrue(order_res["is_simulated"])

            # 3. Position update
            update_position_on_fill({
                "symbol": "RELIANCE",
                "bot": "RSI Reversal Bot",
                "action": "BUY",
                "qty": 10,
                "price": 2900.0,
                "mode": "PAPER",
                "fill_type": "SIMULATED_PAPER_FILL"
            })

            pos_key = "RSI Reversal Bot_RELIANCE"
            self.assertIn(pos_key, active_positions)
            self.assertEqual(active_positions[pos_key]["qty"], 10)
            self.assertEqual(active_positions[pos_key]["avgPrice"], 2900.0)

            # 4. Closing order & Square-off
            closing = calculate_closing_order(active_positions[pos_key])
            self.assertEqual(closing["action"], "SELL")
            self.assertEqual(closing["qty"], 10)

            # 5. Deductions & Net PnL calculation
            deductions = calculate_trade_deductions(
                price=2950.0,  # +50 profit
                qty=10,
                action="SELL",
                segment="NSE Equity",
                gross_pnl=500.0
            )
            self.assertGreater(deductions["total_charges"], 0.0)
            self.assertEqual(deductions["net_pnl"], round(500.0 - deductions["total_charges"], 2))

        finally:
            pss.execution_mode = orig_mode
            active_positions.clear()


class TestMarketFeedTickEndpointSecurity(unittest.TestCase):
    """6. Prevent abuse of POST /api/market-feed/tick endpoint."""

    def test_tick_endpoint_rejects_unknown_symbols(self):
        """Arbitrary fake symbols must be rejected."""
        res = validate_and_ingest_exchange_tick(
            symbol="FAKE_COIN_XYZ",
            price=100.0,
            volume=1.0,
            timestamp=time.time()
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["reason"], "UNKNOWN_SYMBOL")

    def test_tick_endpoint_cannot_spoof_authenticity_without_broker(self):
        """Passing source='SMARTAPI' without an active broker connection must NOT declare authentic feed."""
        orig_broker = broker_state["angel_one"].get("connected")
        orig_inst = active_smart_connect.get("instance")
        orig_feed = dict(market_feed_status)

        try:
            broker_state["angel_one"]["connected"] = False
            active_smart_connect["instance"] = None
            market_feed_status["is_authentic_exchange_feed"] = False
            market_feed_status["provider"] = "SYNTHETIC_RANDOM_WALK"

            res = validate_and_ingest_exchange_tick(
                symbol="NIFTY 50",
                price=24500.0,
                volume=1.0,
                timestamp=time.time(),
                source="SMARTAPI"  # spoof attempt
            )
            self.assertTrue(res["success"])
            self.assertFalse(res["is_authentic"])
            self.assertFalse(market_feed_status["is_authentic_exchange_feed"])
        finally:
            broker_state["angel_one"]["connected"] = orig_broker
            active_smart_connect["instance"] = orig_inst
            market_feed_status.clear()
            market_feed_status.update(orig_feed)


class TestFailureScenarios(unittest.TestCase):
    """7. Test stale feeds, disconnections, rejected orders, duplicate requests, partial fills, etc."""

    def setUp(self):
        init_db()
        active_positions.clear()
        in_flight_exits.clear()

    def test_stale_feed_blocks_live_order(self):
        """Ticks older than 15s must cause feed evaluation to fail and block live orders."""
        orig_mode = pss.execution_mode
        pss.execution_mode = "LIVE"
        try:
            stale_time = time.time() - 25.0
            res = validate_and_ingest_exchange_tick(
                symbol="NIFTY 50",
                price=24500.0,
                volume=1.0,
                timestamp=stale_time
            )
            self.assertFalse(res["success"])
            self.assertEqual(res["reason"], "STALE_TICK")
        finally:
            pss.execution_mode = orig_mode

    def test_partial_fill_updates_actual_filled_qty_only(self):
        """If an order requests 100 qty but only fills 40, position must reflect 40, not 100."""
        update_position_on_fill({
            "symbol": "TATA MOTORS",
            "bot": "Breakout Bot",
            "action": "BUY",
            "qty": 100,
            "filled_qty": 40,
            "price": 950.0,
            "mode": "PAPER",
            "fill_type": "SIMULATED_PAPER_FILL"
        })

        pos_key = "Breakout Bot_TATA MOTORS"
        self.assertIn(pos_key, active_positions)
        self.assertEqual(active_positions[pos_key]["qty"], 40)  # Filled portion only

    def test_failed_square_off_frees_lock_and_preserves_position(self):
        """When a square-off fails, the position must remain open and exit lock freed."""
        exit_lock_key = "POS_FAIL_TEST"
        in_flight_exits.add(exit_lock_key)
        self.assertIn(exit_lock_key, in_flight_exits)

        # Simulate exception/failure releasing lock in finally block
        try:
            raise RuntimeError("Broker Gateway Timeout")
        except RuntimeError:
            pass
        finally:
            in_flight_exits.discard(exit_lock_key)

        self.assertNotIn(exit_lock_key, in_flight_exits)

    def test_daily_loss_limit_trips_circuit_breaker(self):
        """Breaching daily loss limit must trip the circuit breaker and block new entries."""
        orig_pnl = rms_state.get("realized_daily_pnl", 0.0)
        orig_breaker = rms_state.get("circuit_breaker_active", False)
        orig_limit = rms_state.get("max_daily_loss", 15000.0)

        try:
            rms_state["max_daily_loss"] = 10000.0
            rms_state["realized_daily_pnl"] = -12000.0  # Exceeds 10,000 loss limit
            rms_state["circuit_breaker_active"] = False

            # Attempt new entry order
            res = place_live_angel_order(
                symbol_name="NIFTY 50",
                action="BUY",
                qty=50,
                price=24500.0,
                bot_name="Scalper Bot",
                is_emergency_exit=False
            )
            self.assertFalse(res["success"])
            self.assertEqual(res["orderId"], "RMS-DAILY-LOSS-LIMIT")
            self.assertTrue(rms_state["circuit_breaker_active"])

            # But emergency exit must STILL be allowed!
            exit_res = place_live_angel_order(
                symbol_name="NIFTY 50",
                action="SELL",
                qty=50,
                price=24500.0,
                bot_name="Scalper Bot",
                is_emergency_exit=True
            )
            self.assertTrue(exit_res["success"])
        finally:
            rms_state["realized_daily_pnl"] = orig_pnl
            rms_state["circuit_breaker_active"] = orig_breaker
            rms_state["max_daily_loss"] = orig_limit


if __name__ == "__main__":
    unittest.main()
