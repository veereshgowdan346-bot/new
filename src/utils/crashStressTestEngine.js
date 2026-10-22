/**
 * CHINTU AI TRADING SYSTEM - Quantitative Historical Crash Stress-Test Engine
 * 
 * Simulates extreme macroeconomic tail-risk events and flash crashes (2008 GFC, 2020 COVID-19,
 * 2016 Demonetization, 2024 Election Plunge) against algorithmic trading strategies.
 * Calculates Max Drawdown (MDD), Value-at-Risk (VaR 99%), Expected Shortfall (CVaR),
 * Recovery Duration, Ulcer Index, and pre-deployment safety clearance.
 */

// Historical Market Shock Datasets (Normalized Day-by-Day Benchmark Returns & Volatility)
export const HISTORICAL_CRASH_SCENARIOS = {
  GFC_2008: {
    id: 'GFC_2008',
    name: '2008 Global Financial Crisis (Lehman Collapse)',
    dateRange: 'Sep 2008 – Mar 2009',
    benchmarkDropPct: -59.4,
    peakVix: 89.5,
    daysDuration: 135,
    category: 'Systemic Banking Freeze',
    description: 'Catastrophic subprime mortgage credit contagion, Lehman Brothers bankruptcy, multi-day consecutive lower circuit breakers, and institutional liquidity freeze.',
    regime: 'Protracted Severe Bear Market',
    // Normalized sample shock wave profile (daily benchmark returns in %)
    shockProfile: [
      -3.2, -4.8, -1.5, -6.4, -2.1, -7.8, +4.2, -5.6, -3.8, +3.1,
      -8.2, -4.5, -2.0, -6.1, +5.5, -7.2, -3.9, -4.1, +2.8, -5.5,
      -6.8, +4.1, -5.2, -3.4, -4.7, +3.2, -6.0, -2.5, +1.8, -4.9,
      -3.8, -5.1, +3.8, -4.2, -3.6, +2.1, -4.5, -2.8, +1.5, -3.2,
      -2.5, +1.9, -3.4, -2.1, +1.2, -2.8, +2.4, -1.9, +1.5, -0.8
    ]
  },
  COVID_2020: {
    id: 'COVID_2020',
    name: '2020 COVID-19 Flash Crash (Pandemic Lockdown)',
    dateRange: 'Feb 2020 – Apr 2020',
    benchmarkDropPct: -39.8,
    peakVix: 86.6,
    daysDuration: 42,
    category: 'Global Exogenous Flash Shock',
    description: 'Fastest 35%+ global equity plunge in modern history. 3 lower circuit breakers in 2 weeks, extreme gap-downs, and violent intraday whipsaws.',
    regime: 'Violent Flash Contraction & Fast V-Shape',
    shockProfile: [
      -2.4, -3.1, -1.8, -4.2, -5.8, -8.3, -2.1, +3.5, -9.6, -4.5,
      -7.2, -12.9, +6.4, -5.8, -6.2, +4.9, -7.5, -3.8, +3.2, -4.6,
      +5.1, -3.2, +4.8, -2.5, +3.9, +2.1, -3.4, +4.2, +1.8, +3.5,
      +2.8, +1.9, -2.1, +3.4, +1.5, +2.9, -1.4, +3.1, +2.5, +1.8
    ]
  },
  DEMONETIZATION_2016: {
    id: 'DEMONETIZATION_2016',
    name: '2016 Demonetization & Liquidity Shock',
    dateRange: 'Nov 2016 – Dec 2016',
    benchmarkDropPct: -12.8,
    peakVix: 24.2,
    daysDuration: 35,
    category: 'Domestic Cash & Consumption Shock',
    description: 'Overnight cancellation of 86% of currency in circulation. Severe pressure on Real Estate, NBFCs, Auto, and Small-Cap liquidity.',
    regime: 'Domestic Sectoral Drag',
    shockProfile: [
      -4.2, -2.8, -1.5, -3.4, -2.1, +1.2, -2.5, -1.8, +0.8, -2.9,
      -1.4, -1.9, +0.6, -1.2, -0.8, +1.4, -1.6, -0.9, +0.5, -1.1,
      +0.8, -0.4, +1.2, -0.6, +0.9, +0.4, -0.7, +0.8, +0.3, +0.6
    ]
  },
  ELECTION_2024: {
    id: 'ELECTION_2024',
    name: '2024 General Election Volatility Plunge (June 4)',
    dateRange: 'June 3 – June 7, 2024',
    benchmarkDropPct: -8.9,
    peakVix: 31.7,
    daysDuration: 5,
    category: 'High-Gamma Political Event Shock',
    description: 'Unprecedented exit-poll reversal event. Benchmark dropped 1,979 points intraday (-5.9%), Midcap -8.5%, PSU Banks -15% with massive IV crush.',
    regime: 'Ultra-High Frequency 1-Day Event Gap',
    shockProfile: [
      +3.4, -5.9, -2.8, +2.2, +3.1, +1.8, -0.6, +1.4, +0.9, +1.1
    ]
  }
};

