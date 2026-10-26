import React, { useState } from 'react';
import { Bot, Bell, Settings, Search, User, ShieldCheck, Keyboard, Sun, Moon, Lock, Contrast } from 'lucide-react';
import EmergencyKillSwitch from './EmergencyKillSwitch';
import RealtimePnlTracker from './RealtimePnlTracker';

export default function TopNavbar({
  tickers = [],
  userProfile = {},
  onOpenProfile,
  onOpenSettings,
  onOpenNotifications,
  onOpenShortcuts,
  unreadAlertsCount = 0,
  executionMode = 'PAPER',
  onToggleExecutionMode,
  theme = 'dark',
  onToggleTheme,
  isBrokerConnected = false,
  activeBrokerName = '',
  positions = [],
  bots = [],
  recentTrades = [],
  onSquareOffAll,
  onResetEmergencyStop,
  brokerConnections = [],
  allBotsRunning = true,
  onStopAllBots,
  onStartAllBots,
  onSearch
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
  };

  return (
    <header className="w-full h-14 bg-[var(--surface-overlay,#05070b)] backdrop-blur-md border-b border-[var(--border-subtle,#16294a)] px-2 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-3 sticky top-0 z-40 select-none titlebar-drag-region">
      {/* 1. Left Brand: Logo + "Chintu AI" + "AI TRADING SYSTEM" */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500/20 via-blue-600/30 to-purple-600/20 border border-cyan-400/60 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.4)]">
          <Bot className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-black tracking-wider text-white">
            Chintu AI
          </span>
          <span className="hidden sm:inline text-[8.5px] font-bold tracking-widest text-cyan-400 uppercase">
            AI TRADING SYSTEM
          </span>
        </div>
      </div>

      {/* 2. Search Input */}
      <div className="hidden lg:flex items-center shrink-0">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search market, stock, index, strategy..."
            className="bg-[#091122]/90 border border-slate-700/60 hover:border-cyan-500/50 focus:border-cyan-400 text-xs text-slate-200 placeholder:text-slate-500 pl-8 pr-3 py-1.5 rounded-full w-44 xl:w-64 focus:outline-none transition-all shadow-inner"
          />
        </form>
      </div>

      {/* 3. Live Multi-Asset Ticker across the top bar */}
      <div className="hidden xl:flex items-center gap-2.5 overflow-x-auto py-1 no-scrollbar grow justify-center min-w-0">
        {tickers.map((ticker) => {
          const isUp = ticker.isPositive !== false && ticker.changePercent >= 0;
          return (
            <div
              key={ticker.symbol}
              className="flex items-center gap-2 px-2 py-0.5 rounded-md hover:bg-[#09142b]/60 transition-colors shrink-0 cursor-default"
            >
              <div className="text-[10.5px] font-bold text-slate-300 whitespace-nowrap">
                {ticker.symbol}
              </div>
              <div className="text-[11px] font-mono font-bold text-white">
                {ticker.price.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </div>
              <div className={`text-[10px] font-mono font-bold flex items-center ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isUp ? '+' : ''}{ticker.changePercent.toFixed(2)}%
              </div>

              {/* Mini Sparkline SVG */}
              <svg width="28" height="12" className="overflow-visible shrink-0 ml-0.5">
                <path
                  d={isUp ? 'M 1 9 Q 8 7, 14 5 T 26 2' : 'M 1 3 Q 8 5, 14 7 T 26 10'}
                  fill="none"
                  stroke={isUp ? '#10b981' : '#f43f5e'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          );
        })}
      </div>

      {/* 4. Right Controls: Live P&L Streamer, Mode Toggle, Emergency Kill Switch, Notifications & Profile Avatar */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 z-50" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Real-time Streaming P&L Widget (Responsive: hidden on narrow screens to preserve Kill Switch visibility) */}
        <div className="hidden sm:flex shrink-0">
          <RealtimePnlTracker
            positions={positions}
            bots={bots}
            recentTrades={recentTrades}
            executionMode={executionMode}
          />
        </div>

        {/* Engine Mode Toggle with Fail-Closed Lock */}
        <div className="hidden md:flex items-center rounded-full bg-[#050a16] border border-[#16294a] p-0.5 text-[10.5px] font-mono">
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
            title="Active: Institutional Paper Trading Simulation"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>PAPER</span>
          </div>
          <button
            type="button"
            onClick={() => onToggleExecutionMode && onToggleExecutionMode('LIVE')}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-slate-400 hover:text-rose-400 transition-colors cursor-pointer group"
            title="Live Trading is Fail-Closed and Locked. Click to view Safety & Compliance Gate."
          >
            <Lock className="w-3 h-3 text-rose-400/80 group-hover:text-rose-400" />
            <span className="text-[9.5px] font-bold text-slate-400 group-hover:text-rose-300">LIVE LOCKED</span>
          </button>
        </div>

        {/* Dedicated Pinned Emergency Kill Switch Control Dock */}
        <EmergencyKillSwitch
          positions={positions}
          onSquareOffAll={onSquareOffAll}
          onResetEmergencyStop={onResetEmergencyStop}
          brokerConnections={brokerConnections}
          allBotsRunning={allBotsRunning}
          onStopAllBots={onStopAllBots}
          onStartAllBots={onStartAllBots}
          executionMode={executionMode}
        />

        {/* Keyboard Shortcuts Trigger Button */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#091122] border border-[#16294a] hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 transition-colors text-[11px] font-mono cursor-pointer"
          title="Global Keyboard Shortcuts Manager (Press ?)"
        >
          <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
          <kbd className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-bold">?</kbd>
        </button>

        {/* Theme Toggle (Dark -> Dim -> Light -> Dark) */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-1.5 rounded-lg bg-[#091122] border border-[#16294a] text-slate-300 hover:text-cyan-400 hover:border-cyan-500/50 transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5 px-2"
          title={`Theme: ${theme.toUpperCase()} (Click to cycle Dark -> Dim -> Light)`}
          aria-label="Toggle visual theme"
        >
          {theme === 'dark' ? (
            <>
              <Moon className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] font-mono text-cyan-300 hidden sm:inline">Dark</span>
            </>
          ) : theme === 'dim' ? (
            <>
              <Contrast className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-mono text-sky-300 hidden sm:inline">Dim</span>
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-mono text-amber-600 hidden sm:inline">Light</span>
            </>
          )}
        </button>

        {/* Notifications Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-1.5 rounded-lg bg-[#091122] border border-[#16294a] text-slate-300 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors cursor-pointer"
          title="Notifications"
        >
          <Bell className="w-3.5 h-3.5" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-[8.5px] font-bold text-white flex items-center justify-center animate-pulse">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* User Profile Button */}
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-1.5 p-1 sm:pl-1 sm:pr-2.5 py-1 rounded-full bg-[#091122] border border-[#16294a] hover:border-cyan-500/60 transition-all cursor-pointer group shadow-sm shrink-0"
          title={userProfile?.isAuthenticated ? `Authenticated as ${userProfile.name}` : 'Login / Manage Profile'}
        >
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 font-bold text-xs">
            {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'C'}
          </div>
          <span className="hidden lg:inline text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
            {userProfile?.name || 'Chintu AI'}
          </span>
        </button>
      </div>
    </header>
  );
}
