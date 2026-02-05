/**
 * Authentication Flow Component
 *
 * Authenticates with the Scouts membership portal via the backend proxy.
 */

import { useState } from 'react';
import type { AuthState } from '../types';

interface AuthFlowProps {
  authState: AuthState;
  onAuthStart: () => void;
  onAuthComplete: (token: string, contactId: string) => void;
  onAuthError: (message: string) => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function AuthFlow({ authState, onAuthStart, onAuthComplete, onAuthError }: AuthFlowProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      onAuthError('Please enter your username and password');
      return;
    }

    setIsLoading(true);
    onAuthStart();

    try {
      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (result.success && result.token) {
        onAuthComplete(result.token, result.contactId || '');
      } else {
        onAuthError(result.error || 'Authentication failed');
      }
    } catch {
      onAuthError('Failed to connect to authentication server. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  if (authState.status === 'authenticated') {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">GLV Dashboard</h1>
          <p className="text-gray-600">Training Compliance Overview</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          {authState.status === 'error' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {authState.message}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your Scouts password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Signing in...
                </>
              ) : (
                'Sign in with Scouts'
              )}
            </button>
          </form>

          {isLoading && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
              <p className="font-medium">Authenticating with Scouts portal...</p>
              <p className="text-xs mt-1">This may take 15-30 seconds as we securely log in on your behalf.</p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <ManualTokenEntry onSubmit={onAuthComplete} />
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          Your credentials are transmitted securely and are not stored.
          <br />
          Data is fetched directly from the Scouts API.
        </p>
      </div>
    </div>
  );
}

function ManualTokenEntry({ onSubmit }: { onSubmit: (token: string, contactId: string) => void }) {
  const [token, setToken] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      onSubmit(token.trim(), '');
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        Advanced: Enter token manually
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-gray-500">
        If you have a Bearer token from the browser's developer tools, you can enter it here.
      </p>
      <textarea
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Paste Bearer token here..."
        className="w-full h-20 p-2 text-xs font-mono border border-gray-300 rounded resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!token.trim()}
          className="flex-1 bg-gray-800 text-white py-2 px-3 rounded text-sm font-medium hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Use Token
        </button>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default AuthFlow;
