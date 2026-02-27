/**
 * Member Dashboard Component
 *
 * Shows all data for a single member as compact, color-coded status widgets.
 * Each section (learning, joining journey, disclosures, etc.) is displayed
 * as a panel of widgets showing status and expiry date at a glance.
 * Accessed by clicking a member name in any table in the main dashboard.
 */

import type { LearningRecord, JoiningJourneyRecord, DisclosureRecord, TeamReviewRecord, PermitRecord, AwardRecord } from '../types';
import type { LoadState } from './LazySection';

interface MemberDashboardProps {
  membershipNumber: string;
  name: string;
  learningRecords: LearningRecord[];
  joiningJourneyRecords: JoiningJourneyRecord[];
  joiningJourneyState: LoadState;
  disclosureRecords: DisclosureRecord[];
  disclosuresState: LoadState;
  teamReviewRecords: TeamReviewRecord[];
  teamReviewsState: LoadState;
  permitRecords: PermitRecord[];
  permitsState: LoadState;
  awardRecords: AwardRecord[];
  awardsState: LoadState;
  onBack: () => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
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

const learningStatusColors: Record<string, string> = {
  'Valid': 'bg-green-100 text-green-800 border-green-200',
  'In-Progress': 'bg-blue-100 text-blue-800 border-blue-200',
  'Expiring': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Renewal Due': 'bg-orange-100 text-orange-800 border-orange-200',
  'Expired': 'bg-red-100 text-red-800 border-red-200',
  'Not Started': 'bg-gray-100 text-gray-600 border-gray-200',
};

const joiningStatusColors: Record<string, string> = {
  'Complete': 'bg-green-100 text-green-800 border-green-200',
  'Completed': 'bg-green-100 text-green-800 border-green-200',
  'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
  'In-Progress': 'bg-blue-100 text-blue-800 border-blue-200',
  'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Not Started': 'bg-gray-100 text-gray-600 border-gray-200',
  'Incomplete': 'bg-red-100 text-red-800 border-red-200',
  'Overdue': 'bg-red-100 text-red-800 border-red-200',
};

const disclosureStatusColors: Record<string, string> = {
  'Disclosure Valid': 'bg-green-100 text-green-800 border-green-200',
  'Valid': 'bg-green-100 text-green-800 border-green-200',
  'Disclosure Expired': 'bg-red-100 text-red-800 border-red-200',
  'Expired': 'bg-red-100 text-red-800 border-red-200',
  'Renewal Due': 'bg-orange-100 text-orange-800 border-orange-200',
  'Pending': 'bg-blue-100 text-blue-800 border-blue-200',
  'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
};

const permitStatusColors: Record<string, string> = {
  'Valid': 'bg-green-100 text-green-800 border-green-200',
  'Active': 'bg-green-100 text-green-800 border-green-200',
  'Expired': 'bg-red-100 text-red-800 border-red-200',
  'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Suspended': 'bg-red-100 text-red-800 border-red-200',
};

const teamReviewStatusColors: Record<string, string> = {
  'Overdue': 'bg-red-100 text-red-800 border-red-200',
  'On Track': 'bg-green-100 text-green-800 border-green-200',
};

const dotColors: Record<string, string> = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  gray: 'bg-gray-400',
};

function getDotColor(status: string, colorMap: Record<string, string>): string {
  const classes = colorMap[status] || '';
  for (const [key, dotClass] of Object.entries(dotColors)) {
    if (classes.includes(key)) return dotClass;
  }
  return dotColors.gray;
}

