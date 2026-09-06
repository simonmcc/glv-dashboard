/**
 * Allowed browser origins for the proxy.
 *
 * `CORS_ORIGIN` holds the single production dashboard origin. Firebase Hosting
 * preview channels get a generated hostname per PR
 * (https://glv-dashboard--pr245-preview-y6684i4m.web.app), so they are matched
 * by glob patterns in `CORS_PREVIEW_ORIGIN_PATTERNS` instead of being listed.
 *
 * Patterns are separated by ';' rather than ',' because gcloud's
 * `--set-env-vars` splits on commas.
 *
 * Why the patterns are written tightly
 * ------------------------------------
 * A hostname under `.web.app` is a Firebase Hosting site ID, and site IDs are
 * globally unique but registrable by anyone. A loose pattern such as
 * `https://glv-dashboard--*.web.app` would therefore be satisfied by a site ID
 * of `glv-dashboard--evil`, which the documented rules appear to permit: a site
 * ID need only be a valid hostname label (consecutive hyphens are legal in one)
 * of 30 characters or fewer.
 *
 * Site IDs being capped at 30 characters is what makes this safe to close.
 * Pinning the trailing hash to its real width ('?' matches exactly one
 * character) means the shortest hostname the pattern can match is
 *
 *   glv-dashboard--pr        17
 *   *                       + 0   (a '*' may match nothing)
 *   -preview-               + 9
 *   ????????                + 8
 *                           ----
 *                            34   > the 30-character site ID limit
 *
 * so no registrable site ID can match a preview-shaped pattern. The wildcards
 * still cannot span '.' or '/', so the match stays within one hostname label.
 */

const PATTERN_SEPARATOR = ';';

/**
 * Escape regex metacharacters, then expand the two wildcards:
 *   '*' -> any run (possibly empty) of non-dot, non-slash characters
 *   '?' -> exactly one non-dot, non-slash character
 * Neither can cross a '.' or '/', so a match never escapes its hostname label.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expanded = escaped
    .split('\\*')
    .join('[^./]*')
    .split('\\?')
    .join('[^./]');
  return new RegExp(`^${expanded}$`);
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
