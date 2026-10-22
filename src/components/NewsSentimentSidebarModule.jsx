import React, { useState, useEffect, useMemo } from 'react';
import {
  Radio,
  Newspaper,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  X,
  Send,
  Sparkles,
  Cpu,
  Layers,
  Zap,
  CheckCircle2,
  ChevronRight,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Activity
} from 'lucide-react';
import { newsSentimentEngine, analyzeHeadlineSentiment } from '../utils/newsSentimentAnalyzer';

export default function NewsSentimentSidebarModule({ onNavigateToDecisionNetwork }) {
  const [sentimentState, setSentimentState] = useState(() => newsSentimentEngine.getCompositeState());
  const [currentHeadlineIdx, setCurrentHeadlineIdx] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('feed'); // 'feed' | 'tester' | 'sectors' | 'quorum'
  
  // Custom headline sandbox state
  const [testInput, setTestInput] = useState('NIFTY 50 surges to record high as FII inflows double; RBI holds repo rate steady');
  const [testResult, setTestResult] = useState(() => analyzeHeadlineSentiment('NIFTY 50 surges to record high as FII inflows double; RBI holds repo rate steady'));
  
  // News filter in modal
  const [filterQuery, setFilterQuery] = useState('');
  const [filterSentiment, setFilterSentiment] = useState('ALL'); // 'ALL' | 'BULLISH' | 'BEARISH'

  // Subscribe to real-time sentiment engine
  useEffect(() => {
    const unsubscribe = newsSentimentEngine.subscribe((state) => {
      setSentimentState(state);
    });
    return () => unsubscribe();
  }, []);

  // Auto-cycle through top 5 headlines in compact sidebar
  useEffect(() => {
    if (!sentimentState.articles || sentimentState.articles.length === 0) return;
    const interval = setInterval(() => {
      setCurrentHeadlineIdx((prev) => (prev + 1) % Math.min(6, sentimentState.articles.length));
    }, 7000);
    return () => clearInterval(interval);
  }, [sentimentState.articles]);

  const activeHeadline = useMemo(() => {
    if (!sentimentState.articles || sentimentState.articles.length === 0) return null;
    return sentimentState.articles[currentHeadlineIdx % sentimentState.articles.length];
  }, [sentimentState.articles, currentHeadlineIdx]);

  // Handle manual refresh
  const handleRefresh = (e) => {
    if (e) e.stopPropagation();
    setIsRefreshing(true);
    newsSentimentEngine.refreshFeed();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  // Run sentiment analyzer on custom user input
  const handleRunTest = (e) => {
    e.preventDefault();
    if (!testInput.trim()) return;
    const res = analyzeHeadlineSentiment(testInput);
    setTestResult(res);
  };

  const isBullish = sentimentState.compositeScore >= 0;
  const scoreSign = sentimentState.compositeScore > 0 ? '+' : '';

  // Filtered articles in modal
  const filteredArticles = useMemo(() => {
    if (!sentimentState.articles) return [];
    return sentimentState.articles.filter((art) => {
      const matchesQuery = !filterQuery || 
        art.headline.toLowerCase().includes(filterQuery.toLowerCase()) ||
        art.source.toLowerCase().includes(filterQuery.toLowerCase()) ||
        (art.impactAsset && art.impactAsset.toLowerCase().includes(filterQuery.toLowerCase()));

      const isArtBullish = art.sentiment.score >= 0;
      const matchesSentiment = 
        filterSentiment === 'ALL' ||
        (filterSentiment === 'BULLISH' && isArtBullish) ||
        (filterSentiment === 'BEARISH' && !isArtBullish);

      return matchesQuery && matchesSentiment;
    });
  }, [sentimentState.articles, filterQuery, filterSentiment]);

  return (
    <>
      {/* SIDEBAR DOCKED MODULE */}
      <div className="mx-2 my-2 rounded-xl bg-[#070d1a]/95 border border-[#16294a] shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md overflow-hidden text-left transition-all">
        {/* Module Header Strip */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-2.5 py-2 flex items-center justify-between cursor-pointer hover:bg-[#0c1833]/70 transition-colors border-b border-[#16294a]/60 select-none"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="relative flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[11px] font-bold text-white tracking-wide truncate">
                NEWS SENTIMENT
              </span>
              <span className="text-[9px] font-mono text-cyan-400/90 tracking-tighter">
                AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              title="Refresh News Feed"
              className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#10244c] transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsModalOpen(true);
              }}
              title="Expand News & Sentiment Radar"
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#10244c] transition-all cursor-pointer"
            >
              <Maximize2 className="w-3 h-3 text-cyan-400" />
            </button>
            <div className="text-slate-400">
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </div>
          </div>
        </div>

        {/* Primary Gauge Strip */}
        <div className="p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {isBullish ? (
                <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className={`text-xs font-mono font-bold ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                {scoreSign}{sentimentState.compositeScore}
              </span>
              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                {sentimentState.classification.replace('_', ' ')}
              </span>
            </div>

            <div className="text-[9px] font-mono text-slate-400">
              {sentimentState.bullishPct}% Bull · {sentimentState.bearishPct}% Bear
            </div>
          </div>

          {/* Split Ratio Progress Bar (Cyan/Emerald to Rose) */}
          <div className="w-full h-1.5 rounded-full bg-[#0a1226] border border-[#16294a] overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-700"
              style={{ width: `${sentimentState.bullishPct}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-700"
              style={{ width: `${sentimentState.bearishPct}%` }}
            />
          </div>

          {/* Quorum Decision Network Bias Hook */}
          <div className="flex items-center justify-between text-[9.5px] font-mono bg-[#0c1833]/90 px-2 py-1 rounded border border-[#1c3866]/50">
            <span className="text-slate-400 flex items-center gap-1">
              <Cpu className="w-2.5 h-2.5 text-cyan-400" />
              Decision Quorum:
            </span>
            <span className={`font-bold ${sentimentState.quorumBias >= 0 ? 'text-cyan-300' : 'text-rose-300'}`}>
              {sentimentState.quorumBias >= 0 ? `+${sentimentState.quorumBias} BUY Bias` : `${sentimentState.quorumBias} SELL Bias`}
            </span>
          </div>

          {/* Cycling Live Headline Box */}
          {activeHeadline && (
            <div 
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 rounded-lg bg-[#09142b]/80 border border-[#1b345f]/60 hover:border-cyan-500/50 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between text-[8.5px] text-slate-400 font-mono mb-1">
                <span className="text-cyan-400/90 truncate max-w-[110px]">
                  {activeHeadline.impactAsset || 'NSE'}
                </span>
                <span className={`font-bold ${activeHeadline.sentiment.score >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {activeHeadline.sentiment.score > 0 ? `+${activeHeadline.sentiment.score}` : activeHeadline.sentiment.score}
                </span>
              </div>
              <p className="text-[10px] text-slate-200 line-clamp-2 leading-tight group-hover:text-cyan-200 transition-colors">
                {activeHeadline.headline}
              </p>
              <div className="mt-1 flex items-center justify-between text-[8px] text-slate-400 font-mono">
                <span className="truncate max-w-[90px]">{activeHeadline.source.split(' ')[0]}</span>
                <span>{activeHeadline.timestamp}</span>
              </div>
            </div>
          )}

          {/* Collapsible Quick Inspector Preview */}
          {isExpanded && (
            <div className="pt-1 space-y-1.5 border-t border-[#16294a]/60 animate-fadeIn">
              <div className="text-[9.5px] text-slate-400 flex items-center justify-between font-mono">
                <span>Ingested Articles:</span>
                <span className="text-white font-bold">{sentimentState.totalArticles} live</span>
              </div>
              <div className="text-[9.5px] text-slate-400 flex items-center justify-between font-mono">
                <span>Quorum Rule:</span>
                <span className="text-emerald-400 font-bold">9/14 Threshold</span>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="w-full mt-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-[#0052cc] to-[#00a3bf] hover:from-[#0066ff] hover:to-[#00c2e0] text-white text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,163,191,0.3)] cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-cyan-200" />
                <span>Open AI Sentiment Matrix</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FULL SCREEN / EXPANDED MODAL DIALOG */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
          <div className="bg-[#05070b] border border-[#1e3a6e] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#16294a] flex items-center justify-between bg-[#081124]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#0052cc]/20 border border-cyan-500/40 text-cyan-400">
                  <Newspaper className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-wide">
                      Real-time News Sentiment Engine
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                      LIVE NLP STREAM
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Continuous financial parsing · Autonomous Bullish/Bearish scoring feeding the 14-Bot Quorum Arbiter
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-3 py-1.5 rounded-lg bg-[#0c1833] border border-[#1e3a6e] hover:border-cyan-400/50 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>Fetch New Signal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#14264c] transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Nav Tabs */}
            <div className="px-5 pt-3 border-b border-[#16294a] bg-[#070e1e] flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveModalTab('feed')}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  activeModalTab === 'feed'
                    ? 'border-cyan-400 text-cyan-300 font-bold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Newspaper className="w-3.5 h-3.5" />
                <span>Live Headlines Feed ({sentimentState.totalArticles})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('tester')}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  activeModalTab === 'tester'
                    ? 'border-cyan-400 text-cyan-300 font-bold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Headline Sentiment Tester</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('sectors')}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  activeModalTab === 'sectors'
                    ? 'border-cyan-400 text-cyan-300 font-bold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Sector & Asset Breakdown</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('quorum')}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  activeModalTab === 'quorum'
                    ? 'border-cyan-400 text-cyan-300 font-bold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Decision Network Impact</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Composite Telemetry Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-[#091326] p-4 rounded-xl border border-[#19335f]">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">COMPOSITE SENTIMENT</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xl font-bold font-mono ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {scoreSign}{sentimentState.compositeScore}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">
                      {sentimentState.classification.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5">Weighted over {sentimentState.totalArticles} articles</span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">BULL / BEAR POLARITY</span>
                  <div className="flex items-center gap-2 mt-1 font-mono font-bold text-xs">
                    <span className="text-emerald-400">{sentimentState.bullishPct}% Bullish</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-rose-400">{sentimentState.bearishPct}% Bearish</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#060a14] mt-2 overflow-hidden flex">
                    <div className="h-full bg-emerald-400" style={{ width: `${sentimentState.bullishPct}%` }} />
                    <div className="h-full bg-rose-500" style={{ width: `${sentimentState.bearishPct}%` }} />
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">DECISION QUORUM IMPACT</span>
                  <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                    {sentimentState.quorumRecommendation}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5">Enforces 9/14 minimum bot consensus</span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400">LAST TELEMETRY UPDATE</span>
                  <div className="text-sm font-bold font-mono text-slate-200 mt-1">
                    {sentimentState.lastUpdated || 'Just now'}
                  </div>
                  <span className="text-[9px] text-emerald-400 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" /> High-frequency polling active
                  </span>
                </div>
              </div>

              {/* TAB 1: LIVE HEADLINES FEED */}
              {activeModalTab === 'feed' && (
                <div className="space-y-3">
                  {/* Search & Filter Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#081224] p-2.5 rounded-xl border border-[#16294a]">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        placeholder="Search headlines by asset, symbol, or keyword (e.g. Nifty, RBI, Capex)..."
                        className="w-full bg-[#05070b] border border-[#1c3563] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                      />
                    </div>

                    <div className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setFilterSentiment('ALL')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
                          filterSentiment === 'ALL'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        All ({sentimentState.articles.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterSentiment('BULLISH')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
                          filterSentiment === 'BULLISH'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Bullish
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterSentiment('BEARISH')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
                          filterSentiment === 'BEARISH'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40 font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Bearish
                      </button>
                    </div>
                  </div>

                  {/* Headline Cards List */}
                  <div className="space-y-2">
                    {filteredArticles.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 font-mono text-xs">
                        No financial news matching current filter query.
                      </div>
                    ) : (
                      filteredArticles.map((article) => {
                        const isArtBullish = article.sentiment.score >= 0;
                        return (
                          <div
                            key={article.id}
                            className="p-3 rounded-xl bg-[#081224]/80 border border-[#16294a] hover:border-cyan-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1.5 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                                <span className="text-cyan-400 font-bold">
                                  {article.impactAsset || 'NSE'}
                                </span>
                                <span>·</span>
                                <span>{article.category}</span>
                                <span>·</span>
                                <span className="text-slate-300">{article.source}</span>
                                <span>·</span>
                                <span>{article.timestamp}</span>
                              </div>

                              <p className="text-xs font-medium text-white leading-relaxed">
                                {article.headline}
                              </p>

                              {/* Entities & Matched Triggers */}
                              <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono text-slate-400">
                                <span>Parsed Triggers:</span>
                                {article.sentiment.matchedKeywords.length > 0 ? (
                                  article.sentiment.matchedKeywords.map((kw, i) => (
                                    <span key={i} className="text-cyan-300">
                                      "{kw.phrase}" ({kw.weight > 0 ? `+${kw.weight}` : kw.weight})
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-500">Heuristic valence</span>
                                )}
                              </div>
                            </div>

                            {/* Score & Quorum Impact badge */}
                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 sm:border-l border-[#16294a]/80 pt-2 sm:pt-0 sm:pl-4 min-w-[140px]">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-sm font-bold font-mono ${isArtBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {article.sentiment.score > 0 ? `+${article.sentiment.score}` : article.sentiment.score}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-300">
                                  {article.sentiment.classification.replace('_', ' ')}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono text-slate-400 text-right mt-0.5">
                                {article.sentiment.confidence}% Confidence
                              </span>
                              <span className="text-[9px] font-mono text-cyan-300 text-right mt-1">
                                {article.sentiment.quorumDelta >= 0 ? `+${article.sentiment.quorumDelta} Quorum` : `${article.sentiment.quorumDelta} Quorum`}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: AI HEADLINE SENTIMENT TESTER (SANDBOX) */}
              {activeModalTab === 'tester' && (
                <div className="space-y-4">
                  <div className="bg-[#081224] p-4 rounded-xl border border-[#16294a] space-y-3">
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        AI Headline Sentiment Sandbox
                      </h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Test any real or prospective market headline to observe the NLP parsing pipeline and Quorum weight output.
                      </p>
                    </div>

                    <form onSubmit={handleRunTest} className="space-y-2">
                      <div className="relative">
                        <textarea
                          rows={2}
                          value={testInput}
                          onChange={(e) => setTestInput(e.target.value)}
                          placeholder="Type or paste a financial headline (e.g., 'Tata Motors announces massive ₹5,000 Cr capex boost, shares jump 4%')..."
                          className="w-full bg-[#05070b] border border-[#1c3563] rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono resize-none"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-slate-400">
                          <span>Quick presets:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const s = 'RBI announces surprise 25 bps rate cut; banks and auto stocks surge on liquidity boost';
                              setTestInput(s);
                              setTestResult(analyzeHeadlineSentiment(s));
                            }}
                            className="text-cyan-400 hover:underline cursor-pointer"
                          >
                            [Rate Cut Surge]
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const s = 'Crude oil spikes 5% on geopolitical escalation; rupee hits fresh record low against dollar';
                              setTestInput(s);
                              setTestResult(analyzeHeadlineSentiment(s));
                            }}
                            className="text-rose-400 hover:underline cursor-pointer"
                          >
                            [Crude / Inflation Shock]
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const s = 'Reliance Q3 profit jumps 18% YoY driven by retail expansion and tariff hike';
                              setTestInput(s);
                              setTestResult(analyzeHeadlineSentiment(s));
                            }}
                            className="text-emerald-400 hover:underline cursor-pointer"
                          >
                            [Reliance Earnings Beat]
                          </button>
                        </div>

                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(0,240,255,0.4)] cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Analyze Headline Now</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Sandbox Analysis Result Display */}
                  {testResult && (
                    <div className="p-4 rounded-xl bg-[#09152b] border border-[#1c3866] space-y-4">
                      <div className="flex items-center justify-between border-b border-[#16294a]/80 pb-3">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400">AI POLARITY VERDICT</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-2xl font-bold font-mono ${testResult.score >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {testResult.score > 0 ? `+${testResult.score}` : testResult.score} / 100
                            </span>
                            <span className="text-sm font-bold text-white uppercase tracking-wider">
                              {testResult.classification.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-mono text-slate-400">DECISION QUORUM IMPACT</span>
                          <div className="text-xs font-bold font-mono text-cyan-300 mt-0.5">
                            {testResult.impact}
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono">
                            Confidence: {testResult.confidence}%
                          </span>
                        </div>
                      </div>

                      {/* Triggers & Entity Extraction */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-[#060c18] p-3 rounded-lg border border-[#132544]">
                          <span className="text-[10px] font-mono text-slate-400 block mb-1.5">
                            DETECTED FINANCIAL TRIGGERS ({testResult.matchedKeywords.length})
                          </span>
                          {testResult.matchedKeywords.length > 0 ? (
                            <div className="space-y-1">
                              {testResult.matchedKeywords.map((kw, i) => (
                                <div key={i} className="flex items-center justify-between text-xs font-mono">
                                  <span className="text-slate-200">"{kw.phrase}"</span>
                                  <span className={kw.weight > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                    {kw.weight > 0 ? `+${kw.weight}` : kw.weight} weight
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 font-mono">
                              No explicit dictionary keywords; fallback semantic score applied.
                            </span>
                          )}
                        </div>

                        <div className="bg-[#060c18] p-3 rounded-lg border border-[#132544]">
                          <span className="text-[10px] font-mono text-slate-400 block mb-1.5">
                            EXTRACTED ASSETS & SECTORS ({testResult.entities.length})
                          </span>
                          {testResult.entities.length > 0 ? (
                            <div className="space-y-1">
                              {testResult.entities.map((ent, i) => (
                                <div key={i} className="flex items-center justify-between text-xs font-mono">
                                  <span className="text-cyan-300 font-bold">{ent.symbol}</span>
                                  <span className="text-slate-400">{ent.sector}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 font-mono">
                              Macro / Broad-market impact (No single ticker isolated).
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SECTOR BREAKDOWN */}
              {activeModalTab === 'sectors' && (
                <div className="space-y-4">
                  <div className="bg-[#081224] p-4 rounded-xl border border-[#16294a]">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                      Sector & Asset Sentiment Aggregation
                    </h3>
                    <div className="space-y-2.5">
                      {sentimentState.sectorBreakdown && sentimentState.sectorBreakdown.map((item) => {
                        const isPos = item.score >= 0;
                        const pctWidth = Math.min(100, Math.max(5, Math.abs(item.score)));
                        return (
                          <div key={item.sector} className="p-2.5 rounded-lg bg-[#05070b] border border-[#16294a] flex items-center justify-between gap-4">
                            <div className="w-40 shrink-0">
                              <span className="text-xs font-bold text-white block">{item.sector}</span>
                              <span className="text-[9px] text-slate-400 font-mono">{item.count} headlines parsed</span>
                            </div>

                            <div className="flex-1">
                              <div className="w-full h-2 rounded-full bg-[#0a1226] overflow-hidden flex">
                                {isPos ? (
                                  <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${pctWidth}%` }} />
                                ) : (
                                  <div className="h-full bg-gradient-to-r from-rose-500 to-rose-600 ml-auto" style={{ width: `${pctWidth}%` }} />
                                )}
                              </div>
                            </div>

                            <div className="w-20 text-right shrink-0">
                              <span className={`text-xs font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPos ? `+${item.score}` : item.score}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DECISION NETWORK IMPACT */}
              {activeModalTab === 'quorum' && (
                <div className="space-y-4">
                  <div className="bg-[#081224] p-4 rounded-xl border border-[#16294a] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-cyan-400" />
                          14-Bot Consensus Engine Integration
                        </h3>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          How the real-time News Sentiment score dynamically regulates the strict 9/14 Quorum threshold.
                        </p>
                      </div>

                      {onNavigateToDecisionNetwork && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsModalOpen(false);
                            onNavigateToDecisionNetwork();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#0052cc] hover:bg-[#0066ff] text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <span>Open 14-Bot Matrix View</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                      <div className="p-3 rounded-lg bg-[#05070b] border border-[#16294a] space-y-1">
                        <span className="text-[10px] font-mono text-cyan-400 font-bold block">BOT 1: SCALPER BOT</span>
                        <p className="text-xs text-slate-300">
                          {sentimentState.compositeScore >= 30
                            ? 'Boosted 1.25x weight: Aggressive micro-momentum scalps enabled with wide profit targets.'
                            : 'Standard baseline 1.0x: Strict ATR stop-losses active.'}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-[#05070b] border border-[#16294a] space-y-1">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold block">BOT 6: VWAP MOMENTUM</span>
                        <p className="text-xs text-slate-300">
                          {sentimentState.compositeScore >= 20
                            ? 'Anchored VWAP pullback buy filters relaxed; institutional buying confirmed.'
                            : 'Standard bands enforced; waiting for volume block confirmation.'}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-[#05070b] border border-[#16294a] space-y-1">
                        <span className="text-[10px] font-mono text-rose-400 font-bold block">BOT 14: RISK NEUTRAL HEDGER</span>
                        <p className="text-xs text-slate-300">
                          {sentimentState.compositeScore <= -20
                            ? 'High alert: Dynamic Delta hedge ratio elevated to 1.4x to insulate capital.'
                            : 'Normal stance: Neutral beta hedging active.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0b1730] border border-cyan-500/30 text-xs text-slate-300 space-y-1">
                      <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                        Strict 9/14 Quorum Rule Enforced
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Regardless of market hype or headlines, no live order ever fires unless at least 9 of the 14 AI neural agents reach simultaneous algorithmic consensus AND the Net-Profit Guardrail guarantees a net gain after all broker fees and taxes.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-[#16294a] bg-[#070e1e] flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Chintu AI Financial Intelligence Stream</span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-[#0c1833] hover:bg-[#14264c] text-white text-xs font-mono transition-all cursor-pointer"
              >
                Close Radar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
