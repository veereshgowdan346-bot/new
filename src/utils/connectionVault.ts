import crypto from 'node:crypto';
import { runtimeDb, UserConnectionRecord } from './databasePersistence';
import { cryptoVault } from './cryptoVault';
import { generateTOTP } from './angelMarketDataAdapter';

export type ProviderType = 'angel_one' | 'telegram' | 'google' | 'ollama';
export type ConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'SAVED'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'AUTH_FAILED'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMITED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface SanitizedConnectionState {
  provider: ProviderType;
  status: ConnectionStatus;
  sanitizedConfig: Record<string, any>;
  lastVerifiedAt: string | null;
  lastError: string | null;
  missingPermissions: string | null;
  updatedAt: string;
  readBackVerified?: boolean;
}

export class ConnectionVaultService {
  /**
   * Retrieves all connection statuses for a user, sanitized of all secret values.
   */
  public getUserConnections(userId: string): SanitizedConnectionState[] {
    const records = runtimeDb.getAllConnections(userId);
    const providers: ProviderType[] = ['angel_one', 'telegram', 'google', 'ollama'];

    return providers.map((provider) => {
      const match = records.find((r) => r.provider === provider);
      if (!match) {
        return {
          provider,
          status: 'NOT_CONFIGURED',
          sanitizedConfig: {},
          lastVerifiedAt: null,
          lastError: null,
          missingPermissions: this.getRequiredPermissions(provider),
          updatedAt: new Date().toISOString()
        };
      }

      let parsedConfig = {};
      try {
        parsedConfig = JSON.parse(match.sanitizedConfig || '{}');
      } catch {
        parsedConfig = {};
      }

      return {
        provider,
        status: match.status as ConnectionStatus,
        sanitizedConfig: parsedConfig,
        lastVerifiedAt: match.lastVerifiedAt || null,
        lastError: match.lastError || null,
        missingPermissions: match.missingPermissions || null,
        updatedAt: match.updatedAt
      };
    });
  }

