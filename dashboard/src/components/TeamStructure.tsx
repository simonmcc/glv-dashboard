import { useMemo } from 'react';
import type { TeamReviewRecord } from '../types';

interface TeamStructureProps {
  records: TeamReviewRecord[];
  isLoading: boolean;
  memberNameMap?: Map<string, string>;
  searchTerm?: string;
}

function resolveName(record: TeamReviewRecord, map?: Map<string, string>): string {
  const fromRecord = [record['First name'], record['Last name']].filter(Boolean).join(' ').trim();
  if (fromRecord) return fromRecord;
  if (record['Team leader']?.trim()) return record['Team leader'];
  return map?.get(record['Membership number']) ?? record['Membership number'];
}

function sectionFamily(role: string): string {
  const r = role.toLowerCase();
  if (r.includes('beaver')) return 'Beavers';
  if (r.includes('cub')) return 'Cubs';
  if (r.includes('explorer')) return 'Explorers';
  if (r.includes('network')) return 'Network';
  if (r.includes('scout')) return 'Scouts';
  if (r.includes('group') || r.includes('gsl')) return 'Group';
  if (r.includes('district') || r.includes('county') || r.includes('region')) return 'District';
  return 'Other';
}

const SECTION_ORDER = ['Group', 'Beavers', 'Cubs', 'Scouts', 'Explorers', 'Network', 'District', 'Other'];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function isOverdue(record: TeamReviewRecord): boolean {
  return record['Review overdue']?.toLowerCase() === 'yes' || record['Review overdue'] === 'true';
}

export function TeamStructure({ records, isLoading, memberNameMap, searchTerm = '' }: TeamStructureProps) {
  const grouped = useMemo(() => {
    let filtered = records;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = records.filter(r =>
        resolveName(r, memberNameMap).toLowerCase().includes(term) ||
        (r['Role'] || '').toLowerCase().includes(term) ||
        r['Membership number'].includes(term)
      );
    }

    // Group by Group → section family
    const byGroup = new Map<string, Map<string, TeamReviewRecord[]>>();
    for (const record of filtered) {
      const group = record['Group'] || 'Unknown Group';
      if (!byGroup.has(group)) byGroup.set(group, new Map());
      const bySec = byGroup.get(group)!;
      const sec = sectionFamily(record['Role'] || '');
      if (!bySec.has(sec)) bySec.set(sec, []);
      bySec.get(sec)!.push(record);
    }

    // Sort groups alphabetically; sort sections by SECTION_ORDER
    return Array.from(byGroup.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, bySec]) => ({
        group,
        sections: SECTION_ORDER
          .filter(s => bySec.has(s))
          .map(s => ({ section: s, members: bySec.get(s)! })),
      }));
  }, [records, memberNameMap, searchTerm]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-48 animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="h-20 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
        No team records found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ group, sections }) => (
        <div key={group} className="bg-white rounded-lg shadow-sm border">
          <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
            <h3 className="font-semibold text-gray-900">{group}</h3>
          </div>
          <div className="p-4 space-y-4">
            {sections.map(({ section, members }) => (
              <div key={section}>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{section}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {members.map((record, idx) => {
                    const overdue = isOverdue(record);
                    return (
                      <div
                        key={`${record['Membership number']}-${idx}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                      >
                        <div className="font-medium text-gray-900 truncate">
                          {resolveName(record, memberNameMap)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{record['Role']}</div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-400 font-mono">{record['Membership number']}</span>
                          {record['Scheduled review date'] ? (
                            <span className={`text-xs font-medium ${overdue ? 'text-red-700' : 'text-gray-500'}`}>
                              {overdue ? 'Overdue' : formatDate(record['Scheduled review date'])}
                            </span>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">On Track</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default TeamStructure;
