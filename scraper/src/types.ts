/**
 * TypeScript types for the Scouts Membership Portal API
 */

// ============================================================================
// Data Explorer Types
// ============================================================================

export interface DataExplorerFilter {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | null;
}

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'startswith'
  | 'endswith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isnull'
  | 'isnotnull';

export interface DataExplorerSort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface DataExplorerQuery {
  table: string;
  skip?: number;
  take?: number;
  filters?: DataExplorerFilter[];
  sorts?: DataExplorerSort[];
  columns?: string[];
}

export interface DataExplorerResult<T = Record<string, unknown>> {
  data: T[];
  total: number;
}

// ============================================================================
// Dashboard View Types
// ============================================================================

export interface DashboardView {
  id: string;
  name: string;
  description?: string;
  fields: DashboardField[];
  queries: PrebuiltQuery[];
}

export interface DashboardField {
  name: string;
  displayName: string;
  type: string;
  allowInDataExplorer?: boolean;
}

export interface PrebuiltQuery {
  id: string;
  name: string;
  description?: string;
  filters: DataExplorerFilter[];
}

// ============================================================================
// Learning Compliance Types
// ============================================================================

export type ComplianceStatus =
  | 'Compliant'
  | 'Due Soon'
  | 'Overdue'
  | 'Expired'
  | 'Not Required'
  | 'Not Started';

export interface LearningComplianceRecord {
  // Member Information
  FullName: string;
  MembershipNumber: string;
  RoleName: string;
  TeamName: string;
  TeamId: string;
  RoleStartDate: string;

  // Safeguarding
  SafeguardingStatus: ComplianceStatus;
  SafeguardingExpiryDate: string | null;
  SafeguardingCompletedDate: string | null;

  // Safety
  SafetyStatus: ComplianceStatus;
  SafetyExpiryDate: string | null;
  SafetyCompletedDate: string | null;

  // First Response
  FirstResponseStatus: ComplianceStatus;
  FirstResponseExpiryDate: string | null;
  FirstResponseRequired: boolean;

  // Learning Progress
  GrowingRootsStatus: string;
  DataProtectionStatus: string;
  WhoWeAreStatus: string;

  // Additional fields that may be present
  [key: string]: unknown;
}

// ============================================================================
// Navigation / User Context Types
// ============================================================================

export interface NavigationItem {
  id: string;
  name: string;
  type: string;
  parentId?: string;
  children?: NavigationItem[];
}

export interface UserContext {
  memberId: string;
  membershipNumber: string;
  name: string;
  teams: TeamInfo[];
}

export interface TeamInfo {
  id: string;
  name: string;
  type: string;
  roles: string[];
}

// ============================================================================
// API Client Types
// ============================================================================

export interface ApiClientConfig {
  baseUrl?: string;
  token?: string;
  onTokenExpired?: () => void;
}

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

// ============================================================================
// View IDs (Constants)
// ============================================================================

export const DASHBOARD_VIEWS = {
  LEARNING_COMPLIANCE: '07b3b8bb-e64a-ee11-be6f-6045bdc1efd7',
  DISCLOSURE_COMPLIANCE: 'b602d677-d035-ee11-bdf4-6045bdd2c4ec',
} as const;

export const VIEW_TABLES = {
  LEARNING_COMPLIANCE: 'LearningComplianceDashboardView',
  DISCLOSURE_COMPLIANCE: 'DisclosureComplianceDashboardView',
  SUSPENSION: 'SuspensionDashboardView',
  APPOINTMENTS: 'AppointmentsDashboardView',
  PERMITS: 'PermitsDashboardView',
  TEAM_DIRECTORY: 'TeamDirectoryReviewsDashboardView',
} as const;
