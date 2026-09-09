import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  requestContext,
  runWithLabels,
  addLabels,
  currentLabels,
  sessionIdFromToken,
  sanitizeClientLabel,
} from './request-context.js';

describe('sessionIdFromToken', () => {
  it('is stable for the same token', () => {
    expect(sessionIdFromToken('abc')).toBe(sessionIdFromToken('abc'));
  });

  it('differs between tokens', () => {
    expect(sessionIdFromToken('abc')).not.toBe(sessionIdFromToken('abd'));
  });

  it('returns a 12-char hex id', () => {
    expect(sessionIdFromToken('a-token')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('does not leak the token', () => {
    const token = 'super-secret-bearer-token';
    expect(sessionIdFromToken(token)).not.toContain('secret');
  });

  it('returns undefined for missing or non-string tokens', () => {
    expect(sessionIdFromToken(undefined)).toBeUndefined();
    expect(sessionIdFromToken('')).toBeUndefined();
    expect(sessionIdFromToken(123)).toBeUndefined();
  });
});

describe('sanitizeClientLabel', () => {
  it('accepts opaque ids', () => {
    expect(sanitizeClientLabel('a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6');
    expect(sanitizeClientLabel('20260909-1a2b3c4')).toBe('20260909-1a2b3c4');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeClientLabel('  abc  ')).toBe('abc');
  });

  it('rejects values that could poison log output', () => {
    expect(sanitizeClientLabel('has space')).toBeUndefined();
    expect(sanitizeClientLabel('new\nline')).toBeUndefined();
    expect(sanitizeClientLabel('{"json":true}')).toBeUndefined();
    expect(sanitizeClientLabel('x'.repeat(65))).toBeUndefined();
    expect(sanitizeClientLabel('')).toBeUndefined();
    expect(sanitizeClientLabel(undefined)).toBeUndefined();
  });
});

describe('request label context', () => {
  it('is undefined outside a request', () => {
    expect(currentLabels()).toBeUndefined();
  });

  it('exposes labels inside the context', () => {
    runWithLabels({ client: 'abc' }, () => {
      expect(currentLabels()).toEqual({ client: 'abc' });
    });
  });

  it('merges labels added partway through', () => {
    runWithLabels({ client: 'abc' }, () => {
      addLabels({ session: 'deadbeef' });
      expect(currentLabels()).toEqual({ client: 'abc', session: 'deadbeef' });
    });
  });

  it('survives async boundaries', async () => {
    await runWithLabels({ client: 'abc' }, async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      addLabels({ session: 'xyz' });
      await new Promise(resolve => setTimeout(resolve, 1));
      expect(currentLabels()).toEqual({ client: 'abc', session: 'xyz' });
    });
  });

  it('keeps concurrent requests isolated', async () => {
    const seen: Array<string | undefined> = [];
    const run = (client: string, delay: number) =>
      runWithLabels({ client }, async () => {
        await new Promise(resolve => setTimeout(resolve, delay));
        seen.push(currentLabels()?.client);
      });

    await Promise.all([run('one', 5), run('two', 1)]);
    expect(seen.sort()).toEqual(['one', 'two']);
  });

  it('does not throw when adding labels outside a request', () => {
    expect(() => addLabels({ session: 'x' })).not.toThrow();
    expect(currentLabels()).toBeUndefined();
  });
});

describe('requestContext middleware', () => {
  /** App echoing whatever labels the middleware established for the request. */
  function makeApp() {
    const app = express();
    app.use(requestContext);
    app.get('/probe', (_req, res) => {
      res.json({ labels: currentLabels() ?? null });
    });
    return app;
  }

  it('labels a request from the client headers', async () => {
    const response = await request(makeApp())
      .get('/probe')
      .set('X-GLV-Client-Id', 'browser-1')
      .set('X-GLV-Client-Version', '20260909-abc1234');

    expect(response.body.labels).toEqual({
      client: 'browser-1',
      clientVersion: '20260909-abc1234',
    });
  });

  it('drops headers that fail sanitisation', async () => {
    const response = await request(makeApp())
      .get('/probe')
      .set('X-GLV-Client-Id', 'not a valid id');

    expect(response.body.labels).toEqual({
      client: undefined,
      clientVersion: undefined,
    });
  });

  it('establishes a context even when no headers are sent', async () => {
    const response = await request(makeApp()).get('/probe');
    expect(response.body.labels).not.toBeNull();
  });
});
