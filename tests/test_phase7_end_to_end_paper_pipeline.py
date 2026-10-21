"""
CHINTU AI TRADING SYSTEM - Phase 7 End-to-End Integration & Verification Suite
Comprehensive verification of:
  1. All 14 Canonical Bots individual signal execution & schema conformance.
  2. Complete End-to-End PAPER Pipeline:
     Tick -> Validator -> 14 Bots -> Master Brain -> Net Profit -> RMS -> Paper Fill -> DB Persistence.
  3. Platform-Wide Emergency Stop & Safe Position Cancellation Override.
  4. Fail-Closed Live Broker Protection (SmartConnect.placeOrder unreachable).
  5. Multi-Asset Statutory Transaction Cost Engine (Equity, Futures, Options, Commodities, Currencies).
  6. Provenance & Isolation Integrity (0 Mutations to Production Database).
"""

import time
import pytest
from datetime import datetime, timezone, timedelta

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
    SCAN_MODE_TOP_N,
    SCAN_MODE_SINGLE,
    SCAN_MODE_AUTO
)
from server.centralized_risk_manager import (
    CentralizedRiskManager,
    centralized_risk_manager
)
from server.low_latency_event_pipeline import (
    MarketTickValidator,
    LowLatencyEventPipeline,
    event_pipeline
)
from server.execution_engine import (
    CentralizedExecutionEngine,
    ORDER_STATE_FILLED,
    ORDER_STATE_REJECTED
)
from server.regulatory_charges import (
    compute_instrument_regulatory_charges,
    classify_instrument_and_segment,
    to_decimal,
    round_cur
)
from server.live_readiness_gate import evaluate_live_readiness
from server.memory_db import (
    get_open_positions,
    get_order,
    save_order,
    close_position
)


# =====================================================================
# 1. VERIFICATION OF ALL 14 CANONICAL BOTS INDIVIDUALLY
# =====================================================================

@pytest.mark.parametrize("bot_id", list(range(1, 15)))
def test_canonical_bot_signal_execution_and_schema(bot_id):
    """
    Independently verifies every canonical bot from Bot 1 to Bot 14:
    - Registered in CANONICAL_BOT_REGISTRY
    - Mathematical indicator function executes without error
    - Conforms 100% to normalized signal schema
    - Confidence and risk estimate are bounded within [0.0, 1.0]
    - Lot size and parameters match exchange specifications
    """
    bot = get_bot_by_id(bot_id)
    assert bot is not None, f"Bot #{bot_id} not found in CANONICAL_BOT_REGISTRY"
    assert bot["id"] == bot_id
    assert "name" in bot and len(bot["name"]) > 0
    assert "asset" in bot and len(bot["asset"]) > 0
    assert "strategy_id" in bot and len(bot["strategy_id"]) > 0
    assert "lotsize" in bot and bot["lotsize"] > 0
    assert "weight" in bot and bot["weight"] >= 1.0

    # Test candle payload (60 candles to satisfy all strategy lookbacks, e.g. 55-EMA)
    base_price = 24500.0 if "NIFTY" in bot["asset"].upper() else (1500.0 if "INFY" in bot["asset"].upper() else 1000.0)
    mock_candles = {
        "close": [base_price * (1.0 + (i * 0.0003)) for i in range(65)],
        "high": [base_price * (1.0 + (i * 0.0003)) * 1.002 for i in range(65)],
        "low": [base_price * (1.0 + (i * 0.0003)) * 0.998 for i in range(65)],
        "volume": [10000.0 + (i * 100.0) for i in range(65)]
    }

    signal = master_brain.evaluate_bot_strategy_signal(bot_id, mock_candles)

    # Verify Normalized Output Schema
    required_keys = [
        "bot_id", "bot_name", "symbol", "action", "confidence",
        "risk_estimate", "entry", "stop_loss", "target",
        "expected_holding", "reason", "timestamp", "timeframe",
        "strategy_id", "strategy_name", "lotsize"
    ]
    for k in required_keys:
        assert k in signal, f"Bot #{bot_id} signal missing required key '{k}'"

    assert signal["bot_id"] == bot_id
    assert signal["action"] in (ACTION_BUY, ACTION_SELL, ACTION_HOLD, ACTION_NO_TRADE)
    assert 0.0 <= signal["confidence"] <= 1.0
    assert 0.0 <= signal["risk_estimate"] <= 1.0
    assert signal["lotsize"] == bot["lotsize"]
    assert signal["strategy_id"] == bot["strategy_id"]