function StatusDot({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${getDotColor(status, colorMap)}`} />;
}

function SectionPlaceholder({ state, label }: { state: LoadState; label: string }) {
  if (state === 'loading') {
    return (
      <div className="text-center text-gray-500 py-4">
        <span className="text-purple-600 animate-pulse">Loading {label}…</span>
      </div>
    );
  }
  if (state === 'idle') {
    return (
      <div className="text-center text-gray-500 py-4">
        <span>{label} not yet loaded. Scroll down on the main dashboard to load it.</span>
      </div>
    );
  }
  return null;
}

function EmptySection({ label }: { label: string }) {
  return (
    <div className="text-sm text-gray-400 py-2">No {label} found</div>
  );
}

export function MemberDashboard({
  membershipNumber,
  name,
  learningRecords,
  joiningJourneyRecords,
  joiningJourneyState,
  disclosureRecords,
  disclosuresState,
  teamReviewRecords,
  teamReviewsState,
  permitRecords,
  permitsState,
  awardRecords,
  awardsState,
  onBack,
}: MemberDashboardProps) {
  const memberLearning = learningRecords.filter(
    r => r['Membership number'] === membershipNumber
  );
  const memberJoiningJourney = joiningJourneyRecords.filter(
    r => r['Membership number'] === membershipNumber
  );
  const memberDisclosures = disclosureRecords.filter(
    r => r['Membership number'] === membershipNumber
  );
  const memberTeamReviews = teamReviewRecords.filter(
    r => r['Membership number'] === membershipNumber
  );
  const memberPermits = permitRecords.filter(
    r => r['Membership number'] === membershipNumber
  );
  const memberAwards = awardRecords.filter(
    r => r['Membership number'] === membershipNumber
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            ← Back to Dashboard
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{name}</h1>
            <p className="text-sm text-gray-500 font-mono">{membershipNumber}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Learning Records */}
        <section className="bg-white rounded-lg shadow-sm border" data-testid="learning-section">
          <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b bg-gray-50 rounded-t-lg">Learning Records</h2>
          <div className="divide-y divide-gray-100">
            {memberLearning.length === 0 ? (
              <div className="px-4"><EmptySection label="learning records" /></div>
            ) : (
              memberLearning.map((r, i) => (
                <div key={`${r.Learning}-${i}`} className={`flex items-center justify-between px-4 py-3 ${learningStatusColors[r.Status] || 'bg-white border-gray-200'}`}>
                  <div className="flex items-center gap-3">
                    <StatusDot status={r.Status} colorMap={learningStatusColors} />
                    <span className="font-medium text-sm">{r.Learning}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60">{r.Status}</span>
                    {r['Expiry date'] ? (
                      <span className="text-xs text-gray-600 tabular-nums">{formatDate(r['Expiry date'])}</span>
                    ) : r['Start date'] ? (
                      <span className="text-xs text-gray-400 italic">Started {formatDate(r['Start date'])}</span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Joining Journey */}
        <section className="bg-white rounded-lg shadow-sm border" data-testid="joining-journey-section">
          <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b bg-gray-50 rounded-t-lg">Joining Journey</h2>
          {joiningJourneyState === 'idle' || joiningJourneyState === 'loading' ? (
            <SectionPlaceholder state={joiningJourneyState} label="joining journey data" />
          ) : (
            <div className="divide-y divide-gray-100">
              {memberJoiningJourney.length === 0 ? (
                <div className="px-4"><EmptySection label="joining journey records" /></div>
              ) : (
                memberJoiningJourney.map((r, i) => (
                  <div key={`${r.Item}-${i}`} className={`flex items-center justify-between px-4 py-3 ${joiningStatusColors[r.Status] || 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                      <StatusDot status={r.Status} colorMap={joiningStatusColors} />
                      <span className="font-medium text-sm">{r.Item}</span>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60">{r.Status}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Disclosure Compliance */}
        <section className="bg-white rounded-lg shadow-sm border" data-testid="disclosure-section">
          <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b bg-gray-50 rounded-t-lg">Disclosure Compliance</h2>
          {disclosuresState === 'idle' || disclosuresState === 'loading' ? (
            <SectionPlaceholder state={disclosuresState} label="disclosure data" />
          ) : (
            <div className="divide-y divide-gray-100">
              {memberDisclosures.length === 0 ? (
                <div className="px-4"><EmptySection label="disclosure records" /></div>
              ) : (
                memberDisclosures.map((r, i) => (
                  <div key={`${r['Disclosure authority']}-${i}`} className={`flex items-center justify-between px-4 py-3 ${disclosureStatusColors[r['Disclosure status']] || 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                      <StatusDot status={r['Disclosure status']} colorMap={disclosureStatusColors} />
                      <span className="font-medium text-sm">{r['Disclosure authority']}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60">{r['Disclosure status']}</span>
                      {r['Disclosure expiry date'] && (
                        <span className="text-xs text-gray-600 tabular-nums">{formatDate(r['Disclosure expiry date'])}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Team Directory Reviews */}
        <section className="bg-white rounded-lg shadow-sm border" data-testid="team-reviews-section">
          <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b bg-gray-50 rounded-t-lg">Team Directory Reviews</h2>
          {teamReviewsState === 'idle' || teamReviewsState === 'loading' ? (
            <SectionPlaceholder state={teamReviewsState} label="team review data" />
          ) : (
            <div className="divide-y divide-gray-100">
              {memberTeamReviews.length === 0 ? (
                <div className="px-4"><EmptySection label="team review records" /></div>
              ) : (
                memberTeamReviews.map((r, i) => {
                  const isOverdue = r['Review overdue']?.toLowerCase() === 'yes' || r['Review overdue'] === 'true';
                  const reviewStatus = isOverdue ? 'Overdue' : 'On Track';
                  return (
                    <div key={`${r.Role}-${i}`} className={`flex items-center justify-between px-4 py-3 ${teamReviewStatusColors[reviewStatus]}`}>
                      <div className="flex items-center gap-3">
                        <StatusDot status={reviewStatus} colorMap={teamReviewStatusColors} />
                        <span className="font-medium text-sm">{r.Role}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60">{reviewStatus}</span>
                        {r['Scheduled review date'] && (
                          <span className="text-xs text-gray-600 tabular-nums">{formatDate(r['Scheduled review date'])}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        {/* Permits */}
        <section className="bg-white rounded-lg shadow-sm border" data-testid="permits-section">
          <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b bg-gray-50 rounded-t-lg">Permits</h2>
          {permitsState === 'idle' || permitsState === 'loading' ? (
            <SectionPlaceholder state={permitsState} label="permit data" />
          ) : (
            <div className="divide-y divide-gray-100">
              {memberPermits.length === 0 ? (
                <div className="px-4"><EmptySection label="permit records" /></div>
              ) : (
                memberPermits.map((r, i) => (
                  <div key={`${r['Permit category']}-${i}`} className={`flex items-center justify-between px-4 py-3 ${permitStatusColors[r['Permit status']] || 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                      <StatusDot status={r['Permit status']} colorMap={permitStatusColors} />
                      <div>
                        <span className="font-medium text-sm">{r['Permit category']}</span>
                        {r['Permit type'] && <span className="text-xs text-gray-500 ml-1">({r['Permit type']})</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60">{r['Permit status']}</span>
                      {r['Permit expiry date'] && (
                        <span className="text-xs text-gray-600 tabular-nums">{formatDate(r['Permit expiry date'])}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Awards & Recognitions */}
        <section className="bg-white rounded-lg shadow-sm border" data-testid="awards-section">
          <h2 className="text-base font-semibold text-gray-900 px-4 py-3 border-b bg-gray-50 rounded-t-lg">Awards &amp; Recognitions</h2>
          {awardsState === 'idle' || awardsState === 'loading' ? (
            <SectionPlaceholder state={awardsState} label="awards data" />
          ) : (
            <div className="divide-y divide-gray-100">
              {memberAwards.length === 0 ? (
                <div className="px-4"><EmptySection label="award records" /></div>
              ) : (
                memberAwards.map((r, i) => (
                  <div key={`${r.Accreditation}-${i}`} className="flex items-center justify-between px-4 py-3 bg-purple-50 border-purple-200">
                    <div className="flex items-center gap-3">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-500" />
                      <span className="font-medium text-sm text-purple-800">{r.Accreditation}</span>
                    </div>
                    <span className="text-xs text-purple-600">{r.Role}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default MemberDashboard;
