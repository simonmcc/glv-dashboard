/**
 * Compliance Table Component
 *
 * Displays detailed learning compliance records in a sortable, filterable table.
 */

import { useState, useMemo } from 'react';
import type { LearningRecord } from '../types';

interface ComplianceTableProps {
  records: LearningRecord[];
  isLoading: boolean;
}

type SortField = 'name' | 'learning' | 'status' | 'expiry';
type SortOrder = 'asc' | 'desc';

const statusColors: Record<string, string> = {
  'Valid': 'bg-green-100 text-green-800',
  'In-Progress': 'bg-blue-100 text-blue-800',
  'Expiring': 'bg-yellow-100 text-yellow-800',
  'Renewal Due': 'bg-orange-100 text-orange-800',
  'Expired': 'bg-red-100 text-red-800',
  'Not Started': 'bg-gray-100 text-gray-800',
};

export function ComplianceTable({ records, isLoading }: ComplianceTableProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLearning, setFilterLearning] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterNoExpiry, setFilterNoExpiry] = useState(false);

  // Get unique values for filters
  const statuses = useMemo(() => {
    const unique = new Set(records.map(r => r.Status));
    return ['all', ...Array.from(unique).sort()];
  }, [records]);

  const learningTypes = useMemo(() => {
    const unique = new Set(records.map(r => r.Learning));
    return ['all', ...Array.from(unique).sort()];
  }, [records]);

  // Count overdue records (expired or new members past deadline)
  const overdueCount = useMemo(() => {
    return records.filter(r => {
      // Expired status
      if (r.Status === 'Expired') return true;
      // Days since expiry > 0
      if (r['Days since expiry'] && r['Days since expiry'] > 0) return true;
      // New member past 12-month deadline
      if (r.Status === 'In-Progress' && !r['Expiry date']) {
        const { isOverdue } = getNewMemberDeadline(r['Start date']);
        return isOverdue;
      }
      return false;
    }).length;
  }, [records]);

  // Count records with no expiry date
  const noExpiryCount = useMemo(() => {
    return records.filter(r => !r['Expiry date']).length;
  }, [records]);

  // Filter and sort records
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Apply overdue filter
    if (filterOverdue) {
      result = result.filter(r => {
        if (r.Status === 'Expired') return true;
        if (r['Days since expiry'] && r['Days since expiry'] > 0) return true;
        if (r.Status === 'In-Progress' && !r['Expiry date']) {
          const { isOverdue } = getNewMemberDeadline(r['Start date']);
          return isOverdue;
        }
        return false;
      });
    }

    // Apply no expiry filter
    if (filterNoExpiry) {
      result = result.filter(r => !r['Expiry date']);
    }

    // Apply filters
    if (filterStatus !== 'all') {
      result = result.filter(r => r.Status === filterStatus);
    }
    if (filterLearning !== 'all') {
      result = result.filter(r => r.Learning === filterLearning);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r['First name'].toLowerCase().includes(term) ||
        r['Last name'].toLowerCase().includes(term) ||
        r['Membership number'].includes(term)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = `${a['Last name']} ${a['First name']}`.localeCompare(
            `${b['Last name']} ${b['First name']}`
          );
          break;
        case 'learning':
          comparison = a.Learning.localeCompare(b.Learning);
          break;
        case 'status':
          comparison = a.Status.localeCompare(b.Status);
          break;
        case 'expiry':
          const dateA = a['Expiry date'] || '';
          const dateB = b['Expiry date'] || '';
          comparison = dateA.localeCompare(dateB);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, filterStatus, filterLearning, searchTerm, sortField, sortOrder, filterOverdue, filterNoExpiry]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
        </div>
        <div className="p-4 space-y-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Filters */}
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search by name or membership number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />

          <select
            value={filterLearning}
            onChange={(e) => setFilterLearning(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
          >
            {learningTypes.map(type => (
              <option key={type} value={type}>
                {type === 'all' ? 'All Learning Types' : type}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
          >
            {statuses.map(status => (
              <option key={status} value={status}>
                {status === 'all' ? 'All Statuses' : status}
              </option>
            ))}
          </select>

          {overdueCount > 0 && (
            <button
              onClick={() => setFilterOverdue(!filterOverdue)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterOverdue
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-800 hover:bg-red-200'
              }`}
            >
              Overdue ({overdueCount})
            </button>
          )}

          {noExpiryCount > 0 && (
            <button
              onClick={() => setFilterNoExpiry(!filterNoExpiry)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterNoExpiry
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
              }`}
            >
              No Expiry ({noExpiryCount})
            </button>
          )}
        </div>

        <div className="text-sm text-gray-500">
          Showing {filteredRecords.length} of {records.length} records
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                Name <SortIcon field="name" />
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Membership #
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('learning')}
              >
                Learning <SortIcon field="learning" />
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                Status <SortIcon field="status" />
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('expiry')}
              >
                Expiry Date <SortIcon field="expiry" />
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Team / Role
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No records match your filters
                </td>
              </tr>
            ) : (
              filteredRecords.map((record, index) => (
                <tr key={`${record['Membership number']}-${record.Learning}-${index}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {record['First name']} {record['Last name']}
                    </div>
                    {record['Email address'] && (
                      <div className="text-sm text-gray-500">{record['Email address']}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {record['Membership number']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {record.Learning}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[record.Status] || 'bg-gray-100 text-gray-800'}`}>
                      {record.Status}
                    </span>
                    {record['Days since expiry'] && record['Days since expiry'] > 0 && (
                      <div className="text-xs text-red-600 mt-1">
                        {record['Days since expiry']} days overdue
                      </div>
                    )}
                    {(() => {
                      const deadlineInfo = formatDeadlineInfo(record);
                      if (deadlineInfo) {
                        return (
                          <div className={`text-xs mt-1 ${deadlineInfo.colorClass}`}>
                            {deadlineInfo.text}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {record['Expiry date'] ? (
                      formatDate(record['Expiry date'])
                    ) : record.Status === 'In-Progress' && record['Start date'] ? (
                      <span className="text-gray-400 italic">
                        Started {formatDate(record['Start date'])}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {record['Team name'] && <div>{record['Team name']}</div>}
                    {record['Role name'] && <div className="text-gray-400">{record['Role name']}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Calculate deadline info for new members (12 months from start date)
 */
function getNewMemberDeadline(startDateStr: string | null | undefined): {
  deadlineDate: Date | null;
  monthsRemaining: number | null;
  isOverdue: boolean;
} {
  if (!startDateStr) return { deadlineDate: null, monthsRemaining: null, isOverdue: false };

  try {
    const startDate = new Date(startDateStr);
    const deadlineDate = new Date(startDate);
    deadlineDate.setFullYear(deadlineDate.getFullYear() + 1); // 12 months from start

    const now = new Date();
    const monthsRemaining = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const isOverdue = deadlineDate < now;

    return { deadlineDate, monthsRemaining, isOverdue };
  } catch {
    return { deadlineDate: null, monthsRemaining: null, isOverdue: false };
  }
}

/**
 * Format deadline info for display
 */
function formatDeadlineInfo(record: LearningRecord): { text: string; colorClass: string } | null {
  // Only show for In-Progress with no expiry date (new members)
  if (record.Status !== 'In-Progress' || record['Expiry date']) {
    return null;
  }

  const { deadlineDate, monthsRemaining, isOverdue } = getNewMemberDeadline(record['Start date']);

  if (!deadlineDate || monthsRemaining === null) {
    return null;
  }

  if (isOverdue) {
    return {
      text: `Overdue (was due ${formatDate(deadlineDate.toISOString())})`,
      colorClass: 'text-red-600',
    };
  }

  if (monthsRemaining <= 2) {
    return {
      text: `Due in ${monthsRemaining} month${monthsRemaining === 1 ? '' : 's'}`,
      colorClass: 'text-orange-600',
    };
  }

  return {
    text: `Due by ${formatDate(deadlineDate.toISOString())}`,
    colorClass: 'text-gray-500',
  };
}

export default ComplianceTable;
