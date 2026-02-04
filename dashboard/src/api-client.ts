/**
 * Browser-based API client for the Scouts Membership Portal
 *
 * Routes all API calls through the backend proxy to avoid CORS issues.
 */

import type { LearningRecord, ApiResponse, ComplianceSummary, DisclosureRecord, DisclosureSummary, MemberDisclosureResult, MemberLearningResult, JoiningJourneyRecord, AppointmentRecord, SuspensionRecord, TeamReviewRecord, PermitRecord, AwardRecord } from './types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Fields to request (camelCase in request, spaces in response)
// NOTE: TeamName/RoleName cause API errors - not available in this view
const LEARNING_COMPLIANCE_FIELDS = [
  'FirstName',
  'LastName',
  'MembershipNumber',
  'Name',
  'Status',
  'ExpiryDate',
  'StartDate',  // Member/role start date - used to calculate deadline for new members
];

interface DataExplorerRequest {
  table: string;
  query?: string;
  selectFields?: string[];
  pageNo?: number;
  pageSize?: number;
  orderBy?: string;
  order?: 'asc' | 'desc' | null;
  distinct?: boolean;
  isDashboardQuery?: boolean;
  contactId?: string;
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

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, body?: unknown): Promise<T> {
    console.log(`[API] Calling ${endpoint}`, body ? { bodyKeys: Object.keys(body as object) } : '');

    const response = await fetch(`${BACKEND_URL}/api/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint,
        method: 'POST',
        body,
        token: this.token,
      }),
    });

    if (response.status === 401) {
      console.error('[API] Token expired');
      throw new Error('TOKEN_EXPIRED');
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
      error: result.error
    });
    return result as T;
  }

  async initialize(): Promise<void> {
    console.log('[API] Initializing - fetching contact details');
    const contact = await this.request<{ id: string }>('/GetContactDetailAsync', {});
    this.contactId = contact.id;
    console.log('[API] Contact ID:', this.contactId);
  }

  getContactId(): string | null {
    return this.contactId;
  }

  private async query<T>(request: DataExplorerRequest): Promise<DataExplorerResponse<T>> {
    // NOTE: orderBy and order must be empty/null - non-empty values cause API errors
    const body = {
      table: request.table,
      query: request.query || '',
      selectFields: request.selectFields || [],
      pageNo: request.pageNo ?? 1,
      pageSize: request.pageSize ?? 50,
      orderBy: '',  // Must be empty - API errors with non-empty values
      order: null,  // Must be null - API errors with non-null values
      distinct: request.distinct ?? true,
      isDashboardQuery: request.isDashboardQuery ?? false,
      contactId: request.contactId || this.contactId || '',
      id: '',
      name: '',
    };

    console.log('[API] Query:', { table: body.table, contactId: body.contactId || '(empty)', thisContactId: this.contactId || '(empty)', pageSize: body.pageSize });
    return this.request<DataExplorerResponse<T>>('/DataExplorer/GetResultsAsync', body);
  }

  async getAllLearningCompliance(pageSize: number = 500): Promise<ApiResponse<LearningRecord>> {
    console.log('[API] Fetching learning compliance data');

    const result = await this.query<Record<string, unknown>>({
      table: 'LearningComplianceDashboardView',
      selectFields: LEARNING_COMPLIANCE_FIELDS,
      query: '',
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    // Transform API response to use our interface field names
    const rawData = (result.data || []).map((record): LearningRecord => ({
      'First name': String(record['First name'] || record['FirstName'] || ''),
      'Last name': String(record['Last name'] || record['LastName'] || ''),
      'Membership number': String(record['Membership number'] || record['MembershipNumber'] || ''),
      'Team name': record['Team name'] as string | undefined || record['TeamName'] as string | undefined,
      'Role name': record['Role name'] as string | undefined || record['RoleName'] as string | undefined,
      'Learning': String(record['Learning'] || record['Name'] || ''),
      'Status': String(record['Status'] || ''),
      'Expiry date': record['Expiry date'] as string | null || record['ExpiryDate'] as string | null,
      'Start date': record['Start date'] as string | null || record['StartDate'] as string | null,
      'Days since expiry': record['Days since expiry'] as number | null || record['DaysSinceExpiry'] as number | null,
      'Email address': record['Email address'] as string | undefined || record['EmailAddress'] as string | undefined,
      'Member suspended': record['Member suspended'] as string | undefined || record['MemberSuspended'] as string | undefined,
    }));

    // Deduplicate by membership number + learning type
    // Keep the record with the earliest start date (for deadline calculation)
    const data = this.deduplicateRecords(rawData);

    console.log(`[API] Transformed ${rawData.length} records, deduplicated to ${data.length}`);

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
   * For compliance, we keep one record per person/learning, using the earliest start date.
   */
  private deduplicateRecords(records: LearningRecord[]): LearningRecord[] {
    const seen = new Map<string, LearningRecord>();

    for (const record of records) {
      const key = `${record['Membership number']}-${record.Learning}`;
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, record);
      } else {
        // Keep the record with the earliest start date (most relevant for deadline)
        const existingStart = existing['Start date'] ? new Date(existing['Start date']).getTime() : Infinity;
        const currentStart = record['Start date'] ? new Date(record['Start date']).getTime() : Infinity;

        if (currentStart < existingStart) {
          seen.set(key, record);
        }
      }
    }

    return Array.from(seen.values());
  }

  async getJoiningJourney(pageSize: number = 500): Promise<ApiResponse<JoiningJourneyRecord>> {
    console.log('[API] Fetching joining journey data');

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
      table: 'InProgressActionDashboardView',
      selectFields: [],  // Get all fields - specific fields may cause errors
      query: '',  // Get all records - filter client-side
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Joining journey query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    // Transform API response - log fields to understand structure
    if (result.data && result.data.length > 0) {
      console.log('[API] InProgressActionDashboardView fields:', Object.keys(result.data[0]));
      console.log('[API] Sample record:', result.data[0]);
    }

    // Map Category key to human-readable item names
    const categoryKeyToItem: Record<string, string> = {
      'signDeclaration': 'Declaration',
      'referenceRequest': 'References',
      'welcomeConversation': 'Welcome Conversation',
      'getCriminalRecordCheck': 'Criminal Record Check',
      'safeguardconfidentialEnquiryCheck': 'Internal Check',
      'managerTrusteeCheck': 'Trustee Eligibility Check',
      'growingRoots': 'Growing Roots',
      'coreLearning': 'Core Learning',
    };

    // Filter for Outstanding items only (incomplete onboarding actions)
    const outstandingRecords = (result.data || []).filter(record => {
      const onboardingStatus = String(record['On boarding action status'] || '');
      return onboardingStatus === 'Outstanding';
    });

    console.log(`[API] Filtered to ${outstandingRecords.length} outstanding records from ${result.data?.length || 0} total`);

    const data = outstandingRecords.map((record): JoiningJourneyRecord => {
      const categoryKey = String(record['Category key'] || '');
      return {
        'First name': String(record['First name'] || ''),
        'Last name': String(record['Last name'] || ''),
        'Membership number': String(record['Membership number'] || ''),
        'Item': categoryKeyToItem[categoryKey] || categoryKey || 'Unknown',
        'Status': 'Incomplete',
        'Due date': record['Due date'] as string | null || null,
        'Completed date': record['Completed date'] as string | null || null,
      };
    });

    console.log(`[API] Transformed ${data.length} joining journey records`);

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  async getAllDisclosures(pageSize: number = 500): Promise<ApiResponse<DisclosureRecord>> {
    console.log('[API] Fetching disclosure compliance data');

    // NOTE: Like learning, requesting specific fields causes API errors
    // Use empty selectFields to get all data
    const result = await this.query<Record<string, unknown>>({
      table: 'DisclosureComplianceDashboardView',
      selectFields: [],
      query: '',
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Disclosure query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    // Transform API response - disclosure view has these fields:
    // "First name", "Surname", "Membership number", "Communication email", "Unit name",
    // "Disclosure authority", "Disclosure status", "Disclosure issue date", "Disclosure expiry date",
    // "Days since expiry", "Role", "Team", "Status"
    const rawData = (result.data || []).map((record): DisclosureRecord => ({
      'First name': String(record['First name'] || ''),
      'Last name': String(record['Surname'] || record['Last name'] || ''),
      'Membership number': String(record['Membership number'] || ''),
      'Communication email': record['Communication email'] as string,
      'Unit name': record['Unit name'] as string,
      'Disclosure authority': String(record['Disclosure authority'] || ''),
      'Disclosure status': String(record['Disclosure status'] || ''),
      'Disclosure issue date': record['Disclosure issue date'] as string | null,
      'Disclosure expiry date': record['Disclosure expiry date'] as string | null,
      'Days since expiry': record['Days since expiry'] as number | null,
      'Role name': record['Role'] as string,
      'Team name': record['Team'] as string,
    }));

    // Deduplicate by membership number (keep earliest expiry)
    const data = this.deduplicateDisclosures(rawData);

    console.log(`[API] Transformed ${rawData.length} disclosure records, deduplicated to ${data.length}`);

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  private deduplicateDisclosures(records: DisclosureRecord[]): DisclosureRecord[] {
    const seen = new Map<string, DisclosureRecord>();

    for (const record of records) {
      const key = record['Membership number'];
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, record);
      } else {
        // Keep the record with the earliest expiry date (most urgent)
        const existingExpiry = existing['Disclosure expiry date'] ? new Date(existing['Disclosure expiry date']).getTime() : Infinity;
        const currentExpiry = record['Disclosure expiry date'] ? new Date(record['Disclosure expiry date']).getTime() : Infinity;

        if (currentExpiry < existingExpiry) {
          seen.set(key, record);
        }
      }
    }

    return Array.from(seen.values());
  }

  computeDisclosureSummary(records: DisclosureRecord[]): DisclosureSummary {
    const byStatus: Record<string, number> = {};
    let expired = 0;
    let expiringSoon = 0;
    let valid = 0;

    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    for (const record of records) {
      const status = record['Disclosure status'] || 'Unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;

      if (status.toLowerCase().includes('expired')) {
        expired++;
      } else if (record['Disclosure expiry date']) {
        const expiryDate = new Date(record['Disclosure expiry date']);
        if (expiryDate < now) {
          expired++;
        } else if (expiryDate < sixtyDaysFromNow) {
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
   * Generate a SAS token for Azure Table Storage access
   * Parameters: table, partitionkey (contact ID), permissions
   */
  async generateSASToken(table: string, partitionKey: string): Promise<{ success: boolean; token?: string; error?: string }> {
    console.log(`[API] Generating SAS token for table: ${table}, partitionKey: ${partitionKey}`);

    try {
      const result = await this.request<{ uri: string; token: string }>('/GenerateSASTokenAsync', {
        table,
        partitionkey: partitionKey,
        permissions: 'R',
      });
      console.log('[API] SAS token response:', result);
      return { success: true, token: result.token };
    } catch (err) {
      console.error('[API] SAS token error:', err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Fetch disclosures from Azure Table Storage for a specific contact
   */
  async getDisclosureForContact(memberContactId: string): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    console.log(`[API] Fetching disclosures from Table Storage for contact: ${memberContactId}`);

    // Get a SAS token for this member's disclosures
    const sasResult = await this.generateSASToken('Disclosures', memberContactId);
    if (!sasResult.success || !sasResult.token) {
      return { success: false, error: sasResult.error || 'Failed to get SAS token' };
    }

    console.log('[API] Got SAS URL:', sasResult.token);

    // Fetch from the SAS URL (the token field contains the full URL)
    try {
      const response = await fetch(sasResult.token, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return { success: false, error: `Table Storage error: ${response.status}` };
      }

      const result = await response.json();
      console.log('[API] Table Storage result:', result);
      return { success: true, data: result.value || [] };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Get all member contact IDs from learning records
   */
  getMemberContactIds(): string[] {
    // Note: Learning records don't have contact IDs, only membership numbers
    // We'd need a different approach to get contact IDs for all members
    return [];
  }

  /**
   * Scrape disclosures by navigating to member pages with Playwright
   * Requires credentials and list of member contact IDs
   */
  async scrapeDisclosures(
    username: string,
    password: string,
    memberContactIds: string[]
  ): Promise<{ success: boolean; members?: unknown[]; error?: string }> {
    console.log(`[API] Scraping disclosures for ${memberContactIds.length} members...`);

    try {
      const response = await fetch(`${BACKEND_URL}/api/scrape-disclosures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          memberContactIds,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
      }

      const result = await response.json();
      console.log('[API] Scrape result:', result);
      return result;
    } catch (err) {
      console.error('[API] Scrape error:', err);
      return { success: false, error: String(err) };
    }
  }

