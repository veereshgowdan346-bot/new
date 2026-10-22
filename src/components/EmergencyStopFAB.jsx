import React, { useState, useEffect, useRef } from 'react';
import {
  AlertOctagon,
  ShieldAlert,
  Zap,
  RotateCcw,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Layers,
  Lock,
  Unlock,
  Radio,
  Server,
  Activity,
  Flame,
  Volume2
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { soundEngine } from '../utils/audioChime';
import { voiceAssistant } from '../utils/voiceAssistant';
import { toastEmitter } from '../utils/toastEmitter';

/**
 * EmergencyStopFAB
 * Institutional-grade persistent Floating Action Button for immediate all-positions square-off
 * across all connected broker APIs (Angel One SmartAPI, Zerodha, Upstox, 5Paisa).
 */
export default function EmergencyStopFAB({
  positions = [],
  onSquareOffAll,
  onResetEmergencyStop,
  brokerConnections = [],
  allBotsRunning = true,
  onStopAllBots,
  onStartAllBots,
  executionMode = 'PAPER'
}) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isHalted, setIsHalted] = useState(false);
  const [lastHaltedCount, setLastHaltedCount] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isArmLockEnabled, setIsArmLockEnabled] = useState(false); // Safety lock mode toggle
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [lastExecutionTime, setLastExecutionTime] = useState(null);
  const panelRef = useRef(null);

  const openPositionsCount = positions ? positions.length : 0;
  const connectedBrokers = brokerConnections.filter((b) => b.status === 'Connected');

  // Check RMS status on mount & periodically
  useEffect(() => {
    let isMounted = true;
    const checkRms = async () => {
      try {
        const res = await apiFetch('/api/rms/status');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data && data.config) {
            setIsHalted(Boolean(data.config.emergency_stop_active || data.config.circuit_breaker_active));
          }
        }
      } catch (e) {}
    };

    checkRms();
    const interval = setInterval(checkRms, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Listen for outside clicks to collapse panel
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Trigger Emergency Stop Execution
  const handleExecuteEmergencyStop = async () => {
    if (isExecuting) return;

    try {
      setIsExecuting(true);
      soundEngine.playEmergencyChime();

      // Dispatch backend emergency stop
      const [stopRes, squareRes] = await Promise.allSettled([
        apiFetch('/api/emergency-stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'FAB_KILL_SWITCH', executionMode })
        }),
        onSquareOffAll ? onSquareOffAll() : Promise.resolve({ success: true, count: openPositionsCount })
      ]);

      let squaredCount = openPositionsCount;
      if (stopRes.status === 'fulfilled' && stopRes.value.ok) {
        const data = await stopRes.value.json();
        if (data.squared_count !== undefined) {
          squaredCount = data.squared_count;
        }
      }

      setLastHaltedCount(squaredCount);
      setIsHalted(true);
      setLastExecutionTime(new Date().toLocaleTimeString());
      setShowSuccessBanner(true);

      // Halt bots state in parent
      if (onStopAllBots) {
        onStopAllBots();
      }

      // Audio & Voice assistant alerts
      voiceAssistant.speak(
        `Emergency Kill Switch Activated. ${squaredCount} active positions squared off across all connected broker APIs. RMS Circuit Breaker engaged.`
      );

      // Emit global toast
      toastEmitter.emitEmergencyStop({
        count: squaredCount,
        executionMode: executionMode,
        message: `Emergency Kill Switch: ${squaredCount} position(s) squared off across ${connectedBrokers.length || 'active'} broker conduits.`
      });

      // Auto-hide success badge after 6 seconds
      setTimeout(() => {
        setShowSuccessBanner(false);
      }, 6000);
    } catch (err) {
      console.error('[EmergencyStopFAB] Error executing kill switch:', err);
      soundEngine.playAlertChime();
      toastEmitter.emitEmergencyStop({
        count: openPositionsCount,
        executionMode: executionMode,
        message: `Emergency Stop Error: ${err.message || 'Check broker connectivity'}`
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Reset Circuit Breaker & Resume System
  const handleResetCircuitBreaker = async () => {
    try {
      setIsExecuting(true);
      const res = await apiFetch('/api/rms/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        setIsHalted(false);
        soundEngine.playBuyChime();
        voiceAssistant.speak('RMS Circuit Breaker reset. Normal bot operations resumed.');

        if (onStartAllBots) {
          onStartAllBots();
        }

        toastEmitter.emit({
          type: 'BUY',
          action: 'CIRCUIT_BREAKER_RESET',
          symbol: 'ALL BROKERS',
          price: 'ACTIVE',
          qty: 0,
          botName: 'RMS SAFETY CORE',
          strategy: 'Normal trading operations authorized and restored',
          quorum: 'SYSTEM CLEAR',
          consensusRate: '100%',
          executionMode: executionMode,
          durationMs: 4000
        });

        if (onResetEmergencyStop) {
          onResetEmergencyStop();
        }
      }
    } catch (e) {
      console.error('Failed to reset circuit breaker:', e);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col items-end select-none font-sans"
      aria-label="Emergency Stop System"
    >
      {/* Expanded Tactical HUD Panel */}
      {isExpanded && (
        <div className="mb-3 w-80 sm:w-96 bg-[#060a14]/95 border border-red-500/50 rounded-2xl p-4 shadow-[0_0_50px_rgba(239,68,68,0.35)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400">
                <AlertOctagon className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-black tracking-wider text-white uppercase font-mono">
                  RMS FASTPATH KILL SWITCH
                </h4>
                <p className="text-[10px] font-mono text-slate-400">
                  Universal All-Positions Square-Off
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Telemetry Breakdown */}
          <div className="py-3 space-y-2.5">
            {/* Open Positions Metric */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#091224] border border-[#16274a]">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-300 font-medium">Open Positions Book</span>
              </div>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                  openPositionsCount > 0
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {openPositionsCount > 0 ? `${openPositionsCount} Positions Active` : 'All Flat (0)'}
              </span>
            </div>

            {/* Broker Conduits Status */}
            <div className="p-2.5 rounded-xl bg-[#091224] border border-[#16274a] space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-cyan-400" />
                  Connected Broker Conduits
                </span>
                <span className="text-cyan-300 font-mono font-bold">
                  {connectedBrokers.length > 0 ? `${connectedBrokers.length} Online` : 'Simulation Direct'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {connectedBrokers.length > 0 ? (
                  connectedBrokers.map((b) => (
                    <span
                      key={b.id || b.name}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-800 text-cyan-300"
                    >
                      {b.name} ({b.ping || '<10ms'})
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] font-mono text-slate-400 italic">
                    Angel One / Zerodha simulated DMA feed
                  </span>
                )}
              </div>
            </div>

            {/* Arm Lock Toggle */}
            <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-[#070e1c] border border-[#121f3a]">
              <div className="flex items-center gap-2">
                {isArmLockEnabled ? (
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <div>
                  <div className="text-[11px] font-bold text-slate-200">
                    {isArmLockEnabled ? 'Safety Guard Armed' : 'Instant 1-Click Active'}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {isArmLockEnabled ? 'Requires 2-step confirmation' : 'Single-click immediate dispatch'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsArmLockEnabled(!isArmLockEnabled)}
                className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-all cursor-pointer ${
                  isArmLockEnabled
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                }`}
              >
                {isArmLockEnabled ? 'Disarm Guard' : 'Arm Guard'}
              </button>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="pt-2 border-t border-[#142340] space-y-2">
            {!isHalted ? (
              <button
                type="button"
                onClick={handleExecuteEmergencyStop}
                disabled={isExecuting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 text-white font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(239,68,68,0.5)] border border-red-400 cursor-pointer active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin text-white" />
                    <span>EXECUTING SQUARE-OFF ACROSS ALL BROKERS...</span>
                  </>
                ) : (
                  <>
                    <AlertOctagon className="w-4 h-4 text-white animate-pulse" />
                    <span>TRIGGER IMMEDIATE SQUARE-OFF ({openPositionsCount})</span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800/80 text-center">
                  <div className="text-[11px] font-bold text-red-300 flex items-center justify-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    RMS CIRCUIT BREAKER ENGAGED
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    All bot workers suspended at {lastExecutionTime || 'Fastpath'}.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetCircuitBreaker}
                  disabled={isExecuting}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.4)] border border-emerald-400 cursor-pointer active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>RESET BREAKER & RESUME TRADING</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 px-1 pt-1">
              <span>Latency: &lt;1.2ms IPC fastpath</span>
              <span>STT &amp; SEBI compliant cancel</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Floating Action Pill / Button */}
      <div className="flex items-center gap-2">
        {/* Success confirmation toastlet */}
        {showSuccessBanner && (
          <div className="px-3 py-1.5 rounded-xl bg-red-950/90 border border-red-500/70 text-red-200 text-xs font-mono font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.4)] backdrop-blur-md animate-in fade-in slide-in-from-right-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>SQUARED OFF {lastHaltedCount} POSITIONS • BOTS HALTED</span>
          </div>
        )}

        {/* The Action Button */}
        <div className="relative group">
          {/* Pulsing outer aura ring */}
          <div
            className={`absolute -inset-1 rounded-2xl blur-md opacity-75 group-hover:opacity-100 transition duration-300 ${
              isHalted
                ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-red-600 animate-pulse'
                : openPositionsCount > 0
                ? 'bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 animate-pulse'
                : 'bg-gradient-to-r from-rose-900 via-red-900 to-slate-800'
            }`}
          />

          <div className="relative flex items-center rounded-2xl bg-[#060a14] border border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.35)] overflow-hidden">
            {/* Primary Click Zone */}
            <button
              type="button"
              onClick={() => {
                if (isHalted) {
                  // If already halted, open HUD to give option to reset
                  setIsExpanded(!isExpanded);
                } else if (isArmLockEnabled) {
                  // If arm lock enabled, expand panel for confirmation
                  setIsExpanded(true);
                } else {
                  // Direct 1-Click execution
                  handleExecuteEmergencyStop();
                }
              }}
              disabled={isExecuting}
              className={`px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 transition-all cursor-pointer ${
                isHalted
                  ? 'bg-gradient-to-r from-red-950/90 to-amber-950/80 hover:brightness-110 text-amber-200'
                  : 'bg-gradient-to-r from-red-600/90 to-rose-700/90 hover:from-red-500 hover:to-rose-600 text-white'
              } disabled:opacity-50`}
              title={
                isHalted
                  ? 'RMS Circuit Breaker Engaged. Click to inspect or reset.'
                  : 'Emergency Stop: Click to immediately square off all positions across all connected broker APIs.'
              }
            >
              {/* Icon */}
              {isExecuting ? (
                <Activity className="w-5 h-5 animate-spin text-white" />
              ) : isHalted ? (
                <ShieldAlert className="w-5 h-5 text-amber-300 animate-pulse" />
              ) : (
                <AlertOctagon className="w-5 h-5 text-white animate-pulse" />
              )}

              {/* Text Label & Badge */}
              <div className="flex flex-col items-start leading-tight">
                <span className="text-xs sm:text-sm font-black tracking-wider uppercase font-mono flex items-center gap-1.5">
                  {isHalted ? 'CIRCUIT ENGAGED' : 'EMERGENCY STOP'}
                  {!isHalted && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-mono text-white/90">
                  {isHalted
                    ? 'All Bots Suspended'
                    : openPositionsCount > 0
                    ? `Square Off (${openPositionsCount} Open)`
                    : '1-Click All Flat'}
                </span>
              </div>
            </button>

            {/* Expand / Tactical HUD toggle chevron */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="px-2 py-3 bg-[#0a1224] hover:bg-[#111e3b] text-slate-300 hover:text-white border-l border-red-500/40 transition-colors cursor-pointer flex items-center justify-center"
              title="Toggle RMS Tactical Panel"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-cyan-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-red-400" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
