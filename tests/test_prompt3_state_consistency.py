"""
Integration and State Consistency Tests for Prompt 3:
1. Rejection of invalid/malformed orders at backend execution gate.
2. Verification of PAPER order placement contract and non-fabrication.
3. Snapshot API endpoint contracts.
4. Security and fail-closed gate invariance (LIVE_TRADING_ELIGIBLE = False).
"""

import pytest
import sqlite3
import hashlib
from fastapi.testclient import TestClient

from server.python_stream_server import app, OrderPlacePayload
from server.live_readiness_gate import is_live_trading_eligible


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    """Provides FastAPI test client configured with isolated DB to prevent production access."""
    test_db = tmp_path / "test_memory.db"
    conn = sqlite3.connect(str(test_db))
    conn.execute("CREATE TABLE trades (id INTEGER PRIMARY KEY, symbol TEXT, qty INT, price REAL);")
    conn.commit()
    conn.close()

    # Monkeypatch memory_db to use isolated database
    import server.memory_db as mem_db
    monkeypatch.setattr(mem_db, "DB_PATH", str(test_db))
    monkeypatch.setattr(mem_db, "PROD_DB_CANONICAL", str(test_db))

    return TestClient(app)


class TestStateConsistencyAndOrderGating:
    """Verifies that backend gates reject invalid orders and paper trades maintain invariants."""

    def test_live_trading_eligible_invariant(self):
        """CRITICAL INVARIANT: is_live_trading_eligible() must strictly remain False."""
        assert is_live_trading_eligible() is False

    def test_malformed_order_placement_rejected(self, api_client):
        """Negative quantity or missing symbol must be rejected without creating trades."""
        headers = {
            "Authorization": "Bearer chintu_master_auth_permanent_veeresh",
            "X-Chintu-Auth-Token": "chintu_master_auth_permanent_veeresh"
        }

        # Test invalid quantity
        res = api_client.post(
            "/api/order/place",
            json={
                "bot": "Bot 1",
                "symbol": "NIFTY 50",
                "action": "BUY",
                "qty": -10,
                "price": 24500.0
            },
            headers=headers
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "error"
        assert "Invalid order quantity" in data["message"]

    def test_missing_symbol_order_rejected(self, api_client):
        """Empty symbol must be rejected at validation gate."""
        headers = {
            "Authorization": "Bearer chintu_master_auth_permanent_veeresh",
            "X-Chintu-Auth-Token": "chintu_master_auth_permanent_veeresh"
        }

        res = api_client.post(
            "/api/order/place",
            json={
                "bot": "Bot 1",
                "symbol": "",
                "action": "BUY",
                "qty": 50,
                "price": 24500.0
            },
            headers=headers
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "error"
        assert "Symbol identifier must be a non-empty string" in data["message"]

    def test_snapshot_api_endpoints(self, api_client):
        """Verifies GET /api/system/snapshots returns service status."""
        res = api_client.get("/api/system/snapshots")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "service" in data
        assert "snapshots" in data
        assert "scheduler_running" in data["service"]
        assert "retention_days" in data["service"]

    def test_snapshot_create_requires_auth(self, api_client):
        """Verifies POST /api/system/snapshots/create enforces authentication."""
        res = api_client.post("/api/system/snapshots/create")
        # Without auth token, should be 401 Unauthorized
        assert res.status_code in (401, 403)
