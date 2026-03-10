/**
 * GLV Dashboard - Main Application
 *
 * Training compliance dashboard for Scout groups.
 * Fetches data from the Scouts membership portal using the user's session.
 */

import { useState, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { AuthState } from './types';
import { AuthFlow } from './components/AuthFlow';
import { Dashboard } from './components/Dashboard';
import { loadSession, saveSession, clearSession } from './session';

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

/** Load session from sessionStorage and convert to AuthState */
function loadAuthState(): AuthState {
  const session = loadSession();
  if (session) {
    return { status: 'authenticated', token: session.token, contactId: session.contactId, username: session.username };
  }
  return { status: 'unauthenticated' };
}

function UpdateToast() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
      <span>A new version is available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="bg-purple-500 hover:bg-purple-400 text-white px-3 py-1 rounded font-medium transition-colors"
      >
        Reload
      </button>
    </div>
  );
}

function App() {
  const [authState, setAuthState] = useState<AuthState>(loadAuthState);

  const handleAuthStart = useCallback(() => {
    setAuthState({ status: 'authenticating' });
  }, []);

  const handleAuthComplete = useCallback((token: string, contactId: string, username?: string) => {
    saveSession(token, contactId, username);
    setAuthState({ status: 'authenticated', token, contactId, username });
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
      <>
        <UpdateToast />
        <AuthFlow
          authState={authState}
          onAuthStart={handleAuthStart}
          onAuthComplete={handleAuthComplete}
          onAuthError={handleAuthError}
          mockMode={MOCK_MODE}
        />
      </>
    );
  }

  // Show dashboard when authenticated
  return (
    <>
      <UpdateToast />
      <Dashboard
        token={authState.token}
        contactId={authState.contactId}
        username={authState.username}
        onLogout={handleLogout}
        onTokenExpired={handleTokenExpired}
      />
    </>
  );
}

export default App;
