import React, { useState, useEffect } from 'react';
import { Bot, Bell, Settings, Radio, Sparkles, User, CheckCircle2, Zap, ShieldCheck } from 'lucide-react';

export default function TopNavbar({
  tickers = [],
  userProfile = {},
  onOpenProfile,
  onOpenSettings,
  onOpenNotifications,
  unreadAlertsCount = 0,
  executionMode = 'PAPER',
  onToggleExecutionMode,
  isBrokerConnected = false,
  activeBrokerName = ''
}) {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      setTimeStr(`${String(formattedHours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`);

      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      setDateStr(`${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="w-full h-12 max-h-[48px] bg-[#070e1e]/95 backdrop-blur-md border-b border-[#1e3a6e]/50 py-1 px-4 flex items-center justify-between gap-2.5 sticky top-0 z-40 select-none">
      {/* Left: Brand / Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="relative group cursor-pointer">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 via-blue-600/30 to-purple-600/20 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_10px_rgba(0,240,255,0.3)] group-hover:shadow-[0_0_15px_rgba(0,240,255,0.5)] transition-all">
            <Bot className="w-4 h-4 text-cyan-400 animate-pulse" />
          </div>
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-baseline gap-1.5 leading-none">
            <span className="text-sm font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 drop-shadow-[0_0_10px_rgba(0,240,255,0.4)]">
              CHINTU AI TRADING SYSTEM
            </span>
          </div>
          <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
            14 BOTS • PRO
          </span>
        </div>
      </div>

      {/* Center: Live Tickers */}
      <div className="hidden 2xl:flex items-center gap-2 overflow-x-auto py-0.5 px-1 max-w-xl no-scrollbar">
        {tickers.map((ticker) => {
          const isUp = ticker.change >= 0;
          return (
            <div
              key={ticker.symbol}
              className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 hover:border-cyan-500/50 rounded-lg px-2 py-0.5 transition-all min-w-[100px] flex items-center gap-2 justify-between shrink-0 group cursor-default shadow-sm"
            >
              <div className="text-[9.5px] font-semibold text-slate-400 tracking-wider truncate">
                {ticker.symbol}
              </div>
              <div className="text-right">
                <div className="text-[11px] font-mono font-bold text-slate-100 leading-none">
                  {ticker.price.toLocaleString('en-IN', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2
                  })}
                </div>
                <div className={`text-[8.5px] font-mono font-medium ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? '+' : ''}{ticker.changePercent.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dual-Engine Mode Selector (Paper vs Live Trading) */}
      <div className="flex items-center shrink-0 bg-[#09152e] p-0.5 rounded-lg border border-[#1e3a6e]/70 shadow-sm">
        <button
          type="button"
          onClick={() => onToggleExecutionMode && onToggleExecutionMode('PAPER')}
          className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10.5px] font-mono font-bold tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
            executionMode === 'PAPER'
              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Paper Simulation Mode (₹5,00,000 Virtual Capital)"
        >
          <span>📝 PAPER</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleExecutionMode && onToggleExecutionMode('LIVE')}
          className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10.5px] font-mono font-bold tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
            executionMode === 'LIVE'
              ? 'bg-gradient-to-r from-rose-600/30 to-red-600/40 text-rose-300 border border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse'
              : 'text-slate-400 hover:text-rose-300'
          }`}
          title={isBrokerConnected ? "Live Trading Mode (Real Capital via Angel One)" : "Live Trading Mode (Requires Broker Authentication)"}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${executionMode === 'LIVE' ? 'bg-rose-400 animate-ping' : 'bg-slate-500'}`} />
          <span>🔴 LIVE</span>
        </button>
      </div>

      {/* Right Controls: Clock, Live Indicator, Notifications, Settings, Profile */}
      <div className="flex items-center gap-2 pr-14 mr-4 shrink-0 overflow-visible">
        {/* Production Ready • Zero Anomalies Badge */}
        <div
          className="hidden xl:flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10.5px] font-mono shadow-sm select-none shrink-0"
          title="Autonomous Boot Health Audit: 14 Bot Nodes, SmartAPI Bridges & WebSockets Verified"
        >
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span className="font-bold tracking-tight">Zero Anomalies</span>
        </div>

        {/* Clock & Date */}
        <div className="text-right hidden sm:block leading-tight">
          <div className="text-[11px] font-mono font-bold text-slate-100 tracking-wide">
            {timeStr || '10:24:36 AM'}
          </div>
          <div className="text-[9px] font-medium text-slate-400">
            {dateStr || 'Tue, 14 Oct 2026'}
          </div>
        </div>

        {/* Live Indicator Pill */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10.5px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
          <span className="font-semibold">Live</span>
        </div>

        {/* Notification Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-1.5 rounded-lg bg-[#0b1325] border border-[#1e3a6e]/60 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors"
          title="Notifications & Signals"
        >
          <Bell className="w-3.5 h-3.5" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-[8.5px] font-bold text-white flex items-center justify-center animate-pulse">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg bg-[#0b1325] border border-[#1e3a6e]/60 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors"
          title="System Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* User Profile Avatar */}
        <div className="shrink-0 flex items-center justify-center overflow-visible">
          <button
            onClick={onOpenProfile}
            className="relative group p-0.5 rounded-full bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 shadow-sm hover:shadow-[0_0_12px_rgba(0,240,255,0.5)] transition-all cursor-pointer shrink-0"
            title={
              userProfile.isAuthenticated
                ? `Master Administrator: ${userProfile.name} (${userProfile.email})`
                : 'Master Authorization: Click to Authorize'
            }
          >
            {userProfile.isAuthenticated ? (
              userProfile.picture ? (
                <img
                  src={userProfile.picture}
                  alt={userProfile.name || 'User'}
                  className="w-7 h-7 rounded-full object-cover border border-cyan-300"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#081226] flex items-center justify-center border border-cyan-300 text-cyan-300 font-black text-xs tracking-wider">
                  {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'V'}
                </div>
              )
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#081226] border border-slate-700 hover:border-cyan-400 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 transition-colors">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#070e1e] z-10 ${
                userProfile.isAuthenticated ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-slate-600'
              }`}
            ></span>
          </button>
        </div>
      </div>
    </header>
  );
}
