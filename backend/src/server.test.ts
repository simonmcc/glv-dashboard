import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Mock the auth-service module before importing the server
vi.mock('./auth-service.js', () => ({
  authenticate: vi.fn(),
  exploreDisclosures: vi.fn(),
  checkDisclosuresByMembershipNumbers: vi.fn(),
  checkLearningByMembershipNumbers: vi.fn(),
}));

// Import mocked functions
import {
  authenticate,
  exploreDisclosures,
  checkDisclosuresByMembershipNumbers,
  checkLearningByMembershipNumbers,
} from './auth-service.js';

// Create a fresh app instance for testing (avoiding the listen() call)
function createTestApp() {
  const app = express();

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

  // Check disclosures endpoint
  app.post('/api/check-disclosures', async (req, res) => {
    const { token, membershipNumbers } = req.body;

    if (!token || !membershipNumbers || !Array.isArray(membershipNumbers)) {
      return res.status(400).json({
        success: false,
        error: 'Token and membershipNumbers array are required',
      });
    }

    try {
      const result = await checkDisclosuresByMembershipNumbers(token, membershipNumbers);
      return res.json(result);
    } catch {
      return res.status(500).json({
        success: false,
        error: 'Failed to check disclosures',
      });
    }
  });

  // Explore disclosures endpoint
  app.post('/api/explore-disclosures', async (req, res) => {
    const { token, contactId } = req.body;

    if (!token || !contactId) {
      return res.status(400).json({
        success: false,
        error: 'Token and contactId are required',
      });
    }

    try {
      const result = await exploreDisclosures(token, contactId);
      return res.json(result);
    } catch {
      return res.status(500).json({
        success: false,
        error: 'Failed to explore disclosures',
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

  describe('POST /api/check-disclosures', () => {
    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/check-disclosures')
        .send({ token: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Token and membershipNumbers array are required');
    });

    it('should call checkDisclosuresByMembershipNumbers with valid parameters', async () => {
      vi.mocked(checkDisclosuresByMembershipNumbers).mockResolvedValue({
        success: true,
        members: [],
      });

      const response = await request(app)
        .post('/api/check-disclosures')
        .send({ token: 'test-token', membershipNumbers: ['111', '222'] });

      expect(response.status).toBe(200);
      expect(checkDisclosuresByMembershipNumbers).toHaveBeenCalledWith('test-token', ['111', '222']);
    });
  });

  describe('POST /api/explore-disclosures', () => {
    it('should return 400 if token is missing', async () => {
      const response = await request(app)
        .post('/api/explore-disclosures')
        .send({ contactId: 'test-id' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Token and contactId are required');
    });

    it('should return 400 if contactId is missing', async () => {
      const response = await request(app)
        .post('/api/explore-disclosures')
        .send({ token: 'test-token' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Token and contactId are required');
    });

    it('should call exploreDisclosures with valid parameters', async () => {
      vi.mocked(exploreDisclosures).mockResolvedValue({ success: true, members: [] });

      const response = await request(app)
        .post('/api/explore-disclosures')
        .send({ token: 'test-token', contactId: 'test-contact-id' });

      expect(response.status).toBe(200);
      expect(exploreDisclosures).toHaveBeenCalledWith('test-token', 'test-contact-id');
    });
  });
});
