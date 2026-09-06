/**
 * Data source selection (mock vs live backend).
 *
 * Production builds always talk to the real backend. Preview builds are made
 * with VITE_MOCK_MODE=true and default to mock data, but the viewer can opt in
 * to the live backend proxy so a UI change can be checked against real data.
 *
 * The override is resolved at runtime (query string, then localStorage) so a
 * single preview build serves both modes.
 */

/** True when this bundle was built as a preview build (mock data by default). */
const BUILD_MOCK_MODE = import.meta.env.VITE_MOCK_MODE === "true";

/** localStorage key holding the viewer's data source override. */
export const DATA_SOURCE_KEY = "glv-dashboard-data-source";

/** Query parameter used to switch data source, e.g. `?data=live`. */
export const DATA_SOURCE_PARAM = "data";

export type DataSource = "mock" | "live";

function isDataSource(value: string | null): value is DataSource {
  return value === "mock" || value === "live";
}

/**
 * Only preview builds may switch data source. A production build has no mock
 * data path worth offering, and a plain dev build already points at a backend.
 */
export function isDataSourceSwitchable(): boolean {
  return BUILD_MOCK_MODE;
}

function readStoredOverride(): DataSource | null {
  try {
    const stored = localStorage.getItem(DATA_SOURCE_KEY);
    return isDataSource(stored) ? stored : null;
  } catch {
    // localStorage unavailable (private mode / blocked cookies)
    return null;
  }
}

/**
 * Read `?data=live|mock` from the URL, persist it, and strip it from the
 * address bar so the choice survives navigation without sticking in the URL.
 */
function consumeQueryOverride(): DataSource | null {
  try {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get(DATA_SOURCE_PARAM);
    if (!isDataSource(requested)) return null;

    try {
      localStorage.setItem(DATA_SOURCE_KEY, requested);
    } catch {
      // Non-persistent override: still honoured for this page load
    }
    url.searchParams.delete(DATA_SOURCE_PARAM);
    window.history.replaceState(null, "", url.toString());
    return requested;
  } catch {
    return null;
  }
}

/** Resolve the data source for this page load. */
export function getDataSource(): DataSource {
  if (!isDataSourceSwitchable()) return "live";
  return consumeQueryOverride() ?? readStoredOverride() ?? "mock";
}

/** True when the app should use `MockScoutsApiClient` instead of the backend. */
export function isMockMode(): boolean {
  return getDataSource() === "mock";
}

/**
 * Persist a new data source. The caller is expected to reload afterwards —
 * the API client, cached session and in-memory data all belong to one source.
 */
export function setDataSource(source: DataSource): void {
  try {
    localStorage.setItem(DATA_SOURCE_KEY, source);
  } catch {
    // Nothing sensible to do; the reload will fall back to the default
  }
}
