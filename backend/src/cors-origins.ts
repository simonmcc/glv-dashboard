/**
 * Allowed browser origins for the proxy.
 *
 * `CORS_ORIGIN` holds the single production dashboard origin. Firebase Hosting
 * preview channels get a generated hostname per PR
 * (https://glv-dashboard--pr123-preview-ab12cd34.web.app), so they are matched
 * by glob patterns in `CORS_PREVIEW_ORIGIN_PATTERNS` instead of being listed.
 *
 * Patterns are separated by ';' rather than ',' because gcloud's
 * `--set-env-vars` splits on commas.
 */

const PATTERN_SEPARATOR = ';';

/** Escape regex metacharacters, then expand '*' to "any run of non-dot, non-slash characters". */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.split('\\*').join('[^./]*')}$`);
}

function parsePatterns(raw: string | undefined): RegExp[] {
  if (!raw) return [];
  return raw
    .split(PATTERN_SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(globToRegExp);
}

/**
 * Build an origin matcher from the current environment.
 *
 * With no `CORS_ORIGIN` set, falls back to the local dev origin (unchanged
 * behaviour). Requests without an `Origin` header (curl, server-to-server,
 * same-origin navigations) are allowed — CORS only governs browser origins.
 */
export function createOriginMatcher(env: NodeJS.ProcessEnv = process.env) {
  const allowedOrigin = env.CORS_ORIGIN || 'http://localhost:5173';
  const previewPatterns = parsePatterns(env.CORS_PREVIEW_ORIGIN_PATTERNS);

  return function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true;
    if (origin === allowedOrigin) return true;
    return previewPatterns.some((re) => re.test(origin));
  };
}

/** Human-readable summary of the configured origins, for startup logging. */
export function describeAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string {
  const allowedOrigin = env.CORS_ORIGIN || 'http://localhost:5173';
  const patterns = env.CORS_PREVIEW_ORIGIN_PATTERNS;
  return patterns ? `${allowedOrigin} (+ previews: ${patterns})` : allowedOrigin;
}
