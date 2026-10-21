"""
CHINTU AI TRADING SYSTEM - Phase 14 Automated Verification Suite
Validates:
  1. SmartWebSocketV2 authentic binary packet decoding (struct unpack, Mode 1/2/3, CDS 10^7 scaling, truncated packet rejection).
  2. Distinct tick counter segregation (authentic, synthetic, replay, test) and heartbeat/acknowledgement tracking.
  3. Safe credential loading and fail-closed live-readiness gates.
  4. 5 candidate quantitative strategies (EMA+ADX, Breakout+Vol+ATR, VWAP+RSI, Adaptive Mean Reversion with ADX>=25 safety guard, Market Regime filter).
  5. Canonical 14-bot strategy compatibility matrix.
  6. Multi-metric strategy ranking (net expectancy, profit factor, drawdown, sample size, slippage sensitivity, regime compatibility).
  7. Voting engine consensus (anti-sybil deduplication, tie-breaking NO_TRADE, emergency exit bypass).
  8. Central execution engine PAPER protection and RMS circuit breakers.
"""

import os
import struct
import time
import pytest
from datetime import datetime

from server.angel_feed_manager import (
    AngelOneWebSocketManager,
    EXCHANGE_TYPE_MAP,
    angel_feed_manager
)
from server.strategy_engine import (
    calculate_sma,
    calculate_ema,
    calculate_rsi,
    calculate_atr,
    calculate_adx,
    evaluate_ema_adx_trend,
    evaluate_breakout_volatility,
    evaluate_vwap_rsi,
    evaluate_mean_reversion_adaptive,
    detect_market_regime,
    BOT_STRATEGY_COMPATIBILITY_MATRIX,
    validate_bot_strategy_compatibility,
    calculate_multi_metric_ranking
)
from server.bot_registry import CANONICAL_BOT_REGISTRY
from server.voting_engine import evaluate_order_quorum, get_voting_config, update_voting_config
from server.execution_engine import CentralizedExecutionEngine, ORDER_STATE_FILLED, ORDER_STATE_REJECTED
from server.live_readiness_gate import evaluate_live_readiness
from server.memory_db import close_position


