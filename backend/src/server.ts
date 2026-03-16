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
import { authenticate, checkLearningByMembershipNumbers, type ProgressCallback } from './auth-service.js';
import { log, logError, logDebug } from './logger.js';

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

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 login requests per windowMs
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

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

  // Log high-level metadata only (don't expose sensitive data like membership numbers)
  const bodyMetadata = body ? {
    tableName: body.table,
    pageSize: body.pageSize,
    selectFields: body.selectFields?.length,
    keys: Object.keys(body)
  } : undefined;
  
  if (bodyMetadata) {
    log(`[Proxy] Request: ${method} ${endpoint} metadata: ${JSON.stringify(bodyMetadata)}`);
  } else {
    log(`[Proxy] Request: ${method} ${endpoint}`);
  }
  
  // Full body logging only in debug mode (may contain sensitive data)
  logDebug(`[Proxy] Full body:`, JSON.stringify(body));

  if (!endpoint || !token) {
    log('[Proxy] Missing endpoint or token');
    return res.status(400).json({
      success: false,
      error: 'Endpoint and token are required',
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

  const apiUrl = `https://tsa-memportal-prod-fun01.azurewebsites.net/api${endpoint}`;

  try {
    const startTime = Date.now();
    const response = await fetch(apiUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const duration = Date.now() - startTime;
    log(`[Proxy] Response: ${response.status} (${duration}ms)`);

    if (response.status === 401) {
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
      return res.status(500).json({ success: false, error: 'Invalid JSON response from API' });
    }

    log(`[Proxy] Data received:`, {
      hasData: !!data.data,
      dataLength: data.data?.length,
      error: data.error
    });
    return res.json(data);
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

// Start server
app.listen(PORT, () => {
  log(`[Server] GLV Dashboard backend running on http://localhost:${PORT}`);
  log(`[Server] CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
});

export default app;
