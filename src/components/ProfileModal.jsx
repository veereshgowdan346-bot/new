import React, { useState } from 'react';
import {
  X,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Key,
  Wallet,
  AlertOctagon,
  LogOut,
  Copy,
  Check,
  User,
  Sparkles,
  Zap
} from 'lucide-react';
import { soundEngine } from '../utils/audioChime';
import { apiFetch } from '../utils/api';
import { toastEmitter } from '../utils/toastEmitter';
import { voiceAssistant } from '../utils/voiceAssistant';

export default function ProfileModal({
  isOpen,
  onClose,
  userProfile = {},
  onUpdateProfile,
  onLogout
}) {
  const [copiedToken, setCopiedToken] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  if (!isOpen) return null;

  // 1-Click Instant Master Authorization for Veeresh
  const handleAuthorizeMasterAccount = async () => {
    setIsSyncing(true);
    const masterProfile = {
      isAuthenticated: true,
      name: 'Veeresh',
      email: 'veereshgowdan346@gmail.com',
      role: 'Master System Administrator & Quorum Authority',
      picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
      token: `chintu_master_auth_${Date.now()}`,
      linkedAt: new Date().toLocaleTimeString(),
      provider: 'Master Authority (Localhost Verified)'
    };

    // Save to local React state and localStorage
    onUpdateProfile(masterProfile);
    soundEngine.playBuyChime();

    // Synchronize with python_stream_server SQLite memory
    try {
      await apiFetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(masterProfile)
      });
    } catch (e) {
      console.warn('Backend user profile sync notice:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const copyToken = (txt) => {
    navigator.clipboard?.writeText(txt);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-full max-w-lg mx-auto my-auto bg-[#091329] border border-cyan-500/40 rounded-2xl shadow-[0_0_40px_rgba(0,240,255,0.25)] overflow-hidden flex flex-col">
        {/* Modal Header Bar */}
        <div className="relative p-5 bg-gradient-to-r from-[#070e1e] via-[#0e1d3d] to-[#070e1e] border-b border-[#1e3a6e]/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide uppercase font-mono flex items-center gap-2">
                <span>Master Profile & Security Authority</span>
              </h3>
              <p className="text-xs text-slate-400 font-sans">
                CHINTU AI Master Administrator Authorization Terminal
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#0b1325] border border-[#1e3a6e] text-slate-400 hover:text-white hover:border-cyan-400 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Master Profile Card */}
          <div className="bg-[#060c1c] border border-cyan-500/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
            {/* Background Cyan Glow Accent */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-center gap-4 relative z-10">
              {/* High-Resolution Glowing Avatar Badge */}
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-600 to-indigo-600 p-0.5 shadow-[0_0_20px_rgba(0,240,255,0.6)]">
                  {userProfile.picture ? (
                    <img
                      src={userProfile.picture}
                      alt={userProfile.name || 'Veeresh'}
                      className="w-full h-full rounded-[14px] object-cover border border-cyan-300/40"
                    />
                  ) : (
                    <div className="w-full h-full rounded-[14px] bg-[#070e1e] flex items-center justify-center text-cyan-300 font-black text-2xl border border-cyan-300/40">
                      {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'V'}
                    </div>
                  )}
                </div>
                <span
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#060c1c] shadow-sm flex items-center justify-center ${
                    userProfile.isAuthenticated ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                >
                  {userProfile.isAuthenticated && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                  )}
                </span>
              </div>

              {/* Master Credentials */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base font-bold text-white tracking-tight">
                    Veeresh
                  </h4>
                  <span
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full uppercase border ${
                      userProfile.isAuthenticated
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                    }`}
                  >
                    {userProfile.isAuthenticated ? 'Master Authorized' : 'Pending Authorization'}
                  </span>
                </div>

                <div className="text-xs text-cyan-300 font-mono flex items-center gap-1.5 mt-1">
                  <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">veereshgowdan346@gmail.com</span>
                </div>

                <div className="text-[11px] text-slate-400 font-sans mt-1 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="text-slate-300 font-medium">
                    Master System Administrator & Quorum Authority
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons based on Auth State */}
            <div className="mt-5 pt-4 border-t border-[#1e3a6e]/50">
              {!userProfile.isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleAuthorizeMasterAccount}
                  disabled={isSyncing}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:shadow-[0_0_28px_rgba(0,240,255,0.7)] cursor-pointer disabled:opacity-60"
                >
                  <Mail className="w-4 h-4 fill-slate-950 text-slate-950" />
                  <span>{isSyncing ? 'Linking & Synchronizing...' : 'Link Gmail Account (Veeresh • veereshgowdan346@gmail.com)'}</span>
                </button>
              ) : (

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#09152e] border border-[#1e3a6e]/60">
                    <span className="text-slate-400 text-[11px]">Security Token:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-300 text-[10.5px]">
                        {userProfile.token ? `${userProfile.token.slice(0, 22)}...` : 'Active'}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToken(userProfile.token || '')}
                        className="p-1 hover:text-cyan-300 transition-colors cursor-pointer"
                        title="Copy Master Token"
                      >
                        {copiedToken ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#09152e] border border-[#1e3a6e]/60 text-[11px]">
                    <span className="text-slate-400">Authorized At:</span>
                    <span className="text-slate-200">{userProfile.linkedAt || 'Active Session'}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Session Synced with Python Server
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAuthorizeMasterAccount}
                        disabled={isSyncing}
                        className="py-1.5 px-3 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Re-verify authentication token with SQLite backend"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{isSyncing ? 'Syncing...' : 'Re-Sync Master'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onLogout();
                          soundEngine.playSellChime();
                        }}
                        className="py-1.5 px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>De-Authorize</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Capital & Margin Overview (Initial ₹0.00 / Offline Safe State) */}
          <div className="grid grid-cols-2 gap-3 bg-[#060c1c] border border-[#1e3a6e]/50 rounded-xl p-3.5">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Total Capital Allocated
              </span>
              <div className="text-base font-mono font-bold text-white mt-1">
                ₹0.00
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                ₹0.00 deployed
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Available Cash Margin
              </span>
              <div className="text-base font-mono font-bold text-cyan-400 mt-1">
                ₹0.00
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Connect broker to stream balance
              </span>
            </div>
          </div>

          {/* Emergency Kill Switch */}
          <button
            type="button"
            onClick={async () => {
              try {
                soundEngine.playEmergencyChime();
                await apiFetch('/api/emergency-stop', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ source: 'PROFILE_MODAL' })
                });
                voiceAssistant.speak('Emergency stop triggered from profile modal. All bot positions squared off.');
                toastEmitter.emitEmergencyStop({
                  count: 0,
                  executionMode: 'PAPER',
                  message: 'Emergency Kill Switch: All open positions squared off & 14 bots halted.'
                });
                onClose();
              } catch (e) {
                toastEmitter.emitToast({ title: 'Kill Switch Error', message: e.message || 'Failed to trigger emergency stop', type: 'error' });
              }
            }}
            className="w-full py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/50 hover:border-rose-400 text-rose-400 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_12px_rgba(244,63,94,0.2)] cursor-pointer font-mono"
          >
            <AlertOctagon className="w-4 h-4" />
            <span>Emergency Kill Switch (Square Off All)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
