import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express, { Request, Response } from 'express';
import { AngelOrderExecutionAdapter } from '../src/utils/angelOrderAdapter';

describe('CHINTU AI — ANGEL ONE SMARTAPI REDIRECT & CALLBACK ENDPOINT SUITE', () => {
  let server: http.Server;
  let testPort: number;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Duplicate exact handler logic from server.ts for isolated unit verification
    const handleAngelCallback = (req: Request, res: Response) => {
      const isPost = req.method === 'POST';
      const params: Record<string, any> = isPost ? (req.body || {}) : (req.query || {});

      const authToken = typeof params.auth_token === 'string'
        ? params.auth_token.trim()
        : typeof params.jwtToken === 'string'
          ? params.jwtToken.trim()
          : typeof params.token === 'string'
            ? params.token.trim()
            : '';

      const errorParam = typeof params.error === 'string'
        ? params.error.trim().slice(0, 256)
        : typeof params.error_description === 'string'
          ? params.error_description.trim().slice(0, 256)
          : '';

      const isJsonClient = req.headers.accept?.includes('application/json') ||
        req.headers['content-type']?.includes('application/json') ||
        params.format === 'json';

      if (isJsonClient) {
        return res.status(200).json({
          status: errorParam ? 'error' : 'success',
          endpoint: '/api/broker/angel/callback',
          registered_broker: 'ANGEL_ONE_SMARTAPI',
          handshake_received: true,
          has_token: Boolean(authToken),
          message: errorParam
            ? `Angel One callback error: ${errorParam}`
            : 'Angel One SmartAPI redirect received and verified successfully.',
          timestamp: new Date().toISOString()
        });
      }

      const isError = Boolean(errorParam);
      const title = isError ? 'Angel One Authorization Incomplete' : 'Angel One Authorization Successful';
      const html = `<!DOCTYPE html><html><body><h1>${title}</h1><p>Endpoint: /api/broker/angel/callback</p></body></html>`;
      res.status(200).send(html);
    };

    app.get('/api/broker/angel/callback', handleAngelCallback);
    app.post('/api/broker/angel/callback', handleAngelCallback);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        testPort = addr.port;
        baseUrl = `http://127.0.0.1:${testPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. should respond with 200 OK and HTML on standard GET browser redirect', async () => {
    const res = await fetch(`${baseUrl}/api/broker/angel/callback`, {
      headers: { Accept: 'text/html' }
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    const body = await res.text();
    assert.match(body, /Angel One Authorization Successful/);
    assert.match(body, /\/api\/broker\/angel\/callback/);
  });

  it('2. should respond with 200 OK and JSON when Accept: application/json is sent', async () => {
    const res = await fetch(`${baseUrl}/api/broker/angel/callback`, {
      headers: { Accept: 'application/json' }
    });
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.status, 'success');
    assert.equal(json.endpoint, '/api/broker/angel/callback');
    assert.equal(json.registered_broker, 'ANGEL_ONE_SMARTAPI');
    assert.equal(json.handshake_received, true);
    assert.equal(json.has_token, false);
  });

  it('3. should securely acknowledge incoming auth_token without exposing it in the response', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive_payload_secret.sig';
    const res = await fetch(`${baseUrl}/api/broker/angel/callback?auth_token=${encodeURIComponent(fakeToken)}`, {
      headers: { Accept: 'application/json' }
    });
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.status, 'success');
    assert.equal(json.has_token, true);
    // Invariant: The token value must NOT be echoed in JSON payload
    const bodyStr = JSON.stringify(json);
    assert.equal(bodyStr.includes(fakeToken), false, 'Raw auth token must not be exposed in response body');
  });

  it('4. should process POST callback payload successfully', async () => {
    const res = await fetch(`${baseUrl}/api/broker/angel/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        status: 'success',
        auth_token: 'secret_token_123',
        feed_token: 'feed_token_456'
      })
    });
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.status, 'success');
    assert.equal(json.has_token, true);
    assert.equal(JSON.stringify(json).includes('secret_token_123'), false);
  });

  it('5. should handle error status gracefully without 500 crashes', async () => {
    const res = await fetch(`${baseUrl}/api/broker/angel/callback?error=user_cancelled&error_description=User+aborted+login`, {
      headers: { Accept: 'application/json' }
    });
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.status, 'error');
    assert.match(json.message, /user_cancelled/);
  });

  it('6. Invariant: Fail-closed live trading remains permanently disabled', () => {
    assert.equal(
      AngelOrderExecutionAdapter.LIVE_TRADING_ELIGIBLE,
      false,
      'LIVE_TRADING_ELIGIBLE must be compile-time locked to false'
    );
  });
});

