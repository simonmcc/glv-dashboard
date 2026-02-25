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

function App() {
  const [authState, setAuthState] = useState<AuthState>(() =>
    MOCK_MODE
      ? { status: 'authenticated', token: 'mock-token', contactId: 'mock-contact' }
      : { status: 'unauthenticated' }
  );

  const handleAuthStart = useCallback(() => {
    setAuthState({ status: 'authenticating' });
  }, []);

  const handleAuthComplete = useCallback((token: string, contactId: string) => {
    setAuthState({ status: 'authenticated', token, contactId });
  }, []);

  const handleAuthError = useCallback((message: string) => {
    setAuthState({ status: 'error', message });
  }, []);

  const handleLogout = useCallback(() => {
    setAuthState({ status: 'unauthenticated' });
  }, []);

  const handleTokenExpired = useCallback(() => {
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