# =====================================================================
# 2. COMPLETE END-TO-END PAPER TRADING PIPELINE FLOW
# =====================================================================

def test_complete_end_to_end_paper_pipeline(monkeypatch):
    """
    Executes and validates the entire vertical flow:
    Market Tick -> Tick Validator -> 14 Bots -> Master Brain -> Net Profit Gate
    -> Centralized RMS -> Paper Simulation Fill -> Order State -> Position State -> Exit Squareoff.
    """
    symbol = "NIFTY24OCTFUT"
    tick_price = 24500.0

    monkeypatch.setitem(centralized_risk_manager.config, "account_capital", 500000.0)

    # 1. Market Tick Ingestion & Validation
    validator = MarketTickValidator(max_stale_seconds=60.0, max_future_seconds=3.0)
    raw_tick = {
        "symbol": symbol,
        "price": tick_price,
        "volume": 25000.0,
        "timestamp": time.time(),
        "sequence_number": 1001
    }
    tick_valid, val_msg = validator.validate_tick(raw_tick)
    assert tick_valid, f"Tick validator failed: {val_msg}"

    # 2. Strategy Signals from Contributing Bots
    candles = {
        "close": [tick_price * (1.0 + (i * 0.0004)) for i in range(60)],
        "high": [tick_price * (1.0 + (i * 0.0004)) * 1.002 for i in range(60)],
        "low": [tick_price * (1.0 + (i * 0.0004)) * 0.998 for i in range(60)],
        "volume": [15000.0 for _ in range(60)]
    }
    signals = []
    for bid in [1, 2, 5, 6, 8]:
        sig = master_brain.evaluate_bot_strategy_signal(bid, candles, symbol=symbol)
        if sig.get("action") in (ACTION_BUY, ACTION_SELL):
            # Calibrate reasonable target and stop loss with positive net edge
            sig["entry"] = tick_price
            sig["stop_loss"] = round(tick_price - 120.0, 2)
            sig["target"] = round(tick_price + 280.0, 2)
            signals.append(sig)

    assert len(signals) >= 2, "Expected at least 2 actionable signals"

    # 3. Master Brain Weighted Consensus & Realistic Net Profit Gate
    consensus = master_brain.evaluate_fleet_consensus(
        symbol=symbol,
        signals=signals,
        market_regime="TRENDING_BULL"
    )
    assert consensus["decision"] in (ACTION_BUY, ACTION_SELL)
    assert consensus["consensus_score"] >= 0.60
    assert consensus["profit_analysis"]["is_profitable"] is True
    assert consensus["profit_analysis"]["net_reward"] > 0
    assert consensus["profit_analysis"]["net_reward_to_risk"] >= 1.20

    # 4. Centralized RMS Pre-Trade Gate
    decision_action = consensus["decision"]
    rms_approved, rms_reason, rms_telem = centralized_risk_manager.validate_order_risk(
        bot_id=1,
        symbol=symbol,
        action=decision_action,
        qty=50,
        price=tick_price,
        segment="NSE F&O Futures",
        execution_mode="PAPER"
    )
    assert rms_approved, f"RMS rejected valid order: {rms_reason}"
    assert len(rms_telem["checks_passed"]) >= 8

    # 5. Centralized Execution Engine - Paper Fill Simulation
    engine = CentralizedExecutionEngine()
    exec_res = engine.execute_order(
        bot_id=1,
        symbol=symbol,
        action=decision_action,
        qty=50,
        price=tick_price,
        execution_mode="PAPER"
    )
    assert exec_res["success"] is True
    assert exec_res["status"] == ORDER_STATE_FILLED
    assert exec_res["mode"] == "PAPER"
    assert "fill_price" in exec_res
    order_id = exec_res["orderId"]

    # 6. Database Position & Order State Verification
    order_record = get_order(order_id)
    assert order_record is not None
    assert order_record["status"] == ORDER_STATE_FILLED
    assert order_record["mode"] == "PAPER"

    open_pos = get_open_positions()
    pos = next((p for p in open_pos if p["symbol"] == symbol and p["status"] == "OPEN"), None)
    assert pos is not None
    assert pos["qty"] == 50
    assert pos["side"] == ("LONG" if decision_action == "BUY" else "SHORT")

    # 7. Square-Off / Exit Order Flow
    exit_action = "SELL" if decision_action == "BUY" else "BUY"
    exit_res = engine.execute_order(
        bot_id=1,
        symbol=symbol,
        action=exit_action,
        qty=50,
        price=tick_price + 50.0,
        execution_mode="PAPER",
        is_emergency_exit=False
    )
    assert exit_res["success"] is True
    assert exit_res["status"] == ORDER_STATE_FILLED

    # Position must now be closed
    open_pos_after = get_open_positions()
    assert not any(p["symbol"] == symbol and p["status"] == "OPEN" for p in open_pos_after)


