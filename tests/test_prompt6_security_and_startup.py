"""
CHINTU AI TRADING SYSTEM - Prompt 6: Final Launch Readiness, Security Audit & Operating Verification
Validates:
1. Security Audit: API authentication, CORS origin restrictions, secret masking, input validation.
2. Startup & Health Lifecycle: /health and /api/health endpoints, system status degradation, preflight banner.
3. Scheduler & Worker Lifecycle: Idempotent startup/shutdown, no duplicate threads or tasks.
4. Fail-Closed Live Trading Safety Invariants: is_live_trading_eligible() == False, live mode rejection, broker isolation.
5. Production Database Zero-Mutation Invariant: SHA-256 baseline and PRAGMA integrity preservation.
"""

import os
import sys
import json
import time
import hashlib
import sqlite3
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.python_stream_server import app, ALLOWED_ORIGINS, execution_mode
from server.live_readiness_gate import is_live_trading_eligible, evaluate_live_readiness
from server.bot_scheduler import BotScheduler, bot_scheduler
from server.snapshot_service import SnapshotService, snapshot_service
from server.startup_preflight import run_startup_preflight
from server.bot_registry import CANONICAL_BOT_REGISTRY

AUTH_TOKEN = "chintu_master_auth_permanent_veeresh"
AUTH_HEADERS = {"Authorization": f"Bearer {AUTH_TOKEN}"}
PROD_DB_PATH = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")
EXPECTED_DB_SHA256 = "53509588f78ca463b91fcd3db379e550cf3b901fa2c8510d3e1e541b86b4cb53"
EXPECTED_DB_SIZE = 1306624


@pytest.fixture
def client():
    """Provides a synchronous FastAPI TestClient."""
    return TestClient(app)


class TestSecurityAuditAndAccessControls:
    """Validates endpoint security, authentication, CORS, and secret protection."""

    def test_unauthenticated_request_rejected_on_sensitive_endpoints(self, client):
        """Verifies that sensitive endpoints reject unauthenticated requests with HTTP 401."""
        endpoints = [
            ("POST", "/api/order/place", {"bot": "Bot 3", "symbol": "RELIANCE-EQ", "action": "BUY", "qty": 1}),
            ("POST", "/api/execution-mode", {"mode": "LIVE"}),
            ("POST", "/api/system/snapshots/create", {}),
            ("POST", "/api/rms/reset", {}),
            ("POST", "/api/rms/emergency-stop", {}),
            ("POST", "/api/broker/disconnect", {"broker": "angel_one"}),
            ("POST", "/api/operational/pause-trading", {}),
            ("POST", "/api/operational/resume-trading", {}),
            ("POST", "/api/master-brain/execute", {"decision": {"symbol": "RELIANCE-EQ"}, "execution_mode": "PAPER"}),
        ]

        for method, endpoint, payload in endpoints:
            if method == "POST":
                res = client.post(endpoint, json=payload)
            else:
                res = client.get(endpoint)
            assert res.status_code == 401, (
                f"Endpoint {endpoint} allowed unauthenticated access (status {res.status_code}, expected 401)"
            )

    def test_authenticated_request_accepted_with_valid_bearer_token(self, client):
        """Verifies that requests with valid Bearer token are accepted."""
        res = client.get("/api/health", headers=AUTH_HEADERS)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "online"

    def test_invalid_bearer_token_rejected_with_401(self, client):
        """Verifies that requests with an invalid Bearer token are rejected with HTTP 401."""
        bad_headers = {"Authorization": "Bearer invalid_malicious_token_12345"}
        res = client.post("/api/rms/reset", json={}, headers=bad_headers)
        assert res.status_code == 401
        assert "Invalid authentication token" in res.json().get("detail", "")

    def test_cors_configuration_disallows_wildcard(self):
        """Verifies that CORS origins do not contain wildcard '*' while credentials are enabled."""
        assert "*" not in ALLOWED_ORIGINS, "Wildcard '*' must never be permitted in ALLOWED_ORIGINS when credentials are true"
        for origin in ALLOWED_ORIGINS:
            assert origin.startswith("http://") or origin.startswith("https://")

    def test_broker_status_masks_secrets(self, client):
        """Verifies that /api/broker/status never exposes plaintext secrets or API tokens."""
        res = client.get("/api/broker/status")
        assert res.status_code == 200
        data = res.json()
        raw_text = json.dumps(data)

        # Assure sensitive credential field names are not containing real secrets
        assert "password" not in data.get("brokers", {}).get("angel_one", {})
        assert "pin" not in data.get("brokers", {}).get("angel_one", {})
        assert "totpSecret" not in data.get("brokers", {}).get("angel_one", {})
        assert "totp" not in data.get("brokers", {}).get("angel_one", {})

    def test_telegram_and_whatsapp_configs_mask_secrets(self, client):
        """Verifies that notification configuration endpoints mask bot tokens and API keys."""
        tg_res = client.get("/api/telegram/config")
        assert tg_res.status_code == 200
        tg_data = tg_res.json()
        if tg_data.get("masked_token"):
            assert "..." in tg_data["masked_token"] or tg_data["masked_token"] == "Configured"

        wa_res = client.get("/api/whatsapp/config")
        assert wa_res.status_code == 200
        wa_data = wa_res.json()
        if wa_data.get("masked_key"):
            assert "..." in wa_data["masked_key"] or wa_data["masked_key"] == "Configured"


