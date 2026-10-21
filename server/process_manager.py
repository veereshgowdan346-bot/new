"""
CHINTU AI TRADING SYSTEM - Process & Resource Observability Manager (Step 2)
Provides non-destructive resource diagnostics, memory profiling, CPU metrics,
and explicit opt-in process priority/affinity controls for Windows and POSIX.

Safety Invariants:
1. Passive by default: NEVER modifies CPU affinity or process priority automatically
   during module import or application startup.
2. Hard Real-Time Proscription: Elevating to REALTIME priority is strictly forbidden.
3. Fail-Closed & Non-Destructive: Never terminates processes or alters machine-wide settings.
4. Safe Reversion: Preserves initial baseline settings for reliable rollbacks.
"""

import os
import sys
import platform
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("ProcessManager")

# Lazy/optional import of psutil
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    psutil = None
    PSUTIL_AVAILABLE = False


# Canonical priority class mappings (Windows / POSIX compatible)
PRIORITY_NAME_MAP = {
    "IDLE": "IDLE",
    "BELOW_NORMAL": "BELOW_NORMAL",
    "NORMAL": "NORMAL",
    "ABOVE_NORMAL": "ABOVE_NORMAL",
    "HIGH": "HIGH"
}

# Initial baseline storage for safe revert
_INITIAL_STATE: Dict[str, Any] = {
    "captured": False,
    "affinity": None,
    "priority_nice": None
}


def _capture_initial_state() -> None:
    """Captures baseline affinity and priority once on first diagnostic query."""
    global _INITIAL_STATE
    if _INITIAL_STATE["captured"] or not PSUTIL_AVAILABLE:
        return
    try:
        proc = psutil.Process()
        _INITIAL_STATE["affinity"] = proc.cpu_affinity() if hasattr(proc, "cpu_affinity") else None
        _INITIAL_STATE["priority_nice"] = proc.nice()
        _INITIAL_STATE["captured"] = True
    except Exception as e:
        logger.debug(f"[ProcessManager] Could not capture initial baseline: {e}")


def get_system_cpu_info() -> Dict[str, Any]:
    """
    Returns system CPU hardware topology safely.
    """
    logical_cpus = os.cpu_count() or 1
    physical_cpus = None
    if PSUTIL_AVAILABLE:
        try:
            physical_cpus = psutil.cpu_count(logical=False)
        except Exception:
            physical_cpus = None

    return {
        "platform": platform.system(),
        "platform_release": platform.release(),
        "architecture": platform.machine(),
        "logical_cpus": logical_cpus,
        "physical_cpus": physical_cpus,
        "python_version": sys.version.split()[0],
        "psutil_available": PSUTIL_AVAILABLE
    }


