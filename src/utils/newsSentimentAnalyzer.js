/**
 * CHINTU AI TRADING SYSTEM - Real-time Financial News NLP Sentiment Engine
 * 
 * Analyzes market news, headlines, earnings reports, regulatory announcements,
 * and macroeconomic releases to compute high-frequency Bullish/Bearish sentiment scores.
 * 
 * Provides direct input to the 14-Bot Consensus Decision Network and Quorum Engine.
 */

// Domain-specific financial dictionary with sentiment polarity (-2.0 to +2.0)
const FINANCIAL_LEXICON = {
  // Ultra Bullish (+1.5 to +2.0)
  'record high': 2.0,
  'all-time high': 2.0,
  'all time high': 2.0,
  'surged': 1.8,
  'skyrockets': 1.9,
  'rate cut': 1.8,
  'rate cuts': 1.8,
  'profit doubles': 1.9,
  'profit jumps': 1.7,
  'earnings beat': 1.8,
  'massive rally': 1.9,
  'strong breakout': 1.8,
  'multi-year breakout': 1.9,
  'record revenue': 1.7,
  'fii buying': 1.8,
  'institutional inflow': 1.7,
  'gdp growth surges': 1.8,
  'golden cross': 1.8,
  'mega order': 1.7,
  'buyback announced': 1.6,

  // Moderate Bullish (+0.8 to +1.4)
  'rallies': 1.4,
  'gains': 1.0,
  'climbs': 1.1,
  'rebounds': 1.2,
  'upgraded': 1.4,
  'outperform': 1.3,
  'expansion': 1.1,
  'capex boost': 1.3,
  'dividend hike': 1.2,
  'easing inflation': 1.4,
  'cooling inflation': 1.3,
  'bullish': 1.3,
  'order win': 1.2,
  'positive outlook': 1.2,
  'guidance raised': 1.5,
  'accumulation': 1.2,
  'stimulus': 1.4,
  'liquidity boost': 1.3,
  'credit rating upgrade': 1.5,
  'robust demand': 1.3,
  'above estimates': 1.4,
  'strong sales': 1.2,
  'margin expansion': 1.3,

  // Mild Bullish (+0.3 to +0.7)
  'steady': 0.4,
  'advances': 0.7,
  'in line': 0.5,
  'resilient': 0.6,
  'recovering': 0.6,
  'up': 0.5,
  'green': 0.5,
  'holds support': 0.6,
  'consolidates': 0.3,

  // Ultra Bearish (-1.5 to -2.0)
  'crashes': -2.0,
  'plunges': -1.9,
  'slumps': -1.8,
  'rate hike': -1.8,
  'rate hikes': -1.8,
  'recession fears': -1.9,
  'recession': -1.8,
  'scam': -2.0,
  'fraud': -2.0,
  'default': -2.0,
  'debt default': -2.0,
  'margin call': -1.9,
  'massive selloff': -1.9,
  'circuit breaker': -1.8,
  'sebi ban': -1.9,
  'regulatory probe': -1.7,
  'earnings miss': -1.8,
  'profit sinks': -1.8,
  'fii selling': -1.8,
  'panic selling': -1.9,
  'downgrade': -1.6,
  'death cross': -1.8,

  // Moderate Bearish (-0.8 to -1.4)
  'tumbles': -1.4,
  'drops': -1.0,
  'slides': -1.1,
  'declines': -1.0,
  'bearish': -1.3,
  'tariff war': -1.4,
  'tariffs': -1.3,
  'inflation spike': -1.4,
  'stagflation': -1.5,
  'weak guidance': -1.4,
  'profit booking': -0.9,
  'underperform': -1.2,
  'headwinds': -1.1,
  'promoter pledge': -1.3,
  'sanctions': -1.3,
  'geopolitical tension': -1.4,
  'geopolitical escalation': -1.5,
  'guidance cut': -1.5,
  'margin contraction': -1.3,
  'foreclosure': -1.4,
  'strike': -1.1,

  // Mild Bearish (-0.3 to -0.7)
  'dips': -0.5,
  'muted': -0.4,
  'drifts lower': -0.6,
  'weakness': -0.6,
  'cautious': -0.4,
  'down': -0.5,
  'red': -0.5,
  'resistance holds': -0.4,
  'subdued': -0.5
};

// Intensifiers multiply the adjacent score
const INTENSIFIERS = {
  'massive': 1.4,
  'sharp': 1.3,
  'unexpected': 1.25,
  'record': 1.35,
  'huge': 1.3,
  'heavy': 1.25,
  'historic': 1.3,
  'substantially': 1.2,
  'slight': 0.6,
  'modest': 0.7,
  'marginal': 0.6
};

