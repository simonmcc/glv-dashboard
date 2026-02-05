/**
 * Main Dashboard Component
 *
 * Orchestrates the dashboard layout and data fetching.
 */

import { useState, useEffect, useCallback } from 'react';
import { ScoutsApiClient } from '../api-client';
import { transformLearningResults } from '../utils';
import type { LearningRecord, ComplianceSummary, JoiningJourneyRecord, DisclosureRecord, DisclosureSummary, AppointmentRecord, SuspensionRecord, TeamReviewRecord, PermitRecord, AwardRecord } from '../types';
import { SummaryTiles } from './SummaryTiles';
import { ComplianceTable } from './ComplianceTable';
import { JoiningJourneyTable } from './JoiningJourneyTable';
import { DisclosureTable } from './DisclosureTable';
import { AppointmentsTable } from './AppointmentsTable';
import { SuspensionsTable } from './SuspensionsTable';
import { TeamReviewsTable } from './TeamReviewsTable';
import { PermitsTable } from './PermitsTable';
import { AwardsTable } from './AwardsTable';

interface DashboardProps {
  token: string;
  contactId: string;
  onLogout: () => void;
  onTokenExpired: () => void;
}

export function Dashboard({ token, contactId, onLogout, onTokenExpired }: DashboardProps) {
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [joiningJourneyRecords, setJoiningJourneyRecords] = useState<JoiningJourneyRecord[]>([]);
  const [disclosureRecords, setDisclosureRecords] = useState<DisclosureRecord[]>([]);
  const [disclosureSummary, setDisclosureSummary] = useState<DisclosureSummary | null>(null);
  const [appointmentRecords, setAppointmentRecords] = useState<AppointmentRecord[]>([]);
  const [suspensionRecords, setSuspensionRecords] = useState<SuspensionRecord[]>([]);
  const [teamReviewRecords, setTeamReviewRecords] = useState<TeamReviewRecord[]>([]);
  const [permitRecords, setPermitRecords] = useState<PermitRecord[]>([]);
  const [awardRecords, setAwardRecords] = useState<AwardRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    console.log('[Dashboard] fetchData called with contactId:', contactId || '(empty)');

    try {
      const client = new ScoutsApiClient(token);

      // Initialize to get contactId if not provided
      if (!contactId) {
        console.log('[Dashboard] No contactId provided, calling initialize()');
        await client.initialize();
      } else {
        console.log('[Dashboard] Setting contactId on client:', contactId);
        // Use the provided contactId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client as any).contactId = contactId;
      }

      // Expose client for testing table names in browser console
      // Usage: window.testTable('DisclosureDashboardView')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).apiClient = client;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).testTable = (tableName: string) => client.testTable(tableName);
      // Check disclosures by membership numbers
      // Usage: checkDisclosures(['0012162494', '0012345678'])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).checkDisclosures = (membershipNumbers: string[]) =>
        client.checkDisclosuresByMembershipNumbers(membershipNumbers);
      // Check learning by membership numbers - uses GetLmsDetailsAsync for accurate expiry dates
      // Usage: checkLearning(['0012162494', '0012345678'])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).checkLearning = (membershipNumbers: string[]) =>
        client.checkLearningByMembershipNumbers(membershipNumbers);
      // Test joining journey view
      // Usage: testJoiningJourney()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).testJoiningJourney = () => client.getJoiningJourney(50);
      console.log('[Dashboard] Test functions: checkLearning([...]), checkDisclosures([...]), testJoiningJourney()');

      // First get member list from LearningComplianceDashboardView to get membership numbers
      console.log('[Dashboard] Fetching member list...');
      const memberListResponse = await client.getAllLearningCompliance(1000);

      if (memberListResponse.error) {
        throw new Error(memberListResponse.error);
      }

      // Extract unique membership numbers
      const uniqueMembershipNumbers = [...new Set(
        (memberListResponse.data || []).map(r => r['Membership number'])
      )];
      console.log(`[Dashboard] Found ${uniqueMembershipNumbers.length} unique members`);

      // Fetch accurate learning data via GetLmsDetailsAsync
      console.log('[Dashboard] Fetching learning details for each member...');
      const learningResult = await client.checkLearningByMembershipNumbers(uniqueMembershipNumbers);

      if (!learningResult.success || !learningResult.members) {
        throw new Error(learningResult.error || 'Failed to fetch learning details');
      }

      // Transform to LearningRecord format, only including modules that actually expire
      const data = transformLearningResults(learningResult.members);
      console.log(`[Dashboard] Transformed to ${data.length} learning records (expiring modules only)`);

      setRecords(data);

      // Compute summary
      const summaryData = client.computeComplianceSummary(data);
      setSummary(summaryData);

      // Fetch joining journey data
      console.log('[Dashboard] Fetching joining journey data...');
      const joiningJourneyResponse = await client.getJoiningJourney(500);
      if (!joiningJourneyResponse.error && joiningJourneyResponse.data) {
        setJoiningJourneyRecords(joiningJourneyResponse.data);
        console.log(`[Dashboard] Got ${joiningJourneyResponse.data.length} joining journey records`);
      }

      // Fetch disclosure compliance data
      console.log('[Dashboard] Fetching disclosure compliance data...');
      const disclosureResponse = await client.getDisclosureCompliance(500);
      if (!disclosureResponse.error && disclosureResponse.data) {
        setDisclosureRecords(disclosureResponse.data);
        setDisclosureSummary(client.computeDisclosureSummary(disclosureResponse.data));
        console.log(`[Dashboard] Got ${disclosureResponse.data.length} disclosure records`);
      }

      // Fetch appointments data
      console.log('[Dashboard] Fetching appointments data...');
      const appointmentsResponse = await client.getAppointments(500);
      if (!appointmentsResponse.error && appointmentsResponse.data) {
        setAppointmentRecords(appointmentsResponse.data);
        console.log(`[Dashboard] Got ${appointmentsResponse.data.length} appointment records`);
      }

      // Fetch suspensions data
      console.log('[Dashboard] Fetching suspensions data...');
      const suspensionsResponse = await client.getSuspensions(500);
      if (!suspensionsResponse.error && suspensionsResponse.data) {
        setSuspensionRecords(suspensionsResponse.data);
        console.log(`[Dashboard] Got ${suspensionsResponse.data.length} suspension records`);
      }

      // Fetch team reviews data
      console.log('[Dashboard] Fetching team reviews data...');
      const teamReviewsResponse = await client.getTeamReviews(500);
      if (!teamReviewsResponse.error && teamReviewsResponse.data) {
        setTeamReviewRecords(teamReviewsResponse.data);
        console.log(`[Dashboard] Got ${teamReviewsResponse.data.length} team review records`);
      }

      // Fetch permits data
      console.log('[Dashboard] Fetching permits data...');
      const permitsResponse = await client.getPermits(500);
      if (!permitsResponse.error && permitsResponse.data) {
        setPermitRecords(permitsResponse.data);
        console.log(`[Dashboard] Got ${permitsResponse.data.length} permit records`);
      }

      // Fetch awards data
      console.log('[Dashboard] Fetching awards data...');
      const awardsResponse = await client.getAwards(500);
      if (!awardsResponse.error && awardsResponse.data) {
        setAwardRecords(awardsResponse.data);
        console.log(`[Dashboard] Got ${awardsResponse.data.length} award records`);
      }

      setLastUpdated(new Date());
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'TOKEN_EXPIRED') {
        onTokenExpired();
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, contactId, onTokenExpired]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">GLV Dashboard</h1>
            <p className="text-sm text-gray-500">Training Compliance Overview</p>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated && (
              <span className="text-sm text-gray-500">
                Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <div className="font-medium">Error loading data</div>
            <div className="text-sm mt-1">{error}</div>
            <button
              onClick={fetchData}
              className="mt-2 text-sm text-red-800 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Summary Tiles */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Compliance Summary</h2>
          <SummaryTiles summary={summary} isLoading={isLoading} />
        </section>

        {/* Learning Compliance Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Learning Records</h2>
          <ComplianceTable records={records} isLoading={isLoading} />
        </section>

        {/* Joining Journey Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Joining Journey</h2>
          <JoiningJourneyTable records={joiningJourneyRecords} isLoading={isLoading} />
        </section>

        {/* Disclosure Compliance Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Disclosure Compliance</h2>
          <DisclosureTable records={disclosureRecords} summary={disclosureSummary} isLoading={isLoading} />
        </section>

        {/* Suspensions Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Suspensions</h2>
          <SuspensionsTable records={suspensionRecords} isLoading={isLoading} />
        </section>

        {/* Appointments Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Appointments</h2>
          <AppointmentsTable records={appointmentRecords} isLoading={isLoading} />
        </section>

        {/* Team Reviews Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Directory Reviews</h2>
          <TeamReviewsTable records={teamReviewRecords} isLoading={isLoading} />
        </section>

        {/* Permits Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Permits</h2>
          <PermitsTable records={permitRecords} isLoading={isLoading} />
        </section>

        {/* Awards Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Awards & Recognitions</h2>
          <AwardsTable records={awardRecords} isLoading={isLoading} />
        </section>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
        Data fetched directly from the Scouts membership portal. No data is stored.
      </footer>
    </div>
  );
}

export default Dashboard;
