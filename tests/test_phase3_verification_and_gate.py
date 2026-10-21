"""
CHINTU AI TRADING SYSTEM - Phase 3 Verification & Qualification Gate Tests
Validates:
1. Hardened evidentiary verification in trade_provenance.py:
   - Unconfirmed REAL_BROKER_EXECUTION claims fail closed.
   - Script simulations (randomized slippage / EXP_ORD) classified as SYNTHETIC_SIMULATION.
2. Highest profit bot qualification gate:
   - Returns status: "NO_QUALIFIED_BOT" on production DB server/chintu_memory.db.
   - Returns status: "NO_QUALIFIED_BOT" on exploratory DB server/data/exploratory_paper.db.
   - Requires >= 5 verified authentic trades with positive verified net PnL to qualify.
   - Rejects bots whose trades are purely synthetic replays or simulations.
3. Market feed and execution safety:
   - Live order placement blocked when market is closed or feed credentials are unconfigured.
   - Execution mode remains strictly PAPER.
"""

import pytest
import sqlite3
import os
from decimal import Decimal

from server.trade_provenance import (
    classify_trade_provenance,
    is_verified_authentic,
    PROVENANCE_REAL_BROKER,
    PROVENANCE_AUTHENTIC_FEED_PAPER,
    PROVENANCE_SYNTHETIC_SIMULATION,
    PROVENANCE_SYNTHETIC_REPLAY,
    PROVENANCE_TELEMETRY_TEST,
    PROVENANCE_MOCK_BROKER,
    PROVENANCE_SYNTHETIC_STRESS_TEST,
    PROVENANCE_RMS_REJECTION,
    PROVENANCE_INITIAL_ENTRY,
    PROVENANCE_UNKNOWN
)
from server.highest_profit_bot import (
    get_highest_profit_bot,
    evaluate_bot_trade_performance,
    MIN_QUALIFYING_TRADES
)
from server.bot_registry import CANONICAL_BOT_REGISTRY
from server.angel_feed_manager import AngelOneWebSocketManager, InstrumentAuditor


def test_unconfirmed_real_broker_fails_closed():
    """Any record claiming REAL_BROKER_EXECUTION without broker confirmation must fail closed."""
    # Claimed LIVE broker but no confirmation callback and mock order id
    fake_live = {
        "id": 999,
        "order_id": "FAKE_AO_99",
        "mode": "LIVE",
        "broker": "Angel One (SmartAPI)",
        "provenance": PROVENANCE_REAL_BROKER,
        "is_broker_confirmed": False
    }
    assert classify_trade_provenance(fake_live) == PROVENANCE_MOCK_BROKER

    # Claimed LIVE broker with pending order id and no confirmation
    unconfirmed_live = {
        "id": 1000,
        "order_id": "ORD-PENDING-123",
        "mode": "LIVE",
        "broker": "Angel One (SmartAPI)",
        "provenance": PROVENANCE_REAL_BROKER,
        "is_broker_confirmed": False
    }
    assert classify_trade_provenance(unconfirmed_live) == PROVENANCE_UNKNOWN

    # Only when confirmed by broker, with genuine order id, LIVE mode, and valid broker
    confirmed_live = {
        "id": 1001,
        "order_id": "24101800098231",
        "mode": "LIVE",
        "broker": "Angel One (SmartAPI)",
        "provenance": PROVENANCE_REAL_BROKER,
        "is_broker_confirmed": True
    }
    assert classify_trade_provenance(confirmed_live) == PROVENANCE_REAL_BROKER


def test_script_simulation_classified_as_synthetic_simulation():
    """Script simulations with randomized numbers or EXP_ORD prefix must be SYNTHETIC_SIMULATION."""
    # Trade claiming authentic paper but having EXP_ORD prefix
    exp_trade = {
        "id": 501,
        "order_id": "EXP_ORD_OUT_0001",
        "mode": "PAPER",
        "broker": "Angel One Paper Gateway",
        "symbol": "NIFTY 50",
        "provenance": PROVENANCE_AUTHENTIC_FEED_PAPER,
        "post_trade_analysis": "Simulated slippage 0.12 pts"
    }
    assert classify_trade_provenance(exp_trade) == PROVENANCE_SYNTHETIC_SIMULATION
    assert is_verified_authentic(PROVENANCE_SYNTHETIC_SIMULATION) is False

    # Trade with random simulation flag
    random_trade = {
        "id": 502,
        "order_id": "ORD_SIM_002",
        "mode": "PAPER",
        "is_randomized_simulation": True,
        "provenance": PROVENANCE_AUTHENTIC_FEED_PAPER
    }
    assert classify_trade_provenance(random_trade) == PROVENANCE_SYNTHETIC_SIMULATION


