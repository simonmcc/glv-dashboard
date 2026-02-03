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

export type AuthState =
  | { status: 'unauthenticated' }
  | { status: 'authenticating' }
  | { status: 'authenticated'; token: string; contactId: string }
  | { status: 'error'; message: string };
