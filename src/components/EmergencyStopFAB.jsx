import React from 'react';
import EmergencyKillSwitch from './EmergencyKillSwitch';

/**
 * EmergencyStopFAB
 * Persistent institutional Floating Action Button ensuring the RMS Emergency Stop
 * is ALWAYS 100% visible, accessible, and unobstructed regardless of window size,
 * scroll position, mobile bottom navbars, toast alerts, or header clipping.
 */
export default function EmergencyStopFAB(props) {
  return (
    <aside
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[60] pointer-events-auto select-none titlebar-no-drag"
      style={{ WebkitAppRegion: 'no-drag' }}
      aria-label="Floating RMS Emergency Kill Switch"
    >
      <div className="shadow-[0_4px_30px_rgba(239,68,68,0.6)] rounded-full bg-[#080e1b]/98 border-2 border-red-500/80 p-1 backdrop-blur-xl hover:scale-105 active:scale-95 transition-all">
        <EmergencyKillSwitch {...props} compact={false} />
      </div>
    </aside>
  );
}

export { EmergencyKillSwitch };