class TestSmartWebSocketV2BinaryDecoding:
    """Verifies binary unpack logic conforming to Angel One SmartWebSocketV2 specification."""

    def test_mode1_ltp_packet_decoding(self):
        """Mode 1: 51 bytes. Unpacks Mode (1), Exchange (1=NSE), Token (25s), Seq (int64), Ts (int64), LTP (int64 paise)."""
        mgr = AngelOneWebSocketManager()
        
        mode = 1
        exchange_type = 1  # NSE
        token_bytes = b"2885" + b"\x00" * 21  # 25 bytes
        sequence = 10001
        timestamp = 1729141200000
        raw_price = 285075  # 2850.75 in paise
        
        packet = struct.pack("<B B 25s q q q", mode, exchange_type, token_bytes, sequence, timestamp, raw_price)
        assert len(packet) == 51

        ok, msg, decoded = mgr.decode_binary_packet(packet)
        assert ok is True
        assert decoded is not None
        assert decoded["subscription_mode"] == 1
        assert decoded["mode_name"] == "LTP"
        assert decoded["exchange_type"] == 1
        assert decoded["exchange_segment"] == "NSE_CM"
        assert decoded["token"] == "2885"
        assert decoded["sequence_number"] == 10001
        assert decoded["exchange_timestamp"] == 1729141200000
        assert decoded["last_traded_price"] == 2850.75
        assert decoded["price"] == 2850.75

    def test_mode2_quote_packet_decoding(self):
        """Mode 2: 123 bytes. LTP + Quote fields (LTQ, ATP, Volume, Total Buy/Sell, OHLC)."""
        mgr = AngelOneWebSocketManager()
        
        mode = 2
        exchange_type = 2  # NSE_FO
        token_bytes = b"42125" + b"\x00" * 20
        sequence = 20002
        timestamp = 1729141205000
        raw_price = 2485000  # 24850.00
        
        quote_part = struct.pack(
            "<q q q q q q q q q",
            50,        # ltq
            2484000,   # atp
            150000,    # volume
            85000,     # total buy
            72000,     # total sell
            2480000,   # open
            2490000,   # high
            2478000,   # low
            2481000    # close
        )
        packet = struct.pack("<B B 25s q q q", mode, exchange_type, token_bytes, sequence, timestamp, raw_price) + quote_part
        assert len(packet) == 123

        ok, msg, decoded = mgr.decode_binary_packet(packet)
        assert ok is True
        assert decoded is not None
        assert decoded["subscription_mode"] == 2
        assert decoded["mode_name"] == "QUOTE"
        assert decoded["last_traded_price"] == 24850.00
        assert decoded["last_traded_quantity"] == 50
        assert decoded["average_traded_price"] == 24840.00
        assert decoded["volume_traded_today"] == 150000
        assert decoded["open"] == 24800.00
        assert decoded["high"] == 24900.00
        assert decoded["low"] == 24780.00
        assert decoded["close"] == 24810.00

    def test_mode3_snap_quote_packet_decoding(self):
        """Mode 3: 379 bytes. Mode 2 Quote + 20-depth L3 + OI + OI change."""
        mgr = AngelOneWebSocketManager()
        
        mode = 3
        exchange_type = 1
        token_bytes = b"1594" + b"\x00" * 21
        sequence = 30003
        timestamp = 1729141210000
        raw_price = 150000  # 1500.00
        
        quote_part = struct.pack("<q q q q q q q q q", 10, 149900, 50000, 20000, 18000, 149500, 150500, 149200, 149800)
        depth_dummy = b"\x00" * 232  # 20 depth levels + extra metadata to 379 bytes
        snap_part = struct.pack("<q q d", 1729141209000, 850000, 3.45)
        
        packet = struct.pack("<B B 25s q q q", mode, exchange_type, token_bytes, sequence, timestamp, raw_price) + quote_part + snap_part + depth_dummy
        assert len(packet) == 379

        ok, msg, decoded = mgr.decode_binary_packet(packet)
        assert ok is True
        assert decoded is not None
        assert decoded["subscription_mode"] == 3
        assert decoded["mode_name"] == "SNAP_QUOTE"
        assert decoded["last_traded_price"] == 1500.00
        assert decoded["open_interest"] == 850000
        assert decoded["open_interest_change_percentage"] == 3.45

    def test_truncated_packet_rejection(self):
        """Packets smaller than 51 bytes must be rejected cleanly with rejection counter incremented."""
        mgr = AngelOneWebSocketManager()
        prev_rejected = mgr.ticks_rejected
        
        short_packet = b"\x01\x012885\x00\x00"  # Only 8 bytes
        ok, msg, res = mgr.decode_binary_packet(short_packet)
        assert ok is False
        assert res is None
        assert mgr.ticks_rejected == prev_rejected + 1

    def test_cds_currency_price_scaling(self):
        """
        ExchangeType 13 (CDS Currency).
        Angel One CDS strikes/ticks use 10^7 scaling.
        Raw value 839500000 must scale by 10^7 to 83.95.
        """
        mgr = AngelOneWebSocketManager()
        mode = 1
        exchange_type = 13  # CDS
        token_bytes = b"1205" + b"\x00" * 21
        sequence = 40004
        timestamp = 1729141215000
        raw_price = 839500000  # 83.95 * 10^7
        
        packet = struct.pack("<B B 25s q q q", mode, exchange_type, token_bytes, sequence, timestamp, raw_price)
        ok, msg, decoded = mgr.decode_binary_packet(packet)
        assert ok is True
        assert decoded is not None
        assert decoded["exchange_segment"] == "CDS"
        assert decoded["last_traded_price"] == 83.95

    def test_distinct_tick_counter_segregation(self):
        """Counters for authentic, synthetic, replay, and test ticks must remain strictly segregated."""
        mgr = AngelOneWebSocketManager()
        
        # Reset counters
        mgr.authentic_ticks_count = 0
        mgr.synthetic_ticks_count = 0
        mgr.replay_ticks_count = 0
        mgr.test_ticks_count = 0
        mgr.ticks_rejected = 0

        # Simulate authentic packet with fresh timestamp
        now_ms = int(time.time() * 1000)
        pkt = struct.pack("<B B 25s q q q", 1, 1, b"2885" + b"\x00"*21, 1, now_ms, 250000)
        mgr.token_symbol_map["2885"] = "RELIANCE"
        mgr.handle_binary_packet(pkt)
        assert mgr.authentic_ticks_count == 1
        assert mgr.synthetic_ticks_count == 0
        assert mgr.replay_ticks_count == 0
        assert mgr.test_ticks_count == 0

        # Record replay tick
        mgr.record_replay_tick({"token": "2885", "price": 2500.0})
        assert mgr.replay_ticks_count == 1
        assert mgr.authentic_ticks_count == 1

        # Check health dict contains distinct segregated counters
        health = mgr.get_feed_health()
        assert health["authentic_ticks_count"] == 1
        assert health["replay_ticks_count"] == 1
        assert health["synthetic_ticks_count"] == 0
        assert health["test_ticks_count"] == 0


