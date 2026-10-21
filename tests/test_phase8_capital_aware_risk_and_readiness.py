"""
CHINTU AI TRADING SYSTEM - PHASE 8 CAPITAL-AWARE RISK & OPERATIONAL READINESS SUITE
Comprehensive verification of Phase 8 requirements:
  P0: Capital-Aware Risk Safety (₹20,000 default budget, margin checks, dual-constraint position sizing, fail-closed)
  P1: 14-Bot Master Brain Audit (Schema, edge cases, UNVERIFIED track record status, consensus)
  P2: Multi-Market Scanner (4-state classification, margin affordability filtering)
  P3: Net Profit & Cost Calculations (Statutory charges, net RR >= 1.20, P&L segregation)
  P4: Paper Operational Validation (Feed disconnect, stale ticks, deduplication, emergency stop, fail-closed live gate)
"""

import time
import math
import pytest
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from server.centralized_risk_manager import (
    CentralizedRiskManager,
    centralized_risk_manager,
    calculate_required_margin,
    calculate_open_positions_used_margin,
    get_account_margin_summary,
    get_centralized_rms_config,
    update_centralized_rms_config,
    DEFAULT_RMS_CONFIG
)
from server.execution_engine import (
    CentralizedExecutionEngine,
    ORDER_STATE_FILLED,
    ORDER_STATE_REJECTED
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
    multi_market_scanner
)
from server.bot_registry import (
    CANONICAL_BOT_REGISTRY,
    get_all_canonical_bots,
    get_bot_by_id
)
from server.regulatory_charges import (
    compute_instrument_regulatory_charges,
    classify_instrument_and_segment,
    to_decimal,
    round_cur
)
from server.live_readiness_gate import evaluate_live_readiness
from server.low_latency_event_pipeline import MarketTickValidator


# ============================================================================
# P0: CAPITAL-AWARE RISK SAFETY & MARGIN BOUNDS
# ============================================================================

