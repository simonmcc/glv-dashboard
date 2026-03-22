/**
 * Joining Journey Progress Component
 *
 * Group-level overview: one row per member currently in their joining journey,
 * showing which steps are outstanding. Growing Roots is expanded to individual
 * module-level status derived from learningRecords.
 */

import { useMemo, useState } from 'react';
import type { JoiningJourneyRecord, LearningRecord } from '../types';
import { GROWING_ROOTS_MODULES } from '../utils';

interface JoiningJourneyProgressProps {
  joiningJourneyRecords: JoiningJourneyRecord[];
  learningRecords: LearningRecord[];
  isLoading: boolean;
  onMemberSelect?: (membershipNumber: string, name: string) => void;
  searchTerm?: string;
}

// The discrete journey steps tracked by InProgressActionDashboardView
const JOURNEY_STEPS: ReadonlyArray<{ item: string; abbr: string }> = [
  { item: 'Criminal Record Check', abbr: 'CRC' },
  { item: 'Internal Check', abbr: 'Int. Check' },
  { item: 'References', abbr: 'Ref.' },
  { item: 'Declaration', abbr: 'Decl.' },
  { item: 'Trustee Eligibility Check', abbr: 'Trustee' },
  { item: 'Welcome Conversation', abbr: 'Welcome' },
];

type ItemStatus = 'complete' | 'incomplete' | 'valid' | 'not-started' | 'expiring' | 'expired' | 'in-progress';

