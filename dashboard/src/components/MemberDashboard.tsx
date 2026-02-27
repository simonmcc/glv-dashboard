/**
 * Member Dashboard Component
 *
 * Shows all learning and joining journey data for a single member.
 * Accessed by clicking a member name in any table in the main dashboard.
 */

import type { LearningRecord, JoiningJourneyRecord } from '../types';
import type { LoadState } from './LazySection';
import { ComplianceTable } from './ComplianceTable';
import { JoiningJourneyTable } from './JoiningJourneyTable';

interface MemberDashboardProps {
  membershipNumber: string;
  name: string;
  learningRecords: LearningRecord[];
  joiningJourneyRecords: JoiningJourneyRecord[];
  joiningJourneyState: LoadState;
  onBack: () => void;
}

export function MemberDashboard({
  membershipNumber,
  name,
  learningRecords,
  joiningJourneyRecords,
  joiningJourneyState,
  onBack,
}: MemberDashboardProps) {
  const memberLearning = learningRecords.filter(
    r => r['Membership number'] === membershipNumber
  );

  const memberJoiningJourney = joiningJourneyRecords.filter(
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
            <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
              {joiningJourneyState === 'loading' ? (
                <span className="text-purple-600 animate-pulse">Loading joining journey data…</span>
              ) : (
                <span>Joining journey data not yet loaded. Scroll down on the main dashboard to load it.</span>
              )}
            </div>
          ) : (
            <JoiningJourneyTable records={memberJoiningJourney} isLoading={false} />
          )}
        </section>
      </main>
    </div>
  );
}

export default MemberDashboard;