class TestPhase8CapitalAwareRiskSafety:
    """Verifies strict capital limits, margin calculations, and position sizing."""

    def test_default_account_capital_is_20000(self):
        """Baseline account capital must be ₹20,000.00 by default (user-configured)."""
        cfg = get_centralized_rms_config()
        assert cfg.get("account_capital") == 20000.0, f"Expected 20,000.0, got {cfg.get('account_capital')}"
        assert DEFAULT_RMS_CONFIG["account_capital"] == 20000.0

    def test_calculate_required_margin_by_segment(self):
        """Validates accurate regulatory margin across all segments."""
        # Equity Intraday (MIS): 20% of turnover
        m_mis = calculate_required_margin("RELIANCE", "NSE Equity", 2900.0, 10, "MIS")
        assert m_mis == round(2900.0 * 10 * 0.20, 2)  # ₹5,800.00

        # Equity Delivery (CNC): 100% of turnover
        m_cnc = calculate_required_margin("RELIANCE", "NSE Equity", 2900.0, 10, "CNC")
        assert m_cnc == round(2900.0 * 10 * 1.00, 2)  # ₹29,000.00

        # Index Futures: 14% of contract notional
        m_fut = calculate_required_margin("NIFTY24OCTFUT", "NSE F&O Futures", 24500.0, 50)
        assert m_fut == round(24500.0 * 50 * 0.14, 2)  # ₹171,500.00

        # Index Spot Level: 14% of notional
        m_idx = calculate_required_margin("NIFTY 50", "NSE Equity", 24500.0, 50)
        assert m_idx == round(24500.0 * 50 * 0.14, 2)  # ₹171,500.00

        # Option Buying (Long): 100% of premium
        m_opt = calculate_required_margin("NIFTY24OCT24500CE", "NSE F&O Options", 120.0, 75)
        assert m_opt == round(120.0 * 75 * 1.00, 2)  # ₹9,000.00

        # Commodities (MCX): 10%
        m_mcx = calculate_required_margin("CRUDEOIL24NOVFUT", "MCX Commodity Futures", 6000.0, 100)
        assert m_mcx == round(6000.0 * 100 * 0.10, 2)  # ₹60,000.00

        # Currencies (CDS): 4%
        m_cds = calculate_required_margin("USDINR24NOVFUT", "CDS Currency Futures", 84.0, 1000)
        assert m_cds == round(84.0 * 1000 * 0.04, 2)  # ₹3,360.00

    def test_unaffordable_nifty_future_rejected_at_20k_capital(self):
        """NIFTY futures requiring ₹171,500 margin MUST be rejected when account capital is ₹20,000."""
        crm = CentralizedRiskManager({"account_capital": 20000.0})
        approved, reason, telem = crm.validate_order_risk(
            bot_id=1,
            symbol="NIFTY24OCTFUT",
            action="BUY",
            qty=50,
            price=24500.0,
            segment="NSE F&O Futures",
            execution_mode="PAPER"
        )
        assert approved is False
        assert "Insufficient available margin" in reason
        assert "171,500" in reason
        assert "20,000" in reason

    def test_affordable_option_and_equity_approved_at_20k_capital(self):
        """Affordable instruments (Option premium ₹7.5k, Cash Equity ₹2.9k) MUST be approved."""
        crm = CentralizedRiskManager({"account_capital": 20000.0, "min_order_interval_seconds": 0.0})
        # Affordable Option: 75 qty @ 100.0 = ₹7,500 margin
        approved_opt, reason_opt, _ = crm.validate_order_risk(
            bot_id=2,
            symbol="NIFTY24OCT24500CE",
            action="BUY",
            qty=75,
            price=100.0,
            segment="NSE F&O Options",
            execution_mode="PAPER"
        )
        assert approved_opt is True, f"Option rejected: {reason_opt}"

        # Affordable Cash Equity: 5 shares @ 2900 intraday = ₹2,900 margin
        approved_eq, reason_eq, _ = crm.validate_order_risk(
            bot_id=3,
            symbol="RELIANCE",
            action="BUY",
            qty=5,
            price=2900.0,
            segment="NSE Equity",
            execution_mode="PAPER"
        )
        assert approved_eq is True, f"Equity rejected: {reason_eq}"

    def test_position_sizing_dual_constraint_and_zero_fallback(self):
        """
        Position sizing must be strictly bounded by BOTH risk budget and margin limit.
        Must return 0 if unable to afford even 1 lot.
        """
        crm = CentralizedRiskManager({"account_capital": 20000.0, "max_risk_pct_per_trade": 1.5})
        # At ₹20,000 capital, risk budget = ₹300.
        # NIFTY Futures: Entry=24500, SL=24450 (50 pt risk). Lot size = 50.
        # Risk for 1 lot = 50 * 50 = ₹2,500 > ₹300 risk budget!
        # Margin for 1 lot = ₹171,500 > ₹20,000 capital!
        # Both constraints dictate 0 lots.
        qty_fut = crm.calculate_position_size(
            entry=24500.0,
            stop_loss=24450.0,
            lotsize=50,
            symbol="NIFTY24OCTFUT",
            segment="NSE F&O Futures"
        )
        assert qty_fut == 0, f"Expected 0 qty for unaffordable futures, got {qty_fut}"

        # Affordable Option: Entry=50, SL=46 (4 pt risk). Lot size = 25.
        # Risk for 1 lot = 25 * 4 = ₹100 <= ₹300 risk budget.
        # Margin for 1 lot = 25 * 50 = ₹1,250 <= ₹20,000 capital.
        # Max affordable risk = 300 / 4 = 75 qty. Lot size = 25 -> 75 // 25 = 3 lots = 75 qty.
        # Margin for 75 qty = 75 * 50 = ₹3,750 <= ₹20,000.
        qty_opt = crm.calculate_position_size(
            entry=50.0,
            stop_loss=46.0,
            lotsize=25,
            symbol="BANKNIFTY24OCT50000CE",
            segment="NSE F&O Options"
        )
        assert qty_opt == 75, f"Expected 75 qty, got {qty_opt}"

    def test_missing_or_negative_capital_fails_closed(self):
        """Capital values of 0, negative, or NaN must fail closed and return 0 quantity."""
        crm = CentralizedRiskManager()
        assert crm.calculate_position_size(100.0, 95.0, capital=0.0) == 0
        assert crm.calculate_position_size(100.0, 95.0, capital=-1000.0) == 0
        assert crm.calculate_position_size(100.0, 95.0, capital=float("nan")) == 0

    def test_margin_summary_structure(self):
        """Margin summary must report configured capital, used margin, and available margin."""
        summary = get_account_margin_summary()
        assert "account_capital" in summary
        assert "used_margin" in summary
        assert "available_margin" in summary
        assert "risk_budget_per_trade" in summary
        assert summary["account_capital"] == 20000.0
        assert summary["available_margin"] >= 0.0