function StatusChip({ status, label, deadline30 = false }: { status: ItemStatus; label: string; deadline30?: boolean }) {
  const colorClass: Record<ItemStatus, string> = {
    'complete':    'bg-green-100 text-green-800',
    'valid':       'bg-green-100 text-green-800',
    'incomplete':  'bg-red-100 text-red-800',
    'not-started': 'bg-gray-100 text-gray-600',
    'expiring':    'bg-yellow-100 text-yellow-800',
    'expired':     'bg-red-100 text-red-800',
    'in-progress': 'bg-blue-100 text-blue-800',
  };

  const icon: Record<ItemStatus, string> = {
    'complete':    '✓',
    'valid':       '✓',
    'incomplete':  '✗',
    'not-started': '–',
    'expiring':    '⚠',
    'expired':     '✗',
    'in-progress': '⟳',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colorClass[status]}`}>
      {icon[status]} {label}{deadline30 && <span className="text-[10px] opacity-70 ml-0.5">30d</span>}
    </span>
  );
}

function learningStatusToItemStatus(status: string): ItemStatus {
  switch (status) {
    case 'Valid': return 'valid';
    case 'Expiring': case 'Expiring Soon': case 'Renewal Due': return 'expiring';
    case 'Expired': return 'expired';
    case 'In-Progress': return 'in-progress';
    default: return 'not-started';
  }
}

export function JoiningJourneyProgress({
  joiningJourneyRecords,
  learningRecords,
  isLoading,
  onMemberSelect,
  searchTerm = '',
}: JoiningJourneyProgressProps) {
  const [sortBy, setSortBy] = useState<'name' | 'outstanding'>('outstanding');

  // Build per-member view: group outstanding items by member
  const members = useMemo(() => {
    // Index outstanding items per member
    const byMember = new Map<string, {
      membershipNumber: string;
      firstName: string;
      lastName: string;
      outstandingItems: Set<string>;
    }>();

    for (const r of joiningJourneyRecords) {
      const num = r['Membership number'];
      if (!byMember.has(num)) {
        byMember.set(num, {
          membershipNumber: num,
          firstName: r['First name'],
          lastName: r['Last name'],
          outstandingItems: new Set(),
        });
      }
      byMember.get(num)!.outstandingItems.add(r.Item);
    }

    return Array.from(byMember.values());
  }, [joiningJourneyRecords]);

  // Index learning records by membership number → module title → status
  const learningByMember = useMemo(() => {
    const index = new Map<string, Map<string, string>>();
    for (const r of learningRecords) {
      const num = r['Membership number'];
      if (!index.has(num)) index.set(num, new Map());
      index.get(num)!.set(r.Learning, r.Status);
    }
    return index;
  }, [learningRecords]);

  // Filter by search term
  const filtered = useMemo(() => {
    if (!searchTerm) return members;
    const term = searchTerm.toLowerCase();
    return members.filter(m =>
      m.firstName.toLowerCase().includes(term) ||
      m.lastName.toLowerCase().includes(term) ||
      m.membershipNumber.includes(term)
    );
  }, [members, searchTerm]);

  // Sort
  const sorted = useMemo(() => {
    // Count the number of visible chips a member would show, expanding Growing Roots
    // to individual module chips so the sort matches what the user sees.
    const getChipCount = (member: { membershipNumber: string; outstandingItems: Set<string> }): number => {
      const memberModules = learningByMember.get(member.membershipNumber);
      let count = 0;
      for (const item of member.outstandingItems) {
        if (item === 'Growing Roots') {
          const outstandingGR = GROWING_ROOTS_MODULES.filter(grModule => {
            const rawStatus = memberModules?.get(grModule.name);
            const status = rawStatus ? learningStatusToItemStatus(rawStatus) : 'not-started';
            return status !== 'valid' && status !== 'complete';
          }).length;
          // At least 1 (the fallback chip) even if all GR modules are done
          count += Math.max(outstandingGR, 1);
        } else {
          count += 1;
        }
      }
      return count;
    };

    return [...filtered].sort((a, b) => {
      if (sortBy === 'outstanding') {
        return getChipCount(b) - getChipCount(a) ||
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
      }
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    });
  }, [filtered, sortBy, learningByMember]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
        No members currently in their joining journey
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Toolbar */}
      <div className="p-4 border-b flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort:</span>
          <button
            onClick={() => setSortBy('outstanding')}
            className={`px-3 py-1.5 text-sm rounded-lg ${sortBy === 'outstanding' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Most outstanding
          </button>
          <button
            onClick={() => setSortBy('name')}
            className={`px-3 py-1.5 text-sm rounded-lg ${sortBy === 'name' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Name
          </button>
        </div>
        <span className="text-sm text-gray-500 ml-auto">
          {sorted.length} member{sorted.length !== 1 ? 's' : ''} in joining journey
        </span>
      </div>

      {/* Member rows */}
      <div className="divide-y divide-gray-100">
        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">No records match your search</div>
        ) : (
          sorted.map(member => {
            const memberModules = learningByMember.get(member.membershipNumber);
            const growingRootsOutstanding = member.outstandingItems.has('Growing Roots');

            // Compute outstanding GR module chips; if all are done show a fallback chip
            const outstandingGRChips = growingRootsOutstanding
              ? GROWING_ROOTS_MODULES.map(grModule => {
                  const rawStatus = memberModules?.get(grModule.name);
                  const status = rawStatus ? learningStatusToItemStatus(rawStatus) : 'not-started' as ItemStatus;
                  return { ...grModule, status };
                }).filter(m => m.status !== 'valid' && m.status !== 'complete')
              : [];

            return (
              <div key={member.membershipNumber} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  {/* Name */}
                  <div className="min-w-[140px] max-w-[200px]">
                    {onMemberSelect ? (
                      <button
                        onClick={() => onMemberSelect(member.membershipNumber, `${member.firstName} ${member.lastName}`)}
                        className="text-sm font-medium text-left hover:text-purple-700 hover:underline focus:outline-none focus:underline"
                      >
                        {member.firstName} {member.lastName}
                      </button>
                    ) : (
                      <span className="text-sm font-medium">{member.firstName} {member.lastName}</span>
                    )}
                    <div className="text-xs text-gray-400 font-mono">{member.membershipNumber}</div>
                  </div>

                  {/* Outstanding chips */}
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {/* Admin/process steps */}
                    {JOURNEY_STEPS.map(step => {
                      if (!member.outstandingItems.has(step.item)) return null;
                      return (
                        <StatusChip key={step.item} status="incomplete" label={step.abbr} />
                      );
                    })}

                    {/* Growing Roots — expanded to individual module chips */}
                    {growingRootsOutstanding && (
                      outstandingGRChips.length > 0
                        ? outstandingGRChips.map(grModule => (
                            <StatusChip
                              key={grModule.name}
                              status={grModule.status}
                              label={grModule.name}
                              deadline30={grModule.deadlineDays === 30}
                            />
                          ))
                        // Fallback: all modules are done but GR is still marked outstanding in the journey
                        : <StatusChip status="incomplete" label="Growing Roots" />
                    )}

                    {/* Core Learning (if outstanding, shown as-is — individual modules unknown) */}
                    {member.outstandingItems.has('Core Learning') && (
                      <StatusChip status="incomplete" label="Core Learning" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default JoiningJourneyProgress;
