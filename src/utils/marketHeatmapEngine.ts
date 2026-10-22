// CHINTU AI REAL-TIME MARKET HEATMAP ENGINE
// Institutional Multi-Sector Confluence, Order Flow Intensity & Volatility Opportunities

export interface DepthLevel {
  price: number;
  qty: number;
  orders: number;
}

export interface HeatmapItem {
  symbol: string;
  name: string;
  sector: string;
  sectorId: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number; // in ₹ Crores
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  orderFlowIntensity: number; // 0 to 100
  orderFlowImbalance: number; // -100 to +100 (%)
  orderFlowDelta: number; // net CVD in contracts/shares
  buyVolume: number;
  sellVolume: number;
  volatilityPercentile: number; // 0 to 100
  isHighVolatility: boolean;
  isOrderFlowSpike: boolean;
  vwap: number;
  vwapDistancePct: number;
  high24h: number;
  low24h: number;
  jarvisSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  jarvisConfluence: string;
  opportunityTag: string;
  l2Depth: {
    bids: DepthLevel[];
    asks: DepthLevel[];
  };
}

export interface SectorSummary {
  id: string;
  name: string;
  avgChangePercent: number;
  totalMarketCap: number;
  totalVolume: number;
  avgOrderFlowIntensity: number;
  netOrderFlowImbalance: number;
  highVolatilityCount: number;
  orderFlowSpikeCount: number;
  itemCount: number;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface HeatmapPayload {
  timestamp: number;
  marketSummary: {
    totalTurnoverCr: number;
    advances: number;
    declines: number;
    neutral: number;
    avgVolatilityIndex: number;
    highVolatilityCount: number;
    orderFlowSpikeCount: number;
    topGainers: string[];
    topLosers: string[];
    topOrderFlowSpikes: string[];
  };
  sectors: SectorSummary[];
  items: HeatmapItem[];
}

export const INITIAL_SECTORS = [
  { id: 'banking', name: 'Banking & Financial Services' },
  { id: 'it', name: 'Information Technology' },
  { id: 'energy', name: 'Energy, Oil & Power' },
  { id: 'auto', name: 'Automotive & Mobility' },
  { id: 'metals', name: 'Metals & Infrastructure' },
  { id: 'pharma', name: 'Pharma & Healthcare' },
  { id: 'fmcg', name: 'FMCG & Consumer Goods' },
  { id: 'derivatives', name: 'Indices & F&O Derivatives' }
];

export const INITIAL_HEATMAP_DATA: HeatmapItem[] = [
  // Banking & Financials
  {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Ltd.',
    sector: 'Banking & Financial Services',
    sectorId: 'banking',
    price: 1798.20,
    change: 22.80,
    changePercent: 1.28,
    marketCap: 1368000,
    volume: 18450000,
    avgVolume: 12000000,
    volumeRatio: 1.54,
    orderFlowIntensity: 82,
    orderFlowImbalance: 38.5,
    orderFlowDelta: 1420000,
    buyVolume: 10420000,
    sellVolume: 8030000,
    volatilityPercentile: 72,
    isHighVolatility: false,
    isOrderFlowSpike: true,
    vwap: 1791.40,
    vwapDistancePct: 0.38,
    high24h: 1804.00,
    low24h: 1772.50,
    jarvisSignal: 'BUY',
    jarvisConfluence: '11/14 Bots Concur: Institutional Buy Sweeps Above VWAP',
    opportunityTag: '🔥 Institutional Accumulation',
    l2Depth: {
      bids: [
        { price: 1798.10, qty: 12500, orders: 42 },
        { price: 1798.00, qty: 28400, orders: 98 },
        { price: 1797.80, qty: 15600, orders: 35 },
        { price: 1797.50, qty: 45000, orders: 120 },
        { price: 1797.00, qty: 62000, orders: 180 }
      ],
      asks: [
        { price: 1798.30, qty: 8200, orders: 25 },
        { price: 1798.50, qty: 14500, orders: 48 },
        { price: 1798.90, qty: 9800, orders: 29 },
        { price: 1799.00, qty: 32000, orders: 110 },
        { price: 1799.50, qty: 21000, orders: 65 }
      ]
    }
  },
  {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Ltd.',
    sector: 'Banking & Financial Services',
    sectorId: 'banking',
    price: 1245.60,
    change: -5.40,
    changePercent: -0.43,
    marketCap: 875000,
    volume: 14200000,
    avgVolume: 11000000,
    volumeRatio: 1.29,
    orderFlowIntensity: 64,
    orderFlowImbalance: -14.2,
    orderFlowDelta: -450000,
    buyVolume: 6875000,
    sellVolume: 7325000,
    volatilityPercentile: 58,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 1248.10,
    vwapDistancePct: -0.20,
    high24h: 1255.00,
    low24h: 1240.20,
    jarvisSignal: 'NEUTRAL',
    jarvisConfluence: '7/14 Bots Concur: Mean Reversion Rangebound',
    opportunityTag: '🌊 Mean Reversion',
    l2Depth: {
      bids: [
        { price: 1245.50, qty: 8500, orders: 30 },
        { price: 1245.20, qty: 14200, orders: 55 },
        { price: 1245.00, qty: 35000, orders: 110 },
        { price: 1244.50, qty: 21000, orders: 74 },
        { price: 1244.00, qty: 42000, orders: 135 }
      ],
      asks: [
        { price: 1245.70, qty: 9800, orders: 34 },
        { price: 1246.00, qty: 28000, orders: 90 },
        { price: 1246.50, qty: 17500, orders: 52 },
        { price: 1247.00, qty: 38000, orders: 115 },
        { price: 1247.50, qty: 19000, orders: 60 }
      ]
    }
  },
  {
    symbol: 'SBIN',
    name: 'State Bank of India',
    sector: 'Banking & Financial Services',
    sectorId: 'banking',
    price: 842.10,
    change: 18.70,
    changePercent: 2.27,
    marketCap: 751000,
    volume: 24500000,
    avgVolume: 9800000,
    volumeRatio: 2.50,
    orderFlowIntensity: 91,
    orderFlowImbalance: 54.0,
    orderFlowDelta: 3100000,
    buyVolume: 15400000,
    sellVolume: 9100000,
    volatilityPercentile: 88,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 834.50,
    vwapDistancePct: 0.91,
    high24h: 846.50,
    low24h: 821.00,
    jarvisSignal: 'STRONG_BUY',
    jarvisConfluence: '13/14 Quorum Super-Major Consensus: Massive PSU Bank Breakout',
    opportunityTag: '⚡ High Volatility Breakout',
    l2Depth: {
      bids: [
        { price: 842.00, qty: 45000, orders: 145 },
        { price: 841.80, qty: 32000, orders: 88 },
        { price: 841.50, qty: 78000, orders: 210 },
        { price: 841.00, qty: 95000, orders: 310 },
        { price: 840.50, qty: 120000, orders: 420 }
      ],
      asks: [
        { price: 842.20, qty: 11000, orders: 38 },
        { price: 842.50, qty: 24000, orders: 72 },
        { price: 843.00, qty: 41000, orders: 130 },
        { price: 843.50, qty: 29000, orders: 85 },
        { price: 844.00, qty: 55000, orders: 175 }
      ]
    }
  },
  {
    symbol: 'KOTAKBANK',
    name: 'Kotak Mahindra Bank',
    sector: 'Banking & Financial Services',
    sectorId: 'banking',
    price: 1824.50,
    change: 9.30,
    changePercent: 0.51,
    marketCap: 362000,
    volume: 5800000,
    avgVolume: 5100000,
    volumeRatio: 1.14,
    orderFlowIntensity: 56,
    orderFlowImbalance: 12.0,
    orderFlowDelta: 280000,
    buyVolume: 3040000,
    sellVolume: 2760000,
    volatilityPercentile: 48,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 1821.00,
    vwapDistancePct: 0.19,
    high24h: 1832.00,
    low24h: 1812.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '9/14 Quorum Approved: Stable trend continuation',
    opportunityTag: '🟢 Trend Following',
    l2Depth: {
      bids: [
        { price: 1824.00, qty: 6200, orders: 22 },
        { price: 1823.50, qty: 11400, orders: 41 },
        { price: 1823.00, qty: 22000, orders: 78 },
        { price: 1822.50, qty: 15000, orders: 50 },
        { price: 1822.00, qty: 34000, orders: 95 }
      ],
      asks: [
        { price: 1824.80, qty: 5800, orders: 19 },
        { price: 1825.00, qty: 18500, orders: 60 },
        { price: 1825.50, qty: 12000, orders: 38 },
        { price: 1826.00, qty: 24000, orders: 82 },
        { price: 1826.50, qty: 16000, orders: 55 }
      ]
    }
  },
  {
    symbol: 'AXISBANK',
    name: 'Axis Bank Ltd.',
    sector: 'Banking & Financial Services',
    sectorId: 'banking',
    price: 1182.40,
    change: 14.20,
    changePercent: 1.22,
    marketCap: 366000,
    volume: 9800000,
    avgVolume: 7200000,
    volumeRatio: 1.36,
    orderFlowIntensity: 74,
    orderFlowImbalance: 29.5,
    orderFlowDelta: 850000,
    buyVolume: 5650000,
    sellVolume: 4150000,
    volatilityPercentile: 65,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 1176.80,
    vwapDistancePct: 0.48,
    high24h: 1188.00,
    low24h: 1166.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '10/14 Bots: High beta continuation with banking breadth',
    opportunityTag: '⚡ Momentum Push',
    l2Depth: {
      bids: [
        { price: 1182.20, qty: 8900, orders: 32 },
        { price: 1182.00, qty: 21000, orders: 75 },
        { price: 1181.50, qty: 38000, orders: 118 },
        { price: 1181.00, qty: 45000, orders: 140 },
        { price: 1180.50, qty: 52000, orders: 165 }
      ],
      asks: [
        { price: 1182.60, qty: 7200, orders: 25 },
        { price: 1183.00, qty: 19500, orders: 68 },
        { price: 1183.50, qty: 14200, orders: 49 },
        { price: 1184.00, qty: 29000, orders: 94 },
        { price: 1184.50, qty: 18000, orders: 58 }
      ]
    }
  },
  {
    symbol: 'BAJFINANCE',
    name: 'Bajaj Finance Ltd.',
    sector: 'Banking & Financial Services',
    sectorId: 'banking',
    price: 7412.00,
    change: 195.40,
    changePercent: 2.71,
    marketCap: 458000,
    volume: 4200000,
    avgVolume: 1600000,
    volumeRatio: 2.63,
    orderFlowIntensity: 94,
    orderFlowImbalance: 62.4,
    orderFlowDelta: 920000,
    buyVolume: 2840000,
    sellVolume: 1360000,
    volatilityPercentile: 92,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 7320.00,
    vwapDistancePct: 1.26,
    high24h: 7445.00,
    low24h: 7210.00,
    jarvisSignal: 'STRONG_BUY',
    jarvisConfluence: '14/14 Unanimous Bots: Explosive NBFC Gamma Squeeze',
    opportunityTag: '⚡ High Volatility Gamma Squeeze',
    l2Depth: {
      bids: [
        { price: 7411.00, qty: 3400, orders: 28 },
        { price: 7410.00, qty: 9800, orders: 62 },
        { price: 7408.00, qty: 14500, orders: 95 },
        { price: 7405.00, qty: 22000, orders: 130 },
        { price: 7400.00, qty: 38000, orders: 220 }
      ],
      asks: [
        { price: 7414.00, qty: 1800, orders: 15 },
        { price: 7415.00, qty: 4500, orders: 32 },
        { price: 7418.00, qty: 3200, orders: 24 },
        { price: 7420.00, qty: 11000, orders: 78 },
        { price: 7425.00, qty: 8900, orders: 54 }
      ]
    }
  },

  // Information Technology (IT)
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    sector: 'Information Technology',
    sectorId: 'it',
    price: 3528.30,
    change: 22.40,
    changePercent: 0.64,
    marketCap: 1278000,
    volume: 3850000,
    avgVolume: 3200000,
    volumeRatio: 1.20,
    orderFlowIntensity: 62,
    orderFlowImbalance: 16.5,
    orderFlowDelta: 320000,
    buyVolume: 2085000,
    sellVolume: 1765000,
    volatilityPercentile: 52,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 3518.50,
    vwapDistancePct: 0.28,
    high24h: 3545.00,
    low24h: 3505.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '9/14 Bots: IT Tier-1 steady institutional absorption',
    opportunityTag: '🟢 Steady Accumulation',
    l2Depth: {
      bids: [
        { price: 3528.00, qty: 4200, orders: 24 },
        { price: 3527.50, qty: 8900, orders: 48 },
        { price: 3527.00, qty: 16500, orders: 82 },
        { price: 3526.00, qty: 24000, orders: 110 },
        { price: 3525.00, qty: 41000, orders: 170 }
      ],
      asks: [
        { price: 3528.60, qty: 3500, orders: 18 },
        { price: 3529.00, qty: 9200, orders: 51 },
        { price: 3530.00, qty: 22000, orders: 95 },
        { price: 3531.00, qty: 14000, orders: 62 },
        { price: 3532.00, qty: 18500, orders: 74 }
      ]
    }
  },
  {
    symbol: 'INFY',
    name: 'Infosys Ltd.',
    sector: 'Information Technology',
    sectorId: 'it',
    price: 1642.80,
    change: 14.60,
    changePercent: 0.90,
    marketCap: 682000,
    volume: 11500000,
    avgVolume: 8200000,
    volumeRatio: 1.40,
    orderFlowIntensity: 71,
    orderFlowImbalance: 24.8,
    orderFlowDelta: 940000,
    buyVolume: 6220000,
    sellVolume: 5280000,
    volatilityPercentile: 61,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 1636.00,
    vwapDistancePct: 0.42,
    high24h: 1650.00,
    low24h: 1628.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '10/14 Bots: Bullish EMA 20/50 golden cross on 5m chart',
    opportunityTag: '⚡ Tech Breakout',
    l2Depth: {
      bids: [
        { price: 1642.50, qty: 12000, orders: 45 },
        { price: 1642.00, qty: 28000, orders: 92 },
        { price: 1641.50, qty: 34000, orders: 120 },
        { price: 1641.00, qty: 52000, orders: 165 },
        { price: 1640.00, qty: 78000, orders: 240 }
      ],
      asks: [
        { price: 1643.00, qty: 14500, orders: 54 },
        { price: 1643.50, qty: 21000, orders: 78 },
        { price: 1644.00, qty: 31000, orders: 105 },
        { price: 1645.00, qty: 62000, orders: 195 },
        { price: 1646.00, qty: 25000, orders: 84 }
      ]
    }
  },
  {
    symbol: 'HCLTECH',
    name: 'HCL Technologies',
    sector: 'Information Technology',
    sectorId: 'it',
    price: 1548.20,
    change: -18.40,
    changePercent: -1.17,
    marketCap: 420000,
    volume: 6200000,
    avgVolume: 4100000,
    volumeRatio: 1.51,
    orderFlowIntensity: 68,
    orderFlowImbalance: -32.5,
    orderFlowDelta: -740000,
    buyVolume: 2410000,
    sellVolume: 3790000,
    volatilityPercentile: 66,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 1558.00,
    vwapDistancePct: -0.63,
    high24h: 1572.00,
    low24h: 1541.00,
    jarvisSignal: 'SELL',
    jarvisConfluence: '9/14 Bots: Bearish breakdown below VWAP support',
    opportunityTag: '🔴 Short Pressure',
    l2Depth: {
      bids: [
        { price: 1548.00, qty: 6800, orders: 26 },
        { price: 1547.50, qty: 14200, orders: 55 },
        { price: 1547.00, qty: 22000, orders: 85 },
        { price: 1546.00, qty: 31000, orders: 110 },
        { price: 1545.00, qty: 45000, orders: 160 }
      ],
      asks: [
        { price: 1548.50, qty: 11200, orders: 42 },
        { price: 1549.00, qty: 26500, orders: 94 },
        { price: 1550.00, qty: 58000, orders: 190 },
        { price: 1551.00, qty: 34000, orders: 115 },
        { price: 1552.00, qty: 29000, orders: 98 }
      ]
    }
  },
  {
    symbol: 'WIPRO',
    name: 'Wipro Ltd.',
    sector: 'Information Technology',
    sectorId: 'it',
    price: 486.30,
    change: 4.10,
    changePercent: 0.85,
    marketCap: 254000,
    volume: 8900000,
    avgVolume: 7400000,
    volumeRatio: 1.20,
    orderFlowIntensity: 55,
    orderFlowImbalance: 14.0,
    orderFlowDelta: 310000,
    buyVolume: 4950000,
    sellVolume: 3950000,
    volatilityPercentile: 45,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 484.20,
    vwapDistancePct: 0.43,
    high24h: 490.50,
    low24h: 481.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '8/14 Bots: Low volatility base building',
    opportunityTag: '🟢 Value Base',
    l2Depth: {
      bids: [
        { price: 486.20, qty: 15000, orders: 48 },
        { price: 486.00, qty: 38000, orders: 110 },
        { price: 485.50, qty: 54000, orders: 165 },
        { price: 485.00, qty: 82000, orders: 240 },
        { price: 484.50, qty: 65000, orders: 180 }
      ],
      asks: [
        { price: 486.40, qty: 12000, orders: 39 },
        { price: 486.50, qty: 29000, orders: 88 },
        { price: 487.00, qty: 49000, orders: 145 },
        { price: 487.50, qty: 31000, orders: 95 },
        { price: 488.00, qty: 64000, orders: 195 }
      ]
    }
  },
  {
    symbol: 'PERSISTENT',
    name: 'Persistent Systems',
    sector: 'Information Technology',
    sectorId: 'it',
    price: 5410.00,
    change: 185.00,
    changePercent: 3.54,
    marketCap: 83000,
    volume: 1850000,
    avgVolume: 620000,
    volumeRatio: 2.98,
    orderFlowIntensity: 96,
    orderFlowImbalance: 71.5,
    orderFlowDelta: 480000,
    buyVolume: 1280000,
    sellVolume: 570000,
    volatilityPercentile: 95,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 5310.00,
    vwapDistancePct: 1.88,
    high24h: 5440.00,
    low24h: 5220.00,
    jarvisSignal: 'STRONG_BUY',
    jarvisConfluence: '14/14 Unanimous Bots: High-Beta Midcap IT Massive Breakout',
    opportunityTag: '⚡ High Volatility Order Flow Surge',
    l2Depth: {
      bids: [
        { price: 5408.00, qty: 2100, orders: 18 },
        { price: 5405.00, qty: 5400, orders: 42 },
        { price: 5400.00, qty: 12500, orders: 89 },
        { price: 5395.00, qty: 9800, orders: 65 },
        { price: 5390.00, qty: 18000, orders: 120 }
      ],
      asks: [
        { price: 5412.00, qty: 1400, orders: 12 },
        { price: 5415.00, qty: 2900, orders: 25 },
        { price: 5420.00, qty: 6200, orders: 48 },
        { price: 5425.00, qty: 4500, orders: 36 },
        { price: 5430.00, qty: 8900, orders: 67 }
      ]
    }
  },

