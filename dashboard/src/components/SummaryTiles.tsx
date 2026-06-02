/**
 * Summary Tiles Component
 *
 * Displays compliance summary statistics grouped by Joining Journey category:
 * "Within 30 days", "Growing Roots Learning", "First Response", and a
 * catch-all "Other" group for any unexpected module types.
 */

import type { ComplianceSummary } from '../types';
import { GROWING_ROOTS_MODULES, FIRST_RESPONSE_MODULE } from '../utils';

interface SummaryTilesProps {
  summary: ComplianceSummary | null;
  isLoading: boolean;
  disclosureExpiringSoon?: number;
  permitExpiringSoon?: number;
  onTileClick?: (learningType: string) => void;
}

interface TileProps {
  title: string;
  total: number;
  compliant: number;
  expiring: number;
  expired: number;
  color: 'purple' | 'blue' | 'green' | 'orange';
  onClick?: () => void;
}

const colorClasses = {
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    title: 'text-purple-900',
    compliant: 'text-green-600',
    expiring: 'text-yellow-600',
    expired: 'text-red-600',
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    title: 'text-blue-900',
    compliant: 'text-green-600',
    expiring: 'text-yellow-600',
    expired: 'text-red-600',
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    title: 'text-green-900',
    compliant: 'text-green-600',
    expiring: 'text-yellow-600',
    expired: 'text-red-600',
  },
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    title: 'text-orange-900',
    compliant: 'text-green-600',
    expiring: 'text-yellow-600',
    expired: 'text-red-600',
  },
};

function Tile({ title, total, compliant, expiring, expired, color, onClick }: TileProps) {
  const colors = colorClasses[color];
  const compliancePercent = total > 0 ? Math.round((compliant / total) * 100) : 0;

  return (
    <div
      className={`${colors.bg} ${colors.border} border rounded-lg p-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-purple-300 transition-shadow' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <h3 className={`font-semibold ${colors.title} mb-3`}>{title}</h3>

      <div className="flex items-end justify-between mb-3">
        <div className="text-3xl font-bold text-gray-900">{compliancePercent}%</div>
        <div className="text-sm text-gray-500">compliant</div>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Total</span>
          <span className="font-medium">{total}</span>
        </div>
        <div className="flex justify-between">
          <span className={colors.compliant}>Valid/In Progress</span>
          <span className={`font-medium ${colors.compliant}`}>{compliant}</span>
        </div>
        {expiring > 0 && (
          <div className="flex justify-between">
            <span className={colors.expiring}>Renewal Due</span>
            <span className={`font-medium ${colors.expiring}`}>{expiring}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className={colors.expired}>Expired/Not Started</span>
          <span className={`font-medium ${colors.expired}`}>{expired}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${compliancePercent}%` }}
        />
      </div>
    </div>
  );
}

function LoadingTile() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-24 mb-3"></div>
      <div className="h-8 bg-gray-200 rounded w-16 mb-3"></div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded"></div>
        <div className="h-4 bg-gray-200 rounded"></div>
        <div className="h-4 bg-gray-200 rounded"></div>
      </div>
      <div className="mt-3 h-2 bg-gray-200 rounded-full"></div>
    </div>
  );
}

const WITHIN_30_DAYS = GROWING_ROOTS_MODULES.filter(m => m.deadlineDays === 30).map(m => m.name);
const GROWING_ROOTS = GROWING_ROOTS_MODULES.filter(m => m.deadlineDays === null).map(m => m.name);

const TILE_GROUPS: ReadonlyArray<{
  label: string;
  modules: readonly string[];
  color: TileProps['color'];
}> = [
  { label: 'Within 30 days',        modules: WITHIN_30_DAYS,          color: 'purple' },
  { label: 'Growing Roots Learning', modules: GROWING_ROOTS,           color: 'green'  },
  { label: 'First Response',         modules: [FIRST_RESPONSE_MODULE], color: 'blue'   },
];

const KNOWN_MODULES = new Set(TILE_GROUPS.flatMap(g => g.modules));

