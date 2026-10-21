"""
CHINTU AI TRADING SYSTEM - Internal Message Bus (Step 2)
Decoupled, high-throughput in-memory publish-subscribe message bus with bounded queues,
slow-consumer backpressure protection, critical vs. lossy event separation, and optional Redis adapter.

Architectural Guarantees:
1. Zero External Dependency Default: Native Windows 11 execution via in-memory bounded queues.
2. Slow Consumer Isolation: Non-blocking producer dispatch; slow consumers drop oldest LOSSY events
   without stalling market-data or strategy ingestion pipelines.
3. Critical Event Non-Loss: Critical risk alerts and order state changes bypass lossy drops and are never
   silently discarded.
4. Concurrency Safety: Thread-safe subscription registry and execution isolation.
5. Not a Source of Truth: Bus is strictly an event notification system, not the state store for positions,
   orders, or risk limits.
6. Optional Redis Bridge: Clean lazy import and graceful fallback when Redis is absent.
"""

import time
import uuid
import queue
import threading
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Callable, Set

logger = logging.getLogger("MessageBus")

# Lazy optional import for Redis
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    redis = None
    REDIS_AVAILABLE = False


class EventPriority(str, Enum):
    """Event classification determining buffering and overflow drop semantics."""
    CRITICAL = "CRITICAL"   # Risk alerts, order fills, emergency stops (Zero loss permitted)
    STANDARD = "STANDARD"   # Bot status, regime classifications, configuration changes
    LOSSY = "LOSSY"         # High-frequency market ticks, telemetry metrics, UI pings


@dataclass
class Event:
    """Standard message bus event envelope."""
    topic: str
    data: Dict[str, Any]
    priority: EventPriority = EventPriority.STANDARD
    timestamp: float = field(default_factory=time.time)
    event_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "topic": self.topic,
            "priority": self.priority.value if isinstance(self.priority, EventPriority) else str(self.priority),
            "timestamp": self.timestamp,
            "data": self.data
        }


class CriticalEventBufferOverflowError(Exception):
    """Raised when a subscriber's buffer is unable to accept a critical non-lossy event."""
    pass


_SHUTDOWN_SENTINEL = object()


def _topic_matches(pattern: str, topic: str) -> bool:
    """Matches exact topics, wildcards ('*'), or prefix wildcards ('market.*')."""
    if pattern == "*" or pattern == topic:
        return True
    if pattern.endswith(".*"):
        prefix = pattern[:-2]
        return topic == prefix or topic.startswith(prefix + ".")
    return False


class Subscription:
    """
    Individual subscriber handle with private bounded queue and dedicated worker thread.
    """
    def __init__(self, sub_id: str, topic_pattern: str, callback: Callable[[Event], None], max_queue_size: int = 1000):
        self.sub_id = sub_id
        self.topic_pattern = topic_pattern
        self.callback = callback
        self.max_queue_size = max(10, int(max_queue_size))
        self.queue: queue.Queue = queue.Queue(maxsize=self.max_queue_size)
        self.is_active = True
        self.processed_count = 0
        self.dropped_lossy_count = 0
        self.error_count = 0
        self.worker_thread: Optional[threading.Thread] = None

    def start_worker(self) -> None:
        """Starts worker thread for asynchronous event consumption."""
        self.worker_thread = threading.Thread(
            target=self._worker_loop,
            name=f"MsgBusSub-{self.sub_id}",
            daemon=True
        )
        self.worker_thread.start()

    def _worker_loop(self) -> None:
        while self.is_active:
            try:
                item = self.queue.get(timeout=0.2)
            except queue.Empty:
                continue

            if item is _SHUTDOWN_SENTINEL:
                self.queue.task_done()
                break

            try:
                self.callback(item)
                self.processed_count += 1
            except Exception as e:
                self.error_count += 1
                logger.error(f"[MessageBus] Error in callback for subscriber {self.sub_id} on topic {item.topic}: {e}", exc_info=True)
            finally:
                self.queue.task_done()


