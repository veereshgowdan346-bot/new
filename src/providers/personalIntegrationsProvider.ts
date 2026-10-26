import crypto from 'node:crypto';
import { GoogleAuthState, TelegramIntegrationState } from './types';

// ============================================================================
// 1. GOOGLE OAUTH 2.0 INTEGRATION PROVIDER
// ============================================================================
export class GoogleOAuthProvider {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private activeState: string | null = null;
  private accessToken: string | null = null;
  private refreshTokenVal: string | null = null;
  private tokenExpiryTime: number = 0;
  private userEmail: string = 'veereshgowdan346@gmail.com';
  private isAuthenticated = false;

  constructor(config?: { clientId?: string; clientSecret?: string; redirectUri?: string }) {
    this.clientId = config?.clientId || process.env.GOOGLE_CLIENT_ID || 'chintu-master-auth-google-permanent';
    this.clientSecret = config?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || 'mock_google_secret';
    this.redirectUri = config?.redirectUri || 'http://localhost:3000/api/auth/google/callback';
  }

  // Generate OAuth 2.0 Authorization URL with CSRF state protection
  public generateAuthUrl(): { authUrl: string; state: string } {
    const state = crypto.randomBytes(16).toString('hex');
    this.activeState = state;
    const scopes = encodeURIComponent('openid email profile');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=${scopes}&state=${state}&access_type=offline&prompt=consent`;
    return { authUrl, state };
  }

  // Handle OAuth 2.0 Callback with state validation
  public async handleCallback(code: string, state: string): Promise<{ success: boolean; message: string; user?: any }> {
    if (!state || state !== this.activeState) {
      return { success: false, message: 'Invalid or forged OAuth state token (CSRF attack detected).' };
    }
    if (!code || code === 'invalid_code') {
      return { success: false, message: 'Authorization code rejected by OAuth server.' };
    }

    // Simulate token exchange
    this.accessToken = `ya29.mock_access_token_${crypto.randomBytes(8).toString('hex')}`;
    this.refreshTokenVal = `1//mock_refresh_token_${crypto.randomBytes(8).toString('hex')}`;
    this.tokenExpiryTime = Date.now() + 3600 * 1000; // 1 hour
    this.isAuthenticated = true;
    this.activeState = null;

    return {
      success: true,
      message: 'Google session successfully established with least-privilege scopes.',
      user: {
        emailMasked: this.getMaskedEmail(),
        scopes: ['openid', 'email', 'profile'],
        expiresIn: 3600
      }
    };
  }

  // Token refresh handling
  public async refreshToken(): Promise<{ success: boolean; newExpiry?: number; error?: string }> {
    if (!this.refreshTokenVal) {
      return { success: false, error: 'No refresh token available. User must re-authenticate.' };
    }
    // Simulate refreshed access token
    this.accessToken = `ya29.mock_refreshed_${crypto.randomBytes(8).toString('hex')}`;
    this.tokenExpiryTime = Date.now() + 3600 * 1000;
    return { success: true, newExpiry: this.tokenExpiryTime };
  }

  // Revoke token & disconnect
  public async revokeSession(): Promise<{ success: boolean; message: string }> {
    this.accessToken = null;
    this.refreshTokenVal = null;
    this.tokenExpiryTime = 0;
    this.isAuthenticated = false;
    return { success: true, message: 'Google OAuth token revoked and local session unlinked.' };
  }

  public getMaskedEmail(): string {
    const parts = this.userEmail.split('@');
    if (parts.length !== 2) return 'u***@masked.com';
    const name = parts[0];
    const maskedName = name.length > 3 ? `${name[0]}***${name.slice(-1)}` : 'u***';
    return `${maskedName}@${parts[1]}`;
  }

  public getState(): GoogleAuthState {
    const remainingMs = Math.max(0, this.tokenExpiryTime - Date.now());
    return {
      connected: this.isAuthenticated && remainingMs > 0,
      emailMasked: this.isAuthenticated ? this.getMaskedEmail() : 'UNAUTHENTICATED',
      scopes: this.isAuthenticated ? ['openid', 'email', 'profile'] : [],
      tokenExpiresInMs: remainingMs,
      stateToken: this.activeState ? 'ACTIVE_UNVERIFIED' : null
    };
  }
}

// ============================================================================
// 2. TELEGRAM BOT API INTEGRATION PROVIDER
// ============================================================================
export class TelegramBotProvider {
  private botToken: string;
  private botUsername: string;
  private isConnected = true;
  private processedUpdateIds = new Set<number>();
  private messageOutboxLog: any[] = [];

  constructor(config?: { botToken?: string; botUsername?: string }) {
    this.botToken = config?.botToken || process.env.CHINTU_TELEGRAM_BOT_TOKEN || 'CONFIGURED_VIA_ENV';
    this.botUsername = config?.botUsername || process.env.CHINTU_TELEGRAM_BOT_USERNAME || 'chintu_jarvis_veer_bot';
  }

  // Token format and validity verification
  public isValidTokenFormat(token = this.botToken): boolean {
    return /^\d{8,12}:[A-Za-z0-9_-]{30,40}$/.test(token);
  }

  // Webhook update deduplication (prevents duplicate command execution)
  public processUpdate(updateId: number, text: string): { isDuplicate: boolean; parsedCommand?: string } {
    if (this.processedUpdateIds.has(updateId)) {
      return { isDuplicate: true };
    }
    this.processedUpdateIds.add(updateId);

    // Keep set bounded to last 1,000 IDs
    if (this.processedUpdateIds.size > 1000) {
      const first = Array.from(this.processedUpdateIds)[0];
      this.processedUpdateIds.delete(first);
    }

    const command = text && text.startsWith('/') ? text.trim().split(' ')[0].toLowerCase() : undefined;
    return { isDuplicate: false, parsedCommand: command };
  }

  // Send message to isolated sandbox channel
  public async sendMessage(chatId: string | number, text: string): Promise<{ success: boolean; messageId: number }> {
    const messageId = Math.floor(10000 + Math.random() * 90000);
    this.messageOutboxLog.push({
      messageId,
      chatId: typeof chatId === 'string' ? `${chatId.slice(0, 3)}***` : 'MASKED',
      textPreview: text.slice(0, 40),
      timestamp: Date.now()
    });
    return { success: true, messageId };
  }

  public getMaskedToken(): string {
    if (this.botToken.length > 8 && this.botToken.includes(':')) {
      const [id, secret] = this.botToken.split(':');
      return `${id.slice(0, 3)}***:${secret.slice(-3)}`;
    }
    return 'MASKED_ENV_SECRET';
  }

  public getState(): TelegramIntegrationState {
    return {
      connected: this.isConnected,
      botUsername: `@${this.botUsername}`,
      maskedToken: this.getMaskedToken(),
      webhookActive: true,
      processedUpdatesCount: this.processedUpdateIds.size
    };
  }
}

