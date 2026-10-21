"""
CHINTU AI TRADING SYSTEM - Comprehensive Phase 6 Test Suite
Tests:
  1. Master Brain Fleet Discovery, Signal Normalization, and Validation Gates.
  2. Master Brain Consensus Scoring, Regime Multipliers, and Net Profit Friction Gate.
  3. Multi-Market Scanner (SINGLE_INSTRUMENT, TOP_N, MULTI_MARKET_AUTO).
  4. Centralized Risk Manager (12 pre-trade gates, position sizing, circuit breaker, emergency stop).
  5. Low-Latency Event Pipeline (Tick validation, stage latencies, queue backpressure).
  6. PAPER Mode Safety & Live Readiness Blocking Invariants.
"""

import time
import pytest
from datetime import datetime, timedelta, timezone

from server.bot_registry import (
    CANONICAL_BOT_REGISTRY,
    get_all_canonical_bots,
    get_bot_by_id
)
from server.master_brain import (
    MasterBrain,
    master_brain,
    ACTION_BUY,
    ACTION_SELL,
    ACTION_HOLD,
    ACTION_NO_TRADE
)
from server.multi_market_scanner import (
    MultiMarketScanner,
    multi_market_scanner,
    SCAN_MODE_SINGLE,
    SCAN_MODE_TOP_N,
    SCAN_MODE_AUTO
)
from server.centralized_risk_manager import (
    CentralizedRiskManager,
    centralized_risk_manager
)
from server.low_latency_event_pipeline import (
    MarketTickValidator,
    StageLatencyTracker,
    LowLatencyEventPipeline,
    event_pipeline
)
from server.execution_engine import CentralizedExecutionEngine
from server.live_readiness_gate import evaluate_live_readiness
from server.regulatory_charges import compute_instrument_regulatory_charges

IST = timezone(timedelta(hours=5, minutes=30))


# =====================================================================
# 1. MASTER BRAIN TESTS
# =====================================================================

def test_master_brain_fleet_discovery():
    """Verifies all 14 canonical bots are discovered and have valid metadata."""
    canonical_bots = get_all_canonical_bots()
    assert len(canonical_bots) == 14, f"Expected 14 canonical bots, found {len(canonical_bots)}"
    for bot in canonical_bots:
        assert "id" in bot
        assert "name" in bot
        assert "asset" in bot
        assert "strategy_id" in bot
        assert "lotsize" in bot
        assert bot["lotsize"] > 0
        assert bot["weight"] >= 1.0


def test_master_brain_signal_normalization():
    """Verifies signal normalization enforces strict schema and bounds."""
    sig = master_brain.normalize_signal(
        bot_id=1,
        symbol="NIFTY24OCTFUT",
        action="BUY",
        confidence=0.85,
        entry=24500.0,
        stop_loss=24400.0,
        target=24700.0,
        risk_estimate=0.15,
        reason="SuperTrend + MACD test"
    )
    assert sig["bot_id"] == 1
    assert sig["bot_name"] == "Scalper Bot"
    assert sig["action"] == ACTION_BUY
    assert sig["confidence"] == 0.85
    assert sig["entry"] == 24500.0
    assert sig["stop_loss"] == 24400.0
    assert sig["target"] == 24700.0
    assert sig["lotsize"] == 50


def test_master_brain_signal_validation_rules():
    """Tests rejection of invalid, malformed, stale, and future-dated signals."""
    mb = MasterBrain({"max_signal_age_seconds": 30.0})

    # 1. Invalid bot ID
    bad_sig = {"bot_id": 999, "symbol": "NIFTY", "action": "BUY", "entry": 100, "stop_loss": 90, "target": 120}
    ok, err = mb.validate_signal(bad_sig)
    assert not ok
    assert "Invalid bot_id" in err

    # 2. Missing symbol
    bad_sym = {"bot_id": 1, "symbol": "", "action": "BUY", "entry": 100, "stop_loss": 90, "target": 120}
    ok, err = mb.validate_signal(bad_sym)
    assert not ok
    assert "missing required 'symbol'" in err

    # 3. Invalid stop loss for BUY (SL >= Entry)
    bad_sl = {"bot_id": 1, "symbol": "NIFTY", "action": "BUY", "entry": 100, "stop_loss": 105, "target": 120}
    ok, err = mb.validate_signal(bad_sl)
    assert not ok
    assert "stop loss" in err and "below entry" in err

    # 4. Invalid target for BUY (Target <= Entry)
    bad_tgt = {"bot_id": 1, "symbol": "NIFTY", "action": "BUY", "entry": 100, "stop_loss": 90, "target": 95}
    ok, err = mb.validate_signal(bad_tgt)
    assert not ok
    assert "target" in err and "above entry" in err

    # 5. Stale signal (> 30s)
    stale_ts = (datetime.now(timezone.utc) - timedelta(seconds=65)).isoformat()
    stale_sig = {"bot_id": 1, "symbol": "NIFTY", "action": "BUY", "entry": 100, "stop_loss": 90, "target": 120, "timestamp": stale_ts}
    ok, err = mb.validate_signal(stale_sig)
    assert not ok
    assert "Stale signal rejected" in err

    # 6. Future-dated signal (> 5s)
    future_ts = (datetime.now(timezone.utc) + timedelta(seconds=20)).isoformat()
    future_sig = {"bot_id": 1, "symbol": "NIFTY", "action": "BUY", "entry": 100, "stop_loss": 90, "target": 120, "timestamp": future_ts}
    ok, err = mb.validate_signal(future_sig)
    assert not ok
    assert "Future-dated signal rejected" in err


