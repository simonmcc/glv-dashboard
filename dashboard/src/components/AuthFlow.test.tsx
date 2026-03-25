import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AuthFlow } from './AuthFlow';

// Mock session helpers so tests control hash comparison without real PBKDF2
vi.mock('../session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session')>();
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue('mock-hash-value'),
    loadCredentials: vi.fn().mockReturnValue(null),
    saveCredentials: vi.fn(),
  };
});

import { hashPassword, loadCredentials, saveCredentials } from '../session';

const defaultProps = {
  authState: { status: 'unauthenticated' as const },
  onAuthStart: vi.fn(),
  onAuthComplete: vi.fn(),
  onAuthError: vi.fn(),
  onStartBackgroundAuth: vi.fn(),
  onBackgroundAuthProgress: vi.fn(),
  onBackgroundAuthComplete: vi.fn(),
  onBackgroundAuthError: vi.fn(),
};

function makeSseStream(events: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events));
      controller.close();
    },
  });
}

describe('AuthFlow - mock mode', () => {
  it('shows mock mode banner when mockMode is true', () => {
    render(<AuthFlow {...defaultProps} mockMode={true} />);
    expect(screen.getByText('🔍 Preview Mode (Mock Data)')).toBeInTheDocument();
    expect(screen.getByText(/Sign in with any email and password/)).toBeInTheDocument();
  });

  it('does not show mock mode banner when mockMode is false', () => {
    render(<AuthFlow {...defaultProps} mockMode={false} />);
    expect(screen.queryByText('🔍 Preview Mode (Mock Data)')).not.toBeInTheDocument();
  });

  it('authenticates with mock token on form submit in mock mode', async () => {
    vi.useFakeTimers();
    try {
      const onAuthComplete = vi.fn();
      render(
        <AuthFlow
          {...defaultProps}
          onAuthComplete={onAuthComplete}
          mockMode={true}
        />
      );

      fireEvent.change(screen.getByLabelText('Email Address'), {
        target: { value: 'anyone@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'anypassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Scouts' }));

      await act(async () => {
        vi.runAllTimers();
      });

      expect(onAuthComplete).toHaveBeenCalledWith('mock-token', 'mock-contact', 'anyone@example.com');
    } finally {
      vi.runOnlyPendingTimers();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

describe('AuthFlow - background auth (fast-path)', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof global.fetch;
    vi.mocked(hashPassword).mockResolvedValue('mock-hash-value');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('uses fast-path when stored hash matches — calls onStartBackgroundAuth, not onAuthStart', async () => {
    vi.mocked(loadCredentials).mockReturnValue({
      username: 'user@example.com',
      passwordHash: 'mock-hash-value',
      contactId: 'stored-contact-123',
    });

    // Return an SSE stream that completes immediately
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream('event: complete\ndata: {"token":"new-token","contactId":"stored-contact-123"}\n\n'),
    });

    const props = { ...defaultProps };
    render(<AuthFlow {...props} />);

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Scouts' }));
    });

    expect(props.onStartBackgroundAuth).toHaveBeenCalledWith('stored-contact-123', 'user@example.com');
    expect(props.onAuthStart).not.toHaveBeenCalled();
    expect(props.onBackgroundAuthComplete).toHaveBeenCalledWith('new-token', 'stored-contact-123', 'user@example.com');
    expect(props.onAuthComplete).not.toHaveBeenCalled();
  });

  it('routes SSE progress events to onBackgroundAuthProgress on fast-path', async () => {
    vi.mocked(loadCredentials).mockReturnValue({
      username: 'user@example.com',
      passwordHash: 'mock-hash-value',
      contactId: 'stored-contact-123',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream(
        'event: progress\ndata: {"message":"Authenticating browser"}\n\n' +
        'event: complete\ndata: {"token":"tok","contactId":"stored-contact-123"}\n\n'
      ),
    });

    const props = { ...defaultProps };
    render(<AuthFlow {...props} />);

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Scouts' }));
    });

    expect(props.onBackgroundAuthProgress).toHaveBeenCalledWith('Authenticating browser');
    expect(props.onAuthError).not.toHaveBeenCalled();
  });

  it('routes SSE errors to onBackgroundAuthError on fast-path, not onAuthError', async () => {
    vi.mocked(loadCredentials).mockReturnValue({
      username: 'user@example.com',
      passwordHash: 'mock-hash-value',
      contactId: 'stored-contact-123',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream('event: error\ndata: {"error":"Invalid credentials"}\n\n'),
    });

    const props = { ...defaultProps };
    render(<AuthFlow {...props} />);

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mypassword' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Scouts' }));
    });

    expect(props.onBackgroundAuthError).toHaveBeenCalledWith('Invalid credentials');
    expect(props.onAuthError).not.toHaveBeenCalled();
  });

  it('falls back to foreground auth when hash does not match stored credentials', async () => {
    vi.mocked(loadCredentials).mockReturnValue({
      username: 'user@example.com',
      passwordHash: 'different-hash',
      contactId: 'stored-contact-123',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream('event: complete\ndata: {"token":"tok","contactId":"contact-xyz"}\n\n'),
    });

    const props = { ...defaultProps };
    render(<AuthFlow {...props} />);

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpassword' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Scouts' }));
    });

    expect(props.onAuthStart).toHaveBeenCalled();
    expect(props.onStartBackgroundAuth).not.toHaveBeenCalled();
    expect(props.onAuthComplete).toHaveBeenCalledWith('tok', 'contact-xyz', 'user@example.com');
  });

  it('saves credentials after successful foreground auth', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null);

    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream('event: complete\ndata: {"token":"tok","contactId":"contact-abc"}\n\n'),
    });

    const props = { ...defaultProps };
    render(<AuthFlow {...props} />);

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newpassword' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Scouts' }));
    });

    expect(saveCredentials).toHaveBeenCalledWith('new@example.com', 'mock-hash-value', 'contact-abc');
  });
});