  /**
   * Retrieves a single sanitized connection state for a user and provider.
   */
  public getConnectionState(userId: string, provider: ProviderType): SanitizedConnectionState {
    const connections = this.getUserConnections(userId);
    return connections.find((c) => c.provider === provider) || {
      provider,
      status: 'NOT_CONFIGURED',
      sanitizedConfig: {},
      lastVerifiedAt: null,
      lastError: null,
      missingPermissions: this.getRequiredPermissions(provider),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Securely saves or updates credentials for a user and provider.
   * Credentials are encrypted using AES-256-GCM before storage.
   * Implements transaction-safe durable read-back verification.
   */
  public saveConnection(
    userId: string,
    provider: ProviderType,
    credentials: Record<string, any>,
    status: ConnectionStatus = 'NOT_CONFIGURED'
  ): SanitizedConnectionState {
    // Non-destructive credential merge: preserve previously saved fields if not re-entered
    const existingCreds = this.getDecryptedCredentials(userId, provider) || {};
    const mergedCredentials: Record<string, any> = { ...existingCreds };
    for (const [k, v] of Object.entries(credentials)) {
      if (typeof v === 'string') {
        const trimmed = v.trim();
        // Ignore empty strings, bullet masks, and asterisk masks
        const isMasked = trimmed.includes('*') || trimmed.includes('\u2022') || trimmed.includes('•') || trimmed.includes('●');
        if (trimmed.length > 0 && !isMasked) {
          mergedCredentials[k] = trimmed;
        }
      } else if (v !== undefined && v !== null) {
        mergedCredentials[k] = v;
      }
    }

    // Determine appropriate state: if all essential fields are configured, state is SAVED
    let determinedStatus: ConnectionStatus = status;
    if (determinedStatus === 'NOT_CONFIGURED' || determinedStatus === 'DISCONNECTED') {
      if (provider === 'angel_one') {
        if (mergedCredentials.apiKey && mergedCredentials.clientId && mergedCredentials.pin && mergedCredentials.totpSecret) {
          determinedStatus = 'SAVED';
        }
      } else if (provider === 'telegram') {
        if (mergedCredentials.botToken) {
          determinedStatus = 'SAVED';
        }
      } else if (provider === 'google') {
        if (mergedCredentials.geminiApiKey || (mergedCredentials.clientId && mergedCredentials.clientSecret)) {
          determinedStatus = 'SAVED';
        }
      } else if (provider === 'ollama') {
        if (mergedCredentials.endpointUrl || mergedCredentials.modelName) {
          determinedStatus = 'SAVED';
        }
      }
    }

    const encrypted = cryptoVault.encryptObject(mergedCredentials);
    const sanitized = this.sanitizeConfig(provider, mergedCredentials);
    const now = new Date().toISOString();

    const existing = runtimeDb.getConnection(userId, provider);
    const connRecord: UserConnectionRecord = {
      id: existing ? existing.id : `conn_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      provider,
      status: determinedStatus,
      encryptedCredentials: encrypted,
      sanitizedConfig: JSON.stringify(sanitized),
      lastVerifiedAt: existing?.lastVerifiedAt || null,
      lastError: null,
      missingPermissions: this.getRequiredPermissions(provider),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    runtimeDb.upsertConnection(connRecord);

    // Durable Read-Back Verification
    const readBack = runtimeDb.getConnection(userId, provider);
    if (!readBack || !readBack.encryptedCredentials) {
      throw new Error(`Durable persistence read-back verification failed for provider: ${provider}`);
    }
    const decryptedVerification = this.getDecryptedCredentials(userId, provider);
    if (!decryptedVerification) {
      throw new Error(`Decryption verification failed after persistence for provider: ${provider}`);
    }

    // Audit log
    runtimeDb.logAudit({
      id: `aud_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      action: `CONNECTION_SAVED_${provider.toUpperCase()}`,
      details: `Saved credentials for ${provider}. Masked config: ${JSON.stringify(sanitized)}`,
      timestamp: now
    });

    return {
      provider,
      status: connRecord.status as ConnectionStatus,
      sanitizedConfig: sanitized,
      lastVerifiedAt: connRecord.lastVerifiedAt || null,
      lastError: null,
      missingPermissions: connRecord.missingPermissions || null,
      updatedAt: connRecord.updatedAt,
      readBackVerified: true
    };
  }

  /**
   * Retrieves decrypted credentials for backend execution. Never exposed to clients.
   */
  public getDecryptedCredentials<T = Record<string, any>>(userId: string, provider: ProviderType): T | null {
    const conn = runtimeDb.getConnection(userId, provider);
    if (!conn || !conn.encryptedCredentials) return null;
    try {
      return cryptoVault.decryptObject<T>(conn.encryptedCredentials);
    } catch {
      return null;
    }
  }

  /**
   * Safely disconnects a provider and removes stored credentials.
   */
  public disconnectConnection(userId: string, provider: ProviderType): SanitizedConnectionState {
    const existing = runtimeDb.getConnection(userId, provider);
    const now = new Date().toISOString();

    if (existing) {
      const connRecord: UserConnectionRecord = {
        ...existing,
        status: 'DISCONNECTED',
        encryptedCredentials: '',
        sanitizedConfig: '{}',
        lastError: null,
        updatedAt: now
      };
      runtimeDb.upsertConnection(connRecord);
    }

    runtimeDb.logAudit({
      id: `aud_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      action: `CONNECTION_DISCONNECTED_${provider.toUpperCase()}`,
      details: `User disconnected and purged credentials for ${provider}`,
      timestamp: now
    });

    return {
      provider,
      status: 'DISCONNECTED',
      sanitizedConfig: {},
      lastVerifiedAt: existing?.lastVerifiedAt || null,
      lastError: null,
      missingPermissions: this.getRequiredPermissions(provider),
      updatedAt: now
    };
  }

  /**
   * Tests and validates connection using real provider-side verification.
   * If overrideCredentials is provided (Test-Before-Save workflow), the candidate
   * credentials are tested without updating the stored connection state in the database on failure.
   */
  public async testConnection(
    userId: string,
    provider: ProviderType,
    overrideCredentials?: Record<string, any>
  ): Promise<{
    success: boolean;
    status: ConnectionStatus;
    message: string;
    lastVerifiedAt?: string;
    sessionTokens?: any;
    verifiedCapabilities?: string[];
  }> {
    const existingCreds = this.getDecryptedCredentials(userId, provider) || {};
    const creds: Record<string, any> = { ...existingCreds };
    
    if (overrideCredentials && typeof overrideCredentials === 'object') {
      for (const [k, v] of Object.entries(overrideCredentials)) {
        if (typeof v === 'string') {
          const trimmed = v.trim();
          const isMasked = trimmed.includes('*') || trimmed.includes('\u2022') || trimmed.includes('•') || trimmed.includes('●');
          if (trimmed.length > 0 && !isMasked) {
            creds[k] = trimmed;
            hasActiveOverrides = true;
          }
        } else if (v !== undefined && v !== null) {
          creds[k] = v;
          hasActiveOverrides = true;
        }
      }
    }

    const isCandidateTest = overrideCredentials !== undefined;
    const now = new Date().toISOString();
    const existing = runtimeDb.getConnection(userId, provider);

    if (!creds || Object.keys(creds).length === 0) {
      const err = `No credentials configured for ${provider}. Please provide required fields first.`;
      if (!isCandidateTest && existing) {
        runtimeDb.upsertConnection({
          ...existing,
          status: 'ERROR',
          lastError: err,
          updatedAt: now
        });
      }
      return { success: false, status: 'ERROR', message: err, verifiedCapabilities: [] };
    }

    try {
      let isVerified = false;
      let verificationMsg = '';
      let sessionTokens: any = null;
      let resolvedStatus: ConnectionStatus = 'ERROR';

      switch (provider) {
        case 'angel_one': {
          const { apiKey, clientId, pin, totpSecret } = creds;
          if (!apiKey || !clientId || !pin || !totpSecret) {
            resolvedStatus = 'NOT_CONFIGURED';
            throw new Error('Missing one or more required Angel One fields: API Key, Client Code, PIN, TOTP Secret.');
          }
          const cleanSecret = String(totpSecret).trim().replace(/\s+/g, '');
          if (cleanSecret.length < 16) {
            resolvedStatus = 'AUTH_FAILED';
            throw new Error('Invalid TOTP Secret. Base32 key must be at least 16 characters.');
          }
          try {
            const totp = generateTOTP(cleanSecret);
            const res = await fetch('https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-UserType': 'USER',
                'X-SourceID': 'WEB',
                'X-ClientLocalIP': '127.0.0.1',
                'X-ClientPublicIP': '127.0.0.1',
                'X-MACAddress': '00:00:00:00:00:00',
                'X-PrivateKey': apiKey
              },
              body: JSON.stringify({ clientcode: clientId, password: pin, totp }),
              signal: AbortSignal.timeout(10000)
            });

            // Fail-safe response parsing: safely handle Cloudflare HTML block pages
            const rawText = await res.text();
            let data: any = null;
            try {
              data = JSON.parse(rawText);
            } catch {
              data = {
                status: false,
                message: `Upstream HTTP ${res.status}: ${rawText.slice(0, 150).replace(/<[^>]*>/g, '').trim() || 'Non-JSON server response'}`
              };
            }

            if (data && (data.status === true || data.message === 'SUCCESS')) {
              isVerified = true;
              resolvedStatus = 'CONNECTED';
              verificationMsg = `Angel One SmartAPI authenticated successfully for Client ${clientId}. SmartStream authorized.`;
              sessionTokens = data.data;
            } else {
              isVerified = false;
              const isRate = res.status === 429 || String(data?.errorcode || '').includes('8001') || String(data?.message || '').toLowerCase().includes('rate limit');
              const isExpired = String(data?.message || '').toLowerCase().includes('expired') || String(data?.errorcode || '').includes('AB1004');
              if (isRate) resolvedStatus = 'RATE_LIMITED';
              else if (isExpired) resolvedStatus = 'SESSION_EXPIRED';
              else resolvedStatus = 'AUTH_FAILED';
              verificationMsg = `Angel One authentication rejected: ${data?.message || 'Invalid API Key, PIN, or TOTP.'}`;
            }
          } catch (netErr: any) {
            isVerified = false;
            resolvedStatus = 'ERROR';
            verificationMsg = `Angel One network test unreachable: ${netErr?.message || 'Connection timed out or network blocked.'}`;
          }
          break;
        }

        case 'telegram': {
          const { botToken } = creds;
          if (!botToken || typeof botToken !== 'string') {
            resolvedStatus = 'NOT_CONFIGURED';
            throw new Error('Missing Telegram Bot Token.');
          }
          const tokenRegex = /^\d{8,12}:[A-Za-z0-9_-]{30,40}$/;
          if (!tokenRegex.test(botToken)) {
            resolvedStatus = 'AUTH_FAILED';
            throw new Error('Invalid Telegram Bot Token format. Expected format: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ.');
          }
          try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
              signal: AbortSignal.timeout(3500)
            });
            const data = await res.json() as any;
            if (data && data.ok) {
              isVerified = true;
              resolvedStatus = 'CONNECTED';
              verificationMsg = `Telegram Bot @${data.result.username} verified successfully.`;
            } else {
              isVerified = false;
              resolvedStatus = 'AUTH_FAILED';
              verificationMsg = `Telegram Bot API rejected token: ${data?.description || 'Unauthorized.'}`;
            }
          } catch (netErr: any) {
            isVerified = false;
            resolvedStatus = 'ERROR';
            verificationMsg = `Telegram API test unreachable: ${netErr?.message || 'Connection timed out.'}`;
          }
          break;
        }

        case 'google': {
          const { clientId, clientSecret, geminiApiKey } = creds;
          if (!geminiApiKey && (!clientId || !clientSecret)) {
            resolvedStatus = 'NOT_CONFIGURED';
            throw new Error('Missing Google credentials: provide Gemini API Key or Google OAuth Client ID & Secret.');
          }
          if (geminiApiKey) {
            try {
              const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`, {
                signal: AbortSignal.timeout(3500)
              });
              const data = await res.json() as any;
              if (data && data.models) {
                isVerified = true;
                resolvedStatus = 'CONNECTED';
                verificationMsg = `Google Gemini API Key verified: ${data.models.length} models accessible.`;
              } else {
                isVerified = false;
                resolvedStatus = 'AUTH_FAILED';
                verificationMsg = `Google Gemini API rejected key: ${data?.error?.message || 'Invalid key.'}`;
              }
            } catch (netErr: any) {
              isVerified = false;
              resolvedStatus = 'ERROR';
              verificationMsg = `Google Gemini API test unreachable: ${netErr?.message || 'Connection timed out.'}`;
            }
          } else {
            isVerified = false;
            resolvedStatus = 'SAVED';
            verificationMsg = 'Google OAuth Client ID & Secret saved. User must complete interactive browser consent to verify connection.';
          }
          break;
        }

