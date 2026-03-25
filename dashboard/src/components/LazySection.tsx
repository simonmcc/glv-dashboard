/**
 * Lazy Section Wrapper
 *
 * Wraps a dashboard section with lazy loading behavior.
 * Shows loading state when the section is visible but data is being fetched.
 * Supports collapsing via the collapsed/onToggle props.
 */

import { forwardRef } from 'react';

export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface LazySectionProps {
  title: string;
  state: LoadState;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
  id?: string;
  headerExtra?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}

export const LazySection = forwardRef<HTMLElement, LazySectionProps>(
  function LazySection({ title, state, error, onRetry, children, id, headerExtra, collapsed = false, onToggle }, ref) {
    return (
      <section ref={ref} id={id}>
        <div className="flex items-center gap-3 mb-4">
          {onToggle && (
            <button
              onClick={onToggle}
              className="text-gray-400 hover:text-gray-600 transition-transform duration-200"
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            >
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          <h2
            className={`text-lg font-semibold text-gray-900 ${onToggle ? 'cursor-pointer select-none' : ''}`}
            onClick={onToggle}
            role={onToggle ? 'button' : undefined}
            tabIndex={onToggle ? 0 : undefined}
            onKeyDown={
              onToggle
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onToggle();
                    }
                  }
                : undefined
            }
          >
            {title}
          </h2>
          {!collapsed && state === 'loading' && (
            <span className="text-sm text-purple-600 animate-pulse flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </span>
          )}
          {headerExtra && !collapsed && <div className="ml-auto">{headerExtra}</div>}
        </div>

        {!collapsed && (
          <>
            {state === 'error' && (
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="text-red-600 mb-2">Failed to load: {error}</div>
                <button
                  onClick={onRetry}
                  className="text-sm text-purple-600 hover:text-purple-800 underline"
                >
                  Try again
                </button>
              </div>
            )}

            {state === 'idle' && (
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 border-b">
                  <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
                </div>
                <div className="p-4 space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
                  ))}
                </div>
              </div>
            )}

            {(state === 'loading' || state === 'loaded') && children}
          </>
        )}
      </section>
    );
  }
);

export default LazySection;
