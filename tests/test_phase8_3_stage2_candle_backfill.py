"""
CHINTU AI TRADING SYSTEM - Historical Candle Backfill Adapter Test Suite (Phase 8.3 Stage 2)
Verifies:
  1. Valid historical response parsing and normalization (list-of-lists and dict formats).
  2. Empty and malformed responses handling.
  3. Duplicate and out-of-order timestamp handling with ascending sorting.
  4. Mathematical OHLC integrity and volume sanity checks.
  5. Future timestamps anti-lookahead rejection and IST timezone normalization.
  6. Parameter validation (exchange, symbol_token, interval, date ranges).
  7. Expired/unauthenticated client handling.
  8. Timeout, throttling, bounded exponential backoff retries, and exhaustion.
  9. Deterministic output, intra-day gap detection, and completeness reporting.
  10. Strict proof that order-placement endpoints are never invoked.
  11. Safety mandates: LIVE_TRADING_ELIGIBLE strictly False; chintu_memory.db bit-for-bit immutability.
"""

import os
import sys
import time
import math
import hashlib
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.market_data_backfill import (
    HistoricalCandleBackfillAdapter,
    BackfillConfig,
    BackfillResult,
    NormalizedCandle,
    IST,
    IST_TZ,
    SUPPORTED_EXCHANGES,
    SUPPORTED_INTERVAL_MAP
)
from server.live_readiness_gate import is_live_trading_eligible