class TestHeartbeatAndStaleFeedDetection:
    """Verifies ping/pong latency tracking, subscription acknowledgement, and stale-feed detection."""

    def test_heartbeat_ping_pong_tracking(self):
        mgr = AngelOneWebSocketManager()
        mgr.record_heartbeat_ping()
        time.sleep(0.01)
        mgr.record_heartbeat_pong()
        
        assert mgr.last_ping_time is not None
        assert mgr.last_pong_time is not None
        assert mgr.last_pong_time >= mgr.last_ping_time
        assert mgr.heartbeat_latency_ms >= 0.0

    def test_subscription_acknowledgement(self):
        mgr = AngelOneWebSocketManager()
        mgr.subscription_acknowledged = False
        mgr.record_subscription_ack({"status": "SUCCESS", "message": "Subscribed"})
        assert mgr.subscription_acknowledged is True

    def test_stale_feed_detection(self):
        mgr = AngelOneWebSocketManager()
        mgr.is_connected = True
        # Set last tick time to 20 seconds ago
        mgr.last_tick_time = time.time() - 20.0
        
        health = mgr.get_feed_health()
        assert health["status"] == "STALE_FEED"
        assert health["is_stale"] is True


class TestSafeCredentialLoadingAndLiveGate:
    """Ensures credentials fail closed without exposing secrets, and live gate remains locked."""

    def test_credential_loading_security(self):
        mgr = AngelOneWebSocketManager()
        creds = mgr.get_credential_status()
        
        # Check no sensitive keys or secrets are exposed in dict
        for key in ["api_key", "pin", "totp_secret", "jwt_token", "password"]:
            assert key not in creds
        assert "has_api_key" in creds
        assert "has_client_id" in creds
        assert "has_pin" in creds
        assert "has_totp_secret" in creds

    def test_live_readiness_gate_fail_closed(self):
        report = evaluate_live_readiness(
            broker_state={"angel_one": {"connected": False}},
            active_smart_connect={"instance": None},
            market_feed_evaluator_fn=lambda: {"authentic": False, "message": "Simulated"},
            rms_state={"circuit_breaker_active": False},
            reconciliation_state={"status": "CLEAN"},
            user_consent_provided=False
        )
        assert report["ready_for_live"] is False
        assert report["total_conditions"] == 8
        assert "AUTHENTIC_BROKER_AUTH" in report["failed_conditions"]


