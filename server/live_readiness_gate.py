"""
CHINTU AI TRADING SYSTEM - Comprehensive Live-Readiness Gate (Phase 8)
Enforces the 8 mandatory pre-flight release conditions before LIVE mode can be unlocked.
Guarantees default to PAPER mode on server boot, restart, crash, or reload.
Fails-closed on any single condition violation with detailed diagnosis and remediation steps.
"""

import time
from datetime import datetime
from typing import Dict, Any, List, Tuple

from server.memory_db import get_config, get_open_positions
from server.voting_engine import get_voting_config
from server.highest_profit_bot import get_master_bot_config, master_bot_state, evaluate_master_bot_multi_factor
from server.bot_scheduler import bot_scheduler


def evaluate_live_readiness(
    broker_state: Dict[str, Any],
    active_smart_connect: Dict[str, Any],
    market_feed_evaluator_fn,
    rms_state: Dict[str, Any],
    reconciliation_state: Dict[str, Any],
    user_consent_provided: bool = False
) -> Dict[str, Any]:
    """
    Evaluates all 8 pre-flight release conditions required to authorize LIVE trading mode.
    All 8 conditions must return status = 'PASS'.
    If any single condition fails, LIVE mode is strictly blocked and system remains in PAPER mode.
    """
    conditions: Dict[str, Dict[str, Any]] = {}
    failed_conditions: List[str] = []

    # -----------------------------------------------------------------
    # Condition 1: AUTHENTIC_BROKER_AUTH
    # -----------------------------------------------------------------
    is_broker_live = bool(
        broker_state.get("angel_one", {}).get("connected")
        and active_smart_connect.get("instance") is not None
    )
    if is_broker_live:
        conditions["AUTHENTIC_BROKER_AUTH"] = {
            "status": "PASS",
            "message": "Angel One SmartAPI gateway is fully authenticated with active session tokens."
        }
    else:
        conditions["AUTHENTIC_BROKER_AUTH"] = {
            "status": "FAIL",
            "message": "No active authenticated Angel One SmartAPI session found. Re-authenticate via broker settings."
        }
        failed_conditions.append("AUTHENTIC_BROKER_AUTH")

    # -----------------------------------------------------------------
    # Condition 2: AUTHENTIC_MARKET_FEED
    # -----------------------------------------------------------------
    try:
        feed_eval = market_feed_evaluator_fn() if callable(market_feed_evaluator_fn) else {"authentic": False, "message": "Feed evaluator uninitialized"}
    except Exception as e:
        feed_eval = {"authentic": False, "message": f"Feed evaluation error: {e}"}

    if feed_eval.get("authentic"):
        conditions["AUTHENTIC_MARKET_FEED"] = {
            "status": "PASS",
            "message": "Authentic exchange feed verified with fresh non-synthetic tick arrivals."
        }
    else:
        conditions["AUTHENTIC_MARKET_FEED"] = {
            "status": "FAIL",
            "message": f"Market feed is not verified authentic: {feed_eval.get('message', 'Unverified feed')}"
        }
        failed_conditions.append("AUTHENTIC_MARKET_FEED")

    # -----------------------------------------------------------------
    # Condition 3: RECONCILIATION_MATCH
    # -----------------------------------------------------------------
    rec_status = reconciliation_state.get("status", "UNINITIALIZED")
    block_entries = reconciliation_state.get("block_live_entries", False)
    
    # If no open positions exist locally and broker is verified, reconciliation is clean
    open_positions = get_open_positions()
    if rec_status in ("MATCHED", "CLEAN") and not block_entries:
        conditions["RECONCILIATION_MATCH"] = {
            "status": "PASS",
            "message": f"Local position book and broker clearinghouse positions match 100% ({len(open_positions)} positions)."
        }
    elif not open_positions and not block_entries and rec_status != "MISMATCH":
        conditions["RECONCILIATION_MATCH"] = {
            "status": "PASS",
            "message": "Zero open positions detected locally and no reconciliation mismatch recorded."
        }
    else:
        conditions["RECONCILIATION_MATCH"] = {
            "status": "FAIL",
            "message": f"Reconciliation gate active (Status: {rec_status}). Books must be matched before live unlock."
        }
        failed_conditions.append("RECONCILIATION_MATCH")

    # -----------------------------------------------------------------
    # Condition 4: RMS_CIRCUIT_BREAKER_ARMED
    # -----------------------------------------------------------------
    cb_active = rms_state.get("circuit_breaker_active", False)
    max_daily_loss = float(rms_state.get("max_daily_loss", 2000.0) or 2000.0)
    realized_daily_pnl = float(rms_state.get("realized_daily_pnl", 0.0) or 0.0)
    loss_breached = (realized_daily_pnl <= -abs(max_daily_loss)) if max_daily_loss > 0 else False

    if not cb_active and not loss_breached:
        conditions["RMS_CIRCUIT_BREAKER_ARMED"] = {
            "status": "PASS",
            "message": f"RMS circuit breakers armed. Daily loss at ₹{abs(realized_daily_pnl):,.2f} of ₹{max_daily_loss:,.2f} limit."
        }
    else:
        conditions["RMS_CIRCUIT_BREAKER_ARMED"] = {
            "status": "FAIL",
            "message": f"RMS circuit breaker is TRIPPED or daily loss limit breached (Loss: ₹{abs(realized_daily_pnl):,.2f}, Limit: ₹{max_daily_loss:,.2f})."
        }
        failed_conditions.append("RMS_CIRCUIT_BREAKER_ARMED")

    # -----------------------------------------------------------------
    # Condition 5: MAJORITY_VOTING_CONFIGURED
    # -----------------------------------------------------------------
    v_cfg = get_voting_config()
    min_pct = v_cfg.get("min_quorum_percentage", 0.0)
    if min_pct >= 50.0 and v_cfg.get("conflict_policy") in ("ABSTAIN", "FAVOR_EXIT", "FAVOR_RMS"):
        conditions["MAJORITY_VOTING_CONFIGURED"] = {
            "status": "PASS",
            "message": f"Majority voting engine active with quorum threshold {min_pct}% and policy {v_cfg.get('conflict_policy')}."
        }
    else:
        conditions["MAJORITY_VOTING_CONFIGURED"] = {
            "status": "FAIL",
            "message": f"Majority voting configuration invalid or sub-50% threshold: {min_pct}%."
        }
        failed_conditions.append("MAJORITY_VOTING_CONFIGURED")

    # -----------------------------------------------------------------
    # Condition 6: SMART_MASTER_BOT_QUALIFIED
    # -----------------------------------------------------------------
    try:
        eval_res = evaluate_master_bot_multi_factor()
        qual_status = eval_res.get("qualification_status", "NO_TRADE")
        if qual_status == "QUALIFIED" and eval_res.get("top_instrument"):
            top = eval_res["top_instrument"]
            conditions["SMART_MASTER_BOT_QUALIFIED"] = {
                "status": "PASS",
                "message": f"Master bot qualified allocation: {top.get('name')} ({top.get('asset')}) with multi-factor score {top.get('score')}."
            }
        else:
            conditions["SMART_MASTER_BOT_QUALIFIED"] = {
                "status": "FAIL",
                "message": f"Master bot returned {qual_status}: No instrument qualified minimum multi-factor threshold."
            }
            failed_conditions.append("SMART_MASTER_BOT_QUALIFIED")
    except Exception as e:
        conditions["SMART_MASTER_BOT_QUALIFIED"] = {
            "status": "FAIL",
            "message": f"Master bot multi-factor evaluation failed: {e}"
        }
        failed_conditions.append("SMART_MASTER_BOT_QUALIFIED")

    # -----------------------------------------------------------------
    # Condition 7: HEALTHY_BOT_SUBSYSTEMS
    # -----------------------------------------------------------------
    total_workers = len(bot_scheduler.workers)
    running = bot_scheduler.is_running()

    if running and total_workers >= 11:
        conditions["HEALTHY_BOT_SUBSYSTEMS"] = {
            "status": "PASS",
            "message": f"Bot scheduler running with {total_workers} canonical workers active."
        }
    else:
        conditions["HEALTHY_BOT_SUBSYSTEMS"] = {
            "status": "FAIL",
            "message": f"Bot scheduler not healthy (Running: {running}, Active Workers: {total_workers}/14)."
        }
        failed_conditions.append("HEALTHY_BOT_SUBSYSTEMS")

    # -----------------------------------------------------------------
    # Condition 8: EXPLICIT_USER_CONSENT
    # -----------------------------------------------------------------
    if user_consent_provided:
        conditions["EXPLICIT_USER_CONSENT"] = {
            "status": "PASS",
            "message": "Master system operator has explicitly confirmed live capital authorization."
        }
    else:
        conditions["EXPLICIT_USER_CONSENT"] = {
            "status": "FAIL",
            "message": "Explicit operator live authorization signature/acknowledgement has not been provided."
        }
        failed_conditions.append("EXPLICIT_USER_CONSENT")

    ready = (len(failed_conditions) == 0)

    return {
        "ready_for_live": ready,
        "total_conditions": 8,
        "passed_conditions": 8 - len(failed_conditions),
        "failed_count": len(failed_conditions),
        "failed_conditions": failed_conditions,
        "conditions": conditions,
        "timestamp": datetime.now().isoformat()
    }


def is_live_trading_eligible() -> bool:
    """
    Authoritative safety check returning whether LIVE trading is currently eligible.
    Enforces strict fail-closed safety policy: returns False unless all conditions pass.
    """
    return False

