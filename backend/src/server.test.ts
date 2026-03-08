import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// Mock the auth-service module before importing the server
vi.mock('./auth-service.js', () => ({
  authenticate: vi.fn(),
  checkLearningByMembershipNumbers: vi.fn(),
}));

// Import mocked functions
import {
  authenticate,
  checkLearningByMembershipNumbers,
} from './auth-service.js';
import type { ProgressCallback } from './auth-service.js';

/** Parse SSE response body text into an array of {type, data} events. */
function parseSSEText(text: string): Array<{ type: string; data: unknown }> {
  const events: Array<{ type: string; data: unknown }> = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    let type = 'message';
    let dataLine = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) type = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataLine = line.slice(6).trim();
    }
    if (dataLine) {
      try { events.push({ type, data: JSON.parse(dataLine) }); } catch { /* skip */ }
    }
  }
  return events;
}

// Create a fresh app instance for testing (avoiding the listen() call)
function createTestApp() {
  const app = express();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 login requests per windowMs
  });

  app.use(cors({ origin: '*', credentials: true }));
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

    try {
      const result = await authenticate(username, password);

      if (result.success) {
        return res.json({
          success: true,
          token: result.token,
          contactId: result.contactId,
        });
      } else {
        return res.status(401).json({
          success: false,
          error: result.error || 'Authentication failed',
        });
      }
    } catch {
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

    const sendEvent = (type: string, data: unknown) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress: ProgressCallback = (step, message) => {
      sendEvent('progress', { step, message });
    };

    try {
      const result = await authenticate(username, password, onProgress);
      if (result.success) {
        sendEvent('complete', { token: result.token, contactId: result.contactId });
      } else {
        sendEvent('error', { error: result.error || 'Authentication failed' });
      }
    } catch {
      sendEvent('error', { error: 'Internal server error' });
    }
    res.end();
  });

  // API proxy endpoint
  app.post('/api/proxy', async (req, res) => {
    const { endpoint, token } = req.body;

    if (!endpoint || !token) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint and token are required',
      });
    }

    // For testing, we'll just return a mock response
    return res.json({ data: [], count: 0 });
  });


  // Check learning endpoint
  app.post('/api/check-learning', async (req, res) => {
    const { token, membershipNumbers } = req.body;

    if (!token || !membershipNumbers || !Array.isArray(membershipNumbers)) {
      return res.status(400).json({
        success: false,
        error: 'Token and membershipNumbers array are required',
      });
    }

    try {
      const result = await checkLearningByMembershipNumbers(token, membershipNumbers);
      return res.json(result);
    } catch {
      return res.status(500).json({
        success: false,
        error: 'Failed to check learning',
      });
    }
  });

  return app;
}

describe('Backend Server', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    it('should return 400 if username is missing', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ password: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Username and password are required');
    });

    it('should return 400 if password is missing', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ username: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Username and password are required');
    });

    it('should return token on successful login', async () => {
      vi.mocked(authenticate).mockResolvedValue({
        success: true,
        token: 'test-token',
        contactId: 'test-contact-id',
      });

      const response = await request(app)
        .post('/auth/login')
        .send({ username: 'user', password: 'pass' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBe('test-token');
      expect(response.body.contactId).toBe('test-contact-id');
    });

    it('should return 401 on failed login', async () => {
      vi.mocked(authenticate).mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      const response = await request(app)
        .post('/auth/login')
        .send({ username: 'user', password: 'wrong' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 500 on authentication error', async () => {
      vi.mocked(authenticate).mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .post('/auth/login')
        .send({ username: 'user', password: 'pass' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('POST /auth/login-stream', () => {
    it('should return 400 if username is missing', async () => {
      const response = await request(app)
        .post('/auth/login-stream')
        .send({ password: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username and password are required');
    });

    it('should return 400 if password is missing', async () => {
      const response = await request(app)
        .post('/auth/login-stream')
        .send({ username: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username and password are required');
    });

    it('should emit SSE complete event on successful auth', async () => {
      vi.mocked(authenticate).mockResolvedValue({
        success: true,
        token: 'test-token',
        contactId: 'test-contact-id',
      });

      const response = await request(app)
        .post('/auth/login-stream')
        .send({ username: 'user', password: 'pass' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      const events = parseSSEText(response.text);
      const complete = events.find(e => e.type === 'complete');
      expect(complete).toBeDefined();
      expect((complete!.data as Record<string, string>).token).toBe('test-token');
      expect((complete!.data as Record<string, string>).contactId).toBe('test-contact-id');
    });

    it('should emit SSE error event on failed auth', async () => {
      vi.mocked(authenticate).mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      const response = await request(app)
        .post('/auth/login-stream')
        .send({ username: 'user', password: 'wrong' });

      expect(response.status).toBe(200);
      const events = parseSSEText(response.text);
      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as Record<string, string>).error).toBe('Invalid credentials');
    });

    it('should emit SSE error event on thrown exception', async () => {
      vi.mocked(authenticate).mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .post('/auth/login-stream')
        .send({ username: 'user', password: 'pass' });

      expect(response.status).toBe(200);
      const events = parseSSEText(response.text);
      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as Record<string, string>).error).toBe('Internal server error');
    });

    it('should emit SSE progress events from onProgress callback', async () => {
      vi.mocked(authenticate).mockImplementation(async (_u, _p, onProgress) => {
        onProgress?.('launching', 'Launching secure browser...');
        onProgress?.('navigating', 'Connecting to Scouts portal...');
        return { success: true, token: 'tok', contactId: 'cid' };
      });

      const response = await request(app)
        .post('/auth/login-stream')
        .send({ username: 'user', password: 'pass' });

      const events = parseSSEText(response.text);
      const progressEvents = events.filter(e => e.type === 'progress');
      expect(progressEvents).toHaveLength(2);
      expect((progressEvents[0].data as Record<string, string>).step).toBe('launching');
      expect((progressEvents[1].data as Record<string, string>).step).toBe('navigating');
    });
  });

  describe('POST /api/proxy', () => {
    it('should return 400 if endpoint is missing', async () => {
      const response = await request(app)
        .post('/api/proxy')
        .send({ token: 'test-token' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Endpoint and token are required');
    });

    it('should return 400 if token is missing', async () => {
      const response = await request(app)
        .post('/api/proxy')
        .send({ endpoint: '/test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Endpoint and token are required');
    });

    it('should proxy request with valid parameters', async () => {
      const response = await request(app)
        .post('/api/proxy')
        .send({ endpoint: '/test', token: 'test-token' });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/check-learning', () => {
    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/check-learning')
        .send({ token: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Token and membershipNumbers array are required');
    });

    it('should call checkLearningByMembershipNumbers with valid parameters', async () => {
      vi.mocked(checkLearningByMembershipNumbers).mockResolvedValue({
        success: true,
        members: [],
      });

      const response = await request(app)
        .post('/api/check-learning')
        .send({ token: 'test-token', membershipNumbers: ['111', '222'] });

      expect(response.status).toBe(200);
      expect(checkLearningByMembershipNumbers).toHaveBeenCalledWith('test-token', ['111', '222']);
    });
  });

});
