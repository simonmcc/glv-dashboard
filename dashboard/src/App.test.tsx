import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SESSION_KEY } from './session';

// Mock the Dashboard component to avoid API calls
vi.mock('./components/Dashboard', () => ({
  Dashboard: ({ onLogout, onTokenExpired }: { onLogout: () => void; onTokenExpired: () => void }) => (
    <div data-testid="dashboard">
      <button onClick={onLogout}>Logout</button>
      <button onClick={onTokenExpired}>Token Expired</button>
    </div>
  ),
}));

describe('App - session management', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('session loading', () => {
    it('shows login screen when no session exists', async () => {
      const { default: App } = await import('./App');
      render(<App />);
      expect(screen.getByText('GLV Dashboard')).toBeInTheDocument();
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    });

    it('restores authenticated state from sessionStorage', async () => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: 'saved-token',
        contactId: 'saved-contact',
      }));

      const { default: App } = await import('./App');
      render(<App />);

      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });

    it('requires token to be present for valid session', async () => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: '',
        contactId: 'some-contact',
      }));

      const { default: App } = await import('./App');
      render(<App />);

      // Empty token should show login screen
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    });

    it('handles corrupted JSON gracefully', async () => {
      sessionStorage.setItem(SESSION_KEY, 'not-valid-json{{{');

      const { default: App } = await import('./App');
      render(<App />);

      // Should show login screen, not crash
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    });

    it('handles missing session properties gracefully', async () => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ unrelated: 'data' }));

      const { default: App } = await import('./App');
      render(<App />);

      // Should show login screen when token is missing
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    });
  });

  describe('session saving', () => {
    it('saves session to sessionStorage on successful auth', async () => {
      const { default: App } = await import('./App');
      render(<App />);

      // Fill in login form
      fireEvent.change(screen.getByLabelText('Email Address'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'password123' },
      });

      // Expand manual token entry and use it (simpler than mocking fetch)
      fireEvent.click(screen.getByText('Advanced: Enter token manually'));
      fireEvent.change(screen.getByPlaceholderText('Paste Bearer token here...'), {
        target: { value: 'test-bearer-token' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Use Token' }));

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      });

      // Verify session was saved
      const saved = sessionStorage.getItem(SESSION_KEY);
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved!);
      expect(parsed.token).toBe('test-bearer-token');
    });
  });

  describe('session clearing', () => {
    it('clears session on logout', async () => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: 'saved-token',
        contactId: 'saved-contact',
      }));

      const { default: App } = await import('./App');
      render(<App />);

      expect(screen.getByTestId('dashboard')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    });

    it('clears session on token expiry', async () => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token: 'saved-token',
        contactId: 'saved-contact',
      }));

      const { default: App } = await import('./App');
      render(<App />);

      expect(screen.getByTestId('dashboard')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Token Expired' }));

      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
      expect(screen.getByText('Your session has expired. Please sign in again.')).toBeInTheDocument();
    });
  });
});

describe('App - mock mode', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllEnvs();
  });

  it('shows login screen with preview banner in mock mode', async () => {
    vi.stubEnv('VITE_MOCK_MODE', 'true');

    const { default: App } = await import('./App');
    render(<App />);

    expect(screen.getByText('🔍 Preview Mode (Mock Data)')).toBeInTheDocument();
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
  });

  it('restores session in mock mode if previously logged in', async () => {
    vi.stubEnv('VITE_MOCK_MODE', 'true');

    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      token: 'mock-token',
      contactId: 'mock-contact',
    }));

    const { default: App } = await import('./App');
    render(<App />);

    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('does not auto-authenticate in mock mode without session', async () => {
    vi.stubEnv('VITE_MOCK_MODE', 'true');

    const { default: App } = await import('./App');
    render(<App />);

    // Should NOT automatically show dashboard
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    // Should show login form
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
  });
});