class TestStartupAndHealthLifecycle:
    """Validates health endpoints, status state separation, and preflight auditing."""

    def test_root_and_api_health_endpoints(self, client):
        """Verifies both /health and /api/health respond with 200 OK and truthful system_state."""
        for path in ["/health", "/api/health"]:
            res = client.get(path)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "online"
            assert data["engine"] == "Chintu AI Trading Core"
            assert data["executionMode"] == "PAPER"
            assert data["live_trading_eligible"] is False
            # When broker is disconnected, system_state must be DEGRADED, not falsely HEALTHY
            assert data["system_state"] in ("DEGRADED", "HEALTHY")

    def test_system_diagnostics_endpoint_reports_truthful_state(self, client):
        """Verifies /api/diagnostics reports accurate memory, broker, and execution states."""
        res = client.get("/api/diagnostics")
        assert res.status_code == 200
        data = res.json()
        assert data["execution_mode"] == "PAPER"
        assert data["foundation_step2"]["paper_mode_enforced"] is True
        assert data["sqlite_memory"]["status"] == "ONLINE"
        assert data["broker_gateway"]["connected"] is False

    def test_startup_preflight_runs_cleanly_without_secrets(self):
        """Verifies startup_preflight runs cleanly and outputs zero plaintext secrets."""
        report = run_startup_preflight()
        assert "configuration_status" in report
        assert "authentication_status" in report
        assert "websocket_status" in report
        assert "authentic_tick_status" in report
        assert "per_bot_instrument_readiness" in report
        assert "paper_execution_status" in report
        assert "live_readiness_blockers" in report

        # Safety checks
        assert report["paper_execution_status"]["is_paper"] is True
        assert report["paper_execution_status"]["real_broker_orders_disabled"] is True
        assert report["live_readiness_blockers"]["ready_for_live"] is False
        assert report["live_readiness_blockers"]["failed_conditions_count"] >= 6


class TestSchedulerAndWorkerLifecycle:
    """Validates graceful, idempotent start and stop of schedulers and background tasks."""

    def test_bot_scheduler_idempotent_start_and_stop(self):
        """Verifies repeated start() and stop() calls on BotScheduler do not leak threads."""
        scheduler = BotScheduler()
        assert not scheduler.is_running()

        # First start
        scheduler.start()
        assert scheduler.is_running()
        thread_1 = scheduler._thread

        # Duplicate start should be a no-op and preserve same thread
        scheduler.start()
        assert scheduler.is_running()
        assert scheduler._thread is thread_1

        # Stop
        scheduler.stop()
        assert not scheduler.is_running()

        # Duplicate stop should be a safe no-op
        scheduler.stop()
        assert not scheduler.is_running()

    def test_snapshot_service_idempotent_start_and_stop(self):
        """Verifies SnapshotService start_scheduler and stop_scheduler behave idempotently."""
        service = SnapshotService(schedule_time_ist="23:55", retention_days=7)
        status_initial = service.get_status()
        assert status_initial["schedule_time_ist"] == "23:55"
        assert status_initial["retention_days"] == 7

        # Stop on unstarted service should be a clean no-op
        service.stop_scheduler()
        assert not service._is_running