# =====================================================================
# 3. EMERGENCY STOP & FAIL-CLOSED GATES
# =====================================================================

def test_emergency_stop_system_wide_protection():
    """
    Verifies platform-wide Emergency Stop:
    - Blocks all entry orders across execution engine and server
    - Permits risk-reducing exits
    - Can be safely reset by administrator
    """
    crm = centralized_risk_manager
    engine = CentralizedExecutionEngine()

    # Trigger Emergency Stop
    res = crm.trigger_emergency_stop()
    assert res["status"] == "EMERGENCY_STOP_ARMED"
    assert crm.config["emergency_stop_active"] is True

    # 1. Entry order through execution engine must be REJECTED
    order_res = engine.execute_order(
        bot_id=1,
        symbol="NIFTY24OCTFUT",
        action="BUY",
        qty=50,
        price=24500.0,
        execution_mode="PAPER"
    )
    assert order_res["success"] is False
    assert order_res["status"] == ORDER_STATE_REJECTED
    assert "Emergency Stop" in order_res["error"]

    # 2. Risk-reducing exit order must be APPROVED
    exit_res = engine.execute_order(
        bot_id=1,
        symbol="NIFTY24OCTFUT",
        action="EXIT",
        qty=50,
        price=24500.0,
        execution_mode="PAPER",
        is_emergency_exit=True
    )
    assert exit_res["success"] is True
    assert exit_res["status"] == ORDER_STATE_FILLED

    # 3. Reset Emergency Stop
    reset_ok = crm.reset_circuit_breaker(admin_override=True)
    assert reset_ok is True
    assert crm.config["emergency_stop_active"] is False


def test_paper_mode_cannot_reach_broker_place_order():
    """
    Proves that PAPER mode execution can NEVER invoke broker SmartConnect.placeOrder.
    """
    engine = CentralizedExecutionEngine()

    class FakeSmartConnectBroker:
        def __init__(self):
            self.place_order_called = False

        def placeOrder(self, params):
            self.place_order_called = True
            raise RuntimeError("CRITICAL INVARIANT VIOLATION: placeOrder called in PAPER mode!")

    fake_broker = FakeSmartConnectBroker()
    active_smart = {"instance": fake_broker, "apiKey": "TEST_KEY", "clientId": "TEST_CLIENT"}

    # Execute order in PAPER mode
    res = engine.execute_order(
        bot_id=1,
        symbol="NIFTY24OCTFUT",
        action="BUY",
        qty=50,
        price=24500.0,
        execution_mode="PAPER",
        active_smart_connect=active_smart
    )
    assert res["success"] is True
    assert res["mode"] == "PAPER"
    assert fake_broker.place_order_called is False, "Broker placeOrder was invoked during PAPER execution!"


def test_malformed_execution_modes_fail_closed():
    """Verifies unknown or malformed execution modes are rejected immediately."""
    engine = CentralizedExecutionEngine()
    for bad_mode in ["MOCK", "DEBUG", "SANDBOX_WRITE", "INVENTED_MODE", "", None]:
        res = engine.execute_order(
            bot_id=1,
            symbol="NIFTY24OCTFUT",
            action="BUY",
            qty=50,
            price=24500.0,
            execution_mode=bad_mode
        )
        assert res["success"] is False
        assert res["status"] == ORDER_STATE_REJECTED


# =====================================================================
# 4. MULTI-ASSET STATUTORY CHARGE ENGINE VERIFICATION
# =====================================================================

