/**
 * Team Reviews Table Component
 *
 * Displays team directory review records.
 */

import { useState, useMemo } from 'react';
import type { TeamReviewRecord } from '../types';

interface TeamReviewsTableProps {
  records: TeamReviewRecord[];
  isLoading: boolean;
}

type SortField = 'leader' | 'date' | 'overdue';
type SortOrder = 'asc' | 'desc';

export function TeamReviewsTable({ records, isLoading }: TeamReviewsTableProps) {
  const [sortField, setSortField] = useState<SortField>('overdue');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);

  const overdueCount = useMemo(() => {
    return records.filter(r => r['Review overdue']?.toLowerCase() === 'yes' || r['Review overdue'] === 'true').length;
  }, [records]);

  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (filterOverdue) {
      result = result.filter(r => r['Review overdue']?.toLowerCase() === 'yes' || r['Review overdue'] === 'true');
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        (r['Team leader'] || '').toLowerCase().includes(term) ||
        (r['Role'] || '').toLowerCase().includes(term) ||
        r['Membership number'].includes(term)
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'leader':
          comparison = (a['Team leader'] || '').localeCompare(b['Team leader'] || '');
          break;
        case 'date': {
          const aDate = a['Scheduled review date'] ? new Date(a['Scheduled review date']).getTime() : Infinity;
          const bDate = b['Scheduled review date'] ? new Date(b['Scheduled review date']).getTime() : Infinity;
          comparison = aDate - bDate;
          break;
        }
        case 'overdue': {
          const aOverdue = a['Review overdue']?.toLowerCase() === 'yes' || a['Review overdue'] === 'true' ? 1 : 0;
          const bOverdue = b['Review overdue']?.toLowerCase() === 'yes' || b['Review overdue'] === 'true' ? 1 : 0;
          comparison = aOverdue - bOverdue;
          break;
        }
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, filterOverdue, searchTerm, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
        No team review records found
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search by team leader, role or membership #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
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
        </div>
        <div className="text-sm text-gray-500">
          Showing {filteredRecords.length} of {records.length} records
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('leader')}
              >
                Team Leader {renderSortIcon("leader")}
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Membership #
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Role
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Group
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('date')}
              >
                Review Date {renderSortIcon("date")}
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('overdue')}
              >
                Status {renderSortIcon("overdue")}
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
              filteredRecords.map((record, index) => {
                const isOverdue = record['Review overdue']?.toLowerCase() === 'yes' || record['Review overdue'] === 'true';
                return (
                  <tr key={`${record['Membership number']}-${index}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {record['Team leader']}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {record['Membership number']}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {record['Role']}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record['Group'] || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(record['Scheduled review date'])}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        isOverdue
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {isOverdue ? 'Overdue' : 'On Track'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TeamReviewsTable;
