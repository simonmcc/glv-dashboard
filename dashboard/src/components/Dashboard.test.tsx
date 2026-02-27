import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock API clients to avoid real network calls
vi.mock('../api-client', () => ({
  ScoutsApiClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllLearningCompliance: vi.fn().mockResolvedValue({ data: [], error: null }),
    checkLearningByMembershipNumbers: vi.fn().mockResolvedValue([]),
    testTable: vi.fn(),
    getJoiningJourney: vi.fn(),
  })),
}));

vi.mock('../mock-api-client', () => ({
  MockScoutsApiClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllLearningCompliance: vi.fn().mockResolvedValue({ data: [], error: null }),
    checkLearningByMembershipNumbers: vi.fn().mockResolvedValue([]),
    testTable: vi.fn(),
    getJoiningJourney: vi.fn(),
  })),
}));

// Mock OpenTelemetry tracer
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startActiveSpan: vi.fn((_name: string, fn: (span: unknown) => unknown) =>
        fn({ setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() })
      ),
    }),
  },
  SpanStatusCode: { OK: 'OK', ERROR: 'ERROR' },
}));

// Stub IntersectionObserver (not available in jsdom)
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })));
});

describe('Dashboard footer', () => {
  it('renders the data disclaimer text', async () => {
    const { Dashboard } = await import('./Dashboard');
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Data fetched directly from the Scouts membership portal/)
    ).toBeInTheDocument();
  });

  it('renders a link to the GitHub repository', async () => {
    const { Dashboard } = await import('./Dashboard');
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />
    );

    const link = screen.getByRole('link', { name: /simonmcc\/glv-dashboard/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://github.com/simonmcc/glv-dashboard');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('includes the app version in the GitHub link', async () => {
    const { Dashboard } = await import('./Dashboard');
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />
    );

    const link = screen.getByRole('link', { name: /simonmcc\/glv-dashboard@/ });
    expect(link).toBeInTheDocument();
  });
});