  // Energy, Oil & Power
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd.',
    sector: 'Energy, Oil & Power',
    sectorId: 'energy',
    price: 2842.10,
    change: 25.10,
    changePercent: 0.89,
    marketCap: 1925000,
    volume: 12400000,
    avgVolume: 8900000,
    volumeRatio: 1.39,
    orderFlowIntensity: 78,
    orderFlowImbalance: 31.0,
    orderFlowDelta: 1250000,
    buyVolume: 7420000,
    sellVolume: 4980000,
    volatilityPercentile: 68,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 2831.50,
    vwapDistancePct: 0.37,
    high24h: 2855.00,
    low24h: 2814.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '11/14 Bots: Heavyweight anchor driving NIFTY upward index thrust',
    opportunityTag: '🔥 Heavyweight Accumulation',
    l2Depth: {
      bids: [
        { price: 2841.80, qty: 18000, orders: 55 },
        { price: 2841.00, qty: 35000, orders: 110 },
        { price: 2840.00, qty: 68000, orders: 195 },
        { price: 2838.00, qty: 44000, orders: 130 },
        { price: 2835.00, qty: 89000, orders: 280 }
      ],
      asks: [
        { price: 2842.40, qty: 12000, orders: 40 },
        { price: 2843.00, qty: 28000, orders: 85 },
        { price: 2844.00, qty: 36000, orders: 115 },
        { price: 2845.00, qty: 58000, orders: 175 },
        { price: 2846.00, qty: 24000, orders: 75 }
      ]
    }
  },
  {
    symbol: 'NTPC',
    name: 'NTPC Limited',
    sector: 'Energy, Oil & Power',
    sectorId: 'energy',
    price: 395.40,
    change: 8.90,
    changePercent: 2.30,
    marketCap: 383000,
    volume: 28000000,
    avgVolume: 12500000,
    volumeRatio: 2.24,
    orderFlowIntensity: 88,
    orderFlowImbalance: 49.0,
    orderFlowDelta: 3800000,
    buyVolume: 17400000,
    sellVolume: 10600000,
    volatilityPercentile: 84,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 390.20,
    vwapDistancePct: 1.33,
    high24h: 398.00,
    low24h: 384.50,
    jarvisSignal: 'STRONG_BUY',
    jarvisConfluence: '12/14 Bots: Power theme breakout with record green energy capex flow',
    opportunityTag: '⚡ Power Sector Squeeze',
    l2Depth: {
      bids: [
        { price: 395.20, qty: 52000, orders: 160 },
        { price: 395.00, qty: 110000, orders: 340 },
        { price: 394.50, qty: 85000, orders: 250 },
        { price: 394.00, qty: 140000, orders: 420 },
        { price: 393.50, qty: 95000, orders: 290 }
      ],
      asks: [
        { price: 395.50, qty: 28000, orders: 90 },
        { price: 395.80, qty: 39000, orders: 120 },
        { price: 396.00, qty: 78000, orders: 230 },
        { price: 396.50, qty: 45000, orders: 140 },
        { price: 397.00, qty: 92000, orders: 280 }
      ]
    }
  },
  {
    symbol: 'ONGC',
    name: 'Oil & Natural Gas Corp',
    sector: 'Energy, Oil & Power',
    sectorId: 'energy',
    price: 278.50,
    change: -4.20,
    changePercent: -1.49,
    marketCap: 350000,
    volume: 16500000,
    avgVolume: 14000000,
    volumeRatio: 1.18,
    orderFlowIntensity: 60,
    orderFlowImbalance: -28.0,
    orderFlowDelta: -1200000,
    buyVolume: 6600000,
    sellVolume: 9900000,
    volatilityPercentile: 59,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 281.00,
    vwapDistancePct: -0.89,
    high24h: 283.00,
    low24h: 277.10,
    jarvisSignal: 'SELL',
    jarvisConfluence: '9/14 Bots: Crude oil softening putting pressure on upstream earnings',
    opportunityTag: '🔴 Crude Drag',
    l2Depth: {
      bids: [
        { price: 278.40, qty: 22000, orders: 70 },
        { price: 278.00, qty: 65000, orders: 190 },
        { price: 277.50, qty: 48000, orders: 145 },
        { price: 277.00, qty: 85000, orders: 260 },
        { price: 276.50, qty: 54000, orders: 165 }
      ],
      asks: [
        { price: 278.60, qty: 34000, orders: 105 },
        { price: 279.00, qty: 78000, orders: 240 },
        { price: 279.50, qty: 52000, orders: 160 },
        { price: 280.00, qty: 110000, orders: 340 },
        { price: 280.50, qty: 68000, orders: 210 }
      ]
    }
  },
  {
    symbol: 'COALINDIA',
    name: 'Coal India Ltd.',
    sector: 'Energy, Oil & Power',
    sectorId: 'energy',
    price: 462.10,
    change: 6.80,
    changePercent: 1.49,
    marketCap: 284000,
    volume: 14000000,
    avgVolume: 10500000,
    volumeRatio: 1.33,
    orderFlowIntensity: 70,
    orderFlowImbalance: 22.0,
    orderFlowDelta: 850000,
    buyVolume: 8200000,
    sellVolume: 5800000,
    volatilityPercentile: 57,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 458.50,
    vwapDistancePct: 0.79,
    high24h: 465.00,
    low24h: 454.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '9/14 Bots: High dividend yield support with power peak dispatch',
    opportunityTag: '🟢 Value Momentum',
    l2Depth: {
      bids: [
        { price: 462.00, qty: 25000, orders: 78 },
        { price: 461.50, qty: 42000, orders: 130 },
        { price: 461.00, qty: 65000, orders: 195 },
        { price: 460.50, qty: 38000, orders: 115 },
        { price: 460.00, qty: 85000, orders: 260 }
      ],
      asks: [
        { price: 462.20, qty: 18000, orders: 55 },
        { price: 462.50, qty: 35000, orders: 110 },
        { price: 463.00, qty: 58000, orders: 175 },
        { price: 463.50, qty: 29000, orders: 90 },
        { price: 464.00, qty: 72000, orders: 220 }
      ]
    }
  },

  // Automotive & Mobility
  {
    symbol: 'TATAMOTORS',
    name: 'Tata Motors Ltd.',
    sector: 'Automotive & Mobility',
    sectorId: 'auto',
    price: 985.40,
    change: 28.60,
    changePercent: 2.99,
    marketCap: 362000,
    volume: 22400000,
    avgVolume: 8500000,
    volumeRatio: 2.64,
    orderFlowIntensity: 95,
    orderFlowImbalance: 66.8,
    orderFlowDelta: 4200000,
    buyVolume: 15400000,
    sellVolume: 7000000,
    volatilityPercentile: 94,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 968.00,
    vwapDistancePct: 1.80,
    high24h: 992.00,
    low24h: 952.00,
    jarvisSignal: 'STRONG_BUY',
    jarvisConfluence: '14/14 Unanimous Bots: Record JLR retail sales & EV market share spike',
    opportunityTag: '⚡ High Volatility EV Squeeze',
    l2Depth: {
      bids: [
        { price: 985.00, qty: 48000, orders: 145 },
        { price: 984.50, qty: 62000, orders: 190 },
        { price: 984.00, qty: 95000, orders: 290 },
        { price: 983.00, qty: 120000, orders: 380 },
        { price: 982.00, qty: 150000, orders: 460 }
      ],
      asks: [
        { price: 985.50, qty: 18000, orders: 58 },
        { price: 986.00, qty: 32000, orders: 98 },
        { price: 987.00, qty: 45000, orders: 140 },
        { price: 988.00, qty: 68000, orders: 210 },
        { price: 990.00, qty: 110000, orders: 350 }
      ]
    }
  },
  {
    symbol: 'MARUTI',
    name: 'Maruti Suzuki India',
    sector: 'Automotive & Mobility',
    sectorId: 'auto',
    price: 12480.00,
    change: 145.00,
    changePercent: 1.18,
    marketCap: 392000,
    volume: 980000,
    avgVolume: 820000,
    volumeRatio: 1.20,
    orderFlowIntensity: 67,
    orderFlowImbalance: 18.0,
    orderFlowDelta: 110000,
    buyVolume: 580000,
    sellVolume: 400000,
    volatilityPercentile: 59,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 12410.00,
    vwapDistancePct: 0.56,
    high24h: 12540.00,
    low24h: 12380.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '9/14 Bots: High cash reserve and export momentum',
    opportunityTag: '🟢 Large Cap Steady',
    l2Depth: {
      bids: [
        { price: 12475.00, qty: 1200, orders: 15 },
        { price: 12470.00, qty: 2800, orders: 34 },
        { price: 12460.00, qty: 4900, orders: 58 },
        { price: 12450.00, qty: 7800, orders: 92 },
        { price: 12440.00, qty: 11000, orders: 130 }
      ],
      asks: [
        { price: 12485.00, qty: 950, orders: 12 },
        { price: 12490.00, qty: 2100, orders: 26 },
        { price: 12500.00, qty: 5800, orders: 70 },
        { price: 12510.00, qty: 3400, orders: 42 },
        { price: 12520.00, qty: 6200, orders: 76 }
      ]
    }
  },
  {
    symbol: 'M&M',
    name: 'Mahindra & Mahindra',
    sector: 'Automotive & Mobility',
    sectorId: 'auto',
    price: 2940.00,
    change: 62.00,
    changePercent: 2.15,
    marketCap: 351000,
    volume: 5400000,
    avgVolume: 2800000,
    volumeRatio: 1.93,
    orderFlowIntensity: 89,
    orderFlowImbalance: 51.0,
    orderFlowDelta: 780000,
    buyVolume: 3450000,
    sellVolume: 1950000,
    volatilityPercentile: 82,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 2905.00,
    vwapDistancePct: 1.20,
    high24h: 2960.00,
    low24h: 2870.00,
    jarvisSignal: 'STRONG_BUY',
    jarvisConfluence: '13/14 Bots: SUV booking order backlog and farm equipment recovery',
    opportunityTag: '⚡ SUV Order Surge',
    l2Depth: {
      bids: [
        { price: 2939.00, qty: 5400, orders: 38 },
        { price: 2938.00, qty: 12800, orders: 82 },
        { price: 2935.00, qty: 24000, orders: 145 },
        { price: 2930.00, qty: 38000, orders: 210 },
        { price: 2925.00, qty: 52000, orders: 290 }
      ],
      asks: [
        { price: 2942.00, qty: 3800, orders: 25 },
        { price: 2945.00, qty: 8900, orders: 58 },
        { price: 2950.00, qty: 19500, orders: 120 },
        { price: 2955.00, qty: 14000, orders: 90 },
        { price: 2960.00, qty: 28000, orders: 175 }
      ]
    }
  },

  // Metals & Infrastructure
  {
    symbol: 'TATASTEEL',
    name: 'Tata Steel Ltd.',
    sector: 'Metals & Infrastructure',
    sectorId: 'metals',
    price: 154.20,
    change: 3.40,
    changePercent: 2.25,
    marketCap: 192000,
    volume: 48000000,
    avgVolume: 22000000,
    volumeRatio: 2.18,
    orderFlowIntensity: 90,
    orderFlowImbalance: 58.0,
    orderFlowDelta: 6800000,
    buyVolume: 32000000,
    sellVolume: 16000000,
    volatilityPercentile: 86,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 151.80,
    vwapDistancePct: 1.58,
    high24h: 155.50,
    low24h: 149.80,
    jarvisSignal: 'STRONG_BUY',
    jarvisConfluence: '12/14 Bots: Global steel price rebound and domestic infra demand spike',
    opportunityTag: '⚡ High Volatility Metal Squeeze',
    l2Depth: {
      bids: [
        { price: 154.10, qty: 120000, orders: 310 },
        { price: 154.00, qty: 280000, orders: 650 },
        { price: 153.80, qty: 195000, orders: 480 },
        { price: 153.50, qty: 350000, orders: 820 },
        { price: 153.00, qty: 480000, orders: 1100 }
      ],
      asks: [
        { price: 154.30, qty: 65000, orders: 180 },
        { price: 154.50, qty: 140000, orders: 390 },
        { price: 154.80, qty: 98000, orders: 270 },
        { price: 155.00, qty: 260000, orders: 720 },
        { price: 155.50, qty: 180000, orders: 490 }
      ]
    }
  },
  {
    symbol: 'LT',
    name: 'Larsen & Toubro Ltd.',
    sector: 'Metals & Infrastructure',
    sectorId: 'metals',
    price: 3680.00,
    change: 48.00,
    changePercent: 1.32,
    marketCap: 506000,
    volume: 3800000,
    avgVolume: 2900000,
    volumeRatio: 1.31,
    orderFlowIntensity: 76,
    orderFlowImbalance: 34.0,
    orderFlowDelta: 620000,
    buyVolume: 2350000,
    sellVolume: 1450000,
    volatilityPercentile: 69,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 3652.00,
    vwapDistancePct: 0.77,
    high24h: 3705.00,
    low24h: 3625.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '11/14 Bots: Massive order book execution in Middle East & domestic capex',
    opportunityTag: '🔥 Infra Order Surge',
    l2Depth: {
      bids: [
        { price: 3678.00, qty: 4500, orders: 28 },
        { price: 3675.00, qty: 11200, orders: 68 },
        { price: 3670.00, qty: 22000, orders: 130 },
        { price: 3665.00, qty: 16500, orders: 95 },
        { price: 3660.00, qty: 34000, orders: 190 }
      ],
      asks: [
        { price: 3682.00, qty: 3200, orders: 20 },
        { price: 3685.00, qty: 8500, orders: 52 },
        { price: 3690.00, qty: 14800, orders: 88 },
        { price: 3695.00, qty: 9800, orders: 60 },
        { price: 3700.00, qty: 26000, orders: 155 }
      ]
    }
  },
  {
    symbol: 'JSWSTEEL',
    name: 'JSW Steel Ltd.',
    sector: 'Metals & Infrastructure',
    sectorId: 'metals',
    price: 942.50,
    change: 18.20,
    changePercent: 1.97,
    marketCap: 231000,
    volume: 6800000,
    avgVolume: 4200000,
    volumeRatio: 1.62,
    orderFlowIntensity: 83,
    orderFlowImbalance: 42.0,
    orderFlowDelta: 1100000,
    buyVolume: 4400000,
    sellVolume: 2400000,
    volatilityPercentile: 79,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 932.00,
    vwapDistancePct: 1.13,
    high24h: 948.00,
    low24h: 922.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '10/14 Bots: Flat steel price hikes supporting margins',
    opportunityTag: '⚡ High Beta Metal',
    l2Depth: {
      bids: [
        { price: 942.00, qty: 8500, orders: 35 },
        { price: 941.50, qty: 18200, orders: 74 },
        { price: 941.00, qty: 29000, orders: 115 },
        { price: 940.00, qty: 45000, orders: 175 },
        { price: 939.00, qty: 38000, orders: 140 }
      ],
      asks: [
        { price: 943.00, qty: 6200, orders: 25 },
        { price: 943.50, qty: 14000, orders: 58 },
        { price: 944.00, qty: 22000, orders: 90 },
        { price: 945.00, qty: 39000, orders: 150 },
        { price: 946.00, qty: 18500, orders: 72 }
      ]
    }
  },

  // Pharma & Healthcare
  {
    symbol: 'SUNPHARMA',
    name: 'Sun Pharma Ltd.',
    sector: 'Pharma & Healthcare',
    sectorId: 'pharma',
    price: 1785.00,
    change: 12.50,
    changePercent: 0.71,
    marketCap: 428000,
    volume: 4500000,
    avgVolume: 3900000,
    volumeRatio: 1.15,
    orderFlowIntensity: 63,
    orderFlowImbalance: 19.5,
    orderFlowDelta: 380000,
    buyVolume: 2540000,
    sellVolume: 1960000,
    volatilityPercentile: 51,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 1776.00,
    vwapDistancePct: 0.51,
    high24h: 1795.00,
    low24h: 1768.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '9/14 Bots: Specialty pharma portfolio expansion in US markets',
    opportunityTag: '🟢 Defensive Growth',
    l2Depth: {
      bids: [
        { price: 1784.50, qty: 5400, orders: 22 },
        { price: 1784.00, qty: 12500, orders: 50 },
        { price: 1783.00, qty: 24000, orders: 92 },
        { price: 1782.00, qty: 18000, orders: 70 },
        { price: 1780.00, qty: 38000, orders: 145 }
      ],
      asks: [
        { price: 1785.50, qty: 4200, orders: 18 },
        { price: 1786.00, qty: 9800, orders: 40 },
        { price: 1787.00, qty: 16500, orders: 65 },
        { price: 1788.00, qty: 22000, orders: 88 },
        { price: 1790.00, qty: 41000, orders: 160 }
      ]
    }
  },
  {
    symbol: 'CIPLA',
    name: 'Cipla Limited',
    sector: 'Pharma & Healthcare',
    sectorId: 'pharma',
    price: 1542.00,
    change: -24.50,
    changePercent: -1.56,
    marketCap: 124000,
    volume: 5100000,
    avgVolume: 2800000,
    volumeRatio: 1.82,
    orderFlowIntensity: 79,
    orderFlowImbalance: -48.5,
    orderFlowDelta: -980000,
    buyVolume: 1620000,
    sellVolume: 3480000,
    volatilityPercentile: 78,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 1558.00,
    vwapDistancePct: -1.03,
    high24h: 1574.00,
    low24h: 1536.00,
    jarvisSignal: 'SELL',
    jarvisConfluence: '11/14 Bots: Heavy institutional unloading below support line',
    opportunityTag: '⚠️ Heavy Distribution',
    l2Depth: {
      bids: [
        { price: 1541.50, qty: 4800, orders: 20 },
        { price: 1541.00, qty: 9500, orders: 42 },
        { price: 1540.00, qty: 22000, orders: 88 },
        { price: 1538.00, qty: 16000, orders: 64 },
        { price: 1535.00, qty: 35000, orders: 135 }
      ],
      asks: [
        { price: 1542.50, qty: 11000, orders: 45 },
        { price: 1543.00, qty: 24000, orders: 90 },
        { price: 1544.00, qty: 38000, orders: 140 },
        { price: 1545.00, qty: 52000, orders: 190 },
        { price: 1547.00, qty: 29000, orders: 105 }
      ]
    }
  },

  // FMCG & Consumer Goods
  {
    symbol: 'ITC',
    name: 'ITC Limited',
    sector: 'FMCG & Consumer Goods',
    sectorId: 'fmcg',
    price: 492.30,
    change: 5.80,
    changePercent: 1.19,
    marketCap: 615000,
    volume: 24000000,
    avgVolume: 18000000,
    volumeRatio: 1.33,
    orderFlowIntensity: 72,
    orderFlowImbalance: 26.0,
    orderFlowDelta: 2400000,
    buyVolume: 14200000,
    sellVolume: 9800000,
    volatilityPercentile: 58,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 489.10,
    vwapDistancePct: 0.65,
    high24h: 495.00,
    low24h: 485.50,
    jarvisSignal: 'BUY',
    jarvisConfluence: '10/14 Bots: High dividend support & hotel business demerger unlock',
    opportunityTag: '🟢 Value Momentum',
    l2Depth: {
      bids: [
        { price: 492.20, qty: 45000, orders: 120 },
        { price: 492.00, qty: 98000, orders: 280 },
        { price: 491.50, qty: 145000, orders: 410 },
        { price: 491.00, qty: 180000, orders: 520 },
        { price: 490.50, qty: 125000, orders: 360 }
      ],
      asks: [
        { price: 492.40, qty: 32000, orders: 90 },
        { price: 492.50, qty: 74000, orders: 210 },
        { price: 493.00, qty: 110000, orders: 320 },
        { price: 493.50, qty: 65000, orders: 185 },
        { price: 494.00, qty: 140000, orders: 410 }
      ]
    }
  },
  {
    symbol: 'HINDUNILVR',
    name: 'Hindustan Unilever Ltd.',
    sector: 'FMCG & Consumer Goods',
    sectorId: 'fmcg',
    price: 2480.00,
    change: -15.00,
    changePercent: -0.60,
    marketCap: 582000,
    volume: 3400000,
    avgVolume: 2900000,
    volumeRatio: 1.17,
    orderFlowIntensity: 58,
    orderFlowImbalance: -16.0,
    orderFlowDelta: -320000,
    buyVolume: 1540000,
    sellVolume: 1860000,
    volatilityPercentile: 46,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 2492.00,
    vwapDistancePct: -0.48,
    high24h: 2505.00,
    low24h: 2470.00,
    jarvisSignal: 'NEUTRAL',
    jarvisConfluence: '7/14 Bots: Rural demand gradual recovery in progress',
    opportunityTag: '🌊 Defensive Range',
    l2Depth: {
      bids: [
        { price: 2479.50, qty: 3200, orders: 18 },
        { price: 2478.00, qty: 8500, orders: 45 },
        { price: 2475.00, qty: 19000, orders: 95 },
        { price: 2472.00, qty: 14000, orders: 68 },
        { price: 2470.00, qty: 28000, orders: 135 }
      ],
      asks: [
        { price: 2481.00, qty: 4500, orders: 24 },
        { price: 2482.00, qty: 11200, orders: 58 },
        { price: 2485.00, qty: 22000, orders: 110 },
        { price: 2488.00, qty: 16500, orders: 82 },
        { price: 2490.00, qty: 32000, orders: 160 }
      ]
    }
  },

  // Indices & Derivatives
  {
    symbol: 'NIFTY 50',
    name: 'NIFTY 50 Index (Underlying)',
    sector: 'Indices & F&O Derivatives',
    sectorId: 'derivatives',
    price: 25146.30,
    change: 105.20,
    changePercent: 0.42,
    marketCap: 18500000,
    volume: 185000000,
    avgVolume: 140000000,
    volumeRatio: 1.32,
    orderFlowIntensity: 85,
    orderFlowImbalance: 34.0,
    orderFlowDelta: 12500000,
    buyVolume: 108500000,
    sellVolume: 76500000,
    volatilityPercentile: 68,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 25095.00,
    vwapDistancePct: 0.20,
    high24h: 25180.00,
    low24h: 25010.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '11/14 Bots: Master Quorum positive index breadth (>68% advancing)',
    opportunityTag: '🏛️ Benchmark Momentum',
    l2Depth: {
      bids: [
        { price: 25145.00, qty: 54000, orders: 280 },
        { price: 25140.00, qty: 112000, orders: 540 },
        { price: 25135.00, qty: 95000, orders: 460 },
        { price: 25130.00, qty: 180000, orders: 820 },
        { price: 25120.00, qty: 240000, orders: 1150 }
      ],
      asks: [
        { price: 25147.00, qty: 42000, orders: 210 },
        { price: 25150.00, qty: 125000, orders: 610 },
        { price: 25155.00, qty: 89000, orders: 430 },
        { price: 25160.00, qty: 140000, orders: 690 },
        { price: 25170.00, qty: 195000, orders: 940 }
      ]
    }
  },
  {
    symbol: 'BANK NIFTY',
    name: 'Bank NIFTY Index (F&O)',
    sector: 'Indices & F&O Derivatives',
    sectorId: 'derivatives',
    price: 57812.45,
    change: 178.60,
    changePercent: 0.31,
    marketCap: 9400000,
    volume: 92000000,
    avgVolume: 70000000,
    volumeRatio: 1.31,
    orderFlowIntensity: 84,
    orderFlowImbalance: 28.5,
    orderFlowDelta: 6800000,
    buyVolume: 53500000,
    sellVolume: 38500000,
    volatilityPercentile: 74,
    isHighVolatility: false,
    isOrderFlowSpike: false,
    vwap: 57720.00,
    vwapDistancePct: 0.16,
    high24h: 57920.00,
    low24h: 57580.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '10/14 Bots: Banking index absorbing profit booking cleanly',
    opportunityTag: '🏛️ Banking Breadth',
    l2Depth: {
      bids: [
        { price: 57810.00, qty: 28000, orders: 140 },
        { price: 57800.00, qty: 65000, orders: 310 },
        { price: 57790.00, qty: 49000, orders: 240 },
        { price: 57780.00, qty: 95000, orders: 450 },
        { price: 57750.00, qty: 140000, orders: 670 }
      ],
      asks: [
        { price: 57815.00, qty: 22000, orders: 110 },
        { price: 57820.00, qty: 54000, orders: 260 },
        { price: 57830.00, qty: 41000, orders: 200 },
        { price: 57850.00, qty: 88000, orders: 420 },
        { price: 57870.00, qty: 110000, orders: 530 }
      ]
    }
  },
  {
    symbol: 'GOLD MCX',
    name: 'Gold Micro (MCX Bullion)',
    sector: 'Indices & F&O Derivatives',
    sectorId: 'derivatives',
    price: 78450.00,
    change: 495.00,
    changePercent: 0.63,
    marketCap: 4500000,
    volume: 185000,
    avgVolume: 140000,
    volumeRatio: 1.32,
    orderFlowIntensity: 87,
    orderFlowImbalance: 39.0,
    orderFlowDelta: 18000,
    buyVolume: 112000,
    sellVolume: 73000,
    volatilityPercentile: 81,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 78150.00,
    vwapDistancePct: 0.38,
    high24h: 78620.00,
    low24h: 77950.00,
    jarvisSignal: 'BUY',
    jarvisConfluence: '11/14 Bots: Macro bullion flight to quality & geopolitical hedge',
    opportunityTag: '⚡ Macro Commodity Squeeze',
    l2Depth: {
      bids: [
        { price: 78440.00, qty: 180, orders: 14 },
        { price: 78430.00, qty: 420, orders: 32 },
        { price: 78400.00, qty: 850, orders: 65 },
        { price: 78380.00, qty: 620, orders: 48 },
        { price: 78350.00, qty: 1200, orders: 90 }
      ],
      asks: [
        { price: 78460.00, qty: 140, orders: 11 },
        { price: 78470.00, qty: 380, orders: 29 },
        { price: 78500.00, qty: 920, orders: 70 },
        { price: 78520.00, qty: 540, orders: 41 },
        { price: 78550.00, qty: 1100, orders: 85 }
      ]
    }
  },
  {
    symbol: 'CRUDEOIL MCX',
    name: 'Crude Oil (MCX Energy)',
    sector: 'Indices & F&O Derivatives',
    sectorId: 'derivatives',
    price: 6240.00,
    change: -168.00,
    changePercent: -2.62,
    marketCap: 3800000,
    volume: 320000,
    avgVolume: 180000,
    volumeRatio: 1.78,
    orderFlowIntensity: 92,
    orderFlowImbalance: -59.0,
    orderFlowDelta: -54000,
    buyVolume: 98000,
    sellVolume: 222000,
    volatilityPercentile: 91,
    isHighVolatility: true,
    isOrderFlowSpike: true,
    vwap: 6310.00,
    vwapDistancePct: -1.11,
    high24h: 6415.00,
    low24h: 6210.00,
    jarvisSignal: 'STRONG_SELL',
    jarvisConfluence: '13/14 Bots: Global inventory build trigger breakdown in energy',
    opportunityTag: '⚡ High Volatility Flash Drop',
    l2Depth: {
      bids: [
        { price: 6238.00, qty: 240, orders: 18 },
        { price: 6235.00, qty: 580, orders: 42 },
        { price: 6230.00, qty: 1100, orders: 75 },
        { price: 6225.00, qty: 850, orders: 60 },
        { price: 6220.00, qty: 1600, orders: 110 }
      ],
      asks: [
        { price: 6242.00, qty: 450, orders: 32 },
        { price: 6245.00, qty: 980, orders: 70 },
        { price: 6250.00, qty: 1850, orders: 130 },
        { price: 6255.00, qty: 1200, orders: 85 },
        { price: 6260.00, qty: 2400, orders: 170 }
      ]
    }
  }
];

