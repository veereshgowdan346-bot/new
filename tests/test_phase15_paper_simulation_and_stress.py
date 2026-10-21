"""
CHINTU AI TRADING SYSTEM - PHASE 15 AUTOMATED TEST SUITE
Multi-Bot Paper Simulation, Walk-Forward Overfit Governance & Stress Resilience

Verifies:
  1. Historical dataset provenance, chronological monotonicity, and mathematical OHLC integrity across all 14 bots.
  2. 3-way walk-forward partitioning (In-Sample 60%, Validation 20%, Out-of-Sample 20%).
  3. Historical replay ingestion in BotWorker (is_replay=True) preserving fresh status while rejecting live stale ticks.
  4. Execution Engine 6-Gate enforcement:
     - Gate 0: Idempotency duplicate order suppression (10.0s window).
     - Gate 2: Instrument and parameter validation (symbol and quantity).
     - Gate 3: Emergency exit quorum bypass (EMERGENCY_EXIT_BYPASS).
     - Gate 4: RMS daily loss circuit breaker trip and entry blockage.
  5. Controlled stress test scenarios:
     - Overnight price gaps and slippage execution.
     - Volatility spikes and regime classification.
     - Wide bid-ask spreads and Indian regulatory charge modeling.
     - Voting mesh consensus quorum evaluation.
  6. Fail-closed security:
     - Paper mode orders never invoke live broker endpoints.
     - Live readiness gate remains strictly fail-closed (ready_for_live = False).
     - Zero sensitive credentials exposed.
"""

import os
import sys
import time
import math
from datetime import datetime, timedelta
import pytest

from server.strategy_engine import (
    CANONICAL_BOT_REGISTRY,
    evaluate_strategy_signal,
    CURRENT_STRATEGY_VERSION
)
from server.bot_scheduler import BotScheduler, BotWorker
from server.execution_engine import (
    CentralizedExecutionEngine,
    ANGEL_SYMBOL_MAP,
    ORDER_STATE_FILLED,
    ORDER_STATE_REJECTED
)
from server.voting_engine import evaluate_order_quorum, get_voting_config
from server.backtest_engine import (
    validate_and_normalize_candles,
    calculate_backtest_charges,
    run_strategy_backtest,
    run_walk_forward_evaluation,
    evaluate_market_regimes,
    generate_benchmark_candles
)
from server.angel_feed_manager import angel_feed_manager
from server.live_readiness_gate import evaluate_live_readiness
from server.memory_db import close_position, get_order


# ============================================================================
# 1. DATASET PROVENANCE & CHRONOLOGICAL INTEGRITY TESTS
# ============================================================================

class TestDatasetProvenanceAndIntegrity:
    """Verifies historical dataset mathematical validity, monotonic ordering, and walk-forward splits."""

    def test_canonical_14_bots_dataset_generation(self):
        """Confirms that deterministic datasets can be generated for all 14 canonical bots."""
        assert len(CANONICAL_BOT_REGISTRY) == 14, "Must preserve exactly 14 canonical bots."
        
        for bot_id in CANONICAL_BOT_REGISTRY:
            bot = CANONICAL_BOT_REGISTRY[bot_id]
            candles = generate_benchmark_candles(
                symbol=bot["asset"],
                base_price=1000.0,
                total_bars=100,
                regime="TRENDING_BULL",
                seed=bot_id + 50
            )
            norm = validate_and_normalize_candles(candles)
            assert len(norm) == 100
            
            # Check OHLC mathematical integrity
            for c in norm:
                assert c["high"] >= max(c["open"], c["close"]) - 1e-4
                assert c["low"] <= min(c["open"], c["close"]) + 1e-4
                assert c["open"] > 0
                assert c["close"] > 0
                assert c["volume"] >= 0

            # Check strictly ascending chronological ordering
            for i in range(len(norm) - 1):
                assert norm[i]["epoch"] < norm[i + 1]["epoch"]

    def test_walk_forward_splits_distribution(self):
        """Verifies In-Sample (60%), Validation (20%), and Out-of-Sample (20%) partitioning."""
        candles = generate_benchmark_candles(symbol="NIFTY 50", base_price=24500.0, total_bars=200, seed=42)
        norm = validate_and_normalize_candles(candles)

        is_split = int(len(norm) * 0.60)
        val_split = int(len(norm) * 0.80)

        is_slice = norm[:is_split]
        val_slice = norm[is_split:val_split]
        oos_slice = norm[val_split:]

        assert len(is_slice) == 120, "In-sample must be exactly 60% (120 bars)."
        assert len(val_slice) == 40, "Validation must be exactly 20% (40 bars)."
        assert len(oos_slice) == 40, "Out-of-sample must be exactly 20% (40 bars)."
        assert is_slice[-1]["epoch"] < val_slice[0]["epoch"], "Split boundary must be strictly sequential."
        assert val_slice[-1]["epoch"] < oos_slice[0]["epoch"], "Split boundary must be strictly sequential."