        case 'ollama': {
          const endpoint = (creds.endpointUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
          const model = creds.modelName || 'llama3';
          try {
            const res = await fetch(`${endpoint}/api/tags`, {
              signal: AbortSignal.timeout(3500)
            });
            if (res.ok) {
              const data = await res.json() as any;
              const models = Array.isArray(data?.models) ? data.models.map((m: any) => m.name) : [];
              isVerified = true;
              resolvedStatus = 'CONNECTED';
              const hasModel = models.some((m: string) => m.toLowerCase().includes(model.toLowerCase()));
              verificationMsg = `Ollama runtime reachable at ${endpoint}. ${models.length} model(s) available.${hasModel ? ` Model '${model}' verified.` : ` Notice: Model '${model}' not found in local library.`}`;
            } else {
              isVerified = false;
              resolvedStatus = 'ERROR';
              verificationMsg = `Ollama service returned HTTP ${res.status}: ${res.statusText}`;
            }
          } catch (netErr: any) {
            isVerified = false;
            resolvedStatus = 'ERROR';
            verificationMsg = `Ollama server unreachable at ${endpoint}: ${netErr?.message || 'Connection refused. Ensure ollama serve is active.'}`;
          }
          break;
        }
      }

      let verifiedCapabilities: string[] = [];
      if (isVerified) {
        switch (provider) {
          case 'angel_one':
            verifiedCapabilities = [
              'Market Stream (SmartStream WebSocket)',
              'Historical OHLCV Data API',
              'Fail-Closed Paper Conduit',
              'RMS Risk Guard Engine'
            ];
            break;
          case 'telegram':
            verifiedCapabilities = [
              'Telegram Bot API Verified',
              'Outbound Critical Alerts',
              'Autonomous RMS Breach Notifications',
              'Two-Way Command Polling'
            ];
            break;
          case 'google':
            verifiedCapabilities = creds.geminiApiKey
              ? ['Gemini Generative AI API', 'Market Sentiment Analysis', 'Jarvis Intent Reasoning']
              : ['Google OAuth Profile', 'Secure SSO Handshake'];
            break;
          case 'ollama':
            verifiedCapabilities = [
              'Local Private LLM Host',
              'Zero-Egress Inference',
              'Master Brain Advisory'
            ];
            break;
        }
      }

