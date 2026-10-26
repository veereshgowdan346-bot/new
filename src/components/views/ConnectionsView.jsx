import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark,
  MessageSquare,
  Send,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  EyeOff,
  Zap,
  RefreshCw,
  Lock,
  ExternalLink,
  ShieldAlert,
  Unlink
} from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { toastEmitter } from '../../utils/toastEmitter';
import { soundEngine } from '../../utils/audioChime';

export default function ConnectionsView() {
  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [showSecrets, setShowSecrets] = useState({});

  // Forms for each provider
  const [forms, setForms] = useState({
    angel_one: { apiKey: '', clientId: '', pin: '', totpSecret: '' },
    telegram: { botToken: '', botUsername: '', allowedChatIds: '' },
    google: { geminiApiKey: '', clientId: '', clientSecret: '' }
  });

  const fetchConnections = useCallback(async () => {
    try {
      const res = await apiFetch('/api/connections/status');
      if (res && res.status === 'success' && Array.isArray(res.connections)) {
        setConnections(res.connections);
      }
    } catch {
      // Offline or server initializing
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleInputChange = (provider, field, value) => {
    setForms((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value
      }
    }));
  };

  const toggleShowSecret = (fieldKey) => {
    setShowSecrets((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const getConnection = (provider) => {
    return (
      connections.find((c) => c.provider === provider) || {
        provider,
        status: 'NOT_CONFIGURED',
        sanitizedConfig: {},
        lastVerifiedAt: null,
        lastError: null,
        missingPermissions: 'Configuration pending.'
      }
    );
  };

  // Action: Connect / Save Credentials
  const handleConnect = async (provider) => {
    setActionLoading((prev) => ({ ...prev, [provider]: 'connecting' }));
    try {
      const payload = {
        provider,
        credentials: forms[provider]
      };
      const res = await apiFetch('/api/connections/save', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.status === 'success') {
        toastEmitter.emitToast({
          title: 'Credentials Saved',
          message: `${provider.replace('_', ' ').toUpperCase()} credentials encrypted with AES-256-GCM. Verifying connection...`,
          type: 'success'
        });
        soundEngine.playBuyChime();
        await fetchConnections();
        // Automatically verify connection against provider
        await handleTest(provider);
      } else {
        toastEmitter.emitToast({
          title: 'Save Failed',
          message: res?.message || 'Failed to save credentials.',
          type: 'error'
        });
      }
    } catch (err) {
      toastEmitter.emitToast({
        title: 'Connection Error',
        message: err.message || 'Could not connect to backend vault.',
        type: 'error'
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [provider]: null }));
    }
  };

  // Action: Test Connection against real provider
  const handleTest = async (provider) => {
    setActionLoading((prev) => ({ ...prev, [provider]: 'testing' }));
    try {
      const res = await apiFetch('/api/connections/test', {
        method: 'POST',
        body: JSON.stringify({ provider })
      });

      if (res && res.success) {
        toastEmitter.emitToast({
          title: 'Verification Succeeded',
          message: res.message || 'Provider connection verified successfully.',
          type: 'success'
        });
        soundEngine.playSuccessChime();
      } else {
        toastEmitter.emitToast({
          title: 'Verification Failed',
          message: res?.message || 'Provider rejected authentication or parameters.',
          type: 'error'
        });
        soundEngine.playVetoChime();
      }
      await fetchConnections();
    } catch (err) {
      toastEmitter.emitToast({
        title: 'Test Failed',
        message: err.message || 'Network error during provider test.',
        type: 'error'
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [provider]: null }));
    }
  };

  // Action: Disconnect
  const handleDisconnect = async (provider) => {
    setActionLoading((prev) => ({ ...prev, [provider]: 'disconnecting' }));
    try {
      const res = await apiFetch('/api/connections/disconnect', {
        method: 'POST',
        body: JSON.stringify({ provider })
      });

      if (res && res.status === 'success') {
        toastEmitter.emitToast({
          title: 'Disconnected',
          message: `${provider.replace('_', ' ').toUpperCase()} credentials purged and connection unlinked.`,
          type: 'info'
        });
        // Clear local form
        setForms((prev) => ({
          ...prev,
          [provider]: Object.keys(prev[provider]).reduce((acc, k) => ({ ...acc, [k]: '' }), {})
        }));
        await fetchConnections();
      }
    } catch (err) {
      toastEmitter.emitToast({
        title: 'Disconnect Error',
        message: err.message || 'Could not purge credentials.',
        type: 'error'
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [provider]: null }));
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected
          </span>
        );
      case 'CONNECTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Connecting
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <Clock className="w-3.5 h-3.5" />
            Token Expired
          </span>
        );
      case 'FAILED':
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'STANDBY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" />
            Standby
          </span>
        );
      case 'DISCONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/30">
            <Unlink className="w-3.5 h-3.5" />
            Disconnected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700/60">
            <AlertCircle className="w-3.5 h-3.5" />
            Not Configured
          </span>
        );
    }
  };

  const angelConn = getConnection('angel_one');
  const tgConn = getConnection('telegram');
  const googleConn = getConnection('google');

  return (
    <div className="space-y-6 animate-fadeIn pb-12 select-none">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-[#1e3a6e]/60 bg-gradient-to-r from-[#09152e]/90 via-[#060c1c]/90 to-[#040814]/90 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Multi-User Connection & Provider Vault
                </h1>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Secure AES-256-GCM credential isolation • Individual authorized accounts • Verified status
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchConnections}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#0d1e3d] hover:bg-[#122852] text-cyan-300 border border-cyan-500/30 flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
        </div>
      </div>

      {/* Grid of Integration Cards (Angel One, Telegram, Google) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* =================================================================== */}
        {/* CARD 1: ANGEL ONE SMARTAPI                                          */}
        {/* =================================================================== */}
        <div className="glass-panel rounded-2xl p-5 border border-[#1e3a6e]/70 bg-[#070e22]/90 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#16294a]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Angel One SmartAPI</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Market Feed & Execution</p>
                </div>
              </div>
              {renderStatusBadge(angelConn.status)}
            </div>

            {/* Sanitized Summary if already saved */}
            {angelConn.sanitizedConfig?.clientId && (
              <div className="mt-3 p-2.5 rounded-lg bg-[#0b162c] border border-cyan-500/20 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>Account Code: <strong className="text-cyan-300">{angelConn.sanitizedConfig.clientId}</strong></span>
                <span className="text-[10px] text-slate-400">TOTP Key Encrypted</span>
              </div>
            )}

            {/* Form Fields */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showSecrets['angel_apiKey'] ? 'text' : 'password'}
                    placeholder="Enter SmartAPI Key"
                    value={forms.angel_one.apiKey}
                    onChange={(e) => handleInputChange('angel_one', 'apiKey', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('angel_apiKey')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                  >
                    {showSecrets['angel_apiKey'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Client Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. V346892"
                    value={forms.angel_one.clientId}
                    onChange={(e) => handleInputChange('angel_one', 'clientId', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    4-Digit PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={forms.angel_one.pin}
                    onChange={(e) => handleInputChange('angel_one', 'pin', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono text-center tracking-widest"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  TOTP Secret Key (Base32)
                </label>
                <div className="relative">
                  <input
                    type={showSecrets['angel_totp'] ? 'text' : 'password'}
                    placeholder="Enter Base32 Secret from SmartAPI portal"
                    value={forms.angel_one.totpSecret}
                    onChange={(e) => handleInputChange('angel_one', 'totpSecret', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('angel_totp')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                  >
                    {showSecrets['angel_totp'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Error or Verified Status */}
            {angelConn.lastError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{angelConn.lastError}</span>
              </div>
            )}

            <div className="mt-3 p-2.5 rounded-lg bg-[#081226] border border-cyan-500/20 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Where to get your SmartAPI credentials:</span>
              </div>
              <ul className="list-disc list-inside text-[10.5px] text-slate-400 space-y-0.5 ml-1">
                <li><strong className="text-slate-200">API Key:</strong> Login to <a href="https://smartapi.angelone.in" target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300">smartapi.angelone.in</a> &rarr; Create App (Trading API)</li>
                <li><strong className="text-slate-200">Client Code:</strong> Your Angel One user ID (e.g. V123456)</li>
                <li><strong className="text-slate-200">4-Digit PIN:</strong> Your mobile app / web trading PIN</li>
                <li><strong className="text-slate-200">TOTP Secret:</strong> On SmartAPI portal, click "Enable TOTP" &rarr; copy the Base32 key</li>
              </ul>
            </div>

            <div className="mt-3 text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span>Required: SmartAPI Historical, Market, Order permissions.</span>
              {angelConn.lastVerifiedAt && (
                <span>Verified: {new Date(angelConn.lastVerifiedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-5 pt-3 border-t border-[#16294a] flex flex-wrap gap-2 justify-end">
            {angelConn.status === 'CONNECTED' && (
              <button
                type="button"
                onClick={() => handleDisconnect('angel_one')}
                disabled={actionLoading['angel_one']}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
              >
                Disconnect
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTest('angel_one')}
              disabled={actionLoading['angel_one']}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0d1e3d] hover:bg-[#122852] text-cyan-300 border border-cyan-500/40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              Test Connection
            </button>
            <button
              type="button"
              onClick={() => handleConnect('angel_one')}
              disabled={actionLoading['angel_one']}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Save & Connect
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* CARD 2: TELEGRAM BOT API                                           */}
        {/* =================================================================== */}
        <div className="glass-panel rounded-2xl p-5 border border-[#1e3a6e]/70 bg-[#070e22]/90 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#16294a]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Telegram Bot API</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Bi-Directional Command & Alert Gateway</p>
                </div>
              </div>
              {renderStatusBadge(tgConn.status)}
            </div>

            {/* Sanitized Summary if already saved */}
            {tgConn.sanitizedConfig?.botUsername && (
              <div className="mt-3 p-2.5 rounded-lg bg-[#0b162c] border border-cyan-500/20 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>Bot: <strong className="text-sky-300">{tgConn.sanitizedConfig.botUsername}</strong></span>
                <span className="text-[10px] text-slate-400">Token: {tgConn.sanitizedConfig.maskedToken}</span>
              </div>
            )}

            {/* Form Fields */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Telegram Bot Token
                </label>
                <div className="relative">
                  <input
                    type={showSecrets['tg_token'] ? 'text' : 'password'}
                    placeholder="e.g. 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ (from @BotFather)"
                    value={forms.telegram.botToken}
                    onChange={(e) => handleInputChange('telegram', 'botToken', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('tg_token')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                  >
                    {showSecrets['tg_token'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Bot Username
                  </label>
                  <input
                    type="text"
                    placeholder="@MyTradingBot"
                    value={forms.telegram.botUsername}
                    onChange={(e) => handleInputChange('telegram', 'botUsername', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Your Chat ID (from @userinfobot)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 6912523089"
                    value={forms.telegram.allowedChatIds}
                    onChange={(e) => handleInputChange('telegram', 'allowedChatIds', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Error or Verified Status */}
            {tgConn.lastError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{tgConn.lastError}</span>
              </div>
            )}

            {/* Telegram Setup Guide Helper */}
            <div className="mt-3 p-2.5 rounded-lg bg-[#081226] border border-cyan-500/20 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>How to setup your Telegram Bot in 60 seconds:</span>
              </div>
              <ul className="list-disc list-inside text-[10.5px] text-slate-400 space-y-0.5 ml-1">
                <li><strong className="text-slate-200">Create Bot:</strong> Open Telegram, message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-sky-400 underline">@BotFather</a>, send <code className="bg-slate-800 px-1 py-0.5 rounded text-sky-300">/newbot</code> and copy the HTTP token.</li>
                <li><strong className="text-slate-200">Find Chat ID:</strong> Message <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-sky-400 underline">@userinfobot</a> on Telegram to get your numeric ID.</li>
                <li><strong className="text-slate-200">Start Bot:</strong> Open your newly created bot in Telegram and click <strong className="text-slate-200">Start</strong>.</li>
              </ul>
            </div>

            <div className="mt-3 text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span>Supports: /status, /help, /stop, /pnl, /positions, and RMS alerts.</span>
              {tgConn.lastVerifiedAt && (
                <span>Verified: {new Date(tgConn.lastVerifiedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-5 pt-3 border-t border-[#16294a] flex flex-wrap gap-2 justify-end">
            {tgConn.status === 'CONNECTED' && (
              <button
                type="button"
                onClick={() => handleDisconnect('telegram')}
                disabled={actionLoading['telegram']}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
              >
                Disconnect
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTest('telegram')}
              disabled={actionLoading['telegram']}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0d1e3d] hover:bg-[#122852] text-cyan-300 border border-cyan-500/40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              Test Connection
            </button>
            <button
              type="button"
              onClick={() => handleConnect('telegram')}
              disabled={actionLoading['telegram']}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Save & Connect
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* CARD 4: GOOGLE OAUTH & GEMINI API                                  */}
        {/* =================================================================== */}
        <div className="glass-panel rounded-2xl p-5 border border-[#1e3a6e]/70 bg-[#070e22]/90 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#16294a]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Google OAuth & Gemini 2.0</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Cognitive Advisory & Vision</p>
                </div>
              </div>
              {renderStatusBadge(googleConn.status)}
            </div>

            {/* Sanitized Summary if already saved */}
            {googleConn.sanitizedConfig?.email && (
              <div className="mt-3 p-2.5 rounded-lg bg-[#0b162c] border border-cyan-500/20 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>Account: <strong className="text-indigo-300">{googleConn.sanitizedConfig.email}</strong></span>
                <span className="text-[10px] text-slate-400">Gemini: {googleConn.sanitizedConfig.hasGeminiApiKey ? 'Key Configured' : 'OAuth Only'}</span>
              </div>
            )}

            {/* Form Fields */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Gemini API Key
                </label>
                <div className="relative">
                  <input
                    type={showSecrets['google_apiKey'] ? 'text' : 'password'}
                    placeholder="AIzaSy... Google AI Studio API key"
                    value={forms.google.geminiApiKey}
                    onChange={(e) => handleInputChange('google', 'geminiApiKey', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowSecret('google_apiKey')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                  >
                    {showSecrets['google_apiKey'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    OAuth Client ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1234...apps.googleusercontent.com"
                    value={forms.google.clientId}
                    onChange={(e) => handleInputChange('google', 'clientId', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    OAuth Client Secret
                  </label>
                  <input
                    type="password"
                    placeholder="GOCSPX-..."
                    value={forms.google.clientSecret}
                    onChange={(e) => handleInputChange('google', 'clientSecret', e.target.value)}
                    className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Error or Verified Status */}
            {googleConn.lastError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{googleConn.lastError}</span>
              </div>
            )}

            <div className="mt-3 text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span>Requires: openid, email, profile scopes or Gemini generative model quota.</span>
              {googleConn.lastVerifiedAt && (
                <span>Verified: {new Date(googleConn.lastVerifiedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-5 pt-3 border-t border-[#16294a] flex flex-wrap gap-2 justify-end">
            {googleConn.status === 'CONNECTED' && (
              <button
                type="button"
                onClick={() => handleDisconnect('google')}
                disabled={actionLoading['google']}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
              >
                Disconnect
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTest('google')}
              disabled={actionLoading['google']}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0d1e3d] hover:bg-[#122852] text-cyan-300 border border-cyan-500/40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              Test Connection
            </button>
            <button
              type="button"
              onClick={() => handleConnect('google')}
              disabled={actionLoading['google']}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Save & Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

