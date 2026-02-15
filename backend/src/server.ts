/**
 * Backend Server for GLV Dashboard
 *
 * Provides authentication proxy and API endpoints.
 * Can be run locally or deployed to AWS Lambda.
 */

import './tracing.js';
import express from 'express';
import cors from 'cors';
import { authenticate, checkLearningByMembershipNumbers } from './auth-service.js';
import { getMockAuth, getMockProxyResponse, getMockLearningDetails } from './mock-data.js';
import { log, logError, logDebug } from './logger.js';

const app = express();
const PORT = process.env.PORT || 3001;
const MOCK_MODE = process.env.MOCK_MODE === 'true';
const rawMockDelay = parseInt(process.env.MOCK_DELAY_MS || '1000', 10);
const MOCK_DELAY_MS = Number.isNaN(rawMockDelay) ? 1000 : rawMockDelay;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
    });
  }

  // Mock mode - return mock auth with simulated delay
  if (MOCK_MODE) {
    log(`[Auth] Mock login for: ${username} (${MOCK_DELAY_MS}ms delay)`);
    await delay(MOCK_DELAY_MS);
    return res.json(getMockAuth());
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

// API proxy endpoint (forwards requests to Scouts API with the provided token)
app.post('/api/proxy', async (req, res) => {
  const { endpoint, method = 'POST', body, token } = req.body;

  // Log high-level metadata only (don't expose sensitive data like membership numbers)
  const bodyMetadata = body ? {
    tableName: body.table || undefined,
    pageSize: body.pageSize || undefined,
    selectFields: body.selectFields?.length || undefined,
    keys: Object.keys(body)
  } : undefined;
  
  log(`[Proxy] Request: ${method} ${endpoint}`, bodyMetadata ? `metadata: ${JSON.stringify(bodyMetadata)}` : '');
  
  // Full body logging only in debug mode (may contain sensitive data)
  logDebug(`[Proxy] Full body:`, JSON.stringify(body));

  if (!endpoint || !token) {
    log('[Proxy] Missing endpoint or token');
    return res.status(400).json({
      success: false,
      error: 'Endpoint and token are required',
    });
  }

  // Mock mode - return mock data based on table name
  if (MOCK_MODE) {
    const tableName = body?.table;
    log(`[Proxy] Mock mode - returning mock data for table: ${tableName} (${MOCK_DELAY_MS}ms delay)`);
    await delay(MOCK_DELAY_MS);
    return res.json(getMockProxyResponse(tableName));
  }

  // Log token details for debugging
  log(`[Proxy] Token length: ${token.length}, starts: ${token.substring(0, 20)}..., ends: ...${token.substring(token.length - 20)}`);

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

  // Mock mode - return mock learning details
  if (MOCK_MODE) {
    log(`[Learning] Mock mode - returning mock data for ${membershipNumbers.length} members (${MOCK_DELAY_MS}ms delay)`);
    await delay(MOCK_DELAY_MS);
    return res.json(getMockLearningDetails(membershipNumbers));
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
  if (MOCK_MODE) {
    log(`[Server] MOCK MODE ENABLED - Using mock data with ${MOCK_DELAY_MS}ms delay`);
  }
});

export default app;