// Helper to calculate sector summaries
export function calculateSectorSummaries(items: HeatmapItem[]): SectorSummary[] {
  return INITIAL_SECTORS.map((sec) => {
    const secItems = items.filter((it) => it.sectorId === sec.id);
    if (secItems.length === 0) {
      return {
        id: sec.id,
        name: sec.name,
        avgChangePercent: 0,
        totalMarketCap: 0,
        totalVolume: 0,
        avgOrderFlowIntensity: 50,
        netOrderFlowImbalance: 0,
        highVolatilityCount: 0,
        orderFlowSpikeCount: 0,
        itemCount: 0,
        sentiment: 'NEUTRAL'
      };
    }

    const totalCap = secItems.reduce((acc, curr) => acc + curr.marketCap, 0);
    // Weighted change percent by market cap
    const weightedChange = secItems.reduce((acc, curr) => acc + (curr.changePercent * (curr.marketCap / totalCap)), 0);
    const totalVol = secItems.reduce((acc, curr) => acc + curr.volume, 0);
    const avgIntensity = Math.round(secItems.reduce((acc, curr) => acc + curr.orderFlowIntensity, 0) / secItems.length);
    const avgImbalance = Number((secItems.reduce((acc, curr) => acc + curr.orderFlowImbalance, 0) / secItems.length).toFixed(1));
    const highVolCount = secItems.filter((i) => i.isHighVolatility).length;
    const spikeCount = secItems.filter((i) => i.isOrderFlowSpike).length;

    let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (weightedChange > 0.4 || avgImbalance > 15) sentiment = 'BULLISH';
    else if (weightedChange < -0.4 || avgImbalance < -15) sentiment = 'BEARISH';

    return {
      id: sec.id,
      name: sec.name,
      avgChangePercent: Number(weightedChange.toFixed(2)),
      totalMarketCap: totalCap,
      totalVolume: totalVol,
      avgOrderFlowIntensity: avgIntensity,
      netOrderFlowImbalance: avgImbalance,
      highVolatilityCount: highVolCount,
      orderFlowSpikeCount: spikeCount,
      itemCount: secItems.length,
      sentiment
    };
  });
}

