"""
CHINTU AI TRADING SYSTEM - Strategy Library & Versioning Test Suite
Verifies persistent SQLite storage, immutable versioning, rollback, duplicate, archive,
bot allocations, and REST API endpoints.
"""

import pytest
import json
import time
from fastapi.testclient import TestClient

import server.memory_db as memory_db
from server.python_stream_server import app


@pytest.fixture(scope="module")
def client():
    memory_db.init_db()
    with TestClient(app) as c:
        yield c


class TestStrategyLibraryPersistence:
    """Tests SQLite persistence, versioning, and lifecycle for shared Strategy Library."""

    def test_canonical_bot_strategies_seeded(self):
        """Verifies that all 14 canonical bots have published strategies seeded on startup."""
        strats = memory_db.list_strategies()
        assert len(strats) >= 14
        canonical_ids = [s["id"] for s in strats if s["id"].startswith("strat_canonical_")]
        assert len(canonical_ids) == 14

        # Check allocations
        allocs = memory_db.get_bot_strategy_allocations()
        assert len(allocs) == 14
        for a in allocs:
            assert a["bot_id"] in range(1, 15)
            assert a["strategy_id"].startswith("strat_canonical_")
            assert a["is_active"] == 1

    def test_create_custom_strategy(self):
        """Verifies creation of custom strategy with initial v1.0.0 version and audit trail."""
        strat_id = f"strat_test_persist_{int(time.time()*1000)}"
        created_id = memory_db.create_strategy({
            "id": strat_id,
            "name": "Test Breakout Alpha",
            "category": "Breakout",
            "description": "20-period breakout with volume filter",
            "source_format": "PYTHON",
            "status": "Draft",
            "timeframe": "15m",
            "supported_instruments": ["NIFTY 50", "RELIANCE"],
            "raw_source": "def evaluate(m): return {'decision': 'HOLD'}",
            "entry_rules": "Breakout of 20-period high",
            "exit_rules": "Trailing stop 1.0%"
        }, operator="TestRunner")

        assert created_id == strat_id

        # Verify retrieved details
        detail = memory_db.get_strategy_by_id(strat_id)
        assert detail is not None
        assert detail["name"] == "Test Breakout Alpha"
        assert detail["active_version"] == "v1.0.0"
        assert detail["status"] == "Draft"
        assert len(detail["versions"]) == 1
        assert detail["versions"][0]["version"] == "v1.0.0"

        # Verify audit trail
        assert len(detail["audit_trail"]) >= 1
        assert detail["audit_trail"][0]["event_type"] == "CREATED"

    def test_update_strategy_metadata(self):
        """Verifies updating mutable fields of a strategy."""
        strat_id = f"strat_test_update_{int(time.time()*1000)}"
        memory_db.create_strategy({
            "id": strat_id,
            "name": "Initial Name",
            "category": "Momentum",
            "source_format": "STRUCTURED"
        })

        success = memory_db.update_strategy(strat_id, {
            "name": "Updated Strategy Name",
            "category": "Trend Following",
            "status": "Approved"
        })
        assert success is True

        updated = memory_db.get_strategy_by_id(strat_id)
        assert updated["name"] == "Updated Strategy Name"
        assert updated["category"] == "Trend Following"
        assert updated["status"] == "Approved"

    def test_version_creation_and_rollback(self):
        """Verifies creating v1.1.0, activating it, and rolling back to v1.0.0."""
        strat_id = f"strat_test_ver_{int(time.time()*1000)}"
        memory_db.create_strategy({
            "id": strat_id,
            "name": "Versioning Strategy",
            "category": "Mean Reversion",
            "raw_source": "# v1.0.0 logic"
        })

        # Create v1.1.0
        v1_1 = memory_db.create_strategy_version(strat_id, {
            "version": "v1.1.0",
            "raw_source": "# v1.1.0 improved logic",
            "change_summary": "Added volume confirmation",
            "activate_now": True
        })
        assert v1_1 == "v1.1.0"

        detail_v1_1 = memory_db.get_strategy_by_id(strat_id)
        assert detail_v1_1["active_version"] == "v1.1.0"
        assert len(detail_v1_1["versions"]) == 2

        # Rollback to v1.0.0
        rolled_back = memory_db.rollback_strategy_version(strat_id, "v1.0.0")
        assert rolled_back is True

        detail_rolled = memory_db.get_strategy_by_id(strat_id)
        assert detail_rolled["active_version"] == "v1.0.0"

    def test_duplicate_strategy(self):
        """Verifies cloning a strategy creates an independent Draft copy."""
        strat_id = f"strat_test_orig_{int(time.time()*1000)}"
        memory_db.create_strategy({
            "id": strat_id,
            "name": "Original Alpha",
            "category": "Scalper",
            "raw_source": "# code"
        })

        clone_id = memory_db.duplicate_strategy(strat_id, new_name="Cloned Alpha")
        assert clone_id != strat_id

        cloned = memory_db.get_strategy_by_id(clone_id)
        assert cloned["name"] == "Cloned Alpha"
        assert cloned["status"] == "Draft"
        assert cloned["active_version"] == "v1.0.0"

    def test_archive_strategy_deactivates_allocations(self):
        """Verifies archiving a strategy sets status to Archived and deactivates bot allocations."""
        strat_id = f"strat_test_arch_{int(time.time()*1000)}"
        memory_db.create_strategy({
            "id": strat_id,
            "name": "To Archive",
            "status": "Approved"
        })
        # Publish to Bot 5
        memory_db.publish_strategy_to_bots(strat_id, "v1.0.0", [5])

        # Verify active allocation
        alloc_before = memory_db.get_bot_strategy(5)
        assert alloc_before is not None
        assert alloc_before["strategy_id"] == strat_id

        # Archive strategy
        archived = memory_db.archive_strategy(strat_id)
        assert archived is True

        detail = memory_db.get_strategy_by_id(strat_id)
        assert detail["status"] == "Archived"

        # Verify Bot 5 is no longer active with this strategy
        alloc_after = memory_db.get_bot_strategy(5)
        assert alloc_after is None or alloc_after["strategy_id"] != strat_id

        # Re-link Bot 5 to canonical
        memory_db.publish_strategy_to_bots("strat_canonical_5", "v1.0.0", [5])