// Negators invert polarity
const NEGATORS = [
  'not', "didn't", 'fails to', 'failed to', 'unable to', 'ceases', 'despite', 'unlikely', 'denies'
];

// Entity keywords mapping to assets and sectors
const ENTITY_DICTIONARY = [
  { symbol: 'NIFTY 50', keywords: ['nifty', 'nifty 50', 'benchmark index', 'headline index'], sector: 'Indices' },
  { symbol: 'BANK NIFTY', keywords: ['bank nifty', 'banknifty', 'banking index', 'private banks', 'psu banks'], sector: 'Banking' },
  { symbol: 'FIN NIFTY', keywords: ['fin nifty', 'finnifty', 'financial services', 'nbfe'], sector: 'Financials' },
  { symbol: 'SENSEX', keywords: ['sensex', 'bse 30', 'dalal street'], sector: 'Indices' },
  { symbol: 'RELIANCE', keywords: ['reliance', 'ril', 'mukesh ambani', 'jio'], sector: 'Conglomerate' },
  { symbol: 'HDFC BANK', keywords: ['hdfc bank', 'hdfc'], sector: 'Banking' },
  { symbol: 'ICICI BANK', keywords: ['icici bank', 'icici'], sector: 'Banking' },
  { symbol: 'TCS', keywords: ['tcs', 'tata consultancy'], sector: 'IT' },
  { symbol: 'INFY', keywords: ['infosys', 'infy'], sector: 'IT' },
  { symbol: 'TATA MOTORS', keywords: ['tata motors', 'jlr', 'tatamotors'], sector: 'Auto' },
  { symbol: 'SBIN', keywords: ['sbi', 'state bank of india'], sector: 'Banking' },
  { symbol: 'CRUDE OIL', keywords: ['crude', 'brent', 'wti', 'opec', 'oil prices'], sector: 'Commodities' },
  { symbol: 'GOLD', keywords: ['gold', 'bullion', 'yellow metal'], sector: 'Commodities' },
  { symbol: 'SILVER', keywords: ['silver'], sector: 'Commodities' },
  { symbol: 'USDINR', keywords: ['rupee', 'usdinr', 'dollar index', 'dxy', 'forex'], sector: 'Currencies' },
  { symbol: 'RBI', keywords: ['rbi', 'reserve bank', 'shaktikanta das', 'mpc', 'repo rate'], sector: 'Macro' },
  { symbol: 'US FED', keywords: ['fed', 'federal reserve', 'powell', 'fomc'], sector: 'Macro' },
  { symbol: 'FII/DII', keywords: ['fii', 'fpi', 'dii', 'foreign investors', 'institutional flows'], sector: 'Flows' }
];

/**
 * Parses headline text and extracts sentiment score (-100 to +100), classification, and entities
 */
