import React, { useState, useEffect } from 'react';
import {
  Zap,
  Sliders,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  Code2,
  Sparkles,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Activity,
  ChevronRight,
  Info,
  RefreshCw,
  Save,
  Check,
  Plus,
  BookOpen,
  Trash2,
  X
} from 'lucide-react';
import { soundEngine } from '../../utils/audioChime';
import { apiFetch } from '../../utils/api';

const SKILLS_STORAGE_KEY = 'chintu_bot_skills';

export const AVAILABLE_SKILL_MODULES = [
  {
    id: 'order_flow',
    name: 'Order Flow Imbalance & Delta Footprint',
    category: 'Microstructure',
    badge: 'Institutional',
    desc: 'Analyzes bid-ask volume delta clusters and detects aggressive market order absorption at liquidity levels.',
    defaultSensitivity: 85,
    synergyBonus: '+14% Accuracy'
  },
  {
    id: 'supertrend_mult',
    name: 'SuperTrend Dynamic Multiplier (Adaptive ATR)',
    category: 'Trend Following',
    badge: 'Momentum',
    desc: 'Expands and contracts ATR multipliers (1.5 to 3.5) based on real-time volatility regime to prevent premature shakeouts.',
    defaultSensitivity: 90,
    synergyBonus: '+12% Win Rate'
  },
  {
    id: 'volume_spread',
    name: 'Volume Spread Analysis (VSA Wyckoff Climax)',
    category: 'Volume Profile',
    badge: 'Wyckoff',
    desc: 'Scans for buying/selling climax, spring/upthrust tests, and institutional supply absorption before reversal confirmation.',
    defaultSensitivity: 80,
    synergyBonus: '+10% R:R Ratio'
  },
  {
    id: 'options_greeks',
    name: 'Options Greek Hedging (Gamma & Vega Neutral)',
    category: 'Derivatives',
    badge: 'F&O Elite',
    desc: 'Calculates real-time second-order Greeks (Gamma scalping & Vega drift) to dynamically neutralize adverse strike delta.',
    defaultSensitivity: 75,
    synergyBonus: '+18% Volatility Edge'
  },
  {
    id: 'transformer_ml',
    name: 'Deep Transformer Attention Filter (FinBERT)',
    category: 'Neural Network',
    badge: 'AI Core',
    desc: 'Multi-horizon attention neural network trained on macroeconomic disclosures, USDINR flows, and index component weights.',
    defaultSensitivity: 88,
    synergyBonus: '+16% Directional Quorum'
  },
  {
    id: 'bollinger_squeeze',
    name: 'Mean Reversion Bollinger Squeeze & %B Band',
    category: 'Mean Reversion',
    badge: 'Volatility',
    desc: 'Measures volatility band compression inside Keltner envelopes to forecast explosive range expansions.',
    defaultSensitivity: 70,
    synergyBonus: '+9% Entry Precision'
  },
  {
    id: 'smc_liquidity',
    name: 'Smart Money Liquidity Sweep & Order Block Hunter',
    category: 'Price Action',
    badge: 'SMC',
    desc: 'Pinpoints institutional fair value gaps (FVG), liquidity pools, and stop-run liquidation levels before trade entry.',
    defaultSensitivity: 84,
    synergyBonus: '+15% Drawdown Reduction'
  }
];

export const STRATEGY_PRESETS = {
  aggressive: `// RULESET: Aggressive Momentum Expansion
WHEN NIFTY 1-min RSI > 62 AND Delta_Imbalance > +1500
AND VWAP_Slope > 0.05
THEN Trigger Micro-Scalp BUY with Trailing SL 15 pts.
VETO entry if News Sentiment < -0.30.`,
  institutional: `// RULESET: Institutional Wyckoff Order Absorption
WHEN Price tests S1 Order Block AND Volume_Spread == 'Absorption'
AND Transformer_Attention_Confidence > 85%
THEN Enter Limit BUY order at Point-of-Control (POC).
RISK CEILING: Max 1.2% capital risk per trade.`,
  options_gamma: `// RULESET: Low-IV Gamma Squeeze Scalp
WHEN ATM Call Delta between +0.50 and +0.65 AND Vega > 12.5
AND 11/13 Peer Bots Vote BUY
THEN Buy ATM Strike Call Option with target +25% return.
EXIT immediately on delta reversal < +0.42.`,
  conservative: `// RULESET: Conservative Mean Reversion Guard
WHEN Stochastic_Keltner_Band < -2.0σ AND Mean_Reversion_ZScore < -1.8
AND Central Bank FX Flows == 'Neutral'
THEN Scale in 50% lot size with tight 0.35% hard stop.`
};

