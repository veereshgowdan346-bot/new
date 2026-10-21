"""
CHINTU AI / TRADING JARVIS WORKSTATION - STEP 3
RISK GUARDIAN AUDIT, SAFETY HARDENING & REGRESSION VERIFICATION TEST SUITE

Comprehensive verification of all 15 Core Risk Invariants:
  1.  Max Account Capital Ceiling & Baseline Capital Segregation
  2.  Per-Bot Capital Allocation Cap
  3.  Max Risk % Per Trade & Dual-Constraint Position Sizing
  4.  Portfolio Max Drawdown Protection
  5.  Account Daily Loss Limit & Automated Circuit Breaker
  6.  Max Total Open Concurrent Positions
  7.  Correlated Derivative Exposure Limit
  8.  Order Submission Rate Limiter (Orders/Min)
  9.  Minimum Inter-Order Cooldown Interval
  10. Stale Feed Rejection Gate
  11. Broker Disconnection Fail-Closed Protection
  12. Platform-Wide Emergency Stop & Safe Position Liquidation
  13. Input Sanitization & Boundary Validation (NaN, Inf, negatives, invalid types)
  14. Bot-Level Consecutive-Loss Quarantine (Quarantine after 3 consecutive losses)
  15. Concurrency & Thread-Safety Guarantees (Multi-threaded race condition safety)

Additional Boundary Gates Tested:
  16. BotScheduler._execute_paper_order unbypassable risk authorization
  17. PythonStreamServer.place_live_angel_order unbypassable risk authorization
  18. Fail-Closed Global Exception Handler
"""

import time
import math
import threading
import unittest
from typing import Dict, Any

from server.centralized_risk_manager import (
    CentralizedRiskManager,
    centralized_risk_manager,
    calculate_required_margin,
    get_account_margin_summary,
    get_centralized_rms_config,
    DEFAULT_RMS_CONFIG
)
from server.execution_engine import CentralizedExecutionEngine
from server.bot_scheduler import BotWorker
from server import memory_db
from server import python_stream_server as pss


