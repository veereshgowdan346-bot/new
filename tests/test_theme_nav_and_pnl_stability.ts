import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('Theme, Navigation, Overlay & Runtime Stability Suite', async (t) => {
  const rootDir = process.cwd();

  await t.test('1. Light Theme Contrast & CSS Token Mapping Integrity', () => {
    const cssPath = path.join(rootDir, 'src', 'index.css');
    assert.ok(fs.existsSync(cssPath), 'src/index.css must exist');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // 1.1 Light root variables exist
    assert.ok(cssContent.includes('--bg-main: #F4F7FC'), 'Light theme --bg-main must be defined');
    assert.ok(cssContent.includes('--surface-card: #FFFFFF'), 'Light theme --surface-card must be defined');

    // 1.2 Deep background hexes mapped
    assert.ok(cssContent.includes('html.light .bg-\\[\\#05070b\\]'), 'Primary canvas #05070b must be mapped in light mode');
    assert.ok(cssContent.includes('html.light .bg-\\[\\#080e1b\\]'), 'Card background #080e1b must be mapped in light mode');
    assert.ok(cssContent.includes('html.light .bg-\\[\\#060c18\\]'), 'Card background #060c18 must be mapped in light mode');

    // 1.3 Button white-text protection
    assert.ok(cssContent.includes('html.light button.bg-blue-600'), 'Blue button text must be protected');
    assert.ok(cssContent.includes('html.light button.bg-emerald-600'), 'Emerald button text must be protected');
    assert.ok(cssContent.includes('html.light button.bg-rose-600'), 'Rose button text must be protected');
    assert.ok(cssContent.includes('html.light .bg-\\[\\#0052cc\\].text-white'), 'Custom hex button text must be protected');

    // 1.4 High-contrast financial indicators
    assert.ok(cssContent.includes('#047857'), 'Emerald 700 (#047857) must be used for WCAG AA green text in light mode');
    assert.ok(cssContent.includes('#BE123C'), 'Rose 700 (#BE123C) must be used for WCAG AA red text in light mode');
    assert.ok(cssContent.includes('#0369A1'), 'Sky 700 (#0369A1) must be used for WCAG AA cyan text in light mode');
    assert.ok(cssContent.includes('#B45309'), 'Amber 700 (#B45309) must be used for WCAG AA amber text in light mode');

    // 1.5 Form controls
    assert.ok(cssContent.includes('html.light select,'), 'Select controls must have explicit light mode styles');
    assert.ok(cssContent.includes('html.light input,'), 'Input controls must have explicit light mode styles');
    assert.ok(cssContent.includes('html.light select option'), 'Select option elements must have explicit background and text colors');
  });

  await t.test('2. Sidebar Navigation Stability & Keyboard Accessibility', () => {
    const sidebarPath = path.join(rootDir, 'src', 'components', 'Sidebar.jsx');
    assert.ok(fs.existsSync(sidebarPath), 'Sidebar.jsx must exist');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

    // 2.1 Explicit button types
    assert.ok(sidebarContent.includes('type="button"'), 'All sidebar interactive elements must use type="button"');

    // 2.2 Event prevention & redundant switch suppression
    assert.ok(sidebarContent.includes('e.preventDefault()'), 'Sidebar clicks must prevent default behavior');
    assert.ok(sidebarContent.includes('if (activeTab === itemId) return;'), 'Sidebar clicks on active tab must short-circuit to prevent layout reflow');

    // 2.3 ARIA attributes
    assert.ok(sidebarContent.includes("aria-current={isActive ? 'page' : undefined}"), 'Active sidebar tab must have aria-current="page"');
    assert.ok(sidebarContent.includes('title={item.label}'), 'Sidebar items must have accessible title tooltip attributes');

    // 2.4 Reduced motion scroll handling
    assert.ok(sidebarContent.includes('prefers-reduced-motion'), 'Sidebar must respect prefers-reduced-motion for scroll reset');
  });

  await t.test('3. Live P&L Overlay React Portal & Isolation', () => {
    const pnlPath = path.join(rootDir, 'src', 'components', 'RealtimePnlTracker.jsx');
    assert.ok(fs.existsSync(pnlPath), 'RealtimePnlTracker.jsx must exist');
    const pnlContent = fs.readFileSync(pnlPath, 'utf8');

    // 3.1 React Portal usage
    assert.ok(pnlContent.includes('createPortal'), 'RealtimePnlTracker must import and use createPortal');
    assert.ok(pnlContent.includes('createPortal('), 'RealtimePnlTracker must invoke createPortal');
    assert.ok(pnlContent.includes('document.body'), 'RealtimePnlTracker portal must mount to document.body');

    // 3.2 High stacking context & overlay isolation
    assert.ok(pnlContent.includes('z-[9999]'), 'Modal must have highest stacking index z-[9999]');
    assert.ok(pnlContent.includes('backdrop-blur-md'), 'Modal backdrop must apply backdrop blur');

    // 3.3 Scroll lock
    assert.ok(pnlContent.includes("document.body.style.overflow = 'hidden'"), 'Modal must lock body scroll when open');
    assert.ok(pnlContent.includes("document.body.style.overflow = originalOverflow"), 'Modal must restore body scroll on close');

    // 3.4 Escape key dismissal & focus management
    assert.ok(pnlContent.includes("e.key === 'Escape'"), 'Modal must support closing via Escape key');
    assert.ok(pnlContent.includes('modalCloseBtnRef.current.focus()'), 'Modal must auto-focus close button on mount for accessibility');
  });

  await t.test('4. MasterDashboardView Initialization Order & TDZ Safety', () => {
    const dashboardPath = path.join(rootDir, 'src', 'components', 'views', 'MasterDashboardView.jsx');
    assert.ok(fs.existsSync(dashboardPath), 'MasterDashboardView.jsx must exist');
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

    const todayProfitIndex = dashboardContent.indexOf('const todayProfit =');
    const remainingLossAllowanceIndex = dashboardContent.indexOf('const remainingLossAllowance =');

    assert.ok(todayProfitIndex > -1, 'todayProfit declaration must exist in MasterDashboardView');
    assert.ok(remainingLossAllowanceIndex > -1, 'remainingLossAllowance declaration must exist in MasterDashboardView');

    assert.ok(
      todayProfitIndex < remainingLossAllowanceIndex,
      `todayProfit (index ${todayProfitIndex}) must be declared BEFORE remainingLossAllowance (index ${remainingLossAllowanceIndex}) to avoid TDZ ReferenceError`
    );

    // Verify dependent financial metrics are declared after todayProfit
    const currentCapitalIndex = dashboardContent.indexOf('const currentCapital =');
    assert.ok(
      todayProfitIndex < currentCapitalIndex,
      'todayProfit must be declared BEFORE currentCapital'
    );
  });

  await t.test('5. Operational Safety Invariants & Database Cleanliness', () => {
    const dbPath = path.join(rootDir, 'server', 'data', 'chintu_runtime.db');
    assert.ok(fs.existsSync(dbPath), 'chintu_runtime.db must exist');

    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const integrity = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
      assert.equal(integrity[0].integrity_check, 'ok', 'Database integrity check must be ok');

      const activeTrades = db.prepare("SELECT COUNT(*) as count FROM trades WHERE status = 'Open'").get() as { count: number };
      assert.equal(activeTrades.count, 0, 'Active trades count in production DB must remain exactly 0');

      const positions = db.prepare("SELECT COUNT(*) as count FROM positions").get() as { count: number };
      assert.equal(positions.count, 0, 'Positions count in production DB must remain exactly 0');
    } finally {
      db.close();
    }

    // Safety invariant: LIVE_TRADING_ELIGIBLE must be false
    const adapterPath = path.join(rootDir, 'src', 'utils', 'angelOrderAdapter.ts');
    assert.ok(fs.existsSync(adapterPath), 'angelOrderAdapter.ts must exist');
    const adapterContent = fs.readFileSync(adapterPath, 'utf8');
    assert.ok(
      adapterContent.includes('LIVE_TRADING_ELIGIBLE: boolean = false'),
      'LIVE_TRADING_ELIGIBLE must remain hard-locked to false in AngelOrderExecutionAdapter'
    );
  });
});
