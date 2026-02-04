/**
 * Permits Table Component
 *
 * Displays activity permits (Nights Away, Water Activities, etc.)
 */

import { useState, useMemo } from 'react';
import type { PermitRecord } from '../types';

interface PermitsTableProps {
  records: PermitRecord[];
  isLoading: boolean;
}

type SortField = 'name' | 'category' | 'status' | 'expiry';
type SortOrder = 'asc' | 'desc';

const statusColors: Record<string, string> = {
  'Valid': 'bg-green-100 text-green-800',
  'Active': 'bg-green-100 text-green-800',
  'Expired': 'bg-red-100 text-red-800',
  'Pending': 'bg-yellow-100 text-yellow-800',
  'Suspended': 'bg-red-100 text-red-800',
};

export function PermitsTable({ records, isLoading }: PermitsTableProps) {
  const [sortField, setSortField] = useState<SortField>('expiry');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const unique = new Set(records.map(r => r['Permit category']));
    return ['all', ...Array.from(unique).filter(Boolean).sort()];
  }, [records]);

  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (filterCategory !== 'all') {
      result = result.filter(r => r['Permit category'] === filterCategory);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r['First name'].toLowerCase().includes(term) ||
        r['Last name'].toLowerCase().includes(term) ||
        r['Membership number'].includes(term) ||
        (r['Permit category'] || '').toLowerCase().includes(term)
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
        case 'category':
          comparison = (a['Permit category'] || '').localeCompare(b['Permit category'] || '');
          break;
        case 'status':
          comparison = (a['Permit status'] || '').localeCompare(b['Permit status'] || '');
          break;
        case 'expiry':
          const aDate = a['Permit expiry date'] ? new Date(a['Permit expiry date']).getTime() : Infinity;
          const bDate = b['Permit expiry date'] ? new Date(b['Permit expiry date']).getTime() : Infinity;
          comparison = aDate - bDate;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, filterCategory, searchTerm, sortField, sortOrder]);

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
        No permit records found
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search by name, membership # or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
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
                Name <SortIcon field="name" />
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Membership #
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('category')}
              >
                Category <SortIcon field="category" />
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Type
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
                Expiry <SortIcon field="expiry" />
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
                <tr key={`${record['Membership number']}-${record['Permit category']}-${index}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {record['First name']} {record['Last name']}
                    </div>
                    {record['Unit name'] && (
                      <div className="text-sm text-gray-500">{record['Unit name']}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {record['Membership number']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {record['Permit category']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {record['Permit type'] || '-'}
                    {record['Permit restriction details'] && (
                      <div className="text-xs text-gray-400">{record['Permit restriction details']}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[record['Permit status']] || 'bg-gray-100 text-gray-800'}`}>
                      {record['Permit status']}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(record['Permit expiry date'])}
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

export default PermitsTable;
