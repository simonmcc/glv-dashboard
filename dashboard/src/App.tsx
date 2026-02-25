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
import { loadSession, saveSession, clearSession } from './session';

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

/** Load session from sessionStorage and convert to AuthState */
function loadAuthState(): AuthState {
  const session = loadSession();
  if (session) {
    return { status: 'authenticated', token: session.token, contactId: session.contactId };
  }
  return { status: 'unauthenticated' };
}

function App() {
  const [authState, setAuthState] = useState<AuthState>(loadAuthState);

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
