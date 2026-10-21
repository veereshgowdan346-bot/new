"""
CHINTU AI TRADING SYSTEM - Observability & Latency Telemetry Engine (Phase 9)
Tracks execution pipeline latencies:
  - tick_to_signal (Tick ingestion to strategy signal generation)
  - signal_to_order (Signal generation to pre-flight execution approval)
  - order_to_ack (Order dispatch to broker acknowledgement)
  - ack_to_fill (Broker ack to execution fill confirmation)
Calculates real-time sample counts and percentiles (p50, p95, p99).
Provides authoritative operational emergency controls (Emergency square-off all, pause/resume).
"""

import time
import math
from datetime import datetime
from typing import Dict, Any, List, Optional

from server.memory_db import get_open_positions, close_position


class LatencyTelemetryEngine:
    """
    High-performance ring-buffer latency tracker and operational command controller.
    """

    def __init__(self, max_samples: int = 1000):
        self.max_samples = max_samples
        self.buffers: Dict[str, List[float]] = {
            "tick_to_signal_ms": [],
            "signal_to_order_ms": [],
            "order_to_ack_ms": [],
            "ack_to_fill_ms": []
        }
        self.trading_paused: bool = False
        self.pause_reason: str = ""
        self.last_pause_time: Optional[str] = None

    def record_latency(self, stage: str, duration_ms: float) -> None:
        """Records a millisecond duration observation into the designated ring buffer."""
        if stage not in self.buffers:
            self.buffers[stage] = []

        buf = self.buffers[stage]
        buf.append(round(max(0.01, duration_ms), 2))
        if len(buf) > self.max_samples:
            buf.pop(0)

    def calculate_percentiles(self, stage: str) -> Dict[str, Any]:
        """Calculates min, p50 (median), p95, p99, max, mean, and sample count for a stage."""
        samples = sorted(self.buffers.get(stage, []))
        n = len(samples)
        if n == 0:
            return {
                "count": 0,
                "min_ms": 0.0,
                "p50_ms": 0.0,
                "p95_ms": 0.0,
                "p99_ms": 0.0,
                "max_ms": 0.0,
                "mean_ms": 0.0
            }

        def get_p(p: float) -> float:
            idx = int(math.ceil(p * n)) - 1
            return round(samples[max(0, min(idx, n - 1))], 2)

        return {
            "count": n,
            "min_ms": round(samples[0], 2),
            "p50_ms": get_p(0.50),
            "p95_ms": get_p(0.95),
            "p99_ms": get_p(0.99),
            "max_ms": round(samples[-1], 2),
            "mean_ms": round(sum(samples) / n, 2)
        }

    def get_full_telemetry_report(self) -> Dict[str, Any]:
        """Returns comprehensive latency metrics across all pipeline stages."""
        stages = {}
        for stage in self.buffers:
            stages[stage] = self.calculate_percentiles(stage)

        return {
            "status": "success",
            "trading_paused": self.trading_paused,
            "pause_reason": self.pause_reason,
            "last_pause_time": self.last_pause_time,
            "stages": stages,
            "timestamp": datetime.now().isoformat()
        }

    def pause_trading(self, reason: str = "Operator manual pause") -> Dict[str, Any]:
        """Pauses all new order entries across the platform."""
        self.trading_paused = True
        self.pause_reason = reason
        self.last_pause_time = datetime.now().isoformat()
        return {
            "status": "success",
            "trading_paused": True,
            "reason": reason,
            "paused_at": self.last_pause_time
        }

    def resume_trading(self) -> Dict[str, Any]:
        """Resumes normal order entry routing."""
        self.trading_paused = False
        self.pause_reason = ""
        return {
            "status": "success",
            "trading_paused": False,
            "resumed_at": datetime.now().isoformat()
        }

    def emergency_square_off_all_positions(self, reason: str = "Operator Emergency Square-off") -> Dict[str, Any]:
        """
        Executes immediate risk-reducing square-off across all open positions.
        Unconditionally bypasses entry quorum to protect capital.
        """
        from server.execution_engine import execution_engine
        open_positions = get_open_positions()
        closed_count = 0
        results = []

        for p in open_positions:
            sym = p["symbol"]
            qty = p["qty"]
            side = p["side"]
            exit_action = "SELL" if side == "LONG" else "BUY"

            res = execution_engine.execute_order(
                bot_id=1,
                symbol=sym,
                action="EXIT",
                qty=qty,
                price=float(p.get("ltp") or p.get("avg_price") or 100.0),
                is_emergency_exit=True,
                execution_mode="PAPER"
            )
            close_position(sym)
            closed_count += 1
            results.append({
                "symbol": sym,
                "qty": qty,
                "side": side,
                "exit_action": exit_action,
                "result": res
            })

        return {
            "status": "success",
            "closed_positions_count": closed_count,
            "reason": reason,
            "results": results,
            "executed_at": datetime.now().isoformat()
        }


# Global Singleton Instance
telemetry_engine = LatencyTelemetryEngine()

