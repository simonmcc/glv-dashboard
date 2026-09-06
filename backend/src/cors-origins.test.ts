import { describe, it, expect } from 'vitest';
import { createOriginMatcher, describeAllowedOrigins } from './cors-origins.js';

const PROD = 'https://glv-dashboard.web.app';
const PREVIEW_PATTERN = 'https://glv-dashboard--*.web.app';

describe('createOriginMatcher', () => {
  it('defaults to the local dev origin when CORS_ORIGIN is unset', () => {
    const isAllowed = createOriginMatcher({});
    expect(isAllowed('http://localhost:5173')).toBe(true);
    expect(isAllowed('https://evil.example.com')).toBe(false);
  });

  it('allows the configured production origin', () => {
    const isAllowed = createOriginMatcher({ CORS_ORIGIN: PROD });
    expect(isAllowed(PROD)).toBe(true);
    expect(isAllowed('https://glv-dashboard.web.app.evil.com')).toBe(false);
  });

  it('allows requests with no Origin header (non-browser callers)', () => {
    const isAllowed = createOriginMatcher({ CORS_ORIGIN: PROD });
    expect(isAllowed(undefined)).toBe(true);
  });

  it('rejects preview origins when no pattern is configured', () => {
    const isAllowed = createOriginMatcher({ CORS_ORIGIN: PROD });
    expect(isAllowed('https://glv-dashboard--pr42-preview-ab12cd34.web.app')).toBe(false);
  });

  it('allows Firebase preview channel origins matching the pattern', () => {
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: PREVIEW_PATTERN,
    });
    expect(isAllowed('https://glv-dashboard--pr42-preview-ab12cd34.web.app')).toBe(true);
    expect(isAllowed('https://glv-dashboard--pr7-preview-00000000.web.app')).toBe(true);
  });

  it('does not let the wildcard span dots or slashes', () => {
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: PREVIEW_PATTERN,
    });
    // A wildcard that spanned '.' would let an attacker-controlled host through
    expect(isAllowed('https://glv-dashboard--x.attacker.com/.web.app')).toBe(false);
    expect(isAllowed('https://glv-dashboard--evil.attacker.web.app')).toBe(false);
    expect(isAllowed('http://glv-dashboard--pr42.web.app')).toBe(false);
  });

  it('supports several patterns separated by semicolons', () => {
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: `${PREVIEW_PATTERN}; https://glv-dashboard--*.firebaseapp.com`,
    });
    expect(isAllowed('https://glv-dashboard--pr1-preview-aaaaaaaa.web.app')).toBe(true);
    expect(isAllowed('https://glv-dashboard--pr1-preview-aaaaaaaa.firebaseapp.com')).toBe(true);
    expect(isAllowed('https://other--pr1.web.app')).toBe(false);
  });
});

describe('describeAllowedOrigins', () => {
  it('reports just the origin when no preview patterns are set', () => {
    expect(describeAllowedOrigins({ CORS_ORIGIN: PROD })).toBe(PROD);
  });

  it('includes the preview patterns when configured', () => {
    expect(
      describeAllowedOrigins({ CORS_ORIGIN: PROD, CORS_PREVIEW_ORIGIN_PATTERNS: PREVIEW_PATTERN }),
    ).toBe(`${PROD} (+ previews: ${PREVIEW_PATTERN})`);
  });
});
