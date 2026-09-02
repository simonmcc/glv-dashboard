import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Shared spies so tests can assert which section endpoints were called.
const api = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getAllLearningCompliance: vi
    .fn()
    .mockResolvedValue({ data: [], error: null }),
  checkLearningByMembershipNumbers: vi
    .fn()
    .mockResolvedValue({ success: true, members: [] }),
  computeComplianceSummary: vi.fn().mockReturnValue(null),
  computeDisclosureSummary: vi.fn().mockReturnValue(null),
  getJoiningJourney: vi.fn().mockResolvedValue({ data: [], error: null }),
  getDisclosureCompliance: vi.fn().mockResolvedValue({ data: [], error: null }),
  getSuspensions: vi.fn().mockResolvedValue({ data: [], error: null }),
  getTeamReviews: vi.fn().mockResolvedValue({ data: [], error: null }),
  getPermits: vi.fn().mockResolvedValue({ data: [], error: null }),
  getAwards: vi.fn().mockResolvedValue({ data: [], error: null }),
  testTable: vi.fn(),
}));

// Mock API clients to avoid real network calls
vi.mock("../api-client", () => ({
  ScoutsApiClient: vi.fn().mockImplementation(() => api),
}));

vi.mock("../mock-api-client", () => ({
  MockScoutsApiClient: vi.fn().mockImplementation(() => api),
}));

// Mock IndexedDB cache module so tests don't touch real IDB
vi.mock("../db", () => ({
  readCache: vi.fn().mockResolvedValue(undefined),
  writeCache: vi.fn().mockResolvedValue(undefined),
  readLastSync: vi.fn().mockResolvedValue(null),
}));

// Mock OpenTelemetry tracer
vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: () => ({
      startActiveSpan: vi.fn((_name: string, fn: (span: unknown) => unknown) =>
        fn({
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          recordException: vi.fn(),
          end: vi.fn(),
        }),
      ),
    }),
  },
  SpanStatusCode: { OK: "OK", ERROR: "ERROR" },
}));

// Stub IntersectionObserver (not available in jsdom)
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  );
});

describe("Dashboard eager loading", () => {
  it("fetches every section on mount without any section being scrolled into view", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        isOnline={true}
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(api.getJoiningJourney).toHaveBeenCalled();
      expect(api.getDisclosureCompliance).toHaveBeenCalled();
      expect(api.getSuspensions).toHaveBeenCalled();
      expect(api.getTeamReviews).toHaveBeenCalled();
      expect(api.getPermits).toHaveBeenCalled();
      expect(api.getAwards).toHaveBeenCalled();
    });
  });

  it("fetches the primary learning data exactly once on mount", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        isOnline={true}
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(api.getAwards).toHaveBeenCalled();
    });
    expect(api.getAllLearningCompliance).toHaveBeenCalledTimes(1);
  });

  it("does not fetch anything while background auth is still running", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(
      <Dashboard
        token={null}
        contactId="test-contact"
        isOnline={true}
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
        backgroundAuth={{ message: "Signing in…" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Signing in…")).toBeInTheDocument();
    });
    expect(api.getAllLearningCompliance).not.toHaveBeenCalled();
    expect(api.getDisclosureCompliance).not.toHaveBeenCalled();
  });
});

describe("Dashboard sync status label", () => {
  it("names the data type being loaded instead of a generic refreshing label", async () => {
    // Hold the disclosures request open so the section stays in the loading state.
    let releaseDisclosures: (value: {
      data: never[];
      error: null;
    }) => void = () => {};
    api.getDisclosureCompliance.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseDisclosures = resolve;
      }),
    );

    const { Dashboard } = await import("./Dashboard");
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        isOnline={true}
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/^Loading disclosures/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Refreshing/)).not.toBeInTheDocument();

    releaseDisclosures({ data: [], error: null });

    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeInTheDocument();
    });
  });
});

describe("Dashboard footer", () => {
  it("renders the data disclaimer text", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        isOnline={true}
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        /Data fetched directly from the Scouts membership portal/,
      ),
    ).toBeInTheDocument();
  });

  it("renders a link to the GitHub repository", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        isOnline={true}
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: /simonmcc\/glv-dashboard/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("https://github.com/simonmcc/glv-dashboard"),
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("includes the app version in the GitHub link", async () => {
    const { Dashboard } = await import("./Dashboard");
    render(
      <Dashboard
        token="test-token"
        contactId="test-contact"
        isOnline={true}
        onLogout={vi.fn()}
        onTokenExpired={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: /simonmcc\/glv-dashboard@/ });
    expect(link).toBeInTheDocument();
  });
});