def get_process_diagnostics() -> Dict[str, Any]:
    """
    Reads and returns comprehensive process resource diagnostics safely.
    Never modifies process state. Handles missing dependencies and permission errors.
    """
    _capture_initial_state()
    sys_info = get_system_cpu_info()
    pid = os.getpid()

    if not PSUTIL_AVAILABLE:
        return {
            "status": "DEGRADED",
            "warning": "psutil library not available; limited process metrics returned.",
            "pid": pid,
            "system": sys_info,
            "process_priority": "UNKNOWN",
            "nice_value": None,
            "cpu_affinity": None,
            "memory_rss_mb": None,
            "memory_vms_mb": None,
            "cpu_percent": None,
            "baseline_captured": False,
            "controls_active": False
        }

    try:
        proc = psutil.Process(pid)
        
        # Priority mapping
        nice_val = proc.nice()
        priority_label = "NORMAL"
        if platform.system() == "Windows":
            if nice_val == getattr(psutil, "IDLE_PRIORITY_CLASS", 64):
                priority_label = "IDLE"
            elif nice_val == getattr(psutil, "BELOW_NORMAL_PRIORITY_CLASS", 16384):
                priority_label = "BELOW_NORMAL"
            elif nice_val == getattr(psutil, "NORMAL_PRIORITY_CLASS", 32):
                priority_label = "NORMAL"
            elif nice_val == getattr(psutil, "ABOVE_NORMAL_PRIORITY_CLASS", 32768):
                priority_label = "ABOVE_NORMAL"
            elif nice_val == getattr(psutil, "HIGH_PRIORITY_CLASS", 128):
                priority_label = "HIGH"
            elif nice_val == getattr(psutil, "REALTIME_PRIORITY_CLASS", 256):
                priority_label = "REALTIME (WARNING: DANGEROUS)"
            else:
                priority_label = f"WIN_{nice_val}"
        else:
            if nice_val < 0:
                priority_label = f"HIGH_NICE_{nice_val}"
            elif nice_val > 0:
                priority_label = f"LOW_NICE_{nice_val}"
            else:
                priority_label = "NORMAL"

        # Affinity
        affinity = proc.cpu_affinity() if hasattr(proc, "cpu_affinity") else None

        # Memory info
        mem_info = proc.memory_info()
        rss_mb = round(mem_info.rss / (1024 * 1024), 2)
        vms_mb = round(mem_info.vms / (1024 * 1024), 2)

        # CPU usage (instantaneous non-blocking)
        cpu_pct = round(proc.cpu_percent(interval=None), 1)

        return {
            "status": "HEALTHY",
            "pid": pid,
            "system": sys_info,
            "process_priority": priority_label,
            "nice_value": nice_val,
            "cpu_affinity": affinity,
            "memory_rss_mb": rss_mb,
            "memory_vms_mb": vms_mb,
            "cpu_percent": cpu_pct,
            "baseline_captured": _INITIAL_STATE["captured"],
            "controls_active": bool(affinity and len(affinity) < sys_info["logical_cpus"])
        }

    except getattr(psutil, "AccessDenied", PermissionError):
        return {
            "status": "PERMISSION_DENIED",
            "warning": "AccessDenied encountered when reading process resource metrics.",
            "pid": pid,
            "system": sys_info,
            "process_priority": "UNKNOWN",
            "nice_value": None,
            "cpu_affinity": None,
            "memory_rss_mb": None,
            "memory_vms_mb": None,
            "cpu_percent": None,
            "baseline_captured": False,
            "controls_active": False
        }
    except Exception as e:
        return {
            "status": "ERROR",
            "warning": f"Unexpected error reading process diagnostics: {str(e)}",
            "pid": pid,
            "system": sys_info,
            "process_priority": "UNKNOWN",
            "nice_value": None,
            "cpu_affinity": None,
            "memory_rss_mb": None,
            "memory_vms_mb": None,
            "cpu_percent": None,
            "baseline_captured": False,
            "controls_active": False
        }


def validate_cpu_cores(cores: List[int]) -> Tuple[bool, str]:
    """
    Validates that proposed CPU cores are valid logical CPU indices.
    """
    if not isinstance(cores, (list, tuple)) or len(cores) == 0:
        return False, "CPU cores list must be a non-empty collection of integer core IDs."

    sys_info = get_system_cpu_info()
    logical_count = sys_info["logical_cpus"]

    for c in cores:
        if not isinstance(c, int):
            return False, f"Invalid CPU core '{c}': must be an integer."
        if c < 0 or c >= logical_count:
            return False, f"CPU core {c} is out of bounds for machine with {logical_count} logical CPUs (valid: 0 to {logical_count - 1})."

    # Ensure no duplicates
    if len(set(cores)) != len(cores):
        return False, "CPU cores list contains duplicate core IDs."

    return True, "Valid CPU core configuration."


