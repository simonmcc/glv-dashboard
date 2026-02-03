/**
 * Browser-based API client for the Scouts Membership Portal
 *
 * Routes all API calls through the backend proxy to avoid CORS issues.
 */

import type { LearningRecord, ApiResponse, ComplianceSummary } from './types';

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
}

export function createApiClient(token: string): ScoutsApiClient {
  return new ScoutsApiClient(token);
}
