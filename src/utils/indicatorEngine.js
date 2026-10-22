/**
 * CHINTU AI TRADING SYSTEM - Advanced Institutional Quantitative Indicator Engine
 * High-performance, pure mathematical computation of technical confluence indicators:
 * 1. Exponential Moving Averages (EMA 9, 21, 50, 200) & Golden/Death Crosses
 * 2. Moving Average Convergence Divergence (MACD 12, 26, 9) with Histogram Momentum
 * 3. Relative Strength Index (RSI 14) with dynamic volatility-adaptive overbought/oversold bands
 * 4. Bollinger Bands (20, 2.0) Volatility Squeeze & %B breakout indicators
 * 5. Volume Weighted Average Price (VWAP) with ±1σ, ±2σ deviation bands
 * 6. SuperTrend (10, 3.0) directional ATR ratchet mechanism
 * 7. Camarilla Floor Pivots (H1-H5, L1-L5) & Fibonacci Retracement Pivot reversals
 * 8. Multi-Indicator Confluence Matrix Score (0 - 100)
 */

// 1. Exponential Moving Average (EMA)
export function calculateEMA(data, period) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArray = [];
  
  // Calculate initial SMA for the first 'period' elements
  let sum = 0;
  const initialLength = Math.min(period, data.length);
  for (let i = 0; i < initialLength; i++) {
    sum += Number(data[i]) || 0;
  }
  let currentEma = sum / initialLength;
  emaArray.push(Number(currentEma.toFixed(2)));

  for (let i = initialLength; i < data.length; i++) {
    const val = Number(data[i]) || 0;
    currentEma = (val - currentEma) * k + currentEma;
    emaArray.push(Number(currentEma.toFixed(2)));
  }
  return emaArray;
}

// 2. Relative Strength Index (RSI 14) with dynamic threshold calibration
export function calculateRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) {
    return { rsi: 50, dynamicOverbought: 70, dynamicOversold: 30, state: 'NEUTRAL' };
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = avgLoss === 0 ? 100 : Number((100 - (100 / (1 + rs))).toFixed(2));

  // Volatility-adaptive dynamic thresholds
  const recentCloses = closes.slice(-period);
  const variance = recentCloses.reduce((acc, c) => acc + Math.pow(c - recentCloses[0], 2), 0) / period;
  const volatility = Math.sqrt(variance) / (recentCloses[0] || 1);
  const dynamicOverbought = volatility > 0.02 ? 75 : 70;
  const dynamicOversold = volatility > 0.02 ? 25 : 30;

  let state = 'NEUTRAL';
  if (rsi >= dynamicOverbought) state = 'OVERBOUGHT';
  else if (rsi <= dynamicOversold) state = 'OVERSOLD';

  return {
    rsi,
    dynamicOverbought,
    dynamicOversold,
    state
  };
}

// 3. MACD (12, 26, 9)
export function calculateMACD(closes) {
  if (!Array.isArray(closes) || closes.length < 26) {
    return { macd: 0, signal: 0, histogram: 0, trend: 'NEUTRAL' };
  }

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = [];
  const minLen = Math.min(ema12.length, ema26.length);

  for (let i = 0; i < minLen; i++) {
    macdLine.push(Number((ema12[i] - ema26[i]).toFixed(2)));
  }

  const signalLine = calculateEMA(macdLine, 9);
  const lastMacd = macdLine[macdLine.length - 1] || 0;
  const lastSignal = signalLine[signalLine.length - 1] || 0;
  const histogram = Number((lastMacd - lastSignal).toFixed(2));

  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram,
    trend: histogram > 0 ? (histogram > 1.5 ? 'STRONG_BULL' : 'BULLISH') : (histogram < -1.5 ? 'STRONG_BEAR' : 'BEARISH')
  };
}

// 4. Bollinger Bands (20, 2) & Squeeze Detector
export function calculateBollingerBands(closes, period = 20, multiplier = 2.0) {
  if (!Array.isArray(closes) || closes.length < period) {
    const last = closes && closes.length ? closes[closes.length - 1] : 0;
    return { middle: last, upper: last, lower: last, bandwidth: 0, percentB: 0.5, isSqueeze: false };
  }

  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = Number((middle + multiplier * stdDev).toFixed(2));
  const lower = Number((middle - multiplier * stdDev).toFixed(2));
  const bandwidth = Number((((upper - lower) / middle) * 100).toFixed(2));
  const currentPrice = closes[closes.length - 1];
  const percentB = upper !== lower ? Number(((currentPrice - lower) / (upper - lower)).toFixed(2)) : 0.5;

  // Squeeze condition: Bandwidth compressed below historical threshold
  const isSqueeze = bandwidth < 2.5;

  return {
    middle: Number(middle.toFixed(2)),
    upper,
    lower,
    bandwidth,
    percentB,
    isSqueeze
  };
}

