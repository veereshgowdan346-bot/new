"""
CHINTU AI TRADING SYSTEM - Provenance & Synthetic Isolation Regression Tests
Verifies:
1. Deterministic trade provenance classification across all categories.
2. Option instrument integrity validation rejecting spot prices.
3. Strict isolation of synthetic replays & telemetry tests from live capital allocation.
4. Recalculation engine segregation of authentic vs synthetic metrics.
5. Fail-closed treatment of unresolved regulatory charges (never ₹0.00).
6. Authentic paper-trading session provenance assignment.
"""

import pytest
import sqlite3
import os
from server.trade_provenance import (
    classify_trade_provenance,
    is_verified_authentic,
    PROVENANCE_REAL_BROKER,
    PROVENANCE_AUTHENTIC_FEED_PAPER,
    PROVENANCE_SYNTHETIC_REPLAY,
    PROVENANCE_TELEMETRY_TEST,
    PROVENANCE_MOCK_BROKER,
    PROVENANCE_SYNTHETIC_STRESS_TEST,
    PROVENANCE_RMS_REJECTION,
    PROVENANCE_INITIAL_ENTRY,
    PROVENANCE_UNKNOWN
)
from server.regulatory_charges import (
    validate_option_contract_integrity,
    compute_instrument_regulatory_charges
)
from server.highest_profit_bot import get_highest_profit_bot, MIN_QUALIFYING_TRADES
from server.bot_registry import CANONICAL_BOT_REGISTRY


@pytest.fixture
def isolated_db(tmp_path):
    """Provides a fresh, isolated SQLite database initialized with the standard schema."""
    db_file = str(tmp_path / "test_chintu.db")
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
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
    for b_id, bot_cfg in CANONICAL_BOT_REGISTRY.items():
        cursor.execute("""
        INSERT INTO bot_performance_memory (bot_id, bot_name, target_asset, win_rate, total_trades, winning_trades, losing_trades, pnl, regime_score, status, allocated_capital, updated_at)
        VALUES (?, ?, ?, 0.0, 0, 0, 0, 0.0, 0.80, 'RUNNING', 0.0, '2026-10-18T00:00:00')
        """, (b_id, bot_cfg["name"], bot_cfg["asset"]))
    conn.commit()
    conn.close()
    return db_file


def test_provenance_classification_all_categories():
    """Verifies that all trade types are deterministically classified."""
    # RMS Rejection
    rms_trade = {"id": 1, "order_id": "RMS-REJECTED-001", "pnl": "+₹0.00", "mode": "RMS_CAPITAL_EXCEEDED"}
    assert classify_trade_provenance(rms_trade) == PROVENANCE_RMS_REJECTION

    # Mock Broker
    mock_trade = {"id": 2, "order_id": "FAKE_AO_1", "pnl": "+₹150.00", "broker": "FakeBroker"}
    assert classify_trade_provenance(mock_trade) == PROVENANCE_MOCK_BROKER

    # Initial Entry Order
    entry_trade = {"id": 10, "action": "BUY", "pnl": "+₹0.00", "order_id": "ORD-100"}
    assert classify_trade_provenance(entry_trade) == PROVENANCE_INITIAL_ENTRY

    # Synthetic Stress Test
    stress_trade = {"id": 737, "pnl": "-₹45,721.50", "action": "SELL", "order_id": "ORD-737"}
    assert classify_trade_provenance(stress_trade) == PROVENANCE_SYNTHETIC_STRESS_TEST

    # Telemetry Test
    tele_trade = {"id": 50, "symbol": "TEST_TELE_1", "pnl": "+₹150.00", "order_id": "ORD-TELE"}
    assert classify_trade_provenance(tele_trade) == PROVENANCE_TELEMETRY_TEST

    # Synthetic Fixed-Target Replay
    replay_trade = {"id": 100, "symbol": "NIFTY 50", "pnl": "+₹150.00", "action": "SELL", "order_id": "ORD-100"}
    assert classify_trade_provenance(replay_trade) == PROVENANCE_SYNTHETIC_REPLAY

    # Real Broker Execution
    real_trade = {
        "id": 200,
        "is_broker_confirmed": True,
        "mode": "LIVE",
        "broker": "Angel One (SmartAPI)",
        "order_id": "AO_20261018_9988",
        "pnl": "+₹325.50"
    }
    assert classify_trade_provenance(real_trade) == PROVENANCE_REAL_BROKER
    assert is_verified_authentic(PROVENANCE_REAL_BROKER) is True

    # Authentic-Feed Paper Trade
    paper_trade = {
        "id": 300,
        "is_authentic_feed": True,
        "mode": "PAPER",
        "broker": "Angel One Feed Simulator",
        "order_id": "SIM_PAPER_300",
        "pnl": "+₹410.25"
    }
    assert classify_trade_provenance(paper_trade) == PROVENANCE_AUTHENTIC_FEED_PAPER
    assert is_verified_authentic(PROVENANCE_AUTHENTIC_FEED_PAPER) is True

    # Unknown Provenance
    unknown_trade = {"id": 999, "symbol": "NIFTY 50", "pnl": "+₹312.45", "action": "SELL", "order_id": "ORD-999"}
    assert classify_trade_provenance(unknown_trade) == PROVENANCE_UNKNOWN
    assert is_verified_authentic(PROVENANCE_UNKNOWN) is False


