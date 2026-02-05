/**
 * Appointments Table Component
 *
 * Displays appointment progress and EDI data.
 */

import { useState, useMemo } from 'react';
import type { AppointmentRecord } from '../types';

interface AppointmentsTableProps {
  records: AppointmentRecord[];
  isLoading: boolean;
}

type SortField = 'name' | 'role' | 'start';
type SortOrder = 'asc' | 'desc';

export function AppointmentsTable({ records, isLoading }: AppointmentsTableProps) {
  const [sortField, setSortField] = useState<SortField>('start');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEDI, setFilterEDI] = useState<string>('all');

  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (filterEDI !== 'all') {
      result = result.filter(r => r['EDI'] === filterEDI);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r['First name'].toLowerCase().includes(term) ||
        r['Last name'].toLowerCase().includes(term) ||
        r['Membership number'].includes(term) ||
        (r['Role/Accreditation'] || '').toLowerCase().includes(term)
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
        case 'role':
          comparison = (a['Role/Accreditation'] || '').localeCompare(b['Role/Accreditation'] || '');
          break;
        case 'start': {
          const aDate = a['Start date'] ? new Date(a['Start date']).getTime() : 0;
          const bDate = b['Start date'] ? new Date(b['Start date']).getTime() : 0;
          comparison = aDate - bDate;
          break;
        }
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, filterEDI, searchTerm, sortField, sortOrder]);

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

  // Count EDI incomplete
  const ediIncompleteCount = useMemo(() => {
    return records.filter(r => r['EDI'] === '0' || r['EDI'] === 'false').length;
  }, [records]);

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
        No appointment records found
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search by name, membership # or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          {ediIncompleteCount > 0 && (
            <button
              onClick={() => setFilterEDI(filterEDI === '0' ? 'all' : '0')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterEDI === '0'
                  ? 'bg-orange-600 text-white'
                  : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
              }`}
            >
              EDI Incomplete ({ediIncompleteCount})
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
                Role/Accreditation {renderSortIcon("role")}
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('start')}
              >
                Start Date {renderSortIcon("start")}
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Days in Role
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                EDI
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
                    {record['Group'] && (
                      <div className="text-sm text-gray-500">{record['Group']}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {record['Membership number']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {record['Role/Accreditation']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(record['Start date'])}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {record['Days since role Started'] ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      record['EDI'] === '1' || record['EDI'] === 'true'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {record['EDI'] === '1' || record['EDI'] === 'true' ? 'Complete' : 'Incomplete'}
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

export default AppointmentsTable;
