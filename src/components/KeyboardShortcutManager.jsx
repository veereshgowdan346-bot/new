import React, { useState, useEffect, useCallback } from 'react';
import {
  Keyboard,
  X,
  AlertOctagon,
  Play,
  Pause,
  Layers,
  Sparkles,
  Activity,
  BarChart2,
  Cpu,
  ShieldAlert,
  HelpCircle,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { soundEngine } from '../utils/audioChime';
import { voiceAssistant } from '../utils/voiceAssistant';

// Key mappings definition for documentation & execution
export const KEYBOARD_SHORTCUTS = [
  {
    category: 'Critical Safety & Controls',
    items: [
      { keyCombo: 'Shift + Esc', altKey: 'Space', desc: 'Emergency Stop: Hault all 14 bots immediately', action: 'EMERGENCY_STOP' },
      { keyCombo: 'Shift + Enter', altKey: 'Alt + S', desc: 'Resume / Start All Bots into active trading', action: 'START_ALL_BOTS' },
      { keyCombo: 'Alt + M', altKey: 'M', desc: 'Toggle Execution Mode (PAPER ⇄ LIVE)', action: 'TOGGLE_MODE' },
      { keyCombo: '?', altKey: 'F1', desc: 'Open / Close Shortcuts Help Palette', action: 'TOGGLE_HELP' },
    ]
  },
  {
    category: 'Primary Dashboard Views (Direct Keys 1-0)',
    items: [
      { keyCombo: '1', altKey: 'Alt + 1', desc: 'Master Dashboard (Overview & Core Matrix)', tab: 'dashboard' },
      { keyCombo: '2', altKey: 'Alt + 2', desc: 'Bots Monitor (14 Bot Health & Nodes)', tab: 'bots-monitor' },
      { keyCombo: '3', altKey: 'Alt + 3', desc: 'AI Commander (Jarvis Copilot & Voice)', tab: 'ai-commander' },
      { keyCombo: '4', altKey: 'Alt + 4', desc: 'Decision Network (Quorum Consensus 9/14)', tab: 'decision-network' },
      { keyCombo: '5', altKey: 'Alt + 5', desc: 'Live Trading Terminal (DMA & Order Book)', tab: 'live-trading' },
      { keyCombo: '6', altKey: 'Alt + 6', desc: 'Market Watch (Multi-Asset Quotes)', tab: 'market-watch' },
      { keyCombo: '7', altKey: 'Alt + 7', desc: 'Orders & Positions (Portfolio Book)', tab: 'orders-positions' },
      { keyCombo: '8', altKey: 'Alt + 8', desc: 'Analytics (Monte Carlo & Sharpe Studio)', tab: 'analytics' },
      { keyCombo: '9', altKey: 'Alt + 9', desc: 'Risk Management (RMS & Circuit Breakers)', tab: 'risk-management' },
      { keyCombo: '0', altKey: 'Alt + 0', desc: 'Backtest Engine (SEBI Taxed Simulation)', tab: 'backtest' },
    ]
  },
  {
    category: 'Specialized Quant Hubs',
    items: [
      { keyCombo: 'B', altKey: 'Alt + B', desc: 'Broker Accounts (Angel One, Zerodha, Upstox)', tab: 'broker-accounts' },
      { keyCombo: 'K', altKey: 'Alt + K', desc: 'Bot Skills Hub (Moddable Strategy Engine)', tab: 'bot-skills' },
      { keyCombo: 'L', altKey: 'Alt + L', desc: 'Strategy Library & Importer', tab: 'strategy-library' },
      { keyCombo: 'U', altKey: 'Alt + U', desc: 'Strategy Builder & Rule Matrix', tab: 'strategy-builder' },
      { keyCombo: 'H', altKey: 'Alt + H', desc: 'Trade History (Audit Receipts & CSV)', tab: 'trade-history' },
      { keyCombo: 'P', altKey: 'Alt + P', desc: 'Performance (Monthly Heatmap)', tab: 'performance' },
      { keyCombo: ',', altKey: 'Alt + ,', desc: 'System Settings & Architecture', tab: 'settings' },
    ]
  }
];

export default function KeyboardShortcutManager({
  activeTab,
  setActiveTab,
  allBotsRunning,
  onStartAllBots,
  onStopAllBots,
  onSquareOffAll,
  executionMode,
  onToggleExecutionMode,
  isHelpOpen,
  setIsHelpOpen
}) {
  const [hudNotice, setHudNotice] = useState(null);

  // Trigger feedback HUD
  const triggerHud = useCallback((title, message, type = 'info') => {
    setHudNotice({ title, message, type });
    const timer = setTimeout(() => {
      setHudNotice(null);
    }, 2400);
    return () => clearTimeout(timer);
  }, []);

  // Global keydown event listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Identify if target is an interactive form element (input, textarea, select, or contenteditable)
      const target = e.target;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // If user presses Escape inside an input, blur it
      if (e.key === 'Escape') {
        if (isInput) {
          target.blur();
          return;
        }
        if (isHelpOpen) {
          setIsHelpOpen(false);
          return;
        }
      }

      // If inside an input, do NOT trigger single key or navigation shortcuts
      if (isInput) {
        // Exception: Emergency Stop combo Shift + Escape should ALWAYS work even in inputs
        if (e.shiftKey && e.key === 'Escape') {
          e.preventDefault();
          target.blur();
          executeEmergencyStop();
        }
        return;
      }

      // 2. Global Shortcuts when NOT in input:

      // Emergency Stop: Shift + Escape OR Space (when not typing)
      if ((e.shiftKey && e.key === 'Escape') || (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'Space')) {
        e.preventDefault();
        if (allBotsRunning) {
          executeEmergencyStop();
        } else {
          executeResumeBots();
        }
        return;
      }

      // Resume all bots: Shift + Enter OR Alt + S
      if ((e.shiftKey && e.key === 'Enter') || (e.altKey && e.code === 'KeyS')) {
        e.preventDefault();
        executeResumeBots();
        return;
      }

      // Toggle Execution Mode: Alt + M OR direct 'm' / 'M'
      if ((e.altKey && e.code === 'KeyM') || (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'm' || e.key === 'M'))) {
        e.preventDefault();
        if (onToggleExecutionMode) {
          onToggleExecutionMode();
          const next = executionMode === 'LIVE' ? 'PAPER' : 'LIVE';
          triggerHud('Execution Mode Switched', `Active Mode: ${next}`, 'mode');
        }
        return;
      }

      // Open Help Palette: '?' (Shift + /) OR F1
      if ((e.key === '?' && !e.ctrlKey && !e.altKey) || e.key === 'F1') {
        e.preventDefault();
        setIsHelpOpen((prev) => !prev);
        soundEngine.playBuyChime();
        return;
      }

      // 3. Navigation Shortcuts: Numbers 1-0
      const numberNavMap = {
        'Digit1': 'dashboard',
        'Digit2': 'bots-monitor',
        'Digit3': 'ai-commander',
        'Digit4': 'decision-network',
        'Digit5': 'live-trading',
        'Digit6': 'market-watch',
        'Digit7': 'orders-positions',
        'Digit8': 'analytics',
        'Digit9': 'risk-management',
        'Digit0': 'backtest',
        // Also support Numpad keys
        'Numpad1': 'dashboard',
        'Numpad2': 'bots-monitor',
        'Numpad3': 'ai-commander',
        'Numpad4': 'decision-network',
        'Numpad5': 'live-trading',
        'Numpad6': 'market-watch',
        'Numpad7': 'orders-positions',
        'Numpad8': 'analytics',
        'Numpad9': 'risk-management',
        'Numpad0': 'backtest',
      };

      if (!e.ctrlKey && !e.metaKey && numberNavMap[e.code]) {
        e.preventDefault();
        const tab = numberNavMap[e.code];
        switchView(tab, e.key);
        return;
      }

      // 4. Letter Navigation Shortcuts (when no modifier or with Alt)
      if (!e.ctrlKey && !e.metaKey) {
        const letterKey = e.key.toLowerCase();
        const letterNavMap = {
          'b': { tab: 'broker-accounts', name: 'Broker Accounts' },
          'k': { tab: 'bot-skills', name: 'Bot Skills Hub' },
          'l': { tab: 'strategy-library', name: 'Strategy Library' },
          'u': { tab: 'strategy-builder', name: 'Strategy Builder' },
          'h': { tab: 'trade-history', name: 'Trade History' },
          'p': { tab: 'performance', name: 'Performance Matrix' },
          ',': { tab: 'settings', name: 'Settings' }
        };

        if (letterNavMap[letterKey]) {
          e.preventDefault();
          switchView(letterNavMap[letterKey].tab, letterKey.toUpperCase());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    allBotsRunning,
    executionMode,
    isHelpOpen,
    onStartAllBots,
    onStopAllBots,
    onToggleExecutionMode,
    setActiveTab,
    setIsHelpOpen,
    triggerHud
  ]);

  // Execute emergency stop
  const executeEmergencyStop = async () => {
    if (onStopAllBots) onStopAllBots();
    if (onSquareOffAll) {
      try {
        await onSquareOffAll();
      } catch (e) {}
    }
    soundEngine.playEmergencyChime();
    voiceAssistant.speak('Emergency stop triggered. All broker positions squared off and bot execution suspended.', { rate: 1.1 });
    triggerHud('🛑 EMERGENCY STOP ACTIVATED', 'All broker positions squared off & 14 bots halted [Shift+Esc]', 'error');
  };

  // Execute resume bots
  const executeResumeBots = () => {
    if (onStartAllBots) onStartAllBots();
    soundEngine.playBuyChime();
    voiceAssistant.speak('Resuming all bot nodes. Automated trading active.', { rate: 1.1 });
    triggerHud('✅ BOTS ACTIVE', 'All 14 bot nodes resumed operations [Shift+Enter]', 'success');
  };

  // Helper to switch view with feedback
  const switchView = (tabId, keyTrigger) => {
    setActiveTab(tabId);
    soundEngine.playBuyChime();
    const tabName = tabId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    triggerHud(`Navigated [${keyTrigger}]`, tabName, 'nav');
  };

  return (
    <>
      {/* 1. Floating Screen HUD Trigger Banner (Appears on shortcut activation) */}
      {hudNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-slideInRight">
          <div
            className={`px-4 py-2.5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 font-mono text-xs ${
              hudNotice.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/80 text-rose-200 shadow-[0_0_25px_rgba(244,63,94,0.5)]'
                : hudNotice.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-400/80 text-emerald-200 shadow-[0_0_25px_rgba(52,211,153,0.5)]'
                : 'bg-[#081226]/95 border-cyan-400/70 text-cyan-200 shadow-[0_0_25px_rgba(0,240,255,0.4)]'
            }`}
          >
            {hudNotice.type === 'error' && <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 animate-bounce" />}
            {hudNotice.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {hudNotice.type === 'nav' && <Zap className="w-5 h-5 text-cyan-400 shrink-0" />}
            {hudNotice.type === 'mode' && <Activity className="w-5 h-5 text-amber-400 shrink-0" />}
            <div>
              <div className="font-bold tracking-wider uppercase text-[11px]">{hudNotice.title}</div>
              <div className="text-[10px] opacity-90">{hudNotice.message}</div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Interactive Keyboard Shortcuts Palette Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none">
          <div className="bg-[#080e1b] border border-[#1e3a6e] rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-[0_0_40px_rgba(0,82,204,0.3)] relative">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#16294a]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                    Global Keyboard Shortcuts Manager
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Instant zero-latency command keys active across the entire terminal
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action Banner */}
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white">Emergency Circuit Breaker Trigger:</span>
                  <span className="text-[11px] text-slate-300 font-mono block">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-rose-900/60 border border-rose-500/50 text-rose-200 font-bold">Shift + Esc</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-white">Space</kbd> anytime
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (allBotsRunning) executeEmergencyStop();
                  else executeResumeBots();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                  allBotsRunning
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-400 hover:bg-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400 hover:bg-emerald-500/30'
                }`}
              >
                {allBotsRunning ? 'Trip Emergency Stop Now' : 'Resume All Bots Now'}
              </button>
            </div>

            {/* Shortcut Categories List */}
            <div className="space-y-4 max-h-[55vh] overflow-y-auto no-scrollbar pr-1">
              {KEYBOARD_SHORTCUTS.map((section, sIdx) => (
                <div key={sIdx} className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                    {section.category}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {section.items.map((item, iIdx) => (
                      <div
                        key={iIdx}
                        onClick={() => {
                          if (item.tab) {
                            switchView(item.tab, item.keyCombo);
                            setIsHelpOpen(false);
                          } else if (item.action === 'EMERGENCY_STOP') {
                            executeEmergencyStop();
                          } else if (item.action === 'START_ALL_BOTS') {
                            executeResumeBots();
                          } else if (item.action === 'TOGGLE_MODE' && onToggleExecutionMode) {
                            onToggleExecutionMode();
                          }
                        }}
                        className="p-2.5 rounded-xl bg-[#060c1c] border border-[#1e3a6e]/50 hover:border-cyan-500/50 hover:bg-[#0c1833] flex items-center justify-between gap-2 transition-all cursor-pointer group"
                      >
                        <span className="text-xs text-slate-300 group-hover:text-white font-sans truncate">
                          {item.desc}
                        </span>

                        <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                          <kbd className="px-2 py-0.5 rounded bg-[#09152e] border border-cyan-500/40 text-cyan-300 font-bold group-hover:border-cyan-400">
                            {item.keyCombo}
                          </kbd>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-[#16294a] flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Pro Tip: Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-200">?</kbd> anywhere to toggle this palette</span>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#0052cc] text-white hover:bg-blue-600 transition-all cursor-pointer"
              >
                Close Palette
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
