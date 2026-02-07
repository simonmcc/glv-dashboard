/**
 * Backend Server for GLV Dashboard
 *
 * Provides authentication proxy and API endpoints.
 * Can be run locally or deployed to AWS Lambda.
 */

import './tracing.js';
import express from 'express';
import cors from 'cors';
import { authenticate, exploreDisclosures, scrapeDisclosures, checkDisclosuresByMembershipNumbers, checkLearningByMembershipNumbers } from './auth-service.js';

const app = express();
const PORT = process.env.PORT || 3001;

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

  console.log(`[Auth] Login attempt for: ${username}`);
  const startTime = Date.now();

  try {
    const result = await authenticate(username, password);
    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`[Auth] Login successful for ${username} (${duration}ms)`);
      return res.json({
        success: true,
        token: result.token,
        contactId: result.contactId,
      });
    } else {
      console.log(`[Auth] Login failed for ${username}: ${result.error} (${duration}ms)`);
      return res.status(401).json({
        success: false,
        error: result.error || 'Authentication failed',
      });
    }
  } catch (error) {
    console.error(`[Auth] Error for ${username}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// API proxy endpoint (forwards requests to Scouts API with the provided token)
app.post('/api/proxy', async (req, res) => {
  const { endpoint, method = 'POST', body, token } = req.body;

  console.log(`[Proxy] Request: ${method} ${endpoint}`);
  if (body) {
    console.log(`[Proxy] Full body:`, JSON.stringify(body));
  }

  if (!endpoint || !token) {
    console.log('[Proxy] Missing endpoint or token');
    return res.status(400).json({
      success: false,
      error: 'Endpoint and token are required',
    });
  }

  // Log token details for debugging
  console.log(`[Proxy] Token length: ${token.length}, starts: ${token.substring(0, 20)}..., ends: ...${token.substring(token.length - 20)}`);

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
    console.log(`[Proxy] Response: ${response.status} (${duration}ms)`);

    if (response.status === 401) {
      console.log('[Proxy] Token expired');
      return res.status(401).json({
        success: false,
        error: 'Token expired',
      });
    }

    const text = await response.text();
    console.log(`[Proxy] Raw response (first 500 chars):`, text.substring(0, 500));

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[Proxy] Failed to parse response as JSON');
      return res.status(500).json({ success: false, error: 'Invalid JSON response from API' });
    }

    console.log(`[Proxy] Data received:`, {
      hasData: !!data.data,
      dataLength: data.data?.length,
      error: data.error
    });
    return res.json(data);
  } catch (error) {
    console.error('[Proxy] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to proxy request',
    });
  }
});

// Scrape disclosures endpoint - uses Playwright to navigate to member pages
app.post('/api/scrape-disclosures', async (req, res) => {
  const { username, password, memberContactIds } = req.body;

  if (!username || !password || !memberContactIds || !Array.isArray(memberContactIds)) {
    return res.status(400).json({
      success: false,
      error: 'Username, password, and memberContactIds array are required',
    });
  }

  console.log(`[Scrape] Starting scrape for ${memberContactIds.length} members`);

  try {
    const result = await scrapeDisclosures(username, password, memberContactIds);
    return res.json(result);
  } catch (error) {
    console.error('[Scrape] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to scrape disclosures',
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

  console.log(`[Learning] Checking ${membershipNumbers.length} membership numbers`);

  try {
    const result = await checkLearningByMembershipNumbers(token, membershipNumbers);
    return res.json(result);
  } catch (error) {
    console.error('[Learning] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check learning',
    });
  }
});

// Check disclosures by membership numbers - the preferred method
app.post('/api/check-disclosures', async (req, res) => {
  const { token, membershipNumbers } = req.body;

  if (!token || !membershipNumbers || !Array.isArray(membershipNumbers)) {
    return res.status(400).json({
      success: false,
      error: 'Token and membershipNumbers array are required',
    });
  }

  console.log(`[Disclosures] Checking ${membershipNumbers.length} membership numbers`);

  try {
    const result = await checkDisclosuresByMembershipNumbers(token, membershipNumbers);
    return res.json(result);
  } catch (error) {
    console.error('[Disclosures] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check disclosures',
    });
  }
});

// Explore disclosures endpoint - discovers member contact IDs and fetches disclosure details
app.post('/api/explore-disclosures', async (req, res) => {
  const { token, contactId } = req.body;

  if (!token || !contactId) {
    return res.status(400).json({
      success: false,
      error: 'Token and contactId are required',
    });
  }

  console.log('[Explore] Starting disclosure exploration...');

  try {
    const result = await exploreDisclosures(token, contactId);
    return res.json(result);
  } catch (error) {
    console.error('[Explore] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to explore disclosures',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] GLV Dashboard backend running on http://localhost:${PORT}`);
  console.log(`[Server] CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
});

export default app;
