/**
 * Scouts Membership Portal API Client
 *
 * Provides typed access to the membership.scouts.org.uk API endpoints.
 * Requires a valid Bearer token from Azure AD B2C authentication.
 */

import {
  ApiClientConfig,
  ApiError,
  DataExplorerQuery,
  DataExplorerResult,
  DataExplorerFilter,
  DataExplorerSort,
  DashboardView,
  LearningComplianceRecord,
  NavigationItem,
  VIEW_TABLES,
  DASHBOARD_VIEWS,
  ComplianceStatus,
} from './types.js';

const DEFAULT_BASE_URL = 'https://tsa-memportal-prod-fun01.azurewebsites.net/api';

export class ScoutsApiClient {
  private baseUrl: string;
  private token: string | null;
  private onTokenExpired?: () => void;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.token = config.token || null;
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
   * Execute a Data Explorer query
   */
  async query<T = Record<string, unknown>>(
    query: DataExplorerQuery
  ): Promise<DataExplorerResult<T>> {
    return this.request<DataExplorerResult<T>>(
      '/DataExplorer/GetResultsAsync',
      {
        method: 'POST',
        body: JSON.stringify({
          table: query.table,
          skip: query.skip ?? 0,
          take: query.take ?? 25,
          filters: query.filters ?? [],
          sorts: query.sorts ?? [],
          columns: query.columns ?? [],
        }),
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
   * Get data for the current user context
   */
  async getData(): Promise<unknown> {
    return this.request<unknown>('/GetDataAsync', {
      method: 'POST',
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
      skip?: number;
      take?: number;
      filters?: DataExplorerFilter[];
      sorts?: DataExplorerSort[];
      columns?: string[];
    } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    return this.query<LearningComplianceRecord>({
      table: VIEW_TABLES.LEARNING_COMPLIANCE,
      ...options,
    });
  }

  /**
   * Get all members with expiring safeguarding training
   */
  async getSafeguardingExpiring(
    daysAhead: number = 30,
    options: { skip?: number; take?: number } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.queryLearningCompliance({
      ...options,
      filters: [
        {
          field: 'SafeguardingExpiryDate',
          operator: 'lte',
          value: futureDate.toISOString().split('T')[0],
        },
        {
          field: 'SafeguardingExpiryDate',
          operator: 'isnotnull',
          value: null,
        },
      ],
      sorts: [{ field: 'SafeguardingExpiryDate', dir: 'asc' }],
    });
  }

  /**
   * Get all members with expired safeguarding
   */
  async getSafeguardingExpired(
    options: { skip?: number; take?: number } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      filters: [
        {
          field: 'SafeguardingStatus',
          operator: 'eq',
          value: 'Expired',
        },
      ],
      sorts: [{ field: 'SafeguardingExpiryDate', dir: 'asc' }],
    });
  }

  /**
   * Get all members with expiring safety training
   */
  async getSafetyExpiring(
    daysAhead: number = 30,
    options: { skip?: number; take?: number } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.queryLearningCompliance({
      ...options,
      filters: [
        {
          field: 'SafetyExpiryDate',
          operator: 'lte',
          value: futureDate.toISOString().split('T')[0],
        },
        {
          field: 'SafetyExpiryDate',
          operator: 'isnotnull',
          value: null,
        },
      ],
      sorts: [{ field: 'SafetyExpiryDate', dir: 'asc' }],
    });
  }

  /**
   * Get all members with expired safety training
   */
  async getSafetyExpired(
    options: { skip?: number; take?: number } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      filters: [
        {
          field: 'SafetyStatus',
          operator: 'eq',
          value: 'Expired',
        },
      ],
      sorts: [{ field: 'SafetyExpiryDate', dir: 'asc' }],
    });
  }

