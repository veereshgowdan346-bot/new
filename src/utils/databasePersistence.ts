import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PositionRecord {
  id: string;
  symbol: string;
  bot: string;
  action: string;
  qty: number;
  entryPrice: number;
  ltp: number;
  pnl: number;
  pnlPct: number;
  charges: number;
  openedAt: string;
  status?: string;
}

export interface TradeRecord {
  id: string;
  orderId?: string;
  symbol: string;
  bot: string;
  action: string;
  qty: number;
  price: number;
  pnl: number;
  grossPnl?: number;
  netPnl?: number;
  charges: number;
  status: string;
  timestamp: string;
  time?: string;
  breakdown?: any;
}

export interface RmsEventRecord {
  id: string;
  timestamp: string;
  event: string;
  level: string;
  details: string;
}

export interface BotRecord {
  id: number;
  name: string;
  asset: string;
  price: number;
  allocatedCapital: number;
  pnlToday: number;
  winRate: number;
  trades: number;
  status: string;
  worker_running: boolean;
  strategy_ready?: boolean;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'trader' | 'viewer';
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastLogin: string;
}

export interface UserConnectionRecord {
  id: string;
  userId: string;
  provider: 'angel_one' | 'telegram' | 'google';
  status: 'NOT_CONFIGURED' | 'CONNECTING' | 'CONNECTED' | 'EXPIRED' | 'ERROR' | 'DISCONNECTED';
  encryptedCredentials?: string;
  sanitizedConfig: string;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  missingPermissions?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  userId: string;
  action: string;
  details: string;
  ipAddress?: string;
  timestamp: string;
}

