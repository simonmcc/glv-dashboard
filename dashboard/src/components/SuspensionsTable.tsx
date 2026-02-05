/**
 * Suspensions Table Component
 *
 * Displays suspended member records.
 */

import { useState, useMemo } from 'react';
import type { SuspensionRecord } from '../types';

interface SuspensionsTableProps {
  records: SuspensionRecord[];
  isLoading: boolean;
}

type SortField = 'name' | 'date' | 'role';
type SortOrder = 'asc' | 'desc';

export function SuspensionsTable({ records, isLoading }: SuspensionsTableProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r['First name'].toLowerCase().includes(term) ||
        r['Last name'].toLowerCase().includes(term) ||
        r['Membership number'].includes(term)
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = `${a['Last name']} ${a['First name']}`.localeCompare(
            `${b['Last name']} ${b['First name']}`
          );
          break;
        case 'date': {
          const aDate = a['Suspension date'] ? new Date(a['Suspension date']).getTime() : 0;
          const bDate = b['Suspension date'] ? new Date(b['Suspension date']).getTime() : 0;
          comparison = aDate - bDate;
          break;
        }
        case 'role':
          comparison = (a['Role'] || '').localeCompare(b['Role'] || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, searchTerm, sortField, sortOrder]);

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
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
        No suspended members
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search by name or membership number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
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
                onClick={() => handleSort('name')}
              >
                Name {renderSortIcon("name")}
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Membership #
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('role')}
              >
                Role {renderSortIcon("role")}
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Team / Unit
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('date')}
              >
                Suspension Date {renderSortIcon("date")}
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Reason
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
                      {record['First name']} {record['Last name']}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {record['Membership number']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {record['Role']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {record['Team'] && <div>{record['Team']}</div>}
                    {record['Unit name'] && <div className="text-gray-400">{record['Unit name']}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(record['Suspension date'])}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {record['Suspension reason'] || '-'}
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

export default SuspensionsTable;
