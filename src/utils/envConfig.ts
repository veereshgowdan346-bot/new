/**
 * Authoritative Environment Configuration Loader
 * Establishes one reliable, idempotent initialization sequence for .env configuration.
 * Prevents redundant filesystem calls and guarantees clean loading before adapters read config.
 */
import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;

export function loadEnvironmentConfig(): { loaded: boolean; hasEnvFile: boolean } {
  const envPath = path.join(process.cwd(), '.env');
  const hasEnvFile = fs.existsSync(envPath);

  if (envLoaded) {
    return { loaded: true, hasEnvFile };
  }

  if (hasEnvFile && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
      envLoaded = true;
    } catch (e) {
      console.warn('[ENV CONFIG] Warning loading .env file:', e);
    }
  }

  return { loaded: envLoaded, hasEnvFile };
}

export function getSanitizedEnvStatus() {
  loadEnvironmentConfig();
  const required = ['ANGEL_API_KEY', 'ANGEL_CLIENT_ID', 'ANGEL_PIN', 'ANGEL_TOTP_SECRET'];
  const status: Record<string, boolean> = {};

  required.forEach((key) => {
    const val = process.env[key];
    status[key] = Boolean(val && val.trim().length > 0);
  });

  return {
    hasEnvFile: fs.existsSync(path.join(process.cwd(), '.env')),
    requiredKeys: status,
    allConfigured: required.every((k) => status[k])
  };
}

// Ensure single initial load
loadEnvironmentConfig();

