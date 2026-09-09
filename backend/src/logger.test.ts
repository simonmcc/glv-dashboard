import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The logger reads K_SERVICE at module load, so each test imports a fresh copy
 * with the environment already set.
 */
async function loadLogger(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return {
    logger: await import('./logger.js'),
    ctx: await import('./request-context.js'),
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('structured Cloud Logging output', () => {
  it('promotes request labels to logging.googleapis.com/labels', async () => {
    const { logger, ctx } = await loadLogger({ K_SERVICE: 'glv-backend' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    ctx.runWithLabels({ session: 'abc123', client: 'browser-1' }, () => {
      logger.log('[Proxy] Request: POST /GetData');
    });

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.severity).toBe('INFO');
    expect(entry['logging.googleapis.com/labels']).toEqual({
      session: 'abc123',
      client: 'browser-1',
    });
  });

  it('omits labels that were never set', async () => {
    const { logger, ctx } = await loadLogger({ K_SERVICE: 'glv-backend' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    ctx.runWithLabels({ session: 'abc123' }, () => {
      logger.log('hello');
    });

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry['logging.googleapis.com/labels']).toEqual({ session: 'abc123' });
  });

  it('emits no labels field outside a request context', async () => {
    const { logger } = await loadLogger({ K_SERVICE: 'glv-backend' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.log('[Server] starting');

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry).not.toHaveProperty('logging.googleapis.com/labels');
  });

  it('labels error entries too', async () => {
    const { logger, ctx } = await loadLogger({ K_SERVICE: 'glv-backend' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ctx.runWithLabels({ session: 'abc123' }, () => {
      logger.logError('[Proxy] boom');
    });

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.severity).toBe('ERROR');
    expect(entry['logging.googleapis.com/labels']).toEqual({ session: 'abc123' });
  });
});

describe('local output', () => {
  it('prefixes lines with the session id', async () => {
    const { logger, ctx } = await loadLogger({ K_SERVICE: undefined });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    ctx.runWithLabels({ session: 'abc123' }, () => {
      logger.log('hello');
    });

    expect(spy.mock.calls[0][0]).toContain('[abc123] hello');
  });

  it('has no prefix outside a request context', async () => {
    const { logger } = await loadLogger({ K_SERVICE: undefined });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.log('hello');

    expect(spy.mock.calls[0][0]).not.toContain('[');
  });
});