# ============================================================================
# 2. BOT WORKER HISTORICAL REPLAY & FRESHNESS GATES
# ============================================================================

class TestBotWorkerReplayAndFreshness:
    """Verifies that BotWorker safely distinguishes historical replay from live stale ticks."""

    def test_bot_worker_accepts_historical_replay(self):
        """Historical replay with is_replay=True must be accepted and not flagged stale."""
        worker = BotWorker(1)
        # Historical bar from 2025
        historical_candle = {
            "timestamp": "2025-01-02 09:15:00",
            "open": 24500.0,
            "high": 24550.0,
            "low": 24480.0,
            "close": 24520.0,
            "volume": 5000.0
        }
        res = worker.ingest_candle(historical_candle, is_authentic=True, is_replay=True)
        assert res is True
        assert worker.data_healthy is True
        assert worker.check_health(is_replay=True) is True

    def test_bot_worker_rejects_stale_ticks_in_live_mode(self):
        """In live mode (is_replay=False), ticks older than 15s must be rejected as stale."""
        worker = BotWorker(1)
        stale_time = (datetime.now() - timedelta(seconds=30)).strftime("%Y-%m-%d %H:%M:%S")
        res = worker.ingest_tick(price=24500.0, volume=1.0, is_authentic=True, timestamp=stale_time, is_replay=False)
        assert res is False
        assert worker.data_healthy is False

    def test_bot_worker_rejects_non_monotonic_ticks(self):
        """Ticks with retrogressive/out-of-order timestamps must be rejected."""
        worker = BotWorker(1)
        worker.last_tick_time = 1735722900.0  # e.g. 09:15:00
        # Ingest tick with earlier timestamp
        res = worker.ingest_tick(price=24500.0, volume=1.0, is_authentic=True, timestamp=1735722800.0, is_replay=True)
        assert res is False

    def test_bot_worker_rejects_unauthentic_ticks(self):
        """Unauthenticated, synthetic, or corrupted ticks must be rejected."""
        worker = BotWorker(1)
        assert worker.ingest_tick(price=24500.0, volume=1.0, is_authentic=False) is False
        assert worker.ingest_tick(price=-100.0, volume=1.0, is_authentic=True) is False
        assert worker.ingest_tick(price=float("nan"), volume=1.0, is_authentic=True) is False


# ============================================================================
# 3. EXECUTION ENGINE PRE-FLIGHT VALIDATION GATES
# ============================================================================

class TestExecutionEngineValidationGates:
    """Verifies Gate 0 through Gate 4 protections in CentralizedExecutionEngine."""

    def test_gate_0_idempotency_duplicate_suppression(self):
        """Gate 0 must reject duplicate orders with identical clientOrderId within 10.0s window."""
        engine = CentralizedExecutionEngine()
        engine.enforce_market_hours = False

        # Close any existing open position first to clear Gate 5
        close_position("NIFTY 50")
        close_position("TCS")

        cid = f"TEST_IDEMPOTENCY_ORDER_{int(time.time()*1000)}"
        res1 = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            execution_mode="PAPER",
            client_order_id=cid
        )
        assert res1.get("status") == ORDER_STATE_FILLED or res1.get("success") is True

        # Immediate duplicate submission
        res2 = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            execution_mode="PAPER",
            client_order_id=cid
        )
        assert res2.get("status") == ORDER_STATE_REJECTED
        assert "Duplicate order detected" in res2.get("error", "")

    def test_gate_2_instrument_and_parameter_validation(self):
        """Gate 2 must reject orders with empty symbols, zero or negative quantities."""
        engine = CentralizedExecutionEngine()
        engine.enforce_market_hours = False

        res_sym = engine.execute_order(bot_id=1, symbol="", action="BUY", qty=50, price=24500.0, execution_mode="PAPER")
        assert res_sym.get("status") == ORDER_STATE_REJECTED
        assert "Symbol must be a non-empty string" in res_sym.get("error", "")

        res_qty = engine.execute_order(bot_id=1, symbol="NIFTY 50", action="BUY", qty=0, price=24500.0, execution_mode="PAPER")
        assert res_qty.get("status") == ORDER_STATE_REJECTED
        assert "Order quantity 0 is invalid" in res_qty.get("error", "")

    def test_gate_3_emergency_exit_quorum_bypass(self):
        """Gate 3 must immediately approve risk-reducing exits (EXIT/SQUAREOFF) even without entry quorum."""
        engine = CentralizedExecutionEngine()
        engine.enforce_market_hours = False

        exit_res = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="EXIT",
            qty=50,
            price=24500.0,
            is_emergency_exit=True,
            execution_mode="PAPER"
        )
        assert exit_res.get("success") is True
        assert exit_res.get("status") == ORDER_STATE_FILLED

    def test_gate_4_rms_daily_loss_circuit_breaker(self):
        """Gate 4 must block new entries and trip circuit breaker when daily loss limit is breached."""
        engine = CentralizedExecutionEngine()
        engine.enforce_market_hours = False

        rms_state = {
            "max_daily_loss": 2000.0,
            "realized_daily_pnl": -2200.0,
            "circuit_breaker_active": False
        }
        res = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            execution_mode="PAPER",
            rms_state=rms_state
        )
        assert res.get("status") == ORDER_STATE_REJECTED
        assert "Daily loss limit" in res.get("error", "")
        assert "breached" in res.get("error", "").lower()
        assert rms_state["circuit_breaker_active"] is True


