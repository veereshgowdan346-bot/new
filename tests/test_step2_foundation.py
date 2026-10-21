"""
CHINTU AI TRADING SYSTEM - Step 2 Foundation, Resource Budgeting & Message Bus Test Suite
Verifies:
1. CandleBuffer data structure correctness (capacity, eviction, indexing, slicing, list compatibility).
2. BotWorker circular ring buffer integration.
3. Strategy output deterministic invariance between list and CandleBuffer.
4. ProcessManager resource diagnostics, core validation, and strict REALTIME priority proscription.
5. MessageBus pub-sub, wildcard routing, ordering, callback failure isolation, lossy overflow, and critical delivery.
6. RedisMessageBusAdapter graceful fallback when Redis is absent.
7. PAPER mode and Risk Guardian safety invariant preservation.
"""

import time
import copy
import pytest
import threading
from collections import deque
from typing import List, Dict, Any

from server.bot_scheduler import CandleBuffer, BotWorker, MAX_CANDLE_BUFFER
from server.strategy_engine import evaluate_strategy
from server.process_manager import (
    get_system_cpu_info,
    get_process_diagnostics,
    validate_cpu_cores,
    configure_process_priority,
    configure_process_affinity,
    revert_process_controls,
    PRIORITY_NAME_MAP
)
from server.message_bus import (
    InMemoryMessageBus,
    RedisMessageBusAdapter,
    Event,
    EventPriority,
    get_message_bus,
    reset_message_bus
)
from server.centralized_risk_manager import CentralizedRiskManager, get_centralized_rms_config


# =====================================================================
# 1. CANDLE BUFFER DATA STRUCTURE TESTS
# =====================================================================

class TestCandleBufferDataStructure:

    def test_candle_buffer_capacity_and_eviction(self):
        """Verify bounded deque automatically evicts oldest items in O(1) time when capacity is reached."""
        buf = CandleBuffer(maxlen=5)
        for i in range(10):
            buf.append({"bar": i, "price": 100.0 + i})

        assert len(buf) == 5
        # The first 5 bars (0..4) should have been evicted; bars 5..9 remain
        assert buf[0]["bar"] == 5
        assert buf[-1]["bar"] == 9

    def test_candle_buffer_chronological_ordering(self):
        """Verify that items in CandleBuffer preserve strict chronological FIFO order."""
        buf = CandleBuffer(maxlen=200)
        for i in range(150):
            buf.append({"t": i, "c": 1000 + i})

        assert len(buf) == 150
        assert buf[0]["t"] == 0
        assert buf[-1]["t"] == 149

        # Adding 100 more items causes 50 evictions
        for i in range(150, 250):
            buf.append({"t": i, "c": 1000 + i})

        assert len(buf) == 200
        assert buf[0]["t"] == 50
        assert buf[-1]["t"] == 249

    def test_candle_buffer_indexing_and_slicing(self):
        """Verify integer indexing, negative indexing, and slicing return standard lists."""
        buf = CandleBuffer(maxlen=10)
        for i in range(10):
            buf.append({"idx": i})

        assert buf[0]["idx"] == 0
        assert buf[-1]["idx"] == 9
        assert buf[4]["idx"] == 4

        # Slicing
        slice_last_3 = buf[-3:]
        assert isinstance(slice_last_3, list)
        assert len(slice_last_3) == 3
        assert [x["idx"] for x in slice_last_3] == [7, 8, 9]

        slice_first_4 = buf[:4]
        assert isinstance(slice_first_4, list)
        assert len(slice_first_4) == 4
        assert [x["idx"] for x in slice_first_4] == [0, 1, 2, 3]

    def test_candle_buffer_list_subclass_compatibility(self):
        """Verify CandleBuffer is an instance of list and supports list protocols."""
        buf = CandleBuffer(maxlen=50)
        assert isinstance(buf, list)
        buf.extend([{"bar": 1}, {"bar": 2}])
        assert len(buf) == 2

        # Iteration
        items = [x["bar"] for x in buf]
        assert items == [1, 2]

        # In-place update
        buf[0] = {"bar": 100}
        assert buf[0]["bar"] == 100

        # Copy
        buf_copy = copy.copy(buf)
        assert isinstance(buf_copy, CandleBuffer)
        assert buf_copy == buf

        # Deepcopy
        buf_deep = copy.deepcopy(buf)
        assert isinstance(buf_deep, CandleBuffer)
        assert buf_deep == buf

    def test_candle_buffer_pop_operations(self):
        """Verify pop(0) delegates to popleft O(1) and pop() removes from tail."""
        buf = CandleBuffer(maxlen=10)
        for i in range(5):
            buf.append({"i": i})

        oldest = buf.pop(0)
        assert oldest["i"] == 0
        assert len(buf) == 4
        assert buf[0]["i"] == 1

        newest = buf.pop(-1)
        assert newest["i"] == 4
        assert len(buf) == 3
        assert buf[-1]["i"] == 3

        direct_left = buf.popleft()
        assert direct_left["i"] == 1
        assert len(buf) == 2

    def test_candle_buffer_empty_state_and_clear(self):
        """Verify empty buffer behavior and clear()."""
        buf = CandleBuffer(maxlen=10)
        assert len(buf) == 0
        assert bool(buf) is False
        assert list(buf) == []

        buf.append({"test": 1})
        assert bool(buf) is True
        buf.clear()
        assert len(buf) == 0
        assert bool(buf) is False


