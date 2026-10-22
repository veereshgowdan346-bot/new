/**
 * CHINTU AI Unified API & WebSocket Bridge
 * Seamless request forwarding with resilient fallbacks for missing environment variables.
 * Automatically falls back to relative API paths ('/api') and localhost defaults so the app
 * boots instantly without requiring HOST or VITE_API_URL environment configuration.
 */

// Safe evaluation of environment variables with infallible default fallbacks
const getEnvVar = (key, fallback = '') => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {}
  return fallback;
};

// Fallback to relative URL or custom VITE_API_URL if explicitly provided
export const RAW_API_URL = getEnvVar('VITE_API_URL', '').trim();
export const BACKEND_HOST = getEnvVar('VITE_HOST', getEnvVar('HOST', '127.0.0.1')).trim() || '127.0.0.1';
export const BACKEND_PORT = Number(getEnvVar('VITE_PORT', getEnvVar('PORT', '8000'))) || 8000;

// Direct local fallback address (used only when direct connection is needed)
export const DIRECT_BACKEND_URL = RAW_API_URL
  ? RAW_API_URL.replace(/\/+$/, '')
  : `http://${BACKEND_HOST}:${BACKEND_PORT}`;

/**
 * Universal fetch wrapper with automatic relative path resolution
 * Always safely resolves to relative '/api/...' if no custom host is configured.
 */
export async function apiFetch(endpoint, options = {}) {
  // Normalize endpoint string
  let cleanEndpoint = (endpoint || '').trim();
  
  if (cleanEndpoint.startsWith(DIRECT_BACKEND_URL)) {
    cleanEndpoint = cleanEndpoint.slice(DIRECT_BACKEND_URL.length);
  }
  
  // Guarantee clean '/api/...' structure
  if (!cleanEndpoint.startsWith('/api') && !cleanEndpoint.startsWith('http')) {
    cleanEndpoint = `/api${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`;
  }

  // Set default JSON headers for POST/PUT if body is present and not FormData
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Attach master authorization token from localStorage or default permanent master session
  if (typeof window !== 'undefined' && !headers['Authorization']) {
    try {
      const storedProfile = localStorage.getItem('chintu_user_profile');
      if (storedProfile) {
        const parsed = JSON.parse(storedProfile);
        if (parsed?.token) {
          headers['Authorization'] = `Bearer ${parsed.token}`;
          headers['X-Chintu-Auth-Token'] = parsed.token;
        }
      }
    } catch (e) {}

    // Fallback default permanent session token
    if (!headers['Authorization']) {
      headers['Authorization'] = 'Bearer chintu_master_auth_permanent_veeresh';
      headers['X-Chintu-Auth-Token'] = 'chintu_master_auth_permanent_veeresh';
    }
  }

  const reqOptions = {
    ...options,
    headers,
  };

  // 1. Primary path: Relative fetch (works seamlessly in all environments and iframe sandboxes)
  try {
    const relativeUrl = cleanEndpoint.startsWith('http')
      ? cleanEndpoint.replace(/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/, '')
      : cleanEndpoint;

    const res = await fetch(relativeUrl, reqOptions);
    if (res.status) {
      return res;
    }
  } catch (err) {
    // Relative fetch may fail if backend is listening strictly on separate direct port
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[API Bridge] Relative fetch to ${cleanEndpoint} failed. Trying direct URL fallback:`, err.message);
    }
  }

  // 2. Secondary fallback: Direct connection to configured or localhost backend
  try {
    const directUrl = cleanEndpoint.startsWith('http')
      ? cleanEndpoint
      : `${DIRECT_BACKEND_URL}${cleanEndpoint}`;

    return await fetch(directUrl, reqOptions);
  } catch (directErr) {
    // If backend is entirely offline, return safe mock response rather than crashing the component
    return {
      ok: false,
      status: 503,
      json: async () => ({
        status: 'offline',
        message: 'Backend server is in offline simulation mode.',
        data: null
      }),
      text: async () => '{"status":"offline"}'
    };
  }
}

/**
 * Returns a robust WebSocket URL with automatic browser origin resolution:
 * Uses current window.location host over ws:// or wss://, falling back to 127.0.0.1:8000.
 */
export function getWebSocketUrl(path = '/chintu-feed') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${cleanPath}`;
  }
  return `ws://${BACKEND_HOST}:${BACKEND_PORT}${cleanPath}`;
}