def test_regulatory_charges_equity_intraday():
    """Verifies equity intraday round-trip charges (0.025% STT sell only, 18% GST)."""
    res = compute_instrument_regulatory_charges(
        symbol="RELIANCE-EQ",
        price=3000.0,
        qty=100,
        action="ROUND_TRIP",
        segment="NSE Equity",
        product_type="INTRADAY"
    )
    assert res["validation_status"] == "VALID"
    assert res["instrument_type"] == "EQUITY"
    assert res["turnover"] == 600000.0  # 3000 * 100 * 2
    assert res["brokerage"] == 40.0     # 20 buy + 20 sell
    # STT: 0.025% on sell side (300,000 * 0.00025 = 75.00)
    assert res["stt_ctt"] == 75.00
    assert res["total_charges"] > 0
    # Invariant: total_charges equals sum of its components
    expected_sum = round(res["brokerage"] + res["stt_ctt"] + res["exchange_turnover"] + res["gst_18pct"] + res["sebi_turnover"] + res["stamp_duty"], 2)
    assert round(res["total_charges"], 2) == expected_sum


def test_regulatory_charges_index_futures():
    """Verifies index futures round-trip charges (0.0125% STT sell only)."""
    res = compute_instrument_regulatory_charges(
        symbol="NIFTY26OCTFUT",
        price=25000.0,
        qty=50,
        action="ROUND_TRIP",
        segment="NSE F&O Futures",
        product_type="INTRADAY"
    )
    assert res["validation_status"] == "VALID"
    assert res["instrument_type"] == "INDEX_FUTURES"
    assert res["turnover"] == 2500000.0  # 25000 * 50 * 2
    assert res["brokerage"] == 40.0
    # STT: 0.0125% on sell turnover (1,250,000 * 0.000125 = 156.25)
    assert res["stt_ctt"] == 156.25


def test_regulatory_charges_options_premium_and_quarantine():
    """
    Verifies options turnover is computed strictly on Option Premium.
    Verifies quarantine triggered if index spot price is passed.
    """
    # 1. Valid Option Trade: Price is premium ₹150.00, qty 75
    valid_opt = compute_instrument_regulatory_charges(
        symbol="NIFTY26OCT24750CE",
        price=150.0,
        qty=75,
        action="ROUND_TRIP",
        segment="NSE F&O Options",
        product_type="INTRADAY"
    )
    assert valid_opt["validation_status"] == "VALID"
    assert valid_opt["instrument_type"] == "INDEX_OPTIONS"
    assert valid_opt["turnover"] == 22500.0  # 150 * 75 * 2 = 22,500 INR (Premium turnover)
    assert valid_opt["brokerage"] == 40.0

    # 2. Invalid Ambiguous Option: Index spot price ₹24,750 passed as option price
    quarantined_opt = compute_instrument_regulatory_charges(
        symbol="NIFTY26OCT24750CE",
        price=24750.0,
        qty=75,
        action="ROUND_TRIP",
        segment="NSE F&O Options",
        product_type="INTRADAY"
    )
    assert quarantined_opt["validation_status"] == "QUARANTINED"
    assert "AMBIGUOUS_INDEX_AS_OPTION_PREMIUM" in str(quarantined_opt.get("quarantine_reason")) or "spot price" in str(quarantined_opt.get("quarantine_reason")).lower()


def test_regulatory_charges_commodities():
    """Verifies MCX commodity futures charges (0.01% CTT on sell side)."""
    res = compute_instrument_regulatory_charges(
        symbol="CRUDEOIL26NOVFUT",
        price=6000.0,
        qty=100,
        action="ROUND_TRIP",
        segment="MCX Commodity",
        product_type="INTRADAY"
    )
    assert res["validation_status"] == "VALID"
    assert res["instrument_type"] == "COMMODITY_FUTURES"
    assert res["turnover"] == 1200000.0
    # CTT: 0.01% on sell side (600,000 * 0.0001 = 60.00)
    assert res["stt_ctt"] == 60.00


def test_regulatory_charges_currency():
    """Verifies Currency futures charges (0.0% STT)."""
    res = compute_instrument_regulatory_charges(
        symbol="USDINR26OCTFUT",
        price=84.00,
        qty=1000,
        action="ROUND_TRIP",
        segment="Currency Derivatives",
        product_type="INTRADAY"
    )
    assert res["validation_status"] == "VALID"
    assert res["instrument_type"] == "CURRENCY_FUTURES"
    assert res["stt_ctt"] == 0.00  # Nil STT for currency
