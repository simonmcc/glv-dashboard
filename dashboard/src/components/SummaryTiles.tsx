/**
 * Summary Tiles Component
 *
 * Displays compliance summary statistics in a grid of tiles.
 */

import type { ComplianceSummary } from '../types';

interface SummaryTilesProps {
  summary: ComplianceSummary | null;
  isLoading: boolean;
}

interface TileProps {
  title: string;
  total: number;
  compliant: number;
  expiring: number;
  expired: number;
  color: 'purple' | 'blue' | 'green' | 'orange';
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

function Tile({ title, total, compliant, expiring, expired, color }: TileProps) {
  const colors = colorClasses[color];
  const compliancePercent = total > 0 ? Math.round((compliant / total) * 100) : 0;

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg p-4`}>
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

export function SummaryTiles({ summary, isLoading }: SummaryTilesProps) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <LoadingTile />
        <LoadingTile />
        <LoadingTile />
        <LoadingTile />
      </div>
    );
  }

  const learningTypes = Object.entries(summary.byLearningType);
  const colors: TileProps['color'][] = ['purple', 'blue', 'green', 'orange'];

  // Map learning types to display names
  const displayNames: Record<string, string> = {
    'SafeGuarding': 'Safeguarding',
    'Safety': 'Safety',
    'FirstAid': 'First Aid',
    'DataProtection': 'GDPR',
  };

  return (
    <div>
      {/* Overall summary */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Overall Compliance</h2>
            <p className="text-sm text-gray-500">{summary.total} training records</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Status breakdown</div>
            <div className="flex gap-3 text-sm">
              {Object.entries(summary.byStatus).map(([status, count]) => (
                <span key={status} className="text-gray-600">
                  {status}: <span className="font-medium">{count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Learning type tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {learningTypes.map(([type, stats], index) => (
          <Tile
            key={type}
            title={displayNames[type] || type}
            total={stats.total}
            compliant={stats.compliant}
            expiring={stats.expiring}
            expired={stats.expired}
            color={colors[index % colors.length]}
          />
        ))}
      </div>
    </div>
  );
}

export default SummaryTiles;
