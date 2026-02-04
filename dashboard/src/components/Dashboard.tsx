/**
 * Main Dashboard Component
 *
 * Orchestrates the dashboard layout and data fetching.
 */

import { useState, useEffect, useCallback } from 'react';
import { ScoutsApiClient } from '../api-client';
import type { LearningRecord, ComplianceSummary, MemberLearningResult } from '../types';
import { SummaryTiles } from './SummaryTiles';
import { ComplianceTable } from './ComplianceTable';

interface DashboardProps {
  token: string;
  contactId: string;
  onLogout: () => void;
  onTokenExpired: () => void;
}

/**
 * Transform MemberLearningResult[] from GetLmsDetailsAsync into LearningRecord[] format.
 * Only includes modules that have actual expiry dates (filters out one-time modules).
 */
function transformLearningResults(members: MemberLearningResult[]): LearningRecord[] {
  const records: LearningRecord[] = [];

  for (const member of members) {
    // Only include modules that have an expiry date (i.e., need renewal)
    const expiringModules = member.modules.filter(m => m.expiryDate !== null);

    for (const module of expiringModules) {
      // Parse the expiry date (format: "MM/DD/YYYY HH:MM:SS")
      const expiryDate = parseExpiryDate(module.expiryDate);
      const status = computeModuleStatus(module.currentLevel, expiryDate);

      records.push({
        'First name': member.firstName,
        'Last name': member.lastName,
        'Membership number': member.membershipNumber,
        'Learning': module.title,
        'Status': status,
        'Expiry date': expiryDate ? expiryDate.toISOString() : null,
      });
    }
  }

  return records;
}

/**
 * Parse expiry date from API format "MM/DD/YYYY HH:MM:SS" to Date
 */
function parseExpiryDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  try {
    // Format: "04/25/2028 21:22:00"
    const [datePart, timePart] = dateStr.split(' ');
    const [month, day, year] = datePart.split('/').map(Number);
    const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number);

    return new Date(year, month - 1, day, hours, minutes, seconds);
  } catch {
    return null;
  }
}

/**
 * Compute status based on current level and expiry date
 */
function computeModuleStatus(currentLevel: string, expiryDate: Date | null): string {
  if (!expiryDate) {
    return currentLevel === 'Achieved skill' ? 'Valid' : 'Not Started';
  }

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  if (expiryDate < now) {
    return 'Expired';
  } else if (expiryDate < thirtyDaysFromNow) {
    return 'Expiring';
  } else if (expiryDate < sixtyDaysFromNow) {
    return 'Renewal Due';
  } else {
    return 'Valid';
  }
}

export function Dashboard({ token, contactId, onLogout, onTokenExpired }: DashboardProps) {
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
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
        (client as any).contactId = contactId;
      }

      // Expose client for testing table names in browser console
      // Usage: window.testTable('DisclosureDashboardView')
      (window as any).apiClient = client;
      (window as any).testTable = (tableName: string) => client.testTable(tableName);
      // Check disclosures by membership numbers
      // Usage: checkDisclosures(['0012162494', '0012345678'])
      (window as any).checkDisclosures = (membershipNumbers: string[]) =>
        client.checkDisclosuresByMembershipNumbers(membershipNumbers);
      // Check learning by membership numbers - uses GetLmsDetailsAsync for accurate expiry dates
      // Usage: checkLearning(['0012162494', '0012345678'])
      (window as any).checkLearning = (membershipNumbers: string[]) =>
        client.checkLearningByMembershipNumbers(membershipNumbers);
      console.log('[Dashboard] Test functions: checkLearning([membershipNumbers]), checkDisclosures([membershipNumbers])');

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
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
        Data fetched directly from the Scouts membership portal. No data is stored.
      </footer>
    </div>
  );
}

export default Dashboard;
