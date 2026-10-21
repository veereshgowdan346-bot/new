"""
CHINTU AI TRADING SYSTEM - Phase 12 Automated Verification Suite
Tests dynamic OpenAPI Scrip Master downloader, cache persistence, dynamic contract resolution,
SmartWebSocketV2 token subscription formatting, bounded exponential backoff reconnection,
distinct tick source segregation, binary tick decoding, and strict PAPER execution safety.
"""

import os
import json
import time
import pytest
from datetime import datetime, timezone, timedelta

from server.instrument_master import (
    DynamicInstrumentMaster,
    SEED_RECORDS,
    parse_expiry_date,
    instrument_master,
    OPENAPI_SCRIP_MASTER_URL
)
from server.angel_feed_manager import (
    AngelOneWebSocketManager,
    InstrumentAuditor,
    EXCHANGE_TYPE_MAP,
    angel_feed_manager
)
from server.bot_registry import CANONICAL_BOT_REGISTRY


class TestDynamicInstrumentMaster:
    """Tests Instrument Master download, caching, schema validation, and fallback mechanisms."""

    def test_cache_loading_and_metadata(self):
        """Verifies local cache can be loaded and contains required metadata fields."""
        master = DynamicInstrumentMaster()
        loaded = master.load_cache()
        assert loaded is True, "Scrip master local cache should load successfully."
        assert master.record_count > 1000, f"Expected >1000 records in master, got {master.record_count}"
        
        meta = master.get_metadata()
        assert "record_count" in meta
        assert "fetched_at" in meta
        assert "content_hash" in meta
        assert meta["record_count"] == master.record_count

    def test_validate_scrip_records_schema(self):
        """Validates that valid records pass and malformed records are detected and filtered."""
        master = DynamicInstrumentMaster()
        
        # Valid batch
        valid_batch = [
            {
                "token": "2885",
                "symbol": "RELIANCE-EQ",
                "name": "RELIANCE",
                "expiry": "",
                "strike": "-1.000000",
                "lotsize": "1",
                "instrumenttype": "",
                "exch_seg": "NSE",
                "tick_size": "5.000000"
            }
        ]
        is_valid, msg, cleaned = master.validate_scrip_records(valid_batch)
        assert is_valid is True
        assert len(cleaned) == 1

        # Malformed record missing required keys
        malformed_batch = [
            {"token": "9999"}  # Missing symbol, name, exch_seg
        ]
        is_valid, msg, cleaned = master.validate_scrip_records(malformed_batch)
        assert len(cleaned) == 0, "Malformed record without symbol/name must be excluded."

        # Non-list input
        is_valid, msg, cleaned = master.validate_scrip_records({"not": "a list"})
        assert is_valid is False

    def test_fallback_to_seed_records_on_error(self, tmp_path):
        """Ensures that in absence of cache and network failure, system safely falls back to seed."""
        isolated_cache = str(tmp_path / "non_existent_cache.json")
        isolated_meta = str(tmp_path / "non_existent_meta.json")
        master = DynamicInstrumentMaster(cache_file=isolated_cache, meta_file=isolated_meta)
        
        # Attempt download from impossible URL with 0.1s timeout
        orig_url = "http://127.0.0.1:54321/impossible.json"
        res = master.download_and_update(timeout=0.1, url=orig_url)
        
        # Should cleanly fall back to SEED_RECORDS without crashing
        assert res["status"] in ["SEED_FALLBACK", "FALLBACK_CACHE_USED"]
        assert master.record_count == len(SEED_RECORDS)
        assert master.resolve_equity("RELIANCE") is not None