export function SummaryTiles({ summary, isLoading, disclosureExpiringSoon = 0, permitExpiringSoon = 0, onTileClick }: SummaryTilesProps) {
  if (isLoading || !summary) {
    return (
      <div className="space-y-6">
        <div className="flex gap-6 items-start">
          <div className="flex-[2] min-w-0">
            <div className="h-3 bg-gray-200 rounded w-24 mb-2 animate-pulse" />
            <div className="grid grid-cols-2 gap-4">
              <LoadingTile />
              <LoadingTile />
            </div>
          </div>
          <div className="flex-[1] min-w-0">
            <div className="h-3 bg-gray-200 rounded w-28 mb-2 animate-pulse" />
            <div className="grid grid-cols-1 gap-4">
              <LoadingTile />
            </div>
          </div>
        </div>
        <div>
          <div className="h-3 bg-gray-200 rounded w-36 mb-2 animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <LoadingTile />
            <LoadingTile />
            <LoadingTile />
            <LoadingTile />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Overall summary */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Overall Compliance</h2>
            <p className="text-sm text-gray-500">{summary.total} training records</p>
          </div>
          <div className="sm:text-right">
            <div className="text-sm text-gray-500">Status breakdown</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {Object.entries(summary.byStatus).map(([status, count]) => (
                <span key={status} className="text-gray-600">
                  {status}: <span className="font-medium">{count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        {(summary.expiringSoon > 0 || disclosureExpiringSoon > 0 || permitExpiringSoon > 0) && (
          <div className="mt-3 pt-3 border-t border-amber-200 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-800 bg-amber-50 -mx-4 -mb-4 px-4 py-2 rounded-b-lg">
            <span className="text-amber-500">⚠</span>
            <span className="font-medium">Expiring within 90 days:</span>
            {summary.expiringSoon > 0 && (
              <a href="#section-learning" className="hover:underline">
                Learning Records <span className="font-semibold">{summary.expiringSoon}</span>
              </a>
            )}
            {summary.expiringSoon > 0 && (disclosureExpiringSoon > 0 || permitExpiringSoon > 0) && (
              <span className="text-amber-400">·</span>
            )}
            {disclosureExpiringSoon > 0 && (
              <a href="#section-disclosures" className="hover:underline">
                Disclosures <span className="font-semibold">{disclosureExpiringSoon}</span>
              </a>
            )}
            {disclosureExpiringSoon > 0 && permitExpiringSoon > 0 && (
              <span className="text-amber-400">·</span>
            )}
            {permitExpiringSoon > 0 && (
              <a href="#section-permits" className="hover:underline">
                Permits <span className="font-semibold">{permitExpiringSoon}</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Grouped learning type tiles */}
      <div className="space-y-6">

        {/* Top row: Within 30 days + First Response side by side */}
        {(() => {
          const within30 = TILE_GROUPS[0];
          const firstResponse = TILE_GROUPS[2];
          const within30Tiles = within30.modules
            .map(name => ({ name, stats: summary.byLearningType[name] }))
            .filter(({ stats }) => stats !== undefined);
          const firstResponseTiles = firstResponse.modules
            .map(name => ({ name, stats: summary.byLearningType[name] }))
            .filter(({ stats }) => stats !== undefined);

          if (within30Tiles.length === 0 && firstResponseTiles.length === 0) return null;

          return (
            <div className="flex gap-6 items-start">
              {within30Tiles.length > 0 && (
                <div className="flex-[2] min-w-0">
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                    {within30.label}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {within30Tiles.map(({ name, stats }) => (
                      <Tile key={name} title={name} total={stats.total} compliant={stats.compliant} expiring={stats.expiring} expired={stats.expired} color={within30.color} onClick={onTileClick ? () => onTileClick(name) : undefined} />
                    ))}
                  </div>
                </div>
              )}
              {firstResponseTiles.length > 0 && (
                <div className="flex-[1] min-w-0">
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                    {firstResponse.label}
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {firstResponseTiles.map(({ name, stats }) => (
                      <Tile key={name} title={name} total={stats.total} compliant={stats.compliant} expiring={stats.expiring} expired={stats.expired} color={firstResponse.color} onClick={onTileClick ? () => onTileClick(name) : undefined} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Growing Roots Learning — full width */}
        {(() => {
          const gr = TILE_GROUPS[1];
          const tiles = gr.modules
            .map(name => ({ name, stats: summary.byLearningType[name] }))
            .filter(({ stats }) => stats !== undefined);
          if (tiles.length === 0) return null;
          return (
            <div>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                {gr.label}
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {tiles.map(({ name, stats }) => (
                  <Tile key={name} title={name} total={stats.total} compliant={stats.compliant} expiring={stats.expiring} expired={stats.expired} color={gr.color} onClick={onTileClick ? () => onTileClick(name) : undefined} />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Other — catch-all for any module types not in the known groups */}
        {(() => {
          const tiles = Object.entries(summary.byLearningType)
            .filter(([name]) => !KNOWN_MODULES.has(name))
            .map(([name, stats]) => ({ name, stats }));
          if (tiles.length === 0) return null;
          return (
            <div>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Other
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {tiles.map(({ name, stats }) => (
                  <Tile key={name} title={name} total={stats.total} compliant={stats.compliant} expiring={stats.expiring} expired={stats.expired} color="orange" onClick={onTileClick ? () => onTileClick(name) : undefined} />
                ))}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

export default SummaryTiles;
