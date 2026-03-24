/** localStorage key for persisting authentication state */
export const SESSION_KEY = 'glv-dashboard-session';

/**
 * Sessions older than this are treated as expired and discarded on load.
 * The Scouts Bearer token lifetime isn't documented, but empirically lasts
 * several hours. 8 hours covers a typical working session while ensuring
 * users aren't silently operating with a stale token.
 */
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

/** Load session from localStorage. Returns null if missing, malformed, or older than SESSION_MAX_AGE_MS. */
export function loadSession(): { token: string; contactId: string; username?: string } | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const { token, contactId, username, loginAt } = JSON.parse(stored);
      if (token) {
        // Reject sessions with no timestamp (old format) or that are too old
        if (!loginAt || Date.now() - loginAt > SESSION_MAX_AGE_MS) {
          localStorage.removeItem(SESSION_KEY);
          return null;
        }
        return { token, contactId, username };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/** Save session to localStorage with the current timestamp. */
export function saveSession(token: string, contactId: string, username?: string): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, contactId, username, loginAt: Date.now() }));
}

/** Clear session from localStorage. */
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** localStorage key for persisting credential hash (enables fast-path login). */
const CREDENTIALS_KEY = 'glv-dashboard-credentials';

/** Hash a password using SHA-256 (Web Crypto API). Returns a hex string. */
export async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Save credential hash to localStorage for fast-path login on next visit. */
export function saveCredentials(username: string, passwordHash: string, contactId: string): void {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ username, passwordHash, contactId }));
}

/** Load saved credential hash from localStorage. Returns null if missing or malformed. */
export function loadCredentials(): { username: string; passwordHash: string; contactId: string } | null {
  try {
    const stored = localStorage.getItem(CREDENTIALS_KEY);
    if (stored) return JSON.parse(stored) as { username: string; passwordHash: string; contactId: string };
  } catch { /* ignore */ }
  return null;
}

/** Remove saved credential hash from localStorage. */
export function clearCredentials(): void {
  localStorage.removeItem(CREDENTIALS_KEY);
}