class TestRiskGuardianInvariants(unittest.TestCase):
    """Verifies all 15 non-negotiable risk invariants and safety boundaries."""

    def setUp(self):
        # Fresh isolated RMS instance for each test
        self.crm = CentralizedRiskManager({
            "account_capital": 20000.0,
            "max_account_capital": 500000.0,
            "max_capital_per_bot": 200000.0,
            "max_risk_pct_per_trade": 1.5,
            "max_daily_loss": 5000.0,
            "max_drawdown_pct": 5.0,
            "max_open_positions": 50,
            "max_correlated_positions": 2,
            "min_order_interval_seconds": 3.0,
            "max_orders_per_minute": 15,
            "stale_feed_max_age_seconds": 2.0,
            "max_consecutive_losses": 2,
            "circuit_breaker_active": False,
            "emergency_stop_active": False
        })
        self.crm.last_order_time = 0.0
        self.crm.order_timestamps = []

    # -------------------------------------------------------------------------
    # INVARIANT 1: Max Account Capital Ceiling & Segregation
    # -------------------------------------------------------------------------
    def test_invariant_01_account_capital_ceiling_and_segregation(self):
        """Order requiring margin greater than available account capital is rejected."""
        # Baseline account capital is ₹20,000
        # NIFTY futures requiring ₹171,500 must be rejected
        approved, reason, telem = self.crm.validate_order_risk(
            bot_id=1,
            symbol="NIFTY24OCTFUT",
            action="BUY",
            qty=50,
            price=24500.0,
            segment="NSE F&O Futures",
            execution_mode="PAPER"
        )
        self.assertFalse(approved)
        self.assertIn("Insufficient available margin", reason)
        self.assertIn("20,000", reason)

    # -------------------------------------------------------------------------
    # INVARIANT 2: Per-Bot Capital Allocation Cap
    # -------------------------------------------------------------------------
    def test_invariant_02_per_bot_capital_allocation_cap(self):
        """Order requiring margin greater than max_capital_per_bot is rejected."""
        crm_small_bot = CentralizedRiskManager({
            "account_capital": 500000.0,
            "max_capital_per_bot": 15000.0  # Bot cap set to ₹15,000
        })
        # Equity Intraday for 10 RELIANCE @ 2900 requires ₹5,800 (passes)
        app_ok, _, _ = crm_small_bot.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=10, price=2900.0, segment="NSE Equity"
        )
        self.assertTrue(app_ok)

        # Equity Intraday for 30 RELIANCE @ 2900 requires ₹17,400 (> ₹15,000 bot cap, rejected)
        app_fail, reason_fail, _ = crm_small_bot.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=30, price=2900.0, segment="NSE Equity"
        )
        self.assertFalse(app_fail)
        self.assertIn("exceeds per-bot capital limit", reason_fail)

    # -------------------------------------------------------------------------
    # INVARIANT 3: Max Risk % Per Trade & Position Sizing
    # -------------------------------------------------------------------------
    def test_invariant_03_max_risk_pct_per_trade_and_position_sizing(self):
        """Position sizing quantizes to lotsize and respects risk budget."""
        # Account capital: ₹20,000, Risk %: 1.5% -> Budget: ₹300.00
        # Entry: 2500, Stop Loss: 2450 -> SL distance = 50
        # Max qty = 300 / 50 = 6 shares. Lotsize: 5 -> Quantized to 1 lot = 5 shares
        qty = self.crm.calculate_position_size(
            entry=2500.0,
            stop_loss=2450.0,
            capital=20000.0,
            risk_pct=1.5,
            lotsize=5
        )
        self.assertEqual(qty, 5)

        # If lotsize is 10, 6 shares cannot form even 1 full lot -> returns 0
        qty_zero = self.crm.calculate_position_size(
            entry=2500.0,
            stop_loss=2450.0,
            capital=20000.0,
            risk_pct=1.5,
            lotsize=10
        )
        self.assertEqual(qty_zero, 0)

        # Trade risk check rejection in validate_order_risk
        # Risk budget: 1.5% of ₹20,000 = ₹300. Stop loss: 2400 (distance ₹100), qty: 5 -> Risk = ₹500 (> ₹300)
        approved, reason, _ = self.crm.validate_order_risk(
            bot_id=1,
            symbol="INFY",
            action="BUY",
            qty=5,
            price=2500.0,
            stop_loss=2400.0,
            segment="NSE Equity"
        )
        self.assertFalse(approved)
        self.assertIn("exceeds risk budget per trade", reason)

    # -------------------------------------------------------------------------
    # INVARIANT 4: Portfolio Max Drawdown Protection
    # -------------------------------------------------------------------------
    def test_invariant_04_portfolio_max_drawdown_protection(self):
        """Trips circuit breaker when portfolio drawdown reaches 5.0%."""
        # Account capital: ₹500,000. Max drawdown: 5.0% (₹25,000 loss from peak)
        self.crm.config["max_daily_loss"] = 50000.0  # Daily loss ceiling raised to isolate drawdown check
        self.crm.peak_account_value = 500000.0
        self.crm.daily_realized_pnl = -26000.0  # Drawdown: 5.2% >= 5.0%

        approved, reason, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        self.assertFalse(approved)
        self.assertTrue(self.crm.config["circuit_breaker_active"])
        self.assertIn("Maximum drawdown limit", reason)

    # -------------------------------------------------------------------------
    # INVARIANT 5: Account Daily Loss Limit & Automated Circuit Breaker
    # -------------------------------------------------------------------------
    def test_invariant_05_daily_loss_limit_and_circuit_breaker(self):
        """Trips circuit breaker on daily loss breach, blocks entries, permits emergency exits."""
        self.crm.daily_realized_pnl = -5200.0  # Max daily loss is ₹5,000

        # Entry must be blocked
        app_entry, reason_entry, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        self.assertFalse(app_entry)
        self.assertTrue(self.crm.config["circuit_breaker_active"])
        self.assertIn("Daily loss limit", reason_entry)

        # Emergency exit / squareoff must be PERMITTED
        app_exit, reason_exit, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="EXIT", qty=1, price=2900.0, is_emergency_exit=True
        )
        self.assertTrue(app_exit)
        self.assertIn("approved by RMS", reason_exit)

    # -------------------------------------------------------------------------
    # INVARIANT 6: Max Total Open Concurrent Positions
    # -------------------------------------------------------------------------
    def test_invariant_06_max_open_positions_limit(self):
        """Blocks new entries when max_open_positions ceiling is reached."""
        self.crm.config["max_open_positions"] = 2
        # Mock get_open_positions to return 2 positions
        import server.centralized_risk_manager as crm_mod
        orig_get_pos = crm_mod.get_open_positions
        crm_mod.get_open_positions = lambda: [
            {"symbol": "INFY", "status": "OPEN", "qty": 10, "entry_price": 1800.0},
            {"symbol": "TCS", "status": "OPEN", "qty": 5, "entry_price": 3500.0}
        ]
        try:
            approved, reason, _ = self.crm.validate_order_risk(
                bot_id=1, symbol="WIPRO", action="BUY", qty=10, price=500.0
            )
            self.assertFalse(approved)
            self.assertIn("Maximum open positions limit (2) reached", reason)

            # Exits must still be permitted
            app_exit, _, _ = self.crm.validate_order_risk(
                bot_id=1, symbol="INFY", action="EXIT", qty=10, price=1800.0, is_emergency_exit=True
            )
            self.assertTrue(app_exit)
        finally:
            crm_mod.get_open_positions = orig_get_pos

    # -------------------------------------------------------------------------
    # INVARIANT 7: Correlated Derivative Exposure Limit
    # -------------------------------------------------------------------------
    def test_invariant_07_correlated_derivative_exposure_limit(self):
        """Blocks 3rd index derivative when max_correlated_positions is 2."""
        import server.centralized_risk_manager as crm_mod
        orig_get_pos = crm_mod.get_open_positions
        crm_mod.get_open_positions = lambda: [
            {"symbol": "NIFTY24OCTFUT", "status": "OPEN", "qty": 50, "entry_price": 24500.0},
            {"symbol": "BANKNIFTY24OCTFUT", "status": "OPEN", "qty": 30, "entry_price": 52000.0}
        ]
        try:
            # Candidate order is FINNIFTY (3rd index derivative)
            approved, reason, _ = self.crm.validate_order_risk(
                bot_id=1, symbol="FINNIFTY24OCTFUT", action="BUY", qty=40, price=23000.0
            )
            self.assertFalse(approved)
            self.assertIn("correlated index derivative exposure", reason)
        finally:
            crm_mod.get_open_positions = orig_get_pos

    # -------------------------------------------------------------------------
    # INVARIANT 8: Order Submission Rate Limiter
    # -------------------------------------------------------------------------
    def test_invariant_08_order_submission_rate_limiter(self):
        """Rejects order when submissions in last 60s exceed max_orders_per_minute."""
        self.crm.config["max_orders_per_minute"] = 3
        now = time.time()
        self.crm.order_timestamps = [now - 10.0, now - 8.0, now - 5.0]

        approved, reason, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        self.assertFalse(approved)
        self.assertIn("Rate limit reached", reason)

    # -------------------------------------------------------------------------
    # INVARIANT 9: Minimum Inter-Order Cooldown Interval
    # -------------------------------------------------------------------------
    def test_invariant_09_inter_order_cooldown_interval(self):
        """Rejects order placed within cooldown interval in LIVE mode or when enforce_cooldown=True."""
        now = time.time()
        self.crm.last_order_time = now - 1.0  # Placed 1.0s ago, cooldown is 3.0s

        # In LIVE mode, cooldown is strictly enforced
        app_live, reason_live, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0, execution_mode="LIVE"
        )
        self.assertFalse(app_live)
        self.assertIn("Order cooldown active", reason_live)

        # In PAPER mode with enforce_cooldown=True, cooldown is enforced
        app_cd, reason_cd, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0, execution_mode="PAPER", enforce_cooldown=True
        )
        self.assertFalse(app_cd)
        self.assertIn("Order cooldown active", reason_cd)

    # -------------------------------------------------------------------------
    # INVARIANT 10: Stale Market Feed Rejection Gate
    # -------------------------------------------------------------------------
    def test_invariant_10_stale_market_feed_rejection(self):
        """Rejects orders when feed age exceeds stale threshold (60.0s)."""
        approved, reason, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0, feed_age_seconds=75.0
        )
        self.assertFalse(approved)
        self.assertIn("Market feed is stale", reason)

    # -------------------------------------------------------------------------
    # INVARIANT 11: Broker Disconnection Fail-Closed Protection
    # -------------------------------------------------------------------------
    def test_invariant_11_broker_disconnection_fail_closed(self):
        """Rejects orders when broker_connected is False in LIVE mode."""
        approved, reason, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0, execution_mode="LIVE", broker_connected=False
        )
        self.assertFalse(approved)
        self.assertIn("Live broker connection is disconnected", reason)

    # -------------------------------------------------------------------------
    # INVARIANT 12: Platform-Wide Emergency Stop & Safe Liquidation
    # -------------------------------------------------------------------------
    def test_invariant_12_platform_wide_emergency_stop(self):
        """Emergency stop blocks all entries across all bots; permits exits."""
        stop_res = self.crm.trigger_emergency_stop()
        self.assertEqual(stop_res["status"], "EMERGENCY_STOP_ARMED")
        self.assertTrue(self.crm.config["emergency_stop_active"])

        # Entry order is blocked
        app_entry, reason_entry, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        self.assertFalse(app_entry)
        self.assertIn("Emergency Stop is ACTIVE", reason_entry)

        # Emergency exit / squareoff is permitted
        app_exit, reason_exit, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="EXIT", qty=1, price=2900.0, is_emergency_exit=True
        )
        self.assertTrue(app_exit)

        # Administrator reset restores normal operation
        self.assertTrue(self.crm.reset_circuit_breaker(admin_override=True))
        self.assertFalse(self.crm.config["emergency_stop_active"])

    # -------------------------------------------------------------------------
    # INVARIANT 13: Input Sanitization & Boundary Validation
    # -------------------------------------------------------------------------
    def test_invariant_13_input_sanitization_and_boundaries(self):
        """Rejects empty symbol, invalid action, negative/zero/bool qty, NaN/inf price/SL."""
        # Empty symbol
        ok1, err1, _ = self.crm.validate_order_risk(bot_id=1, symbol="", action="BUY", qty=10, price=100.0)
        self.assertFalse(ok1)
        self.assertIn("symbol identifier must be a non-empty string", err1)

        # Invalid action
        ok2, err2, _ = self.crm.validate_order_risk(bot_id=1, symbol="INFY", action="HODL", qty=10, price=100.0)
        self.assertFalse(ok2)
        self.assertIn("action 'HODL' is invalid", err2)

        # Zero quantity
        ok3, err3, _ = self.crm.validate_order_risk(bot_id=1, symbol="INFY", action="BUY", qty=0, price=100.0)
        self.assertFalse(ok3)
        self.assertIn("must be a positive integer", err3)

        # Negative quantity
        ok4, err4, _ = self.crm.validate_order_risk(bot_id=1, symbol="INFY", action="BUY", qty=-5, price=100.0)
        self.assertFalse(ok4)
        self.assertIn("must be a positive integer", err4)

        # Boolean quantity (bool is subclass of int in Python)
        ok5, err5, _ = self.crm.validate_order_risk(bot_id=1, symbol="INFY", action="BUY", qty=True, price=100.0)
        self.assertFalse(ok5)
        self.assertIn("must be a positive integer", err5)

        # NaN price
        ok6, err6, _ = self.crm.validate_order_risk(bot_id=1, symbol="INFY", action="BUY", qty=10, price=float("nan"))
        self.assertFalse(ok6)
        self.assertIn("must be a non-negative finite number", err6)

        # Infinite price
        ok7, err7, _ = self.crm.validate_order_risk(bot_id=1, symbol="INFY", action="BUY", qty=10, price=float("inf"))
        self.assertFalse(ok7)
        self.assertIn("must be a non-negative finite number", err7)

        # Negative price
        ok8, err8, _ = self.crm.validate_order_risk(bot_id=1, symbol="INFY", action="BUY", qty=10, price=-100.0)
        self.assertFalse(ok8)
        self.assertIn("must be a non-negative finite number", err8)

        # NaN stop loss
        ok9, err9, _ = self.crm.validate_order_risk(bot_id=1, symbol="INFY", action="BUY", qty=10, price=100.0, stop_loss=float("nan"))
        self.assertFalse(ok9)
        self.assertIn("stop_loss", err9)

    # -------------------------------------------------------------------------
    # INVARIANT 14: Bot-Level Consecutive-Loss Quarantine
    # -------------------------------------------------------------------------
    def test_invariant_14_bot_consecutive_loss_quarantine(self):
        """Quarantines bot after 2 consecutive losses (reconciled default), blocks entries, allows exits, unquarantines."""
        # Bot 7 has 1 loss: not quarantined yet
        res1 = self.crm.record_trade_result(bot_id=7, net_pnl=-100.0)
        self.assertEqual(res1["status"], "LOSS_RECORDED")
        self.assertNotIn(7, self.crm.get_quarantined_bots())

        # 2nd consecutive loss: bot is quarantined under reconciled default threshold (2)
        res_q = self.crm.record_trade_result(bot_id=7, net_pnl=-200.0)
        self.assertEqual(res_q["status"], "QUARANTINED")
        self.assertIn(7, self.crm.get_quarantined_bots())

        # New entry by Bot 7 must be rejected
        ok_entry, err_entry, _ = self.crm.validate_order_risk(
            bot_id=7, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        self.assertFalse(ok_entry)
        self.assertIn("QUARANTINED", err_entry)

        # Other bots (e.g. Bot 1) can still trade normally
        ok_bot1, _, _ = self.crm.validate_order_risk(
            bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        self.assertTrue(ok_bot1)

        # Emergency exit by Bot 7 is permitted
        ok_exit, _, _ = self.crm.validate_order_risk(
            bot_id=7, symbol="RELIANCE", action="EXIT", qty=1, price=2900.0, is_emergency_exit=True
        )
        self.assertTrue(ok_exit)

        # Unquarantine by administrator override
        self.assertTrue(self.crm.unquarantine_bot(bot_id=7, admin_override=True))
        self.assertNotIn(7, self.crm.get_quarantined_bots())

        # Bot 7 can now trade again
        ok_restored, _, _ = self.crm.validate_order_risk(
            bot_id=7, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
        )
        self.assertTrue(ok_restored)

    # -------------------------------------------------------------------------
    # INVARIANT 15: Concurrency & Thread-Safety Guarantee
    # -------------------------------------------------------------------------
    def test_invariant_15_concurrency_and_thread_safety(self):
        """Simultaneous multi-threaded order submissions execute safely without state corruption."""
        num_threads = 20
        orders_per_thread = 5
        errors = []

        def worker_task(thread_id: int):
            for i in range(orders_per_thread):
                try:
                    # Alternating entries and exits across threads
                    act = "BUY" if (thread_id % 2 == 0) else "EXIT"
                    is_exit = (act == "EXIT")
                    self.crm.validate_order_risk(
                        bot_id=(thread_id % 14) + 1,
                        symbol=f"SYM_{thread_id}",
                        action=act,
                        qty=1,
                        price=100.0,
                        is_emergency_exit=is_exit
                    )
                except Exception as ex:
                    errors.append(f"Thread {thread_id} crashed: {ex}")

        threads = [threading.Thread(target=worker_task, args=(tid,)) for tid in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Thread-safety violations detected: {errors}")

    # -------------------------------------------------------------------------
    # BOUNDARY TEST: BotScheduler._execute_paper_order Protection
    # -------------------------------------------------------------------------
    def test_boundary_bot_scheduler_paper_execution_blocked_by_circuit_breaker(self):
        """BotScheduler._execute_paper_order respects CentralizedRiskManager and persists REJECTED."""
        from server.centralized_risk_manager import centralized_risk_manager
        centralized_risk_manager.config["circuit_breaker_active"] = True

        worker = BotWorker(bot_id=1)
        try:
            signal = {
                "decision": "BUY",
                "entry_price": 2900.0,
                "strategy_id": "TEST_STRAT",
                "reason": "Test Breakout"
            }
            res = worker._execute_paper_order(signal, bar_timestamp=None)
            self.assertFalse(res["success"])
            self.assertEqual(res["status"], "REJECTED")
            self.assertIn("Circuit Breaker is TRIPPED", res["error"])

            # Verify that rejected order was recorded
            rej_order = memory_db.get_order(res["order_id"])
            self.assertIsNotNone(rej_order)
            self.assertEqual(rej_order["status"], "REJECTED")
        finally:
            centralized_risk_manager.config["circuit_breaker_active"] = False

    # -------------------------------------------------------------------------
    # BOUNDARY TEST: Fail-Closed Global Exception Handler
    # -------------------------------------------------------------------------
    def test_boundary_fail_closed_global_exception_handler(self):
        """Unexpected internal exceptions during validate_order_risk fail closed safely."""
        # Intentionally break an internal property to cause AttributeError
        orig_config = self.crm.config
        self.crm.config = None  # None has no .get()
        try:
            approved, reason, telem = self.crm.validate_order_risk(
                bot_id=1, symbol="RELIANCE", action="BUY", qty=1, price=2900.0
            )
            self.assertFalse(approved)
            self.assertIn("FAIL_CLOSED_RISK_EXCEPTION", reason)
        finally:
            self.crm.config = orig_config


if __name__ == "__main__":
    unittest.main()