/**
 * Runs historical crash simulation against a quantitative strategy.
 * 
 * @param {object} params
 * @param {object} params.strategy - Strategy object with name, category, stop_loss_pct, target_pct, etc.
 * @param {string} params.scenarioId - Key of HISTORICAL_CRASH_SCENARIOS ('GFC_2008', 'COVID_2020', etc.)
 * @param {number} params.initialCapital - Starting equity (e.g. 500,000)
 * @param {number} params.stressMultiplier - Severity multiplier (1.0x to 1.5x)
 * @param {number} params.slippageBufferPct - Execution slippage under market stress (e.g. 0.2%)
 * @param {boolean} params.dynamicAtrFilter - Whether dynamic volatility scaling is active
 */
export function simulateStrategyStressTest({
  strategy,
  scenarioId = 'COVID_2020',
  initialCapital = 500000,
  stressMultiplier = 1.0,
  slippageBufferPct = 0.25,
  dynamicAtrFilter = true
}) {
  const scenario = HISTORICAL_CRASH_SCENARIOS[scenarioId] || HISTORICAL_CRASH_SCENARIOS.COVID_2020;
  const capital = Math.max(1000, Number(initialCapital) || 500000);
  const stopLossPct = Math.max(0.05, Number(strategy?.stop_loss_pct) || 0.35);
  const targetPct = Math.max(0.1, Number(strategy?.target_pct) || 0.70);
  const category = (strategy?.category || 'Momentum Scalper').toLowerCase();

  // Strategy sensitivity factors based on algorithmic type
  let betaToCrash = 0.65;
  let shortingCapacity = 0.50; // Ability to profit or protect via short signals
  let stopLossEfficiency = 0.92; // How reliably stops hold in flash crashes

  if (category.includes('mean reversion')) {
    betaToCrash = 0.85; // Mean reversion often suffers more during straight downward cascades
    shortingCapacity = 0.30;
    stopLossEfficiency = 0.88;
  } else if (category.includes('momentum') || category.includes('trend')) {
    betaToCrash = 0.55; // Trend strategies flip short
    shortingCapacity = 0.75;
    stopLossEfficiency = 0.94;
  } else if (category.includes('scalper') || category.includes('l2')) {
    betaToCrash = 0.40; // Tight stops & intraday square-off insulate against overnight gap-downs
    shortingCapacity = 0.85;
    stopLossEfficiency = 0.95;
  } else if (category.includes('options') || category.includes('hedger')) {
    betaToCrash = 0.30; // Options hedges benefit from volatility expansion
    shortingCapacity = 0.90;
    stopLossEfficiency = 0.96;
  }

  // Adjust for dynamic ATR volatility filter
  if (dynamicAtrFilter) {
    betaToCrash *= 0.80;
    stopLossEfficiency = Math.min(0.99, stopLossEfficiency * 1.05);
  }

  // Simulation day-by-day paths
  let currentEquity = capital;
  let peakEquity = capital;
  let maxDrawdownValue = 0;
  let maxDrawdownPct = 0;
  let benchmarkEquity = capital;
  
  const dailyEquityCurve = [];
  const dailyDrawdowns = [];
  const dailyReturns = [];

  let daysInDrawdown = 0;
  let maxDrawdownDurationDays = 0;
  let currentDdStreak = 0;
  let stoppedOutTrades = 0;
  let totalTradesCount = 0;

  scenario.shockProfile.forEach((marketDayReturnPct, dayIndex) => {
    totalTradesCount += 2; // ~2 trades per trading session
    const effectiveMarketReturn = marketDayReturnPct * stressMultiplier;

    // Benchmark equity evolution
    benchmarkEquity *= (1 + (effectiveMarketReturn / 100));

    // Strategy Return Calculation for this day:
    // If market crashes, strategy either stops out at -stopLossPct (plus slippage) OR catches the down move if trend/shorting
    let dayStrategyReturnPct = 0;

    if (effectiveMarketReturn < 0) {
      // Market down day
      const isShortSignalTriggered = Math.random() < shortingCapacity;
      if (isShortSignalTriggered) {
        // Successfully caught short trend
        dayStrategyReturnPct = (Math.abs(effectiveMarketReturn) * 0.65) - slippageBufferPct;
      } else {
        // Long position stopped out: loss capped at stopLossPct plus gap slippage
        const slippageMultiplier = (1.0 - stopLossEfficiency) * (Math.abs(effectiveMarketReturn) / 4);
        const actualLoss = Math.min(Math.abs(effectiveMarketReturn) * betaToCrash, stopLossPct + slippageMultiplier + (slippageBufferPct * 0.5));
        dayStrategyReturnPct = -actualLoss;
        stoppedOutTrades += 1;
      }
    } else {
      // Market relief bounce / up day
      const isWin = Math.random() < 0.65;
      if (isWin) {
        dayStrategyReturnPct = Math.min(targetPct, effectiveMarketReturn * 0.85);
      } else {
        dayStrategyReturnPct = -stopLossPct;
        stoppedOutTrades += 1;
      }
    }

    // Apply daily strategy return to equity
    currentEquity *= (1 + (dayStrategyReturnPct / 100));
    dailyReturns.push(dayStrategyReturnPct);

    // Track peak and drawdown
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
      currentDdStreak = 0;
    } else {
      currentDdStreak += 1;
      daysInDrawdown += 1;
      if (currentDdStreak > maxDrawdownDurationDays) {
        maxDrawdownDurationDays = currentDdStreak;
      }
    }

    const currentDdVal = peakEquity - currentEquity;
    const currentDdPct = peakEquity > 0 ? (currentDdVal / peakEquity) * 100 : 0;

    if (currentDdVal > maxDrawdownValue) {
      maxDrawdownValue = currentDdVal;
      maxDrawdownPct = currentDdPct;
    }

    dailyEquityCurve.push({
      day: dayIndex + 1,
      strategyEquity: Number(currentEquity.toFixed(2)),
      benchmarkEquity: Number(benchmarkEquity.toFixed(2)),
      drawdownPct: Number(currentDdPct.toFixed(2)),
      dayReturnPct: Number(dayStrategyReturnPct.toFixed(2)),
      marketReturnPct: Number(effectiveMarketReturn.toFixed(2))
    });
    dailyDrawdowns.push(currentDdPct);
  });

  // Calculate Value at Risk (VaR 99% and 95%)
  const sortedReturns = [...dailyReturns].sort((a, b) => a - b);
  const var95Index = Math.floor(sortedReturns.length * 0.05);
  const var99Index = Math.floor(sortedReturns.length * 0.01);
  const var95Pct = Math.abs(sortedReturns[var95Index] || 0);
  const var99Pct = Math.abs(sortedReturns[var99Index] || 0);

  // Expected Shortfall (CVaR 99% - average of returns below 99% VaR)
  const tailLosses = sortedReturns.slice(0, Math.max(1, var99Index + 1));
  const cvar99Pct = Math.abs(tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length);

  // Ulcer Index: Quadratic measure of drawdown depth and duration
  const sumSquaredDrawdowns = dailyDrawdowns.reduce((sum, dd) => sum + (dd * dd), 0);
  const ulcerIndex = Number(Math.sqrt(sumSquaredDrawdowns / dailyDrawdowns.length).toFixed(2));

  // Benchmark Max Drawdown during scenario
  const benchmarkFinalReturnPct = Number((((benchmarkEquity - capital) / capital) * 100).toFixed(2));
  const strategyFinalReturnPct = Number((((currentEquity - capital) / capital) * 100).toFixed(2));
  const alphaOverCrashPct = Number((strategyFinalReturnPct - benchmarkFinalReturnPct).toFixed(2));

  // Calmar Ratio = Annualized Return / Max Drawdown
  const annualFactor = 252 / scenario.shockProfile.length;
  const annualizedReturnPct = strategyFinalReturnPct * annualFactor;
  const calmarRatio = maxDrawdownPct > 0 ? Number((annualizedReturnPct / maxDrawdownPct).toFixed(2)) : 0.0;

  // Stop-Loss Containment Rating
  const stopLossContainmentPct = totalTradesCount > 0
    ? Number((((totalTradesCount - (stoppedOutTrades * 0.15)) / totalTradesCount) * 100).toFixed(1))
    : 95.0;

  // Pre-Deployment Clearance Verdict
  let clearanceStatus = 'PASSED';
  let clearanceBadgeClass = 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40';
  let verdictSummary = 'Strategy demonstrated exceptional downside resilience and passed all pre-deployment tail-risk guardrails.';
  const recommendations = [];

  if (maxDrawdownPct > 28.0 || currentEquity < (capital * 0.65)) {
    clearanceStatus = 'REJECTED';
    clearanceBadgeClass = 'text-rose-400 bg-rose-500/15 border-rose-500/40';
    verdictSummary = 'DEPLOYMENT BLOCKED: Severe tail-risk fragility detected. Maximum drawdown breached safety limits (>28%). Algorithm would experience unrecoverable capital erosion.';
    recommendations.push('Reduce maximum lot exposure by at least 40% when India VIX > 30.');
    recommendations.push('Enforce mandatory overnight delta hedge via Put options during high-volatility regimes.');
    recommendations.push('Implement a hard daily stop-out limit at 2.5% of total account equity.');
  } else if (maxDrawdownPct > 15.0) {
    clearanceStatus = 'WARNING';
    clearanceBadgeClass = 'text-amber-400 bg-amber-500/15 border-amber-500/40';
    verdictSummary = 'CONDITIONAL CLEARANCE: Strategy survived with moderate stress. Max drawdown exceeded 15%. Recommend tightening trailing stop-losses before live broker allocation.';
    recommendations.push('Enable Dynamic ATR Volatility Scaling to automatically reduce position sizes during market gap-downs.');
    recommendations.push('Tighten trailing stop-loss from ' + stopLossPct + '% to ' + (stopLossPct * 0.8).toFixed(2) + '%.');
    recommendations.push('Verify broker DMA latency guarantees < 5ms to avoid slippage expansion.');
  } else {
    recommendations.push('Strategy successfully weathered the market crash, significantly outperforming the benchmark drop of ' + scenario.benchmarkDropPct + '%.');
    recommendations.push('Stop-loss containment remained solid with minimal slippage spillover.');
    recommendations.push('Algorithm is cleared for Live DMA and Autonomous Decision Network voting.');
  }

  return {
    scenario,
    strategyName: strategy?.name || 'Algorithmic Strategy',
    category: strategy?.category || 'Quant Strategy',
    initialCapital: capital,
    finalEquity: Number(currentEquity.toFixed(2)),
    benchmarkFinalEquity: Number(benchmarkEquity.toFixed(2)),
    strategyReturnPct: strategyFinalReturnPct,
    benchmarkReturnPct: benchmarkFinalReturnPct,
    alphaOverCrashPct,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    maxDrawdownValue: Number(maxDrawdownValue.toFixed(2)),
    maxDrawdownDurationDays,
    daysInDrawdown,
    var95Pct: Number(var95Pct.toFixed(2)),
    var99Pct: Number(var99Pct.toFixed(2)),
    cvar99Pct: Number(cvar99Pct.toFixed(2)),
    ulcerIndex,
    calmarRatio,
    stopLossContainmentPct,
    clearanceStatus,
    clearanceBadgeClass,
    verdictSummary,
    recommendations,
    dailyEquityCurve
  };
}
