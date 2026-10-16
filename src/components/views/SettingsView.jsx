import React, { useState } from 'react';
import { Settings, Server, Volume2, Bell, Radio, CheckCircle2, Save } from 'lucide-react';

export default function SettingsView({
  simulationEnabled,
  setSimulationEnabled,
  tickInterval,
  setTickInterval
}) {
  const [wsUrl, setWsUrl] = useState('ws://127.0.0.1:8765/chintu-feed');
  const [restUrl, setRestUrl] = useState('http://127.0.0.1:8000/api/v1');
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [telegramWebhook, setTelegramWebhook] = useState('https://api.telegram.org/bot728192:AAFe...');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            System Architecture & Connection Settings
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Hook into Python WebSocket / REST API engines, broker webhooks, and audio cues
          </p>
        </div>

        <button
          onClick={handleSave}
          className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/50 px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] flex items-center gap-1.5"
        >
          <Save className="w-4 h-4" />
          <span>Save Settings</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 p-3 rounded-xl text-xs font-bold font-mono animate-bounce">
          System settings saved and backend connection parameters updated.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Backend Endpoints */}
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
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Streams 14-bot tick updates, order book depth, and AI consensus events.
              </span>
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

            <div>
              <label className="text-slate-400 text-[10px] uppercase font-sans">
                Telegram / Discord Alert Webhook
              </label>
              <input
                type="text"
                value={telegramWebhook}
                onChange={(e) => setTelegramWebhook(e.target.value)}
                className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Live Simulation & Ticker Controls */}
        <div className="lg:col-span-6 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-4 space-y-4 shadow-lg flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-emerald-400" />
              Live Simulation & Audio Alerts
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
                  className={`w-11 h-6 rounded-full transition-colors relative ${
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
                    Audible chime when high-conviction consensus orders trigger
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSoundAlerts(!soundAlerts)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
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
            <span>Ready to bridge to external Python scripts via WebSocket standard JSON payload.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