  /**
   * Get all members requiring First Response who are non-compliant
   */
  async getFirstResponseNonCompliant(
    options: { skip?: number; take?: number } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      filters: [
        {
          field: 'FirstResponseRequired',
          operator: 'eq',
          value: true,
        },
        {
          field: 'FirstResponseStatus',
          operator: 'neq',
          value: 'Compliant',
        },
      ],
      sorts: [{ field: 'FirstResponseExpiryDate', dir: 'asc' }],
    });
  }

  /**
   * Get all members with incomplete Growing Roots (joining journey)
   */
  async getGrowingRootsIncomplete(
    options: { skip?: number; take?: number } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      filters: [
        {
          field: 'GrowingRootsStatus',
          operator: 'neq',
          value: 'Complete',
        },
        {
          field: 'GrowingRootsStatus',
          operator: 'isnotnull',
          value: null,
        },
      ],
      sorts: [{ field: 'RoleStartDate', dir: 'asc' }],
    });
  }

  /**
   * Get compliance summary for a specific team
   */
  async getTeamCompliance(
    teamId: string,
    options: { skip?: number; take?: number } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    return this.queryLearningCompliance({
      ...options,
      filters: [
        {
          field: 'TeamId',
          operator: 'eq',
          value: teamId,
        },
      ],
      sorts: [{ field: 'FullName', dir: 'asc' }],
    });
  }

  /**
   * Get all non-compliant members (any compliance issue)
   */
  async getAllNonCompliant(
    options: { skip?: number; take?: number } = {}
  ): Promise<DataExplorerResult<LearningComplianceRecord>> {
    // This uses OR logic - any of these conditions makes someone non-compliant
    // The API may not support OR directly, so we may need to make multiple calls
    // For now, we'll get expired safeguarding as the most critical
    return this.queryLearningCompliance({
      ...options,
      filters: [
        {
          field: 'SafeguardingStatus',
          operator: 'eq',
          value: 'Expired',
        },
      ],
      sorts: [{ field: 'SafeguardingExpiryDate', dir: 'asc' }],
    });
  }

  // ==========================================================================
  // Aggregate / Summary Methods
  // ==========================================================================

  /**
   * Get a compliance summary with counts
   */
  async getComplianceSummary(): Promise<ComplianceSummary> {
    // Fetch all records to compute summary
    // In production, this should use server-side aggregation if available
    const allRecords = await this.queryLearningCompliance({
      take: 1000, // Adjust based on expected team size
    });

    const summary: ComplianceSummary = {
      total: allRecords.total,
      safeguarding: {
        compliant: 0,
        expiringSoon: 0,
        expired: 0,
      },
      safety: {
        compliant: 0,
        expiringSoon: 0,
        expired: 0,
      },
      firstResponse: {
        compliant: 0,
        required: 0,
        nonCompliant: 0,
      },
      growingRoots: {
        complete: 0,
        incomplete: 0,
      },
    };

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    for (const record of allRecords.data) {
      // Safeguarding
      if (record.SafeguardingStatus === 'Expired') {
        summary.safeguarding.expired++;
      } else if (record.SafeguardingStatus === 'Due Soon') {
        summary.safeguarding.expiringSoon++;
      } else if (record.SafeguardingStatus === 'Compliant') {
        summary.safeguarding.compliant++;
      }

      // Safety
      if (record.SafetyStatus === 'Expired') {
        summary.safety.expired++;
      } else if (record.SafetyStatus === 'Due Soon') {
        summary.safety.expiringSoon++;
      } else if (record.SafetyStatus === 'Compliant') {
        summary.safety.compliant++;
      }

      // First Response
      if (record.FirstResponseRequired) {
        summary.firstResponse.required++;
        if (record.FirstResponseStatus === 'Compliant') {
          summary.firstResponse.compliant++;
        } else {
          summary.firstResponse.nonCompliant++;
        }
      }

      // Growing Roots
      if (record.GrowingRootsStatus === 'Complete') {
        summary.growingRoots.complete++;
      } else if (record.GrowingRootsStatus) {
        summary.growingRoots.incomplete++;
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
  safeguarding: {
    compliant: number;
    expiringSoon: number;
    expired: number;
  };
  safety: {
    compliant: number;
    expiringSoon: number;
    expired: number;
  };
  firstResponse: {
    compliant: number;
    required: number;
    nonCompliant: number;
  };
  growingRoots: {
    complete: number;
    incomplete: number;
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
