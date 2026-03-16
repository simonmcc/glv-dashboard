/**
 * Backend Server for GLV Dashboard
 *
 * Provides authentication proxy and API endpoints.
 * Can be run locally or deployed to Google Cloud Run (behind a load balancer/proxy).
 */

import './tracing.js';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { authenticate, checkLearningByMembershipNumbers, type ProgressCallback } from './auth-service.js';
import { forwardTraces } from './traces-proxy.js';
import { log, logError, logDebug } from './logger.js';

const tracer = trace.getTracer('glv-backend-server', '1.0.0');

const app = express();
const PORT = process.env.PORT || 3001;
const DEBUG_LOG_TOKENS = process.env.DEBUG_LOG_TOKENS === 'true';
const TRUST_PROXY_ENABLED =
  process.env.TRUST_PROXY === 'true' || Boolean(process.env.K_SERVICE);

// Only trust proxy headers when we know we're behind a trusted reverse proxy.
// - Cloud Run: K_SERVICE is set and Google load balancer sets X-Forwarded-For
// - Other environments: opt-in via TRUST_PROXY=true
if (TRUST_PROXY_ENABLED) {
  // Trust the first proxy hop so express-rate-limit can identify client IPs correctly.
  app.set('trust proxy', 1);
}

// Allow-list of HTTP methods supported by the proxy
const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Validate and normalize the endpoint path for the Scouts API proxy.
 * Ensures the value is a simple path under /api and prevents path traversal.
 */
function validateProxyEndpoint(endpoint: unknown): string | null {
  if (typeof endpoint !== 'string') {
    return null;
  }

  const trimmed = endpoint.trim();
  if (!trimmed) {
    return null;
  }

  // Disallow full URLs to avoid accidentally letting callers override the host.
  if (/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  // Ensure the endpoint starts with a single leading slash.
  if (!trimmed.startsWith('/')) {
    return null;
  }

  // Basic traversal/hardening: no ".." segments or double slashes
  if (trimmed.includes('..') || trimmed.includes('//')) {
    return null;
  }

  // Restrict to a conservative character set for paths.
  if (!/^\/[A-Za-z0-9/_\-]*$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 login requests per windowMs
});

// Dedicated rate limiter for trace ingestion to protect Cloud Trace costs and backend load
const tracesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // limit each IP to 300 trace requests per minute
});

/**
 * Validate that trace requests originate from the configured frontend origin (when set).
 * If CORS_ORIGIN is not set, this middleware is a no-op and allows all requests.
 */
