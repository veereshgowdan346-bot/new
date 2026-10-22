import React from 'react';
import EmergencyKillSwitch from './EmergencyKillSwitch';

/**
 * EmergencyStopFAB (Relocated Legacy Shim)
 * The Emergency Kill Switch has been permanently migrated from the disruptive bottom-floating position
 * to the dedicated pinned Master Header Dock in TopNavbar.jsx, featuring a secure confirmation modal,
 * double-click fastpath, and hold-to-liquidate safety trigger.
 */
export default function EmergencyStopFAB(props) {
  // Return null to avoid disruptive floating overlays on charts and dashboards
  return null;
}

export { EmergencyKillSwitch };