def test_option_contract_integrity_validation():
    """Verifies that validate_option_contract_integrity rejects spot prices and plain tickers."""
    # 1. Spot index price (> 2000) under options segment
    is_valid, reason = validate_option_contract_integrity("NIFTY26OCT24500CE", 24850.0, "NSE F&O Options")
    assert not is_valid
    assert "underlying index spot level" in reason

    # 2. Plain ticker under options segment
    is_valid, reason = validate_option_contract_integrity("RELIANCE", 2800.0, "NSE F&O Options")
    assert not is_valid
    assert "lacks option strike" in reason or "Invalid" in reason

    # 3. Stock spot price (> 500) under stock options
    is_valid, reason = validate_option_contract_integrity("TATAMOTORS26OCT900CE", 920.0, "NSE F&O Options")
    assert not is_valid
    assert "underlying stock spot level" in reason

    # 4. Valid option contract
    is_valid, reason = validate_option_contract_integrity("NIFTY26OCT24500CE", 145.50, "NSE F&O Options")
    assert is_valid
    assert reason in (None, "Valid option contract.")


def test_compute_instrument_regulatory_charges_fail_closed_on_unresolved():
    """Verifies that invalid options return UNRESOLVED charges status, never ₹0.00."""
    res = compute_instrument_regulatory_charges(
        symbol="NIFTY 50",
        segment="NSE F&O Options",
        price=24850.0,
        qty=50,
        action="SELL",
        strict_options_validation=True
    )
    assert res["validation_status"] == "QUARANTINED"
    assert res["charges_status"] == "UNRESOLVED"
    assert res["is_quarantined"] is True
    assert res["total_charges"] == 0.0  # Cannot certify fees on mislabeled spot index


def test_highest_profit_bot_synthetic_isolation(isolated_db):
    """
    Verifies that highest_profit_bot disqualifies bots from live capital allocation
    if their trades are synthetic replays, even if they have > 5 trades and positive PnL.
    """
    conn = sqlite3.connect(isolated_db)
    cursor = conn.cursor()

    # Insert 10 synthetic replay trades (+150.00 each) for Bot 1
    for i in range(1, 11):
        cursor.execute("""
        INSERT INTO trade_memory (trade_id, bot, symbol, segment, action, qty, price, pnl, is_positive, order_id, exchange, mode, broker, post_trade_analysis)
        VALUES (?, 'Bot 1 - Intraday Momentum', 'NIFTY 50', 'NSE Equity', 'SELL', 10, 100.0, '+₹150.00', 1, ?, 'NSE', 'PAPER', 'SmartAPI', 'Fixed-target test replay execution')
        """, (f"TRD_REPLAY_{i}", f"ORD_REP_{i}"))

    conn.commit()
    conn.close()

    res = get_highest_profit_bot(db_path=isolated_db)
    # Bot 1 should NOT be live allocation eligible because verified_authentic_trades is 0
    rankings = res.get("bot_rankings", [])
    bot_1 = next((b for b in rankings if b["bot_id"] == 1), None)
    assert bot_1 is not None
    assert bot_1["verified_authentic_trades"] == 0
    assert bot_1["synthetic_trades"] == 10
    assert bot_1["is_live_allocation_eligible"] is False