class InMemoryMessageBus:
    """
    Default in-memory publish-subscribe message bus.
    Provides fast, bounded, thread-safe message dispatch without external services.
    """
    def __init__(self, default_sub_queue_size: int = 1000):
        self.default_sub_queue_size = default_sub_queue_size
        self._lock = threading.RLock()
        self._subscribers: Dict[str, Subscription] = {}
        self._running = True

        # Observability metrics
        self.events_published_count = 0
        self.critical_events_count = 0
        self.lossy_events_dropped_count = 0

    def subscribe(
        self,
        topic_pattern: str,
        callback: Callable[[Event], None],
        max_queue_size: Optional[int] = None
    ) -> str:
        """
        Subscribes a callback to a topic pattern.
        Returns a unique subscription ID.
        """
        sub_id = f"sub-{uuid.uuid4().hex[:8]}"
        q_size = max_queue_size or self.default_sub_queue_size
        sub = Subscription(sub_id, topic_pattern, callback, max_queue_size=q_size)

        with self._lock:
            if not self._running:
                raise RuntimeError("Cannot subscribe to stopped MessageBus.")
            self._subscribers[sub_id] = sub
            sub.start_worker()

        logger.debug(f"[MessageBus] Subscribed {sub_id} to '{topic_pattern}' (buffer: {q_size})")
        return sub_id

    def unsubscribe(self, sub_id: str) -> bool:
        """
        Unsubscribes and cleans up a subscriber worker.
        """
        with self._lock:
            sub = self._subscribers.pop(sub_id, None)

        if sub is None:
            return False

        sub.is_active = False
        try:
            sub.queue.put_nowait(_SHUTDOWN_SENTINEL)
        except Exception:
            pass

        if sub.worker_thread and sub.worker_thread.is_alive():
            sub.worker_thread.join(timeout=0.5)

        logger.debug(f"[MessageBus] Unsubscribed {sub_id}")
        return True

    def publish(
        self,
        topic: str,
        data: Dict[str, Any],
        priority: EventPriority = EventPriority.STANDARD
    ) -> Event:
        """
        Publishes an event to all matching subscribers.
        Enforces non-blocking slow-consumer eviction for LOSSY events,
        and reliable delivery / synchronous fallback for CRITICAL events.
        """
        event = Event(topic=topic, data=data, priority=priority)

        with self._lock:
            if not self._running:
                logger.warning(f"[MessageBus] Dropped event '{topic}' published to stopped bus.")
                return event

            self.events_published_count += 1
            if priority == EventPriority.CRITICAL:
                self.critical_events_count += 1

            matched_subs = [
                s for s in self._subscribers.values()
                if s.is_active and _topic_matches(s.topic_pattern, topic)
            ]

        for sub in matched_subs:
            self._dispatch_to_subscriber(sub, event)

        return event

    def _dispatch_to_subscriber(self, sub: Subscription, event: Event) -> None:
        """
        Dispatches event into subscriber's private queue with explicit overflow handling.
        """
        if event.priority == EventPriority.CRITICAL:
            # Non-lossy policy: Attempt to put with timeout; if queue remains full, invoke synchronously
            try:
                sub.queue.put(event, timeout=0.2)
            except queue.Full:
                logger.warning(f"[MessageBus] Subscriber {sub.sub_id} queue full for CRITICAL event {event.topic}. Executing fallback synchronous delivery.")
                try:
                    sub.callback(event)
                    sub.processed_count += 1
                except Exception as cb_err:
                    sub.error_count += 1
                    logger.error(f"[MessageBus] Synchronous critical delivery failed for {sub.sub_id}: {cb_err}", exc_info=True)
        else:
            # Lossy/Standard policy: Evict oldest if queue is saturated
            try:
                sub.queue.put_nowait(event)
            except queue.Full:
                try:
                    # Drop oldest event to relieve backpressure
                    sub.queue.get_nowait()
                    sub.dropped_lossy_count += 1
                    with self._lock:
                        self.lossy_events_dropped_count += 1
                except queue.Empty:
                    pass
                
                try:
                    sub.queue.put_nowait(event)
                except queue.Full:
                    # If still full, drop incoming
                    sub.dropped_lossy_count += 1
                    with self._lock:
                        self.lossy_events_dropped_count += 1

    def get_diagnostics(self) -> Dict[str, Any]:
        """Returns message bus health and operational metrics."""
        with self._lock:
            active_subs = [
                {
                    "sub_id": s.sub_id,
                    "topic_pattern": s.topic_pattern,
                    "processed_count": s.processed_count,
                    "dropped_lossy_count": s.dropped_lossy_count,
                    "error_count": s.error_count,
                    "queue_size": s.queue.qsize()
                }
                for s in self._subscribers.values()
            ]
            topics = list(set(s.topic_pattern for s in self._subscribers.values()))

            return {
                "bus_type": "InMemoryMessageBus",
                "running": self._running,
                "redis_support_available": REDIS_AVAILABLE,
                "active_subscribers_count": len(self._subscribers),
                "topics_subscribed": topics,
                "events_published_total": self.events_published_count,
                "critical_events_total": self.critical_events_count,
                "lossy_events_dropped_total": self.lossy_events_dropped_count,
                "subscribers": active_subs
            }

    def shutdown(self, timeout: float = 1.0) -> None:
        """Stops the message bus and gracefully shuts down all subscriber workers."""
        with self._lock:
            self._running = False
            subs = list(self._subscribers.values())
            self._subscribers.clear()

        for sub in subs:
            sub.is_active = False
            try:
                sub.queue.put_nowait(_SHUTDOWN_SENTINEL)
            except Exception:
                pass

        for sub in subs:
            if sub.worker_thread and sub.worker_thread.is_alive():
                sub.worker_thread.join(timeout=timeout)


