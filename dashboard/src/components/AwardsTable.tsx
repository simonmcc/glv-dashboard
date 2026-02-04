/**
 * Awards Table Component
 *
 * Displays awards and recognitions.
 */

import { useState, useMemo } from 'react';
import type { AwardRecord } from '../types';

interface AwardsTableProps {
  records: AwardRecord[];
  isLoading: boolean;
}

type SortField = 'name' | 'accreditation' | 'role';
type SortOrder = 'asc' | 'desc';

export function AwardsTable({ records, isLoading }: AwardsTableProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAccreditation, setFilterAccreditation] = useState<string>('all');

  const accreditations = useMemo(() => {
    const unique = new Set(records.map(r => r['Accreditation']));
    return ['all', ...Array.from(unique).filter(Boolean).sort()];
  }, [records]);

  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (filterAccreditation !== 'all') {
      result = result.filter(r => r['Accreditation'] === filterAccreditation);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r['First name'].toLowerCase().includes(term) ||
        r['Last name'].toLowerCase().includes(term) ||
        r['Membership number'].includes(term) ||
        (r['Accreditation'] || '').toLowerCase().includes(term)
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
        case 'accreditation':
          comparison = (a['Accreditation'] || '').localeCompare(b['Accreditation'] || '');
          break;
        case 'role':
          comparison = (a['Role'] || '').localeCompare(b['Role'] || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, filterAccreditation, searchTerm, sortField, sortOrder]);

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
        No award records found
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search by name, membership # or accreditation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <select
            value={filterAccreditation}
            onChange={(e) => setFilterAccreditation(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
          >
            {accreditations.map(acc => (
              <option key={acc} value={acc}>
                {acc === 'all' ? 'All Accreditations' : acc}
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
                onClick={() => handleSort('accreditation')}
              >
                Accreditation <SortIcon field="accreditation" />
              </th>
              <th
                className="px-4 py-3 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('role')}
              >
                Role <SortIcon field="role" />
              </th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-900">
                Team / Unit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No records match your filters
                </td>
              </tr>
            ) : (
              filteredRecords.map((record, index) => (
                <tr key={`${record['Membership number']}-${record['Accreditation']}-${index}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {record['First name']} {record['Last name']}
                    </div>
                    {record['Communication email'] && (
                      <div className="text-sm text-gray-500">{record['Communication email']}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {record['Membership number']}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      {record['Accreditation']}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {record['Role']}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {record['Team'] && <div>{record['Team']}</div>}
                    {record['Unit name'] && <div className="text-gray-400">{record['Unit name']}</div>}
                    {!record['Team'] && !record['Unit name'] && '-'}
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

export default AwardsTable;