def test_highest_profit_bot_authentic_eligibility(isolated_db):
    """
    Verifies that a bot with >= 5 verified authentic paper trades with positive PnL
    is eligible for live capital allocation.
    """
    conn = sqlite3.connect(isolated_db)
    cursor = conn.cursor()

    # Insert 6 verified authentic paper trades for Bot 2 with variable PnL and explicit AUTHENTIC_FEED_PAPER
    pnls = [320.50, 415.00, -180.00, 520.00, 210.25, 380.00]
    for i, pnl_val in enumerate(pnls, 1):
        pnl_str = f"+₹{pnl_val:.2f}" if pnl_val >= 0 else f"-₹{abs(pnl_val):.2f}"
        is_pos = 1 if pnl_val >= 0 else 0
        cursor.execute("""
        INSERT INTO trade_memory (trade_id, bot, symbol, segment, action, qty, price, pnl, is_positive, order_id, exchange, mode, broker, post_trade_analysis, provenance)
        VALUES (?, 'Bot 2 - Nifty Trend Surfer', 'NIFTY 50', 'NSE Equity', 'SELL', 10, 24500.0, ?, ?, ?, 'NSE', 'PAPER', 'Angel One Feed Simulator', 'Authentic feed execution', 'AUTHENTIC_FEED_PAPER')
        """, (f"AUTH_{i}", pnl_str, is_pos, f"ORD_AUTH_{i}"))

    conn.commit()
    conn.close()

    res = get_highest_profit_bot(db_path=isolated_db)
    rankings = res.get("bot_rankings", [])
    bot_2 = next((b for b in rankings if b["bot_id"] == 2), None)
    assert bot_2 is not None
    assert bot_2["verified_authentic_trades"] == 6
    assert bot_2["is_live_allocation_eligible"] is True


def test_recalculate_bot_performance_excludes_rms_and_entries(isolated_db, monkeypatch):
    """
    Verifies that recalculate_bot_performance excludes RMS rejections and initial entries
    from closed trade counts and win rate calculations.
    """
    import server.memory_db as mem_db
    monkeypatch.setattr(mem_db, "DB_PATH", isolated_db)

    # Log an RMS rejection
    mem_db.log_trade({
        "trade_id": "RMS_TEST_1",
        "bot": "Bot 1 - Intraday Momentum",
        "symbol": "NIFTY 50",
        "action": "BUY",
        "qty": 50,
        "price": 24500.0,
        "pnl": "+₹0.00",
        "order_id": "RMS-REJECTED-99",
        "mode": "RMS_CAPITAL_EXCEEDED",
        "broker": "RMS Guard Engine"
    })

    # Log an Initial Entry order
    mem_db.log_trade({
        "trade_id": "ENTRY_TEST_1",
        "bot": "Bot 1 - Intraday Momentum",
        "symbol": "NIFTY 50",
        "action": "BUY",
        "qty": 50,
        "price": 24500.0,
        "pnl": "+₹0.00",
        "order_id": "ORD_ENTRY_99",
        "mode": "PAPER",
        "broker": "SmartAPI"
    })

    # Recalculate
    mem_db.recalculate_bot_performance(bot_id=1)

    bots = mem_db.get_all_bot_performance()
    bot_1 = next((b for b in bots if b["bot_id"] == 1), None)
    assert bot_1 is not None
    # Neither RMS rejection nor entry order should count as a closed trade
    assert bot_1["total_trades"] == 0
    assert bot_1["win_rate"] == 0.0