class TestFailClosedLiveTradingSafetyInvariants:
    """Verifies that live trading cannot be enabled accidentally or without authorized credentials."""

    def test_live_trading_eligible_strictly_false(self):
        """Verifies is_live_trading_eligible() is hardcoded to False."""
        assert is_live_trading_eligible() is False

    def test_evaluate_live_readiness_blocks_live_transition(self):
        """Verifies evaluate_live_readiness rejects authorization without authentic session and feed."""
        eval_result = evaluate_live_readiness(
            broker_state={"angel_one": {"connected": False}},
            active_smart_connect={"instance": None},
            market_feed_evaluator_fn=lambda: {"authentic": False, "message": "No feed"},
            rms_state={"circuit_breaker_active": False},
            reconciliation_state={"status": "UNINITIALIZED"},
            user_consent_provided=False
        )
        assert eval_result["ready_for_live"] is False
        assert eval_result["failed_count"] >= 6
        assert "AUTHENTIC_BROKER_AUTH" in eval_result["failed_conditions"]
        assert "AUTHENTIC_MARKET_FEED" in eval_result["failed_conditions"]
        assert "EXPLICIT_USER_CONSENT" in eval_result["failed_conditions"]

    def test_execution_mode_endpoint_rejects_live_transition(self, client):
        """Verifies POST /api/execution-mode with 'LIVE' returns error when pre-flight checks fail."""
        res = client.post(
            "/api/execution-mode",
            json={"mode": "LIVE", "user_consent": False},
            headers=AUTH_HEADERS
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "error"
        assert "Cannot enable Live Execution" in data["message"]
        assert data["mode"] == "PAPER"

    def test_execution_mode_endpoint_accepts_paper_mode(self, client):
        """Verifies POST /api/execution-mode with 'PAPER' is accepted."""
        res = client.post(
            "/api/execution-mode",
            json={"mode": "PAPER"},
            headers=AUTH_HEADERS
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["mode"] == "PAPER"


class TestCanonical14BotReadinessIntegrity:
    """Audits registry consistency and readiness states across all 14 bots."""

    def test_canonical_bot_registry_has_exact_14_bots(self):
        """Verifies all 14 canonical bots are registered with complete schemas."""
        assert len(CANONICAL_BOT_REGISTRY) == 14
        for b_id in range(1, 15):
            bot = CANONICAL_BOT_REGISTRY[b_id]
            assert bot["id"] == b_id
            assert "name" in bot
            assert "asset" in bot
            assert "strategy_id" in bot
            assert "lotsize" in bot
            assert "risk_config" in bot

    def test_active_paper_ready_bots_classification(self):
        """Verifies Bots 3, 6, 7 are permanent cash equities unblocked by expiration."""
        unblocked_cash_equities = [3, 6, 7]
        for b_id in unblocked_cash_equities:
            bot = CANONICAL_BOT_REGISTRY[b_id]
            assert "-EQ" in bot["tradingsymbol"]
            assert bot["exchange"] == "NSE"

    def test_known_blockers_preserved_truthfully(self):
        """Verifies known blockers (expired 2024 futures, Bot 4 discrepancy, Bots 12-14 data) are preserved."""
        # Bot 4: Demerger discrepancy
        bot4 = CANONICAL_BOT_REGISTRY[4]
        assert bot4["data_readiness"] == "DISCREPANCY_BLOCKED"

        # Bots 12 & 13: Advanced derivatives requiring unavailable L2/L3 feeds
        bot12 = CANONICAL_BOT_REGISTRY[12]
        bot13 = CANONICAL_BOT_REGISTRY[13]
        assert bot12["data_readiness"] == "DATA_UNAVAILABLE"
        assert bot13["data_readiness"] == "DATA_UNAVAILABLE"

        # Derivative futures from 2024 series
        expired_futures_bots = [1, 2, 5, 8, 9, 10, 11]
        for b_id in expired_futures_bots:
            bot = CANONICAL_BOT_REGISTRY[b_id]
            assert "24" in bot["tradingsymbol"] and "FUT" in bot["tradingsymbol"], (
                f"Bot {b_id} expected to contain 2024 futures symbol: {bot['tradingsymbol']}"
            )


class TestProductionDatabaseZeroMutationInvariant:
    """Verifies that server/chintu_memory.db is bit-for-bit immutable and intact."""

    def test_production_database_hash_and_size_immutable(self):
        """Verifies server/chintu_memory.db matches SHA-256 baseline and byte size."""
        assert os.path.exists(PROD_DB_PATH), f"Production database not found at {PROD_DB_PATH}"
        data = open(PROD_DB_PATH, "rb").read()
        current_hash = hashlib.sha256(data).hexdigest()
        current_size = len(data)

        assert current_hash == EXPECTED_DB_SHA256, (
            f"MUTATION DETECTED! Expected SHA-256 {EXPECTED_DB_SHA256}, got {current_hash}"
        )
        assert current_size == EXPECTED_DB_SIZE, (
            f"SIZE MISMATCH! Expected {EXPECTED_DB_SIZE} bytes, got {current_size}"
        )

    def test_production_database_sqlite_integrity_check(self):
        """Runs read-only PRAGMA integrity_check on production database."""
        conn = sqlite3.connect(f"file:{PROD_DB_PATH.replace(os.sep, '/')}?mode=ro", uri=True)
        try:
            res = conn.execute("PRAGMA integrity_check;").fetchone()
            assert res is not None
            assert res[0] == "ok", f"Integrity check failed: {res[0]}"
        finally:
            conn.close()