function validateTraceOrigin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const allowedOrigin = process.env.CORS_ORIGIN;

  // If no CORS_ORIGIN is configured, behave as before and allow all requests
  if (!allowedOrigin) {
    return next();
  }

  const requestOrigin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;

  // Direct origin match
  if (requestOrigin === allowedOrigin) {
    return next();
  }

  // Fallback: compare referer origin (e.g. https://frontend.example.com/path -> https://frontend.example.com)
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.origin === allowedOrigin) {
        return next();
      }
    } catch {
      // Malformed referer header; fall through to rejection
    }
  }

  logDebug(
    '[Traces] Rejected trace request due to invalid origin/referer',
    { origin: requestOrigin, referer },
  );

  return res.status(403).json({ error: 'Forbidden' });
}

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '4mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication endpoint
app.post('/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
    });
  }

  log(`[Auth] Login attempt for: ${username}`);
  const startTime = Date.now();

  try {
    const result = await authenticate(username, password);
    const duration = Date.now() - startTime;

    if (result.success) {
      log(`[Auth] Login successful for ${username} (${duration}ms)`);
      return res.json({
        success: true,
        token: result.token,
        contactId: result.contactId,
      });
    } else {
      log(`[Auth] Login failed for ${username}: ${result.error} (${duration}ms)`);
      return res.status(401).json({
        success: false,
        error: result.error || 'Authentication failed',
      });
    }
  } catch (error) {
    logError(`[Auth] Error for ${username}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// SSE streaming authentication endpoint
app.post('/auth/login-stream', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  const sendEvent = (type: string, data: unknown) => {
    if (!clientDisconnected && !res.writableEnded) {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  const onProgress: ProgressCallback = (step, message) => {
    sendEvent('progress', { step, message });
  };

  log(`[Auth] Login-stream attempt for: ${username}`);
  try {
    const result = await authenticate(username, password, onProgress);
    if (result.success) {
      sendEvent('complete', { token: result.token, contactId: result.contactId });
    } else {
      sendEvent('error', { error: result.error || 'Authentication failed' });
    }
  } catch (error) {
    logError(`[Auth] login-stream error for ${username}:`, error);
    sendEvent('error', { error: 'Internal server error' });
  }
  if (!res.writableEnded) {
    res.end();
  }
});

// API proxy endpoint (forwards requests to Scouts API with the provided token)
app.post('/api/proxy', async (req, res) => {
  const { endpoint, method = 'POST', body, token } = req.body;

  const normalizedMethod = String(method || 'POST').toUpperCase();
  const validatedEndpoint = validateProxyEndpoint(endpoint);

  // Log high-level metadata only (don't expose sensitive data like membership numbers)
  const bodyMetadata = body ? {
    tableName: body.table,
    pageSize: body.pageSize,
    selectFields: body.selectFields?.length,
    keys: Object.keys(body)
  } : undefined;
  
  if (bodyMetadata) {
    log(`[Proxy] Request: ${normalizedMethod} ${endpoint} metadata: ${JSON.stringify(bodyMetadata)}`);
  } else {
    log(`[Proxy] Request: ${normalizedMethod} ${endpoint}`);
  }
  
  // Full body logging only in debug mode (may contain sensitive data)
  logDebug(`[Proxy] Full body:`, JSON.stringify(body));

  if (!validatedEndpoint || !token) {
    log('[Proxy] Missing or invalid endpoint, or missing token');
    return res.status(400).json({
      success: false,
      error: 'Valid endpoint and token are required',
    });
  }

  if (!ALLOWED_PROXY_METHODS.has(normalizedMethod)) {
    log(`[Proxy] Disallowed HTTP method: ${normalizedMethod}`);
    return res.status(400).json({
      success: false,
      error: 'HTTP method not allowed',
    });
  }

  // Log token length (or partial token if debug mode enabled)
  if (DEBUG_LOG_TOKENS) {
    if (token.length >= 40) {
      log(`[Proxy] Token length: ${token.length}, starts: ${token.substring(0, 20)}..., ends: ...${token.substring(token.length - 20)}`);
    } else {
      log(`[Proxy] Token length: ${token.length} (too short to show partial)`);
    }
  } else {
    log(`[Proxy] Token length: ${token.length}`);
  }

  const apiUrl = `https://tsa-memportal-prod-fun01.azurewebsites.net/api${validatedEndpoint}`;

  try {
    return await tracer.startActiveSpan('scouts.api.proxy', async (proxySpan) => {
      proxySpan.setAttribute('scouts.api.endpoint', validatedEndpoint);
      if (body?.table) proxySpan.setAttribute('scouts.api.table', body.table);

      try {
        const startTime = Date.now();
        const response = await fetch(apiUrl, {
          method: normalizedMethod,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json, text/plain, */*',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        const duration = Date.now() - startTime;
        log(`[Proxy] Response: ${response.status} (${duration}ms)`);
        proxySpan.setAttribute('http.response.status_code', response.status);

        if (response.status === 401) {
          proxySpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Token expired' });
          log('[Proxy] Token expired');
          return res.status(401).json({
            success: false,
            error: 'Token expired',
          });
        }

        const text = await response.text();
        log(`[Proxy] Raw response (first 500 chars):`, text.substring(0, 500));

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          logError('[Proxy] Failed to parse response as JSON');
          proxySpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid JSON response from API' });
          return res.status(500).json({ success: false, error: 'Invalid JSON response from API' });
        }

        log(`[Proxy] Data received:`, {
          hasData: !!data.data,
          dataLength: data.data?.length,
          error: data.error
        });
        proxySpan.setAttribute('response.record_count', data.data?.length ?? 0);
        proxySpan.setStatus({ code: SpanStatusCode.OK });
        return res.json(data);
      } finally {
        proxySpan.end();
      }
    });
  } catch (error) {
    logError('[Proxy] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to proxy request',
    });
  }
});

// Check learning by membership numbers - uses GetLmsDetailsAsync for accurate expiry dates
app.post('/api/check-learning', async (req, res) => {
  const { token, membershipNumbers } = req.body;

  if (!token || !membershipNumbers || !Array.isArray(membershipNumbers)) {
    return res.status(400).json({
      success: false,
      error: 'Token and membershipNumbers array are required',
    });
  }

  log(`[Learning] Checking ${membershipNumbers.length} membership numbers`);

  try {
    const result = await checkLearningByMembershipNumbers(token, membershipNumbers);
    return res.json(result);
  } catch (error) {
    logError('[Learning] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check learning',
    });
  }
});

// OTLP trace proxy - receives browser spans and forwards to Cloud Trace (GCP) or local collector
app.post('/v1/traces', tracesLimiter, validateTraceOrigin, async (req, res) => {
  try {
    await forwardTraces(req.body);
    res.status(200).json({});
  } catch (error) {
    logError('[Traces] Failed to forward spans:', error);
    res.status(500).json({ error: 'Failed to forward traces' });
  }
});

// Start server
app.listen(PORT, () => {
  log(`[Server] GLV Dashboard backend running on http://localhost:${PORT}`);
  log(`[Server] CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
});

export default app;
