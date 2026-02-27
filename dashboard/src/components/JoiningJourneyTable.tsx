/**
 * Joining Journey Table Component
 *
 * Displays joining journey/onboarding status for members.
 */

import { useState, useMemo } from 'react';
import type { JoiningJourneyRecord } from '../types';

interface JoiningJourneyTableProps {
  records: JoiningJourneyRecord[];
  isLoading: boolean;
  onMemberSelect?: (membershipNumber: string, name: string) => void;
}

type SortField = 'name' | 'item' | 'status';
type SortOrder = 'asc' | 'desc';

const statusColors: Record<string, string> = {
  'Complete': 'bg-green-100 text-green-800',
  'Completed': 'bg-green-100 text-green-800',
  'In Progress': 'bg-blue-100 text-blue-800',
  'In-Progress': 'bg-blue-100 text-blue-800',
  'Pending': 'bg-yellow-100 text-yellow-800',
  'Not Started': 'bg-gray-100 text-gray-800',
  'Incomplete': 'bg-red-100 text-red-800',
  'Overdue': 'bg-red-100 text-red-800',
};

export function JoiningJourneyTable({ records, isLoading, onMemberSelect }: JoiningJourneyTableProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterItem, setFilterItem] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterIncomplete, setFilterIncomplete] = useState(false);

  // Get unique values for filters
  const items = useMemo(() => {
    const unique = new Set(records.map(r => r.Item));
    return ['all', ...Array.from(unique).sort()];
  }, [records]);

  const statuses = useMemo(() => {
    const unique = new Set(records.map(r => r.Status));
    return ['all', ...Array.from(unique).sort()];
  }, [records]);

  // Count incomplete records
  const incompleteCount = useMemo(() => {
    return records.filter(r => {
      const status = r.Status.toLowerCase();
      return status !== 'complete' && status !== 'completed';
    }).length;
  }, [records]);

  // Filter and sort records
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Apply incomplete filter
    if (filterIncomplete) {
      result = result.filter(r => {
        const status = r.Status.toLowerCase();
        return status !== 'complete' && status !== 'completed';
      });
    }

    // Apply filters
    if (filterItem !== 'all') {
      result = result.filter(r => r.Item === filterItem);
    }
    if (filterStatus !== 'all') {
      result = result.filter(r => r.Status === filterStatus);
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
        case 'item':
          comparison = a.Item.localeCompare(b.Item);
          break;
        case 'status':
          comparison = a.Status.localeCompare(b.Status);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, filterItem, filterStatus, searchTerm, sortField, sortOrder, filterIncomplete]);

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

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
        </div>
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
        No joining journey records found
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
            value={filterItem}
            onChange={(e) => setFilterItem(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
          >
            {items.map(item => (
              <option key={item} value={item}>
                {item === 'all' ? 'All Items' : item}
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

          {incompleteCount > 0 && (
            <button
              onClick={() => setFilterIncomplete(!filterIncomplete)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterIncomplete
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
              }`}
            >
              Incomplete ({incompleteCount})
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
                Name {renderSortIcon("name")}
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Membership #
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('item')}
              >
                Item {renderSortIcon("item")}
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                Status {renderSortIcon("status")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No records match your filters
                </td>
              </tr>
            ) : (
              filteredRecords.map((record, index) => (
                <tr key={`${record['Membership number']}-${record.Item}-${index}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {onMemberSelect ? (
                        <button
                          onClick={() => onMemberSelect(record['Membership number'], `${record['First name']} ${record['Last name']}`)}
                          className="text-left hover:text-purple-700 hover:underline focus:outline-none focus:underline"
                        >
                          {record['First name']} {record['Last name']}
                        </button>
                      ) : (
                        `${record['First name']} ${record['Last name']}`
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {record['Membership number']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {record.Item}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[record.Status] || 'bg-gray-100 text-gray-800'}`}>
                      {record.Status}
                    </span>
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

export default JoiningJourneyTable;