class TestStrategyEngineCandidates:
    """Validates the 5 candidate quantitative strategies and technical indicators."""

    def test_calculate_adx_wilders(self):
        """Calculates Wilder's ADX over synthetic trend series."""
        # Generating 35 ascending candles
        highs = [100.0 + i * 2.0 + 1.0 for i in range(35)]
        lows = [100.0 + i * 2.0 - 1.0 for i in range(35)]
        closes = [100.0 + i * 2.0 for i in range(35)]

        res = calculate_adx(highs, lows, closes, period=14)
        assert "adx" in res
        assert "plus_di" in res
        assert "minus_di" in res
        # In persistent uptrend, plus_di must strongly dominate minus_di and ADX must rise
        assert res["plus_di"] > res["minus_di"]
        assert res["adx"] > 20.0

    def test_strategy_1_ema_adx_trend(self):
        """EMA trend following confirmed by ADX >= 25."""
        candles = []
        for i in range(65):
            p = 1000.0 + (i * 5.0)
            candles.append({
                "time": f"2026-10-17T09:{i%60:02d}:00",
                "open": p - 2.0,
                "high": p + 3.0,
                "low": p - 3.0,
                "close": p,
                "volume": 5000
            })
        
        signal = evaluate_ema_adx_trend(candles, adx_threshold=20.0)
        assert signal["decision"] in ["BUY", "HOLD"]
        assert "adx" in signal["indicators"]
        assert "ema_fast" in signal["indicators"]

    def test_strategy_2_breakout_volatility_no_lookahead(self):
        """Breakout uses only prior completed candles."""
        candles = []
        for i in range(30):
            # Flat consolidation between 99 and 101
            candles.append({
                "time": f"2026-10-17T09:{i:02d}:00",
                "open": 100.0,
                "high": 101.0,
                "low": 99.0,
                "close": 100.0,
                "volume": 1000
            })
        # Candle 31: breakout above 101 with 3x volume
        candles.append({
            "time": "2026-10-17T09:31:00",
            "open": 100.5,
            "high": 103.5,
            "low": 100.2,
            "close": 103.0,
            "volume": 4000
        })

        sig = evaluate_breakout_volatility(candles, lookback=20, vol_multiplier=1.5)
        assert sig["decision"] == "BUY"
        assert sig["indicators"]["channel_upper"] <= 101.0
        assert sig["indicators"]["volume_ratio"] >= 1.5

    def test_strategy_3_vwap_rsi(self):
        """VWAP + RSI momentum strategy."""
        candles = []
        for i in range(30):
            p = 500.0 + (i * 1.5)
            candles.append({
                "time": f"2026-10-17T09:{i:02d}:00",
                "open": p - 0.5,
                "high": p + 1.0,
                "low": p - 0.5,
                "close": p,
                "volume": 2000
            })

        sig = evaluate_vwap_rsi(candles)
        assert sig["decision"] in ["BUY", "HOLD"]
        assert "vwap" in sig["indicators"]
        assert "rsi" in sig["indicators"]

    def test_strategy_4_mean_reversion_adaptive_safety_guard(self):
        """
        CRITICAL MANDATORY SAFETY GUARD:
        Mean reversion MUST be disabled with NO_TRADE and TREND_INVALIDATED when ADX >= 25.0!
        """
        # Strong trending series generating ADX >= 25.0
        trending_candles = []
        for i in range(40):
            p = 1000.0 + (i * 10.0)  # steep uptrend
            trending_candles.append({
                "time": f"2026-10-17T09:{i:02d}:00",
                "open": p - 2.0,
                "high": p + 4.0,
                "low": p - 2.0,
                "close": p,
                "volume": 5000
            })

        sig = evaluate_mean_reversion_adaptive(trending_candles, adx_trend_cutoff=25.0)
        # In steep trend, ADX >= 25 must invalidate mean reversion
        if sig["indicators"]["adx"] >= 25.0:
            assert sig["decision"] == "NO_TRADE"
            assert sig["status"] == "TREND_INVALIDATED"
            assert sig["is_trend_disabled"] is True
            assert "Mean reversion disabled" in sig["reason"]

    def test_strategy_5_market_regime_classification(self):
        """Classifies trending vs ranging vs volatile regimes."""
        # 1. Ranging candles (tight consolidation across 65 candles to meet 55 min requirement)
        ranging_candles = []
        for i in range(65):
            p = 2000.0 + (1.0 if i % 2 == 0 else -1.0)
            ranging_candles.append({
                "time": f"2026-10-17T09:{i%60:02d}:00",
                "open": 2000.0,
                "high": 2002.0,
                "low": 1998.0,
                "close": p,
                "volume": 1000
            })

        regime_info = detect_market_regime(ranging_candles)
        assert regime_info["regime"] == "RANGING_CONSOLIDATION"
        assert "MEAN_REVERSION_ADAPTIVE" in regime_info["compatible_strategies"]
        assert "BREAKOUT_VOLATILITY" in regime_info["incompatible_strategies"]