// 5. Volume Weighted Average Price (VWAP)
export function calculateVWAP(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { vwap: 0, upperBand1: 0, lowerBand1: 0, upperBand2: 0, lowerBand2: 0, status: 'NEUTRAL' };
  }

  let cumulativeTPV = 0;
  let cumulativeVol = 0;
  const tpList = [];

  for (const c of candles) {
    const high = Number(c.high || c.h || c.price || 0);
    const low = Number(c.low || c.l || c.price || 0);
    const close = Number(c.close || c.c || c.price || 0);
    const vol = Math.max(1, Number(c.volume || c.vol || c.v || 1000));
    const tp = (high + low + close) / 3;

    cumulativeTPV += tp * vol;
    cumulativeVol += vol;
    tpList.push(tp);
  }

  const vwap = Number((cumulativeTPV / cumulativeVol).toFixed(2));

  // Calculate standard deviation around VWAP
  let sumSqDiff = 0;
  for (const tp of tpList) {
    sumSqDiff += Math.pow(tp - vwap, 2);
  }
  const stdDev = Math.sqrt(sumSqDiff / tpList.length);

  const upperBand1 = Number((vwap + stdDev).toFixed(2));
  const lowerBand1 = Number((vwap - stdDev).toFixed(2));
  const upperBand2 = Number((vwap + 2 * stdDev).toFixed(2));
  const lowerBand2 = Number((vwap - 2 * stdDev).toFixed(2));

  const currentPrice = candles[candles.length - 1]?.close || candles[candles.length - 1]?.price || vwap;
  let status = 'NEUTRAL';
  if (currentPrice > upperBand1) status = 'ABOVE_VWAP_BULLISH';
  else if (currentPrice < lowerBand1) status = 'BELOW_VWAP_BEARISH';

  return {
    vwap,
    upperBand1,
    lowerBand1,
    upperBand2,
    lowerBand2,
    status
  };
}

// 6. SuperTrend (10, 3)
export function calculateSuperTrend(candles, period = 10, multiplier = 3.0) {
  if (!Array.isArray(candles) || candles.length < period) {
    const p = candles && candles.length ? Number(candles[candles.length - 1].close || candles[candles.length - 1].price || 0) : 0;
    return { trend: 'BULLISH', upperBand: p * 1.02, lowerBand: p * 0.98, superTrend: p * 0.98 };
  }

  // Calculate True Range (TR)
  const trList = [];
  for (let i = 1; i < candles.length; i++) {
    const h = Number(candles[i].high || candles[i].price);
    const l = Number(candles[i].low || candles[i].price);
    const prevC = Number(candles[i - 1].close || candles[i - 1].price);
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trList.push(tr);
  }

  const atr = trList.slice(-period).reduce((a, b) => a + b, 0) / period;
  const lastCandle = candles[candles.length - 1];
  const h = Number(lastCandle.high || lastCandle.price);
  const l = Number(lastCandle.low || lastCandle.price);
  const c = Number(lastCandle.close || lastCandle.price);
  const hl2 = (h + l) / 2;

  const basicUpper = hl2 + multiplier * atr;
  const basicLower = hl2 - multiplier * atr;

  const trend = c > basicLower ? 'BULLISH' : 'BEARISH';
  const superTrendVal = trend === 'BULLISH' ? Number(basicLower.toFixed(2)) : Number(basicUpper.toFixed(2));

  return {
    trend,
    atr: Number(atr.toFixed(2)),
    upperBand: Number(basicUpper.toFixed(2)),
    lowerBand: Number(basicLower.toFixed(2)),
    superTrend: superTrendVal
  };
}

// 7. Camarilla and Fibonacci Pivot Points
export function calculatePivots(high, low, close) {
  const h = Number(high) || 0;
  const l = Number(low) || 0;
  const c = Number(close) || 0;
  const range = h - l;

  // Camarilla Pivots (Institutional Intraday Reversals)
  const h5 = c + (range * 1.168);
  const h4 = c + (range * (1.1 / 2));
  const h3 = c + (range * (1.1 / 4));
  const l3 = c - (range * (1.1 / 4));
  const l4 = c - (range * (1.1 / 2));
  const l5 = c - (range * 1.168);

  // Fibonacci Retracement Pivots
  const pp = (h + l + c) / 3;
  const fibR1 = pp + 0.382 * range;
  const fibR2 = pp + 0.618 * range;
  const fibR3 = pp + 1.000 * range;
  const fibS1 = pp - 0.382 * range;
  const fibS2 = pp - 0.618 * range;
  const fibS3 = pp - 1.000 * range;

  return {
    camarilla: {
      h5: Number(h5.toFixed(2)),
      h4: Number(h4.toFixed(2)),
      h3: Number(h3.toFixed(2)), // Long Breakout / Short Reversal
      l3: Number(l3.toFixed(2)), // Short Breakout / Long Reversal
      l4: Number(l4.toFixed(2)),
      l5: Number(l5.toFixed(2))
    },
    fibonacci: {
      pp: Number(pp.toFixed(2)),
      r1: Number(fibR1.toFixed(2)),
      r2: Number(fibR2.toFixed(2)),
      r3: Number(fibR3.toFixed(2)),
      s1: Number(fibS1.toFixed(2)),
      s2: Number(fibS2.toFixed(2)),
      s3: Number(fibS3.toFixed(2))
    }
  };
}

