import React from 'react';
import {
  LayoutDashboard,
  Bot,
  Sparkles,
  Zap,
  BookOpen,
  Landmark,
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
  LogOut,
  LogIn
} from 'lucide-react';
import NewsSentimentSidebarModule from './NewsSentimentSidebarModule';

export const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'trading-dashboard', label: 'Trading Dashboard', icon: TrendingUp },
  { id: 'bots-monitor', label: 'Bots Monitor', icon: Bot },
  { id: 'ai-commander', label: 'AI Commander (Jarvis)', icon: Sparkles },
  { id: 'bot-skills', label: 'Bot Skills Hub', icon: Zap },
  { id: 'strategy-library', label: 'Strategy Library', icon: BookOpen },
  { id: 'broker-accounts', label: 'Broker Accounts', icon: Landmark },
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
  { id: 'login-logout', label: 'Login / Logout', icon: LogOut },
];

class SidebarErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    console.warn('[SidebarErrorBoundary] Recovered from sidebar sub-module error:', err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 text-[11px] text-slate-400 font-mono text-center">
          News Feed Standby
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  onOpenProfile,
  userProfile = {}
}) {
  const handleItemClick = (itemId) => {
    if (itemId === 'login-logout') {
      if (onOpenProfile) {
        onOpenProfile();
      }
      return;
    }
    setActiveTab(itemId);
  };

  return (
    <>
      {/* Desktop Sidebar (Left column ~230px) */}
      <aside className="hidden md:flex w-56 bg-[#05070b]/98 border-r border-[#16294a]/80 flex-col justify-between h-[calc(100vh-56px)] sticky top-14 select-none z-30 shrink-0 overflow-y-auto no-scrollbar">
        <div className="p-2.5 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isLoginItem = item.id === 'login-logout';
            const FinalIcon = isLoginItem && !userProfile?.isAuthenticated ? LogIn : Icon;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group cursor-pointer text-left ${
                  isActive
                    ? 'bg-[#0052cc] text-white font-bold shadow-[0_0_12px_rgba(0,82,204,0.4)]'
                    : 'text-slate-300 hover:text-white hover:bg-[#0c1833]/80'
                }`}
              >
                <FinalIcon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${
                    isActive ? 'text-white' : 'text-slate-400'
                  }`}
                />
                <span className="tracking-wide truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Real-time News Sentiment Sidebar Module wrapped in Error Boundary */}
        <div className="mt-auto shrink-0 pb-3 pt-1 border-t border-[#16294a]/60">
          <SidebarErrorBoundary>
            <NewsSentimentSidebarModule
              onNavigateToDecisionNetwork={() => setActiveTab('decision-network')}
            />
          </SidebarErrorBoundary>
        </div>
      </aside>

      {/* Mobile Touch Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#05070b]/98 backdrop-blur-xl border-t border-[#16294a] z-50 px-2 py-1.5 flex items-center justify-around gap-1 overflow-x-auto no-scrollbar shadow-[0_-5px_20px_rgba(0,0,0,0.8)]">
        {navItems.slice(0, 8).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className={`flex flex-col items-center justify-center p-1.5 rounded-lg text-[9.5px] font-medium transition-all shrink-0 min-w-[50px] cursor-pointer ${
                isActive
                  ? 'text-cyan-300 font-bold bg-[#0052cc]/30 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400 scale-110' : ''}`} />
              <span className="truncate max-w-[48px] mt-0.5">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