// Helper to assemble full market heatmap payload
export function generateHeatmapPayload(items: HeatmapItem[] = INITIAL_HEATMAP_DATA): HeatmapPayload {
  const sectors = calculateSectorSummaries(items);
  const advances = items.filter((i) => i.changePercent > 0).length;
  const declines = items.filter((i) => i.changePercent < 0).length;
  const neutral = items.length - advances - declines;
  const highVolCount = items.filter((i) => i.isHighVolatility).length;
  const spikeCount = items.filter((i) => i.isOrderFlowSpike).length;
  const avgVol = Math.round(items.reduce((acc, i) => acc + i.volatilityPercentile, 0) / Math.max(1, items.length));

  const sortedGainers = [...items].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3).map((i) => `${i.symbol} (+${i.changePercent}%)`);
  const sortedLosers = [...items].sort((a, b) => a.changePercent - b.changePercent).slice(0, 3).map((i) => `${i.symbol} (${i.changePercent}%)`);
  const sortedSpikes = [...items].sort((a, b) => b.orderFlowIntensity - a.orderFlowIntensity).slice(0, 3).map((i) => `${i.symbol} (${i.orderFlowIntensity}/100)`);

  return {
    timestamp: Date.now(),
    marketSummary: {
      totalTurnoverCr: 48920,
      advances,
      declines,
      neutral,
      avgVolatilityIndex: avgVol,
      highVolatilityCount: highVolCount,
      orderFlowSpikeCount: spikeCount,
      topGainers: sortedGainers,
      topLosers: sortedLosers,
      topOrderFlowSpikes: sortedSpikes
    },
    sectors,
    items
  };
}