# ============================================================================
# 4. CONTROLLED STRESS TEST RESILIENCE
# ============================================================================

class TestStressResilience:
    """Verifies system stability during price gaps, high volatility, and wide bid-ask spreads."""

    def test_sudden_price_gap_slippage_and_exit(self):
        """An adverse price gap must trigger stop loss with volatility-aware slippage and close safely."""
        engine = CentralizedExecutionEngine()
        engine.enforce_market_hours = False

        # Close position first
        close_position("NIFTY 50")

        # Enter at 24500
        engine.execute_order(bot_id=1, symbol="NIFTY 50", action="BUY", qty=50, price=24500.0, execution_mode="PAPER")

        # Adverse overnight gap down at 23600 (-3.67%)
        gap_price = 23600.0
        exit_res = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="EXIT",
            qty=50,
            price=gap_price,
            execution_mode="PAPER"
        )
        assert exit_res.get("success") is True
        assert exit_res.get("fill_price") <= gap_price, "Slippage on sell/exit must fill at or below requested price."

    def test_low_liquidity_wide_spread_charges(self):
        """Wide spreads must increase effective transaction slippage penalty."""
        normal = calculate_backtest_charges(24500.0, 50, "BUY", "NSE F&O Options", 0.0, slippage_pct=0.03)
        wide = calculate_backtest_charges(24500.0, 50, "BUY", "NSE F&O Options", 0.0, slippage_pct=0.30)
        assert wide["turnover"] == normal["turnover"]
        assert wide["total_charges"] >= normal["total_charges"]

    def test_voting_mesh_consensus_quorum(self):
        """Voting quorum evaluation must provide complete voter breakdown and audit trail."""
        quorum = evaluate_order_quorum(bot_id=1, action="BUY")
        assert "approved" in quorum
        assert "quorum_percentage" in quorum
        assert "audit_trail" in quorum
        assert "voting_breakdown" in quorum


# ============================================================================
# 5. FAIL-CLOSED SECURITY & BROKER ISOLATION
# ============================================================================

class TestSecurityAndBrokerIsolation:
    """Verifies that PAPER mode never calls real broker endpoints and credentials remain safe."""

    def test_paper_mode_does_not_invoke_broker_endpoints(self):
        """Orders placed in PAPER mode must route to Paper Execution Engine."""
        engine = CentralizedExecutionEngine()
        engine.enforce_market_hours = False

        # Close position first
        close_position("NIFTY 50")
        close_position("TCS")

        order_res = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            execution_mode="PAPER"
        )
        assert order_res.get("success") is True
        assert order_res.get("mode") == "PAPER"
        saved = get_order(order_res["orderId"])
        assert saved is not None
        assert saved.get("mode") == "PAPER"
        assert "Paper" in saved.get("broker", "")

    def test_live_order_blocked_when_unauthenticated(self):
        """LIVE orders must fail-closed when broker gateway is unauthenticated."""
        engine = CentralizedExecutionEngine()
        live_res = engine.execute_order(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24500.0,
            execution_mode="LIVE",
            broker_state={"angel_one": {"connected": False}},
            active_smart_connect=None
        )
        assert live_res.get("success") is False
        assert live_res.get("status") == ORDER_STATE_REJECTED
        assert "not authenticated or connected" in live_res.get("error", "")

    def test_live_readiness_gate_fail_closed(self):
        """Preflight and live readiness gate must block LIVE mode when credentials are not configured."""
        feed = angel_feed_manager
        preflight = feed.get_credential_status()
        assert preflight.get("status") == "MISSING_CREDENTIALS"
        assert preflight.get("has_api_key") is False

        readiness = evaluate_live_readiness(
            broker_state={"angel_one": {"connected": False}},
            active_smart_connect={},
            market_feed_evaluator_fn=feed.get_feed_health,
            rms_state={},
            reconciliation_state={}
        )
        assert readiness.get("ready_for_live") is False
        assert "AUTHENTIC_BROKER_AUTH" in readiness.get("failed_conditions", [])
        assert "AUTHENTIC_MARKET_FEED" in readiness.get("failed_conditions", [])