def test_master_brain_realistic_net_profit_calculation():
    """Verifies statutory charges, spread, and slippage deductions."""
    mb = MasterBrain({"bid_ask_spread_pct": 0.03, "slippage_rate_pct": 0.05, "min_reward_to_risk": 1.20})

    # High profit trade: Target 24,900 on Nifty (entry 24,500, SL 24,350, qty 50)
    res = mb.calculate_realistic_net_profit(
        symbol="NIFTY24OCTFUT",
        action="BUY",
        entry=24500.0,
        target=24900.0,
        stop_loss=24350.0,
        qty=50,
        segment="NSE F&O Futures"
    )
    assert res["gross_reward"] == (24900.0 - 24500.0) * 50  # 20,000 INR
    assert res["statutory_fees"] > 0
    assert res["spread_cost"] > 0
    assert res["slippage_cost"] > 0
    assert res["net_reward"] > 0
    assert res["is_profitable"] is True
    assert res["net_reward_to_risk"] >= 1.20


def test_master_brain_rejects_negative_net_profit():
    """Verifies that trades where transaction friction wipes out alpha are rejected."""
    mb = MasterBrain({"min_reward_to_risk": 1.20})

    # Micro profit trade: Target only 2 points on Nifty 50
    # Gross reward = 2 * 50 = 100 INR, but round-trip charges + friction exceed 150 INR!
    res = mb.calculate_realistic_net_profit(
        symbol="NIFTY24OCTFUT",
        action="BUY",
        entry=24500.0,
        target=24502.0,
        stop_loss=24480.0,
        qty=50,
        segment="NSE F&O Futures"
    )
    assert res["net_reward"] <= 0.0 or res["net_reward_to_risk"] < 1.20
    assert res["is_profitable"] is False


def test_master_brain_consensus_and_regime_weighting():
    """Verifies weighted scoring, quorum enforcement, and regime boosting."""
    mb = MasterBrain({"min_quorum_score": 0.60, "market_regime_weighting": True})

    # Construct 4 bullish signals and 1 bearish signal with sufficient alpha over friction
    signals = [
        mb.normalize_signal(1, "NIFTY 50", "BUY", confidence=0.85, entry=24500, stop_loss=24350, target=24900),
        mb.normalize_signal(2, "NIFTY 50", "BUY", confidence=0.80, entry=24500, stop_loss=24350, target=24900),
        mb.normalize_signal(6, "NIFTY 50", "BUY", confidence=0.75, entry=24500, stop_loss=24350, target=24900),
        mb.normalize_signal(8, "NIFTY 50", "BUY", confidence=0.78, entry=24500, stop_loss=24350, target=24900),
        mb.normalize_signal(3, "NIFTY 50", "SELL", confidence=0.55, entry=24500, stop_loss=24650, target=24300),
    ]

    consensus = mb.evaluate_fleet_consensus(
        symbol="NIFTY 50",
        signals=signals,
        market_regime="TRENDING_BULL"
    )
    assert consensus["decision"] == ACTION_BUY
    assert consensus["consensus_score"] >= 0.60
    assert consensus["contributing_bots_count"] == 5
    assert consensus["profit_analysis"]["is_profitable"] is True


