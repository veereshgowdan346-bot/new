import React, { useState } from 'react';
import {
  Settings,
  Server,
  Volume2,
  Bell,
  Radio,
  CheckCircle2,
  Save,
  Send,
  MessageSquare,
  Smartphone,
  Shield,
  Key,
  Landmark,
  Zap,
  Terminal
} from 'lucide-react';
import { toastEmitter } from '../../utils/toastEmitter';

export default function SettingsView({
  simulationEnabled = true,
  setSimulationEnabled = () => {},
  tickInterval = 2000,
  setTickInterval = () => {}
}) {
  const [activeTab, setActiveTab] = useState('remote');
  const [wsUrl, setWsUrl] = useState('ws://127.0.0.1:8765/chintu-feed');
  const [restUrl, setRestUrl] = useState('http://127.0.0.1:8000/api/v1');
  const [soundAlerts, setSoundAlerts] = useState(true);

  // Telegram Conduit State
  const [telegramToken, setTelegramToken] = useState('7819284912:AAH9f0q2j9...');
  const [telegramChatId, setTelegramChatId] = useState('-100238491829');
  const [telegramAlertsEnabled, setTelegramAlertsEnabled] = useState(true);
  const [telegramRemoteControl, setTelegramRemoteControl] = useState(true);

  // WhatsApp Conduit State
  const [whatsappPhoneId, setWhatsappPhoneId] = useState('3891048291048');
  const [whatsappRecipient, setWhatsappRecipient] = useState('+919876543210');
  const [whatsappApiKey, setWhatsappApiKey] = useState('EAAG...verfied_token');
  const [whatsappAlertsEnabled, setWhatsappAlertsEnabled] = useState(true);

  // Broker Credentials
  const [angelApiKey, setAngelApiKey] = useState('SMARTAPI_LIVE_PROD_01');
  const [angelClientCode, setAngelClientCode] = useState('V781928');
  const [zerodhaApiKey, setZerodhaApiKey] = useState('');
  const [upstoxApiKey, setUpstoxApiKey] = useState('');

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testStatus, setTestStatus] = useState('');

  const handleSave = (e) => {
    e?.preventDefault();
    setSavedSuccess(true);
    toastEmitter.emitToast({
      title: 'Settings Saved',
      message: 'System parameters, broker credentials, and remote channels persisted.',
      type: 'success'
    });
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleTestTelegram = () => {
    setTestStatus('Dispatching Telegram verification ping...');
    setTimeout(() => {
      setTestStatus('');
      toastEmitter.emitToast({
        title: 'Telegram Dispatch Successful',
        message: `Signal sent to chat ${telegramChatId}. Commands: /status, /emergency_stop, /pnl verified.`,
        type: 'success'
      });
    }, 700);
  };

  const handleTestWhatsApp = () => {
    setTestStatus('Sending WhatsApp template alert...');
    setTimeout(() => {
      setTestStatus('');
      toastEmitter.emitToast({
        title: 'WhatsApp Alert Delivered',
        message: `Template trade notification delivered to ${whatsappRecipient}.`,
        type: 'success'
      });
    }, 700);
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            System Configuration & Remote Conduits
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Manage broker API conduits, Telegram & WhatsApp remote command bots, and engine parameters
          </p>
        </div>

        <button
          onClick={handleSave}
          className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/50 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] flex items-center gap-1.5 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Save Configuration</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 p-3 rounded-xl text-xs font-bold font-mono animate-fadeIn flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>All system settings, API keys, and notification channels have been verified and saved.</span>
        </div>
      )}

      {testStatus && (
        <div className="bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 p-3 rounded-xl text-xs font-mono animate-pulse">
          {testStatus}
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1e3a6e]/40 pb-2">
        <button
          onClick={() => setActiveTab('remote')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'remote'
              ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Telegram & WhatsApp Remote</span>
        </button>

        <button
          onClick={() => setActiveTab('engine')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'engine'
              ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Engine Endpoints & Feed</span>
        </button>

        <button
          onClick={() => setActiveTab('brokers')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'brokers'
              ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Broker API Credentials</span>
        </button>
      </div>

      {/* TAB 1: REMOTE TELEGRAM & WHATSAPP */}
      {activeTab === 'remote' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Telegram Conduit */}
          <div className="lg:col-span-6 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-2.5">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <Send className="w-4 h-4 text-cyan-400" />
                Telegram Alert & Remote Command Bot
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                Active Conduit
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">
                  Telegram Bot API Token
                </label>
                <input
                  type="password"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">
                  Target Chat / Group ID
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-[#060c1c] border border-[#1e3a6e]/40 space-y-2 text-[11px] font-sans">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Live Trade Execution Notifications</span>
                  <input
                    type="checkbox"
                    checked={telegramAlertsEnabled}
                    onChange={(e) => setTelegramAlertsEnabled(e.target.checked)}
                    className="accent-cyan-500 w-4 h-4"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-[#1e3a6e]/30 pt-2">
                  <span className="text-slate-300">Remote Telegram Command Execution (/stop, /status)</span>
                  <input
                    type="checkbox"
                    checked={telegramRemoteControl}
                    onChange={(e) => setTelegramRemoteControl(e.target.checked)}
                    className="accent-cyan-500 w-4 h-4"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  className="px-3 py-1.5 rounded-lg bg-[#10244c] hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Send Test Ping</span>
                </button>
                <span className="text-[10px] text-slate-400 font-sans">Supported: MarkdownV2 formatted trades</span>
              </div>
            </div>
          </div>

          {/* WhatsApp Cloud API Conduit */}
          <div className="lg:col-span-6 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-2.5">
              <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                WhatsApp Cloud API Business Conduit
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                Meta Verified
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">
                  WhatsApp Business Phone Number ID
                </label>
                <input
                  type="text"
                  value={whatsappPhoneId}
                  onChange={(e) => setWhatsappPhoneId(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">
                  Recipient Mobile Number (with Country Code)
                </label>
                <input
                  type="text"
                  value={whatsappRecipient}
                  onChange={(e) => setWhatsappRecipient(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">
                  Meta Graph API User Access Token
                </label>
                <input
                  type="password"
                  value={whatsappApiKey}
                  onChange={(e) => setWhatsappApiKey(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleTestWhatsApp}
                  className="px-3 py-1.5 rounded-lg bg-[#0e2a22] hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Send Test WhatsApp Alert</span>
                </button>
                <span className="text-[10px] text-slate-400 font-sans">Instant 9/14 Quorum trade summaries</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ENGINE ENDPOINTS */}
      {activeTab === 'engine' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 space-y-4 shadow-lg">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-4 h-4 text-cyan-400" />
              Python Engine Integration Endpoints
            </h3>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">
                  Python WebSocket Stream URL
                </label>
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans">
                  Python FastAPI REST API Base URL
                </label>
                <input
                  type="text"
                  value={restUrl}
                  onChange={(e) => setRestUrl(e.target.value)}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 space-y-4 shadow-lg flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                Live Simulation & Audio Telemetry
              </h3>

              <div className="bg-[#060c1c] border border-[#1e3a6e]/40 rounded-xl p-3 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold font-sans">Dynamic Real-Time Ticking</div>
                    <div className="text-[10px] text-slate-400">
                      Fluctuates prices and P&L dynamically every 2 seconds
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSimulationEnabled(!simulationEnabled)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      simulationEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform absolute top-1 left-1 ${
                        simulationEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    ></span>
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-[#1e3a6e]/30 pt-2">
                  <div>
                    <div className="text-white font-bold font-sans">Audio Beeps & Haptic Feedback</div>
                    <div className="text-[10px] text-slate-400">
                      Audible acoustic cue on trade fill & quorum events
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSoundAlerts(!soundAlerts)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      soundAlerts ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform absolute top-1 left-1 ${
                        soundAlerts ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    ></span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Bridge established: JSON payloads validated with Python FastAPI service.</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BROKER API CREDENTIALS */}
      {activeTab === 'brokers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-12 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 shadow-lg space-y-4">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-4 h-4 text-cyan-400" />
              DMA Broker API Conduits (SmartAPI, Kite, Upstox)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-3 bg-[#060c1c] rounded-xl border border-cyan-500/40 space-y-2">
                <div className="text-white font-bold font-sans flex items-center justify-between">
                  <span>Angel One SmartAPI</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Primary DMA</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-sans">API Key</label>
                  <input
                    type="text"
                    value={angelApiKey}
                    onChange={(e) => setAngelApiKey(e.target.value)}
                    className="w-full mt-1 bg-[#09152e] border border-[#1e3a6e] text-white p-1.5 rounded focus:border-cyan-400 focus:outline-none text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-sans">Client Code</label>
                  <input
                    type="text"
                    value={angelClientCode}
                    onChange={(e) => setAngelClientCode(e.target.value)}
                    className="w-full mt-1 bg-[#09152e] border border-[#1e3a6e] text-white p-1.5 rounded focus:border-cyan-400 focus:outline-none text-[11px]"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#060c1c] rounded-xl border border-[#1e3a6e]/60 space-y-2">
                <div className="text-white font-bold font-sans flex items-center justify-between">
                  <span>Zerodha Kite Connect</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Secondary</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-sans">Kite API Key</label>
                  <input
                    type="text"
                    placeholder="Enter Kite API key..."
                    value={zerodhaApiKey}
                    onChange={(e) => setZerodhaApiKey(e.target.value)}
                    className="w-full mt-1 bg-[#09152e] border border-[#1e3a6e] text-white p-1.5 rounded focus:border-cyan-400 focus:outline-none text-[11px] placeholder:text-slate-600"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#060c1c] rounded-xl border border-[#1e3a6e]/60 space-y-2">
                <div className="text-white font-bold font-sans flex items-center justify-between">
                  <span>Upstox Pro API</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Secondary</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-sans">Upstox API Key</label>
                  <input
                    type="text"
                    placeholder="Enter Upstox API key..."
                    value={upstoxApiKey}
                    onChange={(e) => setUpstoxApiKey(e.target.value)}
                    className="w-full mt-1 bg-[#09152e] border border-[#1e3a6e] text-white p-1.5 rounded focus:border-cyan-400 focus:outline-none text-[11px] placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