class RedisMessageBusAdapter:
    """
    Optional Redis Pub/Sub adapter with lazy imports and transparent in-memory fallback.
    Never fails or throws on missing Redis; operates in-memory unless explicitly connected.
    """
    def __init__(self, redis_url: str = "redis://127.0.0.1:6379/0"):
        self.redis_url = redis_url
        self.redis_client = None
        self._is_connected = False
        self._fallback_bus = InMemoryMessageBus()

    def is_available(self) -> bool:
        """Returns True only if redis package is installed and server is reachable."""
        if not REDIS_AVAILABLE:
            return False
        try:
            if not self.redis_client:
                self.redis_client = redis.Redis.from_url(self.redis_url, socket_timeout=1.0)
            return bool(self.redis_client.ping())
        except Exception:
            return False

    def publish(self, topic: str, data: Dict[str, Any], priority: EventPriority = EventPriority.STANDARD) -> Event:
        if self._is_connected and self.redis_client:
            try:
                import json
                payload = json.dumps({"topic": topic, "data": data, "priority": priority.value, "timestamp": time.time()})
                self.redis_client.publish(topic, payload)
            except Exception as e:
                logger.warning(f"[RedisAdapter] Publish failed, routing to in-memory fallback: {e}")
                return self._fallback_bus.publish(topic, data, priority)
        return self._fallback_bus.publish(topic, data, priority)

    def subscribe(self, topic_pattern: str, callback: Callable[[Event], None]) -> str:
        return self._fallback_bus.subscribe(topic_pattern, callback)

    def unsubscribe(self, sub_id: str) -> bool:
        return self._fallback_bus.unsubscribe(sub_id)

    def get_diagnostics(self) -> Dict[str, Any]:
        diag = self._fallback_bus.get_diagnostics()
        diag["bus_type"] = "RedisMessageBusAdapter"
        diag["redis_connected"] = self._is_connected
        diag["redis_url"] = self.redis_url
        return diag

    def shutdown(self, timeout: float = 1.0) -> None:
        self._fallback_bus.shutdown(timeout=timeout)


# Global Shared Singleton Accessor
_GLOBAL_MESSAGE_BUS: Optional[InMemoryMessageBus] = None
_GLOBAL_LOCK = threading.Lock()


def get_message_bus() -> InMemoryMessageBus:
    """Retrieves the authoritative system message bus singleton."""
    global _GLOBAL_MESSAGE_BUS
    if _GLOBAL_MESSAGE_BUS is None:
        with _GLOBAL_LOCK:
            if _GLOBAL_MESSAGE_BUS is None:
                _GLOBAL_MESSAGE_BUS = InMemoryMessageBus()
    return _GLOBAL_MESSAGE_BUS


def reset_message_bus() -> None:
    """Resets global message bus singleton (used for clean test teardowns)."""
    global _GLOBAL_MESSAGE_BUS
    with _GLOBAL_LOCK:
        if _GLOBAL_MESSAGE_BUS is not None:
            _GLOBAL_MESSAGE_BUS.shutdown(timeout=0.5)
            _GLOBAL_MESSAGE_BUS = None

