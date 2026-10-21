# CHINTU AI — Angel One SmartAPI Connection & Pre-Market Checklist

> [!IMPORTANT]
> **MANDATORY SAFETY POLICY**: CHINTU AI operates strictly in **`PAPER` mode** by default. Never transition to `LIVE` execution until credentials have been validated, the market is open, feed freshness is confirmed under 15 seconds, and risk controls are armed.

---

## 1. Angel One SmartAPI Developer Portal Setup

1. **Log in to SmartAPI Portal**:
   - Navigate to [https://smartapi.angelbroking.com/](https://smartapi.angelbroking.com/) using your Angel One client credentials.
2. **Create / Verify App**:
   - Under **My Apps**, create an app (or inspect your existing Trading app).
   - App Type: **Trading** (allows session generation, portfolio queries, and market data).
3. **Inspect Static IP Configuration (CRITICAL)**:
   > [!WARNING]
   > **Static IP Binding Warning**: If your SmartAPI app on the developer portal has a **Static IP** configured, Angel One's authentication and order routing servers will reject any connection from a different IP with error `AB1004: Client Public IP mismatch`.
   - **Recommended Action**:
     - For home / dynamic broadband / mobile hotspot setups: Leave the Static IP field blank or disable Static IP binding.
     - For dedicated VPS / Cloud instances (AWS, GCP, DigitalOcean): Enter your VPS's static Elastic IP address in the Developer Portal.
4. **Retrieve Credentials**:
   - Copy your **API Key** (App Key). Do not share or commit this key.

---

## 2. TOTP Secret & Client PIN Setup

Angel One SmartAPI mandates Two-Factor Authentication (2FA) via Time-based One-Time Password (TOTP) and a 4-digit Client PIN.

1. **Enable TOTP on Angel One**:
   - Go to [https://smartapi.angelbroking.com/enable-totp](https://smartapi.angelbroking.com/enable-totp).
   - Enter your Client ID and Password. Enter the OTP sent to your registered mobile/email.
   - **QR Code & Secret String**: When the QR code appears, click on **"Can't scan QR code? Click here to view secret key"**.
   - Copy the alphanumeric secret key (e.g. `JBSWY3DPEHPK3PXP`).
   - Add the QR code to your Google Authenticator or authenticator app for backup.
2. **Verify System Clock Synchronization (NTP)**:
   > [!CAUTION]
   > TOTP generation relies on precise Unix epoch time in 30-second windows. If your system clock drifts by more than 15 seconds, `pyotp` will compute invalid codes resulting in `AB1010: Authentication failed`.
   - On Windows: Open **Settings > Time & Language > Date & Time**, and click **Sync now** under "Additional settings".
3. **Verify 4-Digit Client PIN**:
   - Ensure you know your 4-digit Angel One trading PIN used to log into the mobile app and web platform.

---

## 3. Environment Configuration (`.env`)

Configure your credentials inside `c:\Users\veere\Desktop\new\.env` (or via OS environment variables). The system will automatically detect and sanitize them upon boot.

```bash
# ==============================================================================
# CHINTU AI - ANGEL ONE SMARTAPI AUTHENTIC CONFIGURATION
# ==============================================================================

# 1. Angel One API Key (from SmartAPI Developer Portal)
ANGEL_API_KEY=your_actual_smartapi_api_key_here

# 2. Angel One Client ID (e.g. D123456)
ANGEL_CLIENT_ID=your_angel_client_id_here

# 3. Angel One 4-Digit Login PIN (e.g. 1234)
ANGEL_PIN=your_angel_trading_pin_here

# 4. Angel One TOTP Alphanumeric Secret Key (Base32 format)
ANGEL_TOTP_SECRET=your_base32_totp_secret_key_here

# 5. Execution Mode (MUST REMAIN PAPER DURING AUDIT)
EXECUTION_MODE=PAPER
```

> [!NOTE]
> `.env` is listed in `.gitignore`. Never check credentials into git or commit secrets.

---

## 4. Pre-Market Verification Checklist (Run Before 09:00 IST)

Perform these steps before market opens to ensure zero runtime issues:

1. **Verify Instrument Master Cache**:
   ```bash
   python -c "from server.instrument_master import instrument_master; instrument_master.ensure_loaded(); print(f'Loaded {len(instrument_master.cache_records)} instruments.')"
   ```
   *Expected*: Cache loads ~147,000+ instruments from local cache or refreshes from official OpenAPI endpoint.

2. **Verify 14 Canonical Bots Contract Resolution**:
   ```bash
   python -c "from server.instrument_master import instrument_master; from server.bot_registry import CANONICAL_BOT_REGISTRY; print({b: instrument_master.audit_bot_mapping(bot)['is_tradable'] for b, bot in CANONICAL_BOT_REGISTRY.items()})"
   ```
   *Expected*: All 14 bots return `True`.

3. **Verify Credential Preflight & Auth Diagnostics**:
   ```bash
   python -c "from server.angel_feed_manager import angel_feed_manager; print(angel_feed_manager.get_credential_status())"
   ```
   *Expected*: All 4 keys (`has_api_key`, `has_client_id`, `has_pin`, `has_totp_secret`) return `True`.

4. **Run Full Test Suite**:
   ```bash
   python -m pytest tests/
   ```
   *Expected*: 288/288 tests pass (100%).

---

## 5. Market Hours Live Feed Verification (Monday 09:15 IST)

Once the equity market opens at 09:15 IST on a trading weekday:

1. **Start Backend Server**:
   ```bash
   python server/python_stream_server.py
   ```
2. **Observe Authentication in Server Logs**:
   - `[Angel One Config Audit]: Successfully authenticated client D***.`
   - Server fetches RMS limits and client profile.
3. **Verify SmartWebSocketV2 Connection**:
   - Connection initiates in background thread: `[AngelWebSocketThread]`.
   - Subscription packet dispatches for all 14 tokens grouped by SEBI exchangeType.
   - Heartbeat interval: ping every 30s.
4. **Verify Authentic Feed Ingestion**:
   - Inspect `/api/market-feed/status`:
     - `"status": "AUTHENTIC_EXCHANGE"`
     - `"provider": "ANGEL_ONE_SMARTAPI"`
     - `"is_authentic_exchange_feed": True`
     - `"is_fresh": True`
     - `"latency_seconds": < 15.0`
5. **Verify Bot Candle Building & Strategy Evaluation**:
   - Watch `BotScheduler` process incoming authentic ticks.
   - Verify 1-minute and 5-minute candles form for all 14 bots.
   - Verify Paper Simulation records signals and paper trades in SQLite without invoking broker order placement.

---

## 6. SmartAPI Error Codes & Remediation Runbook

| Error Code | Error Category | Probable Cause | Actionable Remediation |
|---|---|---|---|
| **`AB1004`** | `STATIC_IP_OR_KEY_MISMATCH` | Client Public IP mismatch with registered IP on SmartAPI Portal, or invalid API key. | Check API key. If your ISP assigns dynamic IPs, clear the Static IP field in the SmartAPI Developer Console. |
| **`AB1005`** | `UNAUTHORIZED_OR_BLOCKED` | Account inactive, trading segment disabled, or invalid token. | Contact Angel One support to ensure F&O, Cash, and Commodity trading segments are active. |
| **`AB1010`** | `INVALID_CREDENTIALS_OR_TOTP` | Incorrect Client ID, PIN, or TOTP secret; clock out of sync. | Re-check credentials. Sync your computer clock using Windows NTP settings. |
| **`AB1012`** | `TOKEN_EXPIRED` | JWT Access Token has expired (24h lifespan). | Call `refresh_session_tokens()` or re-authenticate via `/api/broker/connect`. |
| **`AB2001`** | `RATE_LIMIT_EXCEEDED` | Exceeded SmartAPI rate limit (typically 3 req/sec for orders, 10 req/sec for quotes). | Backoff requests. System handles reconnection via exponential backoff. |
| **`AG8001`** | `BROKER_SERVICE_ERROR` | Angel One backend maintenance or outage. | Check Angel One status page. Wait for service restoration. |

---

## 7. Emergency Procedures & Kill Switches

- **Instant Broker Disconnect**:
  Send a POST request to `/api/broker/disconnect` with payload `{"broker": "angel_one"}`.
  This immediately closes SmartWebSocketV2 and nullifies the active session.
- **Emergency Square-Off All Positions**:
  Send a POST request to `/api/emergency/exit-all` to close all open positions immediately with highest priority.
- **Fail-Closed Live Safety**:
  The system automatically reverts to `PAPER` if market feed becomes stale (> 15s), broker connection drops, or daily loss exceeds RMS limits.

