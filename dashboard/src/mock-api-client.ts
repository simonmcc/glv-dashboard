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
} from "./types";

import {
  mockLearningRecords,
  mockDisclosureRecords,
  mockJoiningJourneyRecords,
  mockSuspensionRecords,
  mockTeamReviewRecords,
  mockPermitRecords,
  mockAwardRecords,
  mockMemberLearningResults,
} from "./mock-data";

import type { ScopeUnit } from "./scope";
import {
  ALL_UNITS,
  pickDefaultScopePrefix,
  readStoredScope,
  writeStoredScope,
} from "./scope";

// Simulate network delay for realistic feel
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = () => delay(3000 + Math.floor(Math.random() * 2000));

// A group plus one section, so the scope picker has something to show in previews.
const MOCK_SCOPE_UNITS: ScopeUnit[] = [
  {
    unitId: "mock-group",
    unitName: "1st Demo Group",
    unitPrefix: "S0000001>>S0000002",
    roles: ["Group Lead Volunteer"],
  },
  {
    unitId: "mock-section",
    unitName: "1st Demo Group - Scout 1",
    unitPrefix: "S0000001>>S0000002>>S0000003",
    roles: ["Team Member"],
  },
];

/**
 * Resolve the stored scope the same way the live client does, so a preview
 * exercises the real persistence path rather than an approximation of it.
 */
function resolveMockScope(): string | null {
  const stored = readStoredScope();
  const usable =
    stored === ALL_UNITS ||
    (stored !== null && MOCK_SCOPE_UNITS.some((u) => u.unitPrefix === stored));

  if (stored !== null && !usable) writeStoredScope(null);
  return usable ? stored : pickDefaultScopePrefix(MOCK_SCOPE_UNITS);
}

export class MockScoutsApiClient {
  private contactId = "mock-contact-id";
  private scopePrefix: string | null = resolveMockScope();

  async initialize(): Promise<void> {
    console.log("[MockAPI] Initializing mock client");
    await delay(100);
  }

  getContactId(): string | null {
    return this.contactId;
  }

  getScopeUnits(): ScopeUnit[] {
    return MOCK_SCOPE_UNITS;
  }

  getScopePrefix(): string | null {
    return this.scopePrefix;
  }

  setScopePrefix(prefix: string | null): void {
    writeStoredScope(prefix);
    this.scopePrefix =
      prefix === null ? pickDefaultScopePrefix(MOCK_SCOPE_UNITS) : prefix;
    console.log("[MockAPI] Scope set to", this.scopePrefix);
  }

  async getAllLearningCompliance(): Promise<ApiResponse<LearningRecord>> {
    console.log("[MockAPI] Returning mock learning compliance data");
    await randomDelay();
    return {
      data: mockLearningRecords,
      nextPage: null,
      count: mockLearningRecords.length,
      error: null,
    };
  }

  async getDisclosureCompliance(): Promise<ApiResponse<DisclosureRecord>> {
    console.log("[MockAPI] Returning mock disclosure compliance data");
    await randomDelay();
    return {
      data: mockDisclosureRecords,
      nextPage: null,
      count: mockDisclosureRecords.length,
      error: null,
    };
  }

  async getJoiningJourney(): Promise<ApiResponse<JoiningJourneyRecord>> {
    console.log("[MockAPI] Returning mock joining journey data");
    await randomDelay();
    return {
      data: mockJoiningJourneyRecords,
      nextPage: null,
      count: mockJoiningJourneyRecords.length,
      error: null,
    };
  }

  async getSuspensions(): Promise<ApiResponse<SuspensionRecord>> {
    console.log("[MockAPI] Returning mock suspensions data");
    await randomDelay();
    return {
      data: mockSuspensionRecords,
      nextPage: null,
      count: mockSuspensionRecords.length,
      error: null,
    };
  }

  async getTeamReviews(): Promise<ApiResponse<TeamReviewRecord>> {
    console.log("[MockAPI] Returning mock team reviews data");
    await randomDelay();
    return {
      data: mockTeamReviewRecords,
      nextPage: null,
      count: mockTeamReviewRecords.length,
      error: null,
    };
  }

  async getPermits(): Promise<ApiResponse<PermitRecord>> {
    console.log("[MockAPI] Returning mock permits data");
    await randomDelay();
    return {
      data: mockPermitRecords,
      nextPage: null,
      count: mockPermitRecords.length,
      error: null,
    };
  }

  async getAwards(): Promise<ApiResponse<AwardRecord>> {
    console.log("[MockAPI] Returning mock awards data");
    await randomDelay();
    return {
      data: mockAwardRecords,
      nextPage: null,
      count: mockAwardRecords.length,
      error: null,
    };
  }

  async testTable(
    tableName: string,
  ): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    console.log(`[MockAPI] testTable called for: ${tableName}`);
    await delay(100);
    return { success: true, data: [] };
  }

  async checkLearningByMembershipNumbers(membershipNumbers: string[]): Promise<{
    success: boolean;
    members?: MemberLearningResult[];
    error?: string;
  }> {
    console.log(
      `[MockAPI] checkLearningByMembershipNumbers called for ${membershipNumbers.length} members`,
    );
    await randomDelay();
    const members = mockMemberLearningResults.filter((m) =>
      membershipNumbers.includes(m.membershipNumber),
    );
    return { success: true, members };
  }

  computeComplianceSummary(records: LearningRecord[]): ComplianceSummary {
    const byLearningType: ComplianceSummary["byLearningType"] = {};
    const byStatus: ComplianceSummary["byStatus"] = {};

    for (const record of records) {
      const learning = record.Learning || "Unknown";
      const status = record.Status || "Unknown";

      if (!byLearningType[learning]) {
        byLearningType[learning] = {
          total: 0,
          compliant: 0,
          expiring: 0,
          expired: 0,
        };
      }

      byLearningType[learning].total++;

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
}

export function createMockApiClient(): MockScoutsApiClient {
  return new MockScoutsApiClient();
}
