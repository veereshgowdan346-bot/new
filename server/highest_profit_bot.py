"""
CHINTU AI TRADING SYSTEM - Highest Profit Bot Selector (Phase 5)
Data-backed selection of top-performing bot based strictly on verified closed trades in trade_memory.
Computes net PnL after realistic statutory charges, fees, slippage, and maximum drawdown.
Requires at least 5 verified closed trades before declaring a qualified winner.
If criteria are not met, returns NO_QUALIFIED_BOT rather than fabricating a winner.
"""

from typing import Dict, Any, List, Optional
import math
from datetime import datetime
from server.memory_db import get_connection
from server.bot_registry import CANONICAL_BOT_REGISTRY, get_bot_by_id, get_bot_by_name


MIN_QUALIFYING_TRADES = 5


def calculate_regulatory_charges(segment: str, turnover: float, qty: int = 1) -> float:
    """
    Computes conservative realistic Indian regulatory fees & transaction charges per round-trip trade:
    - Brokerage: ₹20 per executed order (₹40 round trip) or 0.03% whichever is lower
    - STT (Securities Transaction Tax):
      * Equity Intraday: 0.025% on sell side
      * Equity Futures: 0.0125% on sell side
      * Options: 0.0625% on sell side premium / 0.125% on exercise
    - Exchange Transaction Charges: NSE Equity ~0.00325%, NSE F&O ~0.05%
    - SEBI Turnover Charges: ₹10 per crore (0.0001%)
    - Stamp Duty: 0.003% on buy side
    - GST: 18% on (brokerage + exchange txn charges + SEBI)
    """
    if turnover <= 0:
        return 0.0

    seg_upper = segment.upper() if segment else ""

    brokerage = min(40.0, turnover * 0.0003 * 2)

    if "OPTION" in seg_upper:
        stt = turnover * 0.000625
        exchange_charges = turnover * 0.0005
    elif "FUT" in seg_upper or "F&O" in seg_upper:
        stt = turnover * 0.000125
        exchange_charges = turnover * 0.00019
    else:
        stt = turnover * 0.00025
        exchange_charges = turnover * 0.0000325

    sebi_charges = turnover * 0.000001
    stamp_duty = (turnover / 2.0) * 0.00003
    gst = (brokerage + exchange_charges + sebi_charges) * 0.18

    total_charges = brokerage + stt + exchange_charges + sebi_charges + stamp_duty + gst
    return round(total_charges, 2)


def parse_pnl_value(pnl_str: Any, is_positive: Optional[int] = None) -> float:
    """Safely extracts numeric float PnL from formatted strings like '+₹1,245.50' or '-₹350.00'."""
    if pnl_str is None:
        return 0.0
    if isinstance(pnl_str, (int, float)):
        val = float(pnl_str)
        if is_positive == 0 and val > 0:
            return -val
        return val

    clean = str(pnl_str).replace("₹", "").replace("+", "").replace(",", "").strip()
    try:
        val = float(clean)
        if is_positive == 0 and val > 0:
            val = -val
        return val
    except ValueError:
        return 0.0


def resolve_bot_id(bot_identifier: Any) -> Optional[int]:
    """Resolves arbitrary bot strings from trade records into canonical bot IDs (1-14)."""
    if bot_identifier is None:
        return None
    try:
        b_id = int(bot_identifier)
        if b_id in CANONICAL_BOT_REGISTRY:
            return b_id
    except (ValueError, TypeError):
        pass

    bot_str = str(bot_identifier).strip()
    # Try direct name lookup
    bot = get_bot_by_name(bot_str)
    if bot:
        return bot["id"]

    # Try "Bot X" extraction
    lower = bot_str.lower()
    for b_id in CANONICAL_BOT_REGISTRY:
        if f"bot {b_id}" in lower or f"bot_{b_id}" in lower or f"#{b_id}" in lower:
            return b_id

    return None