// In-memory simulation state
let currentHeatmapState: HeatmapItem[] = JSON.parse(JSON.stringify(INITIAL_HEATMAP_DATA));

export function getLatestHeatmap(): HeatmapPayload {
  return generateHeatmapPayload(currentHeatmapState);
}

// Periodic live jitter function simulating realistic order flow ticks
export function tickHeatmapSimulation(): HeatmapPayload {
  currentHeatmapState = currentHeatmapState.map((item) => {
    // Random subtle price jitter (-0.15% to +0.15%)
    const pctDelta = (Math.random() - 0.48) * 0.18;
    const priceMove = Number((item.price * (pctDelta / 100)).toFixed(2));
    const newPrice = Math.max(1, Number((item.price + priceMove).toFixed(2)));
    const newChange = Number((item.change + priceMove).toFixed(2));
    const newChangePercent = Number(((newChange / (newPrice - newChange)) * 100).toFixed(2));

    // Order flow intensity subtle drift
    const intensityDrift = Math.floor((Math.random() - 0.5) * 4);
    const newIntensity = Math.max(10, Math.min(99, item.orderFlowIntensity + intensityDrift));

    // Order flow imbalance drift
    const imbalanceDrift = Number(((Math.random() - 0.48) * 3).toFixed(1));
    const newImbalance = Math.max(-95, Math.min(95, Number((item.orderFlowImbalance + imbalanceDrift).toFixed(1))));

    // Volatility percentile drift
    const volDrift = Math.floor((Math.random() - 0.49) * 2);
    const newVolPct = Math.max(20, Math.min(99, item.volatilityPercentile + volDrift));

    const isHighVolatility = newVolPct >= 75 || Math.abs(newChangePercent) >= 2.0;
    const isOrderFlowSpike = newIntensity >= 80 || Math.abs(newImbalance) >= 40;

    // Jitter L2 Depth slightly
    const bids = item.l2Depth.bids.map((b, idx) => ({
      price: Number((newPrice - (idx + 1) * (newPrice * 0.0003)).toFixed(2)),
      qty: Math.max(500, Math.round(b.qty + (Math.random() - 0.5) * 1200)),
      orders: Math.max(5, Math.round(b.orders + (Math.random() - 0.5) * 6))
    }));
    const asks = item.l2Depth.asks.map((a, idx) => ({
      price: Number((newPrice + (idx + 1) * (newPrice * 0.0003)).toFixed(2)),
      qty: Math.max(500, Math.round(a.qty + (Math.random() - 0.5) * 1200)),
      orders: Math.max(5, Math.round(a.orders + (Math.random() - 0.5) * 6))
    }));

    return {
      ...item,
      price: newPrice,
      change: newChange,
      changePercent: newChangePercent,
      orderFlowIntensity: newIntensity,
      orderFlowImbalance: newImbalance,
      volatilityPercentile: newVolPct,
      isHighVolatility,
      isOrderFlowSpike,
      high24h: Math.max(item.high24h, newPrice),
      low24h: Math.min(item.low24h, newPrice),
      l2Depth: { bids, asks }
    };
  });

  return generateHeatmapPayload(currentHeatmapState);
}

