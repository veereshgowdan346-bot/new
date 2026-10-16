"""
CHINTU AI TRADING SYSTEM - Canonical Trading Bot Registry (Phase 5)
Authoritative single source of truth for all 14 bots.
Harmonizes bot identities, target assets, exchanges, timeframes, strategy implementations,
market data requirements, risk parameters, and execution state across backend, frontend, and SQLite.
"""

from typing import Dict, Any, List, Optional

CANONICAL_BOT_REGISTRY: Dict[int, Dict[str, Any]] = {
    1: {
        "id": 1,
        "name": "Scalper Bot",
        "asset": "NIFTY 50",
        "tradingsymbol": "NIFTY24OCTFUT",
        "symboltoken": "26000",
        "exchange": "NSE",
        "segment": "NSE F&O Options",
        "timeframe": "1m",
        "lotsize": 50,
        "strategy_id": "SUPERTREND_MACD",
        "strategy_name": "SuperTrend (10,2) + Volume-Weighted MACD Scalper",
        "strategy_description": "1-minute micro momentum scalping using SuperTrend (10, 2) breakout confluence with MACD histogram crossover.",
        "required_data": "OHLCV_1M",
        "min_candles_required": 30,
        "peers": [2, 5, 6],
        "weight": 1.2,
        "risk_config": {
            "stop_loss_pct": 0.20,
            "target_pct": 0.36,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.0
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    2: {
        "id": 2,
        "name": "EMA Trend Bot",
        "asset": "BANKNIFTY",
        "tradingsymbol": "BANKNIFTY24OCTFUT",
        "symboltoken": "26009",
        "exchange": "NSE",
        "segment": "NSE F&O Options",
        "timeframe": "5m",
        "lotsize": 30,
        "strategy_id": "TRIPLE_EMA_ATR",
        "strategy_name": "Triple EMA (9/21/55) Dynamic Trend Rider",
        "strategy_description": "5-minute trend-following strategy riding triple exponential moving average alignments (EMA 9 > EMA 21 > EMA 55) with ATR volatility stop.",
        "required_data": "OHLCV_5M",
        "min_candles_required": 55,
        "peers": [1, 5, 6],
        "weight": 1.15,
        "risk_config": {
            "stop_loss_pct": 0.36,
            "target_pct": 0.46,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.0
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    3: {
        "id": 3,
        "name": "RSI Reversal Bot",
        "asset": "RELIANCE",
        "tradingsymbol": "RELIANCE-EQ",
        "symboltoken": "2885",
        "exchange": "NSE",
        "segment": "NSE Equity",
        "timeframe": "15m",
        "lotsize": 100,
        "strategy_id": "RSI_BOLLINGER_REVERSAL",
        "strategy_name": "RSI (14) Mean Reversion & Bollinger %B",
        "strategy_description": "15-minute mean reversion identifying oversold RSI (<30) bouncing from lower Bollinger Band (+2σ) with %B divergence.",
        "required_data": "OHLCV_15M",
        "min_candles_required": 30,
        "peers": [1, 6, 7],
        "weight": 1.0,
        "risk_config": {
            "stop_loss_pct": 0.86,
            "target_pct": 1.33,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.5
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    4: {
        "id": 4,
        "name": "Breakout Bot",
        "asset": "TATA MOTORS",
        "tradingsymbol": "TATAMOTORS-EQ",
        "symboltoken": "3456",
        "exchange": "NSE",
        "segment": "NSE Equity",
        "timeframe": "15m",
        "lotsize": 200,
        "strategy_id": "DONCHIAN_BREAKOUT",
        "strategy_name": "Donchian Channel (20) Multi-Bar Breakout",
        "strategy_description": "15-minute range breakout triggering when price penetrates 20-period Donchian Channel high with volume expansion > 1.5x average.",
        "required_data": "OHLCV_15M",
        "min_candles_required": 30,
        "peers": [3, 7, 14],
        "weight": 1.0,
        "risk_config": {
            "stop_loss_pct": 1.55,
            "target_pct": 2.53,
            "max_capital": 35000.0,
            "max_drawdown_pct": 3.0
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    5: {
        "id": 5,
        "name": "Mean Reversion",
        "asset": "FINNIFTY",
        "tradingsymbol": "FINNIFTY24OCTFUT",
        "symboltoken": "26037",
        "exchange": "NSE",
        "segment": "NSE F&O Options",
        "timeframe": "5m",
        "lotsize": 40,
        "strategy_id": "KELTNER_MEAN_REVERSION",
        "strategy_name": "Keltner Channel & Stochastic Mean Reversion",
        "strategy_description": "5-minute mean reversion fading statistical extremes when price moves outside 2.0x ATR Keltner Channel and re-enters the mean.",
        "required_data": "OHLCV_5M",
        "min_candles_required": 30,
        "peers": [1, 2, 6],
        "weight": 1.1,
        "risk_config": {
            "stop_loss_pct": 0.30,
            "target_pct": 0.42,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.0
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    6: {
        "id": 6,
        "name": "VWAP Momentum",
        "asset": "HDFCBANK",
        "tradingsymbol": "HDFCBANK-EQ",
        "symboltoken": "1333",
        "exchange": "NSE",
        "segment": "NSE Equity",
        "timeframe": "5m",
        "lotsize": 100,
        "strategy_id": "ANCHORED_VWAP_MOMENTUM",
        "strategy_name": "Anchored VWAP Standard Deviation Momentum",
        "strategy_description": "5-minute institutional trend pullback strategy riding session VWAP with dynamic standard deviation bands (-1σ pullback / +1σ target).",
        "required_data": "OHLCV_5M",
        "min_candles_required": 30,
        "peers": [2, 3, 7],
        "weight": 1.1,
        "risk_config": {
            "stop_loss_pct": 0.90,
            "target_pct": 1.42,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.0
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    7: {
        "id": 7,
        "name": "Volume Spike Bot",
        "asset": "INFY",
        "tradingsymbol": "INFY-EQ",
        "symboltoken": "1594",
        "exchange": "NSE",
        "segment": "NSE Equity",
        "timeframe": "15m",
        "lotsize": 150,
        "strategy_id": "VOLUME_SPREAD_ANALYSIS",
        "strategy_name": "Institutional Volume Spread Analysis (VSA)",
        "strategy_description": "15-minute Wyckoff Volume Spread Analysis detecting stopping volume absorption bars followed by low-volume successful test bars.",
        "required_data": "OHLCV_15M",
        "min_candles_required": 30,
        "peers": [3, 4, 11],
        "weight": 1.0,
        "risk_config": {
            "stop_loss_pct": 1.20,
            "target_pct": 1.62,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.5
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    8: {
        "id": 8,
        "name": "SuperTrend Wave",
        "asset": "CRUDE OIL",
        "tradingsymbol": "CRUDEOIL24NOVFUT",
        "symboltoken": "254120",
        "exchange": "MCX",
        "segment": "MCX Commodity",
        "timeframe": "5m",
        "lotsize": 100,
        "strategy_id": "MULTI_SUPERTREND",
        "strategy_name": "Dual SuperTrend (7,3 / 14,2) Commodity Confluence",
        "strategy_description": "5-minute commodity trend rider requiring simultaneous agreement of fast SuperTrend (7, 3) and medium SuperTrend (14, 2).",
        "required_data": "OHLCV_5M",
        "min_candles_required": 30,
        "peers": [9, 10, 11],
        "weight": 1.05,
        "risk_config": {
            "stop_loss_pct": 0.77,
            "target_pct": 1.07,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.5
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    9: {
        "id": 9,
        "name": "Bollinger Band Squeeze",
        "asset": "GOLD (XAUUSD)",
        "tradingsymbol": "GOLD24DECFUT",
        "symboltoken": "242100",
        "exchange": "MCX",
        "segment": "MCX Commodity",
        "timeframe": "15m",
        "lotsize": 10,
        "strategy_id": "BOLLINGER_KELTNER_SQUEEZE",
        "strategy_name": "John Bollinger Volatility Squeeze",
        "strategy_description": "15-minute volatility breakout identifying Bollinger Bands consolidating inside Keltner Channels followed by explosive expansion.",
        "required_data": "OHLCV_15M",
        "min_candles_required": 30,
        "peers": [8, 10, 11],
        "weight": 1.1,
        "risk_config": {
            "stop_loss_pct": 0.58,
            "target_pct": 0.62,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.0
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    10: {
        "id": 10,
        "name": "Pivot Point Reversal",
        "asset": "SILVER (XAGUSD)",
        "tradingsymbol": "SILVER24DECFUT",
        "symboltoken": "243100",
        "exchange": "MCX",
        "segment": "MCX Commodity",
        "timeframe": "15m",
        "lotsize": 300,
        "strategy_id": "CAMARILLA_PIVOTS",
        "strategy_name": "Camarilla Floor Trader Pivots (H3/L3 Reversal)",
        "strategy_description": "15-minute floor trader pivots identifying mean-reversion entries at Camarilla L3/H3 bounds and breakout triggers at H4/L4.",
        "required_data": "OHLCV_15M",
        "min_candles_required": 30,
        "peers": [8, 9, 11],
        "weight": 1.0,
        "risk_config": {
            "stop_loss_pct": 1.08,
            "target_pct": 1.54,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.5
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    11: {
        "id": 11,
        "name": "Multi-Timeframe Confluence",
        "asset": "USDINR",
        "tradingsymbol": "USDINR24OCTFUT",
        "symboltoken": "1205",
        "exchange": "CDS",
        "segment": "Currency Derivatives",
        "timeframe": "15m",
        "lotsize": 1000,
        "strategy_id": "ICHIMOKU_CLOUD",
        "strategy_name": "Ichimoku Kinko Hyo Cloud Confluence",
        "strategy_description": "15-minute currency trend rider evaluating Tenkan-sen / Kijun-sen cross above Kumo Cloud with Chikou Span confirmation.",
        "required_data": "OHLCV_15M",
        "min_candles_required": 52,
        "peers": [8, 9, 14],
        "weight": 1.0,
        "risk_config": {
            "stop_loss_pct": 0.12,
            "target_pct": 0.18,
            "max_capital": 35000.0,
            "max_drawdown_pct": 1.5
        },
        "data_readiness": "READY",
        "status": "RUNNING"
    },
    12: {
        "id": 12,
        "name": "Options Gamma Scalper",
        "asset": "NIFTY OPTIONS",
        "tradingsymbol": "NIFTY24OCT24750CE",
        "symboltoken": "54231",
        "exchange": "NFO",
        "segment": "NSE F&O Options",
        "timeframe": "1m",
        "lotsize": 75,
        "strategy_id": "OPTION_GREEKS_GAMMA",
        "strategy_name": "0DTE Option Greeks Delta-Neutral Gamma Scalper",
        "strategy_description": "Advanced derivatives strategy monitoring call/put delta acceleration and gamma burst triggers from option chain open interest delta.",
        "required_data": "OPTION_CHAIN_L2",
        "min_candles_required": 10,
        "peers": [1, 2, 13],
        "weight": 1.25,
        "risk_config": {
            "stop_loss_pct": 13.79,
            "target_pct": 21.23,
            "max_capital": 35000.0,
            "max_drawdown_pct": 5.0
        },
        "data_readiness": "DATA_UNAVAILABLE",
        "status": "DATA_UNAVAILABLE"
    },
    13: {
        "id": 13,
        "name": "Order Flow Imbalance",
        "asset": "BANKNIFTY OPTIONS",
        "tradingsymbol": "BANKNIFTY24OCT52500CE",
        "symboltoken": "55120",
        "exchange": "NFO",
        "segment": "NSE F&O Options",
        "timeframe": "1m",
        "lotsize": 30,
        "strategy_id": "FOOTPRINT_DELTA_IMBALANCE",
        "strategy_name": "Order Flow Footprint Delta Imbalance",
        "strategy_description": "Advanced order book microstructural strategy detecting bid/ask volume footprint absorption sweeps (>300% delta imbalance).",
        "required_data": "L3_FOOTPRINT_TICK",
        "min_candles_required": 10,
        "peers": [1, 2, 12],
        "weight": 1.2,
        "risk_config": {
            "stop_loss_pct": 8.96,
            "target_pct": 14.54,
            "max_capital": 35000.0,
            "max_drawdown_pct": 4.0
        },
        "data_readiness": "DATA_UNAVAILABLE",
        "status": "DATA_UNAVAILABLE"
    },
    14: {
        "id": 14,
        "name": "Risk Neutral Delta Hedger",
        "asset": "SENSEX",
        "tradingsymbol": "SENSEX24OCTFUT",
        "symboltoken": "51240",
        "exchange": "BFO",
        "segment": "Benchmark Index",
        "timeframe": "5m",
        "lotsize": 10,
        "strategy_id": "BETA_NEUTRAL_HEDGE",
        "strategy_name": "Portfolio Beta-Neutral Dynamic Volatility Arbitrage",
        "strategy_description": "Cross-asset quantitative hedging balancing portfolio beta exposure against benchmark volatility spikes.",
        "required_data": "MULTI_INDEX_BETA",
        "min_candles_required": 30,
        "peers": [1, 2, 12],
        "weight": 1.1,
        "risk_config": {
            "stop_loss_pct": 0.39,
            "target_pct": 0.36,
            "max_capital": 35000.0,
            "max_drawdown_pct": 2.0
        },
        "data_readiness": "DATA_UNAVAILABLE",
        "status": "DATA_UNAVAILABLE"
    }
}


def get_all_canonical_bots() -> List[Dict[str, Any]]:
    """Returns the ordered list of all 14 canonical bot definitions."""
    return [dict(v) for v in CANONICAL_BOT_REGISTRY.values()]


def get_bot_by_id(bot_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves canonical bot configuration by integer ID."""
    bot = CANONICAL_BOT_REGISTRY.get(int(bot_id))
    return dict(bot) if bot else None


def get_bot_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Retrieves canonical bot configuration by name (case-insensitive fuzzy match)."""
    clean = str(name).lower().strip()
    for b in CANONICAL_BOT_REGISTRY.values():
        if b["name"].lower() == clean or f"bot {b['id']}".lower() == clean or f"#{b['id']}".lower() in clean:
            return dict(b)
    return None


def validate_bot_instrument(bot_id: int, instrument_symbol: str) -> bool:
    """Validates that a proposed trading symbol matches the bot's configured asset."""
    bot = get_bot_by_id(bot_id)
    if not bot:
        return False
    bot_asset = bot["asset"].upper().replace(" ", "")
    clean_sym = instrument_symbol.upper().replace(" ", "")
    return bot_asset in clean_sym or clean_sym in bot_asset or bot["tradingsymbol"].upper() in clean_sym
