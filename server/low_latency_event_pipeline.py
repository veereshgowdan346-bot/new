"""
CHINTU AI TRADING SYSTEM - Low-Latency Event-Driven Pipeline (Phase 6)
High-throughput, asynchronous market event pipeline with bounded queues,
strict tick validation, stage latency profiling, and backpressure protection.

Stages measured:
  1. Feed Arrival -> Signal Generation (T0 -> T1)
  2. Signal -> Master Brain Consensus (T1 -> T2)
  3. Decision -> RMS Risk Validation & Order Submission (T2 -> T3)
  4. Submission -> Paper/Broker Confirmation (T3 -> T4)
"""

import time
import math
import queue
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("CHINTU_EVENT_PIPELINE")
IST = timezone(timedelta(hours=5, minutes=30))


class MarketTickValidator:
    """
    Validates market ticks for sequence integrity, temporal freshness,
    price bounds, and structural completeness before queue ingestion.
    """

    def __init__(self, max_stale_seconds: float = 60.0, max_future_seconds: float = 3.0):
        self.max_stale_seconds = max_stale_seconds
        self.max_future_seconds = max_future_seconds
        self.last_tick_sequences: Dict[str, int] = {}
        self.last_tick_timestamps: Dict[str, float] = {}

    def validate_tick(self, tick: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Validates individual market tick against all structural and chronological rules.
        """
        if not isinstance(tick, dict):
            return False, "Tick must be a valid dictionary payload."

        symbol = str(tick.get("symbol") or tick.get("tradingsymbol") or "").strip()
        if not symbol:
            return False, "Tick missing required symbol."

        # Price validation: Must be finite and strictly positive
        try:
            raw_p = tick.get("ltp") if tick.get("ltp") is not None else (tick.get("price") if tick.get("price") is not None else tick.get("close"))
            if raw_p is None:
                return False, "Tick missing price/ltp field."
            price = float(raw_p)
        except (ValueError, TypeError):
            return False, "Invalid non-numeric tick price."

        if not math.isfinite(price) or price <= 0.0:
            return False, f"Invalid non-positive or non-finite tick price ({price})."

        # Volume validation: If provided, must be finite and non-negative
        raw_vol = tick.get("volume") if tick.get("volume") is not None else tick.get("last_traded_quantity")
        if raw_vol is not None:
            try:
                vol = float(raw_vol)
                if not math.isfinite(vol) or vol < 0.0:
                    return False, f"Invalid non-finite or negative tick volume ({vol})."
            except (ValueError, TypeError):
                return False, "Invalid non-numeric tick volume."

        # Timestamp & Temporal Validation
        now_epoch = time.time()
        tick_epoch = None
        ts_raw = tick.get("timestamp") or tick.get("exchange_timestamp")

        if ts_raw is not None:
            try:
                if isinstance(ts_raw, (int, float)):
                    tick_epoch = float(ts_raw)
                elif isinstance(ts_raw, str):
                    clean_ts = ts_raw.replace("Z", "+00:00")
                    dt = datetime.fromisoformat(clean_ts)
                    tick_epoch = dt.timestamp()
            except Exception:
                tick_epoch = None

        if tick_epoch is not None:
            if not math.isfinite(tick_epoch):
                return False, "Invalid non-finite tick timestamp."

            # Future-dated check
            if tick_epoch > (now_epoch + self.max_future_seconds):
                return False, f"Future-dated tick rejected (ahead by {tick_epoch - now_epoch:.2f}s)."

            # Stale tick check
            if (now_epoch - tick_epoch) > self.max_stale_seconds:
                return False, f"Stale tick rejected ({now_epoch - tick_epoch:.2f}s old > limit {self.max_stale_seconds}s)."

            # Monotonicity check per symbol
            last_ts = self.last_tick_timestamps.get(symbol, 0.0)
            if tick_epoch < (last_ts - 1.0):  # Allow 1s network jitter
                return False, f"Out-of-order tick rejected (arrived {last_ts - tick_epoch:.2f}s behind prior tick)."
            self.last_tick_timestamps[symbol] = tick_epoch

        # Sequence Check (if present)
        seq = tick.get("sequence_number")
        if seq is not None and isinstance(seq, int):
            last_seq = self.last_tick_sequences.get(symbol, 0)
            if seq == last_seq and last_seq > 0:
                return False, f"Duplicate sequence {seq} received for {symbol}."
            if seq < last_seq:
                return False, f"Out-of-order sequence {seq} < prior {last_seq} for {symbol}."
            self.last_tick_sequences[symbol] = seq

        return True, "Tick valid."


class StageLatencyTracker:
    """
    Profiles end-to-end and stage-by-stage execution latencies across market events:
      - feed_to_signal (T0 -> T1)
      - signal_to_decision (T1 -> T2)
      - decision_to_order (T2 -> T3)
      - order_to_fill (T3 -> T4)
      - total_pipeline (T0 -> T4)
    Computes Median, P95, P99, error counts, and throughput.
    """

    def __init__(self, sample_limit: int = 500):
        self.sample_limit = sample_limit
        self.feed_to_signal_samples: List[float] = []
        self.signal_to_decision_samples: List[float] = []
        self.decision_to_order_samples: List[float] = []
        self.order_to_fill_samples: List[float] = []
        self.total_pipeline_samples: List[float] = []
        self.processed_events_count: int = 0
        self.rejected_ticks_count: int = 0
        self.start_epoch: float = time.time()

    def record_stage_measurement(
        self,
        feed_to_signal_ms: float,
        signal_to_decision_ms: float,
        decision_to_order_ms: float,
        order_to_fill_ms: float
    ) -> None:
        """Records a completed end-to-end execution slice."""
        self.feed_to_signal_samples.append(feed_to_signal_ms)
        self.signal_to_decision_samples.append(signal_to_decision_ms)
        self.decision_to_order_samples.append(decision_to_order_ms)
        self.order_to_fill_samples.append(order_to_fill_ms)

        total_ms = feed_to_signal_ms + signal_to_decision_ms + decision_to_order_ms + order_to_fill_ms
        self.total_pipeline_samples.append(total_ms)
        self.processed_events_count += 1

        # Bound sample memory
        if len(self.total_pipeline_samples) > self.sample_limit:
            self.feed_to_signal_samples.pop(0)
            self.signal_to_decision_samples.pop(0)
            self.decision_to_order_samples.pop(0)
            self.order_to_fill_samples.pop(0)
            self.total_pipeline_samples.pop(0)

    def record_rejected_tick(self) -> None:
        """Increments rejected tick counter."""
        self.rejected_ticks_count += 1

    @staticmethod
    def _compute_stats(series: List[float]) -> Dict[str, float]:
        """Calculates median, p95, and p99 percentiles."""
        if not series:
            return {"median_ms": 0.0, "p95_ms": 0.0, "p99_ms": 0.0, "min_ms": 0.0, "max_ms": 0.0}

        sorted_s = sorted(series)
        n = len(sorted_s)
        med_idx = int(n * 0.50)
        p95_idx = min(n - 1, int(n * 0.95))
        p99_idx = min(n - 1, int(n * 0.99))

        return {
            "median_ms": round(sorted_s[med_idx], 3),
            "p95_ms": round(sorted_s[p95_idx], 3),
            "p99_ms": round(sorted_s[p99_idx], 3),
            "min_ms": round(sorted_s[0], 3),
            "max_ms": round(sorted_s[-1], 3)
        }

    def get_latency_report(self) -> Dict[str, Any]:
        """Produces full statistical latency and throughput breakdown."""
        duration = max(1.0, time.time() - self.start_epoch)
        throughput = round(self.processed_events_count / duration, 2)

        return {
            "timestamp": datetime.now(IST).isoformat(),
            "total_processed_events": self.processed_events_count,
            "total_rejected_ticks": self.rejected_ticks_count,
            "events_per_second": throughput,
            "stages": {
                "feed_to_signal": self._compute_stats(self.feed_to_signal_samples),
                "signal_to_decision": self._compute_stats(self.signal_to_decision_samples),
                "decision_to_order": self._compute_stats(self.decision_to_order_samples),
                "order_to_fill": self._compute_stats(self.order_to_fill_samples),
                "total_pipeline": self._compute_stats(self.total_pipeline_samples)
            }
        }


class LowLatencyEventPipeline:
    """
    Asynchronous event processing pipeline with bounded queue,
    backpressure handling, and end-to-end integration with Master Brain and RMS.
    """

    def __init__(self, queue_capacity: int = 1000):
        self.queue_capacity = queue_capacity
        self.tick_queue = queue.Queue(maxsize=queue_capacity)
        self.validator = MarketTickValidator()
        self.tracker = StageLatencyTracker()
        self.is_running: bool = False
        self.dropped_events_count: int = 0

    def push_tick(self, tick: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Pushes an incoming market tick into the bounded event pipeline.
        Implements backpressure dropping when queue capacity is reached.
        """
        # 1. Structural and Chronological Validation
        is_valid, val_err = self.validator.validate_tick(tick)
        if not is_valid:
            self.tracker.record_rejected_tick()
            return False, f"Tick rejected by validator: {val_err}"

        # 2. Ingestion with Backpressure Protection
        try:
            self.tick_queue.put_nowait(tick)
            return True, "Tick queued."
        except queue.Full:
            self.dropped_events_count += 1
            logger.warning("Event pipeline queue FULL. Dropping tick to protect latency.")
            return False, "Queue full (backpressure drop)."

    def process_next_event(
        self,
        master_brain_instance,
        execution_engine_instance,
        centralized_rms_instance,
        execution_mode: str = "PAPER"
    ) -> Optional[Dict[str, Any]]:
        """
        Pulls the next event from the queue, executes the 4 processing stages,
        measures precise stage latencies, and returns the execution result.
        """
        try:
            tick = self.tick_queue.get_nowait()
        except queue.Empty:
            return None

        t0 = time.perf_counter()
        symbol = str(tick.get("symbol") or tick.get("tradingsymbol") or "NIFTY24OCTFUT")
        price = float(tick.get("ltp") or tick.get("close") or 24500.0)

        # STAGE 1: Feed Arrival -> Strategy Signals (T0 -> T1)
        candles = tick.get("candles") or {
            "close": [price * (1.0 + (i * 0.0005)) for i in range(35)],
            "high": [price * 1.002 for _ in range(35)],
            "low": [price * 0.998 for _ in range(35)],
            "volume": [10000.0 for _ in range(35)]
        }
        signals = []
        for bid in [1, 2, 5, 6]:
            sig = master_brain_instance.evaluate_bot_strategy_signal(bid, candles, symbol=symbol)
            if sig.get("action") in ("BUY", "SELL"):
                signals.append(sig)

        t1 = time.perf_counter()

        # STAGE 2: Signal -> Master Brain Consensus & Friction Gate (T1 -> T2)
        consensus = master_brain_instance.evaluate_fleet_consensus(
            symbol=symbol,
            signals=signals,
            market_regime="TRENDING_BULL"
        )
        t2 = time.perf_counter()

        # STAGE 3: Decision -> RMS Validation & Order Submission (T2 -> T3)
        decision = consensus.get("decision", "NO_TRADE")
        order_res = None

        if decision in ("BUY", "SELL"):
            # Centralized RMS Gate
            rms_ok, rms_msg, rms_telem = centralized_rms_instance.validate_order_risk(
                bot_id=1,
                symbol=symbol,
                action=decision,
                qty=50,
                price=price,
                execution_mode=execution_mode
            )

            if rms_ok:
                t3 = time.perf_counter()
                # STAGE 4: Submission -> Fill Simulation (T3 -> T4)
                order_res = execution_engine_instance.execute_order(
                    bot_id=1,
                    symbol=symbol,
                    action=decision,
                    qty=50,
                    price=price,
                    execution_mode=execution_mode
                )
                t4 = time.perf_counter()
            else:
                t3 = time.perf_counter()
                t4 = t3
                order_res = {"status": "RISK_REJECTED", "error": rms_msg}
        else:
            t3 = time.perf_counter()
            t4 = t3
            order_res = {"status": "NO_TRADE_ISSUED", "reason": consensus.get("decision_reason")}

        # Latency calculations in milliseconds
        f_to_s = round((t1 - t0) * 1000.0, 3)
        s_to_d = round((t2 - t1) * 1000.0, 3)
        d_to_o = round((t3 - t2) * 1000.0, 3)
        o_to_f = round((t4 - t3) * 1000.0, 3)

        self.tracker.record_stage_measurement(f_to_s, s_to_d, d_to_o, o_to_f)
        self.tick_queue.task_done()

        return {
            "symbol": symbol,
            "decision": decision,
            "order_result": order_res,
            "stage_latencies_ms": {
                "feed_to_signal": f_to_s,
                "signal_to_decision": s_to_d,
                "decision_to_order": d_to_o,
                "order_to_fill": o_to_f,
                "total": round(f_to_s + s_to_d + d_to_o + o_to_f, 3)
            }
        }


# Singleton pipeline instance
event_pipeline = LowLatencyEventPipeline()