// Inject Volatility Shock
export function injectHeatmapShock(type: 'BULL_SURGE' | 'BEAR_CRASH' | 'VOLATILITY_BURST' | 'ORDER_FLOW_SQUEEZE'): HeatmapPayload {
  currentHeatmapState = currentHeatmapState.map((item) => {
    let shockChange = 0;
    let shockIntensity = item.orderFlowIntensity;
    let shockImbalance = item.orderFlowImbalance;
    let shockVol = item.volatilityPercentile;

    switch (type) {
      case 'BULL_SURGE':
        shockChange = (Math.random() * 2.2 + 1.2);
        shockIntensity = Math.min(99, item.orderFlowIntensity + 20);
        shockImbalance = Math.min(95, item.orderFlowImbalance + 35);
        shockVol = Math.min(99, item.volatilityPercentile + 15);
        break;
      case 'BEAR_CRASH':
        shockChange = -(Math.random() * 2.8 + 1.5);
        shockIntensity = Math.min(99, item.orderFlowIntensity + 25);
        shockImbalance = Math.max(-95, item.orderFlowImbalance - 45);
        shockVol = Math.min(99, item.volatilityPercentile + 25);
        break;
      case 'VOLATILITY_BURST':
        shockChange = (Math.random() - 0.5) * 4.5;
        shockIntensity = Math.min(99, item.orderFlowIntensity + 30);
        shockVol = Math.min(99, item.volatilityPercentile + 35);
        break;
      case 'ORDER_FLOW_SQUEEZE':
        shockChange = (Math.random() * 3.0 + 1.8);
        shockIntensity = 98;
        shockImbalance = 85;
        shockVol = 92;
        break;
    }

    const priceMove = Number((item.price * (shockChange / 100)).toFixed(2));
    const newPrice = Math.max(1, Number((item.price + priceMove).toFixed(2)));
    const newChange = Number((item.change + priceMove).toFixed(2));
    const newChangePercent = Number(((newChange / (newPrice - newChange)) * 100).toFixed(2));

    return {
      ...item,
      price: newPrice,
      change: newChange,
      changePercent: newChangePercent,
      orderFlowIntensity: shockIntensity,
      orderFlowImbalance: shockImbalance,
      volatilityPercentile: shockVol,
      isHighVolatility: shockVol >= 75 || Math.abs(newChangePercent) >= 2.0,
      isOrderFlowSpike: shockIntensity >= 80 || Math.abs(shockImbalance) >= 40,
      high24h: Math.max(item.high24h, newPrice),
      low24h: Math.min(item.low24h, newPrice)
    };
  });

  return generateHeatmapPayload(currentHeatmapState);
}
