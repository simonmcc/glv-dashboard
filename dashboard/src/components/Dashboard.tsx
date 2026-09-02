/**
 * Main Dashboard Component
 *
 * Orchestrates the dashboard layout and data fetching.
 * Every section's data is fetched up front (in parallel) rather than waiting
 * for the section to be scrolled into view, so the whole dashboard is ready
 * to search and browse as soon as it settles.
 * Caches all fetched data in IndexedDB for offline access.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { ScoutsApiClient } from "../api-client";
import { MockScoutsApiClient } from "../mock-api-client";

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === "true";

const tracer = trace.getTracer("glv-dashboard", "1.0.0");
import { transformLearningResults, isExpiringSoon } from "../utils";
import type {
  LearningRecord,
  ComplianceSummary,
  JoiningJourneyRecord,
  DisclosureRecord,
  DisclosureSummary,
  SuspensionRecord,
  TeamReviewRecord,
  PermitRecord,
  AwardRecord,
} from "../types";
import { SummaryTiles } from "./SummaryTiles";
import { ComplianceTable } from "./ComplianceTable";
import { JoiningJourneyTable } from "./JoiningJourneyTable";
import { JoiningJourneyProgress } from "./JoiningJourneyProgress";
import { DisclosureTable } from "./DisclosureTable";
import { SuspensionsTable } from "./SuspensionsTable";
import { TeamReviewsTable } from "./TeamReviewsTable";
import { TeamStructure } from "./TeamStructure";
import { PermitsTable } from "./PermitsTable";
import { AwardsTable } from "./AwardsTable";
import { LazySection } from "./LazySection";
import type { LoadState } from "./LazySection";
import { MemberDashboard } from "./MemberDashboard";
import { ModuleRulesPage } from "./ModuleRulesPage";
import { SyncStatus } from "./SyncStatus";
import { VersionFooter } from "./VersionFooter";
import { readCache, writeCache, readLastSync } from "../db";

interface DashboardProps {
  token: string | null;
  contactId: string;
  username?: string;
  isOnline: boolean;
  onLogout: () => void;
  onTokenExpired: () => void;
  backgroundAuth?: { message: string; isError?: boolean };
  updateAvailable?: boolean;
  onUpdate?: () => void;
}

// Human-readable names for each data type, shown in the sync status label
// while that section is being fetched.
const DATA_TYPE_LABELS = {
  learning: "training records",
  joiningJourney: "onboarding",
  disclosures: "disclosures",
  suspensions: "suspensions",
  teamReviews: "team directory",
  permits: "permits",
  awards: "awards",
} as const;

// Section state for lazy loading
interface SectionState<T> {
  state: LoadState;
  data: T;
  error: string | null;
}

/**
 * Fill a section with cached rows, but only while it is still empty — a section
 * that already has network data (or is mid-fetch with data on screen) keeps it.
 */
function seedSection<T>(
  setState: Dispatch<SetStateAction<SectionState<T[]>>>,
  cached: T[] | null,
) {
  if (!cached || cached.length === 0) return;
  setState((s) =>
    s.data.length > 0
      ? s
      : {
          state: s.state === "idle" ? "loaded" : s.state,
          data: cached,
          error: s.error,
        },
  );
}