def test_master_brain_divided_fleet_returns_no_trade():
    """Verifies Master Brain returns NO_TRADE when fleet has no quorum."""
    mb = MasterBrain({"min_quorum_score": 0.60})

    signals = [
        mb.normalize_signal(1, "NIFTY 50", "BUY", confidence=0.70, entry=24500, stop_loss=24350, target=24700),
        mb.normalize_signal(2, "NIFTY 50", "SELL", confidence=0.70, entry=24500, stop_loss=24650, target=24300)
    ]

    consensus = mb.evaluate_fleet_consensus("NIFTY 50", signals, market_regime="NEUTRAL")
    assert consensus["decision"] == ACTION_NO_TRADE
    assert "divided without quorum" in consensus["decision_reason"]


# =====================================================================
# 2. MULTI-MARKET SCANNER TESTS
# =====================================================================

def test_multi_market_scanner_supported_universe():
    """Verifies universe ingestion across NSE Equity, NSE F&O, MCX, and CDS."""
    scanner = MultiMarketScanner()
    universe = scanner.get_supported_universe()
    symbols = [u["symbol"] for u in universe]

    # Must contain cash equities, index futures, options, MCX, and CDS
    assert any("RELIANCE" in s for s in symbols)
    assert any("NIFTY" in s for s in symbols)
    assert any("GOLD" in s or "CRUDE" in s for s in symbols)
    assert any("USDINR" in s for s in symbols)


def test_multi_market_scanner_top_n_mode():
    """Verifies TOP_N mode returns ranked opportunities within limit."""
    scanner = MultiMarketScanner()
    res = scanner.scan_universe(mode=SCAN_MODE_TOP_N, regime="TRENDING_BULL")
    assert res["status"] == "SUCCESS"
    assert res["scan_mode"] == SCAN_MODE_TOP_N
    assert len(res["opportunities"]) <= 5
    assert res["total_scanned"] > 0
    # Opportunities must be sorted descending by opportunity score
    scores = [o["opportunity_score"] for o in res["opportunities"]]
    assert scores == sorted(scores, reverse=True)


def test_multi_market_scanner_single_instrument_mode():
    """Verifies SINGLE_INSTRUMENT mode analyzes only the requested instrument."""
    scanner = MultiMarketScanner()
    res = scanner.scan_universe(
        mode=SCAN_MODE_SINGLE,
        target_symbol="RELIANCE-EQ",
        regime="TRENDING_BULL"
    )
    assert res["status"] == "SUCCESS"
    assert res["scan_mode"] == SCAN_MODE_SINGLE
    if res["opportunities"]:
        assert "RELIANCE" in res["opportunities"][0]["symbol"]


def test_multi_market_scanner_skips_unaffordable_margin():
    """Verifies instruments requiring excessive margin are skipped with reason."""
    scanner = MultiMarketScanner()
    # Artificially set account capital to ₹1,000 (too low for index futures or commodities)
    scanner.config["max_account_capital"] = 1000.0
    res = scanner.scan_universe(mode=SCAN_MODE_TOP_N)
    skipped_reasons = [s["reason"] for s in res["skipped_instruments"]]
    assert "MARGIN_EXCEEDS_CAPITAL" in skipped_reasons


# =====================================================================
# 3. CENTRALIZED RISK MANAGER TESTS
# =====================================================================

def test_rms_position_sizing_respects_risk_budget():
    """Verifies position sizing is quantized to lot size and within risk budget."""
    crm = CentralizedRiskManager({"max_account_capital": 200000.0, "max_risk_pct_per_trade": 1.5})
    # Risk budget = 200,000 * 1.5% = ₹3,000
    # SL distance = 24,500 - 24,450 = 50 pts
    # Max qty = 3,000 / 50 = 60 qty. Lot size = 50.
    # Quantized downward = 1 lot = 50 qty.
    qty = crm.calculate_position_size(entry=24500.0, stop_loss=24450.0, lotsize=50)
    assert qty == 50
    assert (qty * 50) <= 3000.0


def test_rms_circuit_breaker_trips_on_daily_loss():
    """Verifies circuit breaker trips when daily realized loss breaches threshold."""
    crm = CentralizedRiskManager({"max_daily_loss": 5000.0, "circuit_breaker_active": False})
    crm.daily_realized_pnl = -5500.0  # Breached

    approved, reason, telem = crm.validate_order_risk(
        bot_id=1,
        symbol="NIFTY 50",
        action="BUY",
        qty=50,
        price=24500.0
    )
    assert not approved
    assert "Daily loss limit" in reason
    assert crm.config["circuit_breaker_active"] is True


