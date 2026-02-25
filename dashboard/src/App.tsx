/**
 * GLV Dashboard - Main Application
 *
 * Training compliance dashboard for Scout groups.
 * Fetches data from the Scouts membership portal using the user's session.
 */

import { useState, useCallback } from 'react';
import type { AuthState } from './types';
import { AuthFlow } from './components/AuthFlow';
import { Dashboard } from './components/Dashboard';

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';
const SESSION_KEY = 'glv-dashboard-session';

/** Load session from sessionStorage (survives page refresh, clears on tab close) */
function loadSession(): AuthState {
  if (MOCK_MODE) {
    return { status: 'authenticated', token: 'mock-token', contactId: 'mock-contact' };
  }
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const { token, contactId } = JSON.parse(stored);
      if (token) {
        return { status: 'authenticated', token, contactId };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { status: 'unauthenticated' };
}

/** Save session to sessionStorage */
function saveSession(token: string, contactId: string): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, contactId }));
}

/** Clear session from sessionStorage */
function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

function App() {
  const [authState, setAuthState] = useState<AuthState>(loadSession);

  const handleAuthStart = useCallback(() => {
    setAuthState({ status: 'authenticating' });
  }, []);

  const handleAuthComplete = useCallback((token: string, contactId: string) => {
    saveSession(token, contactId);
    setAuthState({ status: 'authenticated', token, contactId });
  }, []);

  const handleAuthError = useCallback((message: string) => {
    setAuthState({ status: 'error', message });
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setAuthState({ status: 'unauthenticated' });
  }, []);

  const handleTokenExpired = useCallback(() => {
    clearSession();
    setAuthState({ status: 'error', message: 'Your session has expired. Please sign in again.' });
  }, []);

  // Show auth flow if not authenticated
  if (authState.status !== 'authenticated') {
    return (
      <AuthFlow
        authState={authState}
        onAuthStart={handleAuthStart}
        onAuthComplete={handleAuthComplete}
        onAuthError={handleAuthError}
        mockMode={MOCK_MODE}
      />
    );
  }

  // Show dashboard when authenticated
  return (
    <Dashboard
      token={authState.token}
      contactId={authState.contactId}
      onLogout={handleLogout}
      onTokenExpired={handleTokenExpired}
    />
  );
}

export default App;
