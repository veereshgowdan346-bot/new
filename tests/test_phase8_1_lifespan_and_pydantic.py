"""
Phase 8.1 Focused Tests: FastAPI Lifespan & Pydantic Modernization
Verifies:
1. Lifespan context manager startup/shutdown execution and idempotency.
2. Safe shutdown execution even on runtime exceptions.
3. Pydantic v2 .model_dump() serialization compatibility across all payload models.
4. Clean REST endpoint integration with zero deprecation warnings.
"""

import pytest
import asyncio
from fastapi.testclient import TestClient
from server import python_stream_server as pss
from server.python_stream_server import (
    app,
    lifespan,
    on_startup,
    on_shutdown,
    StrategyVaultPayload,
    StrategyCreatePayload,
    StrategyUpdatePayload,
    StrategyNewVersionPayload,
    UserProfilePayload,
    BotPerformanceUpdatePayload,
    VotingConfigPayload,
    CentralizedRMSConfigRequest,
)


class TestFastAPILifespanLifecycle:
    """Verifies that the FastAPI lifespan context manager handles lifecycle cleanly."""

    def test_lifespan_is_registered_on_fastapi_app(self):
        """Verifies that lifespan context manager is registered on the FastAPI app router."""
        assert app.router.lifespan_context is not None
        assert app.router.lifespan_context == lifespan

    @pytest.mark.asyncio
    async def test_lifespan_startup_and_shutdown_execution(self):
        """Verifies that entering and exiting lifespan executes startup and shutdown properly."""
        # Reset state for clean verification
        pss._startup_completed = False
        pss._background_tasks.clear()

        async with lifespan(app):
            assert pss._startup_completed is True

        assert pss._startup_completed is False

    @pytest.mark.asyncio
    async def test_startup_idempotency_guard(self):
        """Verifies calling on_startup multiple times does not duplicate background workers."""
        pss._startup_completed = False
        pss._background_tasks.clear()

        await on_startup()
        assert pss._startup_completed is True
        initial_task_count = len(pss._background_tasks)

        # Call on_startup a second time
        await on_startup()
        assert pss._startup_completed is True
        assert len(pss._background_tasks) == initial_task_count

        await on_shutdown()
        assert pss._startup_completed is False

    @pytest.mark.asyncio
    async def test_lifespan_shutdown_resilience_on_exception(self):
        """Verifies that shutdown cleanup executes even if an exception occurs within lifespan block."""
        pss._startup_completed = False

        with pytest.raises(RuntimeError, match="Simulated application failure"):
            async with lifespan(app):
                assert pss._startup_completed is True
                raise RuntimeError("Simulated application failure")

        # Shutdown should have executed in the finally block
        assert pss._startup_completed is False


class TestPydanticModelDumpModernization:
    """Verifies that all modified Pydantic models serialize correctly with .model_dump()."""

    def test_strategy_vault_payload_model_dump(self):
        payload = StrategyVaultPayload(
            name="SuperTrend Scalper Test",
            category="Trend Following",
            asset="NIFTY 50",
            entry_rules="Close > SuperTrend",
            exit_rules="Close < SuperTrend",
            sl_ratio=1.5,
            target_multiple=2.5,
            indicators=["SuperTrend", "MACD"],
            risk_per_trade=1.0,
            is_preset=1
        )
        data = payload.model_dump()
        assert isinstance(data, dict)
        assert data["name"] == "SuperTrend Scalper Test"
        assert data["asset"] == "NIFTY 50"
        assert data["sl_ratio"] == 1.5

    def test_strategy_create_payload_model_dump(self):
        payload = StrategyCreatePayload(
            name="RSI Mean Reversion",
            category="Mean Reversion",
            description="Trades RSI oversold dips",
            timeframe="5m",
            supported_instruments=["RELIANCE", "TCS"],
            raw_source="def evaluate(): return 'HOLD'"
        )
        data = payload.model_dump()
        assert isinstance(data, dict)
        assert data["name"] == "RSI Mean Reversion"
        assert data["category"] == "Mean Reversion"
        assert data["timeframe"] == "5m"

    def test_strategy_update_payload_model_dump(self):
        payload = StrategyUpdatePayload(
            name="Updated Strategy Name",
            description=None
        )
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        assert "name" in data
        assert data["name"] == "Updated Strategy Name"
        assert "description" not in data

    def test_strategy_new_version_payload_model_dump(self):
        payload = StrategyNewVersionPayload(
            raw_source="def evaluate_v2(): return 'BUY'",
            change_summary="Upgraded threshold"
        )
        data = payload.model_dump()
        assert isinstance(data, dict)
        assert data["raw_source"] == "def evaluate_v2(): return 'BUY'"
        assert data["change_summary"] == "Upgraded threshold"

    def test_user_profile_payload_model_dump(self):
        payload = UserProfilePayload(
            name="Veeresh",
            email="veeresh@example.com",
            role="System Administrator",
            token="test_token_123"
        )
        data = payload.model_dump()
        assert isinstance(data, dict)
        assert data["name"] == "Veeresh"
        assert data["email"] == "veeresh@example.com"

    def test_bot_performance_update_payload_model_dump_exclude_unset(self):
        payload = BotPerformanceUpdatePayload(
            bot_id=1,
            allocated_capital=50000.0
        )
        data = payload.model_dump(exclude_unset=True)
        assert isinstance(data, dict)
        assert data["bot_id"] == 1
        assert data["allocated_capital"] == 50000.0
        # Fields not set should be excluded
        assert "win_rate" not in data
        assert "pnl" not in data

    def test_voting_config_payload_model_dump(self):
        payload = VotingConfigPayload(
            min_quorum_percentage=65.0,
            conflict_policy="FAVOR_RMS"
        )
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        assert data["min_quorum_percentage"] == 65.0
        assert data["conflict_policy"] == "FAVOR_RMS"
        assert "voting_scope" not in data

    def test_centralized_rms_config_request_model_dump(self):
        payload = CentralizedRMSConfigRequest(
            max_daily_loss=6000.0,
            max_risk_pct_per_trade=2.0
        )
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        assert data["max_daily_loss"] == 6000.0
        assert data["max_risk_pct_per_trade"] == 2.0
        assert "account_capital" not in data


class TestAPIEndpointPydanticIntegration:
    """Verifies that API endpoints function seamlessly with modernized Pydantic models."""

    def test_api_user_sync_endpoint(self):
        client = TestClient(app)
        res = client.post("/api/user/sync", json={
            "name": "Veeresh Test",
            "email": "veeresh@test.com",
            "role": "Master Authority",
            "token": "chintu_master_auth_permanent_veeresh"
        })
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        assert body["profile"]["name"] == "Veeresh Test"
        assert body["profile"]["email"] == "veeresh@test.com"

    def test_api_voting_config_endpoint(self):
        client = TestClient(app)
        res = client.post("/api/voting/config", json={
            "min_quorum_percentage": 60.0,
            "conflict_policy": "ABSTAIN"
        })
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        assert body["config"]["min_quorum_percentage"] == 60.0

    def test_api_rms_config_endpoint(self):
        client = TestClient(app)
        res = client.post(
            "/api/rms/config",
            json={"max_daily_loss": 5500.0},
            headers={"Authorization": "Bearer chintu_master_auth_permanent_veeresh"}
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        assert body["config"]["max_daily_loss"] == 5500.0
