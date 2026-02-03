/**
 * Scouts Membership Portal API Client
 *
 * Provides typed access to the membership.scouts.org.uk API endpoints.
 * Requires a valid Bearer token from Azure AD B2C authentication.
 */

import {
  ApiClientConfig,
  ApiError,
  DashboardView,
  LearningComplianceRecord,
  NavigationItem,
  VIEW_TABLES,
} from './types.js';

const DEFAULT_BASE_URL = 'https://tsa-memportal-prod-fun01.azurewebsites.net/api';

// ==========================================================================
// API Request/Response Types (matching actual API format)
// ==========================================================================

export interface DataExplorerRequest {
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
  id?: string;
  name?: string;
}

export interface DataExplorerResponse<T = Record<string, unknown>> {
  data: T[] | null;
  nextPage: string | null;
  count: number;
  aggregateResult: unknown | null;
  error: string | null;
}

// Default fields for Learning Compliance queries
// Note: Use camelCase in requests, API returns with spaces in response
const LEARNING_COMPLIANCE_FIELDS = [
  'FirstName',
  'LastName',
  'MembershipNumber',
  'TeamName',
  'TeamId',
  'RoleName',
  'RoleId',
  'Name',           // Learning type (SafeGuarding, Safety, FirstAid, DataProtection, etc.)
  'Status',
  'ExpiryDate',
  'DaysSinceExpiry',
  'EmailAddress',
  'MemberSuspended',
  'StartDate',
];