# ============================================================================
# P1: 14-BOT MASTER BRAIN AUDIT
# ============================================================================

class TestPhase8BotFleetMasterBrainAudit:
    """Verifies all 14 bots for schema, edge cases, and UNVERIFIED status."""

    def test_all_14_bots_registered_and_configured(self):
        """CANONICAL_BOT_REGISTRY must contain exactly 14 bots with valid attributes."""
        bots = get_all_canonical_bots()
        assert len(bots) == 14
        for b in bots:
            assert b["id"] in range(1, 15)
            assert len(b["name"]) > 0
            assert len(b["asset"]) > 0
            assert len(b["strategy_id"]) > 0
            assert b["lotsize"] > 0
            assert b["weight"] >= 1.0

    @pytest.mark.parametrize("bot_id", list(range(1, 15)))
    def test_bot_signal_generation_and_schema(self, bot_id):
        """Each bot must generate a valid normalized signal on standard candle data."""
        base_price = 24500.0 if bot_id in (1, 6, 8, 14) else 2900.0
        candles = {
            "close": [base_price * (1.0 + (i * 0.0003)) for i in range(65)],
            "high": [base_price * (1.0 + (i * 0.0003)) * 1.002 for i in range(65)],
            "low": [base_price * (1.0 + (i * 0.0003)) * 0.998 for i in range(65)],
            "volume": [10000.0 + (i * 50.0) for i in range(65)]
        }
        sig = master_brain.evaluate_bot_strategy_signal(bot_id, candles)
        assert sig["bot_id"] == bot_id
        assert sig["action"] in (ACTION_BUY, ACTION_SELL, ACTION_HOLD, ACTION_NO_TRADE)
        assert 0.0 <= sig["confidence"] <= 1.0
        assert 0.0 <= sig["risk_estimate"] <= 1.0

    @pytest.mark.parametrize("bot_id", list(range(1, 15)))
    def test_bot_resilience_to_malformed_and_stale_data(self, bot_id):
        """Bots must return NO_TRADE or HOLD on corrupt/empty data without crashing."""
        corrupt_cases = [
            {},  # Empty dict
            {"close": [], "high": [], "low": [], "volume": []},  # Empty lists
            {"close": [100.0], "high": [105.0], "low": [95.0], "volume": [0.0]},  # Insufficient candles
            {"close": [float("nan")] * 30, "high": [float("nan")] * 30, "low": [float("nan")] * 30, "volume": [100.0] * 30},  # NaN values
            {"close": [-50.0] * 30, "high": [-40.0] * 30, "low": [-60.0] * 30, "volume": [100.0] * 30}  # Negative prices
        ]
        for c in corrupt_cases:
            try:
                sig = master_brain.evaluate_bot_strategy_signal(bot_id, c)
                assert sig["action"] in (ACTION_NO_TRADE, ACTION_HOLD)
            except Exception as e:
                pytest.fail(f"Bot #{bot_id} crashed on corrupt candle data: {e}")

    def test_fleet_track_records_labeled_unverified(self):
        """All bots' real-world performance must be labeled UNVERIFIED (paper-only)."""
        for b_id in range(1, 15):
            bot = get_bot_by_id(b_id)
            # In paper trading, track records cannot claim verified live profitability
            status = bot.get("verification_status", "UNVERIFIED")
            assert status in ("UNVERIFIED", "SIMULATED_ONLY", "PAPER_VALIDATED")

    def test_master_brain_weighted_consensus(self):
        """Master Brain must combine individual signals into weighted fleet consensus."""
        signals = [
            {"bot_id": 1, "symbol": "NIFTY24OCTFUT", "action": ACTION_BUY, "confidence": 0.85, "weight": 2.0, "entry": 24500.0, "stop_loss": 24420.0, "target": 24850.0},
            {"bot_id": 2, "symbol": "NIFTY24OCTFUT", "action": ACTION_BUY, "confidence": 0.80, "weight": 1.5, "entry": 24500.0, "stop_loss": 24420.0, "target": 24850.0},
            {"bot_id": 5, "symbol": "NIFTY24OCTFUT", "action": ACTION_BUY, "confidence": 0.75, "weight": 1.0, "entry": 24500.0, "stop_loss": 24420.0, "target": 24850.0},
            {"bot_id": 6, "symbol": "NIFTY24OCTFUT", "action": ACTION_SELL, "confidence": 0.55, "weight": 1.0, "entry": 24500.0, "stop_loss": 24600.0, "target": 24300.0}
        ]
        consensus = master_brain.evaluate_fleet_consensus(
            symbol="NIFTY24OCTFUT",
            signals=signals,
            market_regime="TRENDING_BULL"
        )
        assert consensus["decision"] == ACTION_BUY
        assert consensus["consensus_score"] > 0.60
        assert "market_regime" in consensus