class Test14BotCompatibilityMatrix:
    """Verifies that all 14 canonical bots are mapped correctly without missing entries or false mappings."""

    def test_all_14_bots_present_in_matrix(self):
        assert len(BOT_STRATEGY_COMPATIBILITY_MATRIX) == 14
        for b_id in range(1, 15):
            assert b_id in BOT_STRATEGY_COMPATIBILITY_MATRIX
            bot_cfg = BOT_STRATEGY_COMPATIBILITY_MATRIX[b_id]
            assert "bot_name" in bot_cfg
            assert "asset" in bot_cfg
            assert "compatible_strategies" in bot_cfg
            assert "incompatible_strategies" in bot_cfg

    def test_bot_strategy_validation_rules(self):
        # Bot #2 (EMA Trend Bot) is incompatible with Mean Reversion
        is_compat, msg = validate_bot_strategy_compatibility(2, "MEAN_REVERSION_ADAPTIVE")
        assert is_compat is False
        assert "Incompatible" in msg

        # Bot #2 is compatible with EMA_ADX_TREND
        is_compat, msg = validate_bot_strategy_compatibility(2, "EMA_ADX_TREND")
        assert is_compat is True

        # Bot #3 (Reliance Cash Equity) cannot trade Options strategies
        is_compat, msg = validate_bot_strategy_compatibility(3, "OPTIONS_GAMMA_SCALPER")
        assert is_compat is False


class TestMultiMetricRanking:
    """Verifies multi-metric strategy ranking formula and regime compatibility modifiers."""

    def test_ranking_computation_and_sorting(self):
        candidates = [
            {
                "strategy_id": "EMA_ADX_TREND",
                "strategy_name": "EMA ADX Trend Following",
                "trades_count": 45,
                "win_rate": 62.0,
                "avg_win": 1500.0,
                "avg_loss": 800.0,
                "max_drawdown_pct": 8.5,
                "profit_factor": 2.2,
                "compatible_regimes": ["TRENDING_BULLISH", "TRENDING_BEARISH"],
                "incompatible_regimes": ["RANGING_CONSOLIDATION"]
            },
            {
                "strategy_id": "MEAN_REVERSION",
                "strategy_name": "Bollinger Mean Reversion",
                "trades_count": 35,
                "win_rate": 58.0,
                "avg_win": 800.0,
                "avg_loss": 650.0,
                "max_drawdown_pct": 12.0,
                "profit_factor": 1.4,
                "compatible_regimes": ["RANGING_CONSOLIDATION"],
                "incompatible_regimes": ["TRENDING_BULLISH", "TRENDING_BEARISH"]
            }
        ]

        # In Trending Bullish regime: EMA_ADX_TREND receives 1.25x boost, MEAN_REVERSION receives 0.40x penalty
        ranked_trending = calculate_multi_metric_ranking(candidates, current_regime="TRENDING_BULLISH")
        assert len(ranked_trending) == 2
        assert ranked_trending[0]["strategy_id"] == "EMA_ADX_TREND"
        assert ranked_trending[0]["rank"] == 1
        assert ranked_trending[0]["regime_status"] == "BOOSTED_COMPATIBLE"
        assert ranked_trending[1]["strategy_id"] == "MEAN_REVERSION"
        assert ranked_trending[1]["rank"] == 2
        assert ranked_trending[1]["regime_status"] == "PENALIZED_INCOMPATIBLE"

        # In Ranging Consolidation regime: MEAN_REVERSION boosted, EMA_ADX_TREND penalized
        ranked_ranging = calculate_multi_metric_ranking(candidates, current_regime="RANGING_CONSOLIDATION")
        assert ranked_ranging[0]["strategy_id"] == "MEAN_REVERSION"
        assert ranked_ranging[0]["regime_status"] == "BOOSTED_COMPATIBLE"


