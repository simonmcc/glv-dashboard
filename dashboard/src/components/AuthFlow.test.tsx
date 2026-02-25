import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthFlow } from './AuthFlow';

const defaultProps = {
  authState: { status: 'unauthenticated' as const },
  onAuthStart: vi.fn(),
  onAuthComplete: vi.fn(),
  onAuthError: vi.fn(),
};

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
      const { act } = await import('@testing-library/react');
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

      expect(onAuthComplete).toHaveBeenCalledWith('mock-token', 'mock-contact');
    } finally {
      vi.runOnlyPendingTimers();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