class TestPhase83Stage2HistoricalCandleBackfill(unittest.TestCase):
    """Exhaustive unit test suite for the historical candle backfill adapter."""

    def setUp(self):
        # Configure fast backoff for instant test execution
        self.fast_config = BackfillConfig(
            min_request_interval_seconds=0.0,
            max_retries=2,
            initial_backoff_seconds=0.01,
            backoff_multiplier=1.0,
            enable_jitter=False,
            clock_tolerance_seconds=60.0
        )
        self.adapter = HistoricalCandleBackfillAdapter(config=self.fast_config)

    # -------------------------------------------------------------------------
    # 1. Valid Historical Response
    # -------------------------------------------------------------------------
    def test_valid_historical_response_list_and_dict_formats(self):
        """Tests parsing and normalization of valid candle data in list and dict formats."""
        # A. SmartAPI List-of-lists format: [timestamp, open, high, low, close, volume]
        raw_list = [
            ["2026-04-01T09:15:00+05:30", 22500.25, 22550.80, 22490.10, 22540.50, 150000],
            ["2026-04-01T09:20:00+05:30", 22540.50, 22580.00, 22520.00, 22560.75, 120000]
        ]
        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {"status": True, "data": raw_list}
        self.adapter.set_client(mock_client)

        res = self.adapter.fetch_historical_candles(
            exchange="NSE",
            symbol_token="3045",
            interval="5m",
            from_date="2026-04-01 09:15",
            to_date="2026-04-01 09:20",
            expected_count=2
        )

        self.assertTrue(res.success)
        self.assertEqual(res.status, "COMPLETED")
        self.assertEqual(res.candle_count, 2)
        self.assertEqual(res.rejected_count, 0)
        self.assertTrue(res.is_complete)
        self.assertEqual(res.interval, "FIVE_MINUTE")

        c0 = res.candles[0]
        self.assertEqual(c0["timestamp"], "2026-04-01T09:15:00+05:30")
        self.assertEqual(c0["open"], 22500.25)
        self.assertEqual(c0["high"], 22550.80)
        self.assertEqual(c0["low"], 22490.10)
        self.assertEqual(c0["close"], 22540.50)
        self.assertEqual(c0["volume"], 150000.0)
        self.assertIsInstance(c0["epoch"], float)

        # B. Dict format
        raw_dict = [
            {"time": "2026-04-01T09:25:00+05:30", "open": 22560.75, "high": 22590.0, "low": 22555.0, "close": 22585.0, "volume": 95000}
        ]
        mock_client.getCandleData.return_value = {"status": True, "data": raw_dict}

        res_dict = self.adapter.fetch_historical_candles(
            exchange="NSE",
            symbol_token="3045",
            interval="FIVE_MINUTE",
            from_date="2026-04-01 09:25",
            to_date="2026-04-01 09:25"
        )
        self.assertTrue(res_dict.success)
        self.assertEqual(res_dict.candle_count, 1)
        self.assertEqual(res_dict.candles[0]["close"], 22585.0)

    # -------------------------------------------------------------------------
    # 2. Empty and Malformed Responses
    # -------------------------------------------------------------------------
    def test_empty_and_malformed_responses(self):
        """Tests handling of empty arrays, None data, and malformed payload schemas."""
        mock_client = MagicMock()
        self.adapter.set_client(mock_client)

        # Case A: Empty data array
        mock_client.getCandleData.return_value = {"status": True, "data": []}
        res_empty = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 10:00")
        self.assertTrue(res_empty.success)
        self.assertEqual(res_empty.status, "EMPTY")
        self.assertEqual(res_empty.candle_count, 0)
        self.assertFalse(res_empty.is_complete)

        # Case B: Malformed string instead of list
        mock_client.getCandleData.return_value = {"status": True, "data": "NOT_A_LIST"}
        res_malformed = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 10:00")
        self.assertFalse(res_malformed.success)
        self.assertEqual(res_malformed.status, "FAILED")
        self.assertIn("Expected list", res_malformed.error)

        # Case C: Element is truncated tuple (< 5 elements)
        mock_client.getCandleData.return_value = {"status": True, "data": [["2026-04-01 09:15", 22500, 22550]]}
        res_short = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 10:00")
        self.assertTrue(res_short.success)
        self.assertEqual(res_short.candle_count, 0)
        self.assertEqual(res_short.rejected_count, 1)
        self.assertIn("MALFORMED_LIST_LENGTH_UNDER_5", res_short.rejected_records[0]["reason"])

    # -------------------------------------------------------------------------
    # 3. Duplicate and Out-of-Order Timestamps
    # -------------------------------------------------------------------------
    def test_duplicate_and_out_of_order_timestamps(self):
        """Tests that out-of-order data is sorted chronologically and duplicates are recorded."""
        raw_data = [
            ["2026-04-01T09:25:00+05:30", 22560.0, 22590.0, 22555.0, 22585.0, 95000],
            ["2026-04-01T09:15:00+05:30", 22500.0, 22550.0, 22490.0, 22540.0, 150000],
            ["2026-04-01T09:20:00+05:30", 22540.0, 22580.0, 22520.0, 22560.0, 120000],
            ["2026-04-01T09:15:00+05:30", 22500.0, 22550.0, 22490.0, 22540.0, 150000]  # Duplicate
        ]
        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {"status": True, "data": raw_data}
        self.adapter.set_client(mock_client)

        res = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:25")
        self.assertTrue(res.success)
        self.assertEqual(res.candle_count, 3)
        self.assertEqual(res.rejected_count, 1)
        self.assertEqual(res.rejected_records[0]["reason"], "DUPLICATE_TIMESTAMP")

        # Verify ascending order
        timestamps = [c["timestamp"] for c in res.candles]
        self.assertEqual(timestamps, [
            "2026-04-01T09:15:00+05:30",
            "2026-04-01T09:20:00+05:30",
            "2026-04-01T09:25:00+05:30"
        ])
        # Completeness must be False because duplicate was rejected
        self.assertFalse(res.is_complete)
        self.assertEqual(res.status, "PARTIAL")

    # -------------------------------------------------------------------------
    # 4. Invalid OHLC and Volume Values
    # -------------------------------------------------------------------------
    def test_invalid_ohlc_and_volume_values(self):
        """Tests strict mathematical OHLC integrity and non-negative volume validation."""
        raw_data = [
            # Inverted High < Low
            ["2026-04-01T09:15:00+05:30", 22500.0, 22400.0, 22600.0, 22540.0, 1000],
            # High < max(Open, Close)
            ["2026-04-01T09:20:00+05:30", 22500.0, 22520.0, 22480.0, 22550.0, 1000],
            # Low > min(Open, Close)
            ["2026-04-01T09:25:00+05:30", 22500.0, 22580.0, 22510.0, 22490.0, 1000],
            # Negative price
            ["2026-04-01T09:30:00+05:30", -22500.0, 22550.0, 22490.0, 22540.0, 1000],
            # Zero price
            ["2026-04-01T09:35:00+05:30", 22500.0, 22550.0, 22490.0, 0.0, 1000],
            # Negative volume
            ["2026-04-01T09:40:00+05:30", 22500.0, 22550.0, 22490.0, 22540.0, -500],
            # NaN price
            ["2026-04-01T09:45:00+05:30", float("nan"), 22550.0, 22490.0, 22540.0, 1000],
            # Valid candle
            ["2026-04-01T09:50:00+05:30", 22500.0, 22550.0, 22490.0, 22540.0, 1000]
        ]
        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {"status": True, "data": raw_data}
        self.adapter.set_client(mock_client)

        res = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:50")
        self.assertTrue(res.success)
        self.assertEqual(res.candle_count, 1)  # Only the last valid candle passed
        self.assertEqual(res.rejected_count, 7)
        self.assertEqual(res.candles[0]["timestamp"], "2026-04-01T09:50:00+05:30")

        reasons = [r["reason"] for r in res.rejected_records]
        self.assertTrue(any("INVERTED_HIGH_LOW" in r for r in reasons))
        self.assertTrue(any("HIGH_LESS_THAN_MAX_OPEN_CLOSE" in r for r in reasons))
        self.assertTrue(any("LOW_GREATER_THAN_MIN_OPEN_CLOSE" in r for r in reasons))
        self.assertTrue(any("PRICE_MUST_BE_STRICTLY_POSITIVE" in r for r in reasons))
        self.assertTrue(any("VOLUME_CANNOT_BE_NEGATIVE" in r for r in reasons))
        self.assertTrue(any("INVALID_NUMERIC" in r for r in reasons))

    # -------------------------------------------------------------------------
    # 5. Future Timestamps and Timezone Conversion
    # -------------------------------------------------------------------------
    def test_future_timestamps_and_timezone_conversion(self):
        """Tests anti-lookahead rejection of future candles and normalization to Asia/Kolkata."""
        now_dt = datetime.now(IST)
        future_dt = now_dt + timedelta(days=5)
        past_utc = datetime(2026, 4, 1, 3, 45, tzinfo=timezone.utc)  # 03:45 UTC == 09:15 IST (+05:30)

        raw_data = [
            # Past UTC timestamp
            [past_utc.isoformat(), 22500.0, 22550.0, 22490.0, 22540.0, 1000],
            # Future timestamp
            [future_dt.isoformat(), 22540.0, 22580.0, 22520.0, 22560.0, 1000]
        ]
        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {"status": True, "data": raw_data}
        self.adapter.set_client(mock_client)

        res = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertTrue(res.success)
        self.assertEqual(res.candle_count, 1)
        self.assertEqual(res.rejected_count, 1)

        # Verified timezone normalized to IST
        self.assertEqual(res.candles[0]["timestamp"], "2026-04-01T09:15:00+05:30")
        self.assertIn("FUTURE_CANDLE_TIMESTAMP_EXCEEDS_CLOCK_TOLERANCE", res.rejected_records[0]["reason"])

    # -------------------------------------------------------------------------
    # 6. Unsupported Interval and Invalid Instrument Configuration
    # -------------------------------------------------------------------------
    def test_unsupported_interval_and_invalid_configuration(self):
        """Tests that invalid exchange, token, interval, and dates fail early."""
        # A. Unsupported exchange
        res_bad_ex = self.adapter.fetch_historical_candles("NASDAQ", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertFalse(res_bad_ex.success)
        self.assertIn("Unsupported exchange", res_bad_ex.error)

        # B. Invalid symbol token
        res_bad_tok = self.adapter.fetch_historical_candles("NSE", "-1", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertFalse(res_bad_tok.success)
        self.assertIn("Invalid symbol token", res_bad_tok.error)

        # C. Unsupported interval
        res_bad_int = self.adapter.fetch_historical_candles("NSE", "3045", "2m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertFalse(res_bad_int.success)
        self.assertIn("Unsupported interval", res_bad_int.error)

        # D. Inverted date range
        res_inv_dates = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 10:00", "2026-04-01 09:00")
        self.assertFalse(res_inv_dates.success)
        self.assertIn("cannot be after to_date", res_inv_dates.error)

        # E. Future from_date
        future_str = (datetime.now(IST) + timedelta(days=10)).strftime("%Y-%m-%d %H:%M")
        res_future_from = self.adapter.fetch_historical_candles("NSE", "3045", "5m", future_str, future_str)
        self.assertFalse(res_future_from.success)
        self.assertIn("is in the future", res_future_from.error)

    # -------------------------------------------------------------------------
    # 7. Expired/Unauthenticated Client Behavior
    # -------------------------------------------------------------------------
    def test_expired_and_unauthenticated_client_behavior(self):
        """Tests fail-closed behavior on missing client or broker token expiration."""
        # Case A: Client is None
        self.adapter.set_client(None)
        res_no_client = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertFalse(res_no_client.success)
        self.assertEqual(res_no_client.status, "AUTH_ERROR")
        self.assertIn("not initialized or authenticated", res_no_client.error)

        # Case B: Broker returns AG8001 (Token Expired)
        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {
            "status": False,
            "message": "Invalid Token",
            "errorcode": "AG8001",
            "data": None
        }
        self.adapter.set_client(mock_client)

        res_expired = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertFalse(res_expired.success)
        self.assertEqual(res_expired.status, "AUTH_ERROR")
        self.assertIn("AG8001", res_expired.error)
        # Verify it did not wastefully retry on unrecoverable auth error
        self.assertEqual(mock_client.getCandleData.call_count, 1)

    # -------------------------------------------------------------------------
    # 8. Timeout, Throttling, Bounded Retries, and Exhaustion
    # -------------------------------------------------------------------------
    def test_timeout_throttling_bounded_retries_and_exhaustion(self):
        """Tests exponential backoff on transient errors and bounded retry exhaustion."""
        mock_client = MagicMock()
        self.adapter.set_client(mock_client)

        # Case A: Transient timeout that recovers on retry 2
        valid_payload = [["2026-04-01T09:15:00+05:30", 22500.0, 22550.0, 22490.0, 22540.0, 1000]]
        mock_client.getCandleData.side_effect = [
            ConnectionError("Socket timeout"),
            ConnectionError("Connection reset"),
            {"status": True, "data": valid_payload}
        ]

        res_recovered = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertTrue(res_recovered.success)
        self.assertEqual(res_recovered.candle_count, 1)
        self.assertEqual(res_recovered.retries_attempted, 2)
        self.assertEqual(mock_client.getCandleData.call_count, 3)

        # Case B: Throttling (HTTP 429 / AG429) that recovers
        mock_client.reset_mock()
        mock_client.getCandleData.side_effect = [
            {"status": False, "message": "Too Many Requests", "errorcode": "AG429"},
            {"status": True, "data": valid_payload}
        ]

        res_throttled = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertTrue(res_throttled.success)
        self.assertEqual(res_throttled.retries_attempted, 1)

        # Case C: Continuous failure exhausting max_retries (2 retries configured -> 3 attempts total)
        mock_client.reset_mock()
        mock_client.getCandleData.side_effect = ConnectionError("Permanent host unreachable")

        res_exhausted = self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.assertFalse(res_exhausted.success)
        self.assertEqual(res_exhausted.status, "FAILED")
        self.assertIn("Exhausted 2 retries", res_exhausted.error)
        self.assertEqual(mock_client.getCandleData.call_count, 3)

    # -------------------------------------------------------------------------
    # 9. Deterministic Output, Gap Detection, and Completeness Reporting
    # -------------------------------------------------------------------------
    def test_deterministic_output_and_completeness_reporting(self):
        """Tests that identical input yields deterministic output and gaps break completeness."""
        # 3 consecutive 1-minute candles followed by a 10-minute gap
        raw_candles = [
            ["2026-04-01T09:15:00+05:30", 22500.0, 22520.0, 22495.0, 22510.0, 5000],
            ["2026-04-01T09:16:00+05:30", 22510.0, 22530.0, 22505.0, 22525.0, 6000],
            ["2026-04-01T09:17:00+05:30", 22525.0, 22540.0, 22515.0, 22535.0, 4500],
            # Gap of 10 minutes (from 09:17 to 09:27)
            ["2026-04-01T09:27:00+05:30", 22535.0, 22550.0, 22520.0, 22545.0, 7000]
        ]
        mock_client = MagicMock()
        mock_client.getCandleData.return_value = {"status": True, "data": raw_candles}
        self.adapter.set_client(mock_client)

        res1 = self.adapter.fetch_historical_candles("NSE", "3045", "1m", "2026-04-01 09:15", "2026-04-01 09:27")
        res2 = self.adapter.fetch_historical_candles("NSE", "3045", "1m", "2026-04-01 09:15", "2026-04-01 09:27")

        # Determinism assertion
        self.assertEqual(res1.candles, res2.candles)
        self.assertEqual(res1.candle_count, res2.candle_count)

        # Gap detection assertion
        self.assertFalse(res1.is_complete, "Incomplete history must NEVER be silently marked complete.")
        self.assertEqual(res1.status, "PARTIAL")
        gaps = res1.metadata.get("intra_day_gaps", [])
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0]["from_timestamp"], "2026-04-01T09:17:00+05:30")
        self.assertEqual(gaps[0]["to_timestamp"], "2026-04-01T09:27:00+05:30")
        self.assertGreater(gaps[0]["missing_seconds"], 0)

        # Expected count check: if expected_count was 10 and we got 4, is_complete must be False
        res_expected = self.adapter.fetch_historical_candles(
            "NSE", "3045", "1m", "2026-04-01 09:15", "2026-04-01 09:27", expected_count=10
        )
        self.assertFalse(res_expected.is_complete)
        self.assertEqual(res_expected.status, "PARTIAL")

    # -------------------------------------------------------------------------
    # 10. Proof Adapter Never Calls Order-Placement Endpoints
    # -------------------------------------------------------------------------
    def test_proof_adapter_never_calls_order_placement_endpoints(self):
        """
        Defensive audit: verifies that the adapter NEVER calls order routing
        or modification endpoints under any circumstances.
        """
        mock_broker = MagicMock()
        mock_broker.getCandleData.return_value = {
            "status": True,
            "data": [["2026-04-01T09:15:00+05:30", 22500.0, 22550.0, 22490.0, 22540.0, 1000]]
        }
        self.adapter.set_client(mock_broker)

        # Perform queries
        self.adapter.fetch_historical_candles("NSE", "3045", "5m", "2026-04-01 09:15", "2026-04-01 09:20")
        self.adapter.fetch_historical_candles("NFO", "26000", "15m", "2026-04-01 09:15", "2026-04-01 10:00")

        # Explicitly verify that no order endpoints were ever invoked
        mock_broker.placeOrder.assert_not_called()
        mock_broker.modifyOrder.assert_not_called()
        mock_broker.cancelOrder.assert_not_called()
        mock_broker.orderBook.assert_not_called()
        mock_broker.tradeBook.assert_not_called()
        mock_broker.getPosition.assert_not_called()
        mock_broker.getHolding.assert_not_called()

    # -------------------------------------------------------------------------
    # 11. Safety Mandates & DB Isolation
    # -------------------------------------------------------------------------
    def test_safety_mandates_and_db_immutability(self):
        """Verifies that LIVE_TRADING_ELIGIBLE is strictly False and DB is untouched."""
        self.assertFalse(is_live_trading_eligible(), "LIVE_TRADING_ELIGIBLE must strictly remain False.")

        db_path = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")
        self.assertTrue(os.path.exists(db_path))

        expected_hash = "53509588F78CA463B91FCD3DB379E550CF3B901FA2C8510D3E1E541B86B4CB53"
        expected_size = 1306624

        actual_size = os.path.getsize(db_path)
        with open(db_path, "rb") as f:
            actual_hash = hashlib.sha256(f.read()).hexdigest().upper()

        self.assertEqual(actual_size, expected_size, f"DB size altered: expected {expected_size}, got {actual_size}")
        self.assertEqual(actual_hash, expected_hash, f"DB hash altered: expected {expected_hash}, got {actual_hash}")


if __name__ == "__main__":
    unittest.main()