export class DatabasePersistenceService {
  private db: DatabaseSync | null = null;
  private dbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
    } else if (process.env.CHINTU_DB_PATH) {
      this.dbPath = process.env.CHINTU_DB_PATH;
    } else {
      const dataDir = path.resolve(__dirname, '../../server/data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.dbPath = path.join(dataDir, 'chintu_runtime.db');
    }
    this.init();
  }

  public init(customPath?: string): void {
    const targetPath = customPath;
    if (targetPath && targetPath !== this.dbPath) {
      if (this.db) {
        try { this.db.close(); } catch (e) {}
        this.db = null;
      }
      this.dbPath = targetPath;
    } else if (!this.dbPath && process.env.CHINTU_DB_PATH) {
      this.dbPath = process.env.CHINTU_DB_PATH;
    }
    if (this.db && (!targetPath || targetPath === this.dbPath)) {
      return;
    }
    try {
      const parentDir = path.dirname(this.dbPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS positions (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          bot TEXT NOT NULL,
          action TEXT NOT NULL,
          qty INTEGER NOT NULL,
          entryPrice REAL NOT NULL,
          ltp REAL NOT NULL,
          pnl REAL NOT NULL,
          pnlPct REAL NOT NULL,
          charges REAL DEFAULT 0,
          openedAt TEXT NOT NULL,
          status TEXT DEFAULT 'OPEN',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS trades (
          id TEXT PRIMARY KEY,
          orderId TEXT,
          symbol TEXT NOT NULL,
          bot TEXT NOT NULL,
          action TEXT NOT NULL,
          qty INTEGER NOT NULL,
          price REAL NOT NULL,
          pnl REAL DEFAULT 0,
          grossPnl REAL DEFAULT 0,
          netPnl REAL DEFAULT 0,
          charges REAL DEFAULT 0,
          status TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          breakdown_json TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bots (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          asset TEXT NOT NULL,
          price REAL NOT NULL,
          allocatedCapital REAL NOT NULL,
          pnlToday REAL NOT NULL,
          winRate REAL NOT NULL,
          trades INTEGER NOT NULL,
          status TEXT NOT NULL,
          worker_running INTEGER NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rms_events (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          event TEXT NOT NULL,
          level TEXT NOT NULL,
          details TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'trader',
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_login TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_connections (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
          encrypted_credentials TEXT,
          sanitized_config TEXT DEFAULT '{}',
          last_verified_at TEXT,
          last_error TEXT,
          missing_permissions TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, provider)
        );

        CREATE TABLE IF NOT EXISTS user_audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          details TEXT NOT NULL,
          ip_address TEXT,
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log(`[DB PERSISTENCE] SQLite database initialized at: ${this.dbPath}`);
    } catch (err) {
      console.error('[DB PERSISTENCE ERROR] Initialization failed:', err);
      throw err;
    }
  }

  public getDb(): DatabaseSync | null {
    return this.db;
  }

  // --- Positions ---
  public getOpenPositions(): PositionRecord[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare("SELECT * FROM positions WHERE status = 'OPEN' ORDER BY updated_at DESC");
      return (stmt.all() as any[]).map((r) => ({
        id: r.id,
        symbol: r.symbol,
        bot: r.bot,
        action: r.action,
        qty: Number(r.qty),
        entryPrice: Number(r.entryPrice),
        ltp: Number(r.ltp),
        pnl: Number(r.pnl),
        pnlPct: Number(r.pnlPct),
        charges: Number(r.charges),
        openedAt: r.openedAt,
        status: r.status
      }));
    } catch (e) {
      console.warn('[DB] Failed to load positions:', e);
      return [];
    }
  }

  public upsertPosition(pos: PositionRecord): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO positions (id, symbol, bot, action, qty, entryPrice, ltp, pnl, pnlPct, charges, openedAt, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          ltp = excluded.ltp,
          pnl = excluded.pnl,
          pnlPct = excluded.pnlPct,
          charges = excluded.charges,
          status = excluded.status,
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(
        pos.id,
        pos.symbol,
        pos.bot,
        pos.action,
        pos.qty,
        pos.entryPrice,
        pos.ltp,
        pos.pnl,
        pos.pnlPct,
        pos.charges || 0,
        pos.openedAt,
        pos.status || 'OPEN'
      );
    } catch (e) {
      console.warn('[DB] Failed to upsert position:', e);
    }
  }

  public closePosition(positionId: string): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare("UPDATE positions SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
      stmt.run(positionId);
    } catch (e) {
      console.warn('[DB] Failed to close position:', e);
    }
  }

  public clearAllPositions(): void {
    if (!this.db) return;
    try {
      this.db.exec("UPDATE positions SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP");
    } catch (e) {
      console.warn('[DB] Failed to clear positions:', e);
    }
  }

  // --- Trades ---
  public getRecentTrades(limit = 100): TradeRecord[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?');
      const rows = stmt.all(limit) as any[];
      return rows.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        symbol: r.symbol,
        bot: r.bot,
        action: r.action,
        qty: Number(r.qty),
        price: Number(r.price),
        pnl: Number(r.pnl),
        grossPnl: Number(r.grossPnl),
        netPnl: Number(r.netPnl),
        charges: Number(r.charges),
        status: r.status,
        timestamp: r.timestamp,
        breakdown: r.breakdown_json ? JSON.parse(r.breakdown_json) : undefined
      }));
    } catch (e) {
      console.warn('[DB] Failed to load trades:', e);
      return [];
    }
  }

  public saveTrade(trade: TradeRecord): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO trades (id, orderId, symbol, bot, action, qty, price, pnl, grossPnl, netPnl, charges, status, timestamp, breakdown_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          pnl = excluded.pnl,
          netPnl = excluded.netPnl,
          status = excluded.status
      `);
      const tradeId = trade.id || trade.orderId || ('tr_' + Date.now());
      const ordId = trade.orderId || trade.id || tradeId;
      const botName = trade.bot || (trade as any).botName || 'Decision Core';
      stmt.run(
        tradeId,
        ordId,
        trade.symbol,
        botName,
        trade.action,
        trade.qty,
        trade.price,
        trade.pnl || 0,
        trade.grossPnl || 0,
        trade.netPnl || trade.pnl || 0,
        trade.charges || 0,
        trade.status || 'FILLED',
        trade.timestamp || new Date().toLocaleTimeString(),
        trade.breakdown ? JSON.stringify(trade.breakdown) : null
      );
    } catch (e) {
      console.warn('[DB] Failed to save trade:', e);
    }
  }

  // --- Bots ---
  public getBots(): BotRecord[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare('SELECT * FROM bots ORDER BY id ASC');
      const rows = stmt.all() as any[];
      return rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        asset: r.asset,
        price: Number(r.price),
        allocatedCapital: Number(r.allocatedCapital),
        pnlToday: Number(r.pnlToday),
        winRate: Number(r.winRate),
        trades: Number(r.trades),
        status: r.status,
        worker_running: Boolean(r.worker_running)
      }));
    } catch (e) {
      console.warn('[DB] Failed to load bots:', e);
      return [];
    }
  }

  public upsertBot(bot: BotRecord): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO bots (id, name, asset, price, allocatedCapital, pnlToday, winRate, trades, status, worker_running, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          asset = excluded.asset,
          price = excluded.price,
          allocatedCapital = excluded.allocatedCapital,
          pnlToday = excluded.pnlToday,
          winRate = excluded.winRate,
          trades = excluded.trades,
          status = excluded.status,
          worker_running = excluded.worker_running,
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(
        bot.id,
        bot.name,
        bot.asset,
        bot.price,
        bot.allocatedCapital,
        bot.pnlToday,
        bot.winRate,
        bot.trades,
        bot.status,
        bot.worker_running ? 1 : 0
      );
    } catch (e) {
      console.warn('[DB] Failed to upsert bot:', e);
    }
  }

  // --- RMS Events ---
  public logRmsEvent(event: RmsEventRecord): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO rms_events (id, timestamp, event, level, details)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(event.id, event.timestamp, event.event, event.level, event.details);
    } catch (e) {
      console.warn('[DB] Failed to log RMS event:', e);
    }
  }

  public getRecentRmsEvents(limit = 20): RmsEventRecord[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare('SELECT * FROM rms_events ORDER BY rowid DESC LIMIT ?');
      return stmt.all(limit) as any[];
    } catch (e) {
      console.warn('[DB] Failed to load RMS events:', e);
      return [];
    }
  }

  // --- Chat History ---
  public saveChatMessage(sender: string, text: string, timestamp: string): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare('INSERT INTO chat_messages (sender, text, timestamp) VALUES (?, ?, ?)');
      stmt.run(sender, text, timestamp);
    } catch (e) {
      console.warn('[DB] Failed to save chat message:', e);
    }
  }

  public getRecentChatMessages(limit = 50): any[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare('SELECT sender, text, timestamp FROM chat_messages ORDER BY id DESC LIMIT ?');
      return (stmt.all(limit) as any[]).reverse();
    } catch (e) {
      console.warn('[DB] Failed to load chat messages:', e);
      return [];
    }
  }

  // --- Multi-User Management ---
  public ensureUser(user: UserRecord): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (id, email, name, role, password_hash, salt, created_at, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          role = excluded.role,
          last_login = excluded.last_login
      `);
      stmt.run(user.id, user.email, user.name, user.role, user.passwordHash, user.salt, user.createdAt, user.lastLogin);
    } catch (e) {
      console.warn('[DB] Failed to ensure user:', e);
    }
  }

  public getUserByEmail(email: string): UserRecord | null {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
      const row = stmt.get(email) as any;
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        passwordHash: row.password_hash,
        salt: row.salt,
        createdAt: row.created_at,
        lastLogin: row.last_login
      };
    } catch (e) {
      console.warn('[DB] Failed to get user by email:', e);
      return null;
    }
  }

  public getUserById(id: string): UserRecord | null {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
      const row = stmt.get(id) as any;
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        passwordHash: row.password_hash,
        salt: row.salt,
        createdAt: row.created_at,
        lastLogin: row.last_login
      };
    } catch (e) {
      console.warn('[DB] Failed to get user by id:', e);
      return null;
    }
  }

  // --- Multi-User Connection Vault ---
  public upsertConnection(conn: UserConnectionRecord): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO user_connections (id, user_id, provider, status, encrypted_credentials, sanitized_config, last_verified_at, last_error, missing_permissions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET
          status = excluded.status,
          encrypted_credentials = excluded.encrypted_credentials,
          sanitized_config = excluded.sanitized_config,
          last_verified_at = excluded.last_verified_at,
          last_error = excluded.last_error,
          missing_permissions = excluded.missing_permissions,
          updated_at = excluded.updated_at
      `);
      stmt.run(
        conn.id,
        conn.userId,
        conn.provider,
        conn.status,
        conn.encryptedCredentials || null,
        conn.sanitizedConfig,
        conn.lastVerifiedAt || null,
        conn.lastError || null,
        conn.missingPermissions || null,
        conn.createdAt,
        conn.updatedAt
      );
    } catch (e) {
      console.warn('[DB] Failed to upsert user connection:', e);
    }
  }

  public getConnection(userId: string, provider: string): UserConnectionRecord | null {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare('SELECT * FROM user_connections WHERE user_id = ? AND provider = ?');
      const row = stmt.get(userId, provider) as any;
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        status: row.status,
        encryptedCredentials: row.encrypted_credentials,
        sanitizedConfig: row.sanitized_config,
        lastVerifiedAt: row.last_verified_at,
        lastError: row.last_error,
        missingPermissions: row.missing_permissions,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (e) {
      console.warn('[DB] Failed to get user connection:', e);
      return null;
    }
  }

  public getAllConnections(userId: string): UserConnectionRecord[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare('SELECT * FROM user_connections WHERE user_id = ? ORDER BY provider ASC');
      return (stmt.all(userId) as any[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        status: row.status,
        encryptedCredentials: row.encrypted_credentials,
        sanitizedConfig: row.sanitized_config,
        lastVerifiedAt: row.last_verified_at,
        lastError: row.last_error,
        missingPermissions: row.missing_permissions,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (e) {
      console.warn('[DB] Failed to load user connections:', e);
      return [];
    }
  }

  public deleteConnection(userId: string, provider: string): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare('DELETE FROM user_connections WHERE user_id = ? AND provider = ?');
      stmt.run(userId, provider);
    } catch (e) {
      console.warn('[DB] Failed to delete user connection:', e);
    }
  }

  // --- Audit Logging ---
  public logAudit(entry: AuditLogRecord): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO user_audit_log (id, user_id, action, details, ip_address, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(entry.id, entry.userId, entry.action, entry.details, entry.ipAddress || null, entry.timestamp);
    } catch (e) {
      console.warn('[DB] Failed to record audit log:', e);
    }
  }

  public getAuditLogs(userId: string, limit = 50): AuditLogRecord[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare('SELECT * FROM user_audit_log WHERE user_id = ? ORDER BY rowid DESC LIMIT ?');
      return stmt.all(userId, limit) as any[];
    } catch (e) {
      console.warn('[DB] Failed to load audit logs:', e);
      return [];
    }
  }

  // --- System Settings (Key/Value Persistence) ---
  public getSetting<T = any>(key: string, defaultValue?: T): T | null {
    if (!this.db) return defaultValue ?? null;
    try {
      const stmt = this.db.prepare('SELECT value FROM system_settings WHERE key = ?');
      const row = stmt.get(key) as any;
      if (!row || row.value === undefined || row.value === null) return defaultValue ?? null;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return row.value as unknown as T;
      }
    } catch (e) {
      console.warn(`[DB] Failed to load setting '${key}':`, e);
      return defaultValue ?? null;
    }
  }

  public setSetting(key: string, value: any): void {
    if (!this.db) return;
    try {
      const serialized = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
      const stmt = this.db.prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(key, serialized);
    } catch (e) {
      console.warn(`[DB] Failed to set setting '${key}':`, e);
    }
  }

  public getAllSettings(): Record<string, any> {
    if (!this.db) return {};
    try {
      const stmt = this.db.prepare('SELECT key, value FROM system_settings');
      const rows = stmt.all() as any[];
      const result: Record<string, any> = {};
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch {
          result[row.key] = row.value;
        }
      }
      return result;
    } catch (e) {
      console.warn('[DB] Failed to load all settings:', e);
      return {};
    }
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const runtimeDb = new DatabasePersistenceService();