export default function BotSkillsHubView({
  bots = [],
  onUpdateBots,
  initialSelectedBotId = 1
}) {
  const [selectedBotId, setSelectedBotId] = useState(initialSelectedBotId);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('vault');
  const [strategies, setStrategies] = useState([]);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [assignTargetBots, setAssignTargetBots] = useState({});
  const [assignFeedback, setAssignFeedback] = useState({});
  const [newStrategyForm, setNewStrategyForm] = useState({
    name: '',
    category: 'Momentum Breakout',
    asset: 'NIFTY 50',
    entry_rules: '',
    exit_rules: '',
    stop_loss_pct: 0.35,
    target_risk_reward: 2.0,
    indicators: '15m High/Low, Volume 20-SMA, 9 EMA',
    capital_allocation_pct: 1.0
  });

  const fetchStrategies = async () => {
    setIsLoadingStrategies(true);
    try {
      const res = await apiFetch('/api/strategies');
      if (res.ok) {
        const data = await res.json();
        if (data.strategies) {
          setStrategies(data.strategies);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch strategies:', e);
    } finally {
      setIsLoadingStrategies(false);
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  const handleAssignStrategy = async (strategy, targetBotId) => {
    const botIdNum = Number(targetBotId || selectedBotId);
    const targetBot = bots.find((b) => b.id === botIdNum) || selectedBot;
    try {
      await apiFetch('/api/strategies/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: targetBot.id,
          strategy_id: strategy.id
        })
      });

      soundEngine.playBuyChime();
      setAssignFeedback((prev) => ({
        ...prev,
        [strategy.id]: `✅ Assigned to Bot #${targetBot.id} (${targetBot.name})`
      }));

      // Update bot customPrompt in botSkillsMap
      const formattedRules = `// [STRATEGY VAULT]: ${strategy.name}\n// CATEGORY: ${strategy.category} | ASSET: ${strategy.asset}\n// ENTRY: ${strategy.entry_rules}\n// EXIT: ${strategy.exit_rules}\n// STOP-LOSS: ${strategy.stop_loss_pct}% | TARGET R:R: 1:${strategy.target_risk_reward}`;
      setBotSkillsMap((prev) => {
        const botConf = prev[targetBot.id] || { modules: {}, customPrompt: '' };
        const nextMap = {
          ...prev,
          [targetBot.id]: {
            ...botConf,
            customPrompt: formattedRules,
            activePreset: 'custom'
          }
        };
        try {
          localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(nextMap));
        } catch (e) {}
        return nextMap;
      });

      // Update bots in App.jsx
      if (onUpdateBots) {
        const updated = bots.map((b) => {
          if (b.id === targetBot.id) {
            return {
              ...b,
              strategy: `[Vault Strategy]: ${strategy.name}`
            };
          }
          return b;
        });
        onUpdateBots(updated);
      }
    } catch (e) {
      soundEngine.playAlertChime();
      setAssignFeedback((prev) => ({
        ...prev,
        [strategy.id]: `❌ Error: ${e.message}`
      }));
    } finally {
      setTimeout(() => {
        setAssignFeedback((prev) => {
          const next = { ...prev };
          delete next[strategy.id];
          return next;
        });
      }, 4000);
    }
  };

  const handleRecordNewStrategy = async (e) => {
    e.preventDefault();
    if (!newStrategyForm.name.trim() || !newStrategyForm.entry_rules.trim()) return;

    try {
      const payload = {
        id: `strat_${Date.now()}`,
        name: newStrategyForm.name.trim(),
        category: newStrategyForm.category,
        asset: newStrategyForm.asset,
        entry_rules: newStrategyForm.entry_rules.trim(),
        exit_rules: newStrategyForm.exit_rules.trim() || 'Exit at 1:2 R:R or trailing stop.',
        stop_loss_pct: Number(newStrategyForm.stop_loss_pct) || 0.5,
        target_risk_reward: Number(newStrategyForm.target_risk_reward) || 2.0,
        indicators: newStrategyForm.indicators.split(',').map((s) => s.trim()).filter(Boolean),
        capital_allocation_pct: Number(newStrategyForm.capital_allocation_pct) || 1.0
      };

      const res = await apiFetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        soundEngine.playBuyChime();
        setIsRecordModalOpen(false);
        setNewStrategyForm({
          name: '',
          category: 'Momentum Breakout',
          asset: 'NIFTY 50',
          entry_rules: '',
          exit_rules: '',
          stop_loss_pct: 0.35,
          target_risk_reward: 2.0,
          indicators: '15m High/Low, Volume 20-SMA, 9 EMA',
          capital_allocation_pct: 1.0
        });
        await fetchStrategies();
      }
    } catch (err) {
      soundEngine.playAlertChime();
      console.error('Failed to record strategy:', err);
    }
  };

  // Load persistent skills map from localStorage
  const [botSkillsMap, setBotSkillsMap] = useState(() => {
    try {
      const saved = localStorage.getItem(SKILLS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    // Default initial skills state
    const initialMap = {};
    bots.forEach((b) => {
      initialMap[b.id] = {
        modules: {
          order_flow: { enabled: true, sensitivity: 85 },
          supertrend_mult: { enabled: true, sensitivity: 90 },
          transformer_ml: { enabled: true, sensitivity: 88 },
          volume_spread: { enabled: false, sensitivity: 80 },
          options_greeks: { enabled: b.assetCategory?.includes('Derivatives') || b.asset.includes('OPTIONS'), sensitivity: 75 },
          bollinger_squeeze: { enabled: false, sensitivity: 70 },
          smc_liquidity: { enabled: true, sensitivity: 84 }
        },
        customPrompt: STRATEGY_PRESETS.aggressive,
        activePreset: 'aggressive'
      };
    });
    return initialMap;
  });

  const selectedBot = bots.find((b) => b.id === selectedBotId) || bots[0] || { id: 1, name: 'Scalper Bot', asset: 'NIFTY 50' };
  const currentSkills = botSkillsMap[selectedBotId] || {
    modules: {},
    customPrompt: STRATEGY_PRESETS.aggressive,
    activePreset: 'aggressive'
  };

  // Toggle skill module on/off
  const handleToggleModule = (moduleId) => {
    setBotSkillsMap((prev) => {
      const botConf = prev[selectedBotId] || { modules: {}, customPrompt: '' };
      const currentMod = botConf.modules[moduleId] || { enabled: false, sensitivity: 80 };
      const updatedBotConf = {
        ...botConf,
        modules: {
          ...botConf.modules,
          [moduleId]: {
            ...currentMod,
            enabled: !currentMod.enabled
          }
        }
      };
      const nextMap = { ...prev, [selectedBotId]: updatedBotConf };
      try {
        localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(nextMap));
      } catch (e) {
        console.error(e);
      }
      return nextMap;
    });
    triggerSaveFeedback();
  };

  // Adjust sensitivity slider
  const handleSensitivityChange = (moduleId, val) => {
    const num = Number(val);
    setBotSkillsMap((prev) => {
      const botConf = prev[selectedBotId] || { modules: {}, customPrompt: '' };
      const currentMod = botConf.modules[moduleId] || { enabled: true, sensitivity: 80 };
      const updatedBotConf = {
        ...botConf,
        modules: {
          ...botConf.modules,
          [moduleId]: {
            ...currentMod,
            sensitivity: num
          }
        }
      };
      const nextMap = { ...prev, [selectedBotId]: updatedBotConf };
      try {
        localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(nextMap));
      } catch (e) {
        console.error(e);
      }
      return nextMap;
    });
  };

  // Update custom strategy prompt
  const handleCustomPromptChange = (val) => {
    setBotSkillsMap((prev) => {
      const botConf = prev[selectedBotId] || { modules: {}, customPrompt: '' };
      const updatedBotConf = { ...botConf, customPrompt: val, activePreset: 'custom' };
      const nextMap = { ...prev, [selectedBotId]: updatedBotConf };
      try {
        localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(nextMap));
      } catch (e) {
        console.error(e);
      }
      return nextMap;
    });
  };

  // Apply preset rule template
  const handleApplyPreset = (presetKey) => {
    const presetText = STRATEGY_PRESETS[presetKey];
    if (!presetText) return;
    setBotSkillsMap((prev) => {
      const botConf = prev[selectedBotId] || { modules: {}, customPrompt: '' };
      const updatedBotConf = { ...botConf, customPrompt: presetText, activePreset: presetKey };
      const nextMap = { ...prev, [selectedBotId]: updatedBotConf };
      try {
        localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(nextMap));
      } catch (e) {
        console.error(e);
      }
      return nextMap;
    });
    soundEngine.playBuyChime();
    triggerSaveFeedback();
  };

  // Save all skills to bot configuration
  const handleSaveAndCompile = () => {
    soundEngine.playBuyChime();
    triggerSaveFeedback();

    // Propagate strategy updates to bots state in App.jsx
    if (onUpdateBots) {
      const updatedBots = bots.map((b) => {
        if (b.id === selectedBotId) {
          const enabledCount = Object.values(currentSkills.modules || {}).filter((m) => m?.enabled).length;
          return {
            ...b,
            strategy: `[Upgraded AI Core v2.4 • ${enabledCount} Skill Modules]: ${currentSkills.customPrompt.slice(0, 110)}...`
          };
        }
        return b;
      });
      onUpdateBots(updatedBots);
    }
  };

  const triggerSaveFeedback = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Compute active skills count for current bot
  const activeModulesCount = Object.values(currentSkills.modules || {}).filter((m) => m?.enabled).length;
  const synergyScore = Math.min(99, 65 + activeModulesCount * 5.5).toFixed(1);

  return (
    <div className="space-y-4 animate-fadeIn select-none font-sans">
      {/* 1. Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-slate-950 shadow-[0_0_15px_rgba(0,240,255,0.4)]">
            <Zap className="w-5 h-5 text-slate-950 fill-current" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Bot Skills & AI Upgrade Center <span className="text-cyan-400">(Moddable Strategy Engine)</span>
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Equip proprietary algorithmic skill modules, calibrate neural sensitivity, and inject custom strategy rules
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/40 px-3 py-1 rounded-full animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Skills Compiled & Active
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveAndCompile}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.35)] transition-all cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-slate-950" />
            <span>Save & Compile Upgrades</span>
          </button>
        </div>
      </div>

      {/* View Mode Tabs: Strategy Vault vs Modular Skills Matrix */}
      <div className="flex items-center gap-2 border-b border-[#1e3a6e]/40 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('vault')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'vault'
              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/30 text-cyan-300 border border-cyan-500/60 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
              : 'bg-[#070e1e] text-slate-400 hover:text-white border border-[#1e3a6e]/40'
          }`}
        >
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <span>Strategy Vault & Dynamic Recorder ({strategies.length || 6} Battle-Tested Algos)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('skills')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'skills'
              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/30 text-cyan-300 border border-cyan-500/60 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
              : 'bg-[#070e1e] text-slate-400 hover:text-white border border-[#1e3a6e]/40'
          }`}
        >
          <Sliders className="w-4 h-4 text-cyan-400" />
          <span>Modular Skills Matrix & Calibration</span>
        </button>
      </div>

      {/* TAB 1: DYNAMIC STRATEGY VAULT & MULTI-STRATEGY ENGINE */}
      {activeTab === 'vault' && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60 shadow-lg">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                Institutional Strategy Vault — Pre-Loaded Indian Market Algorithms
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Assign battle-tested algorithms to any bot in real-time or record custom rules into persistent SQLite storage
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchStrategies}
                disabled={isLoadingStrategies}
                className="px-3 py-2 rounded-xl bg-[#09152e] hover:bg-[#10244c] border border-[#1e3a6e] text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStrategies ? 'animate-spin' : ''}`} />
                <span>Refresh Vault</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRecordModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.35)] transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-slate-950 stroke-[3]" />
                <span>Record New Strategy</span>
              </button>
            </div>
          </div>

          {/* Strategy Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {strategies.map((strat) => {
              const currentAssignBot = assignTargetBots[strat.id] || selectedBotId;
              let indicatorList = [];
              try {
                indicatorList = typeof strat.indicators === 'string' ? JSON.parse(strat.indicators) : (strat.indicators || []);
              } catch (e) {
                indicatorList = [strat.indicators];
              }

              return (
                <div
                  key={strat.id}
                  className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 hover:border-cyan-500/50 rounded-2xl p-4 space-y-3.5 shadow-xl transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-500/30">
                          {strat.category}
                        </span>
                        <h4 className="text-sm font-bold text-white leading-snug">{strat.name}</h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/40 text-indigo-300 border border-indigo-500/30 shrink-0">
                        {strat.asset}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono py-1 border-y border-[#1e3a6e]/40">
                      <div>
                        <span className="text-slate-400">Stop-Loss: </span>
                        <strong className="text-rose-400">{strat.stop_loss_pct}%</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Target R:R: </span>
                        <strong className="text-emerald-400">1:{strat.target_risk_reward}</strong>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs font-mono">
                      <div className="text-[10.5px] font-bold text-cyan-300">Entry Trigger:</div>
                      <div className="p-2 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 text-[11px] text-slate-300 leading-relaxed max-h-20 overflow-y-auto">
                        {strat.entry_rules}
                      </div>
                    </div>

                    <div className="space-y-1 text-xs font-mono">
                      <div className="text-[10.5px] font-bold text-slate-400">Exit / SL Target:</div>
                      <div className="p-2 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/30 text-[10.5px] text-slate-400 leading-relaxed">
                        {strat.exit_rules}
                      </div>
                    </div>

                    {/* Indicator Pills */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {indicatorList.map((ind, idx) => (
                        <span
                          key={idx}
                          className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[#101d3b] text-cyan-300 border border-[#1e3a6e]/40"
                        >
                          {ind}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Assignment Controls */}
                  <div className="pt-2 border-t border-[#1e3a6e]/40 space-y-2">
                    {assignFeedback[strat.id] && (
                      <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold animate-fadeIn">
                        {assignFeedback[strat.id]}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <select
                        value={currentAssignBot}
                        onChange={(e) =>
                          setAssignTargetBots((prev) => ({ ...prev, [strat.id]: Number(e.target.value) }))
                        }
                        className="flex-1 bg-[#09152e] border border-[#1e3a6e] text-xs font-mono text-cyan-300 rounded-lg px-2 py-1.5 focus:outline-none"
                      >
                        {bots.map((b) => (
                          <option key={b.id} value={b.id}>
                            Bot #{b.id} - {b.name} ({b.asset})
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleAssignStrategy(strat, currentAssignBot)}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,240,255,0.3)] transition-all cursor-pointer shrink-0"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Deploy Strategy to Bot Matrix</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: MODULAR SKILLS MATRIX & CALIBRATION */}
      {activeTab === 'skills' && (
        <div className="space-y-4">
          {/* 2. 14-Bot Carousel / Selector Strip */}
      <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-2xl p-3 shadow-lg">
        <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mb-2 px-1">
          Select Bot to Upgrade & Calibrate:
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {bots.map((b) => {
            const isSelected = b.id === selectedBotId;
            const bSkills = botSkillsMap[b.id] || { modules: {} };
            const count = Object.values(bSkills.modules || {}).filter((m) => m?.enabled).length;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBotId(b.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-2 cursor-pointer border ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-500/25 to-blue-600/30 text-white border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.25)] font-bold'
                    : 'bg-[#070e1e] hover:bg-[#0e1d3d] text-slate-300 border-[#1e3a6e]/50'
                }`}
              >
                <span className="w-5 h-5 rounded-md bg-[#122349] text-cyan-300 font-mono font-bold text-[10px] flex items-center justify-center">
                  #{b.id}
                </span>
                <div className="text-left">
                  <div className="text-xs truncate max-w-[100px]">{b.name}</div>
                  <div className="text-[9.5px] font-mono text-cyan-400">{count} Skills</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main Workspace: Modular Skills Matrix + Custom Prompt Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Skill Modules Available (7 cols) */}
        <div className="lg:col-span-7 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3">
            <div>
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Modular Skill Upgrades for {selectedBot.name}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Target Asset: <strong className="text-white">{selectedBot.asset}</strong> • {selectedBot.assetCategory}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono text-slate-400">Synergy Score</span>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {synergyScore}%
              </div>
            </div>
          </div>

          {/* List of 7 Skill Modules */}
          <div className="space-y-3">
            {AVAILABLE_SKILL_MODULES.map((mod) => {
              const modState = currentSkills.modules[mod.id] || {
                enabled: false,
                sensitivity: mod.defaultSensitivity
              };
              const isEnabled = modState.enabled;

              return (
                <div
                  key={mod.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isEnabled
                      ? 'bg-[#070e1e] border-cyan-500/40 shadow-sm'
                      : 'bg-[#060c1c]/80 border-[#1e3a6e]/30 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">{mod.name}</span>
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-[#101e3d] text-cyan-300 border border-[#1e3a6e]">
                          {mod.badge}
                        </span>
                        {isEnabled && (
                          <span className="text-[9.5px] font-mono text-emerald-400 font-bold">
                            {mod.synergyBonus}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-sans mt-1 leading-relaxed">
                        {mod.desc}
                      </p>
                    </div>

                    {/* Enable/Disable Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleModule(mod.id)}
                      className={`px-3 py-1 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer shrink-0 ${
                        isEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                      }`}
                    >
                      {isEnabled ? 'Installed' : '+ Equip'}
                    </button>
                  </div>

                  {/* Sensitivity Slider when module is active */}
                  {isEnabled && (
                    <div className="mt-3 pt-2.5 border-t border-[#1e3a6e]/40 space-y-1 font-mono text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Algorithmic Sensitivity / Weight:</span>
                        <span className="font-bold text-cyan-300">{modState.sensitivity}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={modState.sensitivity}
                        onChange={(e) => handleSensitivityChange(mod.id, e.target.value)}
                        className="w-full accent-cyan-400 cursor-pointer h-1.5"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Custom Strategy Logic & AI Prompt Injection (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3">
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  Custom Strategy Logic / AI Prompt
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  Bot #{selectedBot.id} Core
                </span>
              </div>

              <p className="text-[11px] text-slate-400 font-sans mt-2.5 leading-relaxed">
                Feed explicit execution rules, indicator conditions, or AI system prompts directly into{' '}
                <strong className="text-white">{selectedBot.name}</strong>:
              </p>

              {/* Preset Chips */}
              <div className="flex flex-wrap gap-1.5 pt-2 mb-2 font-sans">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('aggressive')}
                  className={`px-2 py-0.8 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    currentSkills.activePreset === 'aggressive'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                      : 'bg-[#09152e] text-slate-400 hover:text-white border border-[#1e3a6e]'
                  }`}
                >
                  ⚡ Momentum Scalp
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('institutional')}
                  className={`px-2 py-0.8 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    currentSkills.activePreset === 'institutional'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                      : 'bg-[#09152e] text-slate-400 hover:text-white border border-[#1e3a6e]'
                  }`}
                >
                  🏛️ Wyckoff Absorption
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('options_gamma')}
                  className={`px-2 py-0.8 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    currentSkills.activePreset === 'options_gamma'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                      : 'bg-[#09152e] text-slate-400 hover:text-white border border-[#1e3a6e]'
                  }`}
                >
                  🎯 Gamma Squeeze
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('conservative')}
                  className={`px-2 py-0.8 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    currentSkills.activePreset === 'conservative'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                      : 'bg-[#09152e] text-slate-400 hover:text-white border border-[#1e3a6e]'
                  }`}
                >
                  🛡️ Conservative Guard
                </button>
              </div>

              {/* Strategy Prompt Textarea */}
              <div className="relative">
                <textarea
                  rows={10}
                  value={currentSkills.customPrompt}
                  onChange={(e) => handleCustomPromptChange(e.target.value)}
                  placeholder="Enter custom algorithmic rules, indicator weights, or execution prompt for this bot..."
                  className="w-full bg-[#060c1c] border border-[#1e3a6e] focus:border-cyan-400 rounded-xl p-3 text-xs font-mono text-cyan-200 placeholder-slate-600 focus:outline-none leading-relaxed resize-none shadow-inner"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-[10.5px] text-slate-400 font-sans leading-relaxed flex items-start gap-2 mt-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  Custom logic is evaluated in real-time alongside peer consensus quorum votes before orders route to broker.
                </span>
              </div>
            </div>

                <div className="pt-3">
                  <button
                    type="button"
                    onClick={handleSaveAndCompile}
                    className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Inject Rules into Bot #{selectedBot.id}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL: Record New Strategy into Vault */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1325] border border-cyan-500/50 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-[0_0_40px_rgba(0,0,0,0.9)] animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/60 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Record New Institutional Strategy
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRecordModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordNewStrategy} className="space-y-3.5 text-xs font-sans">
              <div>
                <label className="font-bold text-slate-200">Strategy Name</label>
                <input
                  type="text"
                  required
                  value={newStrategyForm.name}
                  onChange={(e) => setNewStrategyForm({ ...newStrategyForm, name: e.target.value })}
                  placeholder="e.g. Fib 0.618 Golden Pocket Absorption"
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-200">Category</label>
                  <select
                    value={newStrategyForm.category}
                    onChange={(e) => setNewStrategyForm({ ...newStrategyForm, category: e.target.value })}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="Momentum Breakout">Momentum Breakout</option>
                    <option value="Institutional Mean Reversion">Institutional Mean Reversion</option>
                    <option value="Pivot Analysis">Pivot Analysis</option>
                    <option value="Options Gamma Scalping">Options Gamma Scalping</option>
                    <option value="Volume Spread Analysis">Volume Spread Analysis</option>
                    <option value="SMC Liquidity Sweep">SMC Liquidity Sweep</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-200">Target Asset</label>
                  <input
                    type="text"
                    required
                    value={newStrategyForm.asset}
                    onChange={(e) => setNewStrategyForm({ ...newStrategyForm, asset: e.target.value })}
                    placeholder="e.g. NIFTY 50, BANKNIFTY"
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-200">Stop-Loss Threshold (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    value={newStrategyForm.stop_loss_pct}
                    onChange={(e) => setNewStrategyForm({ ...newStrategyForm, stop_loss_pct: e.target.value })}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-200">Target Risk:Reward Ratio</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    value={newStrategyForm.target_risk_reward}
                    onChange={(e) => setNewStrategyForm({ ...newStrategyForm, target_risk_reward: e.target.value })}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-200">Entry Trigger Rules</label>
                <textarea
                  rows={3}
                  required
                  value={newStrategyForm.entry_rules}
                  onChange={(e) => setNewStrategyForm({ ...newStrategyForm, entry_rules: e.target.value })}
                  placeholder="e.g. Price touches 0.618 Fib with Bullish Hammer candle and Delta > +1200..."
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] rounded-lg p-2.5 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-200">Exit / Profit Target Criteria</label>
                <textarea
                  rows={2}
                  value={newStrategyForm.exit_rules}
                  onChange={(e) => setNewStrategyForm({ ...newStrategyForm, exit_rules: e.target.value })}
                  placeholder="e.g. Exit at 1:2 R:R or trailing stop behind VWAP band."
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] rounded-lg p-2.5 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-200">Key Indicators (comma-separated)</label>
                <input
                  type="text"
                  value={newStrategyForm.indicators}
                  onChange={(e) => setNewStrategyForm({ ...newStrategyForm, indicators: e.target.value })}
                  placeholder="e.g. Fib 0.618, VWAP, Delta Footprint"
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1e3a6e]/40">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all cursor-pointer"
                >
                  Save Strategy to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

