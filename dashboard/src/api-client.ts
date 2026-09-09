/**
 * Browser-based API client for the Scouts Membership Portal
 *
 * Routes all API calls through the backend proxy to avoid CORS issues.
 */

import type {
  LearningRecord,
  ApiResponse,
  ComplianceSummary,
  DisclosureRecord,
  DisclosureSummary,
  MemberLearningResult,
  JoiningJourneyRecord,
  SuspensionRecord,
  TeamReviewRecord,
  PermitRecord,
  AwardRecord,
} from "./types";
import { clientHeaders } from "./session";
import type { ScopeUnit } from "./scope";
import {
  ALL_UNITS,
  isUnfiltered,
  buildScopeUnits,
  combineQueries,
  pickDefaultScopePrefix,
  readStoredScope,
  scopeQuery,
  writeStoredScope,
} from "./scope";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// Internal (queryable) column names for the signed-in volunteer's own roles.
// `unitPrefix` and `unitId` are not in any view's default field set, so they
// have to be asked for explicitly.
const SCOPE_FIELDS = ["unitPrefix", "unitId", "unitName", "ROLE"];

/**
 * Keep the shape of a query in the console — it is what makes scoping
 * debuggable — without the membership number the scope lookup filters on.
 */
function redactQuery(query: string): string {
  if (!query) return "(none)";
  return query.replace(/(MembershipNumber\s*=\s*)\d+/gi, "$1<redacted>");
}

// Fields to request (camelCase in request, spaces in response)
// NOTE: TeamName/RoleName cause API errors - not available in this view
const LEARNING_COMPLIANCE_FIELDS = [
  "FirstName",
  "LastName",
  "MembershipNumber",
  "Name",
  "Status",
  "ExpiryDate",
  "StartDate", // Member/role start date - used to calculate deadline for new members
];

interface DataExplorerRequest {
  table: string;
  query?: string;
  selectFields?: string[];
  pageNo?: number;
  pageSize?: number;
  orderBy?: string;
  order?: "asc" | "desc" | null;
  distinct?: boolean;
  isDashboardQuery?: boolean;
  contactId?: string;
  /**
   * Skip the GLV scope filter. Only for the scope-resolution query itself
   * (which cannot depend on a scope that is still being resolved) and for
   * table discovery, where the table may not have a `unitPrefix` column.
   */
  skipScope?: boolean;
}

interface ContactDetail {
  id: string;
  membershipno?: string;
}

interface DataExplorerResponse<T> {
  data: T[] | null;
  nextPage: string | null;
  count: number;
  error: string | null;
}

export class ScoutsApiClient {
  private token: string;
  private contactId: string | null = null;

  // GLV scope. Resolved lazily on the first scoped query and shared by every
  // caller, so it works regardless of whether initialize() was called.
  private scopePromise: Promise<void> | null = null;
  private scopeResolved = false;
  private scopeUnits: ScopeUnit[] = [];
  private scopePrefix: string | null = null;
  private contactDetail: Promise<ContactDetail> | null = null;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    console.log(
      `[API] Calling ${endpoint}`,
      body ? { bodyKeys: Object.keys(body as object) } : "",
    );

