"""
CHINTU AI TRADING SYSTEM - Shared Bot Strategy Integration Test Suite
Verifies that all 14 bots access the central Strategy Library, execute custom or canonical
strategies in sandboxed isolation, track immutable versions, and fail closed when dependencies are missing.
"""

import pytest
import time
import server.memory_db as memory_db
from server.strategy_engine import evaluate_bot_strategy
from server.bot_scheduler import BotScheduler, BotWorker
from server.bot_registry import CANONICAL_BOT_REGISTRY


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    memory_db.init_db()


class TestSharedBotStrategyIntegration:
    """Tests shared Strategy Library integration across all 14 bots."""

    def test_all_14_bots_have_valid_strategy_allocations(self):
        """Verifies every bot (1 to 14) has an active allocation linked to a valid strategy."""
        for b_id in range(1, 15):
            alloc = memory_db.get_bot_strategy(b_id)
            assert alloc is not None, f"Bot #{b_id} missing strategy allocation"
            assert alloc["is_active"] == 1
            assert alloc["strategy_id"] is not None
            assert alloc["version"] is not None

            # Verify strategy exists in library
            strat = memory_db.get_strategy_by_id(alloc["strategy_id"])
            assert strat is not None, f"Strategy {alloc['strategy_id']} not found in library"

    def test_custom_strategy_sandboxed_execution_on_bot(self):
        """Verifies that publishing a custom Python strategy to Bot 2 executes it sandboxed."""
        custom_strat_id = f"strat_custom_bot2_{int(time.time()*1000)}"
        code = """
def evaluate(market_data):
    candles = market_data.get('candles', [])
    return {
        'decision': 'BUY',
        'reason': 'Custom momentum surge verified',
        'indicators': {'custom_factor': 42.0},
        'confidence': 0.92
    }
"""
        # Create and publish to Bot 2
        memory_db.create_strategy({
            "id": custom_strat_id,
            "name": "Bot 2 Custom Momentum",
            "category": "Momentum",
            "source_format": "PYTHON",
            "raw_source": code,
            "status": "Approved"
        })
        memory_db.publish_strategy_to_bots(custom_strat_id, "v1.0.0", [2])

        # Evaluate Bot 2
        sample_candles = [
            {"timestamp": f"2026-10-17T09:{i:02d}:00", "open": 52000, "high": 52100, "low": 51950, "close": 52050, "volume": 500}
            for i in range(40)
        ]
        res = evaluate_bot_strategy(2, {"candles": sample_candles, "symbol": "BANKNIFTY"})

        assert res["decision"] == "BUY"
        assert res["reason"] == "Custom momentum surge verified"
        assert res["strategy_id"] == custom_strat_id
        assert res["strategy_version"] == "v1.0.0"
        assert res["indicators"].get("custom_factor") == 42.0

        # Revert Bot 2 back to canonical
        memory_db.publish_strategy_to_bots("strat_canonical_2", "v1.0.0", [2])
        reverted_alloc = memory_db.get_bot_strategy(2)
        assert reverted_alloc["strategy_id"] == "strat_canonical_2"

    def test_missing_data_dependency_fails_closed(self):
        """Verifies that Bot 12 (Options Gamma) fails closed with DATA_UNAVAILABLE when Greeks feed is missing."""
        sample_candles = [
            {"timestamp": f"2026-10-17T09:{i:02d}:00", "open": 24000, "high": 24050, "low": 23950, "close": 24020, "volume": 1000}
            for i in range(35)
        ]
        # Evaluate Bot 12 without option_greeks in market_data
        res = evaluate_bot_strategy(12, {"candles": sample_candles, "symbol": "NIFTY OPTIONS"})

        assert res["status"] == "DATA_UNAVAILABLE"
        assert res["decision"] == "NO_TRADE"
        assert "option chain Greeks" in res["reason"]

    def test_bot_worker_retains_independent_health_and_deduplication(self):
        """Verifies BotWorker preserves its individual execution metrics and bar deduplication."""
        worker = BotWorker(1)

        # Ingest 35 candles
        now_ts = int(time.time())
        for i in range(35):
            worker.ingest_candle({
                "timestamp": f"2026-10-17T09:{i:02d}:00",
                "open": 24000 + i,
                "high": 24020 + i,
                "low": 23990 + i,
                "close": 24010 + i,
                "volume": 2000
            }, is_authentic=True)

        worker.last_tick_time = time.time()
        worker.check_health()
        assert worker.data_healthy is True

        # First evaluation
        sig1 = worker.evaluate(execute_paper=False)
        assert sig1["bot_id"] == 1
        assert sig1["status"] in ["DATA_READY", "NO_TRADE"]

        # Duplicate evaluation on same bar timestamp suppresses order
        if sig1["decision"] in ["BUY", "SELL", "EXIT"]:
            sig2 = worker.evaluate(execute_paper=False)
            assert sig2["status"] == "DUPLICATE_SUPPRESSED"

    def test_unapproved_or_invalid_strategy_publishing_blocked(self):
        """Verifies that publishing a strategy with security/validation errors is rejected by the database."""
        invalid_strat_id = f"strat_malicious_{int(time.time()*1000)}"
        bad_code = """
import os
def evaluate(m):
    os.system('dir')
    return {'decision': 'BUY'}
"""
        memory_db.create_strategy({
            "id": invalid_strat_id,
            "name": "Malicious Strategy Attempt",
            "category": "Exploit",
            "source_format": "PYTHON",
            "raw_source": bad_code,
            "status": "Draft"
        })

        # Attempting to publish must fail validation gate
        with pytest.raises(ValueError, match="Validation failed with errors"):
            memory_db.publish_strategy_to_bots(invalid_strat_id, "v1.0.0", [3])

    def test_draft_strategy_blocked_from_generating_trades(self):
        """Verifies that Draft strategies allocated to a bot fail-safe with NO_TRADE and UNAPPROVED_STRATEGY."""
        draft_strat_id = f"strat_draft_{int(time.time()*1000)}"
        valid_code = "def evaluate(m): return {'decision': 'BUY', 'confidence': 0.9}"
        memory_db.create_strategy({
            "id": draft_strat_id,
            "name": "Draft Strategy Test",
            "category": "Momentum",
            "source_format": "PYTHON",
            "raw_source": valid_code,
            "status": "Draft"
        })

        # Directly allocate in database without publishing/approving
        conn = memory_db.get_connection()
        with conn:
            conn.execute("""
            INSERT OR REPLACE INTO strategy_bot_allocations (bot_id, strategy_id, version, is_active, allocated_by, allocated_at, notes)
            VALUES (4, ?, 'v1.0.0', 1, 'ManualInject', '2026-10-17T09:00:00', 'Unapproved injection')
            """, (draft_strat_id,))
        conn.close()

        sample_candles = [
            {"timestamp": f"2026-10-17T09:{i:02d}:00", "open": 24000, "high": 24050, "low": 23950, "close": 24020, "volume": 1000}
            for i in range(35)
        ]
        res = evaluate_bot_strategy(4, {"candles": sample_candles, "symbol": "TATAMOTORS-EQ"})

        # Must be blocked
        assert res["decision"] == "NO_TRADE"
        assert res["status"] == "UNAPPROVED_STRATEGY"
        assert "Draft" in res["reason"]

        # Restore Bot 4 canonical allocation
        memory_db.publish_strategy_to_bots("strat_canonical_4", "v1.0.0", [4])