export class ScoutsApiClient {
  private baseUrl: string;
  private token: string | null;
  private contactId: string | null;
  private onTokenExpired?: () => void;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.token = config.token || null;
    this.contactId = null;
    this.onTokenExpired = config.onTokenExpired;
  }

  /**
   * Set the authentication token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Get the current token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Check if the client has a valid token set
   */
  hasToken(): boolean {
    return this.token !== null && this.token.length > 0;
  }

  /**
   * Set the contact ID for queries
   */
  setContactId(contactId: string): void {
    this.contactId = contactId;
  }

  /**
   * Get the contact ID
   */
  getContactId(): string | null {
    return this.contactId;
  }

  /**
   * Initialize the client by fetching contact details
   */
  async initialize(): Promise<void> {
    const contact = await this.getContactDetail();
    this.contactId = contact.id;
  }

  // ==========================================================================
  // Core HTTP Methods
  // ==========================================================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.token) {
      throw new Error('No authentication token set. Call setToken() first.');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json, text/plain, */*',
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.onTokenExpired?.();
      throw this.createError(401, 'Authentication token expired or invalid');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw this.createError(response.status, errorText || response.statusText);
    }

    // Some endpoints may return empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  private createError(status: number, message: string): ApiError {
    return { status, message };
  }

  // ==========================================================================
  // Data Explorer Methods
  // ==========================================================================

  /**
   * Execute a Data Explorer query with the correct API format
   */
  async query<T = Record<string, unknown>>(
    request: DataExplorerRequest
  ): Promise<DataExplorerResponse<T>> {
    const body = {
      table: request.table,
      query: request.query || '',
      selectFields: request.selectFields || [],
      pageNo: request.pageNo ?? 1,
      pageSize: request.pageSize ?? 50,
      orderBy: request.orderBy || '',
      order: request.order || null,
      distinct: request.distinct ?? true,
      isDashboardQuery: request.isDashboardQuery ?? false,
      contactId: request.contactId || this.contactId || '',
      id: request.id || '',
      name: request.name || '',
    };

    return this.request<DataExplorerResponse<T>>(
      '/DataExplorer/GetResultsAsync',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }

  /**
   * Get metadata for all available dashboard views
   */
  async getViewList(): Promise<DashboardView[]> {
    return this.request<DashboardView[]>('/DataExplorer/GetMetadataAsync', {
      method: 'POST',
    });
  }

  /**
   * Get detailed metadata for a specific view (fields, pre-built queries)
   */
  async getViewMetadata(viewId: string): Promise<DashboardView> {
    return this.request<DashboardView>(
      `/DataExplorer/GetMetadataAsync/${viewId}`,
      {
        method: 'POST',
      }
    );
  }

  // ==========================================================================
  // Navigation / Context Methods
  // ==========================================================================

  /**
   * Get user's accessible navigation items (teams, units)
   */
  async getNavigation(): Promise<NavigationItem[]> {
    return this.request<NavigationItem[]>('/GetNavigationAsync', {
      method: 'POST',
    });
  }

  /**
   * Get user's contact details
   */
  async getContactDetail(): Promise<{ id: string; [key: string]: unknown }> {
    return this.request<{ id: string }>('/GetContactDetailAsync', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * Get teams and roles listing
   */
  async getTeamsAndRoles(): Promise<unknown> {
    return this.request<unknown>('/UnitTeamsAndRolesListingAsync', {
      method: 'POST',
    });
  }

  // ==========================================================================
  // Learning Compliance Convenience Methods
  // ==========================================================================

  /**
   * Query the Learning Compliance dashboard view
   */
  async queryLearningCompliance(
    options: {
      query?: string;
      pageNo?: number;
      pageSize?: number;
      orderBy?: string;
      order?: 'asc' | 'desc';
      selectFields?: string[];
    } = {}
  ): Promise<DataExplorerResponse<LearningComplianceRecord>> {
    return this.query<LearningComplianceRecord>({
      table: VIEW_TABLES.LEARNING_COMPLIANCE,
      selectFields: options.selectFields || LEARNING_COMPLIANCE_FIELDS,
      query: options.query || '',
      pageNo: options.pageNo || 1,
      pageSize: options.pageSize || 50,
      orderBy: options.orderBy || '',
      order: options.order || null,
    });
  }

  /**
   * Get all members with expired safeguarding (not suspended)
   * Note: Field name is "Learning" with value "SafeGuarding"
   */
  async getSafeguardingExpired(
    options: { pageNo?: number; pageSize?: number } = {}
  ): Promise<DataExplorerResponse<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      query: "Learning = 'SafeGuarding' AND Status = 'Expired'",
      orderBy: 'Expiry date',
      order: 'asc',
    });
  }

  /**
   * Get all members with expired safety training (not suspended)
   */
  async getSafetyExpired(
    options: { pageNo?: number; pageSize?: number } = {}
  ): Promise<DataExplorerResponse<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      query: "Learning = 'Safety' AND Status = 'Expired'",
      orderBy: 'Expiry date',
      order: 'asc',
    });
  }

  /**
   * Get all members requiring First Response who are non-compliant
   */
  async getFirstResponseNonCompliant(
    options: { pageNo?: number; pageSize?: number } = {}
  ): Promise<DataExplorerResponse<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      query: "Learning = 'FirstAid' AND Status <> 'In-Progress' AND Status <> 'Valid'",
      orderBy: 'Expiry date',
      order: 'asc',
    });
  }

  /**
   * Get all learning compliance records (no filter)
   */
  async getAllLearningCompliance(
    options: { pageNo?: number; pageSize?: number } = {}
  ): Promise<DataExplorerResponse<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      query: '',
      orderBy: 'Last name',
      order: 'asc',
    });
  }

  /**
   * Get compliance for a specific team
   */
  async getTeamCompliance(
    teamId: string,
    options: { pageNo?: number; pageSize?: number } = {}
  ): Promise<DataExplorerResponse<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      query: `Team = '${teamId}'`,
      orderBy: 'Last name',
      order: 'asc',
    });
  }

  /**
   * Get a compliance summary with counts
   */
  async getComplianceSummary(): Promise<ComplianceSummary> {
    // Fetch all records to compute summary
    const result = await this.getAllLearningCompliance({ pageSize: 1000 });

    const records = result.data || [];

    const summary: ComplianceSummary = {
      total: result.count,
      recordsFetched: records.length,
      safeguarding: { compliant: 0, expired: 0, total: 0 },
      safety: { compliant: 0, expired: 0, total: 0 },
      firstResponse: { compliant: 0, nonCompliant: 0, total: 0 },
    };

    for (const record of records) {
      const name = (record as any).Name || (record as any).name;
      const status = (record as any).Status || (record as any).status;

      if (name === 'SafeGuarding') {
        summary.safeguarding.total++;
        if (status === 'Expired' || !status) {
          summary.safeguarding.expired++;
        } else {
          summary.safeguarding.compliant++;
        }
      } else if (name === 'Safety') {
        summary.safety.total++;
        if (status === 'Expired' || !status) {
          summary.safety.expired++;
        } else {
          summary.safety.compliant++;
        }
      } else if (name === 'FirstAid') {
        summary.firstResponse.total++;
        if (status === 'In-Progress' || status === 'Valid') {
          summary.firstResponse.compliant++;
        } else {
          summary.firstResponse.nonCompliant++;
        }
      }
    }

    return summary;
  }
}

// ==========================================================================
// Summary Types
// ==========================================================================

export interface ComplianceSummary {
  total: number;
  recordsFetched: number;
  safeguarding: {
    compliant: number;
    expired: number;
    total: number;
  };
  safety: {
    compliant: number;
    expired: number;
    total: number;
  };
  firstResponse: {
    compliant: number;
    nonCompliant: number;
    total: number;
  };
}

// ==========================================================================
// Factory Function
// ==========================================================================

/**
 * Create a new API client instance
 */
export function createApiClient(config?: ApiClientConfig): ScoutsApiClient {
  return new ScoutsApiClient(config);
}

export default ScoutsApiClient;
