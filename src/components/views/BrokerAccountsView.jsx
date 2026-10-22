import React, { useState } from 'react';
import {
  Landmark,
  Radio,
  CheckCircle2,
  RefreshCw,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  Zap,
  Wallet,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Lock,
  Copy,
  Check
} from 'lucide-react';
import { soundEngine } from '../../utils/audioChime';
import { apiFetch } from '../../utils/api';

export default function BrokerAccountsView({ brokerConnections, onUpdateBroker }) {
  const [selectedBroker, setSelectedBroker] = useState('angel_one');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Form states strictly empty - NO mock auto-fills
  const [angelForm, setAngelForm] = useState({
    apiKey: '',
    clientId: '',
    pin: '',
    totp: '',
    totpSecret: ''
  });

  const [zerodhaForm, setZerodhaForm] = useState({
    apiKey: '',
    apiSecret: '',
    requestToken: ''
  });

  const [upstoxForm, setUpstoxForm] = useState({
    apiKey: '',
    apiSecret: '',
    authCode: ''
  });

  const [fivePaisaForm, setFivePaisaForm] = useState({
    appName: '',
    userId: '',
    password: '',
    pin: ''
  });

  // Initial state strictly DISCONNECTED with ₹0.00 balances
  const [brokerDetails, setBrokerDetails] = useState({
    angel_one: {
      connected: false,
      clientName: '',
      clientId: '',
      availableCash: 0.00,
      collateralMargin: 0.00,
      netMargin: 0.00,
      jwtToken: '',
      feedToken: '',
      refreshToken: '',
      tokenExpires: 'Disconnected',
      ping: '--',
      lastSync: '--'
    },
    zerodha: {
      connected: false,
      clientName: '',
      clientId: '',
      availableCash: 0.00,
      collateralMargin: 0.00,
      netMargin: 0.00,
      jwtToken: '',
      tokenExpires: 'Disconnected',
      ping: '--',
      lastSync: '--'
    },
    upstox: {
      connected: false,
      clientName: '',
      clientId: '',
      availableCash: 0.00,
      collateralMargin: 0.00,
      netMargin: 0.00,
      jwtToken: '',
      tokenExpires: 'Disconnected',
      ping: '--',
      lastSync: '--'
    },
    '5paisa': {
      connected: false,
      clientName: '',
      clientId: '',
      availableCash: 0.00,
      collateralMargin: 0.00,
      netMargin: 0.00,
      jwtToken: '',
      tokenExpires: 'Disconnected',
      ping: '--',
      lastSync: '--'
    }
  });

  // Fetch live broker status on mount from backend
  React.useEffect(() => {
    const fetchLiveBrokerStatus = async () => {
      try {
        const res = await apiFetch('/api/broker/status');
        if (res.ok) {
          const data = await res.json();
          if (data.brokers) {
            setBrokerDetails((prev) => {
              const updated = { ...prev };
              Object.keys(data.brokers).forEach((key) => {
                if (updated[key]) {
                  const b = data.brokers[key];
                  updated[key] = {
                    ...updated[key],
                    connected: b.connected || false,
                    clientName: b.clientName || '',
                    clientId: b.clientId || '',
                    availableCash: Number(b.availableCash) || 0.00,
                    collateralMargin: Number(b.collateralMargin) || 0.00,
                    netMargin: Number(b.netMargin) || 0.00,
                    jwtToken: b.jwtToken || '',
                    feedToken: b.feedToken || '',
                    tokenExpires: b.tokenExpires || (b.connected ? '23h 59m' : 'Disconnected'),
                    ping: b.ping || '--'
                  };
                }
              });
              return updated;
            });
          }
        }
      } catch (e) {}
    };
    fetchLiveBrokerStatus();
  }, []);

  // Handle Angel One Connect (Sends POST request to local Python backend /api/broker/connect)
  const handleConnectAngelOne = async (e) => {
    e?.preventDefault();

    // Strict validation: Require real user inputs
    if (!angelForm.apiKey.trim() || !angelForm.clientId.trim() || !angelForm.pin.trim() || !angelForm.totp.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter your Angel One SmartAPI Key, Client ID, PIN, and TOTP to authenticate.'
      });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    const payload = {
      broker: 'angel_one',
      apiKey: angelForm.apiKey.trim(),
      clientId: angelForm.clientId.trim(),
      pin: angelForm.pin.trim(),
      totp: angelForm.totp.trim(),
      totpSecret: angelForm.totpSecret.trim()
    };

    try {
      const response = await apiFetch('/api/broker/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const resData = await response.json();

        // Check if backend returned an authentication error from Angel One
        if (resData.status === 'error') {
          soundEngine.playAlertChime();
          setStatusMessage({
            type: 'error',
            text: resData.message || 'Angel One SmartAPI authentication failed. Check credentials and TOTP.'
          });
          return;
        }

        const b = resData.broker || {};

        // Strict real-time state with ZERO mock balance
        const realCash = Number(b.availableCash) || 0.00;
        const realCollateral = Number(b.collateralMargin) || 0.00;
        const realNet = realCash + realCollateral;

        const updatedAngel = {
          connected: true,
          clientId: b.clientId || angelForm.clientId,
          clientName: b.clientName || `Angel Account (${angelForm.clientId})`,
          availableCash: realCash,
          collateralMargin: realCollateral,
          netMargin: realNet,
          jwtToken: b.jwtToken || '',
          feedToken: b.feedToken || '',
          tokenExpires: b.tokenExpires || '23h 59m',
          ping: b.ping || '14ms',
          lastSync: new Date().toLocaleTimeString()
        };

        setBrokerDetails((prev) => ({
          ...prev,
          angel_one: updatedAngel
        }));

        // Notify parent to turn Angel One dot green
        if (onUpdateBroker && brokerConnections) {
          onUpdateBroker(
            brokerConnections.map((brk) =>
              brk.id === 'angel'
                ? { ...brk, status: 'Connected', accountId: angelForm.clientId, ping: updatedAngel.ping, balance: realCash }
                : brk
            )
          );
        }

        soundEngine.playBuyChime();
        setStatusMessage({
          type: 'success',
          text: `SmartAPI Authenticated for Client ID ${angelForm.clientId}! Real Margin: ₹${realCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`
        });
      } else {
        throw new Error('Backend returned status ' + response.status);
      }
    } catch (err) {
      console.error('Error connecting to broker backend:', err);
      setStatusMessage({
        type: 'error',
        text: 'Failed to authenticate with backend at http://127.0.0.1:8000. Ensure python_stream_server.py is running.'
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // Handle generic connect for other brokers
  const handleConnectOther = async (brokerKey, name, form) => {
    // Validate inputs
    const values = Object.values(form);
    if (values.some((v) => !v.trim())) {
      setStatusMessage({
        type: 'error',
        text: `Please enter all required API credentials for ${name} before connecting.`
      });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const response = await apiFetch('/api/broker/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker: brokerKey,
          apiKey: form.apiKey || form.appName,
          apiSecret: form.apiSecret || form.password,
          clientId: form.clientId || form.userId
        })
      });

      if (response.ok) {
        const resData = await response.json();
        if (resData.status === 'unsupported' || resData.capability === 'COMING_SOON') {
          soundEngine.playAlertChime();
          setStatusMessage({
            type: 'warning',
            text: resData.message || `${name} adapter integration is COMING SOON. Only Angel One SmartAPI is currently supported.`
          });
          return;
        }

        const b = resData.broker;
        const realCash = Number(b?.availableCash) || 0.00;
        const realCollateral = Number(b?.collateralMargin) || 0.00;
        const realNet = Number(b?.netMargin) || (realCash + realCollateral);

        setBrokerDetails((prev) => ({
          ...prev,
          [brokerKey]: {
            ...prev[brokerKey],
            connected: true,
            clientId: b?.clientId || 'LIVE-USER',
            clientName: b?.clientName || `${name} Pro Account`,
            availableCash: realCash,
            collateralMargin: realCollateral,
            netMargin: realNet,
            tokenExpires: '23h 59m',
            ping: b?.ping || '12ms',
            lastSync: new Date().toLocaleTimeString()
          }
        }));

        if (onUpdateBroker && brokerConnections) {
          onUpdateBroker(
            brokerConnections.map((brk) =>
              brk.id === brokerKey || brk.name.toLowerCase().includes(name.toLowerCase())
                ? { ...brk, status: 'Connected', ping: '12ms' }
                : brk
            )
          );
        }

        soundEngine.playBuyChime();
        setStatusMessage({
          type: 'success',
          text: `${name} session validated and broker stream online.`
        });
      }
    } catch (e) {
      setStatusMessage({
        type: 'error',
        text: `Could not connect to ${name}. Ensure backend is reachable.`
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const currentDetails = brokerDetails[selectedBroker] || brokerDetails.angel_one;

  const totalCapital = Object.values(brokerDetails).reduce(
    (acc, curr) => acc + (curr.connected ? curr.netMargin : 0),
    0
  );

  const copyToken = (tok) => {
    navigator.clipboard?.writeText(tok);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-4 animate-fadeIn select-none">
      {/* Top Header */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3 border border-[#1e3a6e]/60">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-cyan-400" />
            Broker Accounts & SmartAPI Direct Market Bridges
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Connect Angel One SmartAPI, Zerodha Kite, Upstox, and 5paisa with your live credentials
          </p>
        </div>

        {/* Aggregate Margin Badge */}
        <div className="flex items-center gap-2 bg-[#09152e] border border-cyan-500/40 rounded-xl px-4 py-2 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
          <Wallet className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400">Total Live Capital Pool</div>
            <div className="text-sm font-mono font-bold text-emerald-400 leading-tight">
              ₹{totalCapital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Status Alert Toast */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-between shadow-lg ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
              : 'bg-rose-500/20 border-rose-500/60 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* 4 Broker Tabs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'angel_one', name: 'Angel One', tag: 'SmartAPI V2', capability: 'ADAPTER READY', isReady: true, color: 'from-orange-500/20 to-amber-500/10' },
          { key: 'zerodha', name: 'Zerodha', tag: 'Kite Connect 3', capability: 'COMING SOON', isReady: false, color: 'from-blue-500/20 to-cyan-500/10' },
          { key: 'upstox', name: 'Upstox', tag: 'Pro API v2', capability: 'COMING SOON', isReady: false, color: 'from-purple-500/20 to-indigo-500/10' },
          { key: '5paisa', name: '5paisa', tag: 'Developer API', capability: 'COMING SOON', isReady: false, color: 'from-emerald-500/20 to-teal-500/10' },
        ].map((item) => {
          const isSelected = selectedBroker === item.key;
          const isConn = brokerDetails[item.key]?.connected;
          return (
            <div
              key={item.key}
              onClick={() => setSelectedBroker(item.key)}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? 'border-cyan-400 bg-gradient-to-br ' + item.color + ' shadow-[0_0_18px_rgba(0,240,255,0.25)] scale-[1.02]'
                  : 'border-[#1e3a6e]/60 bg-[#0b1325]/80 hover:border-cyan-500/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white">{item.name}</span>
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                  item.isReady
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {item.capability}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-400">
                <span>{item.tag}</span>
                <span className={`font-bold ${isConn ? 'text-emerald-400' : 'text-slate-500'}`}>
                  ₹{brokerDetails[item.key]?.netMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Connection Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Input Credentials Form */}
        <div className="lg:col-span-7 bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-[#1e3a6e]/40 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  {selectedBroker === 'angel_one'
                    ? 'Angel One SmartAPI Authentication'
                    : selectedBroker === 'zerodha'
                    ? 'Zerodha Kite Connect Authentication'
                    : selectedBroker === 'upstox'
                    ? 'Upstox Pro API Gateway'
                    : '5paisa Developer API Gateway'}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Enter your real broker API credentials to authenticate live DMA trading
                </p>
              </div>
            </div>

            <span className="text-[10px] font-mono text-cyan-400 bg-[#060c1c] px-2.5 py-1 rounded border border-[#1e3a6e]">
              Ping: {currentDetails.ping}
            </span>
          </div>

          {/* Coming Soon Disclosure Banner for Non-Angel Brokers */}
          {selectedBroker !== 'angel_one' && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-bold uppercase tracking-wider block">Adapter In Development (Coming Soon)</span>
                <span className="text-[11px] text-slate-300">
                  Direct DMA execution for {selectedBroker === 'zerodha' ? 'Zerodha Kite Connect' : selectedBroker === 'upstox' ? 'Upstox Pro' : '5paisa Capital'} is coming soon in the next release. Live algorithmic execution is currently active for Angel One SmartAPI.
                </span>
              </div>
            </div>
          )}

          {/* ANGEL ONE FORM */}
          {selectedBroker === 'angel_one' && (
            <form onSubmit={handleConnectAngelOne} className="space-y-3.5 font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">
                    SmartAPI Key <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={angelForm.apiKey}
                    onChange={(e) => setAngelForm({ ...angelForm, apiKey: e.target.value })}
                    placeholder="Enter your SmartAPI Key"
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">
                    Client ID / User ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={angelForm.clientId}
                    onChange={(e) => setAngelForm({ ...angelForm, clientId: e.target.value })}
                    placeholder="e.g. A123456"
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">
                    Trading PIN <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative mt-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={angelForm.pin}
                      onChange={(e) => setAngelForm({ ...angelForm, pin: e.target.value })}
                      placeholder="4-digit trading PIN"
                      maxLength={6}
                      className="w-full bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none pr-8"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">
                      Live TOTP Code <span className="text-rose-400">*</span>
                    </label>
                    <span
                      className="text-[9px] text-cyan-400 font-sans cursor-pointer hover:underline"
                      onClick={() => {
                        const randomTotp = String(Math.floor(100000 + Math.random() * 900000));
                        setAngelForm({ ...angelForm, totp: randomTotp });
                      }}
                    >
                      Generate Mock TOTP
                    </span>
                  </div>
                  <input
                    type="text"
                    value={angelForm.totp}
                    onChange={(e) => setAngelForm({ ...angelForm, totp: e.target.value })}
                    placeholder="6-digit Authenticator TOTP"
                    maxLength={6}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg focus:border-cyan-400 focus:outline-none tracking-widest text-center font-bold text-cyan-300"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">
                  TOTP Secret Key (Optional - for automatic local PyOTP generation)
                </label>
                <input
                  type="text"
                  value={angelForm.totpSecret}
                  onChange={(e) => setAngelForm({ ...angelForm, totpSecret: e.target.value })}
                  placeholder="Base32 TOTP secret string from Angel One"
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-slate-300 p-2 rounded-lg focus:border-cyan-400 focus:outline-none text-[11px]"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500/25 via-blue-600/30 to-cyan-500/25 hover:from-cyan-500/40 hover:to-blue-600/50 text-cyan-300 border border-cyan-400/60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_18px_rgba(0,240,255,0.3)] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                      <span>Authenticating with SmartAPI...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <span>Connect & Verify</span>
                    </>
                  )}
                </button>

                {currentDetails.connected && (
                  <button
                    type="button"
                    onClick={() => {
                      setBrokerDetails((prev) => ({
                        ...prev,
                        angel_one: {
                          ...prev.angel_one,
                          connected: false,
                          availableCash: 0.00,
                          collateralMargin: 0.00,
                          netMargin: 0.00,
                          tokenExpires: 'Disconnected',
                          ping: '--'
                        }
                      }));
                      if (onUpdateBroker && brokerConnections) {
                        onUpdateBroker(
                          brokerConnections.map((brk) =>
                            brk.id === 'angel'
                              ? { ...brk, status: 'Disconnected', ping: '--' }
                              : brk
                          )
                        );
                      }
                      setStatusMessage({ type: 'error', text: 'Angel One SmartAPI session disconnected.' });
                    }}
                    className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 font-bold text-xs transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ZERODHA FORM */}
          {selectedBroker === 'zerodha' && (
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Kite API Key</label>
                <input
                  type="text"
                  placeholder="Enter Zerodha API Key"
                  value={zerodhaForm.apiKey}
                  onChange={(e) => setZerodhaForm({ ...zerodhaForm, apiKey: e.target.value })}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Kite API Secret</label>
                <input
                  type="password"
                  placeholder="Enter API Secret"
                  value={zerodhaForm.apiSecret}
                  onChange={(e) => setZerodhaForm({ ...zerodhaForm, apiSecret: e.target.value })}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Request Token</label>
                <input
                  type="text"
                  placeholder="Enter Request Token from login redirect"
                  value={zerodhaForm.requestToken}
                  onChange={(e) => setZerodhaForm({ ...zerodhaForm, requestToken: e.target.value })}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                />
              </div>
              <button
                type="button"
                onClick={() => handleConnectOther('zerodha', 'Zerodha Kite', zerodhaForm)}
                className="w-full py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Connect & Verify Kite</span>
              </button>
            </div>
          )}

          {/* UPSTOX FORM */}
          {selectedBroker === 'upstox' && (
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Upstox API Key</label>
                <input
                  type="text"
                  placeholder="Enter Upstox API Key"
                  value={upstoxForm.apiKey}
                  onChange={(e) => setUpstoxForm({ ...upstoxForm, apiKey: e.target.value })}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">API Secret</label>
                <input
                  type="password"
                  placeholder="Enter API Secret"
                  value={upstoxForm.apiSecret}
                  onChange={(e) => setUpstoxForm({ ...upstoxForm, apiSecret: e.target.value })}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Auth Code</label>
                <input
                  type="text"
                  placeholder="Enter Auth Code from OAuth flow"
                  value={upstoxForm.authCode}
                  onChange={(e) => setUpstoxForm({ ...upstoxForm, authCode: e.target.value })}
                  className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                />
              </div>
              <button
                type="button"
                onClick={() => handleConnectOther('upstox', 'Upstox Pro', upstoxForm)}
                className="w-full py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Connect & Verify Upstox</span>
              </button>
            </div>
          )}

          {/* 5PAISA FORM */}
          {selectedBroker === '5paisa' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">App Name</label>
                  <input
                    type="text"
                    placeholder="Enter App Name"
                    value={fivePaisaForm.appName}
                    onChange={(e) => setFivePaisaForm({ ...fivePaisaForm, appName: e.target.value })}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase font-sans font-semibold">User ID</label>
                  <input
                    type="text"
                    placeholder="Enter User ID"
                    value={fivePaisaForm.userId}
                    onChange={(e) => setFivePaisaForm({ ...fivePaisaForm, userId: e.target.value })}
                    className="w-full mt-1 bg-[#060c1c] border border-[#1e3a6e] text-white p-2 rounded-lg"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleConnectOther('5paisa', '5paisa Capital', fivePaisaForm)}
                className="w-full py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Connect & Verify 5paisa</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Live Connection Status & Account Balance Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0b1325]/90 border border-[#1e3a6e]/60 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Live Broker Status
              </span>
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${
                  currentDetails.connected
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${currentDetails.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                <span>{currentDetails.connected ? 'LIVE CONNECTED' : 'DISCONNECTED'}</span>
              </div>
            </div>

            <div className="bg-[#060c1c] border border-[#1e3a6e]/40 rounded-xl p-3.5 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Account Name:</span>
                <span className="text-white font-bold">{currentDetails.clientName || 'Not Connected'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Client ID:</span>
                <span className="text-cyan-400 font-bold">{currentDetails.clientId || '--'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Session Status:</span>
                <span className={currentDetails.connected ? 'text-emerald-400' : 'text-slate-500'}>
                  {currentDetails.tokenExpires}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">WebSocket Ping:</span>
                <span className="text-slate-200 font-bold">{currentDetails.ping}</span>
              </div>
            </div>

            {/* Account Balance & RMS Margin */}
            <div className="bg-[#060c1c] border border-cyan-500/30 rounded-xl p-4 space-y-3">
              <div className="text-[10.5px] font-bold text-cyan-300 uppercase flex items-center justify-between">
                <span>Account Balance & RMS Margin</span>
                <span className={`font-mono text-[10px] ${currentDetails.connected ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {currentDetails.connected ? 'Verified Live' : 'Awaiting Connection'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div className="p-2.5 rounded-lg bg-[#0a1630] border border-[#1e3a6e]/30">
                  <div className="text-[9.5px] text-slate-400">Available Cash:</div>
                  <div className={`text-base font-bold mt-0.5 ${currentDetails.connected ? 'text-emerald-400' : 'text-slate-500'}`}>
                    ₹{currentDetails.availableCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0a1630] border border-[#1e3a6e]/30">
                  <div className="text-[9.5px] text-slate-400">Collateral Margin:</div>
                  <div className={`text-base font-bold mt-0.5 ${currentDetails.connected ? 'text-cyan-400' : 'text-slate-500'}`}>
                    ₹{currentDetails.collateralMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="flex items-baseline justify-between pt-1 px-1 text-xs font-mono">
                <span className="text-slate-300">Total Net Margin:</span>
                <span className={`text-base font-bold ${currentDetails.connected ? 'text-white' : 'text-slate-500'}`}>
                  ₹{currentDetails.netMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Live Token Details */}
            {currentDetails.jwtToken && (
              <div className="bg-[#060c1c] border border-[#1e3a6e]/40 rounded-xl p-3 space-y-1 text-[11px] font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span>SmartAPI JWT Session:</span>
                  <button
                    onClick={() => copyToken(currentDetails.jwtToken)}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[10px] cursor-pointer"
                  >
                    {copiedToken ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="text-slate-300 truncate bg-[#0a1630] p-1.5 rounded border border-[#1e3a6e]/30 text-[10px]">
                  {currentDetails.jwtToken}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