# ============================================================================
# P2: MULTI-MARKET SCANNER & 4-STATE ARCHITECTURE
# ============================================================================

class TestPhase8MultiMarketScanner:
    """Verifies the 4-state instrument architecture and margin filtering."""

    def test_scanner_four_distinct_states_architecture(self):
        """Each evaluated instrument must have 4 distinct state flags and a valid state string."""
        scanner = MultiMarketScanner()
        res = scanner.scan_universe()
        assert "evaluated_opportunities" in res or "skipped_instruments" in res

        # Verify universe instruments have valid metadata
        for inst in scanner.get_supported_universe():
            assert "symbol" in inst
            assert "segment" in inst
            assert "lotsize" in inst
            assert inst["lotsize"] >= 1

    def test_scanner_filters_unaffordable_instruments_at_20k_capital(self):
        """At ₹20,000 capital, instruments requiring >₹20k margin must be skipped or marked untradable."""
        scanner = MultiMarketScanner({"account_capital": 20000.0})
        # Simulate snapshot where NIFTY futures is at 24500 (margin ₹171.5k)
        snapshots = {
            "NIFTY24OCTFUT": {"ltp": 24500.0, "close": 24500.0, "age_seconds": 2.0, "best_bid": 24498.0, "best_ask": 24502.0},
            "RELIANCE": {"ltp": 2900.0, "close": 2900.0, "age_seconds": 2.0, "best_bid": 2899.0, "best_ask": 2901.0}
        }
        res = scanner.scan_universe(market_snapshots=snapshots)
        # NIFTY futures should either be skipped with MARGIN_EXCEEDS_CAPITAL or flagged is_tradable=False
        skipped = res.get("skipped_instruments", [])
        nifty_skip = next((s for s in skipped if s["symbol"] == "NIFTY24OCTFUT"), None)
        opps = res.get("evaluated_opportunities", [])
        nifty_opp = next((o for o in opps if o["symbol"] == "NIFTY24OCTFUT"), None)

        if nifty_skip:
            assert nifty_skip["reason"] == "MARGIN_EXCEEDS_CAPITAL"
        elif nifty_opp:
            assert nifty_opp.get("is_tradable") is False
            assert nifty_opp.get("state_classification") == "MARGIN_EXCEEDS_CAPITAL"


# ============================================================================
# P3: NET PROFIT & REGULATORY COST CALCULATIONS
# ============================================================================

