"""
CHINTU AI TRADING SYSTEM - Strategy Scanner & Analysis Service (Phase Master Upgrade)
Scans strategies for data dependency risks, look-ahead temporal leakage, overfitting,
transaction drag sensitivity under Indian market cost structure, and correlation clusters
to prevent sybil voting quorum inflation.
"""

import json
import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Set, Tuple

try:
    from server.bot_registry import CANONICAL_BOT_REGISTRY
except ImportError:
    from bot_registry import CANONICAL_BOT_REGISTRY


class StrategyScannerService:
    """
    Quantitative auditing and scanner engine for the shared Strategy Library.
    Audits single strategies or the entire library repository.
    """

    # Estimated Round-Trip Indian Regulatory Transaction Drag & Slippage
    # STT (0.0125% futures / 0.0625% options) + NSE Turnover + GST (18%) + SEBI + Stamp Duty + Slippage (0.05%)
    INTRADAY_EQUITY_DRAG_PCT = 0.065
    FUTURES_DRAG_PCT = 0.055
    OPTIONS_DRAG_PCT = 0.120

    @classmethod
    def scan_all_strategies(cls) -> Dict[str, Any]:
        """Scans all strategies currently in SQLite strategy_library and checks voting cluster risks."""
        from server.memory_db import list_strategies, get_bot_strategy_allocations

        all_strats = list_strategies()
        allocations = get_bot_strategy_allocations()

        evaluations = []
        healthy_count = 0
        warning_count = 0
        critical_count = 0

        for strat in all_strats:
            report = cls.scan_strategy(strat)
            evaluations.append(report)
            if report["risk_level"] == "HEALTHY":
                healthy_count += 1
            elif report["risk_level"] == "WARNING":
                warning_count += 1
            else:
                critical_count += 1

        # Perform Correlation Cluster Analysis across all strategies
        clusters, sybil_risks = cls._analyze_correlation_clusters(evaluations, allocations)

        # Build bot compatibility matrix
        bot_matrix = cls._build_bot_compatibility_matrix(evaluations)

        return {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "total_strategies": len(all_strats),
            "summary": {
                "healthy": healthy_count,
                "warning": warning_count,
                "critical": critical_count,
                "cluster_count": len(clusters),
                "sybil_quorum_risk_count": len(sybil_risks)
            },
            "evaluations": evaluations,
            "correlation_clusters": clusters,
            "sybil_quorum_risks": sybil_risks,
            "bot_compatibility_matrix": bot_matrix
        }

    @classmethod
    def scan_strategy(cls, strat: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deeply inspects a single strategy for:
        1. Specialized data feed dependencies (Options Greeks, Level 2/3 Order Book)
        2. Temporal look-ahead / data leakage risks
        3. Overfitting / parameter complexity
        4. Transaction cost drag sensitivity
        5. Compatible canonical bots
        """
        strat_id = strat.get("id", "unknown")
        name = strat.get("name", "Untitled")
        timeframe = str(strat.get("timeframe", "5m")).lower()
        category = strat.get("category", "")
        raw_source = str(strat.get("raw_source") or "")
        entry_rules = str(strat.get("entry_rules") or "")
        exit_rules = str(strat.get("exit_rules") or "")
        indicators = strat.get("indicators") or []
        parameters = strat.get("parameters") or {}
        risk_limits = strat.get("risk_limits") or {}

        issues = []
        warnings = []
        strengths = []

        # -------------------------------------------------------------
        # 1. Specialized Data Dependency Check
        # -------------------------------------------------------------
        requires_l2_greeks = False
        requires_l3_footprint = False

        full_text = f"{raw_source} {entry_rules} {exit_rules} {' '.join(str(i) for i in indicators)}".lower()

        if any(term in full_text for term in ["gamma", "delta", "greeks", "option chain", "iv skew"]):
            requires_l2_greeks = True
            warnings.append({
                "type": "DATA_DEPENDENCY",
                "message": "Strategy depends on Option Chain / Greeks. Requires live L2 Option Greeks stream; fails closed if unavailable."
            })

        if any(term in full_text for term in ["footprint", "order book", "level 2 depth", "level 3", "bid ask volume"]):
            requires_l3_footprint = True
            warnings.append({
                "type": "DATA_DEPENDENCY",
                "message": "Strategy depends on Order Book Depth / Footprint data. Requires authentic tick-level L3 depth."
            })

        # -------------------------------------------------------------
        # 2. Temporal Look-Ahead / Data Leakage Check
        # -------------------------------------------------------------
        lookahead_detected = False
        lookahead_patterns = [
            r"\[i\s*\+\s*[1-9]\]", r"\[index\s*\+\s*[1-9]\]", r"candles\[[0-9]{2,}\]",
            r"shift\(\s*-[1-9]\s*\)", r"future_close", r"lead\("
        ]
        for pat in lookahead_patterns:
            if re.search(pat, raw_source):
                lookahead_detected = True
                issues.append({
                    "type": "TEMPORAL_LEAKAGE",
                    "severity": "CRITICAL",
                    "message": f"Potential look-ahead bias detected matching pattern '{pat}'. Future bars must not be accessed."
                })
                break

        if not lookahead_detected:
            strengths.append("No temporal look-ahead leakage patterns detected.")

        # -------------------------------------------------------------
        # 3. Overfitting / Parameter Complexity Assessment
        # -------------------------------------------------------------
        num_indicators = len(indicators)
        num_params = len(parameters)
        overfit_risk = "LOW"

        if num_indicators >= 5 or num_params >= 8:
            overfit_risk = "HIGH"
            warnings.append({
                "type": "OVERFIT_RISK",
                "message": f"High parameter/indicator count ({num_indicators} indicators, {num_params} parameters). Increased risk of curve-fitting."
            })
        elif num_indicators >= 3 or num_params >= 5:
            overfit_risk = "MODERATE"
        else:
            strengths.append("Clean, parsimonious indicator profile with low risk of over-fitting.")

        # -------------------------------------------------------------
        # 4. Transaction Drag & Friction Sensitivity
        # -------------------------------------------------------------
        sl_pct = float(risk_limits.get("stop_loss_pct") or strat.get("stop_loss_pct") or 0.5)
        tgt_pct = float(risk_limits.get("target_pct") or strat.get("target_pct") or 1.0)

        # Baseline drag for timeframe
        if "1m" in timeframe:
            drag_estimate_pct = cls.FUTURES_DRAG_PCT * 1.5
            est_trades_per_day = 12
        elif "3m" in timeframe:
            drag_estimate_pct = cls.FUTURES_DRAG_PCT * 1.2
            est_trades_per_day = 6
        elif "5m" in timeframe:
            drag_estimate_pct = cls.FUTURES_DRAG_PCT
            est_trades_per_day = 4
        else:
            drag_estimate_pct = cls.INTRADAY_EQUITY_DRAG_PCT
            est_trades_per_day = 2

        # Friction drag ratio = drag / target profit
        friction_ratio = drag_estimate_pct / max(0.01, tgt_pct)
        if friction_ratio > 0.25:
            warnings.append({
                "type": "TRANSACTION_DRAG",
                "message": f"High transaction drag sensitivity: regulatory friction ({drag_estimate_pct:.3f}%) eats {friction_ratio*100:.1f}% of target profit ({tgt_pct}%). Consider wider targets."
            })
        else:
            strengths.append(f"Acceptable friction ratio ({friction_ratio*100:.1f}% of profit target).")

        # -------------------------------------------------------------
        # 5. Compatible Bot Matching
        # -------------------------------------------------------------
        compatible_bots = []
        supported_instruments = strat.get("supported_instruments") or []
        if isinstance(supported_instruments, str):
            try:
                supported_instruments = json.loads(supported_instruments)
            except Exception:
                supported_instruments = [supported_instruments]

        for b_id, bot_cfg in CANONICAL_BOT_REGISTRY.items():
            match_score = 0.0
            reasons = []

            # Asset match
            bot_asset = bot_cfg["asset"].upper()
            if any(bot_asset in str(si).upper() or str(si).upper() in bot_asset for si in supported_instruments):
                match_score += 40.0
                reasons.append("Instrument compatible")
            elif not supported_instruments or "ALL" in [str(s).upper() for s in supported_instruments]:
                match_score += 25.0
                reasons.append("Universal instrument")

            # Timeframe match
            bot_tf = bot_cfg["timeframe"].lower()
            if bot_tf == timeframe:
                match_score += 30.0
                reasons.append("Timeframe match")
            elif ("1m" in timeframe and "1m" in bot_tf) or ("5m" in timeframe and "5m" in bot_tf):
                match_score += 20.0
                reasons.append("Similar timeframe")

            # Data readiness match
            if requires_l2_greeks:
                if bot_cfg.get("required_data") == "OPTION_CHAIN_L2":
                    match_score += 30.0
                    reasons.append("L2 Options Greeks compatible")
                else:
                    match_score -= 50.0
            elif requires_l3_footprint:
                if bot_cfg.get("required_data") == "L3_FOOTPRINT_TICK":
                    match_score += 30.0
                    reasons.append("L3 Footprint compatible")
                else:
                    match_score -= 50.0
            else:
                match_score += 30.0
                reasons.append("Standard candle data compatible")

            if match_score >= 60.0:
                compatible_bots.append({
                    "bot_id": b_id,
                    "bot_name": bot_cfg["name"],
                    "asset": bot_cfg["asset"],
                    "timeframe": bot_cfg["timeframe"],
                    "match_score": min(100.0, max(0.0, match_score)),
                    "reasons": reasons
                })

        # Sort compatible bots by match score
        compatible_bots.sort(key=lambda x: x["match_score"], reverse=True)

        # Overall risk level
        if issues:
            risk_level = "CRITICAL"
        elif len(warnings) >= 2:
            risk_level = "WARNING"
        elif len(warnings) == 1:
            risk_level = "WARNING"
        else:
            risk_level = "HEALTHY"

        overall_score = max(0.0, 100.0 - (len(issues) * 40.0) - (len(warnings) * 12.0))

        return {
            "strategy_id": strat_id,
            "strategy_name": name,
            "version": strat.get("active_version", "v1.0.0"),
            "category": category,
            "timeframe": timeframe,
            "risk_level": risk_level,
            "audit_score": round(overall_score, 1),
            "overfit_risk": overfit_risk,
            "friction_metrics": {
                "estimated_drag_pct": round(drag_estimate_pct, 4),
                "friction_ratio_pct": round(friction_ratio * 100.0, 1),
                "min_recommended_target_pct": round(drag_estimate_pct * 3.0, 2)
            },
            "data_dependencies": {
                "requires_l2_greeks": requires_l2_greeks,
                "requires_l3_footprint": requires_l3_footprint
            },
            "issues": issues,
            "warnings": warnings,
            "strengths": strengths,
            "compatible_bots": compatible_bots,
            "indicators": indicators,
            "last_audited": datetime.now().isoformat()
        }

    @classmethod
    def _analyze_correlation_clusters(
        cls,
        evaluations: List[Dict[str, Any]],
        allocations: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Computes pairwise similarity across all strategies based on indicator overlap,
        timeframe, and category. Detects correlation clusters and Sybil voting quorum risks.
        """
        clusters = []
        sybil_risks = []

        # Build mapping of strategy_id to active bots
        strat_to_bots = {}
        for a in allocations:
            if a.get("is_active"):
                sid = a.get("strategy_id")
                strat_to_bots.setdefault(sid, []).append(a.get("bot_id"))

        n = len(evaluations)
        visited = set()

        for i in range(n):
            for j in range(i + 1, n):
                s1 = evaluations[i]
                s2 = evaluations[j]

                sim_score = cls._compute_similarity(s1, s2)
                if sim_score >= 0.65:
                    cluster_id = f"cluster_{s1['strategy_id']}_{s2['strategy_id']}"
                    cluster_item = {
                        "cluster_id": cluster_id,
                        "similarity_score": round(sim_score * 100.0, 1),
                        "strategy_1": {"id": s1["strategy_id"], "name": s1["strategy_name"]},
                        "strategy_2": {"id": s2["strategy_id"], "name": s2["strategy_name"]},
                        "shared_features": {
                            "timeframe": s1["timeframe"] if s1["timeframe"] == s2["timeframe"] else None,
                            "category_match": s1["category"] == s2["category"],
                            "shared_indicators": list(set(s1["indicators"]) & set(s2["indicators"]))
                        }
                    }
                    clusters.append(cluster_item)

                    # Check if both strategies are concurrently allocated to voting bots
                    bots_1 = strat_to_bots.get(s1["strategy_id"], [])
                    bots_2 = strat_to_bots.get(s2["strategy_id"], [])

                    if bots_1 and bots_2:
                        sybil_risks.append({
                            "severity": "HIGH",
                            "cluster_id": cluster_id,
                            "strategy_ids": [s1["strategy_id"], s2["strategy_id"]],
                            "strategy_names": [s1["strategy_name"], s2["strategy_name"]],
                            "allocated_bots": list(set(bots_1 + bots_2)),
                            "similarity_pct": round(sim_score * 100.0, 1),
                            "warning": (
                                f"Quorum Inflation Warning: Strategy '{s1['strategy_name']}' and '{s2['strategy_name']}' "
                                f"share {round(sim_score * 100.0, 1)}% structural similarity and are both allocated to voting bots "
                                f"({bots_1} & {bots_2}). Their votes may not represent independent consensus."
                            )
                        })

        return clusters, sybil_risks

    @staticmethod
    def _compute_similarity(s1: Dict[str, Any], s2: Dict[str, Any]) -> float:
        """Calculates normalized Jaccard-like similarity score between two strategies (0.0 to 1.0)."""
        score = 0.0

        # Timeframe match (25%)
        if s1.get("timeframe") == s2.get("timeframe"):
            score += 0.25

        # Category match (25%)
        if s1.get("category") and s1.get("category") == s2.get("category"):
            score += 0.25

        # Indicator Jaccard overlap (50%)
        ind1 = set(str(i).lower() for i in s1.get("indicators", []))
        ind2 = set(str(i).lower() for i in s2.get("indicators", []))

        if ind1 and ind2:
            intersection = len(ind1 & ind2)
            union = len(ind1 | ind2)
            jaccard = intersection / max(1, union)
            score += 0.50 * jaccard
        elif not ind1 and not ind2:
            score += 0.20

        return round(score, 3)

    @staticmethod
    def _build_bot_compatibility_matrix(evaluations: List[Dict[str, Any]]) -> Dict[int, List[Dict[str, Any]]]:
        """Maps each bot (1-14) to the strategies it is compatible with."""
        bot_matrix = {b_id: [] for b_id in range(1, 15)}

        for ev in evaluations:
            for cb in ev.get("compatible_bots", []):
                b_id = cb.get("bot_id")
                if b_id in bot_matrix:
                    bot_matrix[b_id].append({
                        "strategy_id": ev["strategy_id"],
                        "strategy_name": ev["strategy_name"],
                        "match_score": cb["match_score"],
                        "reasons": cb["reasons"],
                        "audit_score": ev["audit_score"],
                        "risk_level": ev["risk_level"]
                    })

        # Sort each bot's list by match_score
        for b_id in bot_matrix:
            bot_matrix[b_id].sort(key=lambda x: x["match_score"], reverse=True)

        return bot_matrix

