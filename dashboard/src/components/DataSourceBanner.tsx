/**
 * Preview-only banner showing which data source the app is using, with a
 * switch between mock data (the default) and the live backend proxy.
 *
 * Renders nothing outside preview builds — see `isDataSourceSwitchable()`.
 */

import {
  getDataSource,
  isDataSourceSwitchable,
  setDataSource,
} from "../data-source";
import { clearSession } from "../session";

interface DataSourceBannerProps {
  /** Compact single-line variant for the dashboard header. */
  compact?: boolean;
}

export function DataSourceBanner({ compact = false }: DataSourceBannerProps) {
  if (!isDataSourceSwitchable()) return null;

  const source = getDataSource();
  const target = source === "mock" ? "live" : "mock";

  const switchSource = () => {
    // The session belongs to the source that created it — a mock token is
    // meaningless to the real backend, and vice versa.
    clearSession();
    setDataSource(target);
    window.location.reload();
  };

  const switchLabel =
    target === "live" ? "Use live backend data" : "Switch back to mock data";

  if (compact) {
    return (
      <div className="text-xs text-gray-500">
        {source === "mock" ? "🔍 Preview: mock data" : "🔗 Preview: live data"}
        {" · "}
        <button
          onClick={switchSource}
          className="underline text-purple-600 hover:text-purple-800"
        >
          {switchLabel}
        </button>
      </div>
    );
  }

  const styles =
    source === "mock"
      ? "bg-amber-50 border-amber-300 text-amber-800"
      : "bg-purple-50 border-purple-300 text-purple-800";

  return (
    <div className={`mb-4 p-3 border rounded text-sm ${styles}`}>
      <p className="font-semibold">
        {source === "mock"
          ? "🔍 Preview Mode (Mock Data)"
          : "🔗 Preview Mode (Live Backend)"}
      </p>
      <p className="mt-1">
        {source === "mock"
          ? "This is a PR preview using mock data. Sign in with any email and password."
          : "This PR preview is talking to the real backend proxy. Sign in with your Scouts portal credentials."}
      </p>
      <button
        onClick={switchSource}
        className="mt-2 underline font-medium hover:no-underline"
      >
        {switchLabel}
      </button>
    </div>
  );
}