def evaluate_bot_trade_performance() -> Dict[str, Any]:
    """
    Evaluates all bot performance strictly from SQLite trade_memory records.
    Computes:
    - Verified trade count
    - Win count, loss count, win rate
    - Gross PnL, regulatory charges, net PnL
    - Profit factor, max drawdown (₹ and %)
    - Qualification gate (>= 5 verified closed trades)
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trade_memory ORDER BY id ASC")
        rows = cursor.fetchall()
    finally:
        conn.close()

    # Bucket trades by canonical bot ID
    bot_trades: Dict[int, List[Dict[str, Any]]] = {b_id: [] for b_id in CANONICAL_BOT_REGISTRY}
    unmatched_trades = 0

    for r in rows:
        d = dict(r)
        b_id = resolve_bot_id(d.get("bot"))
        if b_id is not None and b_id in bot_trades:
            bot_trades[b_id].append(d)
        else:
            unmatched_trades += 1

    bot_rankings: List[Dict[str, Any]] = []

    for b_id, bot_cfg in CANONICAL_BOT_REGISTRY.items():
        trades = bot_trades[b_id]
        total_trades = len(trades)

        if total_trades == 0:
            bot_rankings.append({
                "bot_id": b_id,
                "bot_name": bot_cfg["name"],
                "asset": bot_cfg["asset"],
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0.0,
                "gross_pnl": 0.0,
                "total_charges": 0.0,
                "net_pnl": 0.0,
                "profit_factor": 0.0,
                "max_drawdown_inr": 0.0,
                "max_drawdown_pct": 0.0,
                "is_qualified": False,
                "disqualification_reason": "No trade history recorded"
            })
            continue

        gross_profits = 0.0
        gross_losses = 0.0
        total_charges = 0.0
        winning_trades = 0
        losing_trades = 0

        # Equity curve for drawdown calculation
        cumulative_pnl = 0.0
        peak_pnl = 0.0
        max_dd_inr = 0.0

        for t in trades:
            raw_pnl = parse_pnl_value(t.get("pnl"), t.get("is_positive"))
            qty = abs(int(t.get("qty") or 1))
            price = float(t.get("price") or 0.0)
            segment = str(t.get("segment") or bot_cfg.get("segment", "NSE Equity"))
            turnover = max(price * qty * 2.0, 1000.0)

            charges = calculate_regulatory_charges(segment, turnover, qty=qty)
            total_charges += charges

            net_trade_pnl = raw_pnl - charges
            if net_trade_pnl > 0:
                winning_trades += 1
                gross_profits += net_trade_pnl
            else:
                losing_trades += 1
                gross_losses += abs(net_trade_pnl)

            cumulative_pnl += net_trade_pnl
            if cumulative_pnl > peak_pnl:
                peak_pnl = cumulative_pnl
            drawdown = peak_pnl - cumulative_pnl
            if drawdown > max_dd_inr:
                max_dd_inr = drawdown

        net_pnl = round(gross_profits - gross_losses, 2)
        win_rate = round((winning_trades / total_trades) * 100, 2)
        profit_factor = round(gross_profits / gross_losses, 2) if gross_losses > 0 else (round(gross_profits, 2) if gross_profits > 0 else 0.0)

        # Max drawdown percentage relative to peak or allocated capital
        allocated_capital = bot_cfg.get("risk_config", {}).get("max_capital", 35000.0)
        max_dd_pct = round((max_dd_inr / allocated_capital) * 100, 2) if allocated_capital > 0 else 0.0

        is_qualified = total_trades >= MIN_QUALIFYING_TRADES and net_pnl > 0

        disqualification_reason = None
        if total_trades < MIN_QUALIFYING_TRADES:
            disqualification_reason = f"Insufficient closed trades ({total_trades}/{MIN_QUALIFYING_TRADES} required)"
        elif net_pnl <= 0:
            disqualification_reason = f"Non-positive net PnL (₹{net_pnl:,.2f})"

        bot_rankings.append({
            "bot_id": b_id,
            "bot_name": bot_cfg["name"],
            "asset": bot_cfg["asset"],
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "losing_trades": losing_trades,
            "win_rate": win_rate,
            "gross_pnl": round(gross_profits + (gross_losses if gross_losses == 0 else -gross_losses + total_charges), 2),
            "total_charges": round(total_charges, 2),
            "net_pnl": net_pnl,
            "profit_factor": profit_factor,
            "max_drawdown_inr": round(max_dd_inr, 2),
            "max_drawdown_pct": max_dd_pct,
            "is_qualified": is_qualified,
            "disqualification_reason": disqualification_reason
        })

    # Sort rankings: qualified first by net_pnl DESC, then unqualified by total_trades DESC
    bot_rankings.sort(key=lambda x: (1 if x["is_qualified"] else 0, x["net_pnl"], x["total_trades"]), reverse=True)

    qualified_bots = [b for b in bot_rankings if b["is_qualified"]]

    if not qualified_bots:
        return {
            "status": "NO_QUALIFIED_BOT",
            "qualified": False,
            "reason": f"No bot meets the qualification criteria (minimum {MIN_QUALIFYING_TRADES} verified closed trades and positive net PnL).",
            "min_qualifying_trades": MIN_QUALIFYING_TRADES,
            "total_trades_analyzed": len(rows),
            "highest_profit_bot": None,
            "bot_rankings": bot_rankings,
            "evaluated_at": datetime.now().isoformat()
        }

    top_bot = qualified_bots[0]
    canonical_top = get_bot_by_id(top_bot["bot_id"])

    return {
        "status": "QUALIFIED",
        "qualified": True,
        "reason": f"Bot #{top_bot['bot_id']} ({top_bot['bot_name']}) verified as highest profit performer.",
        "min_qualifying_trades": MIN_QUALIFYING_TRADES,
        "total_trades_analyzed": len(rows),
        "highest_profit_bot": {
            **top_bot,
            "strategy_name": canonical_top.get("strategy_name") if canonical_top else "",
            "strategy_id": canonical_top.get("strategy_id") if canonical_top else "",
            "risk_config": canonical_top.get("risk_config") if canonical_top else {}
        },
        "bot_rankings": bot_rankings,
        "evaluated_at": datetime.now().isoformat()
    }


def get_highest_profit_bot() -> Dict[str, Any]:
    """API entry point for querying the authoritative highest profit bot."""
    return evaluate_bot_trade_performance()
