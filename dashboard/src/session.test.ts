import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SESSION_KEY, SESSION_MAX_AGE_MS, loadSession, saveSession, clearSession } from './session';

describe('session', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('loadSession', () => {
    it('returns null when nothing is stored', () => {
      expect(loadSession()).toBeNull();
    });

    it('returns the session when fresh and valid', () => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token: 'tok',
        contactId: 'cid',
        username: 'user@test.com',
        loginAt: Date.now(),
      }));
      expect(loadSession()).toEqual({ token: 'tok', contactId: 'cid', username: 'user@test.com' });
    });

    it('returns null and clears storage when session is older than SESSION_MAX_AGE_MS', () => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token: 'tok',
        contactId: 'cid',
        loginAt: Date.now() - SESSION_MAX_AGE_MS - 1,
      }));
      expect(loadSession()).toBeNull();
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('returns the session when exactly at SESSION_MAX_AGE_MS boundary (not yet expired)', () => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token: 'tok',
        contactId: 'cid',
        loginAt: Date.now() - SESSION_MAX_AGE_MS + 1000,
      }));
      expect(loadSession()).not.toBeNull();
    });

    it('returns null when loginAt is missing (old format without timestamp)', () => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token: 'tok',
        contactId: 'cid',
        // no loginAt
      }));
      expect(loadSession()).toBeNull();
    });

    it('returns null when token is empty string', () => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token: '',
        contactId: 'cid',
        loginAt: Date.now(),
      }));
      expect(loadSession()).toBeNull();
    });

    it('returns null and does not throw on malformed JSON', () => {
      localStorage.setItem(SESSION_KEY, '{{not json}}');
      expect(loadSession()).toBeNull();
    });
  });

  describe('saveSession', () => {
    it('stores token, contactId, username, and a loginAt timestamp', () => {
      const before = Date.now();
      saveSession('my-token', 'my-contact', 'me@test.com');
      const after = Date.now();

      const stored = JSON.parse(localStorage.getItem(SESSION_KEY)!);
      expect(stored.token).toBe('my-token');
      expect(stored.contactId).toBe('my-contact');
      expect(stored.username).toBe('me@test.com');
      expect(stored.loginAt).toBeGreaterThanOrEqual(before);
      expect(stored.loginAt).toBeLessThanOrEqual(after);
    });

    it('stores without username when omitted', () => {
      saveSession('tok', 'cid');
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY)!);
      expect(stored.username).toBeUndefined();
    });
  });

  describe('clearSession', () => {
    it('removes the session from localStorage', () => {
      saveSession('tok', 'cid');
      expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
      clearSession();
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('does not throw when nothing is stored', () => {
      expect(() => clearSession()).not.toThrow();
    });
  });
});