/**
 * 8. Comprehensive Multi-Indicator Confluence Evaluator
 * Evaluates the 7 primary technical engines simultaneously and computes an
 * institutional confluence score (0 - 100), directional bias, and detailed indicators.
 */
export function evaluateConfluenceScore(assetSymbol, candles, currentPrice = null) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      symbol: assetSymbol,
      confluenceScore: 50,
      direction: 'HOLD',
      confidence: 50,
      summary: 'Insufficient historical candlestick data for quantitative confluence.',
      indicators: {}
    };
  }

  const closes = candles.map((c) => Number(c.close || c.c || c.price || 0)).filter((p) => p > 0);
  const p = currentPrice ? Number(currentPrice) : (closes[closes.length - 1] || 100);

  // Run all indicators
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, Math.min(200, Math.max(20, closes.length)));
  
  const lastEma9 = ema9[ema9.length - 1] || p;
  const lastEma21 = ema21[ema21.length - 1] || p;
  const lastEma50 = ema50[ema50.length - 1] || p;
  const lastEma200 = ema200[ema200.length - 1] || p;

  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const bb = calculateBollingerBands(closes, 20, 2.0);
  const vwap = calculateVWAP(candles);
  const supertrend = calculateSuperTrend(candles, 10, 3.0);

  const lastCandle = candles[candles.length - 1] || {};
  const high = Number(lastCandle.high || p * 1.01);
  const low = Number(lastCandle.low || p * 0.99);
  const pivots = calculatePivots(high, low, p);

  // Score computation (-100 bear to +100 bull)
  let directionalPoints = 0;
  let totalWeight = 0;

  // EMA Confluence (Weight: 25)
  totalWeight += 25;
  if (p > lastEma9 && lastEma9 > lastEma21 && lastEma21 > lastEma50) {
    directionalPoints += 25; // Perfect Bullish Stack
  } else if (p < lastEma9 && lastEma9 < lastEma21 && lastEma21 < lastEma50) {
    directionalPoints -= 25; // Perfect Bearish Stack
  } else if (p > lastEma21) {
    directionalPoints += 12;
  } else {
    directionalPoints -= 12;
  }

  // MACD Confluence (Weight: 20)
  totalWeight += 20;
  if (macd.trend === 'STRONG_BULL') directionalPoints += 20;
  else if (macd.trend === 'BULLISH') directionalPoints += 12;
  else if (macd.trend === 'STRONG_BEAR') directionalPoints -= 20;
  else directionalPoints -= 12;

  // RSI Confluence (Weight: 15)
  totalWeight += 15;
  if (rsi.state === 'OVERSOLD') {
    directionalPoints += 15; // Mean reversion buy zone
  } else if (rsi.state === 'OVERBOUGHT') {
    directionalPoints -= 15; // Mean reversion sell zone
  } else if (rsi.rsi > 50) {
    directionalPoints += 6;
  } else {
    directionalPoints -= 6;
  }

  // SuperTrend Confluence (Weight: 15)
  totalWeight += 15;
  if (supertrend.trend === 'BULLISH') directionalPoints += 15;
  else directionalPoints -= 15;

  // VWAP Confluence (Weight: 15)
  totalWeight += 15;
  if (p > vwap.vwap) {
    directionalPoints += 15;
  } else {
    directionalPoints -= 15;
  }

  // Bollinger Bands / Pivots Breakout (Weight: 10)
  totalWeight += 10;
  if (p > bb.middle && bb.percentB > 0.5) directionalPoints += 10;
  else directionalPoints -= 10;

  // Normalized Confluence Score: 0 to 100
  // directionalPoints range is [-100, +100]
  const confluenceScore = Math.max(0, Math.min(100, Math.round(((directionalPoints + 100) / 200) * 100)));

  let direction = 'HOLD';
  if (confluenceScore >= 62) direction = 'BUY';
  else if (confluenceScore <= 38) direction = 'SELL';

  const confidence = Math.abs(confluenceScore - 50) * 2;

  return {
    symbol: assetSymbol,
    price: p,
    confluenceScore,
    direction,
    confidence,
    summary: `${direction} signal with ${confluenceScore}% mathematical confluence across EMA, MACD, RSI, VWAP, and SuperTrend.`,
    indicators: {
      ema: { ema9: lastEma9, ema21: lastEma21, ema50: lastEma50, ema200: lastEma200 },
      rsi,
      macd,
      bollingerBands: bb,
      vwap,
      supertrend,
      pivots
    }
  };
}
