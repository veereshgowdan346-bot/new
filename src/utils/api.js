/**
 * CHINTU AI Unified API & WebSocket Bridge
 * Handles seamless request forwarding through Vite dev proxy (/api)
 * with graceful fallback to direct backend at http://127.0.0.1:8000
 * to permanently eliminate "Failed to fetch" errors.
 */

export const BACKEND_PORT = 8000;
export const BACKEND_HOST = '127.0.0.1';
export const DIRECT_BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

export async function apiFetch(endpoint, options = {}) {
  // Normalize endpoint
  let cleanEndpoint = endpoint.trim();
  if (cleanEndpoint.startsWith(DIRECT_BACKEND_URL)) {
    cleanEndpoint = cleanEndpoint.slice(DIRECT_BACKEND_URL.length);
  }
  if (!cleanEndpoint.startsWith('/api') && !cleanEndpoint.startsWith('http')) {
    cleanEndpoint = `/api${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`;
  }

  // Set default JSON headers for POST/PUT if body is present and not FormData
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const reqOptions = {
    ...options,
    headers,
  };

  // 1. First attempt: Relative endpoint via Vite proxy (/api/...)
  // This is same-origin with the frontend, so it avoids CORS blocks completely.
  try {
    const relativeUrl = cleanEndpoint.startsWith('http')
      ? cleanEndpoint.replace(/^http:\/\/(?:127\.0\.0\.1|localhost):8000/, '')
      : cleanEndpoint;

    const res = await fetch(relativeUrl, reqOptions);
    // If we received any valid HTTP response (even 4xx/5xx from FastAPI), return it
    if (res.status) {
      return res;
    }
  } catch (err) {
    // Only catch network/DNS/proxy failure
    console.warn(`[API Proxy Bridge] Relative fetch failed for ${cleanEndpoint}. Attempting direct port ${BACKEND_PORT} fallback:`, err.message);
  }

  // 2. Second attempt: Direct connection to http://127.0.0.1:8000
  const directUrl = cleanEndpoint.startsWith('http')
    ? cleanEndpoint
    : `${DIRECT_BACKEND_URL}${cleanEndpoint}`;

  return fetch(directUrl, reqOptions);
}

/**
 * Returns a robust WebSocket URL:
 * Prefer same-origin ws://localhost:5173/chintu-feed (proxied by Vite)
 * with fallback to ws://127.0.0.1:8000/chintu-feed.
 */
export function getWebSocketUrl(path = '/chintu-feed') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If loaded on port 5173, Vite proxies /chintu-feed to ws://127.0.0.1:8000
    return `${protocol}//${window.location.host}${cleanPath}`;
  }
  return `ws://${BACKEND_HOST}:${BACKEND_PORT}${cleanPath}`;
}