# =====================================================================
# 2. BOT WORKER INTEGRATION & STRATEGY INVARIANCE
# =====================================================================

class TestBotWorkerAndStrategyInvariance:

    def test_bot_worker_initializes_with_candle_buffer(self):
        """Verify BotWorker initializes self.candles as CandleBuffer with maxlen=200."""
        worker = BotWorker(1)
        assert isinstance(worker.candles, CandleBuffer)
        assert worker.candles.maxlen == MAX_CANDLE_BUFFER
        assert len(worker.candles) == 0

    def test_bot_worker_property_setter_wraps_raw_lists(self):
        """Verify assigning worker.candles = [...] automatically wraps into CandleBuffer."""
        worker = BotWorker(1)
        raw_list = [{"timestamp": f"2026-10-18 09:{i:02d}:00", "close": 24000 + i} for i in range(10)]
        worker.candles = raw_list

        assert isinstance(worker.candles, CandleBuffer)
        assert len(worker.candles) == 10
        assert worker.candles[-1]["close"] == 24009

    def test_bot_worker_ingest_candle_eviction_bounded(self):
        """Verify ingesting >200 candles bounds the buffer and preserves freshness."""
        worker = BotWorker(1)
        for i in range(250):
            candle = {
                "timestamp": f"2026-10-18 09:{(i % 60):02d}:{i // 60:02d}",
                "open": 24000.0,
                "high": 24050.0,
                "low": 23950.0,
                "close": 24000.0 + i,
                "volume": 100.0
            }
            res = worker.ingest_candle(candle, is_authentic=True, is_replay=True)
            assert res is True

        assert len(worker.candles) == MAX_CANDLE_BUFFER
        assert worker.candles.maxlen == MAX_CANDLE_BUFFER
        assert worker.strategy_ready is True

    def test_strategy_outputs_identical_between_list_and_candle_buffer(self):
        """Verify evaluate_strategy produces identical results whether fed list or CandleBuffer."""
        raw_candles = []
        for i in range(60):
            price = 24000.0 + (i * 2.5) if i < 30 else 24075.0 - ((i - 30) * 1.5)
            raw_candles.append({
                "timestamp": f"2026-10-18 09:{i:02d}:00",
                "open": price - 1.0,
                "high": price + 5.0,
                "low": price - 5.0,
                "close": price,
                "volume": 500.0 + (i * 10)
            })

        candle_buf = CandleBuffer(raw_candles, maxlen=MAX_CANDLE_BUFFER)

        # Test across canonical bots 1, 2, 3, 4
        for bot_id in [1, 2, 3, 4]:
            out_list = evaluate_strategy(bot_id, {"candles": raw_candles, "position_side": None})
            out_buf = evaluate_strategy(bot_id, {"candles": candle_buf, "position_side": None})

            assert out_list["decision"] == out_buf["decision"], f"Decision mismatch for bot {bot_id}"
            assert out_list.get("confidence") == out_buf.get("confidence"), f"Confidence mismatch for bot {bot_id}"
            assert out_list.get("indicators") == out_buf.get("indicators"), f"Indicators mismatch for bot {bot_id}"


# =====================================================================
# 3. PROCESS & RESOURCE OBSERVABILITY TESTS
# =====================================================================