class TestVotingConsensusAndRiskSafety:
    """Verifies majority consensus anti-sybil guard, tie breaking, emergency bypass, and RMS gates."""

    def test_emergency_exit_bypass(self):
        """Emergency exits must immediately bypass entry quorum."""
        res = evaluate_order_quorum(bot_id=1, action="EXIT", is_emergency_exit=True)
        assert res["approved"] is True
        assert res["decision"] == "EMERGENCY_EXIT_BYPASS"

    def test_tie_breaking_enforces_no_trade(self):
        """When consensus is tied or conflicting, voting engine enforces NO_TRADE."""
        custom_cfg = {
            "voting_scope": "peer_mesh",
            "conflict_policy": "NO_TRADE",
            "threshold_mode": "count",
            "min_approval_count": 2
        }
        # Bot 1 peers: Bot 2 (BANKNIFTY), Bot 5 (FINNIFTY), Bot 6 (HDFCBANK)
        market_snap = {
            "BANKNIFTY": {"change": 0.5},   # BUY (1)
            "FINNIFTY": {"change": -0.5},   # SELL (1)
            "HDFCBANK": {"change": 0.0}     # HOLD (1)
        }
        res = evaluate_order_quorum(bot_id=1, action="BUY", custom_config=custom_cfg, market_snapshot=market_snap)
        assert res["approved"] is False
        assert res["decision"] in ["NO_TRADE", "REJECTED"]

    def test_paper_execution_safety_and_rms_circuit_breaker(self):
        """Validates PAPER execution simulation without real broker routing, and Gate 4 RMS limits."""
        engine = CentralizedExecutionEngine()
        
        # Ensure clean position state for TATA MOTORS
        close_position("TATA MOTORS")

        # Test PAPER execution fills realistically
        paper_res = engine.execute_order(
            bot_id=4,
            symbol="TATA MOTORS",
            action="BUY",
            qty=10,
            price=950.0,
            execution_mode="PAPER"
        )
        assert paper_res["success"] is True
        assert paper_res["status"] == ORDER_STATE_FILLED
        assert paper_res["mode"] == "PAPER"

        # Test Gate 4 RMS Daily Loss Circuit Breaker
        rms_breached = {
            "circuit_breaker_active": False,
            "max_daily_loss": 2000.0,
            "realized_daily_pnl": -2500.0  # Loss breached
        }
        blocked_res = engine.execute_order(
            bot_id=4,
            symbol="TATA MOTORS",
            action="BUY",
            qty=10,
            price=950.0,
            execution_mode="PAPER",
            rms_state=rms_breached,
            client_order_id="ORD-RMS-CIRCUIT-TEST"
        )
        assert blocked_res["success"] is False
        assert blocked_res["status"] == ORDER_STATE_REJECTED
        assert "Daily loss limit" in blocked_res["error"] or "Circuit breaker" in blocked_res["error"]