export function Dashboard({
  token,
  contactId,
  username,
  isOnline,
  onLogout,
  onTokenExpired,
  backgroundAuth,
  updateAvailable,
  onUpdate,
}: DashboardProps) {
  // Primary data (loaded immediately - always visible at top)
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [primaryError, setPrimaryError] = useState<string | null>(null);

  // Global search term shared across all sections
  const [searchTerm, setSearchTerm] = useState("");

  // Per-member view
  const [selectedMember, setSelectedMember] = useState<{
    membershipNumber: string;
    name: string;
  } | null>(null);

  const [showModuleRules, setShowModuleRules] = useState(false);

  // Training & Onboarding section tab
  const [trainingTab, setTrainingTab] = useState<"onboarding" | "training">(
    "onboarding",
  );

  // Deep-link state: set when a compliance tile is clicked to pre-filter the training table
  const [tileDeepLink, setTileDeepLink] = useState<{
    learning: string;
    key: number;
  } | null>(null);

  // Joining Journey inner view toggle
  const [joiningJourneyView, setJoiningJourneyView] = useState<
    "progress" | "items"
  >("progress");

  // Team Directory view toggle
  const [teamDirView, setTeamDirView] = useState<"directory" | "structure">(
    "directory",
  );

  // Collapsed state for lower-priority sections
  const [teamReviewsCollapsed, setTeamReviewsCollapsed] = useState(true);
  const [permitsCollapsed, setPermitsCollapsed] = useState(true);
  const [awardsCollapsed, setAwardsCollapsed] = useState(true);

  // Lazy-loaded sections
  const [joiningJourney, setJoiningJourney] = useState<
    SectionState<JoiningJourneyRecord[]>
  >({ state: "idle", data: [], error: null });
  const [disclosures, setDisclosures] = useState<
    SectionState<{
      records: DisclosureRecord[];
      summary: DisclosureSummary | null;
    }>
  >({ state: "idle", data: { records: [], summary: null }, error: null });
  const [suspensions, setSuspensions] = useState<
    SectionState<SuspensionRecord[]>
  >({ state: "idle", data: [], error: null });
  const [teamReviews, setTeamReviews] = useState<
    SectionState<TeamReviewRecord[]>
  >({ state: "idle", data: [], error: null });
  const [permits, setPermits] = useState<SectionState<PermitRecord[]>>({
    state: "idle",
    data: [],
    error: null,
  });
  const [awards, setAwards] = useState<SectionState<AwardRecord[]>>({
    state: "idle",
    data: [],
    error: null,
  });

  const [lastSync, setLastSync] = useState<number | null>(null);
  const [, setCacheUpdatedAt] = useState<number | null>(null);

  // Section refs for intersection observer
  const joiningJourneyRef = useRef<HTMLElement>(null);
  const disclosuresRef = useRef<HTMLElement>(null);
  const suspensionsRef = useRef<HTMLElement>(null);
  const teamReviewsRef = useRef<HTMLElement>(null);
  const permitsRef = useRef<HTMLElement>(null);
  const awardsRef = useRef<HTMLElement>(null);

  // Memoize the API client (use mock client in mock mode)
  const client = useMemo(() => {
    if (MOCK_MODE) {
      console.log("[Dashboard] Using mock API client");
      return new MockScoutsApiClient();
    }
    // When token is null (background-auth state), create client with empty token —
    // network calls are guarded by the token null-check in fetchPrimaryData.
    const c = new ScoutsApiClient(token ?? "");
    if (contactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).contactId = contactId;
    }
    return c;
  }, [token, contactId]);

  // Resolve the contact id once per client. Every loader awaits this, so the
  // parallel section fetches can't each fire their own /GetContactDetailAsync.
  const ensureInitialized = useMemo(() => {
    let pending: Promise<void> | null = null;
    return () => {
      if (contactId) return Promise.resolve();
      if (!pending) {
        pending = client.initialize().catch((err) => {
          pending = null;
          throw err;
        });
      }
      return pending;
    };
  }, [client, contactId]);

  // Primary data fetch (learning records + summary)
  // Accepts an AbortSignal so the useEffect cleanup can cancel the in-flight request
  // when React StrictMode double-mounts the component in development.
  const fetchPrimaryData = useCallback(
    async (signal?: AbortSignal) => {
      return tracer.startActiveSpan(
        "dashboard.fetchPrimaryData",
        async (span) => {
          // Skip network fetch when we don't have a valid token yet (background-auth state)
          if (!token && !MOCK_MODE) {
            span.end();
            return;
          }

          setPrimaryLoading(true);
          setPrimaryError(null);

          try {
            // Resolve the contact id (shared with the section loaders)
            await ensureInitialized();

            // Expose debug helpers
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).apiClient = client;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).testTable = (tableName: string) =>
              client.testTable(tableName);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).checkLearning = (membershipNumbers: string[]) =>
              client.checkLearningByMembershipNumbers(membershipNumbers);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).testJoiningJourney = () =>
              client.getJoiningJourney(50);

            // Get member list
            const memberListResponse = await client.getAllLearningCompliance(
              1000,
              signal,
            );
            if (memberListResponse.error) {
              throw new Error(memberListResponse.error);
            }

            // Extract unique membership numbers
            const uniqueMembershipNumbers = [
              ...new Set(
                (memberListResponse.data || []).map(
                  (r) => r["Membership number"],
                ),
              ),
            ];
            span.setAttribute(
              "records.learning_compliance",
              memberListResponse.data?.length ?? 0,
            );
            span.setAttribute(
              "records.members_checked",
              uniqueMembershipNumbers.length,
            );

            // Fetch learning details
            const learningResult =
              await client.checkLearningByMembershipNumbers(
                uniqueMembershipNumbers,
                signal,
              );
            if (!learningResult.success || !learningResult.members) {
              throw new Error(
                learningResult.error || "Failed to fetch learning details",
              );
            }

            // Build map of membership number → earliest start date (for First Response deadline)
            const memberStartDates = new Map<string, string>();
            for (const r of memberListResponse.data || []) {
              const num = r["Membership number"];
              const start = r["Start date"];
              if (start) {
                const existing = memberStartDates.get(num);
                if (!existing || new Date(start) < new Date(existing)) {
                  memberStartDates.set(num, start);
                }
              }
            }

            // Transform and set data
            const data = transformLearningResults(
              learningResult.members,
              undefined,
              memberStartDates,
            );
            setRecords(data);
            setSummary(client.computeComplianceSummary(data));

            // Cache the results and update sync timestamp
            await writeCache("learningRecords", contactId, data);
            setLastSync(Date.now());
            setCacheUpdatedAt(Date.now());

            span.setStatus({ code: SpanStatusCode.OK });
          } catch (err) {
            // Ignore aborted fetches — a new fetch will have already been started.
            // Don't call span.end() here; finally handles it.
            if ((err as Error).name === "AbortError") return;
            const message = (err as Error).message;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            span.recordException(err as Error);
            if (message === "TOKEN_EXPIRED") {
              onTokenExpired();
            } else {
              setPrimaryError(message);
            }
          } finally {
            setPrimaryLoading(false);
            span.end();
          }
        },
      );
    },
    [client, contactId, ensureInitialized, onTokenExpired],
  );

  // Section loaders — fetch from network and write to cache on success.
  const loadJoiningJourney = useCallback(async () => {
    setJoiningJourney((s) => ({ ...s, state: "loading", error: null }));
    return tracer.startActiveSpan(
      "dashboard.load.joiningJourney",
      async (span) => {
        try {
          await ensureInitialized();
          const response = await client.getJoiningJourney(500);
          if (response.error) throw new Error(response.error);
          const data = response.data || [];
          span.setAttribute("records.count", data.length);
          span.setStatus({ code: SpanStatusCode.OK });
          setJoiningJourney({ state: "loaded", data, error: null });
          await writeCache("joiningJourney", contactId, data);
          setLastSync(Date.now());
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          if ((err as Error).message === "TOKEN_EXPIRED") {
            onTokenExpired();
            return;
          }
          setJoiningJourney((s) => ({
            ...s,
            state: "error",
            error: (err as Error).message,
          }));
        } finally {
          span.end();
        }
      },
    );
  }, [client, contactId, ensureInitialized, onTokenExpired]);

  const loadDisclosures = useCallback(async () => {
    setDisclosures((s) => ({ ...s, state: "loading", error: null }));
    return tracer.startActiveSpan(
      "dashboard.load.disclosures",
      async (span) => {
        try {
          await ensureInitialized();
          const response = await client.getDisclosureCompliance(500);
          if (response.error) throw new Error(response.error);
          const records = response.data || [];
          span.setAttribute("records.count", records.length);
          span.setStatus({ code: SpanStatusCode.OK });
          setDisclosures({
            state: "loaded",
            data: {
              records,
              summary: client.computeDisclosureSummary(records),
            },
            error: null,
          });
          await writeCache("disclosures", contactId, records);
          setLastSync(Date.now());
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          if ((err as Error).message === "TOKEN_EXPIRED") {
            onTokenExpired();
            return;
          }
          setDisclosures((s) => ({
            ...s,
            state: "error",
            error: (err as Error).message,
          }));
        } finally {
          span.end();
        }
      },
    );
  }, [client, contactId, ensureInitialized, onTokenExpired]);

  const loadSuspensions = useCallback(async () => {
    setSuspensions((s) => ({ ...s, state: "loading", error: null }));
    return tracer.startActiveSpan(
      "dashboard.load.suspensions",
      async (span) => {
        try {
          await ensureInitialized();
          const response = await client.getSuspensions(500);
          if (response.error) throw new Error(response.error);
          const data = response.data || [];
          span.setAttribute("records.count", data.length);
          span.setStatus({ code: SpanStatusCode.OK });
          setSuspensions({ state: "loaded", data, error: null });
          await writeCache("suspensions", contactId, data);
          setLastSync(Date.now());
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          if ((err as Error).message === "TOKEN_EXPIRED") {
            onTokenExpired();
            return;
          }
          setSuspensions((s) => ({
            ...s,
            state: "error",
            error: (err as Error).message,
          }));
        } finally {
          span.end();
        }
      },
    );
  }, [client, contactId, ensureInitialized, onTokenExpired]);

  const loadTeamReviews = useCallback(async () => {
    setTeamReviews((s) => ({ ...s, state: "loading", error: null }));
    return tracer.startActiveSpan(
      "dashboard.load.teamReviews",
      async (span) => {
        try {
          await ensureInitialized();
          const response = await client.getTeamReviews(500);
          if (response.error) throw new Error(response.error);
          const data = response.data || [];
          span.setAttribute("records.count", data.length);
          span.setStatus({ code: SpanStatusCode.OK });
          setTeamReviews({ state: "loaded", data, error: null });
          await writeCache("teamReviews", contactId, data);
          setLastSync(Date.now());
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          if ((err as Error).message === "TOKEN_EXPIRED") {
            onTokenExpired();
            return;
          }
          setTeamReviews((s) => ({
            ...s,
            state: "error",
            error: (err as Error).message,
          }));
        } finally {
          span.end();
        }
      },
    );
  }, [client, contactId, ensureInitialized, onTokenExpired]);

  const loadPermits = useCallback(async () => {
    setPermits((s) => ({ ...s, state: "loading", error: null }));
    return tracer.startActiveSpan("dashboard.load.permits", async (span) => {
      try {
        await ensureInitialized();
        const response = await client.getPermits(500);
        if (response.error) throw new Error(response.error);
        const data = response.data || [];
        span.setAttribute("records.count", data.length);
        span.setStatus({ code: SpanStatusCode.OK });
        setPermits({ state: "loaded", data, error: null });
        await writeCache("permits", contactId, data);
        setLastSync(Date.now());
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        if ((err as Error).message === "TOKEN_EXPIRED") {
          onTokenExpired();
          return;
        }
        setPermits((s) => ({
          ...s,
          state: "error",
          error: (err as Error).message,
        }));
      } finally {
        span.end();
      }
    });
  }, [client, contactId, ensureInitialized, onTokenExpired]);

  const loadAwards = useCallback(async () => {
    setAwards((s) => ({ ...s, state: "loading", error: null }));
    return tracer.startActiveSpan("dashboard.load.awards", async (span) => {
      try {
        await ensureInitialized();
        const response = await client.getAwards(500);
        if (response.error) throw new Error(response.error);
        const data = response.data || [];
        span.setAttribute("records.count", data.length);
        span.setStatus({ code: SpanStatusCode.OK });
        setAwards({ state: "loaded", data, error: null });
        await writeCache("awards", contactId, data);
        setLastSync(Date.now());
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        if ((err as Error).message === "TOKEN_EXPIRED") {
          onTokenExpired();
          return;
        }
        setAwards((s) => ({
          ...s,
          state: "error",
          error: (err as Error).message,
        }));
      } finally {
        span.end();
      }
    });
  }, [client, contactId, ensureInitialized, onTokenExpired]);

  // Fetch every section's data in parallel. Called on mount and on refresh so
  // the whole dashboard loads up front rather than section-by-section on scroll.
  // Existing data stays on screen while each section refetches
  // (stale-while-revalidate), and failures are isolated per section.
  const loadAllSections = useCallback(async () => {
    if (!token && !MOCK_MODE) return;
    const loaders = [
      loadJoiningJourney,
      loadDisclosures,
      loadSuspensions,
      loadTeamReviews,
      loadPermits,
      loadAwards,
    ];
    await Promise.allSettled(loaders.map((load) => load()));
  }, [
    token,
    loadJoiningJourney,
    loadDisclosures,
    loadSuspensions,
    loadTeamReviews,
    loadPermits,
    loadAwards,
  ]);

  // Refresh everything — primary data and all sections together.
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([fetchPrimaryData(), loadAllSections()]);
  }, [fetchPrimaryData, loadAllSections]);

  // When token transitions from null → string (background auth completes), trigger a full refresh
  const prevTokenRef = useRef<string | null>(token);
  useEffect(() => {
    if (token && prevTokenRef.current === null) {
      void refreshAll();
    }
    prevTokenRef.current = token;
    // refreshAll is intentionally excluded to avoid re-running when it changes due to other deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Handle member selection - load all lazy sections that are still idle
  const handleTileClick = useCallback((learningType: string) => {
    setTrainingTab("training");
    setTileDeepLink((prev) => ({
      learning: learningType,
      key: (prev?.key ?? 0) + 1,
    }));
    joiningJourneyRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleMemberSelect = useCallback(
    (membershipNumber: string, name: string) => {
      setSelectedMember({ membershipNumber, name });
      // Don't trigger network loads while background auth is still in progress (no token yet)
      if (!token && !MOCK_MODE) return;
      if (joiningJourney.state === "idle") loadJoiningJourney();
      if (disclosures.state === "idle") loadDisclosures();
      if (!teamReviewsCollapsed && teamReviews.state === "idle")
        loadTeamReviews();
      if (!permitsCollapsed && permits.state === "idle") loadPermits();
      if (!awardsCollapsed && awards.state === "idle") loadAwards();
    },
    [
      token,
      joiningJourney.state,
      loadJoiningJourney,
      disclosures.state,
      loadDisclosures,
      teamReviewsCollapsed,
      teamReviews.state,
      loadTeamReviews,
      permitsCollapsed,
      permits.state,
      loadPermits,
      awardsCollapsed,
      awards.state,
      loadAwards,
    ],
  );

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
      let cachedLastSync: number | null = null;

      try {
        [cachedRecords, cachedLastSync] = await Promise.all([
          readCache("learningRecords", contactId) as Promise<
            LearningRecord[] | null
          >,
          readLastSync(contactId),
        ]);
      } catch (err) {
        // IndexedDB failed (unavailable, blocked, or quota exceeded).
        // Proceed without cached data so the network fetch path can still run.
        console.warn(
          "Failed to read primary cache from IndexedDB; continuing without cache.",
          err,
        );
      }
      if (controller.signal.aborted) return;

      if (cachedLastSync !== null) setLastSync(cachedLastSync);

      if (cachedRecords && cachedRecords.length > 0) {
        setRecords(cachedRecords);
        setSummary(client.computeComplianceSummary(cachedRecords));
        setPrimaryLoading(false);
      } else if (!isOnline) {
        // Offline with no cached data — stop loading and surface a message
        setPrimaryLoading(false);
        setPrimaryError(
          "You are offline and there is no cached data available.",
        );
      }

      if (controller.signal.aborted) return;

      // Phase 2: Seed secondary section caches in the background — do NOT await
      // before starting the primary network fetch so a slow IndexedDB read
      // can't delay the network requests.
      //
      // Cached data only fills a section that is still empty; it never
      // overwrites data a network fetch has already delivered. Because every
      // section now starts fetching immediately, this read often resolves while
      // those fetches are in flight, and the cached rows render underneath the
      // section's loading state until fresh data replaces them.
      Promise.all([
        readCache("disclosures", contactId) as Promise<
          DisclosureRecord[] | null
        >,
        readCache("joiningJourney", contactId) as Promise<
          JoiningJourneyRecord[] | null
        >,
        readCache("suspensions", contactId) as Promise<
          SuspensionRecord[] | null
        >,
        readCache("teamReviews", contactId) as Promise<
          TeamReviewRecord[] | null
        >,
        readCache("permits", contactId) as Promise<PermitRecord[] | null>,
        readCache("awards", contactId) as Promise<AwardRecord[] | null>,
      ])
        .then(
          ([
            cachedDisclosures,
            cachedJoiningJourney,
            cachedSuspensions,
            cachedTeamReviews,
            cachedPermits,
            cachedAwards,
          ]) => {
            if (controller.signal.aborted) return;

            if (cachedDisclosures && cachedDisclosures.length > 0) {
              setDisclosures((s) =>
                s.data.records.length > 0
                  ? s
                  : {
                      state: s.state === "idle" ? "loaded" : s.state,
                      data: {
                        records: cachedDisclosures,
                        summary:
                          client.computeDisclosureSummary(cachedDisclosures),
                      },
                      error: s.error,
                    },
              );
            }
            seedSection(setJoiningJourney, cachedJoiningJourney);
            seedSection(setSuspensions, cachedSuspensions);
            seedSection(setTeamReviews, cachedTeamReviews);
            seedSection(setPermits, cachedPermits);
            seedSection(setAwards, cachedAwards);
          },
        )
        .catch((err) => {
          console.warn("Failed to read secondary caches from IndexedDB.", err);
        });

      // Fetch fresh data from the network if online and authenticated.
      // The primary fetch starts first (it is the slowest and feeds the tiles),
      // then every section loads in parallel rather than on scroll.
      if (isOnline && token && !controller.signal.aborted) {
        const primary = fetchPrimaryData(controller.signal);
        const sections = loadAllSections();
        await Promise.allSettled([primary, sections]);
      }
    }

    init();
    return () => {
      controller.abort();
    };
    // Run once on mount only — isOnline and fetchPrimaryData are intentionally
    // excluded to avoid re-running when online state flips mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Names of the data types currently in flight, in the order they appear on
  // the page. Drives the sync status label so it says what is loading rather
  // than a generic "Refreshing…".
  const loadingTypes = useMemo(() => {
    const types: string[] = [];
    if (primaryLoading) types.push(DATA_TYPE_LABELS.learning);
    if (joiningJourney.state === "loading")
      types.push(DATA_TYPE_LABELS.joiningJourney);
    if (disclosures.state === "loading")
      types.push(DATA_TYPE_LABELS.disclosures);
    if (suspensions.state === "loading")
      types.push(DATA_TYPE_LABELS.suspensions);
    if (teamReviews.state === "loading")
      types.push(DATA_TYPE_LABELS.teamReviews);
    if (permits.state === "loading") types.push(DATA_TYPE_LABELS.permits);
    if (awards.state === "loading") types.push(DATA_TYPE_LABELS.awards);
    return types;
  }, [
    primaryLoading,
    joiningJourney.state,
    disclosures.state,
    suspensions.state,
    teamReviews.state,
    permits.state,
    awards.state,
  ]);

  const permitExpiringSoon = useMemo(() => {
    return permits.data.filter((r) => isExpiringSoon(r["Permit expiry date"]))
      .length;
  }, [permits.data]);

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      map.set(
        r["Membership number"],
        `${r["First name"]} ${r["Last name"]}`.trim(),
      );
    }
    return map;
  }, [records]);

  if (showModuleRules) {
    return <ModuleRulesPage onBack={() => setShowModuleRules(false)} />;
  }

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
              <p className="text-sm text-gray-500 hidden sm:block">
                Training Compliance Overview
              </p>
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
                Signed in as{" "}
                <span className="font-medium text-gray-600">{username}</span>
              </div>
            )}
            <SyncStatus
              lastSync={lastSync}
              isOnline={isOnline}
              loading={loadingTypes}
              onRefresh={refreshAll}
              onLogout={onLogout}
              backgroundAuth={backgroundAuth}
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
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
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
            <h2 className="text-lg font-semibold text-gray-900">
              Compliance Summary
            </h2>
            <button
              onClick={() => setShowModuleRules(true)}
              className="text-sm text-purple-600 hover:text-purple-800 hover:underline"
            >
              Module rules ↗
            </button>
            {primaryLoading && (
              <span className="text-sm text-purple-600 animate-pulse flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading...
              </span>
            )}
          </div>
          <SummaryTiles
            summary={summary}
            isLoading={primaryLoading && !summary}
            disclosureExpiringSoon={disclosures.data.summary?.expiringSoon ?? 0}
            permitExpiringSoon={permitExpiringSoon}
            onTileClick={handleTileClick}
          />
        </section>

        {/* Training & Onboarding - merged section */}
        <section ref={joiningJourneyRef} id="section-learning">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Training &amp; Onboarding
            </h2>
            {trainingTab === "training" && primaryLoading && (
              <span className="text-sm text-purple-600 animate-pulse flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading...
              </span>
            )}
            {trainingTab === "onboarding" &&
              joiningJourney.state === "loading" && (
                <span className="text-sm text-purple-600 animate-pulse flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Loading...
                </span>
              )}
            <div className="ml-auto flex items-center gap-3">
              {trainingTab === "onboarding" &&
                joiningJourney.state === "loaded" &&
                joiningJourney.data.length > 0 && (
                  <div className="flex gap-1 rounded-lg overflow-hidden border border-gray-200 text-sm">
                    <button
                      onClick={() => setJoiningJourneyView("progress")}
                      className={`px-3 py-1 ${joiningJourneyView === "progress" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      By Member
                    </button>
                    <button
                      onClick={() => setJoiningJourneyView("items")}
                      className={`px-3 py-1 ${joiningJourneyView === "items" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      All Tasks
                    </button>
                  </div>
                )}
              <div className="flex gap-1 rounded-lg overflow-hidden border border-gray-200 text-sm">
                <button
                  onClick={() => setTrainingTab("onboarding")}
                  className={`px-3 py-1 ${trainingTab === "onboarding" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Onboarding
                </button>
                <button
                  onClick={() => setTrainingTab("training")}
                  className={`px-3 py-1 ${trainingTab === "training" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Training Records
                </button>
              </div>
            </div>
          </div>

          {trainingTab === "training" && (
            <ComplianceTable
              key={tileDeepLink?.key ?? 0}
              records={records}
              isLoading={primaryLoading && records.length === 0}
              onMemberSelect={handleMemberSelect}
              searchTerm={searchTerm}
              initialLearning={tileDeepLink?.learning}
              initialSortField={tileDeepLink ? "status" : undefined}
              initialSortOrder={tileDeepLink ? "asc" : undefined}
              initialFilterExpiringOrNotStarted={
                tileDeepLink ? false : undefined
              }
            />
          )}

          {trainingTab === "onboarding" && (
            <>
              {joiningJourney.state === "error" && (
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  <div className="text-red-600 mb-2">
                    Failed to load: {joiningJourney.error}
                  </div>
                  <button
                    onClick={() => loadJoiningJourney()}
                    className="text-sm text-purple-600 hover:text-purple-800 underline"
                  >
                    Try again
                  </button>
                </div>
              )}
              {joiningJourney.state === "idle" && (
                <div className="bg-white rounded-lg shadow-sm border">
                  <div className="p-4 border-b">
                    <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
                  </div>
                  <div className="p-4 space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-12 bg-gray-100 rounded animate-pulse"
                      ></div>
                    ))}
                  </div>
                </div>
              )}
              {(joiningJourney.state === "loading" ||
                joiningJourney.state === "loaded") &&
                (joiningJourneyView === "progress" ? (
                  <JoiningJourneyProgress
                    joiningJourneyRecords={joiningJourney.data}
                    learningRecords={records}
                    isLoading={joiningJourney.state === "loading"}
                    onMemberSelect={handleMemberSelect}
                    searchTerm={searchTerm}
                  />
                ) : (
                  <JoiningJourneyTable
                    records={joiningJourney.data}
                    isLoading={joiningJourney.state === "loading"}
                    onMemberSelect={handleMemberSelect}
                    searchTerm={searchTerm}
                  />
                ))}
            </>
          )}
        </section>

        {/* Disclosure Compliance - Lazy loaded */}
        <LazySection
          ref={disclosuresRef}
          id="section-disclosures"
          title="Disclosure Compliance"
          state={disclosures.state}
          error={disclosures.error}
          onRetry={() => loadDisclosures()}
        >
          <DisclosureTable
            records={disclosures.data.records}
            summary={disclosures.data.summary}
            isLoading={disclosures.state === "loading"}
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
          onRetry={() => loadSuspensions()}
        >
          <SuspensionsTable
            records={suspensions.data}
            isLoading={suspensions.state === "loading"}
            onMemberSelect={handleMemberSelect}
            searchTerm={searchTerm}
          />
        </LazySection>

        {/* Team Reviews - Lazy loaded, collapsed by default */}
        <LazySection
          ref={teamReviewsRef}
          title="Team Directory"
          state={teamReviews.state}
          error={teamReviews.error}
          onRetry={() => {
            if (!token && !MOCK_MODE) return;
            loadTeamReviews();
          }}
          collapsed={teamReviewsCollapsed}
          onToggle={() => {
            const next = !teamReviewsCollapsed;
            setTeamReviewsCollapsed(next);
            if (!next && teamReviews.state === "idle" && (token || MOCK_MODE)) {
              loadTeamReviews();
            }
          }}
          headerExtra={
            teamReviews.state === "loaded" && teamReviews.data.length > 0 ? (
              <div className="flex gap-1 rounded-lg overflow-hidden border border-gray-200 text-sm">
                <button
                  onClick={() => setTeamDirView("directory")}
                  className={`px-3 py-1 ${teamDirView === "directory" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Directory
                </button>
                <button
                  onClick={() => setTeamDirView("structure")}
                  className={`px-3 py-1 ${teamDirView === "structure" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Structure
                </button>
              </div>
            ) : undefined
          }
        >
          {teamDirView === "directory" ? (
            <TeamReviewsTable
              records={teamReviews.data}
              isLoading={teamReviews.state === "loading"}
              searchTerm={searchTerm}
              memberNameMap={memberNameMap}
            />
          ) : (
            <TeamStructure
              records={teamReviews.data}
              isLoading={teamReviews.state === "loading"}
              memberNameMap={memberNameMap}
              searchTerm={searchTerm}
            />
          )}
        </LazySection>

        {/* Permits - Lazy loaded, collapsed by default */}
        <LazySection
          ref={permitsRef}
          id="section-permits"
          title="Permits"
          state={permits.state}
          error={permits.error}
          onRetry={() => {
            if (!token && !MOCK_MODE) return;
            loadPermits();
          }}
          collapsed={permitsCollapsed}
          onToggle={() => {
            const next = !permitsCollapsed;
            setPermitsCollapsed(next);
            if (!next && permits.state === "idle" && (token || MOCK_MODE)) {
              loadPermits();
            }
          }}
        >
          <PermitsTable
            records={permits.data}
            isLoading={permits.state === "loading"}
            onMemberSelect={handleMemberSelect}
            searchTerm={searchTerm}
          />
        </LazySection>

        {/* Awards - Lazy loaded, collapsed by default */}
        <LazySection
          ref={awardsRef}
          title="Awards & Recognitions"
          state={awards.state}
          error={awards.error}
          onRetry={() => {
            if (!token && !MOCK_MODE) return;
            loadAwards();
          }}
          collapsed={awardsCollapsed}
          onToggle={() => {
            const next = !awardsCollapsed;
            setAwardsCollapsed(next);
            if (!next && awards.state === "idle" && (token || MOCK_MODE)) {
              loadAwards();
            }
          }}
        >
          <AwardsTable
            records={awards.data}
            isLoading={awards.state === "loading"}
            onMemberSelect={handleMemberSelect}
            searchTerm={searchTerm}
          />
        </LazySection>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
        Data fetched directly from the Scouts membership portal. Cached locally
        for offline access.
        <div className="mt-1">
          <VersionFooter
            updateAvailable={updateAvailable}
            onUpdate={onUpdate}
          />
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
