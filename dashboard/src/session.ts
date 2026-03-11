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
