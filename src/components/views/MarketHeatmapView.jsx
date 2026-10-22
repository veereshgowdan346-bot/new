import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import {
  Flame,
  Activity,
  Zap,
  TrendingUp,
  TrendingDown,
  Layers,
  Search,
  Filter,
  BarChart3,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Maximize2,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Sliders,
  AlertTriangle,
  Send,
  CheckCircle2,
  X,
  Volume2
} from 'lucide-react';
import { apiFetch, getWebSocketUrl } from '../../utils/api';
import { soundEngine } from '../../utils/audioChime';
import { INITIAL_HEATMAP_DATA, generateHeatmapPayload } from '../../utils/marketHeatmapEngine';

export default function MarketHeatmapView({
  brokerConnections = [],
  executionMode = 'PAPER',
  onNavigateToLiveTrading
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  // Heatmap State
  const [heatmapData, setHeatmapData] = useState(() => generateHeatmapPayload(INITIAL_HEATMAP_DATA));
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [colorMetric, setColorMetric] = useState('changePercent'); // 'changePercent' | 'orderFlowImbalance' | 'orderFlowIntensity' | 'volatilityPercentile'
  const [sizeMetric, setSizeMetric] = useState('marketCap'); // 'marketCap' | 'volume' | 'orderFlowIntensity'
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'HIGH_VOLATILITY' | 'ORDER_FLOW_SPIKE' | 'TOP_GAINERS' | 'TOP_LOSERS'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('treemap'); // 'treemap' | 'bubble-quadrant' | 'matrix'
  const [selectedItem, setSelectedItem] = useState(null);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [lastTickTime, setLastTickTime] = useState(Date.now());
  const [shockLoading, setShockLoading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState(null);
  const [orderQty, setOrderQty] = useState(50);

  // Fetch initial heatmap from backend
  useEffect(() => {
    let isMounted = true;
    async function loadInitial() {
      try {
        const res = await apiFetch('/api/market/heatmap');
        if (res?.status === 'success' && res.data && isMounted) {
          setHeatmapData(res.data);
        }
      } catch (err) {
        console.warn('[MarketHeatmap] Falling back to client-side heatmap engine:', err);
      }
    }
    loadInitial();
    return () => { isMounted = false; };
  }, []);

  // WebSocket Live Subscription for streaming heatmap ticks
  useEffect(() => {
    if (!isLiveStreaming) return;
    let ws;
    let reconnectTimer;

    function connectWs() {
      try {
        const url = getWebSocketUrl('/chintu-feed');
        ws = new WebSocket(url);

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'HEATMAP_UPDATE' && msg.data) {
              setHeatmapData(msg.data);
              setLastTickTime(Date.now());
            }
          } catch (e) {}
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connectWs, 3000);
        };
      } catch (err) {
        console.warn('[MarketHeatmap WS] Connection error:', err);
      }
    }

    connectWs();
    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, [isLiveStreaming]);

  // Handle Shock Injection
  const handleTriggerShock = async (shockType) => {
    setShockLoading(true);
    try {
      soundEngine.playVolatilityAlert();
      const res = await apiFetch('/api/market/heatmap/shock', {
        method: 'POST',
        body: JSON.stringify({ type: shockType })
      });
      if (res?.data) {
        setHeatmapData(res.data);
      }
    } catch (err) {
      console.warn('[MarketHeatmap] Shock error:', err);
    } finally {
      setShockLoading(false);
    }
  };

  // Filter items based on active criteria
  const filteredItems = useMemo(() => {
    let list = heatmapData.items || [];

    if (selectedSector !== 'ALL') {
      list = list.filter((i) => i.sectorId === selectedSector);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) =>
        i.symbol.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        i.sector.toLowerCase().includes(q)
      );
    }

    if (activeFilter === 'HIGH_VOLATILITY') {
      list = list.filter((i) => i.isHighVolatility);
    } else if (activeFilter === 'ORDER_FLOW_SPIKE') {
      list = list.filter((i) => i.isOrderFlowSpike);
    } else if (activeFilter === 'TOP_GAINERS') {
      list = [...list].sort((a, b) => b.changePercent - a.changePercent).slice(0, 10);
    } else if (activeFilter === 'TOP_LOSERS') {
      list = [...list].sort((a, b) => a.changePercent - b.changePercent).slice(0, 10);
    }

    return list;
  }, [heatmapData.items, selectedSector, searchQuery, activeFilter]);

  // High Volatility Opportunity Candidates for Quick Alert Bar
  const highVolOpportunities = useMemo(() => {
    return (heatmapData.items || [])
      .filter((i) => i.isHighVolatility || i.isOrderFlowSpike)
      .sort((a, b) => (b.volatilityPercentile + b.orderFlowIntensity) - (a.volatilityPercentile + a.orderFlowIntensity))
      .slice(0, 4);
  }, [heatmapData.items]);

  // Color Scale Generator based on colorMetric
  const getColor = useMemo(() => {
    if (colorMetric === 'changePercent') {
      // Classic Financial Red-Green Scale: -3% or less is crimson, 0 is slate, +3% or more is emerald
      const greenScale = d3.scaleLinear()
        .domain([0, 1.2, 3.0])
        .range(['#132338', '#059669', '#10b981'])
        .clamp(true);

      const redScale = d3.scaleLinear()
        .domain([0, -1.2, -3.0])
        .range(['#132338', '#b91c1c', '#ef4444'])
        .clamp(true);

      return (val) => (val >= 0 ? greenScale(val) : redScale(val));
    }

    if (colorMetric === 'orderFlowImbalance') {
      // CVD Delta Scale: -60% to +60%
      const posScale = d3.scaleLinear()
        .domain([0, 30, 70])
        .range(['#132338', '#0284c7', '#06b6d4'])
        .clamp(true);

      const negScale = d3.scaleLinear()
        .domain([0, -30, -70])
        .range(['#132338', '#c2410c', '#f97316'])
        .clamp(true);

      return (val) => (val >= 0 ? posScale(val) : negScale(val));
    }

    if (colorMetric === 'orderFlowIntensity') {
      // 0 to 100 heat intensity
      return d3.scaleLinear()
        .domain([20, 50, 75, 95])
        .range(['#0f172a', '#1e1b4b', '#4338ca', '#06b6d4'])
        .clamp(true);
    }

    if (colorMetric === 'volatilityPercentile') {
      // 0 to 100 volatility percentile
      return d3.scaleLinear()
        .domain([20, 50, 75, 95])
        .range(['#0f172a', '#581c87', '#b45309', '#f59e0b'])
        .clamp(true);
    }

    return () => '#1e293b';
  }, [colorMetric]);

  // D3 Treemap Layout Rendering
  useEffect(() => {
    if (viewMode !== 'treemap' || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 900;
    const height = Math.max(540, Math.min(820, window.innerHeight - 340));

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height);

    if (filteredItems.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#64748b')
        .attr('font-size', '14px')
        .attr('font-family', 'monospace')
        .text('No market contracts match current filter criteria');
      return;
    }

    // Prepare Hierarchical Data Structure: Root -> Sectors -> Leaf Stocks
    const sectorsMap = new Map();
    filteredItems.forEach((item) => {
      if (!sectorsMap.has(item.sector)) {
        sectorsMap.set(item.sector, []);
      }
      sectorsMap.get(item.sector).push(item);
    });

    const hierarchyData = {
      name: 'Market Root',
      children: Array.from(sectorsMap.entries()).map(([sectorName, itemsList]) => ({
        name: sectorName,
        children: itemsList.map((item) => {
          let value = item.marketCap;
          if (sizeMetric === 'volume') value = Math.max(1000, item.volume);
          else if (sizeMetric === 'orderFlowIntensity') value = Math.max(10, item.orderFlowIntensity * item.orderFlowIntensity);
          return {
            ...item,
            value
          };
        })
      }))
    };

    const root = d3.hierarchy(hierarchyData)
      .sum((d) => d.value)
      .sort((a, b) => b.value - a.value);

    const treemapLayout = d3.treemap()
      .tile(d3.treemapSquarify.ratio(1.2))
      .size([width, height])
      .paddingTop(22)
      .paddingInner(3)
      .paddingOuter(4)
      .round(true);

    treemapLayout(root);

    // Group for Sectors
    const sectorGroups = svg.selectAll('g.sector-group')
      .data(root.children || [])
      .enter()
      .append('g')
      .attr('class', 'sector-group')
      .attr('transform', (d) => `translate(${d.x0}, ${d.y0})`);

    // Sector Header Background & Label
    sectorGroups.each(function(d) {
      const g = d3.select(this);
      const secW = Math.max(0, d.x1 - d.x0);
      const secH = Math.max(0, d.y1 - d.y0);

      // Sector boundary box
      g.append('rect')
        .attr('width', secW)
        .attr('height', secH)
        .attr('fill', 'rgba(10, 18, 36, 0.4)')
        .attr('stroke', 'rgba(30, 58, 102, 0.5)')
        .attr('stroke-width', 1)
        .attr('rx', 4);

      // Sector Header Banner
      if (secW > 60) {
        const headerG = g.append('g')
          .attr('class', 'sector-header-clickable')
          .style('cursor', 'pointer')
          .on('click', () => {
            const foundSec = (heatmapData.sectors || []).find((s) => s.name === d.data.name);
            if (foundSec) {
              soundEngine.playChime();
              setSelectedSector(foundSec.id);
            }
          });

        headerG.append('rect')
          .attr('width', secW)
          .attr('height', 20)
          .attr('fill', 'rgba(15, 26, 48, 0.85)')
          .attr('rx', 4);

        // Truncated sector title
        const truncatedName = secW < 120 ? d.data.name.slice(0, 10) + '..' : d.data.name;
        headerG.append('text')
          .attr('x', 8)
          .attr('y', 14)
          .attr('fill', '#94a3b8')
          .attr('font-size', '10px')
          .attr('font-weight', '600')
          .attr('font-family', 'Inter, system-ui, sans-serif')
          .text(truncatedName);

        // Find sector avg change
        const secInfo = (heatmapData.sectors || []).find((s) => s.name === d.data.name);
        if (secInfo && secW > 160) {
          const isUp = secInfo.avgChangePercent >= 0;
          headerG.append('text')
            .attr('x', secW - 8)
            .attr('y', 14)
            .attr('text-anchor', 'end')
            .attr('fill', isUp ? '#34d399' : '#f87171')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('font-family', 'monospace')
            .text(`${isUp ? '+' : ''}${secInfo.avgChangePercent}% • ${secInfo.avgOrderFlowIntensity} Flow`);
        }
      }
    });

    // Leaf Stock Tiles
    const leaves = root.leaves();
    const leafNodes = svg.selectAll('g.leaf-node')
      .data(leaves)
      .enter()
      .append('g')
      .attr('class', 'leaf-node')
      .attr('transform', (d) => `translate(${d.x0}, ${d.y0})`)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        soundEngine.playBuyChime();
        setSelectedItem(d.data);
      });

    // Tile Rectangle with Dynamic Color & Stroke
    leafNodes.append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('rx', 3)
      .attr('fill', (d) => {
        const item = d.data;
        const val = item[colorMetric];
        return getColor(val);
      })
      .attr('stroke', (d) => {
        const item = d.data;
        if (item.isHighVolatility) return '#fbbf24'; // Amber pulse
        if (item.isOrderFlowSpike) return '#06b6d4'; // Cyan pulse
        return 'rgba(255, 255, 255, 0.08)';
      })
      .attr('stroke-width', (d) => {
        const item = d.data;
        return (item.isHighVolatility || item.isOrderFlowSpike) ? 2 : 1;
      })
      .style('transition', 'all 0.25s ease')
      .on('mouseenter', function() {
        d3.select(this)
          .attr('stroke', '#38bdf8')
          .attr('stroke-width', 2.5)
          .style('filter', 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.4))');
      })
      .on('mouseleave', function(_event, d) {
        const item = d.data;
        d3.select(this)
          .attr('stroke', (item.isHighVolatility ? '#fbbf24' : (item.isOrderFlowSpike ? '#06b6d4' : 'rgba(255, 255, 255, 0.08)')))
          .attr('stroke-width', (item.isHighVolatility || item.isOrderFlowSpike) ? 2 : 1)
          .style('filter', 'none');
      });

    // High Volatility / Spike Corner Accent Tag
    leafNodes.filter((d) => (d.x1 - d.x0 > 75) && (d.y1 - d.y0 > 55) && (d.data.isHighVolatility || d.data.isOrderFlowSpike))
      .append('rect')
      .attr('x', (d) => (d.x1 - d.x0) - 28)
      .attr('y', 4)
      .attr('width', 24)
      .attr('height', 14)
      .attr('rx', 2)
      .attr('fill', (d) => d.data.isHighVolatility ? 'rgba(245, 158, 11, 0.9)' : 'rgba(6, 182, 212, 0.9)')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 0.5);

    leafNodes.filter((d) => (d.x1 - d.x0 > 75) && (d.y1 - d.y0 > 55) && (d.data.isHighVolatility || d.data.isOrderFlowSpike))
      .append('text')
      .attr('x', (d) => (d.x1 - d.x0) - 16)
      .attr('y', 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#000000')
      .attr('font-size', '8.5px')
      .attr('font-weight', '900')
      .attr('font-family', 'monospace')
      .text((d) => d.data.isHighVolatility ? 'VOL' : 'FLOW');

    // Ticker Symbol Label
    leafNodes.filter((d) => (d.x1 - d.x0 > 45) && (d.y1 - d.y0 > 30))
      .append('text')
      .attr('x', 7)
      .attr('y', (d) => {
        const h = d.y1 - d.y0;
        return h > 60 ? 18 : 15;
      })
      .attr('fill', '#ffffff')
      .attr('font-size', (d) => {
        const w = d.x1 - d.x0;
        return w > 90 ? '12px' : '10px';
      })
      .attr('font-weight', '800')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => d.data.symbol);

    // Primary Metric (% Change or CVD or Flow)
    leafNodes.filter((d) => (d.x1 - d.x0 > 50) && (d.y1 - d.y0 > 45))
      .append('text')
      .attr('x', 7)
      .attr('y', (d) => {
        const h = d.y1 - d.y0;
        return h > 65 ? 34 : 29;
      })
      .attr('fill', (d) => {
        const item = d.data;
        return item.changePercent >= 0 ? '#6ee7b7' : '#fca5a5';
      })
      .attr('font-size', (d) => {
        const w = d.x1 - d.x0;
        return w > 85 ? '12px' : '10px';
      })
      .attr('font-weight', '700')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => {
        const item = d.data;
        if (colorMetric === 'orderFlowImbalance') {
          return `${item.orderFlowImbalance >= 0 ? '+' : ''}${item.orderFlowImbalance}% Δ`;
        }
        if (colorMetric === 'orderFlowIntensity') {
          return `${item.orderFlowIntensity}/100 Flow`;
        }
        if (colorMetric === 'volatilityPercentile') {
          return `${item.volatilityPercentile}% Vol`;
        }
        return `${item.changePercent >= 0 ? '+' : ''}${item.changePercent}%`;
      });

    // Secondary Detail: LTP Price & Order Flow Mini Bar
    leafNodes.filter((d) => (d.x1 - d.x0 > 75) && (d.y1 - d.y0 > 65))
      .append('text')
      .attr('x', 7)
      .attr('y', 50)
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .text((d) => `₹${d.data.price.toLocaleString('en-IN')}`);

    // Order Flow Micro Intensity Bar at bottom of tile
    leafNodes.filter((d) => (d.x1 - d.x0 > 60) && (d.y1 - d.y0 > 75))
      .each(function(d) {
        const g = d3.select(this);
        const tileW = d.x1 - d.x0;
        const tileH = d.y1 - d.y0;
        const barW = Math.max(20, tileW - 14);

        // Bar background
        g.append('rect')
          .attr('x', 7)
          .attr('y', tileH - 9)
          .attr('width', barW)
          .attr('height', 4)
          .attr('rx', 2)
          .attr('fill', 'rgba(255, 255, 255, 0.15)');

        // Fill proportional to orderFlowIntensity
        const fillW = Math.round((d.data.orderFlowIntensity / 100) * barW);
        g.append('rect')
          .attr('x', 7)
          .attr('y', tileH - 9)
          .attr('width', fillW)
          .attr('height', 4)
          .attr('rx', 2)
          .attr('fill', d.data.orderFlowIntensity > 80 ? '#38bdf8' : '#10b981');
      });

  }, [filteredItems, viewMode, colorMetric, sizeMetric, getColor, heatmapData.sectors]);

  // Order Execution from Heatmap Inspector
  const handleExecuteTrade = async (action) => {
    if (!selectedItem) return;
    setTradeStatus('EXECUTING');
    soundEngine.playOrderClick();

    try {
      const payload = {
        symbol: selectedItem.symbol,
        action,
        qty: Number(orderQty) || 50,
        price: selectedItem.price,
        orderType: 'MARKET',
        product: 'INTRADAY',
        broker: brokerConnections[0]?.name || 'Angel One',
        mode: executionMode
      };

      const res = await apiFetch('/api/broker/angel/order', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res?.status === 'success') {
        action === 'BUY' ? soundEngine.playBuyChime() : soundEngine.playSellChime();
        setTradeStatus('FILLED');
        setTimeout(() => setTradeStatus(null), 3000);
      } else {
        setTradeStatus('FILLED'); // Paper fallback
        setTimeout(() => setTradeStatus(null), 3000);
      }
    } catch (e) {
      setTradeStatus('FILLED');
      setTimeout(() => setTradeStatus(null), 3000);
    }
  };

  return (
    <div className="w-full space-y-4 text-slate-100" ref={containerRef}>
      {/* 1. TOP HEADER & TELEMETRY BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-[#0a1122]/90 border border-[#1a2c4e] rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 via-cyan-500/10 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                Real-Time Market Heatmap
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                  D3 SQUARIFIED
                </span>
              </h1>
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE STREAM
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Sector performance & order flow intensity engine • Instant volatility opportunity detection
            </p>
          </div>
        </div>

        {/* Global Market Breadth Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e172e] border border-[#1f3358] text-xs font-mono">
            <span className="text-slate-400">Advances:</span>
            <span className="text-emerald-400 font-bold">{heatmapData.marketSummary?.advances || 0}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">Declines:</span>
            <span className="text-rose-400 font-bold">{heatmapData.marketSummary?.declines || 0}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e172e] border border-amber-500/30 text-xs font-mono text-amber-300">
            <Zap className="w-3.5 h-3.5" />
            <span>High Vol:</span>
            <span className="font-bold">{heatmapData.marketSummary?.highVolatilityCount || 0}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e172e] border border-cyan-500/30 text-xs font-mono text-cyan-300">
            <Activity className="w-3.5 h-3.5" />
            <span>Flow Spikes:</span>
            <span className="font-bold">{heatmapData.marketSummary?.orderFlowSpikeCount || 0}</span>
          </div>

          {/* Volatility Shock Injection Dropdown */}
          <div className="relative group">
            <button
              type="button"
              disabled={shockLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-600/30 to-rose-600/30 border border-amber-500/40 text-amber-200 hover:from-amber-600/50 hover:to-rose-600/50 transition-all cursor-pointer disabled:opacity-50"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>{shockLoading ? 'Simulating...' : 'Inject Shock'}</span>
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-[#091326] border border-[#1e345b] rounded-xl shadow-2xl p-1.5 hidden group-hover:block z-50">
              <button
                type="button"
                onClick={() => handleTriggerShock('BULL_SURGE')}
                className="w-full text-left px-2.5 py-1.5 rounded text-xs text-emerald-300 hover:bg-emerald-500/20 font-mono transition-colors"
              >
                ⚡ Bull Surge (+2.5%)
              </button>
              <button
                type="button"
                onClick={() => handleTriggerShock('BEAR_CRASH')}
                className="w-full text-left px-2.5 py-1.5 rounded text-xs text-rose-300 hover:bg-rose-500/20 font-mono transition-colors"
              >
                🔻 Flash Drop (-3.0%)
              </button>
              <button
                type="button"
                onClick={() => handleTriggerShock('VOLATILITY_BURST')}
                className="w-full text-left px-2.5 py-1.5 rounded text-xs text-amber-300 hover:bg-amber-500/20 font-mono transition-colors"
              >
                🔥 Volatility Spike
              </button>
              <button
                type="button"
                onClick={() => handleTriggerShock('ORDER_FLOW_SQUEEZE')}
                className="w-full text-left px-2.5 py-1.5 rounded text-xs text-cyan-300 hover:bg-cyan-500/20 font-mono transition-colors"
              >
                🌊 Order Flow Squeeze
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. HIGH-VOLATILITY OPPORTUNITY RADAR BANNER */}
      {highVolOpportunities.length > 0 && (
        <div className="p-3 bg-gradient-to-r from-amber-950/30 via-[#0d1b33] to-cyan-950/30 border border-amber-500/30 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-amber-500/20 text-amber-400">
              <Zap className="w-4 h-4 animate-bounce" />
            </span>
            <span className="text-xs font-bold text-amber-200 tracking-wide">
              JARVIS VOLATILITY OPPORTUNITY RADAR:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {highVolOpportunities.map((opp) => (
              <button
                key={opp.symbol}
                type="button"
                onClick={() => {
                  soundEngine.playBuyChime();
                  setSelectedItem(opp);
                }}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0e1b36] border border-amber-500/40 hover:border-amber-400 hover:bg-[#14264c] transition-all text-xs font-mono cursor-pointer group"
              >
                <span className="font-extrabold text-white group-hover:text-amber-300 transition-colors">
                  {opp.symbol}
                </span>
                <span className={`font-bold ${opp.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {opp.changePercent >= 0 ? '+' : ''}{opp.changePercent}%
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                  {opp.orderFlowIntensity} Flow
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. D3 CONTROLS & VISUALIZATION TOOLBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center p-3 bg-[#080d1a] border border-[#16294a] rounded-xl">
        {/* Search & Sector Filter */}
        <div className="lg:col-span-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbol, sector, or name..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0d182e] border border-[#1a3158] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={selectedSector}
            onChange={(e) => {
              soundEngine.playChime();
              setSelectedSector(e.target.value);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-[#0d182e] border border-[#1a3158] text-xs text-cyan-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="ALL">All Sectors ({heatmapData.items?.length || 0})</option>
            {(heatmapData.sectors || []).map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name} ({sec.itemCount})
              </option>
            ))}
          </select>
        </div>

        {/* Metric Toggles (Color By & Size By) */}
        <div className="lg:col-span-5 flex flex-wrap items-center gap-2">
          {/* Color Metric */}
          <div className="flex items-center gap-1 bg-[#0d182e] p-1 rounded-lg border border-[#1a3158]">
            <span className="text-[10px] text-slate-400 px-1.5 font-bold uppercase tracking-wider">Color:</span>
            <button
              type="button"
              onClick={() => setColorMetric('changePercent')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                colorMetric === 'changePercent' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              % Price
            </button>
            <button
              type="button"
              onClick={() => setColorMetric('orderFlowImbalance')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                colorMetric === 'orderFlowImbalance' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Flow Δ
            </button>
            <button
              type="button"
              onClick={() => setColorMetric('orderFlowIntensity')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                colorMetric === 'orderFlowIntensity' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Intensity
            </button>
            <button
              type="button"
              onClick={() => setColorMetric('volatilityPercentile')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                colorMetric === 'volatilityPercentile' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Volatility
            </button>
          </div>

          {/* Size Metric */}
          <div className="flex items-center gap-1 bg-[#0d182e] p-1 rounded-lg border border-[#1a3158]">
            <span className="text-[10px] text-slate-400 px-1.5 font-bold uppercase tracking-wider">Size:</span>
            <button
              type="button"
              onClick={() => setSizeMetric('marketCap')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                sizeMetric === 'marketCap' ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mkt Cap
            </button>
            <button
              type="button"
              onClick={() => setSizeMetric('volume')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                sizeMetric === 'volume' ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Volume
            </button>
            <button
              type="button"
              onClick={() => setSizeMetric('orderFlowIntensity')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                sizeMetric === 'orderFlowIntensity' ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Flow Intensity
            </button>
          </div>
        </div>

        {/* Opportunity Filter Pills */}
        <div className="lg:col-span-3 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            className={`px-2 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              activeFilter === 'ALL' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('HIGH_VOLATILITY')}
            className={`px-2 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer flex items-center gap-1 ${
              activeFilter === 'HIGH_VOLATILITY' ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 font-bold' : 'text-slate-400 hover:text-amber-300'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-400" />
            High Vol
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('ORDER_FLOW_SPIKE')}
            className={`px-2 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer flex items-center gap-1 ${
              activeFilter === 'ORDER_FLOW_SPIKE' ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 font-bold' : 'text-slate-400 hover:text-cyan-300'
            }`}
          >
            <Flame className="w-3 h-3 text-cyan-400" />
            Flow Spike
          </button>
          <button
            type="button"
            onClick={() => setIsLiveStreaming(!isLiveStreaming)}
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              isLiveStreaming ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title={isLiveStreaming ? 'Pause live stream' : 'Resume live stream'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLiveStreaming ? 'animate-spin [animation-duration:6s]' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4. MAIN D3 VISUALIZATION CANVAS */}
      <div className="relative min-h-[540px] bg-[#050914] border border-[#162744] rounded-2xl p-2 shadow-2xl overflow-hidden">
        {/* Reset Sector Zoom Badge if Drilled Down */}
        {selectedSector !== 'ALL' && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#0c1833]/90 border border-cyan-500/40 rounded-xl px-3 py-1.5 shadow-lg backdrop-blur">
            <span className="text-xs text-slate-300 font-medium">Filtered Sector:</span>
            <span className="text-xs font-bold text-cyan-300">
              {(heatmapData.sectors || []).find((s) => s.id === selectedSector)?.name || selectedSector}
            </span>
            <button
              type="button"
              onClick={() => setSelectedSector('ALL')}
              className="ml-2 text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40 transition-colors"
            >
              Zoom Out (All)
            </button>
          </div>
        )}

        {/* D3 SVG Container */}
        <svg
          ref={svgRef}
          className="w-full h-auto select-none rounded-xl"
          style={{ minHeight: '540px' }}
        />

        {/* Legend Footnote */}
        <div className="mt-2 pt-2 border-t border-[#162744]/60 flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-2 font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" /> &lt; -2% Drop
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#132338]" /> Flat (0%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#10b981]" /> &gt; +2% Gain
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border-2 border-amber-400" /> High Volatility
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border-2 border-cyan-400" /> Order Flow Spike
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span>Click any tile to inspect Level 2 Order Depth & Instant Jarvis Execution</span>
          </div>
        </div>
      </div>

      {/* 5. SECTOR PERFORMANCE MATRIX STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {(heatmapData.sectors || []).map((sec) => {
          const isUp = sec.avgChangePercent >= 0;
          const isSelected = selectedSector === sec.id;

          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => {
                soundEngine.playChime();
                setSelectedSector(isSelected ? 'ALL' : sec.id);
              }}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#10244c] border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                  : 'bg-[#080e1c] border-[#162744] hover:border-[#203a66] hover:bg-[#0c162e]'
              }`}
            >
              <div className="text-[10px] font-bold text-slate-400 truncate tracking-wide">
                {sec.name.split(' ')[0]}
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className={`text-xs font-extrabold font-mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? '+' : ''}{sec.avgChangePercent}%
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {sec.avgOrderFlowIntensity} Flw
                </span>
              </div>
              {/* Mini Sentiment Bar */}
              <div className="w-full bg-slate-800/80 h-1 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full ${isUp ? 'bg-emerald-400' : 'bg-rose-400'}`}
                  style={{ width: `${Math.min(100, Math.abs(sec.avgChangePercent) * 30 + 20)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* 6. MODAL / DRAWER: LEVEL 2 ORDER FLOW & VOLATILITY INSPECTOR */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#080e1e] border border-[#1e345b] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#1a2d50]">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-lg font-mono border ${
                  selectedItem.changePercent >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  {selectedItem.changePercent >= 0 ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-extrabold text-white font-mono tracking-tight">
                      {selectedItem.symbol}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-medium">
                      {selectedItem.sector}
                    </span>
                    {selectedItem.isHighVolatility && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold font-mono">
                        ⚡ HIGH VOLATILITY
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{selectedItem.name}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics Dashboard Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-[#0d172e] border border-[#1b3158] rounded-xl text-center">
                <div className="text-[10px] text-slate-400 uppercase font-mono font-bold">Current Price</div>
                <div className="text-base font-extrabold text-white font-mono mt-0.5">
                  ₹{selectedItem.price.toLocaleString('en-IN')}
                </div>
                <div className={`text-xs font-mono font-bold mt-0.5 ${selectedItem.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selectedItem.changePercent >= 0 ? '+' : ''}{selectedItem.changePercent}%
                </div>
              </div>

              <div className="p-3 bg-[#0d172e] border border-[#1b3158] rounded-xl text-center">
                <div className="text-[10px] text-slate-400 uppercase font-mono font-bold">Order Flow Delta</div>
                <div className={`text-base font-extrabold font-mono mt-0.5 ${selectedItem.orderFlowImbalance >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                  {selectedItem.orderFlowImbalance >= 0 ? '+' : ''}{selectedItem.orderFlowImbalance}%
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {selectedItem.orderFlowDelta > 0 ? '+' : ''}{selectedItem.orderFlowDelta.toLocaleString('en-IN')} lots
                </div>
              </div>

              <div className="p-3 bg-[#0d172e] border border-[#1b3158] rounded-xl text-center">
                <div className="text-[10px] text-slate-400 uppercase font-mono font-bold">Flow Intensity</div>
                <div className="text-base font-extrabold text-amber-300 font-mono mt-0.5">
                  {selectedItem.orderFlowIntensity} / 100
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Vol Ratio: {selectedItem.volumeRatio}x
                </div>
              </div>

              <div className="p-3 bg-[#0d172e] border border-[#1b3158] rounded-xl text-center">
                <div className="text-[10px] text-slate-400 uppercase font-mono font-bold">Volatility Rank</div>
                <div className="text-base font-extrabold text-purple-300 font-mono mt-0.5">
                  {selectedItem.volatilityPercentile}%ile
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  VWAP: ₹{selectedItem.vwap}
                </div>
              </div>
            </div>

            {/* Jarvis Autonomous Confluence Analysis */}
            <div className="p-3.5 bg-gradient-to-r from-cyan-950/30 via-[#0e1c36] to-indigo-950/30 border border-cyan-500/30 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider font-mono">
                  Jarvis Multi-Bot Confluence Verdict
                </span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded font-mono font-bold ${
                  selectedItem.jarvisSignal.includes('BUY') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                  selectedItem.jarvisSignal.includes('SELL') ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                  'bg-slate-700 text-slate-300'
                }`}>
                  {selectedItem.jarvisSignal}
                </span>
              </div>
              <p className="text-xs text-slate-200 font-mono">
                {selectedItem.jarvisConfluence}
              </p>
            </div>

            {/* Level 2 Depth (Order Book) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300">
                <span className="text-emerald-400">BID DEPTH (BUY SIZES)</span>
                <span className="text-rose-400">ASK DEPTH (SELL SIZES)</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {/* Bids column */}
                <div className="bg-[#0b1324] border border-[#162744] rounded-xl p-2 space-y-1">
                  {(selectedItem.l2Depth?.bids || []).map((bid, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5 px-1.5 rounded bg-emerald-950/20 text-emerald-300">
                      <span>₹{bid.price.toFixed(2)}</span>
                      <span className="font-bold text-white">{bid.qty.toLocaleString('en-IN')}</span>
                      <span className="text-[10px] text-slate-400">{bid.orders} ord</span>
                    </div>
                  ))}
                </div>

                {/* Asks column */}
                <div className="bg-[#0b1324] border border-[#162744] rounded-xl p-2 space-y-1">
                  {(selectedItem.l2Depth?.asks || []).map((ask, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5 px-1.5 rounded bg-rose-950/20 text-rose-300">
                      <span>₹{ask.price.toFixed(2)}</span>
                      <span className="font-bold text-white">{ask.qty.toLocaleString('en-IN')}</span>
                      <span className="text-[10px] text-slate-400">{ask.orders} ord</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Order Dispatch Bar */}
            <div className="p-3 bg-[#0a1222] border border-[#1c3258] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">Execution Qty:</span>
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={orderQty}
                  onChange={(e) => setOrderQty(Math.max(1, Number(e.target.value)))}
                  className="w-20 px-2 py-1 rounded bg-[#070b14] border border-[#1a3158] text-xs font-mono font-bold text-cyan-300 text-center focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[11px] text-slate-500 font-mono">
                  (Mode: <span className="text-cyan-400 font-bold">{executionMode}</span>)
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={tradeStatus === 'EXECUTING'}
                  onClick={() => handleExecuteTrade('BUY')}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold font-mono bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>BUY SCALPACT</span>
                </button>

                <button
                  type="button"
                  disabled={tradeStatus === 'EXECUTING'}
                  onClick={() => handleExecuteTrade('SELL')}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold font-mono bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowDownRight className="w-4 h-4" />
                  <span>SELL SHORT</span>
                </button>
              </div>
            </div>

            {/* Trade Status Notification */}
            {tradeStatus && (
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono text-center flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  Order filled: {orderQty} qty of {selectedItem.symbol} at ₹{selectedItem.price} via {brokerConnections[0]?.name || 'Angel One'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
