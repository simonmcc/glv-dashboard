/**
 * SyncStatus — shows when data was last synced, an offline banner,
 * and background authentication progress.
 */

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface SyncStatusProps {
  lastSync: number | null;
  isOnline: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onLogout?: () => void;
  backgroundAuth?: { message: string; isError?: boolean };
}

export function SyncStatus({ lastSync, isOnline, isLoading, onRefresh, onLogout, backgroundAuth }: SyncStatusProps) {
  return (
    <div className="space-y-2">
      {!isOnline && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          <svg
            className="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 010-7.072M5.636 18.364a9 9 0 010-12.728"
            />
          </svg>
          <span>You are offline — showing cached data</span>
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
        <span>
          {lastSync ? `Last synced: ${formatTimeAgo(lastSync)}` : 'Not yet synced'}
        </span>
        {backgroundAuth ? (
          backgroundAuth.isError ? (
            <span className="flex items-center gap-1.5 text-red-600">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Sign-in failed — cached data only.
              {onLogout && (
                <button onClick={onLogout} className="underline hover:text-red-800">
                  Sign in again
                </button>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-purple-600">
              <svg className="animate-spin h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {backgroundAuth.message}
            </span>
          )
        ) : (
          <button
            onClick={onRefresh}
            disabled={!isOnline || isLoading}
            className="text-purple-600 hover:text-purple-800 disabled:opacity-40 disabled:cursor-not-allowed underline"
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
    </div>
  );
}