/**
   * Check learning by membership numbers
   * Uses MemberListingAsync to find contact IDs, then fetches learning via GetLmsDetailsAsync
   */
  async checkLearningByMembershipNumbers(
    membershipNumbers: string[]
  ): Promise<{ success: boolean; members?: MemberLearningResult[]; error?: string }> {
    console.log(`[API] Checking learning for ${membershipNumbers.length} members...`);

    try {
      const response = await fetch(`${BACKEND_URL}/api/check-learning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          membershipNumbers,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
      }

      const result = await response.json();
      console.log('[API] Check learning result:', result);
      return result;
    } catch (err) {
      console.error('[API] Check learning error:', err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Check disclosures by membership numbers (preferred method)
   * Uses MemberListingAsync to find contact IDs, then fetches disclosures from Table Storage
   */
  async checkDisclosuresByMembershipNumbers(
    membershipNumbers: string[]
  ): Promise<{ success: boolean; members?: MemberDisclosureResult[]; error?: string }> {
    console.log(`[API] Checking disclosures for ${membershipNumbers.length} members...`);

    try {
      const response = await fetch(`${BACKEND_URL}/api/check-disclosures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          membershipNumbers,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
      }

      const result = await response.json();
      console.log('[API] Check disclosures result:', result);
      return result;
    } catch (err) {
      console.error('[API] Check disclosures error:', err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Explore disclosures using the backend scraper
   * This discovers member contact IDs and fetches detailed disclosure data
   */
  async exploreDisclosures(): Promise<{ success: boolean; members?: unknown[]; error?: string }> {
    console.log('[API] Exploring disclosures via backend...');

    try {
      const response = await fetch(`${BACKEND_URL}/api/explore-disclosures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          contactId: this.contactId,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
      }

      const result = await response.json();
      console.log('[API] Explore result:', result);
      return result;
    } catch (err) {
      console.error('[API] Explore error:', err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Test querying a table to discover available views
   */
  async testTable(tableName: string): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    console.log(`[API] Testing table: ${tableName}`);
    try {
      const result = await this.query<Record<string, unknown>>({
        table: tableName,
        selectFields: [],
        query: '',
        pageNo: 1,
        pageSize: 5,
        distinct: true,
      });

      if (result.error) {
        console.log(`[API] Table ${tableName} error:`, result.error);
        return { success: false, error: result.error };
      }

      console.log(`[API] Table ${tableName} success:`, result.data?.length, 'records');
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
    const byLearningType: ComplianceSummary['byLearningType'] = {};
    const byStatus: ComplianceSummary['byStatus'] = {};

    for (const record of records) {
      const learning = record.Learning || 'Unknown';
      const status = record.Status || 'Unknown';

      // Initialize learning type if not exists
      if (!byLearningType[learning]) {
        byLearningType[learning] = { total: 0, compliant: 0, expiring: 0, expired: 0 };
      }

      byLearningType[learning].total++;

      // Categorize by status
      if (status === 'Valid' || status === 'In-Progress') {
        byLearningType[learning].compliant++;
      } else if (status === 'Expiring' || status === 'Renewal Due') {
        byLearningType[learning].expiring++;
      } else if (status === 'Expired' || status === 'Not Started') {
        byLearningType[learning].expired++;
      }

      // Count by status
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    return {
      total: records.length,
      byLearningType,
      byStatus,
    };
  }

  /**
   * Fetch disclosure compliance data from DisclosureComplianceDashboardView
   */
  async getDisclosureCompliance(pageSize: number = 500): Promise<ApiResponse<DisclosureRecord>> {
    console.log('[API] Fetching disclosure compliance data');

    const result = await this.query<Record<string, unknown>>({
      table: 'DisclosureComplianceDashboardView',
      selectFields: [],
      query: '',
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Disclosure compliance query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map((record): DisclosureRecord => ({
      'First name': String(record['First name'] || ''),
      'Last name': String(record['Surname'] || record['Last name'] || ''),
      'Membership number': String(record['Membership number'] || ''),
      'Communication email': record['Communication email'] as string,
      'Unit name': record['Unit name'] as string,
      'Team name': record['Team'] as string,
      'Role name': record['Role'] as string,
      'Disclosure authority': String(record['Disclosure authority'] || ''),
      'Disclosure status': String(record['Disclosure status'] || ''),
      'Disclosure issue date': record['Disclosure issue date'] as string | null,
      'Disclosure expiry date': record['Disclosure expiry date'] as string | null,
      'Days since expiry': record['Days since expiry'] as number | null,
    }));

    console.log(`[API] Transformed ${data.length} disclosure compliance records`);

    return {
      data,
      nextPage: result.nextPage,
      count: result.count,
      error: result.error,
    };
  }

  /**
   * Fetch appointments data from AppointmentsDashboardView
   */
  async getAppointments(pageSize: number = 500): Promise<ApiResponse<AppointmentRecord>> {
    console.log('[API] Fetching appointments data');

    const result = await this.query<Record<string, unknown>>({
      table: 'AppointmentsDashboardView',
      selectFields: [],
      query: '',
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Appointments query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map((record): AppointmentRecord => ({
      'First name': String(record['First name'] || ''),
      'Last name': String(record['Last name'] || ''),
      'Membership number': String(record['Membership number'] || ''),
      'Role/Accreditation': String(record['Role/Accreditation'] || ''),
      'Start date': record['Start date'] as string | null,
      'End date': record['End date'] as string | null,
      'Days since role Started': record['Days since role Started'] as number | null,
      'Communication email': record['Communication email'] as string,
      'Group': record['Group'] as string,
      'District': record['District'] as string,
      'EDI': record['EDI'] as string,
    }));

    console.log(`[API] Transformed ${data.length} appointment records`);

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
  async getSuspensions(pageSize: number = 500): Promise<ApiResponse<SuspensionRecord>> {
    console.log('[API] Fetching suspensions data');

    const result = await this.query<Record<string, unknown>>({
      table: 'SuspensionDashboardView',
      selectFields: [],
      query: '',
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Suspensions query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map((record): SuspensionRecord => ({
      'First name': String(record['First name'] || ''),
      'Last name': String(record['Last name'] || ''),
      'Membership number': String(record['Membership number'] || ''),
      'Role': String(record['Role'] || ''),
      'Team': String(record['Team'] || ''),
      'Unit name': String(record['Unit name'] || ''),
      'Suspension date': record['Suspension date'] as string | null,
      'Suspension reason': record['Suspension reason'] as string,
      'Communication email': record['Communication email'] as string,
    }));

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
  async getTeamReviews(pageSize: number = 500): Promise<ApiResponse<TeamReviewRecord>> {
    console.log('[API] Fetching team directory reviews data');

    const result = await this.query<Record<string, unknown>>({
      table: 'TeamDirectoryReviewsDashboardView',
      selectFields: [],
      query: '',
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Team reviews query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map((record): TeamReviewRecord => ({
      'First name': record['First name'] as string,
      'Last name': record['Last name'] as string,
      'Membership number': String(record['Membership number'] || ''),
      'Role': String(record['Role'] || ''),
      'Team leader': String(record['Team leader'] || ''),
      'Scheduled review date': record['Scheduled review date'] as string | null,
      'Review overdue': String(record['Review overdue'] || ''),
      'Group': record['Group'] as string,
      'District': record['District'] as string,
    }));

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
    console.log('[API] Fetching permits data');

    const result = await this.query<Record<string, unknown>>({
      table: 'PermitsDashboardView',
      selectFields: [],
      query: '',
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Permits query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map((record): PermitRecord => ({
      'First name': String(record['First name'] || ''),
      'Last name': String(record['Last name'] || ''),
      'Membership number': String(record['Membership number'] || ''),
      'Permit category': String(record['Permit category'] || ''),
      'Permit type': record['Permit type'] as string,
      'Permit status': String(record['Permit status'] || ''),
      'Permit expiry date': record['Permit expiry date'] as string | null,
      'Permit restriction details': record['Permit restriction details'] as string,
      'Unit name': record['Unit name'] as string,
      'Team': record['Team'] as string,
      'Communication email': record['Communication email'] as string,
    }));

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
    console.log('[API] Fetching awards data');

    const result = await this.query<Record<string, unknown>>({
      table: 'PreloadedAwardsDashboardView',
      selectFields: [],
      query: '',
      pageNo: 1,
      pageSize,
      distinct: true,
    });

    if (result.error) {
      console.error('[API] Awards query error:', result.error);
      return { data: [], nextPage: null, count: 0, error: result.error };
    }

    const data = (result.data || []).map((record): AwardRecord => ({
      'First name': String(record['First name'] || ''),
      'Last name': String(record['Last name'] || ''),
      'Membership number': String(record['Membership number'] || ''),
      'Accreditation': String(record['Accreditation'] || ''),
      'Role': String(record['Role'] || ''),
      'Team': record['Team'] as string,
      'Unit name': record['Unit name'] as string,
      'Contact number': record['Contact number'] as string,
      'Communication email': record['Communication email'] as string,
    }));

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
