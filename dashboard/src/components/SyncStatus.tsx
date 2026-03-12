/**
 * SyncStatus — shows when data was last synced and an offline banner.
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
}

export function SyncStatus({ lastSync, isOnline, isLoading, onRefresh }: SyncStatusProps) {
  return (
    <div className="space-y-2">
      {!isOnline && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 010-7.072M5.636 18.364a9 9 0 010-12.728" />
          </svg>
          <span>You are offline — showing cached data</span>
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>
          {lastSync ? `Last synced: ${formatTimeAgo(lastSync)}` : 'Not yet synced'}
        </span>
        <button
          onClick={onRefresh}
          disabled={!isOnline || isLoading}
          className="text-purple-600 hover:text-purple-800 disabled:opacity-40 disabled:cursor-not-allowed underline"
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
