/**
 * Disclosure Table Component
 *
 * Displays disclosure/PVG compliance records in a sortable, filterable table.
 */

import { useState, useMemo } from 'react';
import type { DisclosureRecord, DisclosureSummary } from '../types';

interface DisclosureTableProps {
  records: DisclosureRecord[];
  summary: DisclosureSummary | null;
  isLoading: boolean;
  onMemberSelect?: (membershipNumber: string, name: string) => void;
}

type SortField = 'name' | 'status' | 'expiry' | 'authority';
type SortOrder = 'asc' | 'desc';

const statusColors: Record<string, string> = {
  'Disclosure Valid': 'bg-green-100 text-green-800',
  'Valid': 'bg-green-100 text-green-800',
  'Disclosure Expired': 'bg-red-100 text-red-800',
  'Expired': 'bg-red-100 text-red-800',
  'Renewal Due': 'bg-orange-100 text-orange-800',
  'Pending': 'bg-blue-100 text-blue-800',
  'In Progress': 'bg-blue-100 text-blue-800',
};

export function DisclosureTable({ records, summary, isLoading, onMemberSelect }: DisclosureTableProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterExpired, setFilterExpired] = useState(false);
  const [filterExpiringSoon, setFilterExpiringSoon] = useState(false);

  // Get unique statuses for filter
  const statuses = useMemo(() => {
    const unique = new Set(records.map(r => r['Disclosure status']));
    return ['all', ...Array.from(unique).sort()];
  }, [records]);

  // Filter and sort records
  const filteredRecords = useMemo(() => {
    let result = [...records];
    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    // Apply expired filter
    if (filterExpired) {
      result = result.filter(r => {
        if (r['Disclosure status']?.toLowerCase().includes('expired')) return true;
        if (r['Days since expiry'] && r['Days since expiry'] > 0) return true;
        if (r['Disclosure expiry date']) {
          return new Date(r['Disclosure expiry date']) < now;
        }
        return false;
      });
    }

    // Apply expiring soon filter
    if (filterExpiringSoon) {
      result = result.filter(r => {
        if (r['Disclosure expiry date']) {
          const expiry = new Date(r['Disclosure expiry date']);
          return expiry >= now && expiry < sixtyDaysFromNow;
        }
        return false;
      });
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      result = result.filter(r => r['Disclosure status'] === filterStatus);
    }

    // Apply search
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
        case 'status':
          comparison = (a['Disclosure status'] || '').localeCompare(b['Disclosure status'] || '');
          break;
        case 'expiry': {
          const dateA = a['Disclosure expiry date'] || '';
          const dateB = b['Disclosure expiry date'] || '';
          comparison = dateA.localeCompare(dateB);
          break;
        }
        case 'authority':
          comparison = (a['Disclosure authority'] || '').localeCompare(b['Disclosure authority'] || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, filterStatus, searchTerm, sortField, sortOrder, filterExpired, filterExpiringSoon]);

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

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Summary bar */}
      {summary && (
        <div className="p-4 bg-gray-50 border-b flex flex-wrap gap-4 items-center">
          <div className="text-sm">
            <span className="font-medium">{summary.total}</span> total
          </div>
          <div className="text-sm text-green-600">
            <span className="font-medium">{summary.valid}</span> valid
          </div>
          {summary.expiringSoon > 0 && (
            <div className="text-sm text-orange-600">
              <span className="font-medium">{summary.expiringSoon}</span> expiring soon
            </div>
          )}
          {summary.expired > 0 && (
            <div className="text-sm text-red-600">
              <span className="font-medium">{summary.expired}</span> expired
            </div>
          )}
        </div>
      )}

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

          {summary && summary.expired > 0 && (
            <button
              onClick={() => { setFilterExpired(!filterExpired); setFilterExpiringSoon(false); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterExpired
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-800 hover:bg-red-200'
              }`}
            >
              Expired ({summary.expired})
            </button>
          )}

          {summary && summary.expiringSoon > 0 && (
            <button
              onClick={() => { setFilterExpiringSoon(!filterExpiringSoon); setFilterExpired(false); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterExpiringSoon
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
              }`}
            >
              Expiring Soon ({summary.expiringSoon})
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
                onClick={() => handleSort('authority')}
              >
                Authority {renderSortIcon("authority")}
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                Status {renderSortIcon("status")}
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('expiry')}
              >
                Expiry Date {renderSortIcon("expiry")}
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Unit / Role
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
                <tr key={`${record['Membership number']}-${index}`} className="hover:bg-gray-50">
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
                    {record['Communication email'] && (
                      <div className="text-sm text-gray-500">{record['Communication email']}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {record['Membership number']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {record['Disclosure authority']}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[record['Disclosure status']] || 'bg-gray-100 text-gray-800'}`}>
                      {record['Disclosure status']}
                    </span>
                    {record['Days since expiry'] && record['Days since expiry'] > 0 && (
                      <div className="text-xs text-red-600 mt-1">
                        {record['Days since expiry']} days overdue
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(record['Disclosure expiry date'])}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {record['Unit name'] && <div>{record['Unit name']}</div>}
                    {record['Role name'] && <div className="text-gray-400">{record['Role name']}</div>}
                    {!record['Unit name'] && !record['Role name'] && '-'}
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

function formatDate(dateStr: string | null | undefined): string {
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

export default DisclosureTable;