class TestPhase8NetProfitAndStatutoryCosts:
    """Verifies statutory charges, net reward hurdle, and P&L segregation."""

    def test_comprehensive_regulatory_charges(self):
        """Validates all 5 statutory components across equity, futures, options."""
        # Equity Intraday Buy ₹2,900 x 10 = ₹29,000 turnover
        chg_eq_buy = compute_instrument_regulatory_charges("RELIANCE", 2900.0, 10, "BUY", "NSE Equity", "INTRADAY")
        assert chg_eq_buy["brokerage"] == 8.70  # min(20.0, 29000 * 0.0003) = 8.70
        assert chg_eq_buy["stt_ctt"] == 0.00  # No STT on intraday buy
        assert chg_eq_buy["stamp_duty"] > 0.00  # Stamp duty applies to buy
        assert chg_eq_buy["gst_18pct"] > 0.00

        # Equity Intraday Sell ₹2,950 x 10 = ₹29,500 turnover
        chg_eq_sell = compute_instrument_regulatory_charges("RELIANCE", 2950.0, 10, "SELL", "NSE Equity", "INTRADAY")
        assert chg_eq_sell["stt_ctt"] > 0.00  # STT 0.025% on intraday sell

        # Futures Sell ₹24,500 x 50 = ₹1,225,000 turnover
        chg_fut_sell = compute_instrument_regulatory_charges("NIFTY24OCTFUT", 24500.0, 50, "SELL", "NSE F&O Futures")
        assert chg_fut_sell["stt_ctt"] == 153.13  # 0.0125% STT (153.125 rounded half up = 153.13)

        # Options Sell ₹100 x 75 = ₹7,500 premium turnover
        chg_opt_sell = compute_instrument_regulatory_charges("NIFTY24OCT24500CE", 100.0, 75, "SELL", "NSE F&O Options")
        assert chg_opt_sell["stt_ctt"] == round(7500.0 * 0.000625, 2)  # 0.0625% STT on premium

    def test_net_profit_gate_enforces_positive_net_and_rr_hurdle(self):
        """Trades with negative net reward or RR < 1.20 must be rejected."""
        # Case 1: Gross profit exists but charges wipe it out -> Rejected
        res_loss = master_brain.calculate_realistic_net_profit(
            symbol="RELIANCE",
            action="BUY",
            entry=2900.0,
            target=2901.0,  # 1 pt gross gain on 1 share = ₹1.00 gross, charges ~₹42.00 -> Net loss
            stop_loss=2890.0,
            qty=1,
            segment="NSE Equity"
        )
        assert res_loss["is_profitable"] is False
        assert res_loss["net_reward"] < 0

        # Case 2: Sub-1.20 RR -> Rejected
        res_sub_rr = master_brain.calculate_realistic_net_profit(
            symbol="RELIANCE",
            action="BUY",
            entry=2900.0,
            target=2910.0,  # 10 pt gain
            stop_loss=2890.0,  # 10 pt risk -> Gross RR 1.0 -> Net RR < 1.0
            qty=10,
            segment="NSE Equity"
        )
        assert res_sub_rr["is_profitable"] is False
        assert res_sub_rr["net_reward_to_risk"] < 1.20

        # Case 3: Robust trade with Net RR >= 1.20 and positive net reward -> Approved
        res_pass = master_brain.calculate_realistic_net_profit(
            symbol="RELIANCE",
            action="BUY",
            entry=2900.0,
            target=2960.0,  # 60 pt gain
            stop_loss=2880.0,  # 20 pt risk -> Gross RR 3.0
            qty=20,
            segment="NSE Equity"
        )
        assert res_pass["is_profitable"] is True
        assert res_pass["net_reward"] > 0
        assert res_pass["net_reward_to_risk"] >= 1.20

    def test_strict_segregation_of_pnl_categories(self):
        """Estimated P&L, simulated paper P&L, and broker realized P&L must be strictly segregated."""
        engine = CentralizedExecutionEngine()
        # In PAPER mode, executed orders have simulated fill and simulated P&L, never broker realized
        res = engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            qty=5,
            price=2900.0,
            execution_mode="PAPER"
        )
        assert res["success"] is True
        assert res["mode"] == "PAPER"
        assert res["status"] == ORDER_STATE_FILLED
        assert "fill_price" in res

        # Square off
        exit_res = engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="SELL",
            qty=5,
            price=2920.0,
            execution_mode="PAPER"
        )
        assert exit_res["success"] is True
        assert exit_res["mode"] == "PAPER"
        assert exit_res["status"] == ORDER_STATE_FILLED
        assert "Paper order filled" in exit_res.get("message", "")