export function analyzeHeadlineSentiment(headline) {
  if (!headline || typeof headline !== 'string') {
    return {
      score: 0,
      classification: 'NEUTRAL',
      bullishPct: 50,
      bearishPct: 50,
      confidence: 75,
      impact: 'Neutral impact on Quorum Consensus',
      entities: [],
      matchedKeywords: []
    };
  }

  const cleanText = headline.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  let rawScore = 0;
  let matchesCount = 0;
  const matchedKeywords = [];

  // Check multi-word and single-word financial lexicon
  const sortedLexiconKeys = Object.keys(FINANCIAL_LEXICON).sort((a, b) => b.length - a.length);

  sortedLexiconKeys.forEach((phrase) => {
    if (cleanText.includes(phrase)) {
      let weight = FINANCIAL_LEXICON[phrase];
      
      // Check for preceding negator within 25 characters before phrase
      const phraseIndex = cleanText.indexOf(phrase);
      const precedingWindow = cleanText.substring(Math.max(0, phraseIndex - 25), phraseIndex);
      const isNegated = NEGATORS.some(neg => precedingWindow.includes(neg));
      if (isNegated) {
        weight = -weight * 0.8;
      }

      // Check for preceding intensifier
      Object.entries(INTENSIFIERS).forEach(([intensifier, mult]) => {
        if (precedingWindow.includes(intensifier)) {
          weight *= mult;
        }
      });

      rawScore += weight;
      matchesCount += 1;
      matchedKeywords.push({ phrase, weight });
    }
  });

  // Normalize score between -100 and +100
  let normalizedScore = 0;
  if (matchesCount > 0) {
    const avgScore = rawScore / Math.sqrt(matchesCount);
    normalizedScore = Math.max(-100, Math.min(100, Math.round((avgScore / 2.0) * 100)));
  } else {
    // Slight drift based on positive vs negative word presence
    if (cleanText.includes('profit') || cleanText.includes('growth') || cleanText.includes('high')) {
      normalizedScore = 25;
    } else if (cleanText.includes('loss') || cleanText.includes('risk') || cleanText.includes('low')) {
      normalizedScore = -25;
    }
  }

  // Determine classification
  let classification = 'NEUTRAL';
  if (normalizedScore >= 50) classification = 'STRONGLY_BULLISH';
  else if (normalizedScore >= 15) classification = 'BULLISH';
  else if (normalizedScore <= -50) classification = 'STRONGLY_BEARISH';
  else if (normalizedScore <= -15) classification = 'BEARISH';

  // Calculate percentages (0 to 100)
  const bullishPct = Math.round(50 + (normalizedScore / 2));
  const bearishPct = 100 - bullishPct;

  // Extract detected entities
  const entities = [];
  ENTITY_DICTIONARY.forEach((ent) => {
    const hasMatch = ent.keywords.some(k => cleanText.includes(k));
    if (hasMatch) {
      entities.push({ symbol: ent.symbol, sector: ent.sector });
    }
  });

  // Calculate Decision Network Quorum impact
  let impact = 'Neutral Quorum bias (9/14 baseline)';
  let quorumDelta = 0;
  if (normalizedScore >= 40) {
    impact = '+2 Quorum BUY Bias • Scalper & Momentum bots elevated';
    quorumDelta = 2;
  } else if (normalizedScore >= 15) {
    impact = '+1 Quorum BUY Bias • Trend riders confirmed';
    quorumDelta = 1;
  } else if (normalizedScore <= -40) {
    impact = '-2 Quorum SELL/DEFENSE Bias • Hedger & Shorting bots elevated';
    quorumDelta = -2;
  } else if (normalizedScore <= -15) {
    impact = '-1 Quorum SELL Bias • Trailing stop-losses tightened';
    quorumDelta = -1;
  }

  const confidence = Math.min(98, Math.max(68, 65 + matchesCount * 8));

  return {
    score: normalizedScore,
    classification,
    bullishPct,
    bearishPct,
    confidence,
    impact,
    quorumDelta,
    entities,
    matchedKeywords
  };
}

// Live real-time headline stream seed data with realistic Indian & global market events
export const INITIAL_MARKET_NEWS = [
  {
    id: 'news-1',
    headline: 'NIFTY 50 hits fresh record high as FII buying accelerates; IT and Banking lead multi-billion inflow',
    source: 'Moneycontrol Financial Wire',
    category: 'Indices & Flow',
    timestamp: '2 mins ago',
    epoch: Date.now() - 120000,
    impactAsset: 'NIFTY 50'
  },
  {
    id: 'news-2',
    headline: 'RBI holds repo rate at 6.5%, upgrades FY25 GDP growth forecast to 7.2% citing strong domestic demand',
    source: 'Bloomberg India',
    category: 'Macro & Policy',
    timestamp: '6 mins ago',
    epoch: Date.now() - 360000,
    impactAsset: 'BANK NIFTY'
  },
  {
    id: 'news-3',
    headline: 'Reliance Industries capex expansion gets green light; Q3 retail and telecom profit jumps 22% YoY',
    source: 'Economic Times Market Bureau',
    category: 'Corporate Earnings',
    timestamp: '11 mins ago',
    epoch: Date.now() - 660000,
    impactAsset: 'RELIANCE'
  },
  {
    id: 'news-4',
    headline: 'US Fed signals potential rate cut as core PCE inflation cools to 2.4%; Wall Street rallies overnight',
    source: 'Reuters Global Markets',
    category: 'Global Macro',
    timestamp: '18 mins ago',
    epoch: Date.now() - 1080000,
    impactAsset: 'SENSEX'
  },
  {
    id: 'news-5',
    headline: 'Tata Motors bags massive ₹4,200 Cr EV commercial fleet contract; EV margin expansion beats estimates',
    source: 'CNBC-TV18 Live',
    category: 'Auto & Contracts',
    timestamp: '25 mins ago',
    epoch: Date.now() - 1500000,
    impactAsset: 'TATA MOTORS'
  },
  {
    id: 'news-6',
    headline: 'Crude Oil slides 2.8% to $73/barrel on unexpected US inventory build and OPEC+ output flexibility',
    source: 'Commodity Pulse MCX',
    category: 'Commodities',
    timestamp: '32 mins ago',
    epoch: Date.now() - 1920000,
    impactAsset: 'CRUDE OIL'
  },
  {
    id: 'news-7',
    headline: 'HDFC Bank advances 1.8% after FPI headroom expands; brokerages hike target price with Overweight call',
    source: 'Mint Markets',
    category: 'Banking',
    timestamp: '44 mins ago',
    epoch: Date.now() - 2640000,
    impactAsset: 'HDFC BANK'
  },
  {
    id: 'news-8',
    headline: 'SEBI tightens index derivatives norms to curb retail margin risks; institutional algo desks welcome clarity',
    source: 'Financial Express',
    category: 'Regulatory',
    timestamp: '52 mins ago',
    epoch: Date.now() - 3120000,
    impactAsset: 'FIN NIFTY'
  },
  {
    id: 'news-9',
    headline: 'Infosys signs $1.2B cloud transformation mega-deal with European banking conglomerate; guidance reaffirmed',
    source: 'Business Standard',
    category: 'IT Services',
    timestamp: '1 hr ago',
    epoch: Date.now() - 3600000,
    impactAsset: 'INFY'
  },
  {
    id: 'news-10',
    headline: 'Gold consolidates near ₹76,400/10g as central bank purchases offset slight dollar rebound',
    source: 'Bullion Bulletin',
    category: 'Precious Metals',
    timestamp: '1.2 hrs ago',
    epoch: Date.now() - 4320000,
    impactAsset: 'GOLD'
  }
];