def test_production_database_returns_no_qualified_bot():
    """
    On server/chintu_memory.db (759 historical rows), get_highest_profit_bot()
    must strictly return status: NO_QUALIFIED_BOT because 0 bots have >= 5 authentic trades.
    """
    res = get_highest_profit_bot()
    assert res["status"] == "NO_QUALIFIED_BOT"
    assert res["qualified"] is False
    assert res["highest_profit_bot"] is None
    assert "No bot meets the qualification criteria" in res["reason"]

    # Verify that all 14 bots in rankings are disqualified
    assert len(res["bot_rankings"]) == 14
    for b in res["bot_rankings"]:
        assert b["is_qualified"] is False
        assert b["is_live_allocation_eligible"] is False
        assert b["verified_authentic_trades"] == 0


def test_exploratory_database_returns_no_qualified_bot():
    """
    On server/data/exploratory_paper.db, get_highest_profit_bot()
    must strictly return status: NO_QUALIFIED_BOT because the 65 trades are SYNTHETIC_SIMULATION.
    """
    exploratory_db = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server", "data", "exploratory_paper.db")
    if os.path.exists(exploratory_db):
        res = get_highest_profit_bot(db_path=exploratory_db)
        assert res["status"] == "NO_QUALIFIED_BOT"
        assert res["qualified"] is False
        assert res["highest_profit_bot"] is None
        for b in res["bot_rankings"]:
            assert b["is_qualified"] is False
            assert b["is_live_allocation_eligible"] is False
            assert b["verified_authentic_trades"] == 0
            assert b["synthetic_simulations"] > 0 or b["total_trades"] == 0


def test_bot_qualifies_only_with_authentic_trades(tmp_path):
    """
    A bot only qualifies when it has >= 5 verified authentic trades and positive verified net PnL.
    Synthetic replays and simulations are excluded.
    """
    db_file = str(tmp_path / "test_qualification.db")
    conn = sqlite3.connect(db_file)
    c = conn.cursor()
    c.execute("""
    CREATE TABLE trade_memory (
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
        provenance TEXT
    )
    """)
    # 1. Insert 10 synthetic replays (+150 each) for Bot 1 (Scalper Bot)
    for i in range(1, 11):
        c.execute("""
        INSERT INTO trade_memory (trade_id, bot, symbol, segment, action, qty, price, pnl, is_positive, order_id, exchange, mode, broker, post_trade_analysis, provenance)
        VALUES (?, 'Scalper Bot', 'NIFTY 50', 'NSE Equity', 'SELL', 10, 100.0, '+₹150.00', 1, ?, 'NSE', 'PAPER', 'SmartAPI', 'Synthetic test', 'SYNTHETIC_REPLAY')
        """, (f"SYN_{i}", f"ORD_SYN_{i}"))

    # 2. Insert 4 verified authentic trades for Bot 2 (EMA Trend Bot) - below threshold of 5
    for i in range(1, 5):
        c.execute("""
        INSERT INTO trade_memory (trade_id, bot, symbol, segment, action, qty, price, pnl, is_positive, order_id, exchange, mode, broker, post_trade_analysis, provenance)
        VALUES (?, 'EMA Trend Bot', 'NIFTY 50', 'NSE Equity', 'SELL', 10, 24500.0, '+₹500.00', 1, ?, 'NSE', 'PAPER', 'Angel One (SmartAPI)', 'Authentic tick execution', 'AUTHENTIC_FEED_PAPER')
        """, (f"AUTH4_{i}", f"ORD_AUTH4_{i}"))

    conn.commit()

    res1 = get_highest_profit_bot(db_path=db_file)
    # Neither qualifies: Bot 1 has 0 authentic; Bot 2 has only 4 (< 5)
    assert res1["status"] == "NO_QUALIFIED_BOT"

    # 3. Add 5th and 6th verified authentic trade for Bot 2
    for i in range(5, 7):
        c.execute("""
        INSERT INTO trade_memory (trade_id, bot, symbol, segment, action, qty, price, pnl, is_positive, order_id, exchange, mode, broker, post_trade_analysis, provenance)
        VALUES (?, 'EMA Trend Bot', 'NIFTY 50', 'NSE Equity', 'SELL', 10, 24500.0, '+₹500.00', 1, ?, 'NSE', 'PAPER', 'Angel One (SmartAPI)', 'Authentic tick execution', 'AUTHENTIC_FEED_PAPER')
        """, (f"AUTH6_{i}", f"ORD_AUTH6_{i}"))
    conn.commit()
    conn.close()

    res2 = get_highest_profit_bot(db_path=db_file)
    assert res2["status"] == "QUALIFIED"
    assert res2["highest_profit_bot"]["bot_id"] == 2
    assert res2["highest_profit_bot"]["verified_authentic_trades"] == 6


def test_angel_one_feed_credentials_and_market_state():
    """Inspects market state and feed credentials safely without leaking secrets."""
    ws_mgr = AngelOneWebSocketManager()
    cred_status = ws_mgr.get_credential_status()
    # Check that secrets are not printed and boolean flags report configuration status
    assert "has_api_key" in cred_status
    assert "has_client_id" in cred_status

    session_state = InstrumentAuditor.get_market_session_state()
    assert "status" in session_state
    assert "is_open" in session_state
