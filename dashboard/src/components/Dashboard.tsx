/**
 * Main Dashboard Component
 *
 * Orchestrates the dashboard layout and data fetching.
 */

import { useState, useEffect, useCallback } from 'react';
import { ScoutsApiClient } from '../api-client';
import type { LearningRecord, ComplianceSummary } from '../types';
import { SummaryTiles } from './SummaryTiles';
import { ComplianceTable } from './ComplianceTable';

interface DashboardProps {
  token: string;
  contactId: string;
  onLogout: () => void;
  onTokenExpired: () => void;
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

      // Fetch all learning compliance records
      const response = await client.getAllLearningCompliance(1000);

      if (response.error) {
        throw new Error(response.error);
      }

      const data = response.data || [];
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

        {/* Detailed Table */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">All Records</h2>
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
