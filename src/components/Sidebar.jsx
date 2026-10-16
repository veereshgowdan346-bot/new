import React from 'react';
import {
  LayoutDashboard,
  Bot,
  Network,
  Activity,
  LineChart,
  Cpu,
  BarChart2,
  PlaySquare,
  Layers,
  ShieldCheck,
  History,
  TrendingUp,
  Settings,
  Play,
  Square,
  CheckCircle2,
  Radio,
  ExternalLink,
  Landmark,
  Sparkles,
  Zap
} from 'lucide-react';

export const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'bots-monitor', label: 'Bots Monitor', icon: Bot, count: 14 },
  { id: 'ai-commander', label: 'AI Commander (Jarvis)', icon: Sparkles, count: 'AI' },
  { id: 'bot-skills', label: 'Bot Skills Hub', icon: Zap, count: 14 },
  { id: 'broker-accounts', label: 'Broker Accounts', icon: Landmark, count: 4 },
  { id: 'decision-network', label: 'Decision Network', icon: Network },
  { id: 'live-trading', label: 'Live Trading', icon: Activity },
  { id: 'market-watch', label: 'Market Watch', icon: LineChart },
  { id: 'strategy-builder', label: 'Strategy Builder', icon: Cpu },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'backtest', label: 'Backtest', icon: PlaySquare },
  { id: 'orders-positions', label: 'Orders & Positions', icon: Layers },
  { id: 'risk-management', label: 'Risk Management', icon: ShieldCheck },
  { id: 'trade-history', label: 'Trade History', icon: History },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({
  activeTab,
  setActiveTab,
  allBotsRunning,
  onStartAllBots,
  onStopAllBots,
  brokerConnections,
  onOpenBrokerModal,
  executionMode = 'PAPER',
  onSelectExecutionMode
}) {
  return (
    <>
      <aside className="hidden md:flex w-56 bg-[#070e1e]/95 border-r border-[#1e3a6e]/50 flex-col justify-between h-[calc(100vh-61px)] sticky top-[61px] select-none z-30 shrink-0 overflow-y-auto no-scrollbar">
      {/* Top Nav Items */}
      <div className="p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all group ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/25 to-blue-600/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.2)] font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#0e1b38]/70 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-cyan-400 drop-shadow-[0_0_6px_rgba(0,240,255,0.8)]' : 'text-slate-400'
                  }`}
                />
                <span className="tracking-wide text-left">{item.label}</span>
              </div>
              {item.count !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isActive
                      ? 'bg-cyan-400 text-[#070e1e]'
                      : 'bg-[#12244a] text-slate-300'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Section: Controls & Brokers */}
      <div className="p-3 space-y-3 border-t border-[#1e3a6e]/40 bg-[#060b17]/80">
        {/* Action Buttons: Start All / Stop All */}
        <div className="space-y-2">
          <button
            onClick={onStartAllBots}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-md ${
              allBotsRunning
                ? 'bg-gradient-to-r from-emerald-500/20 to-green-600/30 text-emerald-300 border border-emerald-400/60 shadow-[0_0_14px_rgba(16,185,129,0.3)]'
                : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 hover:border-emerald-400'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
            <span>Start All Bots</span>
          </button>

          <button
            onClick={onStopAllBots}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              !allBotsRunning
                ? 'bg-gradient-to-r from-rose-500/20 to-red-600/30 text-rose-300 border border-rose-400/60 shadow-[0_0_14px_rgba(244,63,94,0.3)]'
                : 'bg-[#160c1d] text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-400'
            }`}
          >
            <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            <span>Stop All Bots</span>
          </button>
        </div>

        {/* Dual-Engine Switch: Paper vs Live Trading */}
        <div className="bg-[#071022] p-1.5 rounded-xl border border-[#1e3a6e]/70 space-y-1 shadow-inner">
          <div className="flex items-center justify-between px-1 text-[9px] font-mono uppercase tracking-wider text-slate-400 font-bold">
            <span>Trading Engine</span>
            <span className={`w-1.5 h-1.5 rounded-full ${executionMode === 'LIVE' ? 'bg-rose-500 animate-ping' : 'bg-cyan-400'}`} />
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono font-bold">
            <button
              type="button"
              onClick={() => onSelectExecutionMode && onSelectExecutionMode('PAPER')}
              className={`py-1.5 px-1 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                executionMode === 'PAPER'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/70 shadow-[0_0_10px_rgba(0,240,255,0.3)] font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
              title="Switch to Paper Trading (₹5,00,000 Virtual Capital)"
            >
              <span>📝 PAPER</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectExecutionMode && onSelectExecutionMode('LIVE')}
              className={`py-1.5 px-1 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                executionMode === 'LIVE'
                  ? 'bg-gradient-to-r from-rose-600/40 to-red-600/50 text-rose-300 border border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse font-black'
                  : 'text-slate-400 hover:text-rose-300 hover:bg-rose-950/30'
              }`}
              title="Switch to Live Trading (Real Capital via Angel One)"
            >
              <span>🔴 LIVE</span>
            </button>
          </div>
        </div>

        {/* Broker Connection Badges */}
        <div className="bg-[#09142b]/70 border border-[#1e3a6e]/50 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 tracking-wider">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              Broker Connections
            </span>
          </div>

          <div className="space-y-1.5">
            {brokerConnections.map((broker) => (
              <div
                key={broker.id}
                onClick={() => onOpenBrokerModal && onOpenBrokerModal(broker)}
                className="flex items-center justify-between p-1.5 rounded-lg bg-[#070e1e]/80 hover:bg-[#0d1e3d] border border-transparent hover:border-[#1e3a6e] cursor-pointer transition-colors text-[11px]"
                title={`Click to manage ${broker.name}`}
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    {broker.status === 'Connected' ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-600"></span>
                    )}
                  </span>
                  <span className="text-slate-200 font-medium truncate max-w-[90px]">{broker.name}</span>
                </div>
                <span className={`text-[10px] font-medium ${broker.status === 'Connected' ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                  {broker.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>

    {/* Mobile Bottom Navigation Bar (Touch-friendly for mobile screens < 768px) */}
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#070e1e]/95 backdrop-blur-xl border-t border-[#1e3a6e]/60 z-50 px-2 py-1.5 flex items-center justify-around gap-1 overflow-x-auto no-scrollbar shadow-[0_-5px_20px_rgba(0,0,0,0.8)]">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center p-1.5 rounded-xl text-[9px] font-medium transition-all shrink-0 min-w-[54px] cursor-pointer ${
              isActive
                ? 'text-cyan-300 font-bold bg-cyan-500/15 border border-cyan-400/40 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400 scale-110' : ''}`} />
            <span className="truncate max-w-[48px] mt-0.5">{item.label}</span>
          </button>
        );
      })}
    </nav>
    </>
  );
}

