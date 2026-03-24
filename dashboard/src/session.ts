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

/**
 * Credential records older than this are discarded to limit exposure
 * if localStorage is compromised.
 */
const CREDENTIALS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Derive a verifier from a password using PBKDF2-SHA-256 (Web Crypto API).
 * The high iteration count makes offline brute-force attacks significantly
 * slower compared to a plain digest. Returns a hex-encoded derived key.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode('glv-dashboard-credential-salt'),
      iterations: 100_000,
    },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Save credential verifier to localStorage for fast-path login on next visit. */
export function saveCredentials(username: string, passwordHash: string, contactId: string): void {
  localStorage.setItem(
    CREDENTIALS_KEY,
    JSON.stringify({ username, passwordHash, contactId, createdAt: Date.now() }),
  );
}

/**
 * Load saved credential verifier from localStorage.
 * Returns null if missing, malformed, fields are not strings, or older than CREDENTIALS_MAX_AGE_MS.
 */
export function loadCredentials(): { username: string; passwordHash: string; contactId: string } | null {
  try {
    const stored = localStorage.getItem(CREDENTIALS_KEY);
    if (!stored) return null;
    const { username, passwordHash, contactId, createdAt } = JSON.parse(stored) ?? {};
    if (
      typeof username !== 'string' || !username ||
      typeof passwordHash !== 'string' || !passwordHash ||
      typeof contactId !== 'string' || !contactId
    ) {
      localStorage.removeItem(CREDENTIALS_KEY);
      return null;
    }
    if (!createdAt || Date.now() - createdAt > CREDENTIALS_MAX_AGE_MS) {
      localStorage.removeItem(CREDENTIALS_KEY);
      return null;
    }
    return { username, passwordHash, contactId };
  } catch {
    localStorage.removeItem(CREDENTIALS_KEY);
    return null;
  }
}

/** Remove saved credential verifier from localStorage. */
export function clearCredentials(): void {
  localStorage.removeItem(CREDENTIALS_KEY);
}