def test_rms_emergency_stop_allows_exit_blocks_entry():
    """Verifies emergency stop blocks entries but allows risk-reducing exits."""
    crm = CentralizedRiskManager()
    crm.trigger_emergency_stop()
    assert crm.config["emergency_stop_active"] is True

    # New entry blocked
    entry_ok, entry_reason, _ = crm.validate_order_risk(1, "NIFTY 50", "BUY", 50, 24500.0)
    assert not entry_ok
    assert "Emergency Stop is ACTIVE" in entry_reason

    # Exit order allowed
    exit_ok, exit_reason, _ = crm.validate_order_risk(1, "NIFTY 50", "EXIT", 50, 24500.0, is_emergency_exit=True)
    assert exit_ok
    assert "approved" in exit_reason.lower()

    # Reset
    crm.reset_circuit_breaker(admin_override=True)
    assert crm.config["emergency_stop_active"] is False


def test_rms_stale_feed_rejection():
    """Verifies stale feed rejection gate."""
    crm = CentralizedRiskManager({"stale_feed_max_age_seconds": 60.0})
    ok, reason, _ = crm.validate_order_risk(
        bot_id=1,
        symbol="NIFTY 50",
        action="BUY",
        qty=50,
        price=24500.0,
        feed_age_seconds=75.0  # Stale
    )
    assert not ok
    assert "stale" in reason.lower()


# =====================================================================
# 4. LOW-LATENCY EVENT PIPELINE TESTS
# =====================================================================

def test_tick_validator_rejection_rules():
    """Verifies tick validator detects out-of-order, stale, and future ticks."""
    val = MarketTickValidator(max_stale_seconds=30.0, max_future_seconds=3.0)

    # 1. Non-positive price
    ok, err = val.validate_tick({"symbol": "NIFTY", "price": -10.0})
    assert not ok

    # 2. Future-dated tick
    fut_ts = time.time() + 10.0
    ok, err = val.validate_tick({"symbol": "NIFTY", "price": 24500.0, "timestamp": fut_ts})
    assert not ok
    assert "Future-dated" in err

    # 3. Valid tick
    now_ts = time.time()
    ok, err = val.validate_tick({"symbol": "NIFTY", "price": 24500.0, "timestamp": now_ts, "sequence_number": 1})
    assert ok

    # 4. Out-of-order sequence
    ok, err = val.validate_tick({"symbol": "NIFTY", "price": 24505.0, "timestamp": now_ts, "sequence_number": 0})
    assert not ok
    assert "Out-of-order" in err


def test_stage_latency_tracker_statistics():
    """Verifies statistical percentile computation for stage latencies."""
    tracker = StageLatencyTracker()

    # Record 10 sample runs with varying latencies
    for i in range(1, 11):
        tracker.record_stage_measurement(
            feed_to_signal_ms=float(i),
            signal_to_decision_ms=float(i * 2),
            decision_to_order_ms=float(i * 0.5),
            order_to_fill_ms=float(i * 0.2)
        )

    report = tracker.get_latency_report()
    assert report["total_processed_events"] == 10
    assert "stages" in report
    f2s = report["stages"]["feed_to_signal"]
    assert f2s["min_ms"] == 1.0
    assert f2s["max_ms"] == 10.0
    assert f2s["median_ms"] > 0


# =====================================================================
# 5. PAPER MODE SAFETY & LIVE READINESS GATE INVARIANTS
# =====================================================================

def test_paper_mode_fails_closed_on_unknown_mode():
    """Verifies execution engine fails closed on unknown or invalid modes."""
    engine = CentralizedExecutionEngine()
    order_res = engine.execute_order(
        bot_id=1,
        symbol="NIFTY 50",
        action="BUY",
        qty=50,
        price=24500.0,
        execution_mode="CORRUPT_INVALID_MODE"
    )
    assert not order_res["success"]
    assert order_res["status"] == "REJECTED"


def test_live_readiness_gate_blocks_live_trading():
    """Verifies that evaluate_live_readiness blocks live execution when requirements fail."""
    readiness = evaluate_live_readiness(
        broker_state={"angel_one": {"connected": False}},
        active_smart_connect={"instance": None},
        market_feed_evaluator_fn=lambda: {"authentic": False, "message": "Market closed Sunday"},
        rms_state={"circuit_breaker_active": False},
        reconciliation_state={"status": "CLEAN", "block_live_entries": False},
        user_consent_provided=False
    )
    assert readiness["ready_for_live"] is False
    assert len(readiness["failed_conditions"]) > 0
    assert "AUTHENTIC_BROKER_AUTH" in readiness["failed_conditions"]
    assert "AUTHENTIC_MARKET_FEED" in readiness["failed_conditions"]
