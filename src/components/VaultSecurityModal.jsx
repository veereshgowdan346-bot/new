import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Send,
  X,
  AlertCircle,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { toastEmitter } from '../utils/toastEmitter';
import { soundEngine } from '../utils/audioChime';

export default function VaultSecurityModal({
  isOpen,
  onClose,
  provider = 'angel_one',
  onRevealed
}) {
  const [viewMode, setViewMode] = useState('loading'); // 'loading' | 'setup' | 'unlock' | 'recovery'
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);

  // Check PIN status when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setSuccessMsg('');
    setPin('');
    setConfirmPin('');
    setNewPin('');
    setRecoveryCode('');
    setIsLoading(true);

    const checkPinStatus = async () => {
      try {
        const res = await apiFetch('/api/connections/vault/has-pin');
        if (res && res.hasPin) {
          setViewMode('unlock');
          setIsLocked(Boolean(res.isLocked));
          setLockedUntil(res.lockedUntil);
          setRemainingAttempts(res.remainingAttempts ?? 5);
        } else {
          setViewMode('setup');
        }
      } catch (e) {
        setViewMode('unlock');
      } finally {
        setIsLoading(false);
      }
    };

    checkPinStatus();
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Setup First-Time PIN
  const handleSetupPin = async (e) => {
    e?.preventDefault();
    setErrorMsg('');
    if (!/^\d{4}$/.test(pin)) {
      setErrorMsg('PIN must be exactly 4 numeric digits.');
      return;
    }
    if (pin !== confirmPin) {
      setErrorMsg('PIN confirmation does not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch('/api/connections/vault/setup-pin', {
        method: 'POST',
        body: JSON.stringify({ pin })
      });

      if (res && (res.status === 'success' || res.success)) {
        toastEmitter.emitToast({
          title: 'Vault PIN Configured',
          message: 'Your 4-digit Vault PIN is now active.',
          type: 'success'
        });
        soundEngine.playBuyChime();
        // Proceed directly to reveal with this new PIN
        await handleUnlockWithPin(pin);
      } else {
        setErrorMsg(res?.message || 'Could not save Vault PIN.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error communicating with server.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Unlock / Reveal
  const handleUnlockWithPin = async (candidatePin) => {
    const pinToSubmit = candidatePin || pin;
    setErrorMsg('');
    if (!/^\d{4}$/.test(pinToSubmit)) {
      setErrorMsg('Please enter your 4-digit numeric Vault PIN.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch('/api/connections/vault/reveal', {
        method: 'POST',
        body: JSON.stringify({ provider, pin: pinToSubmit })
      });

      if (res && (res.status === 'success' || res.success) && res.credentials) {
        soundEngine.playSuccessChime();
        toastEmitter.emitToast({
          title: 'Vault Unlocked',
          message: 'Sensitive credentials revealed. Auto-remasking in 60 seconds.',
          type: 'success'
        });
        onRevealed(res.credentials);
        onClose();
      } else {
        soundEngine.playAlertChime();
        setErrorMsg(res?.message || 'Incorrect Vault PIN.');
        if (res?.isLocked) {
          setIsLocked(true);
          setLockedUntil(res.lockedUntil);
        }
        if (res?.remainingAttempts !== undefined) {
          setRemainingAttempts(res.remainingAttempts);
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error verifying Vault PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  // Request Telegram Recovery Code
  const handleRequestTelegramCode = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/connections/vault/request-recovery', {
        method: 'POST'
      });
      if (res && (res.status === 'success' || res.success)) {
        soundEngine.playBuyChime();
        setSuccessMsg(res.message || 'Single-use recovery code dispatched to your Telegram chat.');
      } else {
        setErrorMsg(res?.message || 'Failed to dispatch Telegram recovery code.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Telegram recovery request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Recovery Reset
  const handleResetPinWithCode = async (e) => {
    e?.preventDefault();
    setErrorMsg('');
    if (!recoveryCode.trim() || recoveryCode.trim().length < 6) {
      setErrorMsg('Please enter the 6-digit recovery code from Telegram.');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setErrorMsg('New Vault PIN must be exactly 4 numeric digits.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch('/api/connections/vault/reset-pin', {
        method: 'POST',
        body: JSON.stringify({
          recoveryCode: recoveryCode.trim(),
          newPin: newPin.trim()
        })
      });

      if (res && (res.status === 'success' || res.success)) {
        soundEngine.playSuccessChime();
        toastEmitter.emitToast({
          title: 'Vault PIN Reset',
          message: 'Your Vault PIN has been updated successfully.',
          type: 'success'
        });
        setPin(newPin.trim());
        setViewMode('unlock');
        setIsLocked(false);
        setSuccessMsg('Vault PIN reset successfully! Enter your new PIN to unlock.');
      } else {
        setErrorMsg(res?.message || 'Invalid or expired recovery code.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error resetting Vault PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-opacity">
      <div
        className="relative w-full max-w-md bg-[#0F172A] border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-7 text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {viewMode === 'setup'
                  ? 'Set Up Vault PIN'
                  : viewMode === 'recovery'
                  ? 'Telegram PIN Recovery'
                  : 'Vault PIN Authorization'}
              </h2>
              <p className="text-xs text-slate-400">
                Encrypted with Argon2/scryptSync Memory-Hard Hash
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Locked Alert */}
        {isLocked && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <div className="font-semibold text-rose-200">Vault Security Lockout Active</div>
              <div>
                Vault is locked due to 5 consecutive failed attempts.{' '}
                {lockedUntil && `Unlocks at ${new Date(lockedUntil).toLocaleTimeString()}.`}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* View Mode: Loading */}
        {viewMode === 'loading' && (
          <div className="py-12 flex flex-col items-center justify-center">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
            <div className="text-xs text-slate-400">Querying Vault Security Status...</div>
          </div>
        )}

        {/* View Mode: Setup First-Time PIN */}
        {viewMode === 'setup' && (
          <form onSubmit={handleSetupPin} className="mt-5 space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Create a personal 4-digit PIN to safeguard your Angel One API Key, Client ID, PIN, and TOTP Secret.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                New 4-Digit PIN
              </label>
              <input
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center tracking-[0.5em] text-lg font-mono px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Confirm 4-Digit PIN
              </label>
              <input
                type="password"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center tracking-[0.5em] text-lg font-mono px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || pin.length !== 4 || confirmPin.length !== 4}
              className="w-full py-2.5 mt-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Save PIN & Reveal Credentials</span>
            </button>
          </form>
        )}

        {/* View Mode: Unlock with PIN */}
        {viewMode === 'unlock' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUnlockWithPin();
            }}
            className="mt-5 space-y-4"
          >
            <p className="text-xs text-slate-300">
              Enter your 4-digit Vault PIN to view sensitive decrypted fields.
            </p>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  4-Digit Vault PIN
                </label>
                {!isLocked && (
                  <span className="text-[11px] text-slate-400">
                    {remainingAttempts} attempt{remainingAttempts === 1 ? '' : 's'} remaining
                  </span>
                )}
              </div>
              <input
                type="password"
                maxLength={4}
                disabled={isLocked || isLoading}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center tracking-[0.6em] text-xl font-mono px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500 disabled:opacity-40"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isLocked || isLoading || pin.length !== 4}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center justify-center gap-2"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              <span>Unlock Credentials (60s)</span>
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setViewMode('recovery');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition underline underline-offset-4"
              >
                Forgot Vault PIN? Recover via Telegram
              </button>
            </div>
          </form>
        )}

        {/* View Mode: Recovery via Telegram */}
        {viewMode === 'recovery' && (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Dispatch a single-use 6-digit recovery code to your pre-enrolled Telegram Bot chat. Code expires in 5 minutes (max 3 attempts).
            </p>

            <button
              type="button"
              onClick={handleRequestTelegramCode}
              disabled={isLoading}
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-2 border border-slate-700"
            >
              <Send className="w-3.5 h-3.5 text-cyan-400" />
              <span>Send 6-Digit Code to Telegram</span>
            </button>

            <form onSubmit={handleResetPinWithCode} className="space-y-3 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  6-Digit Recovery Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center tracking-[0.4em] font-mono px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  New 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full text-center tracking-[0.5em] font-mono px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('unlock');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="w-1/3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || recoveryCode.length !== 6 || newPin.length !== 4}
                  className="w-2/3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>Reset & Unlock</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
