/**
 * Types for the GLV Dashboard
 */

export interface LearningRecord {
  'First name': string;
  'Last name': string;
  'Membership number': string;
  'Team name'?: string;
  'Role name'?: string;
  Learning: string;
  Status: string;
  'Expiry date': string | null;
  'Start date'?: string | null;
  'Days since expiry'?: number | null;
  'Email address'?: string;
  'Member suspended'?: string;
}

export interface ComplianceSummary {
  total: number;
  byLearningType: Record<string, { total: number; compliant: number; expiring: number; expired: number }>;
  byStatus: Record<string, number>;
}

export interface ApiResponse<T> {
  data: T[] | null;
  nextPage: string | null;
  count: number;
  error: string | null;
}

export interface DisclosureRecord {
  'First name': string;
  'Last name': string;
  'Membership number': string;
  'Communication email'?: string;
  'Unit name'?: string;
  'Team name'?: string;
  'Role name'?: string;
  'Team type'?: string;
  'Role start date'?: string | null;
  'Disclosure authority': string;
  'Disclosure status': string;
  'Disclosure issue date'?: string | null;
  'Disclosure expiry date'?: string | null;
  'Days since expiry'?: number | null;
  'Disclosure ID'?: string;
}

export interface DisclosureSummary {
  total: number;
  byStatus: Record<string, number>;
  expired: number;
  expiringSoon: number;
  valid: number;
}

export type AuthState =
  | { status: 'unauthenticated' }
  | { status: 'authenticating' }
  | { status: 'authenticated'; token: string; contactId: string }
  | { status: 'error'; message: string };

/**
 * Detailed disclosure record from Azure Table Storage
 */
export interface DisclosureDetail {
  disclosureId: string;
  status: string;
  authority: string;
  type: string;
  expiryDate: string | null;
  issueDate: string | null;
  country: string;
}

/**
 * Member with their disclosure details from the check-disclosures API
 */
export interface MemberDisclosureResult {
  membershipNumber: string;
  contactId: string;
  firstName: string;
  lastName: string;
  disclosures: DisclosureDetail[];
}

/**
 * Joining Journey record from JoiningJourneyView
 */
export interface JoiningJourneyRecord {
  'First name': string;
  'Last name': string;
  'Membership number': string;
  'Item': string;
  'Status': string;
  'Due date'?: string | null;
  'Completed date'?: string | null;
}

/**
 * Learning module from GetLmsDetailsAsync
 */
export interface LearningModule {
  title: string;
  expiryDate: string | null;
  currentLevel: string;
}

/**
 * Member with their learning details from the check-learning API
 */
export interface MemberLearningResult {
  membershipNumber: string;
  contactId: string;
  firstName: string;
  lastName: string;
  modules: LearningModule[];
}

/**
 * Appointment record from AppointmentsDashboardView
 */
export interface AppointmentRecord {
  'First name': string;
  'Last name': string;
  'Membership number': string;
  'Role/Accreditation': string;
  'Start date': string | null;
  'End date': string | null;
  'Days since role Started': number | null;
  'Communication email'?: string;
  'Group'?: string;
  'District'?: string;
  'EDI'?: string;
}

/**
 * Suspension record from SuspensionDashboardView
 */
export interface SuspensionRecord {
  'First name': string;
  'Last name': string;
  'Membership number': string;
  'Role': string;
  'Team': string;
  'Unit name': string;
  'Suspension date': string | null;
  'Suspension reason'?: string;
  'Communication email'?: string;
}

/**
 * Team directory review record from TeamDirectoryReviewsDashboardView
 */
export interface TeamReviewRecord {
  'First name'?: string;
  'Last name'?: string;
  'Membership number': string;
  'Role': string;
  'Team leader': string;
  'Scheduled review date': string | null;
  'Review overdue': string;
  'Group'?: string;
  'District'?: string;
}

/**
 * Permit record from PermitsDashboardView
 */
export interface PermitRecord {
  'First name': string;
  'Last name': string;
  'Membership number': string;
  'Permit category': string;
  'Permit type'?: string;
  'Permit status': string;
  'Permit expiry date': string | null;
  'Permit restriction details'?: string;
  'Unit name'?: string;
  'Team'?: string;
  'Communication email'?: string;
}

/**
 * Award record from PreloadedAwardsDashboardView
 */
export interface AwardRecord {
  'First name': string;
  'Last name': string;
  'Membership number': string;
  'Accreditation': string;
  'Role': string;
  'Team'?: string;
  'Unit name'?: string;
  'Contact number'?: string;
  'Communication email'?: string;
}
