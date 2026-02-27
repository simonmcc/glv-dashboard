/** Session storage key for persisting authentication state */
export const SESSION_KEY = 'glv-dashboard-session';

/** Load session from sessionStorage (survives page refresh, clears on tab close) */
export function loadSession(): { token: string; contactId: string; username?: string } | null {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const { token, contactId, username } = JSON.parse(stored);
      if (token) {
        return { token, contactId, username };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/** Save session to sessionStorage */
export function saveSession(token: string, contactId: string, username?: string): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, contactId, username }));
}

/** Clear session from sessionStorage */
export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