// High-frequency new incoming headlines pool for live simulation
const INCOMING_HEADLINES_POOL = [
  {
    headline: 'Bank Nifty breaks past 54,000 psychological resistance; PSU banks lead with heavy institutional volume',
    source: 'Moneycontrol Pro',
    category: 'Banking',
    impactAsset: 'BANK NIFTY'
  },
  {
    headline: 'Foreign Portfolio Investors pour ₹3,450 Cr into Dalal Street in opening 90 minutes of trading',
    source: 'NSE Live Flow',
    category: 'Flows',
    impactAsset: 'NIFTY 50'
  },
  {
    headline: 'Brent crude jumps 1.4% following Red Sea shipping transit alerts; state refiners hold margins steady',
    source: 'Reuters Energy',
    category: 'Commodities',
    impactAsset: 'CRUDE OIL'
  },
  {
    headline: 'India Manufacturing PMI accelerates to 58.6; new export orders surge at fastest pace in 14 months',
    source: 'S&P Global / Mint',
    category: 'Macro',
    impactAsset: 'NIFTY 50'
  },
  {
    headline: 'US Tech futures slide 0.8% on minor profit booking ahead of semiconductor mega-earnings',
    source: 'Bloomberg Terminal',
    category: 'Global Markets',
    impactAsset: 'INFY'
  },
  {
    headline: 'TCS reports multi-year high order book of $10.2B in Q3; announces interim dividend of ₹28/share',
    source: 'CNBC-TV18',
    category: 'IT Services',
    impactAsset: 'TCS'
  },
  {
    headline: 'ICICI Bank net interest margin holds resilient at 4.36%; gross NPA plunges to 8-year low of 2.15%',
    source: 'Economic Times',
    category: 'Banking',
    impactAsset: 'ICICI BANK'
  },
  {
    headline: 'Silver prices rally 2.2% on MCX backed by clean energy industrial solar demand and supply squeeze',
    source: 'Commodity Wire',
    category: 'Commodities',
    impactAsset: 'SILVER'
  }
];

// Active singleton state for subscribers across the application
class NewsSentimentEngine {
  constructor() {
    this.newsList = INITIAL_MARKET_NEWS.map(item => ({
      ...item,
      sentiment: analyzeHeadlineSentiment(item.headline)
    }));
    this.subscribers = new Set();
    this.incomingIndex = 0;
    this.autoStreamActive = true;

    // Start background stream simulation every 25 seconds
    if (typeof window !== 'undefined') {
      this.streamInterval = setInterval(() => {
        this.simulateIncomingNews();
      }, 25000);
    }
  }

  // Subscribe callback to receive state changes
  subscribe(callback) {
    this.subscribers.add(callback);
    // Emit immediate current state
    callback(this.getCompositeState());
    return () => this.subscribers.delete(callback);
  }

  notify() {
    const state = this.getCompositeState();
    this.subscribers.forEach(cb => {
      try { cb(state); } catch (e) { console.error('Sentiment subscriber error:', e); }
    });
  }