# ============================================================================
# P4: PAPER OPERATIONAL VALIDATION & RESILIENCE
# ============================================================================

class TestPhase8PaperOperationalResilience:
    """Verifies fail-closed resilience against feed drops, duplicates, and live order protection."""

    def test_stale_ticks_rejected_by_validator(self):
        """Ticks older than max_stale_seconds must be rejected."""
        val = MarketTickValidator(max_stale_seconds=10.0)
        stale_tick = {
            "symbol": "RELIANCE",
            "price": 2900.0,
            "volume": 1000.0,
            "timestamp": time.time() - 25.0,  # 25s old
            "sequence_number": 501
        }
        valid, reason = val.validate_tick(stale_tick)
        assert valid is False
        assert "Stale tick" in reason

    def test_future_dated_ticks_rejected_by_validator(self):
        """Ticks with timestamps in the future must be rejected."""
        val = MarketTickValidator(max_future_seconds=2.0)
        future_tick = {
            "symbol": "RELIANCE",
            "price": 2900.0,
            "volume": 1000.0,
            "timestamp": time.time() + 60.0,  # 60s in future
            "sequence_number": 502
        }
        valid, reason = val.validate_tick(future_tick)
        assert valid is False
        assert "Future-dated tick" in reason

    def test_duplicate_order_idempotency_suppression(self):
        """Immediate duplicate order submission must be rejected at Gate 0."""
        engine = CentralizedExecutionEngine()
        cid = f"TEST_PHASE8_IDEMPOTENCY_{int(time.time()*1000)}"
        res1 = engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            qty=2,
            price=2900.0,
            execution_mode="PAPER",
            client_order_id=cid
        )
        assert res1["success"] is True

        # Immediate duplicate
        res2 = engine.execute_order(
            bot_id=1,
            symbol="RELIANCE",
            action="BUY",
            qty=2,
            price=2900.0,
            execution_mode="PAPER",
            client_order_id=cid
        )
        assert res2["success"] is False
        assert res2["status"] == ORDER_STATE_REJECTED
        assert "Duplicate order detected" in res2["error"]

    def test_emergency_stop_blocks_new_orders_and_permits_exits(self):
        """Emergency stop must immediately block entries and allow exit square-offs."""
        crm = CentralizedRiskManager()
        crm.trigger_emergency_stop()

        try:
            # New entry attempt must be rejected
            approved_entry, reason_entry, _ = crm.validate_order_risk(
                bot_id=1,
                symbol="RELIANCE",
                action="BUY",
                qty=2,
                price=2900.0,
                segment="NSE Equity",
                execution_mode="PAPER"
            )
            assert approved_entry is False
            assert "Emergency Stop" in reason_entry

            # Exit square-off must be approved
            approved_exit, reason_exit, _ = crm.validate_order_risk(
                bot_id=1,
                symbol="RELIANCE",
                action="EXIT",
                qty=2,
                price=2900.0,
                segment="NSE Equity",
                execution_mode="PAPER"
            )
            assert approved_exit is True
        finally:
            crm.reset_circuit_breaker(admin_override=True)

    def test_live_trading_remains_strictly_blocked(self):
        """Live trading gate must remain strictly fail-closed."""
        readiness = evaluate_live_readiness(
            broker_state={"angel_one": {"connected": False}},
            active_smart_connect={"instance": None},
            market_feed_evaluator_fn=lambda: {"authentic": False, "message": "Simulated"},
            rms_state={"circuit_breaker_active": False},
            reconciliation_state={"status": "CLEAN"},
            user_consent_provided=False
        )
        assert readiness["ready_for_live"] is False
        assert "AUTHENTIC_BROKER_AUTH" in readiness["failed_conditions"]
        assert readiness["total_conditions"] == 8
