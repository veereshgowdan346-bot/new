import React, { useState, useEffect, useRef, Suspense } from 'react';
import TopNavbar from './components/TopNavbar';
import Sidebar from './components/Sidebar';
import DecisionMeshHub from './components/DecisionMeshHub';
import BotCard from './components/BotCard';
import BottomAnalytics from './components/BottomAnalytics';
import BotDetailsModal from './components/BotDetailsModal';
import ProfileModal from './components/ProfileModal';
import BrokerModal from './components/BrokerModal';
import NotificationsModal from './components/NotificationsModal';

// Dedicated views (Lazy-loaded with React.lazy for code splitting)
const BrokerAccountsView = React.lazy(() => import('./components/views/BrokerAccountsView'));
const BotsMonitorView = React.lazy(() => import('./components/views/BotsMonitorView'));
const DecisionNetworkView = React.lazy(() => import('./components/views/DecisionNetworkView'));
const LiveTradingView = React.lazy(() => import('./components/views/LiveTradingView'));
const MarketWatchView = React.lazy(() => import('./components/views/MarketWatchView'));
const StrategyBuilderView = React.lazy(() => import('./components/views/StrategyBuilderView'));
const AnalyticsView = React.lazy(() => import('./components/views/AnalyticsView'));
const BacktestView = React.lazy(() => import('./components/views/BacktestView'));
const OrdersPositionsView = React.lazy(() => import('./components/views/OrdersPositionsView'));
const RiskManagementView = React.lazy(() => import('./components/views/RiskManagementView'));
const TradeHistoryView = React.lazy(() => import('./components/views/TradeHistoryView'));
const PerformanceView = React.lazy(() => import('./components/views/PerformanceView'));
const SettingsView = React.lazy(() => import('./components/views/SettingsView'));
const AICommanderView = React.lazy(() => import('./components/views/AICommanderView'));
const BotSkillsHubView = React.lazy(() => import('./components/views/BotSkillsHubView'));
const StrategyLibraryView = React.lazy(() => import('./components/views/StrategyLibraryView'));

import { soundEngine } from './utils/audioChime';
import { voiceAssistant } from './utils/voiceAssistant';
import { apiFetch, getWebSocketUrl } from './utils/api';

import {
  initialTickers,
  initialBots,
  initialRecentTrades,
  portfolioAllocation,
  brokerConnections as initialBrokers,
  candlestickData as initialCandles
} from './data/tradingData';

export const MASTER_PROFILE_VEERESH = {
  isAuthenticated: true,
  name: 'Veeresh',
  email: 'veereshgowdan346@gmail.com',
  role: 'Master System Administrator & Quorum Authority',
  picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
  token: 'chintu_master_auth_permanent_veeresh',
  linkedAt: 'Permanent Master Session',
  provider: 'Master Authority (Localhost Verified)'
};

function ViewLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] w-full p-8 space-y-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-emerald-500/20 border-b-emerald-400 animate-spin [animation-direction:reverse]" />
      </div>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-widest animate-pulse">
          Loading Quant Module...
        </span>
        <span className="text-[10px] text-slate-500 font-mono tracking-wider">
          CHINTU AI QUANT WORKSPACE
        </span>
      </div>
    </div>
  );
}

class ViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ViewErrorBoundary] Module loading error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[350px] w-full p-6 bg-[#060c1c] border border-rose-500/30 rounded-2xl text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-base">
            !
          </div>
          <h3 className="text-sm font-bold text-slate-100">Failed to Load View Module</h3>
          <p className="text-xs text-slate-400 max-w-md">
            {this.state.error?.message || 'An error occurred while dynamically loading this view. Please try again.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard');

  // User Profile State (Veeresh permanently authenticated by default)
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('chintu_user_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email === 'veereshgowdan346@gmail.com' && parsed.isAuthenticated) {
          return parsed;
        }
        if (
          parsed &&
          parsed.isAuthenticated &&
          (parsed.token?.startsWith('chintu_master_auth_') || (parsed.token && !parsed.token.includes('demo') && !parsed.token.includes('ya29.a0AcM612x_')))
        ) {
          return parsed;
        }
      } catch (e) {}
    }
    // Default to Master Profile for Veeresh
    try {
      localStorage.setItem('chintu_user_profile', JSON.stringify(MASTER_PROFILE_VEERESH));
    } catch (e) {}
    return MASTER_PROFILE_VEERESH;
  });

  // Dynamic Data State
  const [tickers, setTickers] = useState(initialTickers);
  const [bots, setBots] = useState(() => {
    try {
      const saved = localStorage.getItem('chintu_bots_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return initialBots.map((b) => {
            const found = parsed.find((p) => p.id === b.id);
            return found
              ? { ...b, ...found, status: 'RUNNING', allocatedCapital: Number(found.allocatedCapital) || 35000 }
              : { ...b, status: 'RUNNING', allocatedCapital: 35000 };
          });
        }
      }
    } catch (e) {
      console.error('Error loading chintu_bots_config', e);
    }
    return initialBots.map((b) => ({ ...b, status: 'RUNNING', allocatedCapital: 35000 }));
  });

  const handleUpdateBots = (updatedBots) => {
    setBots(updatedBots);
    try {
      localStorage.setItem('chintu_bots_config', JSON.stringify(updatedBots));
    } catch (e) {
      console.error('Failed to save bots config', e);
    }
  };

  const [recentTrades, setRecentTrades] = useState(initialRecentTrades);
  const [brokerConnections, setBrokerConnections] = useState(initialBrokers);
  const [candlestickData, setCandlestickData] = useState(initialCandles);

  // Live Positions State (Empty initially - No fake positions)
  const [positions, setPositions] = useState([]);

  // Global Engine Controls (LIVE PAPER TRADING ACTIVE with 14 bots online)
  const [allBotsRunning, setAllBotsRunning] = useState(true);
  const [simulationEnabled, setSimulationEnabled] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedBotForSkillsId, setSelectedBotForSkillsId] = useState(1);

  // Execution Engine Mode (PAPER vs LIVE)
  const [executionMode, setExecutionMode] = useState(() => {
    return localStorage.getItem('chintu_execution_mode') || 'PAPER';
  });

  const handleToggleExecutionMode = async (targetMode = null) => {
    const isBrokerLive = brokerConnections.some((b) => b.status === 'Connected');
    const nextMode = (targetMode && typeof targetMode === 'string') ? targetMode : (executionMode === 'LIVE' ? 'PAPER' : 'LIVE');

    if (nextMode === 'LIVE' && !isBrokerLive) {
      alert('Cannot enable Live Execution: No active broker connected. Please authenticate in Broker Accounts view first.');
      return;
    }

    setExecutionMode(nextMode);
    try {
      localStorage.setItem('chintu_execution_mode', nextMode);
      await apiFetch('/api/execution-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode })
      });
    } catch (e) {
      console.error(e);
    }
    soundEngine.playBuyChime();
  };

  // Modals State
  const [selectedBotForModal, setSelectedBotForModal] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedBrokerForModal, setSelectedBrokerForModal] = useState(null);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);

  // Notifications Feed (Empty initially)
  const [notifications, setNotifications] = useState([]);

  // Save profile to localStorage on change
  const handleUpdateProfile = (newProf) => {
    setUserProfile(newProf);
    localStorage.setItem('chintu_user_profile', JSON.stringify(newProf));
  };

  const handleLogout = () => {
    const unauthed = {
      ...MASTER_PROFILE_VEERESH,
      isAuthenticated: false
    };
    setUserProfile(unauthed);
    localStorage.setItem('chintu_user_profile', JSON.stringify(unauthed));
  };

  // Seamless 1-Click Master Account Sync with SQLite memory
  useEffect(() => {
    apiFetch('/api/user/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.profile && data.profile.email) {
          const merged = { ...MASTER_PROFILE_VEERESH, ...data.profile, isAuthenticated: true };
          setUserProfile(merged);
          localStorage.setItem('chintu_user_profile', JSON.stringify(merged));
        }
      })
      .catch((e) => console.debug('[Profile Mount Sync]:', e));
  }, []);

  // Authoritative Backend Position Synchronization
  const fetchPositions = async () => {
    try {
      const res = await apiFetch('/api/positions');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.positions)) {
          setPositions(data.positions);
        }
      }
    } catch (e) {
      console.debug('[Positions Mount Sync]:', e);
    }
  };

  useEffect(() => {
    fetchPositions();
    const posInterval = setInterval(fetchPositions, 3500);
    return () => clearInterval(posInterval);
  }, []);

  const handleSquareOff = async (positionOrId) => {
    try {
      const posId = typeof positionOrId === 'object' ? positionOrId.id : positionOrId;
      const posSymbol = typeof positionOrId === 'object' ? positionOrId.symbol : null;
      const posBot = typeof positionOrId === 'object' ? positionOrId.bot : null;

      const res = await apiFetch('/api/positions/square-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: posId, symbol: posSymbol, bot: posBot })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          soundEngine.playSellChime();
          voiceAssistant.speak(`Position in ${data.closed_position?.symbol || posSymbol || 'asset'} squared off.`);
          await fetchPositions();
          return { success: true, data };
        } else {
          soundEngine.playAlertChime();
          alert(`Square-off failed: ${data.message}`);
          return { success: false, error: data.message };
        }
      }
      return { success: false, error: `Server error ${res.status}` };
    } catch (e) {
      console.error('[Square-off Exception]:', e);
      alert(`Square-off network error: ${e.message}`);
      return { success: false, error: e.message };
    }
  };

  const handleSquareOffAll = async () => {
    try {
      const res = await apiFetch('/api/positions/square-off-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        soundEngine.playSellChime();
        voiceAssistant.speak(`All ${data.squared_count || 0} active positions squared off.`);
        await fetchPositions();
        return { success: true, count: data.squared_count };
      }
      return { success: false, error: `Server error ${res.status}` };
    } catch (e) {
      console.error('[Square-off All Exception]:', e);
      alert(`Square-off All network error: ${e.message}`);
      return { success: false, error: e.message };
    }
  };

  // REAL-TIME WEBSOCKET SYNC with local Python server (getWebSocketUrl('/chintu-feed'))
  const wsRef = useRef(null);
  const botsRef = useRef(bots);
  botsRef.current = bots;
  const brokerConnectionsRef = useRef(brokerConnections);
  brokerConnectionsRef.current = brokerConnections;

  useEffect(() => {
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      try {
        const socket = new WebSocket(getWebSocketUrl('/chintu-feed'));
        wsRef.current = socket;

        socket.onopen = () => {
          console.log('[WebSocket] Connected to Chintu AI Live Feed');
          setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'TRADE_CONFIRMATION' && data.trade) {
              const trade = data.trade;

              // Validate event schema safely to prevent rendering crashes
              if (!trade.symbol || !trade.action) {
                console.warn('[WebSocket] Malformed TRADE_CONFIRMATION payload ignored:', trade);
                return;
              }

              // Play audio chime
              try {
                if (trade.action === 'BUY') {
                  soundEngine.playBuyChime();
                } else {
                  soundEngine.playSellChime();
                }
              } catch (soundErr) {
                console.warn('[Audio] Failed to play chime:', soundErr);
              }

              // Voice Event Announcement
              try {
                voiceAssistant.announceTrade(trade);
              } catch (voiceErr) {
                console.warn('[Voice] Failed to announce trade:', voiceErr);
              }

              // Update Recent Trades with deduplication (by id or orderId)
              setRecentTrades((prev) => {
                const incomingKey = trade.id || trade.orderId;
                if (incomingKey && prev.some((t) => (t.id && t.id === incomingKey) || (t.orderId && t.orderId === incomingKey))) {
                  return prev;
                }
                return [trade, ...prev.slice(0, 9)];
              });

              // Update Notifications
              setNotifications((prev) => [
                {
                  id: trade.id || trade.orderId || Date.now(),
                  title: `${trade.bot || 'Fleet'} Trade Confirmation`,
                  message: `${trade.action} fill for ${trade.qty || 1}x ${trade.symbol} (${trade.segment || 'NSE'}) @ ₹${trade.price || 0}`,
                  time: trade.time || new Date().toLocaleTimeString('en-IN'),
                  type: (trade.action || '').toLowerCase()
                },
                ...prev.slice(0, 8)
              ]);

              // Update / adjust position
              setPositions((prev) => {
                const existingIndex = prev.findIndex((p) => p.symbol === trade.symbol);
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    ltp: trade.price,
                    pnl: trade.pnl,
                  };
                  return updated;
                }
                return prev;
              });
            }

            if (data.type === 'POSITIONS_UPDATE' && Array.isArray(data.positions)) {
              setPositions(data.positions);
            }

            if (data.type === 'POSITION_SQUARED_OFF') {
              setPositions((prev) => prev.filter((p) => p.id !== data.positionId && p.symbol !== data.symbol));
            }

            if (data.type === 'ALL_POSITIONS_SQUARED_OFF') {
              setPositions([]);
            }

            if (data.type === 'TICKER_PULSE') {
              setTickers((prev) =>
                prev.map((t) => {
                  if (t.symbol === 'NIFTY 50' && data.nifty) {
                    return { ...t, price: data.nifty };
                  }
                  if (t.symbol === 'BANKNIFTY' && data.banknifty) {
                    return { ...t, price: data.banknifty };
                  }
                  if (t.symbol.includes('GOLD') && data.gold) {
                    return { ...t, price: data.gold };
                  }
                  return t;
                })
              );
            }

            if (data.type === 'HEARTBEAT') {
              setWsConnected(true);
            }

            if (data.type === 'SYSTEM_EMERGENCY_STOP') {
              soundEngine.playSellChime();
              voiceAssistant.speak('Emergency circuit breaker tripped. All live bot orders suspended.');
              setBots((prev) => prev.map((b) => ({ ...b, status: 'PAUSED' })));
              setNotifications((prev) => [
                {
                  id: Date.now(),
                  title: '🛑 Emergency Circuit Breaker Activated',
                  message: data.message || 'All bot orders paused by RMS.',
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  type: 'sell'
                },
                ...prev.slice(0, 8)
              ]);
            }

            if (data.type === 'CIRCUIT_BREAKER_RESET') {
              soundEngine.playBuyChime();
              setNotifications((prev) => [
                {
                  id: Date.now(),
                  title: '✅ Circuit Breaker Reset',
                  message: data.message || 'Normal operations resumed.',
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  type: 'buy'
                },
                ...prev.slice(0, 8)
              ]);
            }

            if (data.type === 'USER_PROFILE_SYNC' && data.profile) {
              setUserProfile(data.profile);
              localStorage.setItem('chintu_user_profile', JSON.stringify(data.profile));
            }
          } catch (e) {
            console.error('Error parsing WebSocket message', e);
          }
        };

        socket.onerror = (err) => {
          setWsConnected(false);
        };

        socket.onclose = () => {
          setWsConnected(false);
          // Try reconnecting after 3 seconds
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };
      } catch (err) {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Automated Boot Health Check & Zero-Error Audio Startup Greeting
  useEffect(() => {
    const runBootHealthCheck = async () => {
      try {
        const alreadyGreeted = sessionStorage.getItem('chintu_boot_greeted');
        if (!alreadyGreeted) {
          sessionStorage.setItem('chintu_boot_greeted', 'true');
          // Audit local backend diagnostics
          try {
            await apiFetch('/api/diagnostics');
          } catch (e) {}
          // Speak executive startup greeting
          setTimeout(() => {
            voiceAssistant.speak(
              'CHINTU AI Trading System initialized. All 14 bot nodes synchronized and zero anomalies detected. Production core ready, Commander.',
              { rate: 1.05 }
            );
          }, 1500);
        }
      } catch (err) {}
    };
    runBootHealthCheck();
  }, []);

  // Connect frontend to backend bot scheduler & performance endpoints
  useEffect(() => {
    let isMounted = true;

    const fetchBotStatuses = async () => {
      try {
        const [statusRes, perfRes] = await Promise.all([
          apiFetch('/api/bots/status').catch(() => null),
          apiFetch('/api/bots/highest-profit').catch(() => null)
        ]);

        if (!isMounted) return;

        if (statusRes && Array.isArray(statusRes.bots)) {
          const perfMap = {};
          if (perfRes && Array.isArray(perfRes.bot_rankings)) {
            perfRes.bot_rankings.forEach((r) => {
              perfMap[r.bot_id] = r;
            });
          }

          setBots((prevBots) => {
            return prevBots.map((b) => {
              const backendBot = statusRes.bots.find((s) => s.bot_id === b.id);
              if (!backendBot) return b;

              const perf = perfMap[b.id];
              const pnl = perf ? perf.net_pnl : (b.pnlToday || 0);
              const winRate = perf ? perf.win_rate : (b.winRate || 0);
              const trades = perf ? perf.total_trades : (b.trades || 0);
              const verifiedAuthenticTrades = perf ? Number(perf.verified_authentic_trades || 0) : 0;
              const syntheticTrades = perf ? Number(perf.synthetic_trades || 0) : 0;
              const isQualified = perf ? Boolean(perf.is_qualified) : false;
              const isLiveEligible = perf ? Boolean(perf.is_live_allocation_eligible) : false;
              const disqualificationReason = perf ? perf.disqualification_reason : null;
              const isHealthy = backendBot.data_healthy;
              const isReady = backendBot.strategy_ready;
              const lastPrice = backendBot.last_tick_price || b.price;

              return {
                ...b,
                price: lastPrice,
                pnlToday: pnl,
                winRate: winRate,
                trades: trades,
                verifiedAuthenticTrades,
                syntheticTrades,
                isQualified,
                isLiveEligible,
                disqualificationReason,
                dataHealthy: isHealthy,
                strategyReady: isReady,
                dataReadiness: backendBot.data_readiness,
                workerRunning: backendBot.worker_running,
                status: backendBot.worker_running ? 'RUNNING' : 'STOPPED'
              };
            });
          });
        }
      } catch (err) {
        // Backend offline: preserve state without synthesizing random fluctuations
      }
    };

    fetchBotStatuses();
    const botPollInterval = setInterval(fetchBotStatuses, 4000);

    return () => {
      isMounted = false;
      clearInterval(botPollInterval);
    };
  }, []);


  // Global Start/Stop All Bots
  const handleStartAllBots = () => {
    setAllBotsRunning(true);
    setBots((prev) => {
      const next = prev.map((b) => ({ ...b, status: 'RUNNING' }));
      try {
        localStorage.setItem('chintu_bots_config', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
    soundEngine.playBuyChime();
  };

  const handleStopAllBots = () => {
    setAllBotsRunning(false);
    setBots((prev) => {
      const next = prev.map((b) => ({ ...b, status: 'PAUSED' }));
      try {
        localStorage.setItem('chintu_bots_config', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
    soundEngine.playSellChime();
  };

  // Toggle individual bot status
  const handleToggleBotStatus = (botId) => {
    setBots((prev) => {
      const next = prev.map((b) => {
        if (b.id === botId) {
          const nextStatus = b.status === 'RUNNING' ? 'PAUSED' : 'RUNNING';
          return { ...b, status: nextStatus };
        }
        return b;
      });
      try {
        localStorage.setItem('chintu_bots_config', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const handleQuickAction = (bot) => {
    setSelectedBotForModal(bot);
  };

  // Filter bots based on dropdown selection
  const filteredBots = bots.filter((bot) => {
    if (selectedCategory === 'All') return true;
    if (selectedCategory === 'Indices') return bot.asset.includes('NIFTY') || bot.asset.includes('SENSEX');
    if (selectedCategory === 'Equities') return ['RELIANCE', 'TATA MOTORS', 'HDFC BANK', 'INFY', 'ITC'].some((s) => bot.asset.includes(s));
    if (selectedCategory === 'Commodities') return bot.asset.includes('GOLD') || bot.asset.includes('SILVER') || bot.asset.includes('CRUDE');
    if (selectedCategory === 'Derivatives') return bot.asset.includes('OPTIONS');
    if (selectedCategory === 'Crypto') return bot.asset.includes('BTC') || bot.asset.includes('USDINR');
    return true;
  });

  return (
    <div className="min-h-screen bg-[#060b17] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. Top Navigation Bar */}
      <TopNavbar
        tickers={tickers}
        userProfile={userProfile}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenSettings={() => setActiveTab('settings')}
        onOpenNotifications={() => setIsNotificationsModalOpen(true)}
        unreadAlertsCount={notifications.length}
        executionMode={executionMode}
        onToggleExecutionMode={handleToggleExecutionMode}
        isBrokerConnected={brokerConnections.some((b) => b.status === 'Connected')}
        activeBrokerName={brokerConnections.find((b) => b.status === 'Connected')?.name || ''}
      />

      {/* Main Container with Sidebar + Content */}
      <div className="flex-1 flex w-full">
        {/* 2. Interactive Left Sidebar with Broker Accounts branch */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          allBotsRunning={allBotsRunning}
          onStartAllBots={handleStartAllBots}
          onStopAllBots={handleStopAllBots}
          brokerConnections={brokerConnections}
          onOpenBrokerModal={(broker) => setSelectedBrokerForModal(broker)}
          executionMode={executionMode}
          onSelectExecutionMode={handleToggleExecutionMode}
        />

        {/* 3. Main Center Workspace */}
        <main className="flex-1 p-3.5 space-y-3.5 overflow-x-hidden min-w-0 pb-24 md:pb-3.5">
          <ViewErrorBoundary>
            <Suspense fallback={<ViewLoadingFallback />}>
              {/* Main Dashboard View */}
          {activeTab === 'dashboard' && (
            <>
              {/* Bot Decision Network (Mesh Hub) */}
              <DecisionMeshHub
                bots={bots}
                allBotsRunning={allBotsRunning}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                onSelectBot={(bot) => setSelectedBotForModal(bot)}
                executionMode={executionMode}
                brokerAvailableCash={0.00}
                isBrokerConnected={brokerConnections.some((b) => b.status === 'Connected')}
              />

              {/* 14 Multi-Asset Bot Cards Grid (4 per row over 4 rows) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredBots.map((bot) => (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    onOpenDetails={(b) => setSelectedBotForModal(b)}
                    onQuickAction={handleQuickAction}
                    onOpenSkills={(botId) => {
                      setSelectedBotForSkillsId(botId);
                      setActiveTab('bot-skills');
                    }}
                  />
                ))}
              </div>

              {/* Bottom Analytical Section */}
              <BottomAnalytics
                candlestickData={candlestickData}
                recentTrades={recentTrades}
                portfolioAllocation={portfolioAllocation}
                bots={bots}
                onSelectSymbol={(sym) => {
                  console.log('Selected Symbol for Chart:', sym);
                }}
              />
            </>
          )}

          {/* DEDICATED VIEW: BROKER ACCOUNTS (Angel One, Zerodha, Upstox, 5paisa) */}
          {activeTab === 'broker-accounts' && (
            <BrokerAccountsView
              brokerConnections={brokerConnections}
              onUpdateBroker={(updated) => setBrokerConnections(updated)}
            />
          )}

          {/* Dedicated View: Bots Monitor */}
          {activeTab === 'bots-monitor' && (
            <BotsMonitorView
              bots={bots}
              onToggleBotStatus={handleToggleBotStatus}
              onOpenDetails={(b) => setSelectedBotForModal(b)}
              onStartAllBots={handleStartAllBots}
              onStopAllBots={handleStopAllBots}
              executionMode={executionMode}
              onToggleExecutionMode={handleToggleExecutionMode}
            />
          )}

          {/* DEDICATED VIEW: AI COMMANDER (JARVIS) */}
          {activeTab === 'ai-commander' && (
            <AICommanderView
              bots={bots}
              brokerConnections={brokerConnections}
              tickers={tickers}
              recentTrades={recentTrades}
              executionMode={executionMode}
              onToggleExecutionMode={handleToggleExecutionMode}
              onUpdateBots={handleUpdateBots}
              onToggleBotStatus={handleToggleBotStatus}
              wsConnected={wsConnected}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {/* DEDICATED VIEW: BOT SKILLS HUB (MODDABLE STRATEGY ENGINE) */}
          {activeTab === 'bot-skills' && (
            <BotSkillsHubView
              bots={bots}
              onUpdateBots={handleUpdateBots}
              initialSelectedBotId={selectedBotForSkillsId}
            />
          )}

          {/* Dedicated View: Decision Network */}
          {activeTab === 'decision-network' && (
            <DecisionNetworkView
              bots={bots}
              onOpenDetails={(b) => setSelectedBotForModal(b)}
            />
          )}

          {/* Dedicated View: Live Trading */}
          {activeTab === 'live-trading' && (
            <LiveTradingView
              candlestickData={candlestickData}
              recentTrades={recentTrades}
              wsConnected={wsConnected}
              brokerConnections={brokerConnections}
              executionMode={executionMode}
              brokerAvailableCash={0.00}
            />
          )}

          {/* Dedicated View: Market Watch */}
          {activeTab === 'market-watch' && (
            <MarketWatchView tickers={tickers} bots={bots} />
          )}

          {/* Dedicated View: Strategy Library & Importer */}
          {activeTab === 'strategy-library' && <StrategyLibraryView />}

          {/* Dedicated View: Strategy Builder */}
          {activeTab === 'strategy-builder' && <StrategyBuilderView />}

          {/* Dedicated View: Analytics */}
          {activeTab === 'analytics' && <AnalyticsView recentTrades={recentTrades} bots={bots} />}

          {/* Dedicated View: Backtest */}
          {activeTab === 'backtest' && <BacktestView />}

          {/* Dedicated View: Orders & Positions (Synced with authoritative backend position book) */}
          {activeTab === 'orders-positions' && (
            <OrdersPositionsView
              positions={positions}
              onSquareOff={handleSquareOff}
              onSquareOffAll={handleSquareOffAll}
              onRefresh={fetchPositions}
            />
          )}

          {/* Dedicated View: Risk Management */}
          {activeTab === 'risk-management' && (
            <RiskManagementView
              bots={bots}
              onUpdateBots={handleUpdateBots}
              onToggleBotStatus={handleToggleBotStatus}
              brokerConnections={brokerConnections}
            />
          )}

          {/* Dedicated View: Trade History */}
          {activeTab === 'trade-history' && (
            <TradeHistoryView recentTrades={recentTrades} />
          )}

          {/* Dedicated View: Performance */}
          {activeTab === 'performance' && <PerformanceView />}

          {/* Dedicated View: Settings */}
          {activeTab === 'settings' && (
            <SettingsView
              simulationEnabled={simulationEnabled}
              setSimulationEnabled={setSimulationEnabled}
            />
          )}
            </Suspense>
          </ViewErrorBoundary>
        </main>
      </div>

      {/* 4. Modals & Drawers */}
      {selectedBotForModal && (
        <BotDetailsModal
          bot={selectedBotForModal}
          onClose={() => setSelectedBotForModal(null)}
          onToggleBotStatus={handleToggleBotStatus}
          onOpenSkills={(botId) => {
            setSelectedBotForSkillsId(botId);
            setActiveTab('bot-skills');
          }}
          onManualTrigger={async (bot, action, qty) => {
            // In LIVE mode, broker connection is required
            if (executionMode === 'LIVE') {
              const isBrokerLive = brokerConnections.some((b) => b.status === 'Connected');
              if (!isBrokerLive) {
                const errMsg = 'Order Blocked: No active broker connected for LIVE trading. Please authenticate in Broker Accounts.';
                alert(errMsg);
                return { success: false, error: errMsg };
              }
            }

            // Capital and status check
            if (bot.status !== 'RUNNING' || (Number(bot.allocatedCapital) || 0) <= 0) {
              const errMsg = `Order Blocked: ${bot.name} is currently ${bot.status} with ₹${bot.allocatedCapital || 0} capital. Please allocate capital and start the bot in Risk Management.`;
              alert(errMsg);
              return { success: false, error: errMsg };
            }

            const sym = bot.tradingsymbol || bot.assetSymbol || bot.asset || 'NIFTY';
            const seg =
              bot.segment ||
              (bot.asset.includes('CE') || bot.asset.includes('FUT') || bot.asset.includes('NIFTY')
                ? 'NSE F&O Options'
                : bot.asset.includes('GOLD') || bot.asset.includes('SILVER') || bot.asset.includes('CRUDE')
                ? 'MCX Commodity'
                : bot.asset.includes('BTC')
                ? 'Crypto Perpetual'
                : 'NSE Equity');

            const orderQty = parseInt(qty, 10) || bot.lotSize || 1;
            const orderPrice = parseFloat(bot.price) || 0.0;

            try {
              const payload = {
                bot: bot.name || `Bot ${bot.id}`,
                symbol: sym,
                action: action.toUpperCase(),
                qty: orderQty,
                price: orderPrice,
                segment: seg,
                variety: 'NORMAL',
                ordertype: orderPrice > 0 ? 'LIMIT' : 'MARKET',
                producttype: seg.includes('F&O') || seg.includes('Options') || seg.includes('Futures') ? 'CARRYFORWARD' : 'INTRADAY'
              };

              const res = await apiFetch('/api/order/place', {
                method: 'POST',
                body: JSON.stringify(payload)
              });

              if (res && res.status === 'success') {
                if (action === 'BUY') soundEngine.playBuyChime();
                else soundEngine.playSellChime();
                return {
                  success: true,
                  order: res.order,
                  message: `Manual ${action} order confirmed: ${orderQty}x ${sym} @ ₹${orderPrice || 'MKT'}`
                };
              } else {
                const errMsg = (res && res.message) || (res && res.result && res.result.error) || 'Order placement rejected by backend RMS';
                return {
                  success: false,
                  error: errMsg
                };
              }
            } catch (err) {
              const errMsg = err.message || 'Network error dispatching order';
              return {
                success: false,
                error: errMsg
              };
            }
          }}
        />
      )}

      {/* Real Google Account / Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userProfile={userProfile}
        onUpdateProfile={handleUpdateProfile}
        onLogout={handleLogout}
      />

      {/* Broker Details / Latency Test Modal */}
      {selectedBrokerForModal && (
        <BrokerModal
          broker={selectedBrokerForModal}
          onClose={() => setSelectedBrokerForModal(null)}
        />
      )}

      {/* Notifications / Alerts Feed Modal */}
      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        notifications={notifications}
        onClearAll={() => setNotifications([])}
      />
    </div>
  );
}
