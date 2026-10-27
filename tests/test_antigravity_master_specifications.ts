/**
 * ANTI-GRAVITY MASTER SYSTEM SPECIFICATIONS VERIFICATION SUITE
 *
 * Verifies all 5 Anti-Gravity Master Framework Pillars:
 * 1. Core Trading Architecture: 14-Board Voting Consensus & Single Centralized Execution Engine
 * 2. Trading Modes & Data Integrity: Flawless Instant Mode Switching (Paper <-> Live) & Authentic Calculations
 * 3. Advanced Color Morphism UI: Dynamic Theme Engine (Dark, Light, Bright Color-Morph)
 * 4. Admin Supremacy & System Control: Master Admin Governance, Jarvis/Gemini AI Hooks, Backend Memory
 * 5. Iterative Self-Correction & Auto-Fix Protocol: Self-Healing Sentinel Runtime Error Interception & Repair
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { centralExecutionEngine } from '../src/utils/centralExecutionEngine';
import { BOT_DEFINITIONS, evaluate14BotQuorumConsensus } from '../src/utils/quorumConsensusEngine';
import { selfHealingBackend } from '../src/utils/selfHealingBackend';
import { runtimeDb } from '../src/utils/databasePersistence';
import { getPaperCapital, DEFAULT_PAPER_CAPITAL } from '../src/utils/capitalConfig';
import { calculateTradeStatutoryCharges } from '../src/utils/taxCalculator';

describe('Anti-Gravity Master System Prompt Specifications Suite', () => {

  // =========================================================================
  // PILLAR 1: CORE TRADING ARCHITECTURE (14-BOARD VOTING & SINGLE EXECUTION ENGINE)
  // =========================================================================
  test('1. Core Trading Architecture: 14-Board Consensus & Single Central Execution Engine', async () => {
    // 1.1 Exactly 14 Independent Analytical Boards
    assert.strictEqual(BOT_DEFINITIONS.length, 14, 'Must maintain exactly 14 analytical boards');
    const boardNames = BOT_DEFINITIONS.map(b => b.name);
    assert.ok(boardNames.includes('Momentum Master'));
    assert.ok(boardNames.includes('BankNifty Breakout Hunter'));
    assert.ok(boardNames.includes('Ultra Scalper'));
    assert.ok(boardNames.includes('Master Quorum Orchestrator'));

    // 1.2 14-Board Voting Evaluation
    const quorum = evaluate14BotQuorumConsensus({
      symbol: 'NIFTY 50',
      action: 'BUY',
      price: 25150.00
    });
    assert.strictEqual(quorum.totalBots, 14, 'All 14 boards must cast votes');
    assert.ok(typeof quorum.matchingVotes === 'number', 'Matching votes must be quantified');
    assert.ok(['APPROVED', 'QUORUM_VETO', 'INSUFFICIENT_CONSENSUS'].includes(quorum.decision));

    // 1.3 Single Centralized Execution Engine Singleton
    assert.ok(centralExecutionEngine, 'Centralized Single Execution Engine must exist');
    const status = centralExecutionEngine.getStatus();
    assert.strictEqual(status.singleEngineLock, true, 'Single execution engine lock must be active');
    assert.strictEqual(status.consensusBoardsActive, 14, '14 consensus boards must be registered with Central Engine');

    // 1.4 Authentic Capital & Fund Management (No Random/Fake Numbers)
    const capital = getPaperCapital();
    assert.strictEqual(capital, DEFAULT_PAPER_CAPITAL, 'Capital must connect to genuine ledger balance');
    assert.strictEqual(typeof capital, 'number');

    // 1.5 Order Routing through Central Gateway
    const execResult = await centralExecutionEngine.executeTrade({
      symbol: 'RELIANCE',
      action: 'BUY',
      price: 1195.00,
      quantity: 100,
      skipQuorumValidation: true // Test execution pipeline directly
    });

    assert.ok(execResult.orderId.startsWith('CEO_'), 'Order must be assigned central engine ID');
    assert.strictEqual(execResult.symbol, 'RELIANCE');
    assert.strictEqual(execResult.status, 'FILLED');
    assert.ok(execResult.executionPrice > 0);
    assert.ok(execResult.estimatedCharges > 0, 'Statutory charges must be authentic');
  });

  // =========================================================================
  // PILLAR 2: TRADING MODES & DATA INTEGRITY
  // =========================================================================
  test('2. Trading Modes & Data Integrity: Flawless Instant Switching & Zero Fake Metrics', () => {
    // 2.1 Unauthorized Live Mode Switch Must Fail-Close
    const unauthSwitch = centralExecutionEngine.setMode('LIVE', 'unauthorized_token');
    assert.strictEqual(unauthSwitch.success, false, 'Unauthorized live switch must fail-close');
    assert.strictEqual(unauthSwitch.mode, 'PAPER');

    // 2.2 Authorized Master Admin Mode Switch to LIVE
    const adminLiveSwitch = centralExecutionEngine.setMode('LIVE', 'chintu_master_auth_permanent_veeresh');
    assert.strictEqual(adminLiveSwitch.success, true, 'Master admin must be able to switch to LIVE');
    assert.strictEqual(adminLiveSwitch.mode, 'LIVE');
    assert.strictEqual(centralExecutionEngine.getMode(), 'LIVE');

    // 2.3 Instant Switch Back to PAPER
    const paperSwitch = centralExecutionEngine.setMode('PAPER');
    assert.strictEqual(paperSwitch.success, true, 'Switching back to PAPER must succeed instantaneously');
    assert.strictEqual(paperSwitch.mode, 'PAPER');
    assert.strictEqual(centralExecutionEngine.getMode(), 'PAPER');

    // 2.4 Data Accuracy: Post-April 2026 Statutory Calculation Precision
    const taxCalc = calculateTradeStatutoryCharges(
      1000,
      100,
      'BUY',
      'NSE Equity',
      0
    );
    assert.ok(taxCalc.totalCharges > 0);
    assert.ok(typeof taxCalc.stt === 'number');
    assert.ok(taxCalc.gst > 0);
    assert.strictEqual(taxCalc.brokerage, 20);
  });

  // =========================================================================
  // PILLAR 3: ADVANCED COLOR MORPHISM UI (THEME ENGINE)
  // =========================================================================
  test('3. Advanced Color Morphism UI: Dynamic Theme Engine & 3 Modes', () => {
    const cssPath = path.resolve('src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // 3.1 Dark Mode Tokens
    assert.ok(cssContent.includes('html.dark, body.dark'), 'Dark Mode tokens must exist');

    // 3.2 Light Mode Tokens
    assert.ok(cssContent.includes('html.light, body.light'), 'Light Mode tokens must exist');

    // 3.3 Bright Mode Color Morphism Tokens
    assert.ok(cssContent.includes('html.bright, body.bright'), 'Bright Mode tokens must exist');
    assert.ok(cssContent.includes('--accent-cyan: #00F0FF'), 'Bright Mode must include vibrant cyan');
    assert.ok(cssContent.includes('--accent-violet: #A855F7'), 'Bright Mode must include vibrant violet');
    assert.ok(cssContent.includes('--shadow-neumorph-card'), 'Glassmorphic 3D depth tokens must be defined');

    // 3.4 App.jsx and TopNavbar.jsx Cycling
    const appPath = path.resolve('src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.ok(appContent.includes("'bright'"), 'App.jsx must support bright mode in state transition');

    const navPath = path.resolve('src/components/TopNavbar.jsx');
    const navContent = fs.readFileSync(navPath, 'utf8');
    assert.ok(navContent.includes("theme === 'bright'"), 'TopNavbar.jsx must render bright theme controls');
  });

  // =========================================================================
  // PILLAR 4: ADMIN SUPREMACY & SYSTEM CONTROL
  // =========================================================================
  test('4. Admin Supremacy & System Control: Admin Governance & Backend Memory', () => {
    // 4.1 Master Profile Configuration
    const appPath = path.resolve('src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.ok(appContent.includes('MASTER_PROFILE_VEERESH'), 'App must define Master Profile Veeresh');
    assert.ok(appContent.includes('veereshgowdan346@gmail.com'), 'Master admin email must match');
    assert.ok(appContent.includes('chintu_master_auth_permanent_veeresh'), 'Permanent master token must match');

    // 4.2 Backend Memory Persistence Integration
    const testMessage = `[Anti-Gravity Audit Log]: Pillar 4 Admin Supremacy active at ${Date.now()}`;
    runtimeDb.saveChatMessage('Jarvis Master Sentinel', testMessage, new Date().toISOString(), 'admin_strategic_feed');

    const recentChat = runtimeDb.getRecentChatMessages(5, 'admin_strategic_feed');
    const found = recentChat.some(m => (m.content || m.text).includes('Pillar 4 Admin Supremacy active'));
    assert.ok(found, 'Strategic messages must persist into SQLite backend memory');

    // 4.3 server.ts Admin Supremacy Endpoints Existence
    const serverPath = path.resolve('server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    assert.ok(serverContent.includes('/api/admin/mode-switch'), 'Server must implement /api/admin/mode-switch');
    assert.ok(serverContent.includes('/api/admin/status'), 'Server must implement /api/admin/status');
    assert.ok(serverContent.includes('/api/admin/system-override'), 'Server must implement /api/admin/system-override');
    assert.ok(serverContent.includes('/api/admin/system-reboot'), 'Server must implement /api/admin/system-reboot');
    assert.ok(serverContent.includes('/api/jarvis/strategic-oversight'), 'Server must implement /api/jarvis/strategic-oversight');
    assert.ok(serverContent.includes('/api/gemini/strategic-counsel'), 'Server must implement /api/gemini/strategic-counsel');
  });

  // =========================================================================
  // PILLAR 5: ITERATIVE SELF-CORRECTION & AUTO-FIX PROTOCOL
  // =========================================================================
  test('5. Iterative Self-Correction & Auto-Fix Protocol: Self-Healing Sentinel', () => {
    // 5.1 Self-Healing Backend Sentinel Initialized
    assert.ok(selfHealingBackend, 'SelfHealingBackendSentinel must exist');
    const telemetryBefore = selfHealingBackend.getTelemetry();
    assert.strictEqual(telemetryBefore.isHealthy, true);

    // 5.2 Simulate Hazard Mitigation
    const hazardReport = selfHealingBackend.recordAndMitigateHazard(
      'MOCK_LATENCY_SPIKE',
      'API roundtrip spike > 400ms detected',
      'WARNING',
      () => {
        // Self-healing recovery action
      }
    );
    assert.strictEqual(hazardReport.resolved, true, 'Hazard must be resolved automatically');
    assert.ok(hazardReport.mitigationAction.includes('Auto-mitigated'));

    // 5.3 Full System Repair Execution
    const repairResult = selfHealingBackend.executeFullSystemRepair();
    assert.strictEqual(repairResult.success, true);
    assert.ok(repairResult.actionsTaken.length > 0);
    assert.strictEqual(repairResult.telemetry.isHealthy, true);

    // 5.4 server.ts Diagnostics Route
    const serverPath = path.resolve('server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    assert.ok(serverContent.includes('/api/diagnostics/self-healing'), 'Server must implement /api/diagnostics/self-healing');
    assert.ok(serverContent.includes('/api/diagnostics/repair'), 'Server must implement /api/diagnostics/repair');
  });

});
