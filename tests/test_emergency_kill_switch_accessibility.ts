import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('CHINTU AI — EMERGENCY KILL SWITCH ACCESSIBILITY & VIEWPORT INVARIANTS', () => {
  const appPath = path.join(process.cwd(), 'src', 'App.jsx');
  const fabPath = path.join(process.cwd(), 'src', 'components', 'EmergencyStopFAB.jsx');
  const killSwitchPath = path.join(process.cwd(), 'src', 'components', 'EmergencyKillSwitch.jsx');
  const topNavPath = path.join(process.cwd(), 'src', 'components', 'TopNavbar.jsx');
  const toastPath = path.join(process.cwd(), 'src', 'components', 'ToastNotificationSystem.jsx');
  const sidebarPath = path.join(process.cwd(), 'src', 'components', 'Sidebar.jsx');

  it('should verify App does not render redundant footer Kill Switch FAB', () => {
    const appCode = fs.readFileSync(appPath, 'utf-8');
    assert.doesNotMatch(appCode, /<EmergencyStopFAB/, 'App.jsx must not render redundant footer EmergencyStopFAB');
    assert.doesNotMatch(appCode, /import EmergencyStopFAB/, 'App.jsx must not import redundant EmergencyStopFAB');
  });

  it('should verify EmergencyKillSwitch confirmation modal is mounted via React Portal into document.body', () => {
    const code = fs.readFileSync(killSwitchPath, 'utf-8');
    assert.match(code, /createPortal/, 'Modal must use createPortal to escape parent stacking contexts');
    assert.match(code, /document\.body/, 'Modal must mount directly to document.body');
    assert.match(code, /document\.body\.style\.overflow\s*=\s*'hidden'/, 'Must lock background scroll while modal is active');
    assert.match(code, /cancelButtonRef\.current\.focus\(\)/, 'Must automatically focus Cancel button on modal open for safe keyboard navigation');
    assert.match(code, /z-\[9999\]/, 'Confirmation modal must have z-[9999] so it is never trapped under other modals');
    assert.match(code, /pointer-events-auto/, 'Modal must guarantee pointer-events-auto');
    assert.match(code, /titlebar-no-drag/, 'Modal must have titlebar-no-drag');
  });

  it('should verify EmergencyKillSwitch has fastpath double-click and hold-to-liquidate', () => {
    const code = fs.readFileSync(killSwitchPath, 'utf-8');
    assert.match(code, /HOLD_DURATION_MS\s*=\s*750/, 'Hold duration must be 750ms fastpath');
    assert.match(code, /lastClickTimeRef\.current\s*<\s*350/, 'Double click threshold must be 350ms');
    assert.match(code, /onMouseDown=\{startHold\}/, 'Must listen to startHold on mouse down');
    assert.match(code, /onTouchStart=\{startHold\}/, 'Must listen to startHold on touch start');
  });

  it('should verify EmergencyKillSwitch modal supports keyboard accessibility (Escape to dismiss, Enter to confirm)', () => {
    const code = fs.readFileSync(killSwitchPath, 'utf-8');
    assert.match(code, /e\.key === 'Escape'/, 'Must handle Escape key');
    assert.match(code, /e\.key === 'Enter'/, 'Must handle Enter key to confirm emergency square-off');
  });

  it('should verify ToastNotificationSystem is docked in top-right (top-16 right-4)', () => {
    const code = fs.readFileSync(toastPath, 'utf-8');
    assert.match(code, /fixed top-16 right-4/, 'Toasts must be docked in top-right');
    assert.doesNotMatch(code, /fixed bottom-4 right-4/, 'Toasts must not be placed at bottom-4 right-4');
  });

  it('should verify TopNavbar prioritizes EmergencyKillSwitch and hides secondary widgets on narrow viewports', () => {
    const code = fs.readFileSync(topNavPath, 'utf-8');
    assert.match(code, /EmergencyKillSwitch/, 'TopNavbar must embed EmergencyKillSwitch');
    assert.match(code, /hidden sm:flex shrink-0/, 'RealtimePnlTracker must be hidden on ultra-narrow viewports (<sm) to prevent navbar overflow');
    assert.match(code, /style=\{\{\s*WebkitAppRegion:\s*'no-drag'\s*\}\}/, 'Navbar right controls must have WebkitAppRegion: no-drag');
  });

  it('should verify mobile bottom navigation bar in Sidebar sits at z-50', () => {
    const code = fs.readFileSync(sidebarPath, 'utf-8');
    assert.match(code, /md:hidden fixed bottom-0 left-0 right-0/, 'Mobile nav must be fixed to bottom on <md');
    assert.match(code, /z-50/, 'Mobile nav must sit at z-50');
  });
});