    const response = await fetch(`${BACKEND_URL}/api/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...clientHeaders(),
      },
      body: JSON.stringify({
        endpoint,
        method: "POST",
        body,
        token: this.token,
      }),
      signal,
    });

    if (response.status === 401) {
      console.error("[API] Token expired");
      throw new Error("TOKEN_EXPIRED");
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] Error: ${response.status}`, errorText);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[API] Response from ${endpoint}:`, {
      hasData: !!result.data,
      dataLength: result.data?.length,
      error: result.error,
    });
    return result as T;
  }

  /**
   * The signed-in volunteer's contact record, fetched at most once per client.
   * Both initialize() and scope resolution need it, and on the path where the
   * contact id did not come from login they would otherwise each pay for their
   * own round-trip on the critical path of the first view load.
   */
  private fetchContactDetail(): Promise<ContactDetail> {
    if (!this.contactDetail) {
      this.contactDetail = this.request<ContactDetail>(
        "/GetContactDetailAsync",
        {},
      ).catch((err) => {
        this.contactDetail = null;
        throw err;
      });
    }
    return this.contactDetail;
  }

  async initialize(): Promise<void> {
    console.log("[API] Initializing - fetching contact details");
    const contact = await this.fetchContactDetail();
    this.contactId = contact.id;
    console.log("[API] Contact ID:", this.contactId);
  }

  getContactId(): string | null {
    return this.contactId;
  }

  /** Units the signed-in volunteer holds a role in. Empty until scope resolves. */
  getScopeUnits(): ScopeUnit[] {
    return this.scopeUnits;
  }

  /**
   * The current scope: a unit prefix, the ALL_UNITS sentinel when the volunteer
   * asked for everything, or null when no unit could be resolved. The last two
   * both mean "unfiltered" — use isUnfiltered() rather than a null check.
   */
  getScopePrefix(): string | null {
    return this.scopePrefix;
  }

  /**
   * Override the scope. Pass ALL_UNITS to stop filtering, or null to go back to
   * the automatic choice. The caller is responsible for refetching.
   */
  setScopePrefix(prefix: string | null): void {
    writeStoredScope(prefix);
    this.scopePrefix =
      prefix === null ? pickDefaultScopePrefix(this.scopeUnits) : prefix;
    console.log(
      "[API] Scope set to",
      isUnfiltered(this.scopePrefix) ? "(unfiltered)" : this.scopePrefix,
    );
  }

  /** Resolve the scope at most once per client. */
  private ensureScope(): Promise<void> {
    if (this.scopeResolved) return Promise.resolve();
    if (!this.scopePromise) {
      this.scopePromise = this.resolveScope().catch((err) => {
        // Leave the dashboard usable — an unfiltered view is better than none.
        console.warn("[API] Scope resolution failed, querying unfiltered", err);
        this.scopeResolved = true;
        this.scopePrefix = null;
      });
    }
    return this.scopePromise;
  }

  private async resolveScope(): Promise<void> {
    const contact = await this.fetchContactDetail();
    if (!this.contactId) this.contactId = contact.id;

    // MembershipNumber is an int column, so only digits may be interpolated.
    const membershipNumber = String(contact.membershipno ?? "").trim();
    if (!/^\d+$/.test(membershipNumber)) {
      console.warn("[API] No usable membership number; querying unfiltered");
      this.scopeResolved = true;
      return;
    }

    const result = await this.query<Record<string, unknown>>({
      table: "LearningComplianceDashboardView",
      query: `MembershipNumber = ${membershipNumber}`,
      selectFields: SCOPE_FIELDS,
      pageNo: 1,
      pageSize: 200,
      distinct: true,
      skipScope: true,
    });

    if (result.error) {
      throw new Error(`Scope query failed: ${result.error}`);
    }

    this.scopeUnits = buildScopeUnits(result.data || []);

    // An explicit choice wins, but only while it still matches a unit the
    // volunteer holds a role in — roles change between sessions.
    const stored = readStoredScope();
    const storedIsUsable =
      stored === ALL_UNITS ||
      (stored !== null && this.scopeUnits.some((u) => u.unitPrefix === stored));

    this.scopePrefix = storedIsUsable
      ? stored
      : pickDefaultScopePrefix(this.scopeUnits);

    if (stored !== null && !storedIsUsable) writeStoredScope(null);

    this.scopeResolved = true;
    console.log(
      `[API] Scope resolved: ${this.scopeUnits.length} unit(s), filtering on ${
        isUnfiltered(this.scopePrefix) ? "(nothing)" : this.scopePrefix
      }`,
    );
  }

  private async query<T>(
    request: DataExplorerRequest,
    signal?: AbortSignal,
  ): Promise<DataExplorerResponse<T>> {
    // Constrain every view to the volunteer's GLV scope. Without this the API
    // returns the widest hierarchy any of their roles reaches into.
    let query = request.query || "";
    if (!request.skipScope) {
      await this.ensureScope();
      query = combineQueries(scopeQuery(this.scopePrefix), query);
    }

    // NOTE: orderBy and order must be empty/null - non-empty values cause API errors
    const body = {
      table: request.table,
      query,
      selectFields: request.selectFields || [],
      pageNo: request.pageNo ?? 1,
      pageSize: request.pageSize ?? 50,
      orderBy: "", // Must be empty - API errors with non-empty values
      order: null, // Must be null - API errors with non-null values
      distinct: request.distinct ?? true,
      isDashboardQuery: request.isDashboardQuery ?? false,
      contactId: request.contactId || this.contactId || "",
      id: "",
      name: "",
    };

    console.log("[API] Query:", {
      table: body.table,
      contactId: body.contactId || "(empty)",
      thisContactId: this.contactId || "(empty)",
      pageSize: body.pageSize,
      query: redactQuery(body.query),
    });
    return this.request<DataExplorerResponse<T>>(
      "/DataExplorer/GetResultsAsync",
      body,
      signal,
    );
  }

  async getAllLearningCompliance(
    pageSize: number = 500,
    signal?: AbortSignal,
  ): Promise<ApiResponse<LearningRecord>> {
    console.log("[API] Fetching learning compliance data");

    const result = await this.query<Record<string, unknown>>(
      {
        table: "LearningComplianceDashboardView",
        selectFields: LEARNING_COMPLIANCE_FIELDS,
        query: "",
        pageNo: 1,
        pageSize,
        distinct: true,
      },
      signal,
    );

    if (result.error) {
      console.error("[API] Query error:", result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    // Transform API response to use our interface field names
    const rawData = (result.data || []).map(
      (record): LearningRecord => ({
        "First name": String(record["First name"] || record["FirstName"] || ""),
        "Last name": String(record["Last name"] || record["LastName"] || ""),
        "Membership number": String(
          record["Membership number"] || record["MembershipNumber"] || "",
        ),
        "Team name":
          (record["Team name"] as string | undefined) ||
          (record["TeamName"] as string | undefined),
        "Role name":
          (record["Role name"] as string | undefined) ||
          (record["RoleName"] as string | undefined),
        Learning: String(record["Learning"] || record["Name"] || ""),
        Status: String(record["Status"] || ""),
        "Expiry date":
          (record["Expiry date"] as string | null) ||
          (record["ExpiryDate"] as string | null),
        "Start date":
          (record["Start date"] as string | null) ||
          (record["StartDate"] as string | null),
        "Days since expiry":
          (record["Days since expiry"] as number | null) ||
          (record["DaysSinceExpiry"] as number | null),
        "Email address":
          (record["Email address"] as string | undefined) ||
          (record["EmailAddress"] as string | undefined),
        "Member suspended":
          (record["Member suspended"] as string | undefined) ||
          (record["MemberSuspended"] as string | undefined),
      }),
    );

    // Deduplicate by membership number + learning type
    // Keep the worst-status record (earliest start date as tiebreaker)
    const data = this.deduplicateRecords(rawData);

    console.log(
      `[API] Transformed ${rawData.length} records, deduplicated to ${data.length}`,
    );

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  /**
   * Deduplicate records by membership number + learning type.
   * When a member has multiple roles, they appear multiple times in the API response.
   * We keep the record with the worst compliance status so that "Not Started" or
   * "Expired" are never silently dropped in favour of a "Valid" record from another role.
   * When statuses are equal we keep the earliest start date (most relevant for deadline).
   * When taking the worse-status record we also carry over the earliest start date from
   * any duplicate, so deadline calculations remain correct.
   */
  private deduplicateRecords(records: LearningRecord[]): LearningRecord[] {
    // Lower rank = worse status = should be surfaced.
    const STATUS_RANK: Record<string, number> = {
      "Not Started": 0,
      Expired: 1,
      Expiring: 2,
      "Renewal Due": 3,
      "Expiring Soon": 4,
      "In-Progress": 5,
      Valid: 6,
    };
    const rank = (r: LearningRecord) => STATUS_RANK[r.Status] ?? 5;
    const startMs = (r: LearningRecord) =>
      r["Start date"] ? new Date(r["Start date"]).getTime() : Infinity;

    const seen = new Map<string, LearningRecord>();

    for (const record of records) {
      const key = `${record["Membership number"]}-${record.Learning}`;
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, record);
      } else {
        const existingRank = rank(existing);
        const currentRank = rank(record);

        if (currentRank < existingRank) {
          // Worse status — take this record but preserve the earliest start date.
          const earliest = Math.min(startMs(existing), startMs(record));
          const earliestDate = isFinite(earliest)
            ? new Date(earliest).toISOString()
            : (existing["Start date"] ?? record["Start date"]);
          seen.set(key, { ...record, "Start date": earliestDate });
        } else if (
          currentRank === existingRank &&
          startMs(record) < startMs(existing)
        ) {
          // Same status, earlier start date — swap in for deadline accuracy.
          seen.set(key, record);
        }
        // else: existing is already the worse (or equal) record — keep it.
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Deduplicate joining journey records by membership number + item.
   * When a member has multiple roles, they appear multiple times in the API response.
   * We keep one record per person/item.
   */
  private deduplicateJoiningJourney(
    records: JoiningJourneyRecord[],
  ): JoiningJourneyRecord[] {
    const seen = new Map<string, JoiningJourneyRecord>();

    for (const record of records) {
      const key = `${record["Membership number"]}-${record.Item}`;
      if (!seen.has(key)) {
        seen.set(key, record);
      }
    }

    return Array.from(seen.values());
  }

  async getJoiningJourney(
    pageSize: number = 500,
  ): Promise<ApiResponse<JoiningJourneyRecord>> {
    console.log("[API] Fetching joining journey data");

    // The InProgressActionDashboardView contains onboarding action items
    // "Category key" values for joining journey items:
    // - signDeclaration: Declaration
    // - referenceRequest: References
    // - welcomeConversation: Welcome Conversation
    // - getCriminalRecordCheck: Criminal Record Check
    // - safeguardconfidentialEnquiryCheck: Internal Check
    // - managerTrusteeCheck: Trustee Eligibility Check
    // - growingRoots: Growing Roots
    // - coreLearning: Core Learning

    // Query all onboarding actions - filter client-side for "Outstanding" status
    // Note: API field names have spaces, e.g., "Category key", "On boarding action status"
    const result = await this.query<Record<string, unknown>>({
      table: "InProgressActionDashboardView",
      selectFields: [], // Get all fields - specific fields may cause errors
      query: "", // Get all records - filter client-side
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error("[API] Joining journey query error:", result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    // Transform API response - log fields to understand structure
    if (result.data && result.data.length > 0) {
      console.log(
        "[API] InProgressActionDashboardView fields:",
        Object.keys(result.data[0]),
      );
      console.log("[API] Sample record:", result.data[0]);
    }

    // Map Category key to human-readable item names
    const categoryKeyToItem: Record<string, string> = {
      signDeclaration: "Declaration",
      referenceRequest: "References",
      welcomeConversation: "Welcome Conversation",
      getCriminalRecordCheck: "Criminal Record Check",
      safeguardconfidentialEnquiryCheck: "Internal Check",
      managerTrusteeCheck: "Trustee Eligibility Check",
      growingRoots: "Growing Roots",
      coreLearning: "Core Learning",
      dataProtectionTrainingComplete: "Data Protection",
      managerDisclosureCheck: "Criminal Record/Disclosure Check",
      updateMemberProfile: "Confirm Member Profile",
    };

    // Filter for Outstanding items only (incomplete onboarding actions)
    const outstandingRecords = (result.data || []).filter((record) => {
      const onboardingStatus = String(
        record["On boarding action status"] || "",
      );
      return onboardingStatus === "Outstanding";
    });

    console.log(
      `[API] Filtered to ${outstandingRecords.length} outstanding records from ${result.data?.length || 0} total`,
    );

    const rawData = outstandingRecords.map((record): JoiningJourneyRecord => {
      const categoryKey = String(record["Category key"] || "");
      return {
        "First name": String(record["First name"] || ""),
        "Last name": String(record["Last name"] || ""),
        "Membership number": String(record["Membership number"] || ""),
        Item: categoryKeyToItem[categoryKey] || categoryKey || "Unknown",
        Status: "Incomplete",
        "Due date": (record["Due date"] as string | null) || null,
        "Completed date": (record["Completed date"] as string | null) || null,
      };
    });

    // Deduplicate by membership number + item (members with multiple roles appear multiple times)
    const data = this.deduplicateJoiningJourney(rawData);

    console.log(
      `[API] Transformed ${rawData.length} records, deduplicated to ${data.length} joining journey records`,
    );

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  computeDisclosureSummary(records: DisclosureRecord[]): DisclosureSummary {
    const byStatus: Record<string, number> = {};
    let expired = 0;
    let expiringSoon = 0;
    let valid = 0;

    const now = new Date();
    const ninetyDaysFromNow = new Date(
      now.getTime() + 90 * 24 * 60 * 60 * 1000,
    );

    for (const record of records) {
      const status = record["Disclosure status"] || "Unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;

      if (status.toLowerCase().includes("expired")) {
        expired++;
      } else if (record["Disclosure expiry date"]) {
        const expiryDate = new Date(record["Disclosure expiry date"]);
        if (expiryDate < now) {
          expired++;
        } else if (expiryDate < ninetyDaysFromNow) {
          expiringSoon++;
        } else {
          valid++;
        }
      } else {
        valid++;
      }
    }

    return {
      total: records.length,
      byStatus,
      expired,
      expiringSoon,
      valid,
    };
  }

  /**
   * Check learning by membership numbers
   * Uses MemberListingAsync to find contact IDs, then fetches learning via GetLmsDetailsAsync
   */
  async checkLearningByMembershipNumbers(
    membershipNumbers: string[],
    signal?: AbortSignal,
  ): Promise<{
    success: boolean;
    members?: MemberLearningResult[];
    error?: string;
  }> {
    console.log(
      `[API] Checking learning for ${membershipNumbers.length} members...`,
    );

    try {
      const response = await fetch(`${BACKEND_URL}/api/check-learning`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...clientHeaders() },
        body: JSON.stringify({
          token: this.token,
          membershipNumbers,
        }),
        signal,
      });

      if (response.status === 401) {
        throw new Error("TOKEN_EXPIRED");
      }

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
      }

      const result = await response.json();
      console.log("[API] Check learning result:", result);
      return result;
    } catch (err) {
      if ((err as Error).message === "TOKEN_EXPIRED") throw err;
      console.error("[API] Check learning error:", err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Test querying a table to discover available views
   */
  async testTable(
    tableName: string,
  ): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    console.log(`[API] Testing table: ${tableName}`);
    try {
      const result = await this.query<Record<string, unknown>>({
        table: tableName,
        selectFields: [],
        query: "",
        pageNo: 1,
        pageSize: 5,
        distinct: true,
        // Discovery probe: an unknown table may have no unitPrefix column.
        skipScope: true,
      });

      if (result.error) {
        console.log(`[API] Table ${tableName} error:`, result.error);
        return { success: false, error: result.error };
      }

      console.log(
        `[API] Table ${tableName} success:`,
        result.data?.length,
        "records",
      );
      if (result.data && result.data.length > 0) {
        console.log(`[API] Sample record fields:`, Object.keys(result.data[0]));
      }
      return { success: true, data: result.data || [] };
    } catch (err) {
      console.log(`[API] Table ${tableName} exception:`, err);
      return { success: false, error: String(err) };
    }
  }

  computeComplianceSummary(records: LearningRecord[]): ComplianceSummary {
    const byLearningType: ComplianceSummary["byLearningType"] = {};
    const byStatus: ComplianceSummary["byStatus"] = {};

    for (const record of records) {
      const learning = record.Learning || "Unknown";
      const status = record.Status || "Unknown";

      // Initialize learning type if not exists
      if (!byLearningType[learning]) {
        byLearningType[learning] = {
          total: 0,
          compliant: 0,
          expiring: 0,
          expired: 0,
        };
      }

      byLearningType[learning].total++;

      // Categorize by status
      if (status === "Valid" || status === "In-Progress") {
        byLearningType[learning].compliant++;
      } else if (
        status === "Expiring" ||
        status === "Renewal Due" ||
        status === "Expiring Soon"
      ) {
        byLearningType[learning].expiring++;
      } else if (status === "Expired" || status === "Not Started") {
        byLearningType[learning].expired++;
      }

      // Count by status
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    const expiringSoon = records.filter(
      (r) =>
        r.Status === "Expiring" ||
        r.Status === "Renewal Due" ||
        r.Status === "Expiring Soon",
    ).length;

    return {
      total: records.length,
      byLearningType,
      byStatus,
      expiringSoon,
    };
  }

  /**
   * Fetch disclosure compliance data from DisclosureComplianceDashboardView
   */
  async getDisclosureCompliance(
    pageSize: number = 500,
  ): Promise<ApiResponse<DisclosureRecord>> {
    console.log("[API] Fetching disclosure compliance data");

    const result = await this.query<Record<string, unknown>>({
      table: "DisclosureComplianceDashboardView",
      selectFields: [],
      query: "",
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error("[API] Disclosure compliance query error:", result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map(
      (record): DisclosureRecord => ({
        "First name": String(record["First name"] || ""),
        "Last name": String(record["Surname"] || record["Last name"] || ""),
        "Membership number": String(record["Membership number"] || ""),
        "Communication email": record["Communication email"] as string,
        "Unit name": record["Unit name"] as string,
        "Team name": record["Team"] as string,
        "Role name": record["Role"] as string,
        "Disclosure authority": String(record["Disclosure authority"] || ""),
        "Disclosure status": String(record["Disclosure status"] || ""),
        "Disclosure issue date": record["Disclosure issue date"] as
          | string
          | null,
        "Disclosure expiry date": record["Disclosure expiry date"] as
          | string
          | null,
        "Days since expiry": record["Days since expiry"] as number | null,
      }),
    );

    console.log(
      `[API] Transformed ${data.length} disclosure compliance records`,
    );

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  /**
   * Fetch suspensions data from SuspensionDashboardView
   */
  async getSuspensions(
    pageSize: number = 500,
  ): Promise<ApiResponse<SuspensionRecord>> {
    console.log("[API] Fetching suspensions data");

    const result = await this.query<Record<string, unknown>>({
      table: "SuspensionDashboardView",
      selectFields: [],
      query: "",
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error("[API] Suspensions query error:", result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map(
      (record): SuspensionRecord => ({
        "First name": String(record["First name"] || ""),
        "Last name": String(record["Last name"] || ""),
        "Membership number": String(record["Membership number"] || ""),
        Role: String(record["Role"] || ""),
        Team: String(record["Team"] || ""),
        "Unit name": String(record["Unit name"] || ""),
        "Suspension date": record["Suspension date"] as string | null,
        "Suspension reason": record["Suspension reason"] as string,
        "Communication email": record["Communication email"] as string,
      }),
    );

    console.log(`[API] Transformed ${data.length} suspension records`);

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  /**
   * Fetch team directory reviews from TeamDirectoryReviewsDashboardView
   */
  async getTeamReviews(
    pageSize: number = 500,
  ): Promise<ApiResponse<TeamReviewRecord>> {
    console.log("[API] Fetching team directory reviews data");

    const result = await this.query<Record<string, unknown>>({
      table: "TeamDirectoryReviewsDashboardView",
      selectFields: [],
      query: "",
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error("[API] Team reviews query error:", result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map(
      (record): TeamReviewRecord => ({
        // Keep the view's other fields — they tell otherwise-identical rows apart
        ...record,
        "First name": record["First name"] as string,
        "Last name": record["Last name"] as string,
        "Membership number": String(record["Membership number"] || ""),
        Role: String(record["Role"] || ""),
        "Team leader": String(record["Team leader"] || ""),
        "Scheduled review date": record["Scheduled review date"] as
          | string
          | null,
        "Review overdue": String(record["Review overdue"] || ""),
        Group: record["Group"] as string,
        District: record["District"] as string,
      }),
    );

    console.log(`[API] Transformed ${data.length} team review records`);

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  /**
   * Fetch permits data from PermitsDashboardView
   */
  async getPermits(pageSize: number = 500): Promise<ApiResponse<PermitRecord>> {
    console.log("[API] Fetching permits data");

    const result = await this.query<Record<string, unknown>>({
      table: "PermitsDashboardView",
      selectFields: [],
      query: "",
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error("[API] Permits query error:", result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map(
      (record): PermitRecord => ({
        // Keep the view's other fields — they tell otherwise-identical rows apart
        ...record,
        "First name": String(record["First name"] || ""),
        "Last name": String(record["Last name"] || ""),
        "Membership number": String(record["Membership number"] || ""),
        "Permit category": String(record["Permit category"] || ""),
        "Permit type": record["Permit type"] as string,
        "Permit status": String(record["Permit status"] || ""),
        "Permit expiry date": record["Permit expiry date"] as string | null,
        "Permit restriction details": record[
          "Permit restriction details"
        ] as string,
        "Unit name": record["Unit name"] as string,
        Team: record["Team"] as string,
        "Communication email": record["Communication email"] as string,
      }),
    );

    console.log(`[API] Transformed ${data.length} permit records`);

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  /**
   * Fetch awards data from PreloadedAwardsDashboardView
   */
  async getAwards(pageSize: number = 500): Promise<ApiResponse<AwardRecord>> {
    console.log("[API] Fetching awards data");

    const result = await this.query<Record<string, unknown>>({
      table: "PreloadedAwardsDashboardView",
      selectFields: [],
      query: "",
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error("[API] Awards query error:", result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map(
      (record): AwardRecord => ({
        "First name": String(record["First name"] || ""),
        "Last name": String(record["Last name"] || ""),
        "Membership number": String(record["Membership number"] || ""),
        Accreditation: String(record["Accreditation"] || ""),
        Role: String(record["Role"] || ""),
        Team: record["Team"] as string,
        "Unit name": record["Unit name"] as string,
        "Contact number": record["Contact number"] as string,
        "Communication email": record["Communication email"] as string,
      }),
    );

    console.log(`[API] Transformed ${data.length} award records`);

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }
}

export function createApiClient(token: string): ScoutsApiClient {
  return new ScoutsApiClient(token);
}
