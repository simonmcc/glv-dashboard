/**
 * Authentication Flow Component
 *
 * Authenticates with the Scouts membership portal via the backend proxy.
 * On repeat logins with matching credentials, shows the dashboard immediately
 * while authentication continues in the background.
 */

import { useState } from 'react';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { AuthState } from '../types';
import { hashPassword, saveCredentials, loadCredentials } from '../session';

const tracer = trace.getTracer('glv-dashboard', '1.0.0');

interface AuthFlowProps {
  authState: AuthState;
  onAuthStart: () => void;
  onAuthComplete: (token: string, contactId: string, username?: string) => void;
  onAuthError: (message: string) => void;
  onStartBackgroundAuth: (contactId: string, username?: string) => void;
  onBackgroundAuthProgress: (message: string) => void;
  onBackgroundAuthComplete: (token: string, contactId: string, username?: string) => void;
  onBackgroundAuthError: (message: string) => void;
  mockMode?: boolean;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (type: string, data: unknown) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      let eventType = 'message';
      let dataLine = '';
      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataLine = line.slice(6).trim();
        }
      }
      if (dataLine) {
        try {
          onEvent(eventType, JSON.parse(dataLine));
        } catch {
          // ignore malformed JSON
        }
      }
    }
  }
}

export function AuthFlow({
  authState,
  onAuthStart,
  onAuthComplete,
  onAuthError,
  onStartBackgroundAuth,
  onBackgroundAuthProgress,
  onBackgroundAuthComplete,
  onBackgroundAuthError,
  mockMode = false,
}: AuthFlowProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginStep, setLoginStep] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      onAuthError('Please enter your username and password');
      return;
    }

    setIsLoading(true);
    setLoginStep('');

    // In mock mode, authenticate immediately without calling the backend
    if (mockMode) {
      setTimeout(() => {
        setIsLoading(false);
        onAuthComplete('mock-token', 'mock-contact', username);
      }, 500);
      return;
    }

    // Check if we can use the fast-path (matching stored credential hash)
    const stored = loadCredentials();
    let isFastPath = false;

    try {
      const passwordHash = await hashPassword(password);
      isFastPath = !!(stored && stored.username === username && stored.passwordHash === passwordHash);
    } catch {
      // If hashing fails (e.g. WebCrypto unavailable), fall back to normal foreground auth
      isFastPath = false;
    }

    if (isFastPath && stored) {
      // Show the dashboard immediately with cached data while auth continues in background
      onStartBackgroundAuth(stored.contactId, username);
    } else {
      onAuthStart();
    }

    await tracer.startActiveSpan('auth.login', async (span) => {
      try {
        const response = await fetch(`${BACKEND_URL}/auth/login-stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password }),
        });

        if (!response.ok || !response.body) {
          const result = await response.json().catch(() => ({}));
          const msg = (result as { error?: string }).error || 'Authentication failed';
          span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
          if (isFastPath) {
            onBackgroundAuthError(msg);
          } else {
            onAuthError(msg);
          }
          return;
        }

        let terminated = false;
        await parseSSEStream(response.body, (type, data) => {
          const payload = data as Record<string, string>;
          if (type === 'progress') {
            const msg = payload.message || '';
            if (isFastPath) {
              onBackgroundAuthProgress(msg);
            } else {
              setLoginStep(msg);
            }
          } else if (type === 'complete') {
            terminated = true;
            const token = payload.token;
            const contactId = payload.contactId ?? '';
            if (!token) {
              const msg = 'Authentication failed: invalid response from authentication server';
              span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
              if (isFastPath) {
                onBackgroundAuthError(msg);
              } else {
                onAuthError(msg);
              }
              return;
            }
            span.setStatus({ code: SpanStatusCode.OK });
            // Save credential hash after every successful login
            void saveCredentials(username, passwordHash, contactId);
            if (isFastPath) {
              onBackgroundAuthComplete(token, contactId, username);
            } else {
              onAuthComplete(token, contactId, username);
            }
          } else if (type === 'error') {
            terminated = true;
            const msg = payload.error || 'Authentication failed';
            span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
            if (isFastPath) {
              onBackgroundAuthError(msg);
            } else {
              onAuthError(msg);
            }
          }
        });

        if (!terminated) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Stream ended without completing' });
          const msg = 'Authentication failed: connection closed unexpectedly';
          if (isFastPath) {
            onBackgroundAuthError(msg);
          } else {
            onAuthError(msg);
          }
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Connection failed' });
        span.recordException(err as Error);
        const msg = 'Failed to connect to authentication server. Is the backend running?';
        if (isFastPath) {
          onBackgroundAuthError(msg);
        } else {
          onAuthError(msg);
        }
      } finally {
        span.end();
        setIsLoading(false);
        setLoginStep('');
      }
    });
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
          {mockMode && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded text-amber-800 text-sm">
              <p className="font-semibold">🔍 Preview Mode (Mock Data)</p>
              <p className="mt-1">This is a PR preview using mock data. Sign in with any email and password.</p>
            </div>
          )}

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
              <p className="font-medium">{loginStep || 'Authenticating with Scouts portal...'}</p>
              <p className="text-xs mt-1">This may take 15-30 seconds as we securely log in on your behalf.</p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <ManualTokenEntry onSubmit={onAuthComplete} />
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          Your password is never stored. A secure hash is saved locally to enable instant access on return visits.
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