def configure_process_affinity(cores: List[int]) -> Dict[str, Any]:
    """
    Explicit opt-in CPU affinity pinning.
    Validates cores, checks permissions, and records changes.
    """
    _capture_initial_state()
    is_valid, reason = validate_cpu_cores(cores)
    if not is_valid:
        return {"status": "FAILED", "reason": reason}

    if not PSUTIL_AVAILABLE:
        return {"status": "FAILED", "reason": "psutil library required for CPU affinity control."}

    try:
        proc = psutil.Process()
        if not hasattr(proc, "cpu_affinity"):
            return {"status": "FAILED", "reason": "cpu_affinity control is not supported on this operating system."}

        previous_affinity = proc.cpu_affinity()
        proc.cpu_affinity(cores)
        new_affinity = proc.cpu_affinity()

        logger.info(f"[ProcessManager] CPU affinity updated from {previous_affinity} to {new_affinity}")
        return {
            "status": "SUCCESS",
            "previous_affinity": previous_affinity,
            "new_affinity": new_affinity,
            "revert_available": True
        }
    except getattr(psutil, "AccessDenied", PermissionError):
        return {"status": "FAILED", "reason": "AccessDenied: insufficient privileges to set process CPU affinity."}
    except Exception as e:
        return {"status": "FAILED", "reason": f"Failed to set CPU affinity: {str(e)}"}


def configure_process_priority(priority_name: str) -> Dict[str, Any]:
    """
    Explicit opt-in process priority configuration.
    Permits: "IDLE", "BELOW_NORMAL", "NORMAL", "ABOVE_NORMAL", "HIGH".
    STRICTLY FORBIDS "REALTIME" priority to prevent system lockups.
    """
    _capture_initial_state()
    normalized = str(priority_name).strip().upper()

    if normalized == "REALTIME":
        return {
            "status": "REJECTED_SAFETY_VIOLATION",
            "reason": "REALTIME priority is strictly forbidden on trading workstations to avoid OS thread starvation."
        }

    if normalized not in PRIORITY_NAME_MAP:
        return {
            "status": "FAILED",
            "reason": f"Unsupported priority '{priority_name}'. Allowed: {list(PRIORITY_NAME_MAP.keys())}."
        }

    if not PSUTIL_AVAILABLE:
        return {"status": "FAILED", "reason": "psutil library required for process priority control."}

    try:
        proc = psutil.Process()
        previous_nice = proc.nice()

        if platform.system() == "Windows":
            target_class = getattr(psutil, f"{normalized}_PRIORITY_CLASS", None)
            if target_class is None:
                return {"status": "FAILED", "reason": f"Windows constant for {normalized} not found."}
            proc.nice(target_class)
        else:
            # POSIX nice values
            posix_nice_map = {
                "IDLE": 19,
                "BELOW_NORMAL": 10,
                "NORMAL": 0,
                "ABOVE_NORMAL": -5,
                "HIGH": -10
            }
            target_nice = posix_nice_map.get(normalized, 0)
            proc.nice(target_nice)

        new_nice = proc.nice()
        logger.info(f"[ProcessManager] Process priority changed to {normalized} (nice: {previous_nice} -> {new_nice})")
        return {
            "status": "SUCCESS",
            "previous_nice": previous_nice,
            "new_priority": normalized,
            "new_nice": new_nice,
            "revert_available": True
        }
    except getattr(psutil, "AccessDenied", PermissionError):
        return {"status": "FAILED", "reason": f"AccessDenied: elevating process priority to {normalized} requires elevated permissions."}
    except Exception as e:
        return {"status": "FAILED", "reason": f"Failed to set process priority: {str(e)}"}


def revert_process_controls() -> Dict[str, Any]:
    """
    Reverts CPU affinity and process priority back to initial captured baseline.
    """
    if not _INITIAL_STATE["captured"] or not PSUTIL_AVAILABLE:
        return {"status": "NOOP", "message": "No baseline state was modified or captured."}

    results = {}
    proc = psutil.Process()

    if _INITIAL_STATE["affinity"] is not None and hasattr(proc, "cpu_affinity"):
        try:
            proc.cpu_affinity(_INITIAL_STATE["affinity"])
            results["affinity_reverted"] = _INITIAL_STATE["affinity"]
        except Exception as e:
            results["affinity_revert_error"] = str(e)

    if _INITIAL_STATE["priority_nice"] is not None:
        try:
            proc.nice(_INITIAL_STATE["priority_nice"])
            results["priority_reverted"] = _INITIAL_STATE["priority_nice"]
        except Exception as e:
            results["priority_revert_error"] = str(e)

    results["status"] = "REVERTED"
    logger.info("[ProcessManager] Reverted process controls to initial baseline.")
    return results

