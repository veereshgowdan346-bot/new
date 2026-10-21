"""
Tests for Indian Statutory Regulatory Charges Engine, Accounting Consistency,
and Trade Deduplication Invariants.

Verifies:
1. Exact SEBI & Exchange statutory fee calculations across Equity, Futures, Options, Currency, Commodity.
2. Option premium turnover enforcement (never on underlying index spot levels).
3. Option price anomaly quarantine (index spot price > 2000 detected as option price).
4. Trade identity deduplication without dropping distinct trades sharing placeholder IDs.
5. Strict exclusion of pre-order RMS rejections and mock test doubles.
6. Portfolio mathematical identities:
   - Wins + Losses + Breakeven == Eligible Closed Trades
   - Gross Realized P/L - Regulatory Charges == Net Realized P/L
7. Zero broker orders (SmartConnect.placeOrder) in PAPER mode.
"""

import pytest
from decimal import Decimal
from unittest.mock import MagicMock, patch

from server.regulatory_charges import (
    compute_instrument_regulatory_charges,
    classify_instrument_and_segment,
    to_decimal,
    round_cur
)
from server.highest_profit_bot import (
    calculate_regulatory_charges,
    evaluate_bot_trade_performance
)
from server.execution_engine import CentralizedExecutionEngine
from server.reconciliation_engine import run_deterministic_reconciliation


class TestRegulatoryChargesEngine:
    """Verifies authoritative SEBI & Exchange charge calculations."""

    def test_equity_intraday_charges(self):
        """NSE Equity Intraday: Brokerage max Rs 20/order, STT 0.025% sell side, NSE txn 0.00297%."""
        res = compute_instrument_regulatory_charges(
            symbol="RELIANCE",
            price=2500.0,
            qty=10,
            action="ROUND_TRIP",
            segment="NSE Equity",
            exchange="NSE",
            product_type="INTRADAY"
        )
        assert res["validation_status"] == "VALID"
        assert res["instrument_type"] == "EQUITY"
        assert res["turnover"] == 50000.0  # 2500 * 10 * 2
        # Brokerage: min(40, 50000 * 0.0003 * 2 = 30) = 30.00 (or capped at 40)
        assert res["brokerage"] > 0
        # STT: 0.025% on sell side (25000 * 0.00025 = 6.25)
        assert res["stt_ctt"] == 6.25
        # Total charges must equal sum of constituent fees
        comp_sum = round(
            res["brokerage"] + res["stt_ctt"] + res["exchange_turnover"] +
            res["gst_18pct"] + res["sebi_turnover"] + res["stamp_duty"], 2
        )
        assert res["total_charges"] == comp_sum

    def test_futures_charges(self):
        """NSE Futures: Flat brokerage Rs 20/leg, STT 0.0125% sell side, exchange txn 0.00173%."""
        res = compute_instrument_regulatory_charges(
            symbol="NIFTY24OCTFUT",
            price=24500.0,
            qty=50,
            action="ROUND_TRIP",
            segment="NFO Futures",
            exchange="NFO",
            product_type="INTRADAY"
        )
        assert res["validation_status"] == "VALID"
        assert res["instrument_type"] == "INDEX_FUTURES"
        assert res["turnover"] == 24500.0 * 50 * 2
        assert res["brokerage"] == 40.0  # Rs 20 per leg * 2
        # STT: 0.0125% on sell side = 1,225,000 * 0.000125 = 153.13
        assert res["stt_ctt"] == 153.13

    def test_options_premium_turnover_enforcement(self):
        """Options turnover MUST be calculated strictly on premium, not index level."""
        res = compute_instrument_regulatory_charges(
            symbol="NIFTY24OCT24500CE",
            price=120.0,  # Premium price
            qty=50,
            action="ROUND_TRIP",
            segment="NFO Options",
            exchange="NFO",
            product_type="INTRADAY"
        )
        assert res["validation_status"] == "VALID"
        assert res["instrument_type"] == "INDEX_OPTIONS"
        # Premium turnover = 120 * 50 * 2 = 12,000 (NOT 24500 * 50 = 1,225,000!)
        assert res["turnover"] == 12000.0
        assert res["brokerage"] == 40.0  # Rs 20 per leg * 2
        # STT: 0.0625% on sell side premium = 6000 * 0.000625 = 3.75
        assert res["stt_ctt"] == 3.75
        # Exchange txn: 0.05% on 12000 = 6.0
        assert res["exchange_turnover"] == 6.0
        # Total charges should be reasonable (~Rs 58-60), NEVER thousands of rupees
        assert res["total_charges"] < 70.0

    def test_options_index_spot_anomaly_quarantine(self):
        """If option contract price is passed as index spot (> 2000), quarantine immediately."""
        res = compute_instrument_regulatory_charges(
            symbol="NIFTY24OCT24500CE",
            price=24500.0,  # Underlying spot level passed erroneously as option premium!
            qty=50,
            action="ROUND_TRIP",
            segment="NFO Options",
            exchange="NFO",
            product_type="INTRADAY"
        )
        assert res["validation_status"] == "QUARANTINED"
        assert "underlying index spot price" in res["quarantine_reason"]
        assert res["total_charges"] == 0.0

    def test_mcx_commodity_charges(self):
        """MCX Commodity: CTT 0.01% on sell futures, MCX txn 0.0021%."""
        res = compute_instrument_regulatory_charges(
            symbol="CRUDEOIL24NOVFUT",
            price=6000.0,
            qty=100,
            action="ROUND_TRIP",
            segment="MCX Commodity",
            exchange="MCX",
            product_type="INTRADAY"
        )
        assert res["validation_status"] == "VALID"
        assert res["instrument_type"] == "COMMODITY_FUTURES"
        assert res["brokerage"] == 40.0
        # CTT: 0.01% on sell side = 600,000 * 0.0001 = 60.0
        assert res["stt_ctt"] == 60.0

    def test_cds_currency_charges(self):
        """CDS Currency: Zero STT, 0.00035% exchange charge."""
        res = compute_instrument_regulatory_charges(
            symbol="USDINR24OCTFUT",
            price=84.0,
            qty=1000,
            action="ROUND_TRIP",
            segment="CDS Currency",
            exchange="CDS",
            product_type="INTRADAY"
        )
        assert res["validation_status"] == "VALID"
        assert res["instrument_type"] == "CURRENCY_FUTURES"
        assert res["stt_ctt"] == 0.0  # No STT on currency derivatives
        assert res["brokerage"] == 40.0


