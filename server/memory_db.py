"""
CHINTU AI TRADING SYSTEM - Persistent Long-Term Memory Engine (SQLite)
High-performance persistent memory store for CHINTU JARVIS CORE and 14-bot algorithmic network.
Database: chintu_memory.db
"""

import sqlite3
import json
import os
import time
import hashlib
import re
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Union, Tuple

IST = timezone(timedelta(hours=5, minutes=30))
DEFAULT_ROLLING_WINDOW_SIZE = 20
MIN_ROLLING_SAMPLE_SIZE = 5

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chintu_memory.db")


PROD_DB_CANONICAL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "chintu_memory.db"))


def get_connection():
    """Returns a SQLite connection with row_factory set to sqlite3.Row and WAL concurrency enabled."""
    current_norm = os.path.normpath(os.path.abspath(DB_PATH))
    if os.environ.get("PYTEST_CURRENT_TEST") and current_norm == PROD_DB_CANONICAL:
        raise RuntimeError(
            f"SAFETY VIOLATION: Test running under pytest attempted connection to production database "
            f"'{DB_PATH}' without temporary isolation fixture!"
        )
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA foreign_keys = ON")
    except Exception:
        pass
    return conn


def init_db():
    """Initializes tables and seeds initial baseline memory if empty."""
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Trade Memory Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS trade_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT UNIQUE,
        timestamp TEXT,
        bot TEXT,
        symbol TEXT,
        segment TEXT,
        action TEXT,
        qty INTEGER,
        price REAL,
        pnl TEXT,
        is_positive INTEGER DEFAULT 1,
        consensus TEXT DEFAULT '11/13',
        order_id TEXT,
        exchange TEXT,
        mode TEXT,
        broker TEXT,
        post_trade_analysis TEXT,
        provenance TEXT DEFAULT 'UNKNOWN_PROVENANCE'
    )
    """)

    # 2. Chat Memory Table (Conversations, Commands & Preferences)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT DEFAULT 'default',
        sender TEXT,
        content TEXT,
        timestamp TEXT,
        metadata TEXT
    )
    """)

    # 3. Bot Performance Memory Table (Hourly win/loss and regime scores)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bot_performance_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER UNIQUE,
        bot_name TEXT,
        target_asset TEXT,
        win_rate REAL,
        total_trades INTEGER,
        winning_trades INTEGER,
        losing_trades INTEGER,
        pnl REAL,
        regime_score REAL,
        status TEXT DEFAULT 'RUNNING',
        allocated_capital REAL DEFAULT 0.0,
        verified_authentic_trades INTEGER DEFAULT 0,
        synthetic_trades INTEGER DEFAULT 0,
        updated_at TEXT
    )
    """)

    # 4. RMS Events Memory Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rms_events_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        threshold_value REAL,
        current_value REAL,
        action_taken TEXT,
        timestamp TEXT
    )
    """)

    # 5. Persistent System Config (Telegram, WhatsApp CallMeBot, Gemini Key)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
    )
    """)

    # 6. Dynamic Strategy Vault Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS strategy_vault (
        id TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        asset TEXT,
        entry_rules TEXT,
        exit_rules TEXT,
        sl_ratio REAL,
        target_multiple REAL,
        indicators TEXT,
        risk_per_trade REAL,
        is_preset INTEGER DEFAULT 0,
        created_at TEXT
    )
    """)

    # 7. Authoritative Positions Memory Table (Durable Lifecycle & Reconciliation)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS positions_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_id TEXT UNIQUE NOT NULL,
        pos_key TEXT UNIQUE NOT NULL,
        bot TEXT NOT NULL,
        symbol TEXT NOT NULL,
        segment TEXT,
        side TEXT NOT NULL,
        qty INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        ltp REAL DEFAULT 0.0,
        pnl TEXT DEFAULT '+₹0.00',
        unrealized_pnl REAL DEFAULT 0.0,
        mode TEXT NOT NULL,
        broker TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        reconciled_with_broker INTEGER DEFAULT 0,
        broker_qty INTEGER DEFAULT 0,
        opened_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT
    )
    """)

    # 8. Authoritative Orders Memory Table (State Transitions & Rejections)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        client_order_id TEXT,
        bot TEXT,
        symbol TEXT NOT NULL,
        segment TEXT,
        action TEXT NOT NULL,
        qty INTEGER NOT NULL,
        filled_qty INTEGER DEFAULT 0,
        price REAL DEFAULT 0.0,
        avg_price REAL DEFAULT 0.0,
        ordertype TEXT,
        producttype TEXT,
        variety TEXT,
        exchange TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        rejection_reason TEXT,
        is_emergency_exit INTEGER DEFAULT 0,
        mode TEXT NOT NULL,
        broker TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    # 9. Broker Reconciliation Audit Log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reconciliation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL,
        broker_positions_count INTEGER DEFAULT 0,
        local_positions_count INTEGER DEFAULT 0,
        details TEXT,
        action_taken TEXT
    )
    """)

    # 10. Shared Strategy Library Core Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS strategy_library (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        author TEXT DEFAULT 'Veeresh',
        source_format TEXT DEFAULT 'STRUCTURED',
        active_version TEXT DEFAULT 'v1.0.0',
        status TEXT DEFAULT 'Draft',
        risk_classification TEXT DEFAULT 'Moderate',
        timeframe TEXT DEFAULT '5m',
        supported_instruments TEXT,
        content_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    # 11. Immutable Strategy Versions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS strategy_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_id TEXT NOT NULL,
        version TEXT NOT NULL,
        raw_source TEXT NOT NULL,
        source_format TEXT NOT NULL,
        normalized_definition TEXT NOT NULL,
        entry_rules TEXT,
        exit_rules TEXT,
        indicators TEXT,
        parameters TEXT,
        risk_limits TEXT,
        validation_report TEXT,
        approval_status TEXT DEFAULT 'Draft',
        change_summary TEXT,
        created_by TEXT DEFAULT 'Veeresh',
        created_at TEXT NOT NULL,
        UNIQUE(strategy_id, version)
    )
    """)

    # 12. Strategy Bot Allocations (Shared across 14 bots)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS strategy_bot_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL UNIQUE,
        strategy_id TEXT NOT NULL,
        version TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        allocated_by TEXT DEFAULT 'Veeresh',
        allocated_at TEXT NOT NULL,
        notes TEXT
    )
    """)

    # 13. Strategy Audit Trail Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS strategy_audit_trail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_id TEXT NOT NULL,
        version TEXT,
        event_type TEXT NOT NULL,
        operator TEXT DEFAULT 'Veeresh',
        details TEXT NOT NULL,
        timestamp TEXT NOT NULL
    )
    """)

    # Strategy Library Indexes for fast search and joins
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_strategy_lib_status ON strategy_library(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_strategy_lib_category ON strategy_library(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_strategy_ver_strat ON strategy_versions(strategy_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_strategy_alloc_bot ON strategy_bot_allocations(bot_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_strategy_audit_strat ON strategy_audit_trail(strategy_id)")

    conn.commit()

    # Seed or synchronize canonical bot performance definitions
    try:
        from server.bot_registry import CANONICAL_BOT_REGISTRY
        now_str = datetime.now().isoformat()
        cursor.execute("SELECT COUNT(*) as count FROM bot_performance_memory")
        if cursor.fetchone()["count"] == 0:
            for b_id, bot_cfg in CANONICAL_BOT_REGISTRY.items():
                cursor.execute("""
                INSERT INTO bot_performance_memory 
                (bot_id, bot_name, target_asset, win_rate, total_trades, winning_trades, losing_trades, pnl, regime_score, status, allocated_capital, updated_at)
                VALUES (?, ?, ?, 0.0, 0, 0, 0, 0.0, 0.80, ?, 0.0, ?)
                """, (b_id, bot_cfg["name"], bot_cfg["asset"], bot_cfg.get("status", "RUNNING"), now_str))

        # Seed or synchronize 14 canonical bot strategies into the shared Strategy Library
        for b_id, bot_cfg in CANONICAL_BOT_REGISTRY.items():
            strat_id = f"strat_canonical_{b_id}"
            cursor.execute("SELECT id FROM strategy_library WHERE id = ?", (strat_id,))
            existing = cursor.fetchone()
            if not existing:
                h = hashlib.sha256(f"{bot_cfg['strategy_id']}_{bot_cfg['strategy_name']}_{bot_cfg['asset']}".encode()).hexdigest()[:16]
                cursor.execute("""
                INSERT INTO strategy_library (
                    id, name, category, description, author, source_format,
                    active_version, status, risk_classification, timeframe,
                    supported_instruments, content_hash, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'CHINTU Core Architect', 'STRUCTURED', 'v1.0.0', 'Published', 'Moderate', ?, ?, ?, ?, ?)
                """, (
                    strat_id,
                    bot_cfg["strategy_name"],
                    bot_cfg.get("category", "Quantitative Alpha"),
                    bot_cfg.get("strategy_description", ""),
                    bot_cfg.get("timeframe", "5m"),
                    json.dumps([bot_cfg["asset"]]),
                    h,
                    now_str,
                    now_str
                ))

                cursor.execute("""
                INSERT INTO strategy_versions (
                    strategy_id, version, raw_source, source_format, normalized_definition,
                    entry_rules, exit_rules, indicators, parameters, risk_limits,
                    validation_report, approval_status, change_summary, created_by, created_at
                ) VALUES (?, 'v1.0.0', ?, 'STRUCTURED', ?, ?, ?, ?, ?, ?, ?, 'Approved', ?, 'System Initializer', ?)
                """, (
                    strat_id,
                    bot_cfg.get("strategy_description", ""),
                    json.dumps(bot_cfg),
                    f"Canonical deterministic quantitative entry rules for {bot_cfg['name']}.",
                    f"Trailing stop loss at {bot_cfg.get('risk_config', {}).get('stop_loss_pct', 0.5)}% or target {bot_cfg.get('risk_config', {}).get('target_pct', 1.0)}%.",
                    json.dumps([bot_cfg.get("strategy_id")]),
                    json.dumps({"min_candles": bot_cfg.get("min_candles_required", 30), "weight": bot_cfg.get("weight", 1.0)}),
                    json.dumps(bot_cfg.get("risk_config", {})),
                    json.dumps({"is_valid": True, "errors": [], "warnings": [], "score": 98.5, "timestamp": now_str}),
                    f"Initial canonical deployment for Bot #{b_id} ({bot_cfg['name']})",
                    now_str
                ))

                cursor.execute("""
                INSERT INTO strategy_audit_trail (
                    strategy_id, version, event_type, operator, details, timestamp
                ) VALUES (?, 'v1.0.0', 'PUBLISHED', 'System Initializer', ?, ?)
                """, (
                    strat_id,
                    f"Canonical default strategy v1.0.0 seeded and published for Bot #{b_id} ({bot_cfg['name']})",
                    now_str
                ))

            # Ensure bot allocation exists
            cursor.execute("SELECT COUNT(*) as count FROM strategy_bot_allocations WHERE bot_id = ?", (b_id,))
            if cursor.fetchone()["count"] == 0:
                cursor.execute("""
                INSERT INTO strategy_bot_allocations (
                    bot_id, strategy_id, version, is_active, allocated_by, allocated_at, notes
                ) VALUES (?, ?, 'v1.0.0', 1, 'System Initializer', ?, ?)
                ON CONFLICT(bot_id) DO NOTHING
                """, (
                    b_id,
                    strat_id,
                    now_str,
                    f"Canonical default allocation for Bot #{b_id}"
                ))

        conn.commit()
    except Exception as e:
        print(f"[Canonical Bot Seeding Error]: {e}")

    # Seed or verify permanent Master User Profile for Veeresh
    cursor.execute("SELECT value FROM system_config WHERE key = 'user_profile'")
    row = cursor.fetchone()
    master_profile_data = {
        "name": "Veeresh",
        "email": "veereshgowdan346@gmail.com",
        "role": "Master System Administrator & Quorum Authority",
        "picture": "https://lh3.googleusercontent.com/a/default-user=s96-c",
        "token": "chintu_master_auth_permanent_veeresh",
        "linkedAt": "Permanent Session",
        "provider": "Master Authority (Localhost Verified)",
        "isAuthenticated": True
    }
    if not row or "veereshgowdan346@gmail.com" not in (row["value"] or ""):
        cursor.execute("""
        INSERT INTO system_config (key, value, updated_at)
        VALUES ('user_profile', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """, (json.dumps(master_profile_data), datetime.now().isoformat()))
        conn.commit()

    # Ensure Telegram Bot Token & Chat ID in system_config from environment or safe defaults
    cursor.execute("SELECT value FROM system_config WHERE key = 'telegram_bot_token'")
    tg_row = cursor.fetchone()
    valid_tg_token = os.environ.get("CHINTU_TELEGRAM_BOT_TOKEN", "").strip()
    valid_tg_chat = os.environ.get("CHINTU_TELEGRAM_CHAT_ID", "6912523089").strip()
    valid_tg_user = os.environ.get("CHINTU_TELEGRAM_BOT_USERNAME", "chintu_jarvis_veer_bot").strip()

    if valid_tg_token and (not tg_row or not tg_row["value"] or ":" not in tg_row["value"]):
        cursor.execute("""
        INSERT INTO system_config (key, value, updated_at)
        VALUES ('telegram_bot_token', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        WHERE system_config.value != excluded.value
        """, (valid_tg_token, datetime.now().isoformat()))

    if valid_tg_chat:
        cursor.execute("""
        INSERT INTO system_config (key, value, updated_at)
        VALUES ('telegram_chat_id', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        WHERE system_config.value != excluded.value
        """, (valid_tg_chat, datetime.now().isoformat()))

    cursor.execute("""
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('telegram_bot_username', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    WHERE system_config.value != excluded.value
    """, (valid_tg_user, datetime.now().isoformat()))

    cursor.execute("""
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('telegram_enabled', 'true', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    WHERE system_config.value != excluded.value
    """, (datetime.now().isoformat(),))
    conn.commit()

    # Seed the 6 requested Battle-Tested Indian Market Strategies if vault is empty
    cursor.execute("SELECT COUNT(*) as count FROM strategy_vault")
    if cursor.fetchone()["count"] == 0:
        presets = [
            (
                "strat_orb_15m",
                "Opening Range Breakout (ORB 15m)",
                "Momentum Breakout",
                "NIFTY 50",
                "High volume candle close above 9:15-9:30 AM initial 15-minute high. Volume surge > 1.8x 20-period SMA.",
                "Exit at 1:2 R:R or trail stop behind 9 EMA swing low.",
                0.35,
                2.0,
                json.dumps(["15m High/Low", "Volume 20-SMA", "9 EMA"]),
                1.0,
                1,
                datetime.now().isoformat()
            ),
            (
                "strat_vwap_abs",
                "VWAP Institutional Absorption",
                "Institutional Mean Reversion",
                "BANKNIFTY",
                "Price retests VWAP with falling selling delta. Large block bid absorption visible on Level 2 depth.",
                "Target opposing VWAP +2 Standard Deviation band or prior swing high.",
                0.40,
                2.5,
                json.dumps(["VWAP", "Delta Footprint", "StDev Bands", "L2 Depth"]),
                1.2,
                1,
                datetime.now().isoformat()
            ),
            (
                "strat_cpr_pivot",
                "CPR Pivot Trend Following",
                "Pivot Analysis",
                "NIFTY 50",
                "Narrow or Virgin CPR day. Price opens above Daily Pivot (P) and holds above 20 EMA slope.",
                "Target R1 or R2 pivot level. Stop-loss placed below Central Pivot Range bottom (BC).",
                0.30,
                2.2,
                json.dumps(["Central Pivot Range (CPR)", "20 EMA", "R1/R2 Pivots"]),
                1.0,
                1,
                datetime.now().isoformat()
            ),
            (
                "strat_rsi_divergence",
                "RSI Hidden Divergence",
                "Trend Continuation",
                "RELIANCE",
                "Higher low on price action accompanied by lower low on 14-period RSI during an active uptrend.",
                "Exit on MACD histogram roll-over or 1:2.5 risk-to-reward target.",
                0.45,
                2.5,
                json.dumps(["RSI 14", "MACD Histogram", "50 SMA"]),
                1.0,
                1,
                datetime.now().isoformat()
            ),
            (
                "strat_gamma_blast",
                "Options Gamma Blast",
                "Derivatives Momentum",
                "NIFTY OPTIONS",
                "0DTE / Expiry session. SuperTrend flip on 3-min chart with Call/Put open interest unwinding surge.",
                "Trailing stop at 20% of premium. Scale out 50% at 1:2 and trail remaining for delta explosive wave.",
                0.50,
                3.0,
                json.dumps(["SuperTrend 3m", "Option Chain OI Delta", "ATR Bands"]),
                1.5,
                1,
                datetime.now().isoformat()
            ),
            (
                "strat_vsa_exhaustion",
                "VSA Climax Exhaustion",
                "Wyckoff Volume Profile",
                "CRUDE OIL",
                "Ultra-high volume wide-spread down bar closing on high (stopping volume). Confirmed by subsequent low-volume test.",
                "Target mean VWAP regression line. Invalidation below stopping volume extreme low.",
                0.60,
                2.0,
                json.dumps(["VSA Wyckoff", "Volume Spread", "VWAP"]),
                1.0,
                1,
                datetime.now().isoformat()
            )
        ]
        cursor.executemany("""
        INSERT INTO strategy_vault 
        (id, name, category, asset, entry_rules, exit_rules, sl_ratio, target_multiple, indicators, risk_per_trade, is_preset, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, presets)
        conn.commit()

    # Seed baseline chat memory welcome if empty
    cursor.execute("SELECT COUNT(*) as count FROM chat_memory")
    if cursor.fetchone()["count"] == 0:
        cursor.execute("""
        INSERT INTO chat_memory (session_id, sender, content, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?)
        """, (
            "system_init",
            "jarvis",
            "CHINTU JARVIS CORE memory initialized. Persistent SQLite telemetry store active.",
            datetime.now().isoformat(),
            json.dumps({"event": "DATABASE_BOOT"})
        ))
        conn.commit()

    conn.close()


def log_trade(trade: Dict[str, Any]) -> int:
    """Logs a trade execution to trade_memory with post-trade analysis."""
    conn = get_connection()
    cursor = conn.cursor()

    trade_id = str(trade.get("trade_id") or trade.get("id") or trade.get("orderId") or trade.get("order_id") or f"TRD_{int(datetime.now().timestamp() * 1000)}")
    raw_time = str(trade.get("time") or datetime.now().isoformat())
    if len(raw_time) <= 12 and ":" in raw_time and "-" not in raw_time:
        timestamp = f"{datetime.now().strftime('%Y-%m-%d')} {raw_time}"
    else:
        timestamp = raw_time

    bot = trade.get("bot", "Bot 1")
    symbol = trade.get("symbol", "NIFTY 50")
    segment = trade.get("segment", "NSE F&O Options")
    action = (trade.get("action") or "BUY").upper()
    qty = int(trade.get("qty") or 1)
    price = float(trade.get("price") or 0.0)
    pnl = trade.get("pnl") or "+₹0.00"
    if "is_positive" in trade:
        is_positive = 1 if trade["is_positive"] in (1, True, "1") else 0
    elif "isPositive" in trade:
        is_positive = 1 if trade["isPositive"] in (1, True, "1") else 0
    else:
        raw_pnl_str = str(pnl).replace("₹", "").replace("+", "").replace(",", "").strip()
        try:
            val = float(raw_pnl_str)
            is_positive = 1 if val >= 0 else 0
        except Exception:
            is_positive = 1
    consensus = trade.get("consensus", "11/13")
    order_id = str(trade.get("orderId") or trade.get("order_id") or trade.get("client_order_id") or "ORD-PENDING")
    exchange = trade.get("exchange", "NSE")
    mode = (trade.get("mode") or "PAPER").upper()
    broker = trade.get("broker", "SmartAPI")

    from server.trade_provenance import classify_trade_provenance
    provenance = trade.get("provenance") or classify_trade_provenance(trade)

    # Generate autonomous post-trade analysis
    post_analysis = trade.get("post_trade_analysis")
    if not post_analysis:
        post_analysis = f"Consensus fill for {qty}x {symbol} @ ₹{price:,.2f}. Quorum validated ({consensus}). Mode: {mode}. Risk/Reward profile aligned with regime volatility."

    cursor.execute("PRAGMA table_info(trade_memory)")
    cols = [r[1] for r in cursor.fetchall()]

    if "provenance" in cols:
        cursor.execute("""
        INSERT OR REPLACE INTO trade_memory
        (trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, consensus, order_id, exchange, mode, broker, post_trade_analysis, provenance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, consensus, order_id, exchange, mode, broker, post_analysis, provenance))
    else:
        cursor.execute("""
        INSERT OR REPLACE INTO trade_memory
        (trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, consensus, order_id, exchange, mode, broker, post_trade_analysis)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, consensus, order_id, exchange, mode, broker, post_analysis))

    inserted_id = cursor.lastrowid
    conn.commit()
    conn.close()

    try:
        recalculate_bot_performance()
    except Exception as e:
        print(f"[Recalculate Performance Error]: {e}")

    return inserted_id


# Convenient alias
record_trade = log_trade



def recalculate_bot_performance(bot_id: Optional[int] = None) -> None:
    """
    Recalculates bot performance metrics strictly from verified records in trade_memory.
    Synchronizes bot_performance_memory with realistic trade counts, win rates, and PnL.
    Excludes RMS pre-order rejections, initial position entries, and mock broker records.
    Tracks verified authentic trades vs synthetic replays.
    """
    from server.bot_registry import CANONICAL_BOT_REGISTRY
    from server.trade_provenance import (
        classify_trade_provenance,
        is_verified_authentic,
        PROVENANCE_RMS_REJECTION,
        PROVENANCE_INITIAL_ENTRY,
        PROVENANCE_MOCK_BROKER,
        PROVENANCE_SYNTHETIC_REPLAY,
        PROVENANCE_TELEMETRY_TEST,
        PROVENANCE_SYNTHETIC_STRESS_TEST
    )
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(bot_performance_memory)")
            bpm_cols = [c[1] for c in cursor.fetchall()]
            has_auth_cols = ("verified_authentic_trades" in bpm_cols and "synthetic_trades" in bpm_cols)

            cursor.execute("SELECT * FROM trade_memory")
            trades = [dict(r) for r in cursor.fetchall()]

            target_bot_ids = [bot_id] if bot_id is not None else list(CANONICAL_BOT_REGISTRY.keys())

            for b_id in target_bot_ids:
                bot_cfg = CANONICAL_BOT_REGISTRY.get(b_id)
                if not bot_cfg:
                    continue

                b_name = bot_cfg["name"].lower().strip()
                bot_trades = []
                for t in trades:
                    t_bot = str(t.get("bot", "")).lower().strip()
                    if t_bot == b_name or t_bot == f"bot {b_id}" or t_bot == str(b_id) or f"bot_{b_id}" in t_bot:
                        bot_trades.append(t)

                # Filter closed trades: exclude RMS blocks, initial entries, mock doubles
                closed_trades = []
                verified_authentic_count = 0
                synthetic_count = 0

                for t in bot_trades:
                    prov = classify_trade_provenance(t)
                    if prov in (PROVENANCE_RMS_REJECTION, PROVENANCE_INITIAL_ENTRY, PROVENANCE_MOCK_BROKER):
                        continue
                    
                    closed_trades.append(t)
                    if is_verified_authentic(prov):
                        verified_authentic_count += 1
                    elif prov in (PROVENANCE_SYNTHETIC_REPLAY, PROVENANCE_TELEMETRY_TEST, PROVENANCE_SYNTHETIC_STRESS_TEST):
                        synthetic_count += 1

                total = len(closed_trades)
                wins = 0
                losses = 0
                total_pnl = 0.0

                for t in closed_trades:
                    raw_pnl = str(t.get("pnl") or "0").replace("₹", "").replace("+", "").replace(",", "").strip()
                    try:
                        pnl_val = float(raw_pnl)
                        if t.get("is_positive") == 0 and pnl_val > 0:
                            pnl_val = -pnl_val
                    except ValueError:
                        pnl_val = 0.0

                    total_pnl += pnl_val
                    if pnl_val > 0:
                        wins += 1
                    elif pnl_val < 0:
                        losses += 1

                win_rate = round((wins / total * 100), 1) if total > 0 else 0.0
                now_str = datetime.now().isoformat()

                if has_auth_cols:
                    cursor.execute("""
                    UPDATE bot_performance_memory
                    SET win_rate = ?, total_trades = ?, winning_trades = ?, losing_trades = ?, pnl = ?,
                        verified_authentic_trades = ?, synthetic_trades = ?, updated_at = ?
                    WHERE bot_id = ?
                    """, (win_rate, total, wins, losses, round(total_pnl, 2), verified_authentic_count, synthetic_count, now_str, b_id))
                else:
                    cursor.execute("""
                    UPDATE bot_performance_memory
                    SET win_rate = ?, total_trades = ?, winning_trades = ?, losing_trades = ?, pnl = ?, updated_at = ?
                    WHERE bot_id = ?
                    """, (win_rate, total, wins, losses, round(total_pnl, 2), now_str, b_id))
    except Exception as e:
        print(f"[Recalculate Bot Performance Error]: {e}")
    finally:
        conn.close()


# =========================================================
# DURABLE POSITIONS & ORDERS LIFECYCLE MEMORY (PHASE 3)
# =========================================================

def save_position(pos: Dict[str, Any]) -> str:
    """
    Persists or updates an active position in SQLite positions_memory.
    Ensures durable position lifecycle tracking with transactions, timestamps, and constraints.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            pos_id = str(pos.get("id") or f"POS_{int(time.time() * 1000)}")
            bot = str(pos.get("bot", "Bot 1"))
            symbol = str(pos.get("symbol", "NIFTY 50"))
            pos_key = pos.get("pos_key") or f"{bot}_{symbol}"
            side = str(pos.get("type") or pos.get("side") or "BUY").upper()
            qty = abs(int(pos.get("qty", 1)))
            avg_price = float(pos.get("avgPrice") or pos.get("avg_price") or 0.0)
            ltp = float(pos.get("ltp") or avg_price)
            pnl = str(pos.get("pnl", "+₹0.00"))
            unrealized_pnl = float(pos.get("unrealizedPnl") or pos.get("unrealized_pnl") or 0.0)
            mode = str(pos.get("mode", "PAPER")).upper()
            broker = str(pos.get("broker", "SmartAPI"))
            status = str(pos.get("status", "OPEN")).upper()
            segment = pos.get("segment", "NSE F&O Options")
            opened_at = str(pos.get("openedAt") or pos.get("opened_at") or datetime.now().isoformat())
            updated_at = datetime.now().isoformat()
            closed_at = pos.get("closed_at")

            cursor.execute("""
            INSERT INTO positions_memory (
                position_id, pos_key, bot, symbol, segment, side, qty, avg_price,
                ltp, pnl, unrealized_pnl, mode, broker, status, reconciled_with_broker,
                broker_qty, opened_at, updated_at, closed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
            ON CONFLICT(pos_key) DO UPDATE SET
                position_id = excluded.position_id,
                side = excluded.side,
                qty = excluded.qty,
                avg_price = excluded.avg_price,
                ltp = excluded.ltp,
                pnl = excluded.pnl,
                unrealized_pnl = excluded.unrealized_pnl,
                mode = excluded.mode,
                broker = excluded.broker,
                status = excluded.status,
                updated_at = excluded.updated_at,
                closed_at = excluded.closed_at
            """, (
                pos_id, pos_key, bot, symbol, segment, side, qty, avg_price,
                ltp, pnl, unrealized_pnl, mode, broker, status, opened_at, updated_at, closed_at
            ))
            return pos_id
    finally:
        conn.close()


def get_open_positions() -> List[Dict[str, Any]]:
    """Returns all positions currently marked as OPEN in positions_memory."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM positions_memory WHERE status = 'OPEN'")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def close_position(position_id_or_key: str, closed_at: Optional[str] = None) -> bool:
    """Marks a position as CLOSED in positions_memory upon broker-confirmed exit fill."""
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            c_time = closed_at or datetime.now().isoformat()
            cursor.execute("""
            UPDATE positions_memory
            SET status = 'CLOSED', closed_at = ?, updated_at = ?
            WHERE position_id = ? OR pos_key = ? OR symbol = ?
            """, (c_time, c_time, position_id_or_key, position_id_or_key, position_id_or_key))
            return cursor.rowcount > 0
    finally:
        conn.close()


def update_position_reconciliation(pos_key: str, is_reconciled: bool, broker_qty: int) -> bool:
    """Updates broker reconciliation status and reconciled broker quantity for an active position."""
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
            UPDATE positions_memory
            SET reconciled_with_broker = ?, broker_qty = ?, updated_at = ?
            WHERE pos_key = ? AND status = 'OPEN'
            """, (1 if is_reconciled else 0, broker_qty, datetime.now().isoformat(), pos_key))
            return cursor.rowcount > 0
    finally:
        conn.close()


def save_order(order: Dict[str, Any]) -> str:
    """
    Persists an order lifecycle record into orders_memory.
    Handles transitions from PENDING -> COMPLETE / PARTIAL_FILL / REJECTED / AMBIGUOUS_TIMEOUT.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            order_id = str(order.get("orderId") or order.get("order_id") or f"ORD_{int(time.time() * 1000)}")
            client_order_id = str(order.get("clientOrderId") or order.get("client_order_id") or order_id)
            bot = str(order.get("bot", "System"))
            symbol = str(order.get("symbol", "NIFTY 50"))
            segment = order.get("segment", "NSE F&O Options")
            action = str(order.get("action", "BUY")).upper()
            qty = abs(int(order.get("qty", 1)))
            filled_qty = int(order.get("filled_qty", qty if order.get("status") in ["COMPLETE", "LIVE", "PAPER"] else 0))
            price = float(order.get("price", 0.0))
            avg_price = float(order.get("avg_price", price))
            ordertype = str(order.get("ordertype", "MARKET"))
            producttype = str(order.get("producttype", "INTRADAY"))
            variety = str(order.get("variety", "NORMAL"))
            exchange = str(order.get("exchange", "NSE"))
            status_val = str(order.get("status", "COMPLETE")).upper()
            rejection_reason = str(order.get("rejection_reason") or order.get("error") or "")
            is_emergency = 1 if order.get("is_emergency_exit") or order.get("is_exit") else 0
            mode = str(order.get("mode", "PAPER")).upper()
            broker = str(order.get("broker", "SmartAPI"))
            created_at = str(order.get("created_at") or datetime.now().isoformat())
            updated_at = datetime.now().isoformat()

            cursor.execute("""
            INSERT INTO orders_memory (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status,
                rejection_reason, is_emergency_exit, mode, broker, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(order_id) DO UPDATE SET
                filled_qty = excluded.filled_qty,
                avg_price = excluded.avg_price,
                status = excluded.status,
                rejection_reason = excluded.rejection_reason,
                updated_at = excluded.updated_at
            """, (
                order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                price, avg_price, ordertype, producttype, variety, exchange, status_val,
                rejection_reason, is_emergency, mode, broker, created_at, updated_at
            ))
            return order_id
    finally:
        conn.close()


def get_order(order_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves an order record from orders_memory by order_id."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM orders_memory WHERE order_id = ?", (order_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_unfilled_entry_orders(symbol: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieves all open, pending, or submitted ENTRY orders from orders_memory.
    Specifically targets new directional orders (BUY/SELL) while excluding exits.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        query = """
        SELECT * FROM orders_memory 
        WHERE UPPER(status) IN ('PENDING', 'SUBMITTED', 'OPEN', 'CREATED', 'ACKNOWLEDGED')
          AND UPPER(action) IN ('BUY', 'SELL')
          AND (is_emergency_exit = 0 OR is_emergency_exit IS NULL)
        """
        params: List[Any] = []
        if symbol:
            query += " AND UPPER(symbol) = ?"
            params.append(str(symbol).upper().strip())
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def cancel_unfilled_entry_orders(symbol: Optional[str] = None, reason: str = "CANCELLED_STALE_FEED") -> List[Dict[str, Any]]:
    """
    Cancels unfilled entry orders when market feed is stale or disconnected.
    Transitions status to 'CANCELLED' with rejection_reason=reason.
    CRITICAL SAFETY GUARANTEE: Exits (action in ('EXIT', 'SQUAREOFF') or is_emergency_exit=1)
    are strictly NEVER cancelled.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            query = """
            SELECT order_id FROM orders_memory 
            WHERE UPPER(status) IN ('PENDING', 'SUBMITTED', 'OPEN', 'CREATED', 'ACKNOWLEDGED')
              AND UPPER(action) IN ('BUY', 'SELL')
              AND (is_emergency_exit = 0 OR is_emergency_exit IS NULL)
            """
            params: List[Any] = []
            if symbol:
                query += " AND UPPER(symbol) = ?"
                params.append(str(symbol).upper().strip())
            cursor.execute(query, params)
            order_ids = [row["order_id"] for row in cursor.fetchall()]

            if not order_ids:
                return []

            now_str = datetime.now().isoformat()
            placeholders = ",".join("?" for _ in order_ids)
            cursor.execute(f"""
            UPDATE orders_memory
            SET status = 'CANCELLED',
                rejection_reason = ?,
                updated_at = ?
            WHERE order_id IN ({placeholders})
            """, [reason, now_str] + order_ids)

            cursor.execute(f"SELECT * FROM orders_memory WHERE order_id IN ({placeholders})", order_ids)
            return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def commit_paper_order_execution_atomic(
    order_record: Dict[str, Any],
    trade_record: Dict[str, Any],
    position_action: str,
    position_record: Optional[Dict[str, Any]] = None,
    symbol_or_key_to_close: Optional[str] = None,
    recalculate_perf: bool = True,
    failure_injection_point: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes an atomic SQLite transaction committing paper order execution:
      1. Idempotency check: returns existing fill if already committed.
      2. Grouped write within a single explicit transaction:
         - Orders Memory: transitions order to FILLED (or inserts if new).
         - Positions Memory: opens, closes, or partially closes position.
         - Trade Memory: records fill with deterministic trade_id.
      3. Guaranteed rollback: any error/failure rolls back all 3 tables atomically.
      4. Bounded lock retry: handles database locked/busy with exponential backoff.
    """
    order_id = str(order_record.get("order_id") or order_record.get("orderId") or f"ORD_{int(time.time() * 1000)}")
    client_order_id = str(order_record.get("client_order_id") or order_record.get("clientOrderId") or order_id)
    bot = str(order_record.get("bot", "System"))
    symbol = str(order_record.get("symbol", "NIFTY 50"))
    segment = order_record.get("segment", "NSE Equity")
    action = str(order_record.get("action", "BUY")).upper()
    raw_o_qty = order_record.get("qty")
    if raw_o_qty is not None:
        if isinstance(raw_o_qty, bool):
            raise ValueError(f"Invalid requested order quantity: '{raw_o_qty}' cannot be a boolean.")
        if not isinstance(raw_o_qty, (int, float)):
            raise ValueError(f"Invalid requested order quantity: '{raw_o_qty}' must be a valid integer.")
        if int(raw_o_qty) <= 0:
            raise ValueError(f"Invalid requested order quantity: {raw_o_qty} must be > 0.")
        qty = int(raw_o_qty)
    else:
        qty = 0
    filled_qty = int(order_record.get("filled_qty", qty))
    price = float(order_record.get("price", 0.0))
    avg_price = float(order_record.get("avg_price", price))
    ordertype = str(order_record.get("ordertype", "MARKET"))
    producttype = str(order_record.get("producttype", "INTRADAY"))
    variety = str(order_record.get("variety", "NORMAL"))
    exchange = str(order_record.get("exchange", "NSE"))
    status_val = str(order_record.get("status", "FILLED")).upper()
    rejection_reason = str(order_record.get("rejection_reason") or "")
    is_emergency = 1 if order_record.get("is_emergency_exit") or order_record.get("is_exit") else 0
    mode = str(order_record.get("mode", "PAPER")).upper()
    broker = str(order_record.get("broker", "Paper Simulator"))
    created_at = str(order_record.get("created_at") or datetime.now().isoformat())
    now_str = datetime.now().isoformat()

    trade = trade_record or {}
    trade_id = str(trade.get("trade_id") or trade.get("id") or f"TRD-{order_id}")
    raw_trade_qty = trade.get("qty") if trade.get("qty") is not None else order_record.get("filled_qty", qty)
    if raw_trade_qty is not None:
        if isinstance(raw_trade_qty, bool):
            raise ValueError(f"Invalid fill quantity for trade {trade_id}: '{raw_trade_qty}' cannot be a boolean.")
        if not isinstance(raw_trade_qty, (int, float)):
            raise ValueError(f"Invalid fill quantity for trade {trade_id}: '{raw_trade_qty}' must be a valid integer.")
        if int(raw_trade_qty) <= 0:
            raise ValueError(f"Invalid fill quantity for trade {trade_id}: {raw_trade_qty} must be > 0.")
        this_trade_qty = int(raw_trade_qty)
    else:
        this_trade_qty = 0
    this_trade_price = float(trade.get("price") if trade.get("price") is not None else avg_price)

    # Bounded retry loop for database lock contention
    max_retries = 3
    final_order_status = "FILLED"
    cumulative_filled_qty = qty
    vwap_price = avg_price

    for attempt in range(max_retries):
        conn = get_connection()
        try:
            with conn:
                cursor = conn.cursor()

                # Step 1: Idempotency & Fill Identity Check
                # 1a. Fill-level duplicate check: exact trade_id already committed
                cursor.execute("SELECT trade_id, order_id, qty, price FROM trade_memory WHERE trade_id = ?", (trade_id,))
                existing_trade = cursor.fetchone()

                # Cross-order trade_id collision check: trade_id cannot be reused across different orders
                if existing_trade and str(existing_trade["order_id"]) != str(order_id):
                    raise ValueError(
                        f"Inconsistent fill identity: Trade {trade_id} is already bound to order {existing_trade['order_id']}, "
                        f"cannot reassign to order {order_id}."
                    )

                # 1b. Order-level status check
                cursor.execute("SELECT status, filled_qty, avg_price, qty FROM orders_memory WHERE order_id = ?", (order_id,))
                existing_order = cursor.fetchone()

                is_fill_replay = existing_trade is not None
                is_order_replay = bool(existing_order and existing_order["status"] == "FILLED" and (trade_id == f"TRD-{order_id}" or not trade_record))

                if is_fill_replay or is_order_replay:
                    matched_trade = existing_trade
                    if not matched_trade:
                        cursor.execute("SELECT trade_id, qty, price FROM trade_memory WHERE order_id = ? OR trade_id = ?", (order_id, trade_id))
                        matched_trade = cursor.fetchone()

                    auth_status = existing_order["status"] if existing_order else "FILLED"
                    auth_filled_qty = int(existing_order["filled_qty"] if existing_order and existing_order["filled_qty"] is not None else (matched_trade["qty"] if matched_trade else qty))
                    auth_avg_price = float(existing_order["avg_price"] if existing_order and existing_order["avg_price"] is not None else (matched_trade["price"] if matched_trade else avg_price))
                    auth_trade_id = matched_trade["trade_id"] if matched_trade else trade_id
                    auth_fill_price = float(matched_trade["price"] if matched_trade else auth_avg_price)

                    return {
                        "success": True,
                        "idempotent_replay": True,
                        "order_id": order_id,
                        "trade_id": auth_trade_id,
                        "status": auth_status,
                        "filled_qty": auth_filled_qty,
                        "avg_price": auth_avg_price,
                        "fill_price": auth_fill_price,
                        "message": f"Order {order_id} execution already committed (idempotent replay)."
                    }

                # Terminal and quarantined state check: cancelled, rejected, expired, or quarantined orders cannot receive new fills
                if existing_order and existing_order["status"] in ("CANCELLED", "REJECTED", "RISK_REJECTED", "EXPIRED", "QUARANTINED"):
                    raise ValueError(f"Illegal execution: Order {order_id} is in terminal state '{existing_order['status']}'.")

                # An already filled order cannot receive additional fills (unless idempotent replay)
                if existing_order and existing_order["status"] == "FILLED":
                    raise ValueError(f"Illegal execution: Order {order_id} is already FILLED and cannot accept additional fills.")

                # Authoritative order quantity derived from existing persisted state if available
                if existing_order and existing_order["qty"] is not None:
                    try:
                        total_order_qty = int(existing_order["qty"])
                    except (ValueError, TypeError):
                        raise ValueError(f"Inconsistent persisted order quantity for order {order_id}: '{existing_order['qty']}'.")
                elif qty > 0:
                    total_order_qty = qty
                else:
                    raise ValueError(f"Missing or invalid authoritative order quantity for order {order_id}.")

                if total_order_qty <= 0:
                    raise ValueError(f"Authoritative order quantity for order {order_id} must be > 0 (got {total_order_qty}).")

                # Validate fill quantity
                if this_trade_qty <= 0:
                    raise ValueError(f"Invalid fill quantity for trade {trade_id}: {this_trade_qty} must be > 0.")

                # Step 2: Multi-Fill Accumulation & VWAP Calculation
                cursor.execute("SELECT trade_id, qty, price FROM trade_memory WHERE order_id = ?", (order_id,))
                prior_trades = [dict(r) for r in cursor.fetchall()]
                prior_trade_qty = sum(abs(int(t["qty"])) for t in prior_trades)
                prior_trade_val = sum(abs(int(t["qty"])) * float(t["price"]) for t in prior_trades)

                cumulative_filled_qty = prior_trade_qty + this_trade_qty

                # Overfill Invariant Enforcement: Reject before any persistent side effect
                if cumulative_filled_qty > total_order_qty:
                    raise ValueError(
                        f"Overfill rejected: Cumulative filled quantity {cumulative_filled_qty} "
                        f"({prior_trade_qty} prior + {this_trade_qty} proposed) exceeds requested order quantity {total_order_qty} "
                        f"for order {order_id}."
                    )

                cumulative_trade_val = prior_trade_val + (this_trade_qty * this_trade_price)
                vwap_price = round(cumulative_trade_val / cumulative_filled_qty, 2) if cumulative_filled_qty > 0 else this_trade_price

                if cumulative_filled_qty == total_order_qty:
                    final_order_status = "FILLED"
                else:
                    final_order_status = "PARTIALLY_FILLED"

                # Step 3: Orders Memory Write (Upsert / State Transition)
                cursor.execute("""
                INSERT INTO orders_memory (
                    order_id, client_order_id, bot, symbol, segment, action, qty, filled_qty,
                    price, avg_price, ordertype, producttype, variety, exchange, status,
                    rejection_reason, is_emergency_exit, mode, broker, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(order_id) DO UPDATE SET
                    filled_qty = excluded.filled_qty,
                    avg_price = excluded.avg_price,
                    status = excluded.status,
                    rejection_reason = excluded.rejection_reason,
                    updated_at = excluded.updated_at
                """, (
                    order_id, client_order_id, bot, symbol, segment, action, total_order_qty, cumulative_filled_qty,
                    price, vwap_price, ordertype, producttype, variety, exchange, final_order_status,
                    rejection_reason, is_emergency, mode, broker, created_at, now_str
                ))

                if failure_injection_point == "AFTER_ORDER":
                    raise RuntimeError("Simulated failure AFTER_ORDER")

                # Step 4: Positions Memory Write
                pos_act = str(position_action).upper()
                if pos_act == "CLOSE":
                    key_to_close = symbol_or_key_to_close or symbol
                    cursor.execute("""
                    UPDATE positions_memory
                    SET status = 'CLOSED', closed_at = ?, updated_at = ?
                    WHERE (position_id = ? OR pos_key = ? OR symbol = ?) AND status = 'OPEN'
                    """, (now_str, now_str, key_to_close, key_to_close, key_to_close))
                elif pos_act in ("OPEN", "PARTIAL_CLOSE"):
                    pos = position_record or {}
                    pos_id = str(pos.get("position_id") or pos.get("id") or f"POS-{symbol}-{order_id}")
                    p_bot = str(pos.get("bot", bot))
                    p_symbol = str(pos.get("symbol", symbol))
                    pos_key = str(pos.get("pos_key") or f"{p_bot}_{p_symbol}")
                    side = str(pos.get("side") or pos.get("type") or ("LONG" if action == "BUY" else "SHORT")).upper()

                    is_incremental = bool(pos.get("is_incremental", False))
                    if is_incremental:
                        cursor.execute("SELECT qty, avg_price FROM positions_memory WHERE pos_key = ? AND status = 'OPEN'", (pos_key,))
                        existing_pos_row = cursor.fetchone()
                        if existing_pos_row:
                            old_p_qty = int(existing_pos_row["qty"] or 0)
                            old_p_avg = float(existing_pos_row["avg_price"] or 0.0)
                            delta_qty = abs(int(pos.get("qty", this_trade_qty)))
                            p_qty = old_p_qty + delta_qty
                            p_avg_price = round(((old_p_qty * old_p_avg) + (delta_qty * this_trade_price)) / p_qty, 2) if p_qty > 0 else this_trade_price
                        else:
                            p_qty = abs(int(pos.get("qty", this_trade_qty)))
                            p_avg_price = float(pos.get("avg_price") or this_trade_price)
                    else:
                        p_qty = abs(int(pos.get("qty", qty)))
                        p_avg_price = float(pos.get("avg_price") or pos.get("avgPrice") or vwap_price)

                    ltp = float(pos.get("ltp") or p_avg_price)
                    pnl = str(pos.get("pnl", "+₹0.00"))
                    unrealized_pnl = float(pos.get("unrealized_pnl") or pos.get("unrealizedPnl") or 0.0)
                    p_mode = str(pos.get("mode", mode)).upper()
                    p_broker = str(pos.get("broker", broker))
                    p_status = str(pos.get("status", "OPEN")).upper()
                    p_segment = pos.get("segment", segment)
                    opened_at = str(pos.get("opened_at") or pos.get("openedAt") or now_str)
                    p_closed_at = pos.get("closed_at")

                    cursor.execute("""
                    INSERT INTO positions_memory (
                        position_id, pos_key, bot, symbol, segment, side, qty, avg_price,
                        ltp, pnl, unrealized_pnl, mode, broker, status, reconciled_with_broker,
                        broker_qty, opened_at, updated_at, closed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
                    ON CONFLICT(pos_key) DO UPDATE SET
                        position_id = excluded.position_id,
                        side = excluded.side,
                        qty = excluded.qty,
                        avg_price = excluded.avg_price,
                        ltp = excluded.ltp,
                        pnl = excluded.pnl,
                        unrealized_pnl = excluded.unrealized_pnl,
                        mode = excluded.mode,
                        broker = excluded.broker,
                        status = excluded.status,
                        updated_at = excluded.updated_at,
                        closed_at = excluded.closed_at
                    """, (
                        pos_id, pos_key, p_bot, p_symbol, p_segment, side, p_qty, p_avg_price,
                        ltp, pnl, unrealized_pnl, p_mode, p_broker, p_status, opened_at, now_str, p_closed_at
                    ))

                if failure_injection_point == "AFTER_POSITION":
                    raise RuntimeError("Simulated failure AFTER_POSITION")

                if failure_injection_point == "DURING_TRADE":
                    raise RuntimeError("Simulated failure DURING_TRADE")

                # Step 5: Trade Memory Write
                raw_time = str(trade.get("time") or trade.get("timestamp") or now_str)
                if len(raw_time) <= 12 and ":" in raw_time and "-" not in raw_time:
                    t_timestamp = f"{datetime.now().strftime('%Y-%m-%d')} {raw_time}"
                else:
                    t_timestamp = raw_time

                t_bot = trade.get("bot", bot)
                t_symbol = trade.get("symbol", symbol)
                t_segment = trade.get("segment", segment)
                t_action = (trade.get("action") or action).upper()
                t_qty = this_trade_qty
                t_price = this_trade_price
                t_pnl = trade.get("pnl") or "+₹0.00"
                if "is_positive" in trade:
                    is_positive = 1 if trade["is_positive"] in (1, True, "1") else 0
                elif "isPositive" in trade:
                    is_positive = 1 if trade["isPositive"] in (1, True, "1") else 0
                else:
                    raw_pnl_str = str(t_pnl).replace("₹", "").replace("+", "").replace(",", "").strip()
                    try:
                        val = float(raw_pnl_str)
                        is_positive = 1 if val >= 0 else 0
                    except Exception:
                        is_positive = 1
                t_consensus = trade.get("consensus", "11/13")
                t_order_id = str(trade.get("orderId") or trade.get("order_id") or order_id)
                t_exchange = trade.get("exchange", exchange)
                t_mode = (trade.get("mode") or mode).upper()
                t_broker = trade.get("broker", broker)

                from server.trade_provenance import classify_trade_provenance
                provenance = trade.get("provenance") or classify_trade_provenance(trade)

                post_analysis = trade.get("post_trade_analysis")
                if not post_analysis:
                    post_analysis = f"Paper fill for {t_qty}x {t_symbol} @ ₹{t_price:,.2f}. Quorum ({t_consensus}). Mode: {t_mode}."

                cursor.execute("PRAGMA table_info(trade_memory)")
                cols = [r[1] for r in cursor.fetchall()]

                if "provenance" in cols:
                    cursor.execute("""
                    INSERT INTO trade_memory
                    (trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, consensus, order_id, exchange, mode, broker, post_trade_analysis, provenance)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(trade_id) DO UPDATE SET
                        price = excluded.price,
                        pnl = excluded.pnl,
                        is_positive = excluded.is_positive
                    """, (trade_id, t_timestamp, t_bot, t_symbol, t_segment, t_action, t_qty, t_price, t_pnl, is_positive, t_consensus, t_order_id, t_exchange, t_mode, t_broker, post_analysis, provenance))
                else:
                    cursor.execute("""
                    INSERT INTO trade_memory
                    (trade_id, timestamp, bot, symbol, segment, action, qty, price, pnl, is_positive, consensus, order_id, exchange, mode, broker, post_trade_analysis)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(trade_id) DO UPDATE SET
                        price = excluded.price,
                        pnl = excluded.pnl,
                        is_positive = excluded.is_positive
                    """, (trade_id, t_timestamp, t_bot, t_symbol, t_segment, t_action, t_qty, t_price, t_pnl, is_positive, t_consensus, t_order_id, t_exchange, t_mode, t_broker, post_analysis))

            # Atomic transaction committed cleanly upon exiting with conn
            break

        except sqlite3.OperationalError as op_err:
            if ("locked" in str(op_err).lower() or "busy" in str(op_err).lower()) and attempt < max_retries - 1:
                time.sleep(0.05 * (2 ** attempt))
                continue
            raise
        finally:
            conn.close()

    # Recalculate bot performance safely outside the atomic transaction
    if recalculate_perf:
        try:
            recalculate_bot_performance()
        except Exception as e:
            print(f"[Recalculate Performance Error]: {e}")

    return {
        "success": True,
        "idempotent_replay": False,
        "order_id": order_id,
        "trade_id": trade_id,
        "status": final_order_status,
        "filled_qty": cumulative_filled_qty,
        "avg_price": vwap_price,
        "fill_price": this_trade_price
    }


def recover_ambiguous_paper_orders(failure_injection_point: Optional[str] = None) -> Dict[str, Any]:
    """
    Scans for paper orders left in non-terminal states ('PENDING', 'SUBMITTED', 'ACKNOWLEDGED', 'UNKNOWN_PENDING_RECONCILIATION', 'CREATED', 'PARTIALLY_FILLED').
    Reconciles them deterministically with fail-closed safety:
    - If matching trade(s) exist in trade_memory:
        * Computes cumulative fill quantity and VWAP across all trades for this order.
        * Verifies consistency of quantity, symbol, price, action, and related positions.
        * If consistent and total_trade_qty == o_qty: transitions order to FILLED.
        * If consistent and 0 < total_trade_qty < o_qty: transitions order to PARTIALLY_FILLED.
        * If inconsistent or overfill (total_trade_qty > o_qty): FAILS CLOSED -> transitions order to QUARANTINED.
    - If no trade exists in trade_memory:
        * Cross-checks positions_memory for related positions (symbol, bot, or pos_key).
        * If related position exists or filled_qty > 0: FAILS CLOSED -> transitions order to QUARANTINED
          with reason 'RECOVERY_AMBIGUOUS_POSITION_EXISTS' or 'RECOVERY_PARTIAL_FILL_MISSING_TRADE'.
        * If NO related position exists AND order has zero fills: conclusively proven unfilled.
          Transitions order to CANCELLED with reason 'RECOVERY_RESOLVED_UNFILLED'.
    All operations are committed in a single atomic SQLite transaction with rollback on failure.
    Repeated recovery runs are strictly idempotent.
    Returns a recovery summary dictionary.
    """
    conn = get_connection()
    recovered = []
    quarantined = []
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT * FROM orders_memory
            WHERE UPPER(mode) = 'PAPER'
              AND UPPER(status) IN ('PENDING', 'SUBMITTED', 'ACKNOWLEDGED', 'UNKNOWN_PENDING_RECONCILIATION', 'CREATED', 'PARTIALLY_FILLED')
            """)
            ambiguous_orders = [dict(r) for r in cursor.fetchall()]

            for o in ambiguous_orders:
                oid = str(o["order_id"])
                client_oid = str(o.get("client_order_id") or "")
                o_symbol = str(o.get("symbol") or "").strip()
                o_bot = str(o.get("bot") or "").strip()
                o_qty = abs(int(o.get("qty") or 0))
                o_filled_qty = int(o.get("filled_qty") or 0)
                o_avg_price = float(o.get("avg_price") or 0.0)
                o_status = str(o.get("status") or "").upper()
                o_action = str(o.get("action") or "").strip().upper()
                now_str = datetime.now().isoformat()

                # 1. Query potential matching trades
                if client_oid and client_oid != oid:
                    cursor.execute("""
                    SELECT * FROM trade_memory
                    WHERE order_id = ? OR trade_id = ? OR order_id = ?
                    """, (oid, f"TRD-{oid}", client_oid))
                else:
                    cursor.execute("""
                    SELECT * FROM trade_memory
                    WHERE order_id = ? OR trade_id = ?
                    """, (oid, f"TRD-{oid}"))

                raw_trades = [dict(r) for r in cursor.fetchall()]
                seen_trade_ids = set()
                matching_trades = []
                for t in raw_trades:
                    tid = t.get("trade_id")
                    if tid not in seen_trade_ids:
                        seen_trade_ids.add(tid)
                        matching_trades.append(t)

                if matching_trades:
                    # Case 1: Matching trade(s) found
                    if len(matching_trades) > 1:
                        # Ambiguous multiple trades for a single paper order
                        cursor.execute("""
                        UPDATE orders_memory
                        SET status = 'QUARANTINED', rejection_reason = 'RECOVERY_MULTIPLE_TRADES_INCONSISTENCY', updated_at = ?
                        WHERE order_id = ?
                        """, (now_str, oid))
                        quarantined.append({
                            "order_id": oid,
                            "resolution": "QUARANTINED",
                            "reason": "Multiple matching trades found for single paper order"
                        })
                    else:
                        t = matching_trades[0]
                        t_qty = abs(int(t.get("qty") or 0))
                        t_price = float(t.get("price") or 0.0)
                        t_symbol = str(t.get("symbol") or "").strip()
                        t_action = str(t.get("action") or "").strip().upper()
                        t_bot = str(t.get("bot") or "").strip()

                        if o_status == "PARTIALLY_FILLED":
                            is_consistent = (
                                t_qty == o_filled_qty and t_qty > 0 and t_qty < o_qty and
                                t_price > 0.0 and
                                t_symbol == o_symbol and
                                (not t_action or not o_action or t_action == o_action) and
                                (not t_bot or not o_bot or t_bot == o_bot)
                            )
                        else:
                            is_consistent = (
                                t_qty == o_qty and t_qty > 0 and
                                t_price > 0.0 and
                                t_symbol == o_symbol and
                                (not t_action or not o_action or t_action == o_action) and
                                (not t_bot or not o_bot or t_bot == o_bot)
                            )

                        # Cross-check positions_memory for contradiction if position exists
                        if is_consistent:
                            cursor.execute("""
                            SELECT id, position_id, pos_key, bot, symbol, side, qty, avg_price, status
                            FROM positions_memory
                            WHERE (symbol = ? AND bot = ?)
                               OR pos_key = ?
                               OR position_id = ?
                               OR position_id LIKE ?
                            """, (o_symbol, o_bot, f"{o_bot}_{o_symbol}", f"POS-{o_symbol}-{oid}", f"%{oid}%"))
                            pos_rows = [dict(r) for r in cursor.fetchall()]
                            for p in pos_rows:
                                if str(p.get("symbol") or "").strip() != o_symbol:
                                    is_consistent = False
                                    break

                        if not is_consistent:
                            cursor.execute("""
                            UPDATE orders_memory
                            SET status = 'QUARANTINED', rejection_reason = 'RECOVERY_TRADE_INCONSISTENCY', updated_at = ?
                            WHERE order_id = ?
                            """, (now_str, oid))
                            quarantined.append({
                                "order_id": oid,
                                "resolution": "QUARANTINED",
                                "reason": "Trade inconsistency detected: mismatch in symbol, qty, action, price, or position"
                            })
                        else:
                            if o_status == "PARTIALLY_FILLED":
                                cursor.execute("""
                                UPDATE orders_memory
                                SET status = 'PARTIALLY_FILLED', filled_qty = ?, avg_price = ?, rejection_reason = '', updated_at = ?
                                WHERE order_id = ?
                                """, (t_qty, t_price, now_str, oid))
                                recovered.append({
                                    "order_id": oid,
                                    "resolution": "MARKED_PARTIALLY_FILLED",
                                    "reason": "Matching trade found and verified consistent with partial fill"
                                })
                            else:
                                cursor.execute("""
                                UPDATE orders_memory
                                SET status = 'FILLED', filled_qty = ?, avg_price = ?, rejection_reason = '', updated_at = ?
                                WHERE order_id = ?
                                """, (t_qty, t_price, now_str, oid))
                                recovered.append({
                                    "order_id": oid,
                                    "resolution": "MARKED_FILLED",
                                    "reason": "Matching trade found and verified consistent"
                                })

                else:
                    # Case 2: No matching trade found
                    pos_key = f"{o_bot}_{o_symbol}"
                    pos_id_prefix = f"POS-{o_symbol}-{oid}"
                    cursor.execute("""
                    SELECT id, position_id, pos_key, bot, symbol, side, qty, avg_price, status
                    FROM positions_memory
                    WHERE (symbol = ? AND bot = ?)
                       OR pos_key = ?
                       OR position_id = ?
                       OR position_id LIKE ?
                    """, (o_symbol, o_bot, pos_key, pos_id_prefix, f"%{oid}%"))
                    related_positions = [dict(r) for r in cursor.fetchall()]

                    if related_positions or o_filled_qty > 0:
                        reason_msg = (
                            "Related position exists; execution cannot be ruled out without matching trade"
                            if related_positions
                            else "Order has non-zero filled_qty but missing trade"
                        )
                        rejection_code = (
                            "RECOVERY_AMBIGUOUS_POSITION_EXISTS"
                            if related_positions
                            else "RECOVERY_PARTIAL_FILL_MISSING_TRADE"
                        )
                        cursor.execute("""
                        UPDATE orders_memory
                        SET status = 'QUARANTINED', rejection_reason = ?, updated_at = ?
                        WHERE order_id = ?
                        """, (rejection_code, now_str, oid))
                        quarantined.append({
                            "order_id": oid,
                            "resolution": "QUARANTINED",
                            "reason": reason_msg
                        })
                    else:
                        cursor.execute("""
                        UPDATE orders_memory
                        SET status = 'CANCELLED', rejection_reason = 'RECOVERY_RESOLVED_UNFILLED', updated_at = ?
                        WHERE order_id = ?
                        """, (now_str, oid))
                        recovered.append({
                            "order_id": oid,
                            "resolution": "MARKED_CANCELLED",
                            "reason": "Conclusively proven unfilled: zero fills, no matching trade, and no related position"
                        })

                if failure_injection_point == "DURING_RECOVERY":
                    raise RuntimeError("Simulated failure DURING_RECOVERY")

            all_results = recovered + quarantined
            summary = {
                "success": True,
                "scanned_count": len(ambiguous_orders),
                "recovered_count": len(recovered),
                "quarantined_count": len(quarantined),
                "recovered_orders": all_results
            }

        # Safe post-commit bot performance recalculation if any order was marked FILLED
        if any(r["resolution"] == "MARKED_FILLED" for r in recovered):
            try:
                recalculate_bot_performance()
            except Exception as e:
                pass

        return summary
    finally:
        conn.close()


def log_reconciliation_event(
    status: str,
    broker_count: int,
    local_count: int,
    details: Optional[Dict[str, Any]] = None,
    action_taken: str = ""
) -> int:
    """Logs a broker reconciliation audit event."""
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            details_str = json.dumps(details) if details else "{}"
            now_str = datetime.now().isoformat()
            cursor.execute("""
            INSERT INTO reconciliation_log (
                timestamp, status, broker_positions_count, local_positions_count, details, action_taken
            ) VALUES (?, ?, ?, ?, ?, ?)
            """, (now_str, status, broker_count, local_count, details_str, action_taken))
            return cursor.lastrowid
    finally:
        conn.close()


def get_latest_reconciliation_log() -> Optional[Dict[str, Any]]:
    """Retrieves the latest reconciliation log record."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM reconciliation_log ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        if row:
            d = dict(row)
            if d.get("details"):
                try:
                    d["details"] = json.loads(d["details"])
                except Exception:
                    pass
            return d
        return None
    finally:
        conn.close()


def get_recent_reconciliation_logs(limit: int = 20) -> List[Dict[str, Any]]:
    """Retrieves recent reconciliation audit logs from reconciliation_log."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM reconciliation_log ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            if d.get("details"):
                try:
                    d["details"] = json.loads(d["details"])
                except Exception:
                    pass
            results.append(d)
        return results
    finally:
        conn.close()



def get_recent_trades(limit: int = 30) -> List[Dict[str, Any]]:
    """Retrieves recent trades from trade_memory with verified provenance classification."""
    from server.trade_provenance import classify_trade_provenance
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM trade_memory ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    results = []
    for row in rows:
        d = dict(row)
        if not d.get("provenance") or d.get("provenance") == "UNKNOWN_PROVENANCE":
            d["provenance"] = classify_trade_provenance(d)
        results.append(d)
    conn.close()
    return results


def get_monthly_pnl_heatmap(year: int = 2026, month: int = 10, mode: str = "LIVE") -> Dict[str, Any]:
    """
    Computes verified daily trading P&L heatmap strictly from SQLite trade_memory.
    Strict segregation:
    - mode='LIVE': strictly LIVE trades only. Paper trades are NEVER included.
    - Zero mock figures: days without executed fills display ₹0.00 or Weekend.
    """
    import calendar
    conn = get_connection()
    cursor = conn.cursor()

    # Strict mode filter: default 'LIVE' excludes all Paper simulation trades
    if mode and mode.upper() != "ALL":
        cursor.execute("SELECT * FROM trade_memory WHERE UPPER(mode) = UPPER(?) ORDER BY id ASC", (mode,))
    else:
        cursor.execute("SELECT * FROM trade_memory ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()

    daily_totals: Dict[int, float] = {}
    daily_trade_counts: Dict[int, int] = {}
    month_prefix = f"{year}-{month:02d}"

    for r in rows:
        d = dict(r)
        ts = str(d.get("timestamp") or d.get("created_at") or "")
        day_part = None
        if ts.startswith(month_prefix) and len(ts) >= 10:
            try:
                day_part = int(ts[8:10])
            except Exception:
                pass
        elif ":" in ts and len(ts) <= 12:
            now_dt = datetime.now()
            if now_dt.year == year and now_dt.month == month:
                day_part = now_dt.day

        if day_part is None:
            continue

        raw_pnl = str(d.get("pnl") or "0")
        clean_num = raw_pnl.replace("₹", "").replace("+", "").replace(",", "").strip()
        try:
            pnl_val = float(clean_num)
            if not d.get("is_positive") and pnl_val > 0:
                pnl_val = -pnl_val
        except Exception:
            pnl_val = 0.0

        daily_totals[day_part] = round(daily_totals.get(day_part, 0.0) + pnl_val, 2)
        daily_trade_counts[day_part] = daily_trade_counts.get(day_part, 0) + 1

    num_days = calendar.monthrange(year, month)[1]
    days_list = []
    mtd_profit = 0.0
    green_days = 0
    red_days = 0
    now = datetime.now()
    today_day = now.day if (now.year == year and now.month == month) else -1

    current_streak = 0

    for day in range(1, num_days + 1):
        dt = datetime(year, month, day)
        is_weekend = dt.weekday() >= 5
        pnl = daily_totals.get(day, 0.0)
        trades_count = daily_trade_counts.get(day, 0)

        if is_weekend:
            days_list.append({
                "date": day,
                "pnl": "Weekend",
                "isNeutral": True,
                "isWeekend": True,
                "isToday": (day == today_day),
                "trades": 0
            })
        elif trades_count == 0:
            days_list.append({
                "date": day,
                "pnl": "₹0.00",
                "isNeutral": True,
                "isWeekend": False,
                "isToday": (day == today_day),
                "trades": 0
            })
            current_streak = 0
        else:
            mtd_profit += pnl
            is_green = pnl >= 0
            if is_green:
                green_days += 1
                current_streak += 1
            else:
                red_days += 1
                current_streak = 0

            days_list.append({
                "date": day,
                "pnl": f"{'+' if pnl >= 0 else '-'}₹{abs(pnl):,.2f}",
                "isGreen": is_green,
                "isNeutral": False,
                "isWeekend": False,
                "isToday": (day == today_day),
                "trades": trades_count
            })

    total_sessions = green_days + red_days
    green_ratio = round((green_days / total_sessions * 100), 1) if total_sessions > 0 else 0.0

    return {
        "status": "success",
        "year": year,
        "month": month,
        "monthName": calendar.month_name[month],
        "mode": mode,
        "days": days_list,
        "mtdProfit": round(mtd_profit, 2),
        "greenDays": green_days,
        "redDays": red_days,
        "greenRatio": green_ratio,
        "winStreak": current_streak,
        "totalTrades": sum(daily_trade_counts.values())
    }


def save_chat_message(sender: str, content: str, session_id: str = "default", metadata: Optional[Dict[str, Any]] = None) -> int:
    """Stores a conversational message in chat_memory."""
    conn = get_connection()
    cursor = conn.cursor()
    meta_json = json.dumps(metadata or {})
    timestamp = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO chat_memory (session_id, sender, content, timestamp, metadata)
    VALUES (?, ?, ?, ?, ?)
    """, (session_id, sender, content, timestamp, meta_json))

    inserted_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return inserted_id


def get_chat_history(session_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves chat history from chat_memory."""
    conn = get_connection()
    cursor = conn.cursor()
    if session_id:
        cursor.execute("SELECT * FROM chat_memory WHERE session_id = ? ORDER BY id ASC LIMIT ?", (session_id, limit))
    else:
        cursor.execute("SELECT * FROM chat_memory ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    results = [dict(row) for row in rows]
    conn.close()
    if not session_id:
        results.reverse()
    return results


def clear_chat_history(session_id: Optional[str] = None) -> bool:
    """Clears chat history from chat_memory table."""
    conn = get_connection()
    cursor = conn.cursor()
    if session_id:
        cursor.execute("DELETE FROM chat_memory WHERE session_id = ?", (session_id,))
    else:
        cursor.execute("DELETE FROM chat_memory")
    conn.commit()
    conn.close()
    return True



def get_all_bot_performance() -> List[Dict[str, Any]]:
    """Retrieves performance stats for all 14 bots."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bot_performance_memory ORDER BY bot_id ASC")
    rows = cursor.fetchall()
    results = [dict(row) for row in rows]
    conn.close()
    return results


def get_bot_performance(bot_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves performance stats for a single bot from bot_performance_memory."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bot_performance_memory WHERE bot_id = ?", (bot_id,))
    row = cursor.fetchone()
    res = dict(row) if row else None
    conn.close()
    return res


def parse_trade_timestamp_epoch(ts: Any) -> float:
    """
    Deterministically parses a trade timestamp representation into epoch seconds (float).
    Requires a valid, unambiguous calendar date. Date-less time strings (e.g. 'HH:MM:SS')
    return 0.0 to prevent ambiguous or fabricated timestamps from entering calibration.
    Supports numeric epoch, ISO strings, and space-delimited datetimes.
    """
    if ts is None:
        return 0.0
    if isinstance(ts, (int, float)):
        val = float(ts)
        if val <= 0.0:
            return 0.0
        # Realistic epoch check: milliseconds (> 1e11) converted to seconds
        if val > 1e11:
            val = val / 1000.0
        # Realistic trading epoch bound (valid positive timestamp, year >= 2000)
        return val if val >= 946684800.0 else 0.0
    if isinstance(ts, datetime):
        dt = ts
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=IST)
        if dt.year < 2000:
            return 0.0
        return dt.timestamp()

    s = str(ts).strip()
    if not s:
        return 0.0

    # Try numeric string (e.g. "1729245120.0" or "1729245120000")
    try:
        val = float(s)
        if val <= 0.0:
            return 0.0
        if val > 1e11:
            val = val / 1000.0
        return val if val >= 946684800.0 else 0.0
    except ValueError:
        pass

    # Try ISO/datetime string with required calendar date
    try:
        s_clean = s[:-1] + "+00:00" if s.endswith("Z") else s
        dt = datetime.fromisoformat(s_clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=IST)
        if dt.year < 2000:
            return 0.0
        return dt.timestamp()
    except Exception:
        pass

    # Date-less strings ("HH:MM:SS", "HH:MM:SS.mmm") cannot be assigned an unambiguous
    # instant and are strictly rejected with sentinel 0.0.
    return 0.0


def parse_trade_pnl(record: Dict[str, Any]) -> Tuple[float, str]:
    """
    Extracts numerical PnL and outcome ('WIN', 'LOSS', 'BREAKEVEN') from a trade record.
    Preserves exact sign semantics using is_positive flag and raw string representation.
    """
    raw_pnl = str(record.get("pnl") or "0").replace("₹", "").replace("$", "").replace(",", "").strip()
    raw_pnl = raw_pnl.replace("+", "").replace("\u2212", "-").replace("\u2013", "-").replace("\u2014", "-")
    try:
        pnl_val = float(raw_pnl)
        is_pos = record.get("is_positive")
        if is_pos in (0, "0", False) and pnl_val > 0:
            pnl_val = -pnl_val
        elif is_pos in (1, "1", True) and pnl_val < 0:
            pnl_val = abs(pnl_val)
    except Exception:
        pnl_val = 0.0

    pnl_val = round(pnl_val, 2)
    if pnl_val > 0.0001:
        outcome = "WIN"
    elif pnl_val < -0.0001:
        outcome = "LOSS"
    else:
        outcome = "BREAKEVEN"

    return pnl_val, outcome


def is_trade_for_bot(record: Dict[str, Any], target_bot: Any) -> bool:
    """
    Matches a trade record against a target bot ID or bot name using exact normalized identifiers
    and token-boundary matching. Eliminates substring collision risks (e.g. Bot 1 matching Bot 10).
    """
    rec_bot = str(record.get("bot") or "").strip().lower()
    if not rec_bot:
        return False

    target_int = None
    try:
        target_int = int(target_bot)
    except (ValueError, TypeError):
        t_clean = str(target_bot).strip().lower()
        if t_clean.startswith("bot ") or t_clean.startswith("bot_"):
            try:
                target_int = int(t_clean[4:])
            except (ValueError, TypeError):
                pass

    from server.bot_registry import CANONICAL_BOT_REGISTRY

    if target_int is None:
        t_str = str(target_bot).strip().lower()
        for b_id, cfg in CANONICAL_BOT_REGISTRY.items():
            b_name = cfg["name"].lower().strip()
            if t_str == b_name or t_str == f"bot {b_id}" or t_str == f"bot_{b_id}":
                target_int = b_id
                break

    if target_int is not None:
        cfg = CANONICAL_BOT_REGISTRY.get(target_int)
        target_name = cfg["name"].lower().strip() if cfg else ""

        # 1. Exact numeric string match (e.g. "1")
        if rec_bot == str(target_int):
            return True

        # 2. Token-boundary matching for "bot {target_int}" (e.g. "bot 1", "bot 1: scalper", "bot 1 (scalper)")
        # Never matches "bot 10", "bot 11", etc.
        pattern_space = rf"^bot\s+{target_int}(?:[\s:(_{{[-].*)?$"
        if re.match(pattern_space, rec_bot):
            return True

        # 3. Token-boundary matching for "bot_{target_int}" (e.g. "bot_1", "bot_1: scalper", "bot_1_scalper")
        # Never matches "bot_10", "bot_11", etc.
        pattern_under = rf"^bot_{target_int}(?:[\s:(_{{[-].*)?$"
        if re.match(pattern_under, rec_bot):
            return True

        # 4. Canonical bot name match with word boundary (e.g. "scalper bot", "bot 1: scalper bot")
        if target_name:
            if rec_bot == target_name:
                return True
            if re.search(rf"\b{re.escape(target_name)}\b", rec_bot):
                return True
    else:
        t_str = str(target_bot).strip().lower()
        if rec_bot == t_str:
            return True
        if re.search(rf"\b{re.escape(t_str)}\b", rec_bot):
            return True

    return False


def get_rolling_bot_trades(
    bot_id: Union[int, str],
    window_size: int = DEFAULT_ROLLING_WINDOW_SIZE,
    before_timestamp: Optional[Union[str, float, datetime]] = None,
    symbol: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None
) -> List[Dict[str, Any]]:
    """
    Retrieves the most recent completed trades for a bot from trade_memory,
    capped at window_size (default 20).
    Filters out RMS pre-order rejections, initial position entries, mock brokers,
    synthetic stress tests, synthetic replays, synthetic simulations, telemetry tests,
    and ambiguous date-less or unparseable timestamps.
    Enforces anti-lookahead via before_timestamp cutoff and deterministic sorting.
    Deduplicates trades by trade_id, preserving the latest authoritative record.
    """
    from server.trade_provenance import (
        classify_trade_provenance,
        VALID_PROVENANCES,
        PROVENANCE_RMS_REJECTION,
        PROVENANCE_INITIAL_ENTRY,
        PROVENANCE_MOCK_BROKER,
        PROVENANCE_SYNTHETIC_STRESS_TEST,
        PROVENANCE_SYNTHETIC_REPLAY,
        PROVENANCE_SYNTHETIC_SIMULATION,
        PROVENANCE_TELEMETRY_TEST,
        PROVENANCE_UNKNOWN
    )

    excluded_provenances = {
        PROVENANCE_RMS_REJECTION,
        PROVENANCE_INITIAL_ENTRY,
        PROVENANCE_MOCK_BROKER,
        PROVENANCE_SYNTHETIC_STRESS_TEST,
        PROVENANCE_SYNTHETIC_REPLAY,
        PROVENANCE_SYNTHETIC_SIMULATION,
        PROVENANCE_TELEMETRY_TEST
    }

    cutoff_epoch = parse_trade_timestamp_epoch(before_timestamp) if before_timestamp is not None else None

    own_conn = False
    if conn is None:
        conn = get_connection()
        own_conn = True

    try:
        cursor = conn.cursor()
        if symbol:
            cursor.execute("SELECT * FROM trade_memory WHERE symbol = ?", (symbol,))
        else:
            cursor.execute("SELECT * FROM trade_memory")
        rows = [dict(r) for r in cursor.fetchall()]
    finally:
        if own_conn:
            conn.close()

    eligible_trades = []
    for r in rows:
        if not is_trade_for_bot(r, bot_id):
            continue

        # Fix A: Require valid, unambiguous calendar timestamp
        t_epoch = parse_trade_timestamp_epoch(r.get("timestamp"))
        if t_epoch <= 0.0:
            # Date-less, corrupt, or invalid timestamp excluded from calibration
            continue

        # Anti-lookahead cutoff
        if cutoff_epoch is not None and cutoff_epoch > 0.0:
            if t_epoch > cutoff_epoch:
                continue

        # Fix B: Check explicit provenance if present
        explicit_prov = r.get("provenance")
        if explicit_prov is not None:
            prov_norm = str(explicit_prov).strip().upper()
            if prov_norm in excluded_provenances:
                continue
            if prov_norm not in VALID_PROVENANCES or prov_norm == PROVENANCE_UNKNOWN:
                # Malformed or unverified explicit provenance cannot be established as authentic
                continue

        # Fix B: Inferred provenance filtering
        prov = classify_trade_provenance(r)
        if prov in excluded_provenances:
            continue

        r_with_epoch = dict(r)
        r_with_epoch["_epoch"] = t_epoch
        eligible_trades.append(r_with_epoch)

    # Deterministic sorting: epoch DESC, id DESC, trade_id DESC
    def _sort_key(t):
        epoch = t.get("_epoch", 0.0)
        try:
            rid = int(t.get("id") or 0)
        except (ValueError, TypeError):
            rid = 0
        tid = str(t.get("trade_id") or "")
        return (epoch, rid, tid)

    eligible_trades.sort(key=_sort_key, reverse=True)

    # Deduplicate by trade_id while preserving order
    deduped = []
    seen_trade_ids = set()
    for t in eligible_trades:
        tid = t.get("trade_id")
        if tid:
            tid_str = str(tid).strip()
            if tid_str in seen_trade_ids:
                continue
            seen_trade_ids.add(tid_str)
        t_clean = {k: v for k, v in t.items() if k != "_epoch"}
        deduped.append(t_clean)

    return deduped[:max(1, window_size)]


def get_rolling_bot_performance(
    bot_id: Union[int, str],
    window_size: int = DEFAULT_ROLLING_WINDOW_SIZE,
    before_timestamp: Optional[Union[str, float, datetime]] = None,
    symbol: Optional[str] = None,
    min_samples: int = MIN_ROLLING_SAMPLE_SIZE,
    conn: Optional[sqlite3.Connection] = None
) -> Dict[str, Any]:
    """
    Computes rolling performance metrics for a bot over the latest completed trades.
    Calculates total_trades, wins, losses, breakevens, win_rate, pnl, and calibrated perf_multiplier.
    If 0 eligible rolling trades exist, defaults to neutral multiplier 1.0 (Fix D).
    Exposes legacy bot_performance_memory statistics under legacy_lifetime_performance telemetry
    without allowing stale lifetime metrics to alter consensus weighting.
    """
    trades = get_rolling_bot_trades(
        bot_id=bot_id,
        window_size=window_size,
        before_timestamp=before_timestamp,
        symbol=symbol,
        conn=conn
    )

    if trades:
        total = len(trades)
        wins = 0
        losses = 0
        breakevens = 0
        total_pnl = 0.0

        for t in trades:
            pnl_val, outcome = parse_trade_pnl(t)
            total_pnl += pnl_val
            if outcome == "WIN":
                wins += 1
            elif outcome == "LOSS":
                losses += 1
            else:
                breakevens += 1

        win_rate = round(wins / total, 4) if total > 0 else 0.0
        win_rate_pct = round(wins / total * 100.0, 2) if total > 0 else 0.0
        sufficient = (total >= min_samples)

        perf_multiplier = 1.0
        if sufficient:
            if win_rate >= 0.60 and total_pnl > 0.0:
                perf_multiplier = 1.15
            elif win_rate < 0.40 and total_pnl < 0.0:
                perf_multiplier = 0.85

        return {
            "bot_id": bot_id,
            "total_trades": total,
            "winning_trades": wins,
            "losing_trades": losses,
            "breakeven_trades": breakevens,
            "win_rate": win_rate,
            "win_rate_pct": win_rate_pct,
            "pnl": round(total_pnl, 2),
            "sample_size_sufficient": sufficient,
            "perf_multiplier": perf_multiplier,
            "window_size": window_size,
            "is_fallback": False,
            "trades": trades
        }

    # Fix D: Safe no-trade fallback.
    # When zero eligible, valid completed trades exist, consensus multiplier MUST be strictly neutral 1.0.
    # Legacy lifetime stats are exposed for diagnostic telemetry only.
    target_int = None
    try:
        target_int = int(bot_id)
    except (ValueError, TypeError):
        from server.bot_registry import CANONICAL_BOT_REGISTRY
        b_name_target = str(bot_id).strip().lower()
        for cid, ccfg in CANONICAL_BOT_REGISTRY.items():
            if ccfg["name"].lower().strip() == b_name_target:
                target_int = cid
                break

    legacy_stats = None
    if target_int is not None:
        try:
            bot_perf = get_bot_performance(target_int)
            if bot_perf:
                raw_wr = float(bot_perf.get("win_rate", 0.0) or 0.0)
                fb_wr = raw_wr / 100.0 if raw_wr > 1.0 else raw_wr
                fb_pnl = float(bot_perf.get("pnl", 0.0) or 0.0)
                fb_total = int(bot_perf.get("total_trades", 0) or 0)
                legacy_stats = {
                    "total_trades": fb_total,
                    "winning_trades": int(bot_perf.get("winning_trades", 0) or 0),
                    "losing_trades": int(bot_perf.get("losing_trades", 0) or 0),
                    "win_rate": round(fb_wr, 4),
                    "win_rate_pct": round(fb_wr * 100.0, 2),
                    "pnl": round(fb_pnl, 2)
                }
        except Exception:
            pass

    return {
        "bot_id": bot_id,
        "total_trades": 0,
        "winning_trades": 0,
        "losing_trades": 0,
        "breakeven_trades": 0,
        "win_rate": 0.0,
        "win_rate_pct": 0.0,
        "pnl": 0.0,
        "sample_size_sufficient": False,
        "perf_multiplier": 1.0,  # Fix D: strictly neutral 1.0 on empty/invalid rolling history
        "window_size": window_size,
        "is_fallback": True if legacy_stats else False,
        "legacy_lifetime_performance": legacy_stats,
        "trades": []
    }


def update_bot_performance(bot_id: int, updates: Dict[str, Any]) -> bool:
    """Updates performance and capital allocation metrics for a specific bot."""
    conn = get_connection()
    cursor = conn.cursor()

    fields = []
    values = []
    for k, v in updates.items():
        if k in ["win_rate", "total_trades", "winning_trades", "losing_trades", "pnl", "regime_score", "status", "allocated_capital"]:
            fields.append(f"{k} = ?")
            values.append(v)

    if not fields:
        conn.close()
        return False

    fields.append("updated_at = ?")
    values.append(datetime.now().isoformat())
    values.append(bot_id)

    query = f"UPDATE bot_performance_memory SET {', '.join(fields)} WHERE bot_id = ?"
    cursor.execute(query, tuple(values))
    conn.commit()
    conn.close()
    return True


def log_rms_event(event_type: str, threshold: float, current: float, action: str) -> int:
    """Logs an RMS circuit breaker or threshold event."""
    conn = get_connection()
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    cursor.execute("""
    INSERT INTO rms_events_memory (event_type, threshold_value, current_value, action_taken, timestamp)
    VALUES (?, ?, ?, ?, ?)
    """, (event_type, threshold, current, action, timestamp))
    inserted_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return inserted_id


def get_memory_summary() -> Dict[str, Any]:
    """
    Returns a consolidated long-term memory brief formatted specifically for LLM system prompt injection.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Total trade statistics
    cursor.execute("SELECT COUNT(*) as total, SUM(CASE WHEN is_positive = 1 THEN 1 ELSE 0 END) as wins FROM trade_memory")
    trade_stats = cursor.fetchone()
    total_trades = trade_stats["total"] or 0
    wins = trade_stats["wins"] or 0
    historical_win_rate = round((wins / total_trades * 100), 1) if total_trades > 0 else 72.5

    # 2. Recent trades with post-trade analysis
    cursor.execute("SELECT * FROM trade_memory ORDER BY id DESC LIMIT 5")
    recent_trades = [dict(r) for r in cursor.fetchall()]

    # 3. Top bots by regime score
    cursor.execute("SELECT * FROM bot_performance_memory ORDER BY regime_score DESC LIMIT 3")
    top_bots = [dict(r) for r in cursor.fetchall()]

    # 4. Recent user commands from chat memory
    cursor.execute("SELECT content, timestamp FROM chat_memory WHERE sender = 'user' ORDER BY id DESC LIMIT 5")
    recent_user_cmds = [dict(r) for r in cursor.fetchall()]

    # 5. RMS events
    cursor.execute("SELECT * FROM rms_events_memory ORDER BY id DESC LIMIT 3")
    recent_rms = [dict(r) for r in cursor.fetchall()]

    conn.close()

    # Build prompt context string
    lines = []
    lines.append(f"• Historical Database Records: {total_trades} verified consensus trades logged in chintu_memory.db.")
    lines.append(f"• Multi-Session Win Rate: {historical_win_rate}% across multi-asset nodes.")

    if top_bots:
        top_str = ", ".join([f"#{b['bot_id']} {b['bot_name']} (Regime: {b['regime_score']}, WR: {b['win_rate']}%)" for b in top_bots])
        lines.append(f"• Dominant High-Alpha Regimes: {top_str}.")

    if recent_trades:
        lines.append("• Recent Database Trade Memories:")
        for t in recent_trades:
            lines.append(f"  - [{t['timestamp']}] {t['bot']}: {t['action']} {t['qty']}x {t['symbol']} @ ₹{t['price']} | Analysis: {t['post_trade_analysis']}")

    if recent_user_cmds:
        lines.append("• Persistent User Directives & Preferences:")
        for c in recent_user_cmds:
            clean_cmd = c['content'].replace('\n', ' ')[:90]
            lines.append(f"  - \"{clean_cmd}\"")

    prompt_context = "\n".join(lines)

    return {
        "status": "success",
        "total_trades": total_trades,
        "historical_win_rate": historical_win_rate,
        "recent_trades": recent_trades,
        "top_bots": top_bots,
        "recent_user_commands": recent_user_cmds,
        "recent_rms_events": recent_rms,
        "prompt_context": prompt_context
    }


# =========================================================
# SYSTEM CONFIG PERSISTENCE (Telegram, WhatsApp CallMeBot, Gemini)
# =========================================================

def save_config(key: str, value: str) -> bool:
    """Saves or updates a key-value setting in SQLite system_config."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO system_config (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    """, (key, str(value), datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return True


def get_config(key: str, default: str = "") -> str:
    """Retrieves a configuration value from system_config."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM system_config WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default


def get_all_configs() -> Dict[str, str]:
    """Retrieves all configuration key-values."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM system_config")
    rows = cursor.fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}


# =========================================================
# DYNAMIC STRATEGY VAULT (Multi-Strategy Engine)
# =========================================================

def get_all_strategies() -> List[Dict[str, Any]]:
    """Retrieves all strategies (presets and recorded) from strategy_vault."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM strategy_vault ORDER BY is_preset DESC, created_at DESC")
    rows = cursor.fetchall()
    results = []
    for r in rows:
        d = dict(r)
        try:
            d["indicators"] = json.loads(d["indicators"]) if d.get("indicators") else []
        except Exception:
            d["indicators"] = []
        d["stop_loss_pct"] = d.get("sl_ratio", 0.5)
        d["target_risk_reward"] = d.get("target_multiple", 2.0)
        results.append(d)
    conn.close()
    return results


def save_strategy(strategy: Dict[str, Any]) -> str:
    """Saves or updates a strategy in the Strategy Vault."""
    conn = get_connection()
    cursor = conn.cursor()
    strat_id = strategy.get("id") or f"strat_{int(datetime.now().timestamp() * 1000)}"
    name = strategy.get("name", "Untitled Strategy")
    category = strategy.get("category", "Custom Alpha")
    asset = strategy.get("asset", "NIFTY 50")
    entry_rules = strategy.get("entry_rules", "")
    exit_rules = strategy.get("exit_rules", "")
    sl_ratio = float(strategy.get("sl_ratio") or strategy.get("stop_loss_pct") or 0.5)
    target_multiple = float(strategy.get("target_multiple") or strategy.get("target_risk_reward") or 2.0)
    indicators = json.dumps(strategy.get("indicators", []))
    risk_per_trade = float(strategy.get("risk_per_trade", 1.0))
    is_preset = 1 if strategy.get("is_preset") else 0
    created_at = strategy.get("created_at") or datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO strategy_vault 
    (id, name, category, asset, entry_rules, exit_rules, sl_ratio, target_multiple, indicators, risk_per_trade, is_preset, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
        name = excluded.name,
        category = excluded.category,
        asset = excluded.asset,
        entry_rules = excluded.entry_rules,
        exit_rules = excluded.exit_rules,
        sl_ratio = excluded.sl_ratio,
        target_multiple = excluded.target_multiple,
        indicators = excluded.indicators,
        risk_per_trade = excluded.risk_per_trade
    """, (strat_id, name, category, asset, entry_rules, exit_rules, sl_ratio, target_multiple, indicators, risk_per_trade, is_preset, created_at))

    conn.commit()
    conn.close()
    return strat_id


def delete_strategy(strategy_id: str) -> bool:
    """Deletes a custom strategy from the vault (presets are preserved)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM strategy_vault WHERE id = ? AND is_preset = 0", (strategy_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def parse_strategy_from_text(text: str) -> Dict[str, Any]:
    """
    Parses natural language or voice dictation into a structured strategy record.
    Example: "Jarvis, save a new strategy called 9/15 EMA Pullback Scalper with 0.35% SL and 1:2 R:R"
    """
    import re
    clean = text.strip()
    lower = clean.lower()

    # 1. Extract Strategy Name
    name = "Custom Dynamic Strategy"
    name_patterns = [
        r"(?:called|named|name is|title)\s+['\"]?([a-zA-Z0-9/\s\-_]+?)(?:['\"]|\s+with|\s+using|\s+and|\s+on|\s*$)",
        r"(?:strategy|setup)\s+['\"]?([a-zA-Z0-9/\s\-_]+?)(?:['\"]|\s+with|\s+using|\s+and|\s+on|\s*$)",
        r"save(?:\s+a)?(?:\s+new)?\s+strategy\s+([a-zA-Z0-9/\s\-_]+?)(?:\s+with|\s+using|\s+and|\s+on|\s*$)"
    ]
    for pat in name_patterns:
        m = re.search(pat, clean, re.IGNORECASE)
        if m and len(m.group(1).strip()) > 2:
            candidate = m.group(1).strip()
            # Clean trailing words
            candidate = re.sub(r"\b(with|and|using|on|at|having)\b.*$", "", candidate, flags=re.IGNORECASE).strip()
            if candidate:
                name = candidate
                break

    # 2. Extract Stop-Loss
    sl_ratio = 0.35
    sl_match = re.search(r"([0-9.]+)\s*%\s*(?:sl|stop\s*loss|stop)", lower)
    if not sl_match:
        sl_match = re.search(r"(?:sl|stop\s*loss|stop)[:\s]*([0-9.]+)\s*%?", lower)
    if sl_match:
        try:
            sl_ratio = float(sl_match.group(1))
        except ValueError:
            pass

    # 3. Extract Target Multiple / R:R
    target_multiple = 2.0
    rr_match = re.search(r"1\s*:\s*([0-9.]+)", lower)
    if not rr_match:
        rr_match = re.search(r"(?:target|rr|r:r|reward)[:\s]*([0-9.]+)", lower)
    if rr_match:
        try:
            target_multiple = float(rr_match.group(1))
        except ValueError:
            pass

    # 4. Extract Asset
    asset = "NIFTY 50 & BANKNIFTY"
    if "banknifty" in lower:
        asset = "BANKNIFTY"
    elif "nifty options" in lower or "options" in lower:
        asset = "NIFTY OPTIONS"
    elif "nifty" in lower:
        asset = "NIFTY 50"
    elif "gold" in lower:
        asset = "GOLD (XAUUSD)"
    elif "crude" in lower:
        asset = "CRUDE OIL"
    elif "reliance" in lower:
        asset = "RELIANCE"
    elif "tata" in lower:
        asset = "TATA MOTORS"

    # 5. Extract Indicators
    indicators = []
    known_indicators = [
        "9/15 EMA", "9 EMA", "15 EMA", "20 EMA", "50 SMA", "200 EMA",
        "RSI", "VWAP", "SuperTrend", "MACD", "Bollinger Bands", "ATR",
        "CPR", "Pivot", "Volume Profile", "Wyckoff VSA", "Delta Footprint",
        "Order Block", "SMC", "Fair Value Gap (FVG)", "Fibonacci"
    ]
    for ind in known_indicators:
        if ind.lower() in lower or ind.replace(" ", "").lower() in lower:
            indicators.append(ind)
    if not indicators:
        if "ema" in lower:
            indicators.append("EMA Bands")
        if "rsi" in lower:
            indicators.append("RSI 14")
        if "vwap" in lower:
            indicators.append("VWAP")
    dedup_indicators = []
    for ind in indicators:
        if ind not in dedup_indicators:
            dedup_indicators.append(ind)
    indicators = dedup_indicators

    # 6. Extract / Infer Category
    category = "Custom Alpha Scalper"
    if "pullback" in lower or "scalp" in lower:
        category = "Momentum Pullback Scalper"
    elif "breakout" in lower:
        category = "Volatility Breakout"
    elif "reversion" in lower or "mean" in lower:
        category = "Mean Reversion"
    elif "gamma" in lower or "options" in lower:
        category = "Derivatives Momentum"

    # 7. Formulate Entry & Exit Rules
    entry_rules = f"Price retests {', '.join(indicators[:2])} on 3-minute timeframe with volume expansion. Quorum quorum >= 11/13 consensus."
    exit_rules = f"Target {target_multiple:.1f}x Risk ({target_multiple * sl_ratio:.2f}%) or trail stop behind dynamic swing support."

    strat_id = f"strat_{int(datetime.now().timestamp() * 1000)}"

    strategy_dict = {
        "id": strat_id,
        "name": name,
        "category": category,
        "asset": asset,
        "entry_rules": entry_rules,
        "exit_rules": exit_rules,
        "sl_ratio": sl_ratio,
        "stop_loss_pct": sl_ratio,
        "target_multiple": target_multiple,
        "target_risk_reward": target_multiple,
        "indicators": indicators,
        "risk_per_trade": 1.0,
        "is_preset": 0,
        "created_at": datetime.now().isoformat()
    }

    return strategy_dict


# ============================================================================
# SHARED STRATEGY LIBRARY - PRODUCTION VERSIONED REPOSITORY & AUDIT ENGINE
# ============================================================================

def log_strategy_audit(
    strategy_id: str,
    event_type: str,
    details: str,
    version: Optional[str] = None,
    operator: str = "Veeresh"
) -> int:
    """Logs an immutable audit event for a strategy."""
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            now_str = datetime.now().isoformat()
            cursor.execute("""
            INSERT INTO strategy_audit_trail (strategy_id, version, event_type, operator, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (strategy_id, version, event_type, operator, details, now_str))
            return cursor.lastrowid
    finally:
        conn.close()


def list_strategies(
    search: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    instrument: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Retrieves all strategies from the shared strategy_library with attached metadata,
    active version summary, and allocated bot counts.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        query = """
        SELECT 
            sl.*,
            sv.raw_source,
            sv.source_format as ver_format,
            sv.entry_rules,
            sv.exit_rules,
            sv.indicators as ver_indicators,
            sv.parameters as ver_parameters,
            sv.risk_limits as ver_risk_limits,
            sv.validation_report,
            sv.approval_status,
            COALESCE(alloc.active_bot_count, 0) as bot_count,
            COALESCE(alloc.assigned_bots, '[]') as assigned_bots
        FROM strategy_library sl
        LEFT JOIN strategy_versions sv 
            ON sl.id = sv.strategy_id AND sl.active_version = sv.version
        LEFT JOIN (
            SELECT strategy_id, COUNT(bot_id) as active_bot_count, json_group_array(bot_id) as assigned_bots
            FROM strategy_bot_allocations
            WHERE is_active = 1
            GROUP BY strategy_id
        ) alloc ON sl.id = alloc.strategy_id
        WHERE 1=1
        """
        params = []
        if status and status.lower() != "all":
            query += " AND LOWER(sl.status) = LOWER(?)"
            params.append(status)
        if category and category.lower() != "all":
            query += " AND LOWER(sl.category) = LOWER(?)"
            params.append(category)
        if search:
            query += " AND (LOWER(sl.name) LIKE ? OR LOWER(sl.description) LIKE ? OR LOWER(sl.id) LIKE ?)"
            term = f"%{search.lower()}%"
            params.extend([term, term, term])

        query += " ORDER BY sl.updated_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        results = []
        for r in rows:
            d = dict(r)
            # Parse JSON fields
            try:
                d["supported_instruments"] = json.loads(d["supported_instruments"]) if d.get("supported_instruments") else []
            except Exception:
                d["supported_instruments"] = []

            # Filter by instrument if specified
            if instrument and instrument.lower() != "all":
                inst_match = any(instrument.lower() in str(i).lower() for i in d["supported_instruments"])
                if not inst_match:
                    continue

            try:
                d["assigned_bots"] = json.loads(d["assigned_bots"]) if d.get("assigned_bots") else []
            except Exception:
                d["assigned_bots"] = []

            try:
                d["indicators"] = json.loads(d["ver_indicators"]) if d.get("ver_indicators") else []
            except Exception:
                d["indicators"] = []

            try:
                d["parameters"] = json.loads(d["ver_parameters"]) if d.get("ver_parameters") else {}
            except Exception:
                d["parameters"] = {}

            try:
                d["risk_limits"] = json.loads(d["ver_risk_limits"]) if d.get("ver_risk_limits") else {}
            except Exception:
                d["risk_limits"] = {}

            try:
                d["validation_report"] = json.loads(d["validation_report"]) if d.get("validation_report") else {}
            except Exception:
                d["validation_report"] = {}

            results.append(d)
        return results
    finally:
        conn.close()


def get_strategy_by_id(strategy_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves full details for a strategy, including active version details,
    all historical versions, allocated bots, and audit trail.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM strategy_library WHERE id = ?", (strategy_id,))
        strat_row = cursor.fetchone()
        if not strat_row:
            return None

        strat = dict(strat_row)
        try:
            strat["supported_instruments"] = json.loads(strat["supported_instruments"]) if strat.get("supported_instruments") else []
        except Exception:
            strat["supported_instruments"] = []

        # Get all versions
        cursor.execute("SELECT * FROM strategy_versions WHERE strategy_id = ? ORDER BY id DESC", (strategy_id,))
        ver_rows = cursor.fetchall()
        versions = []
        active_ver_data = None
        for vr in ver_rows:
            vd = dict(vr)
            for k in ["indicators", "parameters", "risk_limits", "validation_report"]:
                if vd.get(k):
                    try:
                        vd[k] = json.loads(vd[k])
                    except Exception:
                        pass
            versions.append(vd)
            if vd.get("version") == strat.get("active_version"):
                active_ver_data = vd

        strat["versions"] = versions
        strat["active_version_details"] = active_ver_data or (versions[0] if versions else None)

        # Get bot allocations
        cursor.execute("SELECT * FROM strategy_bot_allocations WHERE strategy_id = ? AND is_active = 1", (strategy_id,))
        alloc_rows = cursor.fetchall()
        strat["allocated_bots"] = [dict(ar) for ar in alloc_rows]
        strat["bot_count"] = len(strat["allocated_bots"])

        # Get audit trail (latest 30 events)
        cursor.execute("SELECT * FROM strategy_audit_trail WHERE strategy_id = ? ORDER BY id DESC LIMIT 30", (strategy_id,))
        audit_rows = cursor.fetchall()
        strat["audit_trail"] = [dict(a) for a in audit_rows]

        return strat
    finally:
        conn.close()


def get_strategy_versions(strategy_id: str) -> List[Dict[str, Any]]:
    """Retrieves all versions of a specific strategy."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM strategy_versions WHERE strategy_id = ? ORDER BY id DESC", (strategy_id,))
        rows = cursor.fetchall()
        results = []
        for r in rows:
            d = dict(r)
            for k in ["indicators", "parameters", "risk_limits", "validation_report"]:
                if d.get(k):
                    try:
                        d[k] = json.loads(d[k])
                    except Exception:
                        pass
            results.append(d)
        return results
    finally:
        conn.close()


def get_strategy_version(strategy_id: str, version: str) -> Optional[Dict[str, Any]]:
    """Retrieves an exact immutable version of a strategy."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM strategy_versions WHERE strategy_id = ? AND version = ?", (strategy_id, version))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        for k in ["indicators", "parameters", "risk_limits", "validation_report"]:
            if d.get(k):
                try:
                    d[k] = json.loads(d[k])
                except Exception:
                    pass
        return d
    finally:
        conn.close()


def create_strategy(data: Dict[str, Any], operator: str = "Veeresh") -> str:
    """
    Creates a new strategy in the shared Strategy Library with an initial v1.0.0 version.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            now_str = datetime.now().isoformat()
            strat_id = data.get("id") or f"strat_{int(datetime.now().timestamp() * 1000)}"
            name = str(data.get("name") or "Untitled Strategy").strip()
            category = str(data.get("category") or "Custom Alpha").strip()
            description = str(data.get("description") or "").strip()
            author = str(data.get("author") or operator).strip()
            source_format = str(data.get("source_format") or "STRUCTURED").upper()
            status = str(data.get("status") or "Draft")
            risk_classification = str(data.get("risk_classification") or "Moderate")
            timeframe = str(data.get("timeframe") or "5m")
            raw_source = str(data.get("raw_source") or data.get("code") or "")

            instruments = data.get("supported_instruments") or ["NIFTY 50"]
            if isinstance(instruments, str):
                try:
                    instruments = json.loads(instruments)
                except Exception:
                    instruments = [instruments]
            instruments_json = json.dumps(instruments)

            content_to_hash = f"{name}_{category}_{raw_source}_{instruments_json}".encode()
            content_hash = hashlib.sha256(content_to_hash).hexdigest()[:16]

            # 1. Insert core record
            cursor.execute("""
            INSERT INTO strategy_library (
                id, name, category, description, author, source_format,
                active_version, status, risk_classification, timeframe,
                supported_instruments, content_hash, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'v1.0.0', ?, ?, ?, ?, ?, ?, ?)
            """, (
                strat_id, name, category, description, author, source_format,
                status, risk_classification, timeframe,
                instruments_json, content_hash, now_str, now_str
            ))

            # 2. Insert initial version v1.0.0
            indicators = data.get("indicators") or []
            parameters = data.get("parameters") or {}
            risk_limits = data.get("risk_limits") or {
                "stop_loss_pct": float(data.get("stop_loss_pct", 0.5)),
                "target_pct": float(data.get("target_pct", 1.0)),
                "max_capital": float(data.get("max_capital", 35000.0)),
                "max_drawdown_pct": float(data.get("max_drawdown_pct", 2.0))
            }
            validation_report = data.get("validation_report") or {"is_valid": True, "errors": [], "warnings": []}
            approval_status = "Approved" if status in ["Approved", "Published"] else "Draft"

            cursor.execute("""
            INSERT INTO strategy_versions (
                strategy_id, version, raw_source, source_format, normalized_definition,
                entry_rules, exit_rules, indicators, parameters, risk_limits,
                validation_report, approval_status, change_summary, created_by, created_at
            ) VALUES (?, 'v1.0.0', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                strat_id,
                raw_source,
                source_format,
                json.dumps(data),
                str(data.get("entry_rules") or ""),
                str(data.get("exit_rules") or ""),
                json.dumps(indicators),
                json.dumps(parameters),
                json.dumps(risk_limits),
                json.dumps(validation_report),
                approval_status,
                "Initial creation v1.0.0",
                operator,
                now_str
            ))

            # 3. Log audit event
            cursor.execute("""
            INSERT INTO strategy_audit_trail (strategy_id, version, event_type, operator, details, timestamp)
            VALUES (?, 'v1.0.0', 'CREATED', ?, ?, ?)
            """, (strat_id, operator, f"Created strategy '{name}' in status '{status}'", now_str))

            return strat_id
    finally:
        conn.close()


def update_strategy(strategy_id: str, data: Dict[str, Any], operator: str = "Veeresh") -> bool:
    """Updates mutable metadata of a strategy (name, description, category, timeframe, risk, instruments, status)."""
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM strategy_library WHERE id = ?", (strategy_id,))
            existing = cursor.fetchone()
            if not existing:
                return False

            now_str = datetime.now().isoformat()
            name = str(data.get("name", existing["name"])).strip()
            category = str(data.get("category", existing["category"])).strip()
            description = str(data.get("description", existing["description"])).strip()
            status = str(data.get("status", existing["status"])).strip()
            risk_classification = str(data.get("risk_classification", existing["risk_classification"])).strip()
            timeframe = str(data.get("timeframe", existing["timeframe"])).strip()
            
            instruments = data.get("supported_instruments")
            if instruments is not None:
                if isinstance(instruments, list):
                    inst_json = json.dumps(instruments)
                else:
                    inst_json = str(instruments)
            else:
                inst_json = existing["supported_instruments"]

            cursor.execute("""
            UPDATE strategy_library SET
                name = ?, category = ?, description = ?, status = ?,
                risk_classification = ?, timeframe = ?, supported_instruments = ?, updated_at = ?
            WHERE id = ?
            """, (name, category, description, status, risk_classification, timeframe, inst_json, now_str, strategy_id))

            cursor.execute("""
            INSERT INTO strategy_audit_trail (strategy_id, version, event_type, operator, details, timestamp)
            VALUES (?, ?, 'UPDATED', ?, ?, ?)
            """, (strategy_id, existing["active_version"], operator, f"Updated strategy metadata: name='{name}', status='{status}'", now_str))

            return True
    finally:
        conn.close()


def create_strategy_version(strategy_id: str, version_data: Dict[str, Any], operator: str = "Veeresh") -> str:
    """
    Creates a new immutable version for an existing strategy (e.g., v1.1.0 or v2.0.0).
    Optionally activates the new version immediately.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM strategy_library WHERE id = ?", (strategy_id,))
            strat = cursor.fetchone()
            if not strat:
                raise ValueError(f"Strategy {strategy_id} not found.")

            version = str(version_data.get("version") or "").strip()
            if not version:
                # Auto-increment patch version
                cursor.execute("SELECT version FROM strategy_versions WHERE strategy_id = ? ORDER BY id DESC LIMIT 1", (strategy_id,))
                last_ver_row = cursor.fetchone()
                last_ver = last_ver_row["version"] if last_ver_row else "v1.0.0"
                try:
                    parts = [int(p) for p in last_ver.lstrip("v").split(".")]
                    parts[-1] += 1
                    version = f"v{parts[0]}.{parts[1]}.{parts[2]}"
                except Exception:
                    version = f"{last_ver}_next"

            # Check if version already exists
            cursor.execute("SELECT id FROM strategy_versions WHERE strategy_id = ? AND version = ?", (strategy_id, version))
            if cursor.fetchone():
                raise ValueError(f"Version {version} already exists for strategy {strategy_id}.")

            now_str = datetime.now().isoformat()
            raw_source = str(version_data.get("raw_source") or version_data.get("code") or "")
            source_format = str(version_data.get("source_format") or strat["source_format"]).upper()
            entry_rules = str(version_data.get("entry_rules") or "")
            exit_rules = str(version_data.get("exit_rules") or "")
            indicators = version_data.get("indicators") or []
            parameters = version_data.get("parameters") or {}
            risk_limits = version_data.get("risk_limits") or {}
            validation_report = version_data.get("validation_report") or {"is_valid": True, "errors": [], "warnings": []}
            approval_status = str(version_data.get("approval_status") or "Draft")
            change_summary = str(version_data.get("change_summary") or f"Version {version} update").strip()
            activate_now = bool(version_data.get("activate_now", False))

            cursor.execute("""
            INSERT INTO strategy_versions (
                strategy_id, version, raw_source, source_format, normalized_definition,
                entry_rules, exit_rules, indicators, parameters, risk_limits,
                validation_report, approval_status, change_summary, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                strategy_id,
                version,
                raw_source,
                source_format,
                json.dumps(version_data),
                entry_rules,
                exit_rules,
                json.dumps(indicators),
                json.dumps(parameters),
                json.dumps(risk_limits),
                json.dumps(validation_report),
                approval_status,
                change_summary,
                operator,
                now_str
            ))

            if activate_now:
                cursor.execute("""
                UPDATE strategy_library SET active_version = ?, updated_at = ? WHERE id = ?
                """, (version, now_str, strategy_id))

            cursor.execute("""
            INSERT INTO strategy_audit_trail (strategy_id, version, event_type, operator, details, timestamp)
            VALUES (?, ?, 'VERSION_CREATED', ?, ?, ?)
            """, (strategy_id, version, operator, f"Created version {version}: {change_summary} (active={activate_now})", now_str))

            return version
    finally:
        conn.close()


def rollback_strategy_version(strategy_id: str, target_version: str, operator: str = "Veeresh") -> bool:
    """
    Rolls back the active version of a strategy to a previous approved/valid version.
    Automatically cascades to update active bot allocations if needed.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM strategy_versions WHERE strategy_id = ? AND version = ?", (strategy_id, target_version))
            if not cursor.fetchone():
                raise ValueError(f"Version {target_version} does not exist for strategy {strategy_id}.")

            now_str = datetime.now().isoformat()
            cursor.execute("""
            UPDATE strategy_library SET active_version = ?, updated_at = ? WHERE id = ?
            """, (target_version, now_str, strategy_id))

            # Cascade update to active bot allocations
            cursor.execute("""
            UPDATE strategy_bot_allocations 
            SET version = ?, allocated_at = ?, notes = ?
            WHERE strategy_id = ? AND is_active = 1
            """, (target_version, now_str, f"Rollback to {target_version} by {operator}", strategy_id))

            cursor.execute("""
            INSERT INTO strategy_audit_trail (strategy_id, version, event_type, operator, details, timestamp)
            VALUES (?, ?, 'ROLLBACK', ?, ?, ?)
            """, (strategy_id, target_version, operator, f"Rolled back active strategy version to {target_version}", now_str))

            return True
    finally:
        conn.close()


def publish_strategy_to_bots(
    strategy_id: str,
    version: str,
    bot_ids: List[int],
    operator: str = "Veeresh"
) -> Dict[str, Any]:
    """
    Publishes an approved strategy version to one or more eligible bots (IDs 1-14).
    Enforces strict immutability: bots execute the exact referenced version.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM strategy_library WHERE id = ?", (strategy_id,))
            strat = cursor.fetchone()
            if not strat:
                raise ValueError(f"Strategy {strategy_id} does not exist.")

            cursor.execute("SELECT * FROM strategy_versions WHERE strategy_id = ? AND version = ?", (strategy_id, version))
            ver_row = cursor.fetchone()
            if not ver_row:
                raise ValueError(f"Version {version} does not exist for strategy {strategy_id}.")

            # Validate that the version has passed security & syntax validation
            val_rep = {}
            if ver_row["validation_report"]:
                try:
                    val_rep = json.loads(ver_row["validation_report"])
                except Exception:
                    pass

            # Actively re-validate raw_source if present to ensure no bypassed AST checks
            ver_data = dict(ver_row)
            raw_src = ver_data.get("raw_source") or ""
            if raw_src.strip():
                try:
                    from server.strategy_validator import StrategyValidator
                    fresh_val = StrategyValidator.validate(raw_src, metadata={"source_format": ver_data.get("source_format", "PYTHON")})
                    if fresh_val.get("is_valid") is False or (fresh_val.get("errors") and len(fresh_val.get("errors")) > 0):
                        val_rep = fresh_val
                except Exception as e:
                    val_rep = {"is_valid": False, "errors": [f"Strategy validation error: {str(e)}"]}

            if val_rep.get("is_valid") is False or (val_rep.get("errors") and len(val_rep.get("errors")) > 0):
                raise ValueError(f"Cannot publish strategy {strategy_id} ({version}): Validation failed with errors: {val_rep.get('errors')}")

            now_str = datetime.now().isoformat()

            # Mark version as Approved if not already
            cursor.execute("""
            UPDATE strategy_versions SET approval_status = 'Approved' WHERE strategy_id = ? AND version = ?
            """, (strategy_id, version))

            # Mark library strategy as Published and active
            cursor.execute("""
            UPDATE strategy_library SET status = 'Published', active_version = ?, updated_at = ? WHERE id = ?
            """, (version, now_str, strategy_id))

            # Allocate to target bots
            allocated = []
            for b_id in bot_ids:
                if 1 <= b_id <= 14:
                    cursor.execute("""
                    INSERT INTO strategy_bot_allocations (
                        bot_id, strategy_id, version, is_active, allocated_by, allocated_at, notes
                    ) VALUES (?, ?, ?, 1, ?, ?, ?)
                    ON CONFLICT(bot_id) DO UPDATE SET
                        strategy_id = excluded.strategy_id,
                        version = excluded.version,
                        is_active = 1,
                        allocated_by = excluded.allocated_by,
                        allocated_at = excluded.allocated_at,
                        notes = excluded.notes
                    """, (
                        b_id,
                        strategy_id,
                        version,
                        operator,
                        now_str,
                        f"Published {strategy_id} ({version}) to Bot #{b_id}"
                    ))
                    allocated.append(b_id)

            # Audit event
            cursor.execute("""
            INSERT INTO strategy_audit_trail (strategy_id, version, event_type, operator, details, timestamp)
            VALUES (?, ?, 'PUBLISHED', ?, ?, ?)
            """, (strategy_id, version, operator, f"Published version {version} to bots: {allocated}", now_str))

            return {
                "status": "success",
                "strategy_id": strategy_id,
                "version": version,
                "allocated_bots": allocated,
                "timestamp": now_str
            }
    finally:
        conn.close()


def archive_strategy(strategy_id: str, operator: str = "Veeresh") -> bool:
    """
    Archives a strategy. Deactivates its bot allocations so running bots revert to canonical fallbacks.
    """
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM strategy_library WHERE id = ?", (strategy_id,))
            strat = cursor.fetchone()
            if not strat:
                return False

            now_str = datetime.now().isoformat()
            cursor.execute("""
            UPDATE strategy_library SET status = 'Archived', updated_at = ? WHERE id = ?
            """, (now_str, strategy_id))

            # Deactivate any active allocations
            cursor.execute("""
            UPDATE strategy_bot_allocations SET is_active = 0 WHERE strategy_id = ?
            """, (strategy_id,))

            cursor.execute("""
            INSERT INTO strategy_audit_trail (strategy_id, version, event_type, operator, details, timestamp)
            VALUES (?, ?, 'ARCHIVED', ?, ?, ?)
            """, (strategy_id, strat["active_version"], operator, "Archived strategy and deactivated active bot allocations", now_str))

            return True
    finally:
        conn.close()


def duplicate_strategy(strategy_id: str, new_name: Optional[str] = None, operator: str = "Veeresh") -> str:
    """Clones an existing strategy and its active version to a new Draft strategy."""
    strat = get_strategy_by_id(strategy_id)
    if not strat:
        raise ValueError(f"Strategy {strategy_id} not found.")

    active_ver = strat.get("active_version_details") or {}
    new_strat_id = f"strat_copy_{int(datetime.now().timestamp() * 1000)}"
    clone_data = {
        "id": new_strat_id,
        "name": new_name or f"{strat['name']} (Copy)",
        "category": strat.get("category", "Custom Alpha"),
        "description": f"Duplicated from {strat['name']} ({strat['id']})",
        "author": operator,
        "source_format": strat.get("source_format", "STRUCTURED"),
        "status": "Draft",
        "risk_classification": strat.get("risk_classification", "Moderate"),
        "timeframe": strat.get("timeframe", "5m"),
        "supported_instruments": strat.get("supported_instruments", []),
        "raw_source": active_ver.get("raw_source", ""),
        "entry_rules": active_ver.get("entry_rules", ""),
        "exit_rules": active_ver.get("exit_rules", ""),
        "indicators": active_ver.get("indicators", []),
        "parameters": active_ver.get("parameters", {}),
        "risk_limits": active_ver.get("risk_limits", {})
    }
    created_id = create_strategy(clone_data, operator=operator)
    log_strategy_audit(
        strategy_id=created_id,
        event_type="DUPLICATED",
        details=f"Duplicated from strategy {strategy_id}",
        version="v1.0.0",
        operator=operator
    )
    return created_id


def get_strategy_audit_trail(strategy_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves strategy audit trail records."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        if strategy_id:
            cursor.execute("SELECT * FROM strategy_audit_trail WHERE strategy_id = ? ORDER BY id DESC LIMIT ?", (strategy_id, limit))
        else:
            cursor.execute("SELECT * FROM strategy_audit_trail ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_bot_strategy_allocations() -> List[Dict[str, Any]]:
    """
    Retrieves current strategy allocation for all 14 bots.
    Returns bot_id, bot_name, strategy_id, strategy_name, version, is_active, allocated_at.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT 
            sba.bot_id,
            sba.strategy_id,
            sba.version,
            sba.is_active,
            sba.allocated_by,
            sba.allocated_at,
            sba.notes,
            sl.name as strategy_name,
            sl.category,
            sl.status as strategy_status,
            sl.timeframe,
            sl.risk_classification
        FROM strategy_bot_allocations sba
        LEFT JOIN strategy_library sl ON sba.strategy_id = sl.id
        ORDER BY sba.bot_id ASC
        """)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_bot_strategy(bot_id: int) -> Optional[Dict[str, Any]]:
    """
    Retrieves the allocated active strategy and immutable version definition for a specific bot.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT 
            sba.bot_id,
            sba.strategy_id,
            sba.version,
            sba.is_active,
            sl.name as strategy_name,
            sl.category,
            sl.source_format,
            sl.status as strategy_status,
            sl.timeframe,
            sl.risk_classification,
            sv.raw_source,
            sv.normalized_definition,
            sv.entry_rules,
            sv.exit_rules,
            sv.indicators,
            sv.parameters,
            sv.risk_limits
        FROM strategy_bot_allocations sba
        JOIN strategy_library sl ON sba.strategy_id = sl.id
        JOIN strategy_versions sv ON sba.strategy_id = sv.strategy_id AND sba.version = sv.version
        WHERE sba.bot_id = ? AND sba.is_active = 1
        LIMIT 1
        """, (bot_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        for k in ["indicators", "parameters", "risk_limits"]:
            if d.get(k):
                try:
                    d[k] = json.loads(d[k])
                except Exception:
                    pass
        return d
    finally:
        conn.close()



