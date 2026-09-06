import { describe, it, expect } from 'vitest';
import { createOriginMatcher, describeAllowedOrigins } from './cors-origins.js';

const PROD = 'https://glv-dashboard.web.app';
// The pattern actually deployed: the full Firebase channel shape, hash width pinned
const PREVIEW_PATTERN = 'https://glv-dashboard--pr*-preview-????????.web.app';
// A real preview URL from PR #245
const REAL_PREVIEW = 'https://glv-dashboard--pr245-preview-y6684i4m.web.app';

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
    expect(isAllowed(REAL_PREVIEW)).toBe(false);
  });

  it('allows Firebase preview channel origins matching the pattern', () => {
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: PREVIEW_PATTERN,
    });
    expect(isAllowed(REAL_PREVIEW)).toBe(true);
    expect(isAllowed('https://glv-dashboard--pr42-preview-ab12cd34.web.app')).toBe(true);
    expect(isAllowed('https://glv-dashboard--pr7-preview-00000000.web.app')).toBe(true);
  });

  it("rejects a squatted site ID that only matches the '--' prefix", () => {
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: PREVIEW_PATTERN,
    });
    // '.web.app' hostnames are Firebase site IDs, registrable by anyone, and a
    // site ID may legally contain consecutive hyphens. A loose
    // 'glv-dashboard--*' pattern would have trusted all of these.
    expect(isAllowed('https://glv-dashboard--evil.web.app')).toBe(false);
    expect(isAllowed('https://glv-dashboard--pr245.web.app')).toBe(false);
    expect(isAllowed('https://glv-dashboard--pr245-preview.web.app')).toBe(false);
  });

  it('requires the hash to be exactly eight characters', () => {
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: PREVIEW_PATTERN,
    });
    // Short tails are what a squatter needs: 'glv-dashboard--pr1-preview-x' is
    // 28 characters and so would fit inside the 30-character site ID limit.
    expect(isAllowed('https://glv-dashboard--pr1-preview-x.web.app')).toBe(false);
    expect(isAllowed('https://glv-dashboard--pr1-preview-abcdefg.web.app')).toBe(false);
    expect(isAllowed('https://glv-dashboard--pr1-preview-abcdefghi.web.app')).toBe(false);
    expect(isAllowed('https://glv-dashboard--pr1-preview-abcdefgh.web.app')).toBe(true);
  });

  it('cannot match any hostname short enough to be a registrable site ID', () => {
    // Firebase site IDs are capped at 30 characters. The shortest hostname the
    // deployed pattern accepts is 'glv-dashboard--pr' + '' + '-preview-' + 8
    // characters = 34, so no site ID anyone could register can satisfy it.
    const shortest = 'glv-dashboard--pr-preview-abcdefgh';
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: PREVIEW_PATTERN,
    });
    expect(isAllowed(`https://${shortest}.web.app`)).toBe(true);
    expect(shortest.length).toBe(34);
    expect(shortest.length).toBeGreaterThan(30);
  });

  it('does not let the wildcards span dots or slashes', () => {
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: PREVIEW_PATTERN,
    });
    // A wildcard that spanned '.' would let an attacker-controlled host through
    expect(isAllowed('https://glv-dashboard--pr1.evil.com/-preview-abcdefgh.web.app')).toBe(false);
    expect(isAllowed('https://glv-dashboard--pr1-preview-abcdefg.evil.web.app')).toBe(false);
    expect(isAllowed('https://glv-dashboard--pr1-preview-abc.defg.web.app')).toBe(false);
    // '?' must match a character, not a dot
    expect(isAllowed('http://glv-dashboard--pr245-preview-y6684i4m.web.app')).toBe(false);
  });

  it('supports several patterns separated by semicolons', () => {
    const isAllowed = createOriginMatcher({
      CORS_ORIGIN: PROD,
      CORS_PREVIEW_ORIGIN_PATTERNS: `${PREVIEW_PATTERN}; https://glv-dashboard--pr*-preview-????????.firebaseapp.com`,
    });
    expect(isAllowed('https://glv-dashboard--pr1-preview-aaaaaaaa.web.app')).toBe(true);
    expect(isAllowed('https://glv-dashboard--pr1-preview-aaaaaaaa.firebaseapp.com')).toBe(true);
    expect(isAllowed('https://other--pr1-preview-aaaaaaaa.web.app')).toBe(false);
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