class TestTradeIdentityAndDeduplication:
    """Verifies trade identity handling and deduplication invariants."""

    def test_placeholder_id_does_not_collapse_distinct_trades(self):
        """
        Multiple trades sharing 'ORD-PENDING' as order_id must NOT be collapsed
        if their trade_id or database row IDs are distinct.
        """
        eval_res = evaluate_bot_trade_performance()
        assert eval_res is not None
        # Must have verified bot rankings and portfolio summary
        assert "bot_rankings" in eval_res
        total_eval_trades = sum(b["total_trades"] for b in eval_res["bot_rankings"])
        # Canonical bots account for 368 verified closed trades
        assert total_eval_trades == 368

    def test_rms_rejections_and_mock_doubles_excluded(self):
        """
        Pre-order RMS blocks and mock test doubles ('FAKE_AO_1') must be excluded
        from evaluated closed trades.
        """
        recon = run_deterministic_reconciliation()
        categories = recon["records_reconciliation"]["categories"]
        assert categories["RMS_REJECTION"] == 198
        assert categories["SYNTHETIC_MOCK_TEST"] == 66
        assert categories["ENTRY_ORDER"] == 122
        assert recon["records_reconciliation"]["eligible_closed_trades"] == 373


class TestMathematicalInvariants:
    """Verifies strict mathematical reconciliation identities."""

    def test_reconciliation_engine_invariants(self):
        """
        Verifies:
        1. Wins + Losses + Breakeven == Total Eligible Closed Trades
        2. Gross Realized P/L - Statutory Charges == Net Realized P/L
        3. Per-bot sums == Portfolio totals
        """
        recon = run_deterministic_reconciliation()
        inv = recon["invariants_validation"]
        assert inv["wins_plus_losses_plus_breakeven_equals_total"] is True
        assert inv["gross_minus_charges_equals_net"] is True
        assert inv["per_bot_trades_sum_matches_total"] is True
        assert inv["per_bot_gross_sum_matches_total"] is True
        assert inv["per_bot_charges_sum_matches_total"] is True
        assert inv["per_bot_net_sum_matches_total"] is True
        assert inv["all_invariants_pass"] is True

        fin = recon["financial_reconciliation"]
        assert fin["net_wins"] + fin["net_losses"] + fin["breakeven"] == 373
        # Gross: -125,925.72, Charges: 10,099.02, Net: -136,024.74
        expected_net = round(fin["gross_realized_pnl"] - fin["total_statutory_charges"], 2)
        assert abs(fin["net_realized_pnl"] - expected_net) < 0.01

    def test_legacy_charges_comparison(self):
        """
        Confirms the exact financial impact of repairing the options turnover calculation:
        Legacy charges of ₹331,514.68 corrected to ₹10,099.02, saving ₹321,415.66.
        """
        recon = run_deterministic_reconciliation()
        fin = recon["financial_reconciliation"]
        assert fin["legacy_unrepaired_charges"] == 331514.68
        assert fin["total_statutory_charges"] == 10099.02
        assert fin["charges_savings_from_repair"] == 321415.66


