/**
 * Main Dashboard Component
 *
 * Orchestrates the dashboard layout and data fetching.
 * Uses lazy loading to fetch section data when scrolled into view.
 * Caches all fetched data in IndexedDB for offline access.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { ScoutsApiClient } from '../api-client';
import { MockScoutsApiClient } from '../mock-api-client';

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

const tracer = trace.getTracer('glv-dashboard', '1.0.0');
import { transformLearningResults, isExpiringSoon } from '../utils';
import type { LearningRecord, ComplianceSummary, JoiningJourneyRecord, DisclosureRecord, DisclosureSummary, SuspensionRecord, TeamReviewRecord, PermitRecord, AwardRecord } from '../types';
import { SummaryTiles } from './SummaryTiles';
import { ComplianceTable } from './ComplianceTable';
import { JoiningJourneyTable } from './JoiningJourneyTable';
import { DisclosureTable } from './DisclosureTable';
import { SuspensionsTable } from './SuspensionsTable';
import { TeamReviewsTable } from './TeamReviewsTable';
import { PermitsTable } from './PermitsTable';
import { AwardsTable } from './AwardsTable';
import { LazySection } from './LazySection';
import type { LoadState } from './LazySection';
import { MemberDashboard } from './MemberDashboard';
import { SyncStatus } from './SyncStatus';
import { readCache, writeCache, readLastSync } from '../db';

interface DashboardProps {
  token: string;
  contactId: string;
  username?: string;
  isOnline: boolean;
  onLogout: () => void;
  onTokenExpired: () => void;
}

// Section state for lazy loading
interface SectionState<T> {
  state: LoadState;
  data: T;
  error: string | null;
}

export function Dashboard({ token, contactId, username, isOnline, onLogout, onTokenExpired }: DashboardProps) {
  // Primary data (loaded immediately - always visible at top)
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [primaryError, setPrimaryError] = useState<string | null>(null);

  // Global search term shared across all sections
  const [searchTerm, setSearchTerm] = useState('');

  // Per-member view
  const [selectedMember, setSelectedMember] = useState<{ membershipNumber: string; name: string } | null>(null);

  // Lazy-loaded sections
  const [joiningJourney, setJoiningJourney] = useState<SectionState<JoiningJourneyRecord[]>>({ state: 'idle', data: [], error: null });
  const [disclosures, setDisclosures] = useState<SectionState<{ records: DisclosureRecord[]; summary: DisclosureSummary | null }>>({ state: 'idle', data: { records: [], summary: null }, error: null });
  const [suspensions, setSuspensions] = useState<SectionState<SuspensionRecord[]>>({ state: 'idle', data: [], error: null });
  const [teamReviews, setTeamReviews] = useState<SectionState<TeamReviewRecord[]>>({ state: 'idle', data: [], error: null });
  const [permits, setPermits] = useState<SectionState<PermitRecord[]>>({ state: 'idle', data: [], error: null });
  const [awards, setAwards] = useState<SectionState<AwardRecord[]>>({ state: 'idle', data: [], error: null });

  const [lastSync, setLastSync] = useState<number | null>(null);
  const [, setCacheUpdatedAt] = useState<number | null>(null);

  // Section refs for intersection observer
  const joiningJourneyRef = useRef<HTMLElement>(null);
  const disclosuresRef = useRef<HTMLElement>(null);
  const suspensionsRef = useRef<HTMLElement>(null);
  const teamReviewsRef = useRef<HTMLElement>(null);
  const permitsRef = useRef<HTMLElement>(null);
  const awardsRef = useRef<HTMLElement>(null);

  // Track which sections have been triggered
  const triggeredSections = useRef<Set<string>>(new Set());

  // Memoize the API client (use mock client in mock mode)
  const client = useMemo(() => {
    if (MOCK_MODE) {
      console.log('[Dashboard] Using mock API client');
      return new MockScoutsApiClient();
    }
    const c = new ScoutsApiClient(token);
    if (contactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).contactId = contactId;
    }
    return c;
  }, [token, contactId]);

  // Primary data fetch (learning records + summary)
  // Accepts an AbortSignal so the useEffect cleanup can cancel the in-flight request
  // when React StrictMode double-mounts the component in development.
  const fetchPrimaryData = useCallback(async (signal?: AbortSignal) => {
    return tracer.startActiveSpan('dashboard.fetchPrimaryData', async (span) => {
      setPrimaryLoading(true);
      setPrimaryError(null);

      try {
        // Initialize client if no contactId
        if (!contactId) {
          await client.initialize();
        }

        // Expose debug helpers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).apiClient = client;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).testTable = (tableName: string) => client.testTable(tableName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).checkLearning = (membershipNumbers: string[]) =>
          client.checkLearningByMembershipNumbers(membershipNumbers);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).testJoiningJourney = () => client.getJoiningJourney(50);

        // Get member list
        const memberListResponse = await client.getAllLearningCompliance(1000, signal);
        if (memberListResponse.error) {
          throw new Error(memberListResponse.error);
        }

        // Extract unique membership numbers
        const uniqueMembershipNumbers = [...new Set(
          (memberListResponse.data || []).map(r => r['Membership number'])
        )];

        // Fetch learning details
        const learningResult = await client.checkLearningByMembershipNumbers(uniqueMembershipNumbers, signal);
        if (!learningResult.success || !learningResult.members) {
          throw new Error(learningResult.error || 'Failed to fetch learning details');
        }

        // Build map of membership number → earliest start date (for First Response deadline)
        const memberStartDates = new Map<string, string>();
        for (const r of memberListResponse.data || []) {
          const num = r['Membership number'];
          const start = r['Start date'];
          if (start) {
            const existing = memberStartDates.get(num);
            if (!existing || new Date(start) < new Date(existing)) {
              memberStartDates.set(num, start);
            }
          }
        }

        // Transform and set data
        const data = transformLearningResults(learningResult.members, undefined, memberStartDates);
        setRecords(data);
        setSummary(client.computeComplianceSummary(data));

        // Cache the results and update sync timestamp
        await writeCache('learningRecords', contactId, data);
        setLastSync(Date.now());
        setCacheUpdatedAt(Date.now());

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        // Ignore aborted fetches — a new fetch will have already been started.
        // Don't call span.end() here; finally handles it.
        if ((err as Error).name === 'AbortError') return;
        const message = (err as Error).message;
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        span.recordException(err as Error);
        if (message === 'TOKEN_EXPIRED') {
          onTokenExpired();
        } else {
          setPrimaryError(message);
        }
      } finally {
        setPrimaryLoading(false);
        span.end();
      }
    });
  }, [client, contactId, onTokenExpired]);

  // Section loaders — fetch from network and write to cache on success.
  const loadJoiningJourney = useCallback(async () => {
    setJoiningJourney(s => ({ ...s, state: 'loading', error: null }));
    try {
      const response = await client.getJoiningJourney(500);
      if (response.error) throw new Error(response.error);
      const data = response.data || [];
      setJoiningJourney({ state: 'loaded', data, error: null });
      await writeCache('joiningJourney', contactId, data);
      setLastSync(Date.now());
    } catch (err) {
      setJoiningJourney(s => ({ ...s, state: 'error', error: (err as Error).message }));
    }
  }, [client, contactId]);

  const loadDisclosures = useCallback(async () => {
    setDisclosures(s => ({ ...s, state: 'loading', error: null }));
    try {
      const response = await client.getDisclosureCompliance(500);
      if (response.error) throw new Error(response.error);
      const records = response.data || [];
      setDisclosures({
        state: 'loaded',
        data: { records, summary: client.computeDisclosureSummary(records) },
        error: null
      });
      await writeCache('disclosures', contactId, records);
      setLastSync(Date.now());
    } catch (err) {
      setDisclosures(s => ({ ...s, state: 'error', error: (err as Error).message }));
    }
  }, [client, contactId]);

  const loadSuspensions = useCallback(async () => {
    setSuspensions(s => ({ ...s, state: 'loading', error: null }));
    try {
      const response = await client.getSuspensions(500);
      if (response.error) throw new Error(response.error);
      const data = response.data || [];
      setSuspensions({ state: 'loaded', data, error: null });
      await writeCache('suspensions', contactId, data);
      setLastSync(Date.now());
    } catch (err) {
      setSuspensions(s => ({ ...s, state: 'error', error: (err as Error).message }));
    }
  }, [client, contactId]);

  const loadTeamReviews = useCallback(async () => {
    setTeamReviews(s => ({ ...s, state: 'loading', error: null }));
    try {
      const response = await client.getTeamReviews(500);
      if (response.error) throw new Error(response.error);
      const data = response.data || [];
      setTeamReviews({ state: 'loaded', data, error: null });
      await writeCache('teamReviews', contactId, data);
      setLastSync(Date.now());
    } catch (err) {
      setTeamReviews(s => ({ ...s, state: 'error', error: (err as Error).message }));
    }
  }, [client, contactId]);

  const loadPermits = useCallback(async () => {
    setPermits(s => ({ ...s, state: 'loading', error: null }));
    try {
      const response = await client.getPermits(500);
      if (response.error) throw new Error(response.error);
      const data = response.data || [];
      setPermits({ state: 'loaded', data, error: null });
      await writeCache('permits', contactId, data);
      setLastSync(Date.now());
    } catch (err) {
      setPermits(s => ({ ...s, state: 'error', error: (err as Error).message }));
    }
  }, [client, contactId]);

  const loadAwards = useCallback(async () => {
    setAwards(s => ({ ...s, state: 'loading', error: null }));
    try {
      const response = await client.getAwards(500);
      if (response.error) throw new Error(response.error);
      const data = response.data || [];
      setAwards({ state: 'loaded', data, error: null });
      await writeCache('awards', contactId, data);
      setLastSync(Date.now());
    } catch (err) {
      setAwards(s => ({ ...s, state: 'error', error: (err as Error).message }));
    }
  }, [client, contactId]);

  // Refresh all data
  const refreshAll = useCallback(async () => {
    triggeredSections.current.clear();
    setJoiningJourney({ state: 'idle', data: [], error: null });
    setDisclosures({ state: 'idle', data: { records: [], summary: null }, error: null });
    setSuspensions({ state: 'idle', data: [], error: null });
    setTeamReviews({ state: 'idle', data: [], error: null });
    setPermits({ state: 'idle', data: [], error: null });
    setAwards({ state: 'idle', data: [], error: null });
    await fetchPrimaryData();
  }, [fetchPrimaryData]);

  // Handle member selection - load all lazy sections that are still idle
  const handleMemberSelect = useCallback((membershipNumber: string, name: string) => {
    setSelectedMember({ membershipNumber, name });
    if (joiningJourney.state === 'idle') loadJoiningJourney();
    if (disclosures.state === 'idle') loadDisclosures();
    if (teamReviews.state === 'idle') loadTeamReviews();
    if (permits.state === 'idle') loadPermits();
    if (awards.state === 'idle') loadAwards();
  }, [joiningJourney.state, loadJoiningJourney, disclosures.state, loadDisclosures, teamReviews.state, loadTeamReviews, permits.state, loadPermits, awards.state, loadAwards]);

  // On mount: seed state from IndexedDB cache for immediate render, then
  // fetch fresh data from the network if online.
  useEffect(() => {
    const controller = new AbortController();

    async function init() {
      // Phase 1: Read only the primary (learning records) cache first so the
      // primary network fetch can start as soon as possible without waiting for
      // secondary caches that are only needed on-demand.
      // If IndexedDB is unavailable/blocked, fall back to empty cache and continue.
      let cachedRecords: LearningRecord[] | null = null;
      let cachedLastSync: Date | null = null;

      try {
        [cachedRecords, cachedLastSync] = await Promise.all([
          readCache('learningRecords', contactId) as Promise<LearningRecord[] | null>,
          readLastSync(contactId) as Promise<Date | null>,
        ]);
      } catch (err) {
        // IndexedDB failed (unavailable, blocked, or quota exceeded).
        // Proceed without cached data so the network fetch path can still run.
        console.warn('Failed to read primary cache from IndexedDB; continuing without cache.', err);
      }
      if (controller.signal.aborted) return;

      if (cachedLastSync) setLastSync(cachedLastSync.getTime());

      if (cachedRecords && cachedRecords.length > 0) {
        setRecords(cachedRecords);
        setSummary(client.computeComplianceSummary(cachedRecords));
        setPrimaryLoading(false);
      } else if (!isOnline) {
        // Offline with no cached data — stop loading and surface a message
        setPrimaryLoading(false);
        setPrimaryError('You are offline and there is no cached data available.');
      }

      if (controller.signal.aborted) return;

      // Phase 2: Seed secondary section caches in the background — do NOT await
      // before starting the primary network fetch so loading isn't delayed by
      // on-demand sections that haven't been scrolled into view yet.
      Promise.all([
        readCache('disclosures', contactId) as Promise<DisclosureRecord[] | null>,
        readCache('joiningJourney', contactId) as Promise<JoiningJourneyRecord[] | null>,
        readCache('suspensions', contactId) as Promise<SuspensionRecord[] | null>,
        readCache('teamReviews', contactId) as Promise<TeamReviewRecord[] | null>,
        readCache('permits', contactId) as Promise<PermitRecord[] | null>,
        readCache('awards', contactId) as Promise<AwardRecord[] | null>,
      ]).then(([
        cachedDisclosures,
        cachedJoiningJourney,
        cachedSuspensions,
        cachedTeamReviews,
        cachedPermits,
        cachedAwards,
      ]) => {
        if (controller.signal.aborted) return;
        if (!triggeredSections.current.has('disclosures') && cachedDisclosures && cachedDisclosures.length > 0) {
          setDisclosures({
            state: 'loaded',
            data: { records: cachedDisclosures, summary: client.computeDisclosureSummary(cachedDisclosures) },
            error: null,
          });
          triggeredSections.current.add('disclosures');
        }
        if (!triggeredSections.current.has('joiningJourney') && cachedJoiningJourney && cachedJoiningJourney.length > 0) {
          setJoiningJourney({ state: 'loaded', data: cachedJoiningJourney, error: null });
          triggeredSections.current.add('joiningJourney');
        }
        if (!triggeredSections.current.has('suspensions') && cachedSuspensions && cachedSuspensions.length > 0) {
          setSuspensions({ state: 'loaded', data: cachedSuspensions, error: null });
          triggeredSections.current.add('suspensions');
        }
        if (!triggeredSections.current.has('teamReviews') && cachedTeamReviews && cachedTeamReviews.length > 0) {
          setTeamReviews({ state: 'loaded', data: cachedTeamReviews, error: null });
          triggeredSections.current.add('teamReviews');
        }
        if (!triggeredSections.current.has('permits') && cachedPermits && cachedPermits.length > 0) {
          setPermits({ state: 'loaded', data: cachedPermits, error: null });
          triggeredSections.current.add('permits');
        }
        if (!triggeredSections.current.has('awards') && cachedAwards && cachedAwards.length > 0) {
          setAwards({ state: 'loaded', data: cachedAwards, error: null });
          triggeredSections.current.add('awards');
        }
      }).catch(err => {
        console.warn('Failed to read secondary caches from IndexedDB.', err);
      });

      // Fetch fresh data from the network if online
      if (isOnline && !controller.signal.aborted) {
        await fetchPrimaryData(controller.signal);
      }
    }

    init();
    return () => { controller.abort(); };
  // Run once on mount only — isOnline and fetchPrimaryData are intentionally
  // excluded to avoid re-running when online state flips mid-session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set up intersection observers for lazy sections
  useEffect(() => {
    const sections = [
      { ref: joiningJourneyRef, key: 'joiningJourney', load: loadJoiningJourney },
      { ref: disclosuresRef, key: 'disclosures', load: loadDisclosures },
      { ref: suspensionsRef, key: 'suspensions', load: loadSuspensions },
      { ref: teamReviewsRef, key: 'teamReviews', load: loadTeamReviews },
      { ref: permitsRef, key: 'permits', load: loadPermits },
      { ref: awardsRef, key: 'awards', load: loadAwards },
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const section = sections.find(s => s.ref.current === entry.target);
            if (section && !triggeredSections.current.has(section.key) && isOnline) {
              triggeredSections.current.add(section.key);
              section.load();
            }
          }
        });
      },
      { rootMargin: '100px' }
    );

    sections.forEach(({ ref }) => {
      if (ref.current) observer.observe(ref.current);
    });

    return () => observer.disconnect();
  }, [isOnline, loadJoiningJourney, loadDisclosures, loadSuspensions, loadTeamReviews, loadPermits, loadAwards]);

  const isAnyLoading = primaryLoading ||
    joiningJourney.state === 'loading' ||
    disclosures.state === 'loading' ||
    suspensions.state === 'loading' ||
    teamReviews.state === 'loading' ||
    permits.state === 'loading' ||
    awards.state === 'loading';

  const permitExpiringSoon = useMemo(() => {
    return permits.data.filter(r => isExpiringSoon(r['Permit expiry date'])).length;
  }, [permits.data]);

  if (selectedMember) {
    return (
      <MemberDashboard
        membershipNumber={selectedMember.membershipNumber}
        name={selectedMember.name}
        learningRecords={records}
        joiningJourneyRecords={joiningJourney.data}
        joiningJourneyState={joiningJourney.state}
        disclosureRecords={disclosures.data.records}
        disclosuresState={disclosures.state}
        teamReviewRecords={teamReviews.data}
        teamReviewsState={teamReviews.state}
        permitRecords={permits.data}
        permitsState={permits.state}
        awardRecords={awards.data}
        awardsState={awards.state}
        onBack={() => setSelectedMember(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">GLV Dashboard</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Training Compliance Overview</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onLogout}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Sign Out
              </button>
            </div>
          </div>
          {/* Metadata + sync status row */}
          <div className="mt-2 space-y-1">
            {username && (
              <div className="hidden sm:block text-sm text-gray-500">
                Signed in as <span className="font-medium text-gray-600">{username}</span>
              </div>
            )}
            <SyncStatus
              lastSync={lastSync}
              isOnline={isOnline}
              isLoading={isAnyLoading}
              onRefresh={refreshAll}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {primaryError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <div className="font-medium">Error loading data</div>
            <div className="text-sm mt-1">{primaryError}</div>
            <button
              onClick={() => fetchPrimaryData()}
              className="mt-2 text-sm text-red-800 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Global Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name or membership number across all sections..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Summary Tiles - Always load immediately */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Compliance Summary</h2>
            {primaryLoading && (
              <span className="text-sm text-purple-600 animate-pulse flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </span>
            )}
          </div>
          <SummaryTiles
            summary={summary}
            isLoading={primaryLoading}
            disclosureExpiringSoon={disclosures.data.summary?.expiringSoon ?? 0}
            permitExpiringSoon={permitExpiringSoon}
          />
        </section>

        {/* Learning Compliance Table - Always load immediately */}
        <section id="section-learning">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Learning Records</h2>
            {primaryLoading && (
              <span className="text-sm text-purple-600 animate-pulse flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </span>
            )}
          </div>
          <ComplianceTable records={records} isLoading={primaryLoading} onMemberSelect={handleMemberSelect} searchTerm={searchTerm} />
        </section>

        {/* Joining Journey - Lazy loaded */}
        <LazySection
          ref={joiningJourneyRef}
          title="Joining Journey"
          state={joiningJourney.state}
          error={joiningJourney.error}
          onRetry={() => { triggeredSections.current.delete('joiningJourney'); loadJoiningJourney(); }}
        >
          <JoiningJourneyTable records={joiningJourney.data} isLoading={joiningJourney.state === 'loading'} onMemberSelect={handleMemberSelect} searchTerm={searchTerm} />
        </LazySection>

        {/* Disclosure Compliance - Lazy loaded */}
        <LazySection
          ref={disclosuresRef}
          id="section-disclosures"
          title="Disclosure Compliance"
          state={disclosures.state}
          error={disclosures.error}
          onRetry={() => { triggeredSections.current.delete('disclosures'); loadDisclosures(); }}
        >
          <DisclosureTable
            records={disclosures.data.records}
            summary={disclosures.data.summary}
            isLoading={disclosures.state === 'loading'}
            onMemberSelect={handleMemberSelect}
            searchTerm={searchTerm}
          />
        </LazySection>

        {/* Suspensions - Lazy loaded */}
        <LazySection
          ref={suspensionsRef}
          title="Suspensions"
          state={suspensions.state}
          error={suspensions.error}
          onRetry={() => { triggeredSections.current.delete('suspensions'); loadSuspensions(); }}
        >
          <SuspensionsTable records={suspensions.data} isLoading={suspensions.state === 'loading'} onMemberSelect={handleMemberSelect} searchTerm={searchTerm} />
        </LazySection>

        {/* Team Reviews - Lazy loaded */}
        <LazySection
          ref={teamReviewsRef}
          title="Team Directory Reviews"
          state={teamReviews.state}
          error={teamReviews.error}
          onRetry={() => { triggeredSections.current.delete('teamReviews'); loadTeamReviews(); }}
        >
          <TeamReviewsTable records={teamReviews.data} isLoading={teamReviews.state === 'loading'} searchTerm={searchTerm} />
        </LazySection>

        {/* Permits - Lazy loaded */}
        <LazySection
          ref={permitsRef}
          id="section-permits"
          title="Permits"
          state={permits.state}
          error={permits.error}
          onRetry={() => { triggeredSections.current.delete('permits'); loadPermits(); }}
        >
          <PermitsTable records={permits.data} isLoading={permits.state === 'loading'} onMemberSelect={handleMemberSelect} searchTerm={searchTerm} />
        </LazySection>

        {/* Awards - Lazy loaded */}
        <LazySection
          ref={awardsRef}
          title="Awards & Recognitions"
          state={awards.state}
          error={awards.error}
          onRetry={() => { triggeredSections.current.delete('awards'); loadAwards(); }}
        >
          <AwardsTable records={awards.data} isLoading={awards.state === 'loading'} onMemberSelect={handleMemberSelect} searchTerm={searchTerm} />
        </LazySection>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
        Data fetched directly from the Scouts membership portal. Cached locally for offline access.{' '}
        <a
          href={__APP_URL__}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700"
        >
          simonmcc/glv-dashboard@{__APP_VERSION__}
        </a>
      </footer>
    </div>
  );
}

export default Dashboard;