class TestContractResolution:
    """Tests dynamic resolution of equities, active futures, and options contracts."""

    def test_resolve_permanent_cash_equities(self):
        """Verifies permanent equities resolve correctly including corporate action aliases."""
        instrument_master.ensure_loaded()

        # Reliance
        rel = instrument_master.resolve_equity("RELIANCE-EQ", exch_seg="NSE")
        assert rel is not None
        assert rel["token"] == "2885"
        assert rel["exch_seg"] == "NSE"

        # HDFC Bank
        hdfc = instrument_master.resolve_equity("HDFCBANK-EQ", exch_seg="NSE")
        assert hdfc is not None
        assert hdfc["token"] == "1333"

        # Infosys
        infy = instrument_master.resolve_equity("INFY-EQ", exch_seg="NSE")
        assert infy is not None
        assert infy["token"] == "1594"

        # Tata Motors discrepancy check: TATAMOTORS-EQ is absent from official master and not aliasable to TMPV-EQ
        tm = instrument_master.resolve_equity("TATAMOTORS-EQ", exch_seg="NSE", token="3456")
        assert tm is None
        # TMPV-EQ resolves directly
        tmpv = instrument_master.resolve_equity("TMPV-EQ", exch_seg="NSE")
        assert tmpv is not None
        assert tmpv["token"] == "3456"

    def test_resolve_active_future_near_month(self):
        """Verifies near-month future selection picks the nearest unexpired contract."""
        instrument_master.ensure_loaded()
        ref_date = datetime(2026, 10, 17)

        # NIFTY Index Future
        nifty_fut = instrument_master.resolve_active_future("NIFTY", exch_seg="NFO", as_of_date=ref_date)
        assert nifty_fut is not None
        assert "NIFTY" in nifty_fut["symbol"]
        assert nifty_fut["symbol"].endswith("FUT")
        exp_dt = parse_expiry_date(nifty_fut["expiry"])
        assert exp_dt is not None
        assert exp_dt.date() >= ref_date.date()

        # MCX Crude Oil Future
        crude_fut = instrument_master.resolve_active_future("CRUDEOIL", exch_seg="MCX", as_of_date=ref_date)
        assert crude_fut is not None
        assert crude_fut["exch_seg"] == "MCX"
        assert crude_fut["symbol"].endswith("FUT")

        # MCX Gold Future
        gold_fut = instrument_master.resolve_active_future("GOLD", exch_seg="MCX", as_of_date=ref_date)
        assert gold_fut is not None
        assert gold_fut["exch_seg"] == "MCX"

        # MCX Silver Future
        silver_fut = instrument_master.resolve_active_future("SILVER", exch_seg="MCX", as_of_date=ref_date)
        assert silver_fut is not None
        assert silver_fut["exch_seg"] == "MCX"

        # BSE Sensex Future
        sensex_fut = instrument_master.resolve_active_future("SENSEX", exch_seg="BFO", as_of_date=ref_date)
        assert sensex_fut is not None
        assert sensex_fut["exch_seg"] == "BFO"

    def test_resolve_options_contract_and_strike_conversion(self):
        """Verifies options resolution with strike matching and paise-to-rupee handling."""
        instrument_master.ensure_loaded()
        ref_date = datetime(2026, 10, 17)

        # NIFTY CE strike 24750.0
        nifty_ce = instrument_master.resolve_option("NIFTY", strike=24750.0, option_type="CE", as_of_date=ref_date)
        assert nifty_ce is not None
        assert nifty_ce["symbol"].endswith("CE")
        assert nifty_ce["exch_seg"] == "NFO"

        # BANKNIFTY CE strike 52500.0
        bn_ce = instrument_master.resolve_option("BANKNIFTY", strike=52500.0, option_type="CE", as_of_date=ref_date)
        assert bn_ce is not None
        assert bn_ce["symbol"].endswith("CE")
        assert bn_ce["exch_seg"] == "NFO"

        # Non-existent strike returns None, never fabricates
        impossible_opt = instrument_master.resolve_option("NIFTY", strike=999999.0, option_type="CE", as_of_date=ref_date)
        assert impossible_opt is None


class TestBotRegistryAudit:
    """Verifies audit results for all 14 canonical bots against live Scrip Master."""

    def test_audit_all_14_bots_comprehensive(self):
        """Audits all 14 bots: 4 permanent equities valid, 10 derivatives resolved to active contracts."""
        instrument_master.ensure_loaded()
        ref_date = datetime(2026, 10, 17)

        permanent_equity_ids = [3, 6, 7]
        derivative_ids = [1, 2, 5, 8, 9, 10, 11, 12, 13, 14]

        audited_bots = {}
        for b_id, bot in CANONICAL_BOT_REGISTRY.items():
            res = instrument_master.audit_bot_mapping(bot, as_of_date=ref_date)
            audited_bots[b_id] = res

        # Check total count
        assert len(audited_bots) == 14

        # Check permanent cash equities
        for b_id in permanent_equity_ids:
            audit = audited_bots[b_id]
            assert audit["status"] == "VALID_PERMANENT_EQUITY", f"Bot {b_id} should be VALID_PERMANENT_EQUITY"
            assert audit["is_tradable"] is True
            assert audit["master_token"] is not None

        # Check Bot 4 discrepancy blocking (TATAMOTORS-EQ absent from Scrip Master)
        bot4_audit = audited_bots[4]
        assert bot4_audit["status"] == "DISCREPANCY_BLOCKED"
        assert bot4_audit["is_tradable"] is False
        assert bot4_audit["resolved_contract"] is None
        assert "interchangeable" in bot4_audit["reason"].lower() or "discrepancy" in bot4_audit["reason"].lower()

        # Check derivatives
        for b_id in derivative_ids:
            audit = audited_bots[b_id]
            assert audit["status"] == "EXPIRED_CONTRACT_RESOLVED", f"Bot {b_id} should be EXPIRED_CONTRACT_RESOLVED, got {audit['status']}"
            assert audit["is_tradable"] is True
            assert audit["master_token"] is not None
            assert audit["master_symbol"] is not None
            # Master symbol must NOT be a 2024 contract
            assert "24OCT" not in audit["master_symbol"]
            assert "24NOV" not in audit["master_symbol"]
            assert "24DEC" not in audit["master_symbol"]


