import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark,
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
  Unlink,
  Cpu,
  Check
} from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { toastEmitter } from '../../utils/toastEmitter';
import { soundEngine } from '../../utils/audioChime';
import ConnectionLifecycleModal from '../ConnectionLifecycleModal';

export default function ConnectionsView() {
  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [showSecrets, setShowSecrets] = useState({});

  // Verified capability state from pre-save or on-demand testing
  const [verifiedStates, setVerifiedStates] = useState({});

  // Lifecycle Modal
  const [lifecycleModal, setLifecycleModal] = useState({
    isOpen: false,
    provider: 'angel_one',
    mode: 'test',
    status: 'in_progress',
    steps: [],
    readBackVerified: false,
    errorMessage: null,
    successDetails: null,
    verifiedCapabilities: []
  });

  // Forms for each provider
  const [forms, setForms] = useState({
    angel_one: { apiKey: '', clientId: '', pin: '', totpSecret: '' },
    telegram: { botToken: '', botUsername: '', allowedChatIds: '' },
    google: { geminiApiKey: '', clientId: '', clientSecret: '' },
    ollama: { endpointUrl: 'http://127.0.0.1:11434', modelName: 'llama3' }
  });

  const fetchConnections = useCallback(async () => {
    try {
      const res = await apiFetch('/api/connections/status');
      const data = res?.connections || (typeof res.json === 'function' ? (await res.clone().json())?.connections : null);
      if (Array.isArray(data)) {
        setConnections(data);
      } else if (Array.isArray(res?.connections)) {
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
    // Reset test verification badge if credentials were edited
    if (verifiedStates[provider]) {
      setVerifiedStates((prev) => ({
        ...prev,
        [provider]: null
      }));
    }
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

  // Action: Test Connection against upstream API (Test-Before-Save)
  const handleTest = async (provider) => {
    const f = forms[provider];
    const conn = getConnection(provider);

    // Validation checks
    if (provider === 'angel_one') {
      const hasStored = Boolean(conn.sanitizedConfig?.clientId);
      if (!hasStored && (!f.apiKey || !f.clientId || !f.pin || !f.totpSecret)) {
        toastEmitter.emitToast({
          title: 'Validation Error',
          message: 'All 4 fields are required: API Key, Client Code, 4-Digit PIN, and Base32 TOTP Secret.',
          type: 'error'
        });
        return;
      }
      if (f.pin && !/^\d{4}$/.test(f.pin.trim())) {
        toastEmitter.emitToast({
          title: 'Invalid PIN',
          message: 'Angel One PIN must be exactly 4 numeric digits.',
          type: 'error'
        });
        return;
      }
      if (f.totpSecret && f.totpSecret.trim().replace(/\s+/g, '').length < 16) {
        toastEmitter.emitToast({
          title: 'Invalid TOTP Secret',
          message: 'Base32 TOTP Secret key must be at least 16 characters.',
          type: 'error'
        });
        return;
      }
    } else if (provider === 'telegram') {
      const hasStored = Boolean(conn.sanitizedConfig?.maskedToken);
      if (!hasStored && !f.botToken) {
        toastEmitter.emitToast({
          title: 'Validation Error',
          message: 'Telegram Bot Token is required.',
          type: 'error'
        });
        return;
      }
    }

    const initialSteps = [
      { label: 'Client Parameter & Format Sanitization', status: 'active', detail: 'OK' },
      { label: 'Upstream Authentication Handshake', status: 'pending', detail: 'NETWORK' },
      { label: 'Capability & Session Token Authorization', status: 'pending', detail: 'AUTH' },
      { label: 'Adapter Synchronization & Readiness Gate', status: 'pending', detail: 'READY' }
    ];

    setLifecycleModal({
      isOpen: true,
      provider,
      mode: 'test',
      status: 'in_progress',
      steps: initialSteps,
      readBackVerified: false,
      errorMessage: null,
      successDetails: null,
      verifiedCapabilities: []
    });

    setActionLoading((prev) => ({ ...prev, [provider]: 'testing' }));

    try {
      await new Promise((r) => setTimeout(r, 200));

      setLifecycleModal((prev) => ({
        ...prev,
        steps: prev.steps.map((s, idx) =>
          idx === 0 ? { ...s, status: 'completed' } : idx === 1 ? { ...s, status: 'active' } : s
        )
      }));

      // Send proposed credentials if any field is filled, allowing pre-save verification
      const res = await apiFetch('/api/connections/test', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          credentials: forms[provider]
        })
      });

      const isSuccess = Boolean(res?.success);
      const message = res?.message || (isSuccess ? 'Verification succeeded.' : 'Provider authentication rejected.');
      const capabilities = res?.verifiedCapabilities || [];

      if (isSuccess) {
        setLifecycleModal((prev) => ({
          ...prev,
          status: 'success',
          steps: prev.steps.map((s) => ({ ...s, status: 'completed' })),
          successDetails: {
            title: 'Connection Handshake Verified',
            message
          },
          verifiedCapabilities: capabilities
        }));

        setVerifiedStates((prev) => ({
          ...prev,
          [provider]: {
            verified: true,
            message,
            capabilities,
            testedAt: Date.now()
          }
        }));

        try {
          soundEngine.playSuccessChime();
        } catch (audioErr) {
          console.warn('[Audio] Non-fatal chime exception:', audioErr);
        }

        toastEmitter.emitToast({
          title: 'Connection Verified',
          message: 'Handshake successful. You can now securely persist to Vault.',
          type: 'success'
        });
      } else {
        setLifecycleModal((prev) => ({
          ...prev,
          status: 'failed',
          errorMessage: message,
          steps: prev.steps.map((s, idx) => (idx === 1 ? { ...s, status: 'failed' } : s))
        }));

        try {
          soundEngine.playVetoChime();
        } catch (audioErr) {
          console.warn('[Audio] Non-fatal chime exception:', audioErr);
        }

        toastEmitter.emitToast({
          title: 'Verification Failed',
          message,
          type: 'error'
        });
      }
      await fetchConnections();
    } catch (err) {
      setLifecycleModal((prev) => ({
        ...prev,
        status: 'failed',
        errorMessage: err.message || 'Network error during provider test.',
        steps: prev.steps.map((s) => (s.status === 'active' ? { ...s, status: 'failed' } : s))
      }));

      try {
        soundEngine.playAlertChime();
      } catch (audioErr) {
        console.warn('[Audio] Non-fatal chime exception:', audioErr);
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [provider]: null }));
    }
  };

  // Action: Save Verified Credentials with Durable Read-Back Verification
  const handleSave = async (provider) => {
    const initialSteps = [
      { label: 'Client Parameter Sanitization & Memory Hardening', status: 'active', detail: 'OK' },
      { label: 'AES-256-GCM Envelope Encryption & SQLite Commit', status: 'pending', detail: 'SQLite' },
      { label: 'Durable Read-Back Decryption Verification', status: 'pending', detail: 'AES-GCM' },
      { label: 'Provider Runtime Persistence Confirmed', status: 'pending', detail: 'PERSISTED' }
    ];

    setLifecycleModal({
      isOpen: true,
      provider,
      mode: 'save',
      status: 'in_progress',
      steps: initialSteps,
      readBackVerified: false,
      errorMessage: null,
      successDetails: null,
      verifiedCapabilities: []
    });

    setActionLoading((prev) => ({ ...prev, [provider]: 'saving' }));

    try {
      await new Promise((r) => setTimeout(r, 200));

      setLifecycleModal((prev) => ({
        ...prev,
        steps: prev.steps.map((s, idx) =>
          idx === 0 ? { ...s, status: 'completed' } : idx === 1 ? { ...s, status: 'active' } : s
        )
      }));

      const payload = {
        provider,
        credentials: forms[provider]
      };
      const res = await apiFetch('/api/connections/save', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const isSuccess = res && (res.status === 'success' || res.success || res.ok);

      if (isSuccess) {
        setLifecycleModal((prev) => ({
          ...prev,
          status: 'success',
          readBackVerified: true,
          steps: prev.steps.map((s) => ({ ...s, status: 'completed' })),
          successDetails: {
            title: 'Credentials Securely Stored',
            message: `${provider.replace('_', ' ').toUpperCase()} credentials encrypted with AES-256-GCM and verified in SQLite runtime storage.`
          }
        }));

        try {
          soundEngine.playSuccessChime();
        } catch (audioErr) {
          console.warn('[Audio] Non-fatal chime exception:', audioErr);
        }

        toastEmitter.emitToast({
          title: 'Credentials Saved',
          message: `${provider.replace('_', ' ').toUpperCase()} credentials saved with durable read-back verification.`,
          type: 'success'
        });

        // Mark as verified & clear plain inputs
        setVerifiedStates((prev) => ({
          ...prev,
          [provider]: {
            verified: true,
            message: 'Persisted in Vault and verified.',
            capabilities: prev[provider]?.capabilities || [],
            testedAt: Date.now()
          }
        }));

        await fetchConnections();
      } else {
        const err = res?.message || 'Failed to persist credentials.';
        setLifecycleModal((prev) => ({
          ...prev,
          status: 'failed',
          errorMessage: err,
          steps: prev.steps.map((s, idx) => (idx === 1 ? { ...s, status: 'failed' } : s))
        }));

        try {
          soundEngine.playAlertChime();
        } catch (audioErr) {
          console.warn('[Audio] Non-fatal chime exception:', audioErr);
        }
      }
    } catch (err) {
      setLifecycleModal((prev) => ({
        ...prev,
        status: 'failed',
        errorMessage: err.message || 'Could not connect to backend vault.',
        steps: prev.steps.map((s) => (s.status === 'active' ? { ...s, status: 'failed' } : s))
      }));

      try {
        soundEngine.playAlertChime();
      } catch (audioErr) {
        console.warn('[Audio] Non-fatal chime exception:', audioErr);
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [provider]: null }));
    }
  };

  // Action: Disconnect & Purge
  const handleDisconnect = async (provider) => {
    setActionLoading((prev) => ({ ...prev, [provider]: 'disconnecting' }));
    try {
      const res = await apiFetch('/api/connections/disconnect', {
        method: 'POST',
        body: JSON.stringify({ provider })
      });

      if (res && (res.status === 'success' || res.success || res.ok)) {
        toastEmitter.emitToast({
          title: 'Disconnected',
          message: `${provider.replace('_', ' ').toUpperCase()} credentials purged and connection unlinked.`,
          type: 'info'
        });

        try {
          soundEngine.playBuyChime();
        } catch (e) {
          console.warn('[Audio] Non-fatal sound note:', e);
        }

        setForms((prev) => ({
          ...prev,
          [provider]: Object.keys(prev[provider]).reduce((acc, k) => ({ ...acc, [k]: '' }), {})
        }));

        setVerifiedStates((prev) => ({
          ...prev,
          [provider]: null
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
      case 'SAVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            <Lock className="w-3.5 h-3.5" />
            Saved in Vault
          </span>
        );
      case 'AUTHENTICATING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Authenticating...
          </span>
        );
      case 'AUTH_FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            Auth Failed
          </span>
        );
      case 'RATE_LIMITED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <Clock className="w-3.5 h-3.5" />
            Rate Limited
          </span>
        );
      case 'SESSION_EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <Clock className="w-3.5 h-3.5" />
            Session Expired
          </span>
        );
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected & Verified
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
  const ollamaConn = getConnection('ollama');

  return (
    <div className="space-y-6 animate-fadeIn pb-12 select-none">
      {/* Top Header Banner */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-[#1e3a6e]/60 bg-gradient-to-r from-[#09152e]/90 via-[#060c1c]/90 to-[#040814]/90 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Unified Connection & Security Vault
                </h1>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  AES-256-GCM Envelope Encryption • SQLite WAL Persistence • Test-Before-Save Architecture
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchConnections}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#0d1e3d] hover:bg-[#122852] text-cyan-300 border border-cyan-500/30 flex items-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Vault</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid of 4 Integration Cards */}
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
                  <p className="text-[11px] text-slate-400 font-mono">Market Feed & Paper Execution Conduit</p>
                </div>
              </div>
              {renderStatusBadge(angelConn.status)}
            </div>

            {/* Sanitized Summary if already saved */}
            {angelConn.sanitizedConfig?.clientId && (
              <div className="mt-3 p-2.5 rounded-lg bg-[#0b162c] border border-cyan-500/20 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>Client Code: <strong className="text-cyan-300">{angelConn.sanitizedConfig.clientId}</strong></span>
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Encrypted in SQLite
                </span>
              </div>
            )}

            {/* Verified Capabilities Badge Banner */}
            {verifiedStates['angel_one']?.verified && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
                <div className="font-semibold flex items-center gap-1.5 mb-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Connection Verified Against SmartAPI</span>
                </div>
                <div className="text-[10.5px] text-emerald-200/90 font-mono flex flex-wrap gap-2">
                  {verifiedStates['angel_one'].capabilities.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ {c}
                    </span>
                  ))}
                </div>
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
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
                    title={showSecrets['angel_apiKey'] ? 'Hide secret' : 'Reveal secret'}
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
                    4-Digit Trading PIN
                  </label>
                  <div className="relative">
                    <input
                      type={showSecrets['angel_pin'] ? 'text' : 'password'}
                      maxLength={4}
                      placeholder="••••"
                      value={forms.angel_one.pin}
                      onChange={(e) => handleInputChange('angel_one', 'pin', e.target.value)}
                      className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono text-center tracking-widest pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowSecret('angel_pin')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showSecrets['angel_pin'] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
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
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
                    title={showSecrets['angel_totp'] ? 'Hide secret' : 'Reveal secret'}
                  >
                    {showSecrets['angel_totp'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Error Status */}
            {angelConn.lastError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{angelConn.lastError}</span>
              </div>
            )}

            <div className="mt-3 p-2.5 rounded-lg bg-[#081226] border border-cyan-500/20 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test-Before-Save Verification:</span>
              </div>
              <ul className="list-disc list-inside text-[10.5px] text-slate-400 space-y-0.5 ml-1">
                <li><strong className="text-slate-200">Test Connection:</strong> Validates inputs directly with loginByPassword before saving.</li>
                <li><strong className="text-slate-200">Save Verified:</strong> Encrypts with AES-256-GCM and verifies durability in SQLite.</li>
                <li><strong className="text-slate-200">TOTP:</strong> Generate on SmartAPI portal &rarr; Enable TOTP &rarr; paste Base32 key.</li>
              </ul>
            </div>

            <div className="mt-3 text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span>Fail-Closed RMS: Order execution locked in Paper Mode.</span>
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
              <span>Test Connection</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave('angel_one')}
              disabled={actionLoading['angel_one']}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                verifiedStates['angel_one']?.verified
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                  : 'bg-cyan-500 text-black hover:bg-cyan-400 shadow-lg shadow-cyan-500/20'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{verifiedStates['angel_one']?.verified ? 'Save Verified Connection' : 'Save Credentials'}</span>
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

            {/* Verified Capabilities Badge Banner */}
            {verifiedStates['telegram']?.verified && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
                <div className="font-semibold flex items-center gap-1.5 mb-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Telegram Bot Handshake Verified</span>
                </div>
                <div className="text-[10.5px] text-emerald-200/90 font-mono flex flex-wrap gap-2">
                  {verifiedStates['telegram'].capabilities.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ {c}
                    </span>
                  ))}
                </div>
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
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
                    title={showSecrets['tg_token'] ? 'Hide secret' : 'Reveal secret'}
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
                    Admin Chat ID
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

            {/* Error Status */}
            {tgConn.lastError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{tgConn.lastError}</span>
              </div>
            )}

            <div className="mt-3 p-2.5 rounded-lg bg-[#081226] border border-cyan-500/20 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Telegram Commander Integration:</span>
              </div>
              <ul className="list-disc list-inside text-[10.5px] text-slate-400 space-y-0.5 ml-1">
                <li><strong className="text-slate-200">Bot Creation:</strong> Create bot with <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-sky-400 underline">@BotFather</a>.</li>
                <li><strong className="text-slate-200">Alerts & Commands:</strong> Outbound RMS circuit breaker notifications and inbound command processing.</li>
              </ul>
            </div>

            <div className="mt-3 text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span>Supports: /status, /help, /stop, /pnl, and RMS alerts.</span>
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
              <span>Test Connection</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave('telegram')}
              disabled={actionLoading['telegram']}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                verifiedStates['telegram']?.verified
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                  : 'bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/20'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{verifiedStates['telegram']?.verified ? 'Save Verified Connection' : 'Save Credentials'}</span>
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* CARD 3: GOOGLE OAUTH & GEMINI API                                  */}
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
                  <p className="text-[11px] text-slate-400 font-mono">Cognitive Advisory & Multimodal Intelligence</p>
                </div>
              </div>
              {renderStatusBadge(googleConn.status)}
            </div>

            {/* Sanitized Summary if already saved */}
            {googleConn.sanitizedConfig?.email && (
              <div className="mt-3 p-2.5 rounded-lg bg-[#0b162c] border border-cyan-500/20 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>Account: <strong className="text-indigo-300">{googleConn.sanitizedConfig.email}</strong></span>
                <span className="text-[10px] text-slate-400">Gemini: {googleConn.sanitizedConfig.hasGeminiApiKey ? 'Key Active' : 'OAuth'}</span>
              </div>
            )}

            {/* Verified Capabilities Badge Banner */}
            {verifiedStates['google']?.verified && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
                <div className="font-semibold flex items-center gap-1.5 mb-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Google AI Services Handshake Verified</span>
                </div>
                <div className="text-[10.5px] text-emerald-200/90 font-mono flex flex-wrap gap-2">
                  {verifiedStates['google'].capabilities.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ {c}
                    </span>
                  ))}
                </div>
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
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
                    title={showSecrets['google_apiKey'] ? 'Hide secret' : 'Reveal secret'}
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
                  <div className="relative">
                    <input
                      type={showSecrets['google_secret'] ? 'text' : 'password'}
                      placeholder="GOCSPX-..."
                      value={forms.google.clientSecret}
                      onChange={(e) => handleInputChange('google', 'clientSecret', e.target.value)}
                      className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowSecret('google_secret')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showSecrets['google_secret'] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Status */}
            {googleConn.lastError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{googleConn.lastError}</span>
              </div>
            )}

            <div className="mt-3 text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span>Requires: openid, email, profile scopes or Gemini API Key.</span>
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
              <span>Test Connection</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave('google')}
              disabled={actionLoading['google']}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                verifiedStates['google']?.verified
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                  : 'bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/20'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{verifiedStates['google']?.verified ? 'Save Verified Connection' : 'Save Credentials'}</span>
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* CARD 4: OLLAMA LOCAL RUNTIME                                        */}
        {/* =================================================================== */}
        <div className="glass-panel rounded-2xl p-5 border border-[#1e3a6e]/70 bg-[#070e22]/90 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#16294a]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Ollama Local Model Runtime</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Private Self-Hosted LLM Intelligence</p>
                </div>
              </div>
              {renderStatusBadge(ollamaConn.status)}
            </div>

            {/* Sanitized Summary if already saved */}
            {ollamaConn.sanitizedConfig?.endpointUrl && (
              <div className="mt-3 p-2.5 rounded-lg bg-[#0b162c] border border-cyan-500/20 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>Endpoint: <strong className="text-teal-300">{ollamaConn.sanitizedConfig.endpointUrl}</strong></span>
                <span className="text-[10px] text-slate-400">Model: {ollamaConn.sanitizedConfig.modelName || 'llama3'}</span>
              </div>
            )}

            {/* Verified Capabilities Badge Banner */}
            {verifiedStates['ollama']?.verified && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
                <div className="font-semibold flex items-center gap-1.5 mb-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Local LLM Runtime Reachable & Verified</span>
                </div>
                <div className="text-[10.5px] text-emerald-200/90 font-mono flex flex-wrap gap-2">
                  {verifiedStates['ollama'].capabilities.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Local Server Endpoint URL
                </label>
                <input
                  type="text"
                  placeholder="http://127.0.0.1:11434"
                  value={forms.ollama.endpointUrl}
                  onChange={(e) => handleInputChange('ollama', 'endpointUrl', e.target.value)}
                  className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Target LLM Model Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. llama3, mistral, deepseek-r1:8b"
                  value={forms.ollama.modelName}
                  onChange={(e) => handleInputChange('ollama', 'modelName', e.target.value)}
                  className="w-full bg-[#050b18] border border-[#1c3560] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>

            {/* Error Status */}
            {ollamaConn.lastError && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{ollamaConn.lastError}</span>
              </div>
            )}

            <div className="mt-3 p-2.5 rounded-lg bg-[#081226] border border-cyan-500/20 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-teal-300 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ollama Setup Instructions:</span>
              </div>
              <ul className="list-disc list-inside text-[10.5px] text-slate-400 space-y-0.5 ml-1">
                <li><strong className="text-slate-200">Start Service:</strong> Run <code className="bg-slate-800 px-1 py-0.5 rounded text-teal-300">ollama serve</code> in your local terminal.</li>
                <li><strong className="text-slate-200">Pull Model:</strong> Pull model via <code className="bg-slate-800 px-1 py-0.5 rounded text-teal-300">ollama pull llama3</code>.</li>
              </ul>
            </div>

            <div className="mt-3 text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span>Zero-latency local reasoning without external API dependency.</span>
              {ollamaConn.lastVerifiedAt && (
                <span>Verified: {new Date(ollamaConn.lastVerifiedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-5 pt-3 border-t border-[#16294a] flex flex-wrap gap-2 justify-end">
            {ollamaConn.status === 'CONNECTED' && (
              <button
                type="button"
                onClick={() => handleDisconnect('ollama')}
                disabled={actionLoading['ollama']}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
              >
                Disconnect
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTest('ollama')}
              disabled={actionLoading['ollama']}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0d1e3d] hover:bg-[#122852] text-cyan-300 border border-cyan-500/40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Test Connection</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave('ollama')}
              disabled={actionLoading['ollama']}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                verifiedStates['ollama']?.verified
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                  : 'bg-teal-500 text-black hover:bg-teal-400 shadow-lg shadow-teal-500/20'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{verifiedStates['ollama']?.verified ? 'Save Verified Connection' : 'Save Credentials'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lifecycle Modal */}
      <ConnectionLifecycleModal
        isOpen={lifecycleModal.isOpen}
        onClose={() => setLifecycleModal((prev) => ({ ...prev, isOpen: false }))}
        provider={lifecycleModal.provider}
        mode={lifecycleModal.mode}
        status={lifecycleModal.status}
        steps={lifecycleModal.steps}
        readBackVerified={lifecycleModal.readBackVerified}
        errorMessage={lifecycleModal.errorMessage}
        successDetails={lifecycleModal.successDetails}
        verifiedCapabilities={lifecycleModal.verifiedCapabilities}
        onRetry={() => {
          if (lifecycleModal.mode === 'save') {
            handleSave(lifecycleModal.provider);
          } else {
            handleTest(lifecycleModal.provider);
          }
        }}
        onSaveVerified={(provider) => {
          handleSave(provider);
        }}
      />
    </div>
  );
}
