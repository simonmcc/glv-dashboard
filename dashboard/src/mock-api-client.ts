/**
 * Mock API client for PR previews and development
 *
 * Returns mock data without making real API calls.
 * Used when VITE_MOCK_MODE=true.
 */

import type {
  LearningRecord,
  DisclosureRecord,
  JoiningJourneyRecord,
  SuspensionRecord,
  TeamReviewRecord,
  PermitRecord,
  AwardRecord,
  ApiResponse,
  ComplianceSummary,
  DisclosureSummary,
  MemberLearningResult,
} from './types';

import {
  mockLearningRecords,
  mockDisclosureRecords,
  mockJoiningJourneyRecords,
  mockSuspensionRecords,
  mockTeamReviewRecords,
  mockPermitRecords,
  mockAwardRecords,
  mockMemberLearningResults,
} from './mock-data';

// Simulate network delay for realistic feel
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MockScoutsApiClient {
  private contactId = 'mock-contact-id';

  async initialize(): Promise<void> {
    console.log('[MockAPI] Initializing mock client');
    await delay(100);
  }

  getContactId(): string | null {
    return this.contactId;
  }

  async getAllLearningCompliance(): Promise<ApiResponse<LearningRecord>> {
    console.log('[MockAPI] Returning mock learning compliance data');
    await delay(200);
    return {
      data: mockLearningRecords,
      nextPage: null,
      count: mockLearningRecords.length,
      error: null,
    };
  }

  async getDisclosureCompliance(): Promise<ApiResponse<DisclosureRecord>> {
    console.log('[MockAPI] Returning mock disclosure compliance data');
    await delay(200);
    return {
      data: mockDisclosureRecords,
      nextPage: null,
      count: mockDisclosureRecords.length,
      error: null,
    };
  }

  async getJoiningJourney(): Promise<ApiResponse<JoiningJourneyRecord>> {
    console.log('[MockAPI] Returning mock joining journey data');
    await delay(200);
    return {
      data: mockJoiningJourneyRecords,
      nextPage: null,
      count: mockJoiningJourneyRecords.length,
      error: null,
    };
  }

  async getSuspensions(): Promise<ApiResponse<SuspensionRecord>> {
    console.log('[MockAPI] Returning mock suspensions data');
    await delay(200);
    return {
      data: mockSuspensionRecords,
      nextPage: null,
      count: mockSuspensionRecords.length,
      error: null,
    };
  }

  async getTeamReviews(): Promise<ApiResponse<TeamReviewRecord>> {
    console.log('[MockAPI] Returning mock team reviews data');
    await delay(200);
    return {
      data: mockTeamReviewRecords,
      nextPage: null,
      count: mockTeamReviewRecords.length,
      error: null,
    };
  }

  async getPermits(): Promise<ApiResponse<PermitRecord>> {
    console.log('[MockAPI] Returning mock permits data');
    await delay(200);
    return {
      data: mockPermitRecords,
      nextPage: null,
      count: mockPermitRecords.length,
      error: null,
    };
  }

  async getAwards(): Promise<ApiResponse<AwardRecord>> {
    console.log('[MockAPI] Returning mock awards data');
    await delay(200);
    return {
      data: mockAwardRecords,
      nextPage: null,
      count: mockAwardRecords.length,
      error: null,
    };
  }

  async testTable(tableName: string): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    console.log(`[MockAPI] testTable called for: ${tableName}`);
    await delay(100);
    return { success: true, data: [] };
  }

  async checkLearningByMembershipNumbers(
    membershipNumbers: string[]
  ): Promise<{ success: boolean; members?: MemberLearningResult[]; error?: string }> {
    console.log(`[MockAPI] checkLearningByMembershipNumbers called for ${membershipNumbers.length} members`);
    await delay(200);
    const members = mockMemberLearningResults.filter(m =>
      membershipNumbers.includes(m.membershipNumber)
    );
    return { success: true, members };
  }

  computeComplianceSummary(records: LearningRecord[]): ComplianceSummary {
    const byLearningType: ComplianceSummary['byLearningType'] = {};
    const byStatus: ComplianceSummary['byStatus'] = {};

    for (const record of records) {
      const learning = record.Learning || 'Unknown';
      const status = record.Status || 'Unknown';

      if (!byLearningType[learning]) {
        byLearningType[learning] = { total: 0, compliant: 0, expiring: 0, expired: 0 };
      }

      byLearningType[learning].total++;

      if (status === 'Valid' || status === 'In-Progress') {
        byLearningType[learning].compliant++;
      } else if (status === 'Expiring' || status === 'Renewal Due') {
        byLearningType[learning].expiring++;
      } else if (status === 'Expired' || status === 'Not Started') {
        byLearningType[learning].expired++;
      }

      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    return {
      total: records.length,
      byLearningType,
      byStatus,
    };
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
}

export function createMockApiClient(): MockScoutsApiClient {
  return new MockScoutsApiClient();
}