class TestProcessManagerObservability:

    def test_system_cpu_info(self):
        """Verify get_system_cpu_info returns valid platform and CPU topology."""
        info = get_system_cpu_info()
        assert info["platform"] in ["Windows", "Linux", "Darwin"]
        assert info["logical_cpus"] >= 1
        assert isinstance(info["architecture"], str)
        assert info["psutil_available"] is True

    def test_process_diagnostics_structure(self):
        """Verify get_process_diagnostics returns healthy metrics on current process."""
        diag = get_process_diagnostics()
        assert diag["status"] == "HEALTHY"
        assert diag["pid"] > 0
        assert diag["process_priority"] in list(PRIORITY_NAME_MAP.keys()) or "WIN_" in diag["process_priority"]
        assert isinstance(diag["cpu_affinity"], list)
        assert len(diag["cpu_affinity"]) >= 1
        assert diag["memory_rss_mb"] is not None and diag["memory_rss_mb"] > 0

    def test_validate_cpu_cores(self):
        """Verify core validation rejects invalid types, out-of-bounds indices, and duplicates."""
        info = get_system_cpu_info()
        max_core = info["logical_cpus"] - 1

        # Valid
        ok, _ = validate_cpu_cores([0])
        assert ok is True

        # Valid multiple
        if info["logical_cpus"] > 1:
            ok, _ = validate_cpu_cores([0, 1])
            assert ok is True

        # Out of bounds
        ok, reason = validate_cpu_cores([max_core + 10])
        assert ok is False
        assert "out of bounds" in reason

        # Duplicates
        ok, reason = validate_cpu_cores([0, 0])
        assert ok is False
        assert "duplicate" in reason

        # Non-integer
        ok, reason = validate_cpu_cores(["0"])  # type: ignore
        assert ok is False

    def test_realtime_priority_rejection(self):
        """Safety Invariant: verify REALTIME priority is strictly forbidden and rejected."""
        res = configure_process_priority("REALTIME")
        assert res["status"] == "REJECTED_SAFETY_VIOLATION"
        assert "strictly forbidden" in res["reason"]

    def test_unsupported_priority_rejection(self):
        """Verify arbitrary invalid priority strings are rejected."""
        res = configure_process_priority("ULTRA_HIGH_OVERCLOCK")
        assert res["status"] == "FAILED"
        assert "Unsupported priority" in res["reason"]

    def test_revert_process_controls_safety(self):
        """Verify revert_process_controls executes without exception."""
        res = revert_process_controls()
        assert res["status"] in ["REVERTED", "NOOP"]


# =====================================================================
# 4. INTERNAL MESSAGE BUS TESTS
# =====================================================================