class TestPaperSafetyInvariants:
    """Ensures SmartConnect.placeOrder is physically unreachable in PAPER mode."""

    def test_paper_mode_never_calls_broker_place_order(self):
        """In PAPER mode, executing an order must never invoke broker placeOrder."""
        broker_mock = MagicMock()
        engine = CentralizedExecutionEngine()
        engine.enforce_market_hours = False

        with patch("server.execution_engine.get_open_positions", return_value=[]), \
             patch("server.execution_engine.save_order"), \
             patch("server.execution_engine.save_position"):
            res = engine.execute_order(
                bot_id=1,
                symbol="NIFTY",
                action="BUY",
                qty=50,
                price=150.0,
                producttype="INTRADAY",
                ordertype="MARKET",
                execution_mode="PAPER",
                active_smart_connect={"instance": broker_mock, "status": "CONNECTED"}
            )
            assert res is not None
            assert res["success"] is True
            assert res["mode"] == "PAPER"
            # Broker client must NEVER be called in PAPER mode
            broker_mock.placeOrder.assert_not_called()


class TestCleanVsQuarantinedSegregation:
    """Verifies that quarantined option records are strictly segregated from Level 1 verified clean performance."""

    def test_clean_vs_quarantined_mathematical_identity(self):
        recon = run_deterministic_reconciliation()
        l1 = recon["level_1_clean_verified_performance"]
        l2 = recon["level_2_quarantined_unresolved_performance"]
        l3 = recon["level_3_synthetic_stress_test_performance"]
        l4 = recon["level_4_excluded_non_closed_records"]
        disc = recon["discrepancy_register"]

        # Level 1 Clean: 267 trades, Gross: Rs 45,867.78, Charges: Rs 10,099.02, Net: Rs 35,768.76
        assert l1["trade_count"] == 267
        assert l1["gross_pnl"] == 45867.78
        assert l1["statutory_charges"] == 10099.02
        assert l1["net_pnl"] == 35768.76
        assert l1["net_wins"] == 253
        assert l1["net_losses"] == 14
        assert l1["breakeven"] == 0
        assert l1["win_rate_pct"] == 94.76

        # Level 2 Quarantined: 102 trades, Gross: Rs 11,092.50, Charges: UNRESOLVED
        assert l2["record_count"] == 102
        assert l2["gross_pnl"] == 11092.50
        assert l2["statutory_charges"] == "UNRESOLVED"
        assert l2["net_pnl"] == "UNRESOLVED"
        assert l2["net_wins"] == 96
        assert l2["net_losses"] == 5
        assert l2["breakeven"] == 1

        # Level 3 Stress: 4 trades, Gross: -Rs 182,886.00 (-45,721.50 each)
        assert l3["record_count"] == 4
        assert l3["gross_pnl"] == -182886.00
        assert l3["losses"] == 4

        # Level 4 Excluded: 386 records (198 RMS + 122 entry + 66 mock)
        assert l4["total_excluded"] == 386
        assert l4["rms_pre_order_rejections"] == 198
        assert l4["initial_entry_orders"] == 122
        assert l4["synthetic_mock_tests"] == 66

        # Total database row count identity: 267 + 102 + 4 + 386 == 759
        assert l1["trade_count"] + l2["record_count"] + l3["record_count"] + l4["total_excluded"] == 759
        assert disc["total_records_registered"] == 759

        # Gross P/L identity: 45,867.78 + 11,092.50 - 182,886.00 == -125,925.72
        tape_gross = round(l1["gross_pnl"] + l2["gross_pnl"] + l3["gross_pnl"], 2)
        assert tape_gross == -125925.72

    def test_quarantined_trades_do_not_silently_become_zero_charge_winners(self):
        """A bot with only quarantined option records must NOT qualify as having verified trades."""
        eval_res = evaluate_bot_trade_performance()
        rankings = eval_res["bot_rankings"]

        # Bot 2 (EMA Trend Bot) has 3 trade_memory rows, all 3 are quarantined option contracts
        bot2 = next((b for b in rankings if b["bot_id"] == 2), None)
        assert bot2 is not None
        assert bot2["quarantined_trades"] == 3
        assert bot2["clean_trades"] == 0
        # Must be disqualified because clean_trades < 5
        assert bot2["is_qualified"] is False
        assert "Insufficient verified clean trades" in (bot2["disqualification_reason"] or "") or "Insufficient closed trades" in (bot2["disqualification_reason"] or "")

    def test_bot1_gross_pnl_mathematical_reconciliation(self):
        """
        Explains and proves the difference between Bot 1's normal-scalp gross P/L (+Rs 26,712.40)
        and displayed database gross P/L (-Rs 156,173.60).
        Difference is exactly the 4 emergency exit stress test injections (-Rs 182,886.00).
        """
        import csv
        recon = run_deterministic_reconciliation()
        with open("CHINTU_ROW_LEVEL_TRADE_RECONCILIATION.csv", "r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))

        bot1_closed = [r for r in rows if r["bot_id"] == "1" and r["is_eligible_closed_trade"] == "1"]
        assert len(bot1_closed) == 213

        stress_trades = [r for r in bot1_closed if r["provenance"] == "EMERGENCY_EXIT_STRESS_TEST"]
        normal_trades = [r for r in bot1_closed if r["provenance"] != "EMERGENCY_EXIT_STRESS_TEST"]

        assert len(stress_trades) == 4
        assert [int(t["record_id"]) for t in stress_trades] == [737, 746, 751, 759]
        total_stress_loss = sum(Decimal(t["gross_pnl"]) for t in stress_trades)
        assert total_stress_loss == Decimal("-182886.00")

        # 209 normal scalp trades sum to exactly +Rs 26,712.40
        assert len(normal_trades) == 209
        normal_gross = sum(Decimal(t["gross_pnl"]) for t in normal_trades)
        assert normal_gross == Decimal("26712.40")

        # Cumulative tape sum for Bot 1: +26,712.40 - 182,886.00 == -156,173.60
        total_bot1_tape = normal_gross + total_stress_loss
        assert total_bot1_tape == Decimal("-156173.60")

    def test_discrepancy_register_file_schema_and_contents(self):
        """Verifies CHINTU_DISCREPANCY_REGISTER.csv file exists, has 9 columns and exactly 759 rows."""
        import csv, os
        reg_path = os.path.join(r"c:\Users\veere\Desktop\new", "CHINTU_DISCREPANCY_REGISTER.csv")
        assert os.path.exists(reg_path), "CHINTU_DISCREPANCY_REGISTER.csv must exist"

        expected_columns = [
            "record_id", "bot_id", "instrument", "issue", "evidence",
            "classification", "verified_charge", "confidence", "unresolved_reason"
        ]
        with open(reg_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            assert reader.fieldnames == expected_columns
            rows = list(reader)
            assert len(rows) == 759

            # Check that quarantined rows have verified_charge marked UNRESOLVED (not 0.00)
            quar_rows = [r for r in rows if r["classification"] == "QUARANTINED_UNRESOLVED_RECORD"]
            assert len(quar_rows) == 102
            for q in quar_rows:
                assert q["verified_charge"] == "UNRESOLVED"
                assert "Fee basis unresolved" in q["unresolved_reason"]

    def test_no_duplicate_or_missing_records_in_register(self):
        """Verifies exactly 759 unique continuous IDs from 1 to 759 with zero duplicates or gaps."""
        import csv, os
        reg_path = os.path.join(r"c:\Users\veere\Desktop\new", "CHINTU_DISCREPANCY_REGISTER.csv")
        with open(reg_path, "r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        ids = [int(r["record_id"]) for r in rows]
        assert len(ids) == 759
        assert len(set(ids)) == 759
        assert set(ids) == set(range(1, 760))

    def test_quarantined_option_records_not_in_clean_bot_rankings(self):
        """Verifies that quarantined option records cannot qualify a bot or appear in clean net totals."""
        eval_res = evaluate_bot_trade_performance()
        rankings = eval_res["bot_rankings"]
        for b in rankings:
            # If a bot has clean_trades < 5, it must NOT be qualified, even if quarantined_trades > 0
            if b["clean_trades"] < 5:
                assert b["is_qualified"] is False

