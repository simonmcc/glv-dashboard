/**
 * Member Dashboard Component
 *
 * Shows all data for a single member: learning, joining journey,
 * disclosure compliance, team directory reviews, permits, and awards.
 * Accessed by clicking a member name in any table in the main dashboard.
 */

import type { LearningRecord, JoiningJourneyRecord, DisclosureRecord, TeamReviewRecord, PermitRecord, AwardRecord } from '../types';
import type { LoadState } from './LazySection';
import { ComplianceTable } from './ComplianceTable';
import { JoiningJourneyTable } from './JoiningJourneyTable';
import { DisclosureTable } from './DisclosureTable';
import { TeamReviewsTable } from './TeamReviewsTable';
import { PermitsTable } from './PermitsTable';
import { AwardsTable } from './AwardsTable';

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

function SectionPlaceholder({ state, label }: { state: LoadState; label: string }) {
  if (state === 'loading') {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
        <span className="text-purple-600 animate-pulse">Loading {label}…</span>
      </div>
    );
  }
  if (state === 'idle') {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
        <span>{label} not yet loaded. Scroll down on the main dashboard to load it.</span>
      </div>
    );
  }
  return null;
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
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Learning Records */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Learning Records</h2>
          <ComplianceTable records={memberLearning} isLoading={false} />
        </section>

        {/* Joining Journey */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Joining Journey</h2>
          {joiningJourneyState === 'idle' || joiningJourneyState === 'loading' ? (
            <SectionPlaceholder state={joiningJourneyState} label="joining journey data" />
          ) : (
            <JoiningJourneyTable records={memberJoiningJourney} isLoading={false} />
          )}
        </section>

        {/* Disclosure Compliance */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Disclosure Compliance</h2>
          {disclosuresState === 'idle' || disclosuresState === 'loading' ? (
            <SectionPlaceholder state={disclosuresState} label="disclosure data" />
          ) : (
            <DisclosureTable records={memberDisclosures} summary={null} isLoading={false} />
          )}
        </section>

        {/* Team Directory Reviews */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Directory Reviews</h2>
          {teamReviewsState === 'idle' || teamReviewsState === 'loading' ? (
            <SectionPlaceholder state={teamReviewsState} label="team review data" />
          ) : (
            <TeamReviewsTable records={memberTeamReviews} isLoading={false} />
          )}
        </section>

        {/* Permits */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Permits</h2>
          {permitsState === 'idle' || permitsState === 'loading' ? (
            <SectionPlaceholder state={permitsState} label="permit data" />
          ) : (
            <PermitsTable records={memberPermits} isLoading={false} />
          )}
        </section>

        {/* Awards & Recognitions */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Awards &amp; Recognitions</h2>
          {awardsState === 'idle' || awardsState === 'loading' ? (
            <SectionPlaceholder state={awardsState} label="awards data" />
          ) : (
            <AwardsTable records={memberAwards} isLoading={false} />
          )}
        </section>
      </main>
    </div>
  );
}

export default MemberDashboard;