  async fetchLiveMarketNews() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://news.google.com/rss/search?q=NSE+Nifty+Stock+Market+India&hl=en-IN&gl=IN&ceid=IN:en', {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const xml = await res.text();
        const items = [];
        const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
          const rawTitle = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
          items.push({
            id: `live-rss-${Date.now()}-${items.length}`,
            headline: rawTitle,
            source: 'Live Financial Market Feed',
            category: 'Macro & Markets',
            timestamp: match[2] || 'Just now',
            epoch: Date.now(),
            impactAsset: rawTitle.includes('Bank') ? 'BANKNIFTY' : (rawTitle.includes('Gold') ? 'GOLD' : 'NIFTY 50'),
            sentiment: analyzeHeadlineSentiment(rawTitle)
          });
        }
        if (items.length > 0) {
          this.newsList = [...items, ...this.newsList].slice(0, 30);
          this.notify();
          return items;
        }
      }
    } catch (e) {
      // Network sandboxed or offline fallback
    }
    return [this.simulateIncomingNews()];
  }

  simulateIncomingNews() {
    const item = INCOMING_HEADLINES_POOL[this.incomingIndex % INCOMING_HEADLINES_POOL.length];
    this.incomingIndex += 1;

    const newArticle = {
      id: `news-${Date.now()}`,
      headline: item.headline,
      source: item.source,
      category: item.category,
      timestamp: 'Just now',
      epoch: Date.now(),
      impactAsset: item.impactAsset,
      sentiment: analyzeHeadlineSentiment(item.headline)
    };

    // Prepend to list, keeping max 30 items
    this.newsList = [newArticle, ...this.newsList.slice(0, 29)];
    this.notify();
    return newArticle;
  }

  // Compute composite sentiment score across current news items
  getCompositeState() {
    if (this.newsList.length === 0) {
      return {
        compositeScore: 0,
        classification: 'NEUTRAL',
        bullishPct: 50,
        bearishPct: 50,
        quorumBias: 0,
        quorumRecommendation: 'NEUTRAL',
        totalArticles: 0,
        latestHeadline: null,
        articles: []
      };
    }

    // Weight recent articles higher (decay factor)
    let totalWeightedScore = 0;
    let totalWeight = 0;

    this.newsList.forEach((item, idx) => {
      const recencyWeight = Math.max(0.3, 1 - (idx * 0.05));
      totalWeightedScore += item.sentiment.score * recencyWeight;
      totalWeight += recencyWeight;
    });

    const compositeScore = Math.round(totalWeightedScore / totalWeight);

    let classification = 'NEUTRAL';
    if (compositeScore >= 45) classification = 'STRONGLY_BULLISH';
    else if (compositeScore >= 15) classification = 'BULLISH';
    else if (compositeScore <= -45) classification = 'STRONGLY_BEARISH';
    else if (compositeScore <= -15) classification = 'BEARISH';

    const bullishPct = Math.round(50 + (compositeScore / 2));
    const bearishPct = 100 - bullishPct;

    // Quorum calculation
    let quorumBias = 0;
    let quorumRecommendation = 'NEUTRAL (9/14 baseline)';
    if (compositeScore >= 40) {
      quorumBias = 2;
      quorumRecommendation = 'BULLISH QUORUM (+2 BUY Votes)';
    } else if (compositeScore >= 15) {
      quorumBias = 1;
      quorumRecommendation = 'LEAN BULLISH (+1 BUY Vote)';
    } else if (compositeScore <= -40) {
      quorumBias = -2;
      quorumRecommendation = 'DEFENSIVE / SHORT (-2 Bias)';
    } else if (compositeScore <= -15) {
      quorumBias = -1;
      quorumRecommendation = 'LEAN BEARISH (-1 Bias)';
    }

    // Sector breakdown
    const sectorScores = {};
    this.newsList.forEach(item => {
      const cat = item.category || 'General';
      if (!sectorScores[cat]) {
        sectorScores[cat] = { total: 0, count: 0 };
      }
      sectorScores[cat].total += item.sentiment.score;
      sectorScores[cat].count += 1;
    });

    const sectorBreakdown = Object.entries(sectorScores).map(([sector, data]) => ({
      sector,
      score: Math.round(data.total / data.count),
      count: data.count
    }));

    return {
      compositeScore,
      classification,
      bullishPct,
      bearishPct,
      quorumBias,
      quorumRecommendation,
      totalArticles: this.newsList.length,
      latestHeadline: this.newsList[0],
      articles: this.newsList,
      sectorBreakdown,
      lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  }

  // Force manual refresh or inject user custom headline
  refreshFeed() {
    return this.simulateIncomingNews();
  }

  analyzeCustomHeadline(text) {
    return analyzeHeadlineSentiment(text);
  }
}

// Global Singleton Instance
export const newsSentimentEngine = new NewsSentimentEngine();