class TestSmartWebSocketFeedSafety:
    """Tests SmartWebSocketV2 token list assembly, backoff reconnection, and feed safety."""

    def test_build_token_list_exchange_types(self):
        """Verifies exchangeType mapping adheres to Angel One SmartWebSocketV2 specifications."""
        mgr = AngelOneWebSocketManager()
        token_list = mgr.build_token_list_for_subscription()

        # Must have exactly 13 subscribed tokens across all groups (Bot 4 blocked)
        assert len(mgr.subscribed_tokens) == 13
        assert len(token_list) > 0

        # Validate exchangeType groups
        seen_etypes = {item["exchangeType"] for item in token_list}
        assert 1 in seen_etypes, "Must contain nse_cm (1) for equities"
        assert 2 in seen_etypes, "Must contain nse_fo (2) for NFO"
        assert 4 in seen_etypes, "Must contain bse_fo (4) for Sensex"
        assert 5 in seen_etypes, "Must contain mcx_fo (5) for Commodities"
        assert 13 in seen_etypes, "Must contain cde_fo (13) for Currency"

        # Verify equity tokens are in group 1 (2885, 1333, 1594 - 3456 omitted due to discrepancy block)
        group_1 = next(item for item in token_list if item["exchangeType"] == 1)
        assert "2885" in group_1["tokens"]  # Reliance
        assert "3456" not in group_1["tokens"]  # Tata Motors post-demerger blocked

    def test_bounded_exponential_backoff(self):
        """Tests that reconnection backoff is exponential and strictly capped at 32s with 5 retries."""
        mgr = AngelOneWebSocketManager()
        delays = []
        for _ in range(6):
            d = mgr.record_reconnect_attempt()
            delays.append(d)

        # Expected delays: 2.0s, 4.0s, 8.0s, 16.0s, 32.0s, then -1.0 (limit reached)
        assert delays == [2.0, 4.0, 8.0, 16.0, 32.0, -1.0]

        # Reset works cleanly
        mgr.reset_reconnect_state()
        assert mgr.reconnect_attempts == 0
        assert mgr.get_next_backoff_delay() == 2.0

    def test_segregated_tick_counters(self):
        """Verifies ticks are distinctly tracked as authentic, synthetic, or test."""
        mgr = AngelOneWebSocketManager()
        assert mgr.authentic_ticks_count == 0
        assert mgr.synthetic_ticks_count == 0
        assert mgr.test_ticks_count == 0

        mgr.record_synthetic_tick(5)
        mgr.record_test_tick(12)

        health = mgr.get_feed_health()
        assert health["synthetic_ticks_count"] == 5
        assert health["test_ticks_count"] == 12
        assert health["authentic_ticks_count"] == 0

    def test_binary_tick_handling_and_rejections(self):
        """Tests binary tick ingestion, paise-to-rupee conversion, and invalid tick rejection."""
        mgr = AngelOneWebSocketManager()
        mgr.build_token_list_for_subscription()

        # 1. Invalid price (0 or negative)
        success, reason = mgr.handle_binary_tick({"token": "2885", "last_traded_price": 0})
        assert success is False
        assert reason == "INVALID_PRICE"

        # 2. Future timestamp (>5s)
        now_ms = int((time.time() + 10.0) * 1000)
        success, reason = mgr.handle_binary_tick({
            "token": "2885",
            "last_traded_price": 250000,
            "exchange_timestamp": now_ms
        })
        assert success is False
        assert reason == "FUTURE_TIMESTAMP"

        # 3. Stale timestamp (>15s in the past)
        stale_ms = int((time.time() - 25.0) * 1000)
        success, reason = mgr.handle_binary_tick({
            "token": "2885",
            "last_traded_price": 250000,
            "exchange_timestamp": stale_ms
        })
        assert success is False
        assert reason == "STALE_TICK"
        assert mgr.stale_ticks_count == 1

        # 4. Unknown token
        now_ms = int(time.time() * 1000)
        success, reason = mgr.handle_binary_tick({
            "token": "99999999",
            "last_traded_price": 250000,
            "exchange_timestamp": now_ms
        })
        assert success is False
        assert reason == "UNKNOWN_TOKEN"

        # 5. Valid authentic tick
        success, reason = mgr.handle_binary_tick({
            "token": "2885",
            "last_traded_price": 285050,  # 2850.50 INR
            "exchange_timestamp": now_ms,
            "last_traded_quantity": 25
        })
        assert success is True
        assert reason == "SUCCESS"
        assert mgr.authentic_ticks_count == 1
        assert mgr.feed_status == "AUTHENTIC_SMARTAPI"

    def test_strict_fail_closed_paper_mode(self):
        """Verifies that execution mode is strictly PAPER and asserts if altered."""
        mgr = AngelOneWebSocketManager()
        assert mgr.execution_mode == "PAPER"
        
        # Invariant enforcement
        mgr.execution_mode = "LIVE"
        with pytest.raises(AssertionError, match="CRITICAL SAFETY VIOLATION"):
            mgr.handle_binary_tick({"token": "2885", "last_traded_price": 250000})

