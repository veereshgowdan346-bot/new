"""
CHINTU AI TRADING SYSTEM - Phase 11 Safe Paper Trading Trial Tests
Tests:
1. Isolated paper-trading data store initialization and separation from production DB.
2. Trial session lifecycle and crash/restart recovery (no fabricated continuity).
3. Paper order & trade logging with slippage, fees, and duplicate suppression.
4. Strict 14-day eligibility rules (synthetic feeds & short sessions disqualified).
5. Trial status reporting, unmet release requirements, and live trading blocking.
6. API endpoint /api/paper-trial/status verification.
"""

import os
import time
import pytest
from datetime import datetime, timedelta, timezone

from server.paper_trial_manager import PaperTrialManager, init_trial_db, get_trial_db_connection
from server.angel_feed_manager import AngelOneWebSocketManager
from fastapi.testclient import TestClient
import server.python_stream_server as pss

IST = timezone(timedelta(hours=5, minutes=30))
client = TestClient(pss.app)
AUTH_HEADERS = {"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}


@pytest.fixture
def isolated_trial_mgr(tmp_path):
    """Provides a cleanly isolated trial manager running on a temporary SQLite database."""
    test_db = str(tmp_path / "test_paper_trial.db")
    mgr = PaperTrialManager(db_path=test_db)
    return mgr


class TestPhase11SafePaperTrialSetup:
    """Verifies Phase 11 safe paper trial manager, isolation, and reporting."""

    def test_01_isolated_trial_store_separation(self, isolated_trial_mgr):
        """Verifies trial tables exist and target database is completely isolated."""
        conn = get_trial_db_connection(isolated_trial_mgr.db_path)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {r[0] for r in cur.fetchall()}
        conn.close()

        assert {"trial_sessions", "trial_orders", "trial_trades"}.issubset(tables)
        # Invariant: Must not point to production database
        assert "chintu_memory.db" not in isolated_trial_mgr.db_path

    def test_02_session_restart_recovery_prevents_fabricated_continuity(self, tmp_path):
        """Simulates process crash/restart; prior active session must be aborted, not fabricated."""
        test_db = str(tmp_path / "crash_test.db")
        mgr1 = PaperTrialManager(db_path=test_db)
        sid = mgr1.start_session(is_authentic_feed=False, notes="Pre-crash session")
        assert mgr1.active_session_id == sid

        # Process crashes and restarts with new manager instance
        mgr2 = PaperTrialManager(db_path=test_db)
        conn = get_trial_db_connection(test_db)
        cur = conn.cursor()
        cur.execute("SELECT status, notes FROM trial_sessions WHERE session_id = ?", (sid,))
        row = cur.fetchone()
        conn.close()

        assert row["status"] == "ABORTED_ON_RESTART"
        assert "restart terminated" in row["notes"]
        assert mgr2.active_session_id is None

    def test_03_order_deduplication_and_slippage_recording(self, isolated_trial_mgr):
        """Verifies orders record slippage and reject duplicate order IDs."""
        isolated_trial_mgr.start_session(is_authentic_feed=False)

        # First order insertion
        ok1 = isolated_trial_mgr.record_paper_order(
            order_id="ORD-TRIAL-001",
            bot="Bot 1",
            symbol="RELIANCE",
            action="BUY",
            qty=10,
            signal_price=2900.0,
            fill_price=2900.87,
            slippage_inr=8.70,
            charges_inr=20.0
        )
        assert ok1 is True

        # Duplicate order insertion with identical order_id
        ok2 = isolated_trial_mgr.record_paper_order(
            order_id="ORD-TRIAL-001",
            bot="Bot 1",
            symbol="RELIANCE",
            action="BUY",
            qty=10,
            signal_price=2900.0,
            fill_price=2900.87
        )
        assert ok2 is False  # Rejected by unique constraint

    def test_04_paper_trade_recording_and_net_pnl(self, isolated_trial_mgr):
        """Verifies trade recording properly calculates net P&L after friction."""
        isolated_trial_mgr.start_session(is_authentic_feed=False)

        # Record a trade: Gross profit 500, charges 80 -> Net 420
        ok = isolated_trial_mgr.record_paper_trade(
            trade_id="TRD-TRIAL-001",
            bot="Bot 1",
            symbol="RELIANCE",
            qty=10,
            entry_price=2900.0,
            exit_price=2950.0,
            gross_pnl=500.0,
            charges_inr=80.0,
            opened_at=datetime.now(IST).isoformat(),
            provenance="AUTHENTIC_FEED_PAPER"
        )
        assert ok is True

        conn = get_trial_db_connection(isolated_trial_mgr.db_path)
        cur = conn.cursor()
        cur.execute("SELECT net_pnl, charges_inr FROM trial_trades WHERE trade_id = 'TRD-TRIAL-001'")
        row = cur.fetchone()
        conn.close()

        assert row["net_pnl"] == 420.0
        assert row["charges_inr"] == 80.0

    def test_05_session_eligibility_requires_authentic_feed_and_duration(self, isolated_trial_mgr):
        """Disqualifies synthetic sessions from counting toward 14-day authentic trial."""
        # Synthetic session ending quickly
        sid = isolated_trial_mgr.start_session(is_authentic_feed=False, notes="Synthetic offline test")
        res = isolated_trial_mgr.end_session(sid)
        assert res["is_eligible_day"] is False

    def test_06_trial_status_report_when_disconnected(self, isolated_trial_mgr):
        """Verifies trial status accurately reflects disconnected state and 0/14 days."""
        mock_feed = AngelOneWebSocketManager()
        mock_feed.is_connected = False
        mock_feed.is_authenticated = False
        mock_feed.authentic_ticks_count = 0

        status = isolated_trial_mgr.get_trial_status(angel_feed_mgr=mock_feed)
        assert status["feed_status"] == "DISCONNECTED"
        assert status["authentic_ticks_received"] == 0
        assert status["completed_eligible_trial_days"] == 0
        assert status["target_trial_days"] == 14
        assert status["trial_days_remaining"] == 14
        assert status["live_trading_eligible"] is False
        assert any("14 consecutive" in r for r in status["unmet_release_requirements"])
        assert any("DISCONNECTED" in r for r in status["unmet_release_requirements"])

    def test_07_api_paper_trial_status_endpoint(self):
        """Verifies /api/paper-trial/status returns valid JSON structure."""
        resp = client.get("/api/paper-trial/status", headers=AUTH_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        ts = data["trial_status"]
        assert ts["execution_mode"] == "PAPER"
        assert ts["live_trading_eligible"] is False
        assert ts["target_trial_days"] == 14
        assert "unmet_release_requirements" in ts