class TestInternalMessageBus:

    def setup_method(self):
        reset_message_bus()

    def teardown_method(self):
        reset_message_bus()

    def test_subscribe_and_unsubscribe(self):
        """Verify subscription creation, receipt of event, and clean unsubscription."""
        bus = InMemoryMessageBus()
        received = []
        sub_id = bus.subscribe("market.tick", lambda ev: received.append(ev))

        bus.publish("market.tick", {"symbol": "NIFTY", "price": 24500.0})
        time.sleep(0.05)
        assert len(received) == 1
        assert received[0].data["price"] == 24500.0

        # Unsubscribe
        unsub_ok = bus.unsubscribe(sub_id)
        assert unsub_ok is True

        # Further publish should not reach the unsubscribed callback
        bus.publish("market.tick", {"symbol": "NIFTY", "price": 24550.0})
        time.sleep(0.05)
        assert len(received) == 1
        bus.shutdown()

    def test_topic_wildcard_matching(self):
        """Verify exact match, prefix wildcard (*), and global wildcard (*) routing."""
        bus = InMemoryMessageBus()
        exact_events = []
        prefix_events = []
        global_events = []

        bus.subscribe("market.tick", lambda ev: exact_events.append(ev))
        bus.subscribe("market.*", lambda ev: prefix_events.append(ev))
        bus.subscribe("*", lambda ev: global_events.append(ev))

        bus.publish("market.tick", {"v": 1})
        bus.publish("market.candle", {"v": 2})
        bus.publish("telemetry.heartbeat", {"v": 3})

        time.sleep(0.05)
        bus.shutdown()

        assert len(exact_events) == 1
        assert exact_events[0].data["v"] == 1

        assert len(prefix_events) == 2
        assert [e.data["v"] for e in prefix_events] == [1, 2]

        assert len(global_events) == 3
        assert [e.data["v"] for e in global_events] == [1, 2, 3]

    def test_event_ordering_in_subscriber(self):
        """Verify subscriber receives events in strict chronological order."""
        bus = InMemoryMessageBus()
        sequence = []
        bus.subscribe("telemetry.seq", lambda ev: sequence.append(ev.data["n"]))

        for i in range(50):
            bus.publish("telemetry.seq", {"n": i})

        time.sleep(0.1)
        bus.shutdown()

        assert sequence == list(range(50))

    def test_callback_failure_isolation(self):
        """Verify that an exception in one subscriber callback does not affect other subscribers."""
        bus = InMemoryMessageBus()
        healthy_received = []

        def faulty_callback(ev):
            raise RuntimeError("Deliberate test failure in faulty subscriber!")

        bus.subscribe("bot.status", faulty_callback)
        bus.subscribe("bot.status", lambda ev: healthy_received.append(ev.data["status"]))

        bus.publish("bot.status", {"status": "ACTIVE"})
        time.sleep(0.05)

        diag = bus.get_diagnostics()
        bus.shutdown()

        assert len(healthy_received) == 1
        assert healthy_received[0] == "ACTIVE"
        # Faulty subscriber recorded error
        assert any(s["error_count"] > 0 for s in diag["subscribers"])

    def test_lossy_event_overflow_eviction(self):
        """Verify slow consumer does not block publisher and drops oldest lossy events on queue saturation."""
        bus = InMemoryMessageBus()
        processed = []

        def slow_subscriber(ev):
            time.sleep(0.02)
            processed.append(ev.data["tick_id"])

        # Small buffer of 3
        bus.subscribe("market.fast", slow_subscriber, max_queue_size=3)

        # Rapidly burst 15 lossy events
        t0 = time.time()
        for i in range(15):
            bus.publish("market.fast", {"tick_id": i}, priority=EventPriority.LOSSY)
        publish_time = time.time() - t0

        # Producer must not be blocked (< 10ms for 15 events)
        assert publish_time < 0.05, f"Publisher was blocked: took {publish_time*1000:.2f}ms"

        time.sleep(0.2)
        diag = bus.get_diagnostics()
        bus.shutdown()

        # Some events should have been dropped to relieve backpressure
        assert diag["lossy_events_dropped_total"] > 0

    def test_critical_event_non_loss(self):
        """Verify CRITICAL priority events (risk/orders) are not dropped on saturation."""
        bus = InMemoryMessageBus()
        critical_received = []

        def slow_critical_subscriber(ev):
            time.sleep(0.01)
            critical_received.append(ev.data["order_id"])

        bus.subscribe("risk.emergency", slow_critical_subscriber, max_queue_size=2)

        # Publish 5 critical events
        for i in range(5):
            bus.publish("risk.emergency", {"order_id": f"ORD_{i}"}, priority=EventPriority.CRITICAL)

        time.sleep(0.15)
        diag = bus.get_diagnostics()
        bus.shutdown()

        # Zero critical events should be recorded as dropped
        assert diag["lossy_events_dropped_total"] == 0
        assert len(critical_received) == 5

    def test_redis_adapter_graceful_fallback(self):
        """Verify RedisMessageBusAdapter works transparently when Redis service is absent."""
        adapter = RedisMessageBusAdapter(redis_url="redis://127.0.0.1:6379/99")
        # Redis is not installed or running, is_available must be False
        assert adapter.is_available() is False

        received = []
        sub_id = adapter.subscribe("test.topic", lambda ev: received.append(ev.data["msg"]))
        adapter.publish("test.topic", {"msg": "fallback_works"})

        time.sleep(0.05)
        adapter.shutdown()

        assert len(received) == 1
        assert received[0] == "fallback_works"


# =====================================================================
# 5. SAFETY & RISK GUARDIAN INVARIANT TESTS
# =====================================================================

class TestSafetyAndRiskGuardianInvariants:

    def test_execution_mode_is_strictly_paper(self):
        """Non-negotiable rule: execution mode remains PAPER."""
        from server.python_stream_server import execution_mode
        assert execution_mode == "PAPER"

    def test_centralized_risk_guardian_limits_unaltered(self):
        """Verify CentralizedRiskManager capital constraints and gates are untouched."""
        cfg = get_centralized_rms_config()
        assert cfg["account_capital"] == 20000.0
        assert cfg["max_risk_pct_per_trade"] == 1.50
        assert cfg["max_orders_per_minute"] == 15
        assert cfg["min_order_interval_seconds"] == 3.0

    def test_circuit_breaker_halts_trading_intact(self):
        """Verify RMS circuit breaker check remains strictly functional."""
        crm = CentralizedRiskManager({"circuit_breaker_active": True})
        passed, reason, telemetry = crm.validate_order_risk(
            bot_id=1,
            symbol="NIFTY 50",
            action="BUY",
            qty=50,
            price=24000.0,
            segment="NSE Equity"
        )
        assert passed is False
        assert "Circuit Breaker" in reason or "TRIPPED" in reason