class TestStrategyLibraryRESTAPI:
    """Tests FastAPI HTTP REST endpoints for the Strategy Library."""

    def test_api_list_strategies(self, client):
        res = client.get("/api/strategies/library")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert len(data["strategies"]) >= 14

    def test_api_get_strategy_detail(self, client):
        res = client.get("/api/strategies/library/strat_canonical_1")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["strategy"]["id"] == "strat_canonical_1"
        assert data["strategy"]["name"] == "SuperTrend (10,2) + Volume-Weighted MACD Scalper"

    def test_api_validate_strategy_python(self, client):
        code = """
def evaluate(market_data):
    closes = [c['close'] for c in market_data.get('candles', [])]
    rsi = calculate_rsi(closes, 14)
    if rsi < 30:
        return {'decision': 'BUY', 'reason': 'RSI oversold', 'indicators': {'rsi': rsi}, 'confidence': 0.8}
    return {'decision': 'HOLD', 'reason': 'Neutral', 'indicators': {'rsi': rsi}, 'confidence': 0.5}
"""
        res = client.post("/api/strategies/validate", json={
            "raw_content": code,
            "source_format": "PYTHON",
            "metadata": {"name": "Test RSI Strategy"}
        })
        assert res.status_code == 200
        data = res.json()
        assert data["report"]["is_valid"] is True
        assert data["report"]["score"] >= 90.0

    def test_api_create_and_publish_strategy(self, client):
        strat_id = f"strat_api_test_{int(time.time()*1000)}"
        # 1. Create
        create_res = client.post("/api/strategies/library", json={
            "id": strat_id,
            "name": "API Published Strategy",
            "category": "Momentum",
            "source_format": "STRUCTURED",
            "status": "Approved",
            "entry_rules": "API entry rules",
            "exit_rules": "API exit rules"
        })
        assert create_res.status_code == 200

        # 2. Publish to Bot 7
        pub_res = client.post(f"/api/strategies/library/{strat_id}/publish", json={
            "version": "v1.0.0",
            "bot_ids": [7]
        })
        assert pub_res.status_code == 200
        pub_data = pub_res.json()
        assert pub_data["status"] == "success"
        assert 7 in pub_data["allocated_bots"]

        # 3. Check bot allocation
        alloc_res = client.get("/api/strategies/bot-allocations")
        assert alloc_res.status_code == 200
        allocs = alloc_res.json()["allocations"]
        bot7 = next((a for a in allocs if a["bot_id"] == 7), None)
        assert bot7 is not None
        assert bot7["strategy_id"] == strat_id

        # Clean up: restore Bot 7 to canonical
        client.post("/api/strategies/library/strat_canonical_7/publish", json={
            "version": "v1.0.0",
            "bot_ids": [7]
        })

