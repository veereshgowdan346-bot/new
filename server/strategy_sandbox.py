"""
CHINTU AI TRADING SYSTEM - Strategy Subprocess Sandbox Host
Executes untrusted strategy code in an isolated, out-of-process Python environment
with stripped environment variables (zero broker credentials/tokens) and strict CPU timeout enforcement.
"""

import subprocess
import sys
import os
import json
from typing import Dict, Any, Tuple, Optional

WORKER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sandbox_worker.py")


def execute_isolated_strategy(
    code: str,
    market_data: Dict[str, Any],
    timeout_seconds: float = 2.0
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Executes Python strategy code in a separate, isolated Python process.
    - Python flags: -I (isolated mode, ignores PYTHONPATH/PYTHONHOME), -s (no user site-dir)
    - Stripped environment: zero broker secrets, tokens, API keys, or Telegram credentials
    - Process-level timeout: kills process if execution exceeds timeout_seconds
    """
    if not code or not code.strip():
        return False, "Strategy code is empty.", None

    # Sanitize environment: only allow bare OS essentials required for process startup
    clean_env = {
        "SYSTEMROOT": os.environ.get("SYSTEMROOT", "C:\\Windows"),
        "PATH": os.environ.get("PATH", "")
    }

    payload = {
        "code": code,
        "market_data": market_data
    }
    input_data = json.dumps(payload)

    cmd = [sys.executable, "-I", "-s", WORKER_SCRIPT]

    try:
        proc = subprocess.run(
            cmd,
            input=input_data,
            capture_output=True,
            text=True,
            env=clean_env,
            timeout=timeout_seconds
        )

        stdout = proc.stdout.strip()
        stderr = proc.stderr.strip()

        if proc.returncode != 0 and not stdout:
            return False, f"Worker process crashed (exit code {proc.returncode}): {stderr}", None

        if not stdout:
            return False, f"Worker process produced no output. Stderr: {stderr}", None

        # Parse worker JSON output
        try:
            output = json.loads(stdout)
        except json.JSONDecodeError:
            return False, f"Failed to parse worker output: {stdout[:200]}", None

        if output.get("success"):
            return True, "Execution succeeded.", output.get("result")
        else:
            return False, output.get("error", "Unknown worker error."), None

    except subprocess.TimeoutExpired:
        return False, f"Resource Limit Error: Strategy execution timed out (> {timeout_seconds}s). Infinite loops or excessive computation prohibited.", None
    except Exception as e:
        return False, f"Subprocess runner error: {type(e).__name__}: {str(e)}", None

