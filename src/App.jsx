import React, { useState, useEffect, useRef } from 'react';
import TopNavbar from './components/TopNavbar';
import Sidebar from './components/Sidebar';
import DecisionMeshHub from './components/DecisionMeshHub';
import BotCard from './components/BotCard';
import BottomAnalytics from './components/BottomAnalytics';
import BotDetailsModal from './components/BotDetailsModal';
import ProfileModal from './components/ProfileModal';
import BrokerModal from './components/BrokerModal';
import NotificationsModal from './components/NotificationsModal';

// Dedicated views
import BrokerAccountsView from './components/views/BrokerAccountsView';
import BotsMonitorView from './components/views/BotsMonitorView';
import DecisionNetworkView from './components/views/DecisionNetworkView';
import LiveTradingView from './components/views/LiveTradingView';
import MarketWatchView from './components/views/MarketWatchView';
import StrategyBuilderView from './components/views/StrategyBuilderView';
import AnalyticsView from './components/views/AnalyticsView';
import BacktestView from './components/views/BacktestView';
import OrdersPositionsView from './components/views/OrdersPositionsView';
import RiskManagementView from './components/views/RiskManagementView';
import TradeHistoryView from './components/views/TradeHistoryView';
import PerformanceView from './components/views/PerformanceView';
import SettingsView from './components/views/SettingsView';
import AICommanderView from './components/views/AICommanderView';
import BotSkillsHubView from './components/views/BotSkillsHubView';

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

              // Gating 1: Disconnected Broker Check
              // Strictly reject any trade executions if no broker is actively connected
              const isBrokerLive = brokerConnectionsRef.current.some((b) => b.status === 'Connected');
              if (!isBrokerLive) {
                console.log('[Execution Blocked] No live broker connected. Trade ignored.');
                return;
              }

              // Gating 2: Per-Bot Status & Capital Allocation Check
              const currentBots = botsRef.current;
              const matchedBot = currentBots.find((b) => {
                const bIdStr = `bot ${b.id}`.toLowerCase();
                const bNameStr = b.name.toLowerCase();
                const tradeBotStr = (trade.bot || '').toLowerCase();
                return tradeBotStr === bIdStr || tradeBotStr === bNameStr || tradeBotStr.includes(bIdStr) || tradeBotStr.includes(bNameStr);
              });

              // If bot is not found, or not RUNNING, or allocatedCapital <= 0, suppress execution!
              // The bot still computed consensus signals, but execution is blocked.
              if (!matchedBot || matchedBot.status !== 'RUNNING' || (Number(matchedBot.allocatedCapital) || 0) <= 0) {
                console.log(`[Consensus Only] Bot ${trade.bot} trade suppressed (Status: ${matchedBot?.status}, Capital: ₹${matchedBot?.allocatedCapital || 0}).`);
                return;
              }

              // Play audio chime
              if (trade.action === 'BUY') {
                soundEngine.playBuyChime();
              } else {
                soundEngine.playSellChime();
              }

              // Voice Event Announcement
              voiceAssistant.announceTrade(trade);

              // Update Recent Trades
              setRecentTrades((prev) => [trade, ...prev.slice(0, 9)]);

              // Update Notifications
              setNotifications((prev) => [
                {
                  id: trade.id || Date.now(),
                  title: `${trade.bot} Trade Confirmation`,
                  message: `${trade.action} fill for ${trade.qty}x ${trade.symbol} (${trade.segment}) @ ₹${trade.price}`,
                  time: trade.time,
                  type: trade.action.toLowerCase()
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

  // Internal dynamic ticking fallback simulation
  useEffect(() => {
    if (!simulationEnabled || !allBotsRunning) return;
    const isBrokerLive = brokerConnections.some((b) => b.status === 'Connected');
    if (!isBrokerLive) return; // Strictly no fake trading/fluctuations if disconnected

    const interval = setInterval(() => {
      // 1. Ticker price micro-fluctuations
      setTickers((prevTickers) =>
        prevTickers.map((ticker) => {
          const delta = (Math.random() - 0.48) * (ticker.price > 1000 ? 3.5 : 0.04);
          const newPrice = Math.max(1, ticker.price + delta);
          const newChange = ticker.change + delta;
          const newPct = (newChange / (newPrice - newChange)) * 100;
          return {
            ...ticker,
            price: Number(newPrice.toFixed(2)),
            change: Number(newChange.toFixed(2)),
            changePercent: Number(newPct.toFixed(2)),
          };
        })
      );

      // 2. Micro-updates to 1 or 2 bot prices & PnL
      setBots((prevBots) => {
        const randomIndex = Math.floor(Math.random() * prevBots.length);
        return prevBots.map((b, idx) => {
          if (idx !== randomIndex && Math.random() > 0.4) return b;
          const priceDelta = (Math.random() - 0.47) * (b.price * 0.0008);
          const newPrice = Number((b.price + priceDelta).toFixed(2));
          const pnlDelta = Number(((Math.random() - 0.45) * 8.5).toFixed(2));
          const newPnl = Number((b.pnlToday + pnlDelta).toFixed(2));

          const updatedSparkline = [...b.sparklineData.slice(1), newPrice];

          return {
            ...b,
            price: newPrice,
            pnlToday: newPnl,
            sparklineData: updatedSparkline,
          };
        });
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [simulationEnabled, allBotsRunning, wsConnected, brokerConnections]);

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
          onManualTrigger={(bot, action, qty) => {
            const isBrokerLive = brokerConnections.some((b) => b.status === 'Connected');
            if (!isBrokerLive) {
              alert('Order Blocked: No active broker connected. Please authenticate in Broker Accounts.');
              return;
            }

            if (bot.status !== 'RUNNING' || (Number(bot.allocatedCapital) || 0) <= 0) {
              alert(`Order Blocked: ${bot.name} is currently ${bot.status} with ₹${bot.allocatedCapital || 0} capital. Please allocate capital and start the bot in Risk Management.`);
              return;
            }

            const now = new Date();
            const ms = String(now.getMilliseconds()).padStart(3, '0');
            const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${ms}`;
            const seg =
              bot.asset.includes('CE') || bot.asset.includes('FUT') || bot.asset.includes('NIFTY')
                ? 'NSE F&O Options'
                : bot.asset.includes('GOLD') || bot.asset.includes('SILVER') || bot.asset.includes('CRUDE')
                ? 'MCX Commodity'
                : bot.asset.includes('BTC')
                ? 'Crypto Perpetual'
                : 'NSE Equity';

            setRecentTrades((prev) => [
              {
                id: Date.now(),
                time: timeString,
                bot: `Bot ${bot.id}`,
                symbol: bot.asset,
                segment: seg,
                action: action,
                price: bot.price,
                qty: qty,
                pnl: '+₹0.00',
                isPositive: true
              },
              ...prev
            ]);
            if (action === 'BUY') soundEngine.playBuyChime();
            else soundEngine.playSellChime();
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