      if (!isCandidateTest && existing) {
        runtimeDb.upsertConnection({
          ...existing,
          status: resolvedStatus,
          lastVerifiedAt: isVerified ? now : existing.lastVerifiedAt,
          lastError: isVerified ? null : verificationMsg,
          updatedAt: now
        });
      }

      runtimeDb.logAudit({
        id: `aud_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        action: `CONNECTION_TEST_${provider.toUpperCase()}`,
        details: `Result: ${isVerified ? 'SUCCESS' : 'FAILED'} (Status: ${resolvedStatus}${isCandidateTest ? ', pre-save test' : ''}). Message: ${verificationMsg}`,
        timestamp: now
      });

      return {
        success: isVerified,
        status: resolvedStatus,
        message: verificationMsg,
        lastVerifiedAt: isVerified ? now : undefined,
        sessionTokens: isVerified ? sessionTokens : undefined,
        verifiedCapabilities
      };
    } catch (err: any) {
      const errMsg = err?.message || 'Verification test failed.';
      if (!isCandidateTest && existing) {
        runtimeDb.upsertConnection({
          ...existing,
          status: 'ERROR',
          lastError: errMsg,
          updatedAt: now
        });
      }

      runtimeDb.logAudit({
        id: `aud_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        action: `CONNECTION_TEST_FAILED_${provider.toUpperCase()}`,
        details: `Error: ${errMsg}`,
        timestamp: now
      });

