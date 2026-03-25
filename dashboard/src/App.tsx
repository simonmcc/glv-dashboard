/**
 * GLV Dashboard - Main Application
 *
 * Training compliance dashboard for Scout groups.
 * Fetches data from the Scouts membership portal using the user's session.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { AuthState } from './types';
import { AuthFlow } from './components/AuthFlow';
import { Dashboard } from './components/Dashboard';
import { loadSession, saveSession, clearSession } from './session';

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

/** Load session from localStorage and convert to AuthState */
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
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
    // Do NOT clear credentials on logout — they must persist so the fast-path
    // works on the next login. The 30-day expiry in loadCredentials() handles cleanup.
    setAuthState({ status: 'unauthenticated' });
  }, []);

  const handleTokenExpired = useCallback(() => {
    clearSession();
    setAuthState({ status: 'error', message: 'Your session has expired. Please sign in again.' });
  }, []);

  // Background auth handlers (fast-path: show cached dashboard while auth runs in background)
  const handleStartBackgroundAuth = useCallback((contactId: string, username?: string) => {
    setAuthState({ status: 'background-auth', contactId, username, bgAuthMessage: 'Signing in…' });
  }, []);

  const handleBackgroundAuthProgress = useCallback((message: string) => {
    setAuthState(prev =>
      prev.status === 'background-auth' ? { ...prev, bgAuthMessage: message } : prev
    );
  }, []);

  const handleBackgroundAuthComplete = useCallback((token: string, contactId: string, username?: string) => {
    setAuthState(prev => {
      if (prev.status !== 'background-auth') {
        // Stale completion after logout or state change — ignore
        return prev;
      }
      saveSession(token, contactId, username);
      return { status: 'authenticated', token, contactId, username };
    });
  }, []);

  const handleBackgroundAuthError = useCallback((message: string) => {
    setAuthState(prev =>
      prev.status === 'background-auth' ? { ...prev, bgAuthError: message } : prev
    );
  }, []);

  // Show auth flow for unauthenticated / authenticating / error states
  if (
    authState.status === 'unauthenticated' ||
    authState.status === 'authenticating' ||
    authState.status === 'error'
  ) {
    return (
      <>
        <UpdateToast />
        <AuthFlow
          authState={authState}
          onAuthStart={handleAuthStart}
          onAuthComplete={handleAuthComplete}
          onAuthError={handleAuthError}
          onStartBackgroundAuth={handleStartBackgroundAuth}
          onBackgroundAuthProgress={handleBackgroundAuthProgress}
          onBackgroundAuthComplete={handleBackgroundAuthComplete}
          onBackgroundAuthError={handleBackgroundAuthError}
          mockMode={MOCK_MODE}
        />
      </>
    );
  }

  // Show dashboard for both 'authenticated' and 'background-auth' states
  const token = authState.status === 'authenticated' ? authState.token : null;
  const backgroundAuth = authState.status === 'background-auth'
    ? { message: authState.bgAuthMessage, isError: !!authState.bgAuthError }
    : undefined;

  return (
    <>
      <UpdateToast />
      <Dashboard
        token={token}
        contactId={authState.contactId}
        username={authState.username}
        isOnline={isOnline}
        onLogout={handleLogout}
        onTokenExpired={handleTokenExpired}
        backgroundAuth={backgroundAuth}
      />
    </>
  );
}

export default App;