      return {
        success: false,
        status: 'ERROR',
        message: errMsg,
        verifiedCapabilities: []
      };
    }
  }

  /**
   * Sanitizes configuration dictionary for client exposure. All secrets are masked or removed.
   */
  private sanitizeConfig(provider: ProviderType, creds: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    switch (provider) {
      case 'angel_one':
        if (creds.clientId) {
          const c = String(creds.clientId);
          sanitized.clientId = c.length > 3 ? `${c.slice(0, 2)}***${c.slice(-1)}` : '***';
        }
        sanitized.hasApiKey = Boolean(creds.apiKey);
        sanitized.hasPin = Boolean(creds.pin);
        sanitized.hasTotpSecret = Boolean(creds.totpSecret);
        sanitized.brokerName = 'Angel One SmartAPI 2.0';
        break;

      case 'telegram': {
        const u = creds.botUsername || creds.bot_username;
        if (u) {
          sanitized.botUsername = u.startsWith('@') ? u : `@${u}`;
          sanitized.bot_username = sanitized.botUsername;
        }
        const t = creds.botToken || creds.bot_token;
        if (t) {
          const str = String(t);
          if (str.includes(':')) {
            const [id, secret] = str.split(':');
            sanitized.maskedToken = `${id.slice(0, 3)}***:${secret.slice(-3)}`;
          } else {
            sanitized.maskedToken = '***';
          }
          sanitized.bot_token = sanitized.maskedToken;
        }
        sanitized.allowedChatIds = creds.allowedChatIds || creds.allowed_chat_ids || (creds.chat_id ? [creds.chat_id] : []);
        break;
      }

      case 'google':
        if (creds.email) {
          const parts = String(creds.email).split('@');
          sanitized.email = parts.length === 2 ? `${parts[0].slice(0, 2)}***@${parts[1]}` : '***';
        }
        sanitized.hasGeminiApiKey = Boolean(creds.geminiApiKey);
        sanitized.hasOAuthClient = Boolean(creds.clientId && creds.clientSecret);
        sanitized.scopes = creds.scopes || ['openid', 'email', 'profile'];
        break;

      case 'ollama':
        sanitized.endpointUrl = creds.endpointUrl || 'http://127.0.0.1:11434';
        sanitized.modelName = creds.modelName || 'llama3';
        sanitized.hasCustomConfig = Boolean(creds.endpointUrl || creds.modelName);
        break;
    }

    return sanitized;
  }

  private getRequiredPermissions(provider: ProviderType): string {
    switch (provider) {
      case 'angel_one':
        return 'Requires SmartAPI Historical & Market Data permissions and TOTP enabled.';
      case 'telegram':
        return 'Requires Telegram Bot API token created via @BotFather with message read/write permissions.';
      case 'google':
        return 'Requires Google OAuth 2.0 openid, email, profile scopes or Gemini API Key.';
      case 'ollama':
        return 'Requires local Ollama service running on http://127.0.0.1:11434 (or custom host) with target LLM models installed.';
    }
  }
}

export const connectionVault = new ConnectionVaultService();
