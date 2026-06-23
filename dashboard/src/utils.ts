/**
 * Utility functions for data transformation and computation.
 * Extracted for testability.
 */

import type { LearningRecord, MemberLearningResult } from "./types";

/** Name of the mandatory First Response module required within 1 year of joining */
export const FIRST_RESPONSE_MODULE = "First Response";

/**
 * Unified module config covering all modules that have deadlines, mandatory synthesis,
 * or display grouping.
 *
 * deadlineDays: days from role start by which the module must be completed (null = no deadline).
 *   First Response uses 365 (≈ 1 year); Growing Roots vary by module.
 * synthesizeIfMissing: when true, a "Not Started" record is synthesised for any member whose
 *   GetLmsDetailsAsync result contains no entry for this module.
 * group: display group name ("Growing Roots") or null for standalone modules.
 */
export const MODULE_CONFIG: ReadonlyArray<{
  name: string;
  deadlineDays: number | null;
  synthesizeIfMissing?: boolean;
  group: string | null;
}> = [
  {
    name: FIRST_RESPONSE_MODULE,
    deadlineDays: 365,
    synthesizeIfMissing: true,
    group: null,
  },
  {
    name: "Safeguarding",
    deadlineDays: 30,
    synthesizeIfMissing: true,
    group: "Growing Roots",
  },
  {
    name: "Safety",
    deadlineDays: 30,
    synthesizeIfMissing: true,
    group: "Growing Roots",
  },
  {
    name: "Who We Are and What We Do",
    deadlineDays: 180,
    synthesizeIfMissing: true,
    group: "Growing Roots",
  },
  {
    name: "Creating Inclusion",
    deadlineDays: 180,
    synthesizeIfMissing: true,
    group: "Growing Roots",
  },
  {
    name: "Data Protection in Scouts",
    deadlineDays: 180,
    synthesizeIfMissing: true,
    group: "Growing Roots",
  },
  {
    name: "Delivering a Great Programme",
    deadlineDays: null,
    group: "Growing Roots",
  },
  {
    name: "Leading Scout Volunteers",
    deadlineDays: null,
    group: "Growing Roots",
  },
  { name: "Being a Trustee", deadlineDays: null, group: "Growing Roots" },
];

/** Returns true if the module title is a known Growing Roots module */
export function isGrowingRootsModule(title: string): boolean {
  return MODULE_CONFIG.some((m) => m.group === "Growing Roots" && m.name === title);
}

/**
 * Parse expiry date from API format "MM/DD/YYYY HH:MM:SS" to Date
 */
export function parseExpiryDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  try {
    // Format: "04/25/2028 21:22:00"
    const [datePart, timePart] = dateStr.split(" ");
    const [month, day, year] = datePart.split("/").map(Number);
    const [hours, minutes, seconds] = (timePart || "00:00:00")
      .split(":")
      .map(Number);

    return new Date(year, month - 1, day, hours, minutes, seconds);
  } catch {
    return null;
  }
}

/**
 * Compute status based on current level and expiry date.
 * Status bands: Expired | Expiring (<30d) | Renewal Due (30–60d) | Expiring Soon (60–90d) | Valid (>90d)
 */
export function computeModuleStatus(
  currentLevel: string,
  expiryDate: Date | null,
  now: Date = new Date(),
): string {
  if (!expiryDate) {
    return currentLevel === "Achieved skill" ? "Valid" : "Not Started";
  }

  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  if (expiryDate < now) {
    return "Expired";
  } else if (expiryDate < thirtyDaysFromNow) {
    return "Expiring";
  } else if (expiryDate < sixtyDaysFromNow) {
    return "Renewal Due";
  } else if (expiryDate < ninetyDaysFromNow) {
    return "Expiring Soon";
  } else {
    return "Valid";
  }
}

/**
 * Returns true if dateStr represents a future date within the given threshold (default 90 days).
 * Accepts ISO date strings or any format parseable by Date constructor.
 */
export function isExpiringSoon(
  dateStr: string | null | undefined,
  thresholdDays = 90,
): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const now = new Date();
  const threshold = new Date(
    now.getTime() + thresholdDays * 24 * 60 * 60 * 1000,
  );
  return date > now && date <= threshold;
}

/**
 * Compute deadline information for a Growing Roots module based on the member's role start date
 * and the module's configured deadline window.
 */
export function getDeadlineInfo(
  startDateStr: string | null | undefined,
  deadlineDays: number | null,
): {
  deadlineDate: Date | null;
  daysRemaining: number | null;
  isOverdue: boolean;
} {
  if (!startDateStr || deadlineDays === null) {
    return { deadlineDate: null, daysRemaining: null, isOverdue: false };
  }
  try {
    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      return { deadlineDate: null, daysRemaining: null, isOverdue: false };
    }
    const deadlineDate = new Date(
      startDate.getTime() + deadlineDays * 24 * 60 * 60 * 1000,
    );
    const now = new Date();
    const daysRemaining = Math.ceil(
      (deadlineDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    return { deadlineDate, daysRemaining, isOverdue: deadlineDate < now };
  } catch {
    return { deadlineDate: null, daysRemaining: null, isOverdue: false };
  }
}

/**
 * Transform MemberLearningResult[] from GetLmsDetailsAsync into LearningRecord[] format.
 *
 * Inclusion rules:
 * - Modules with an expiry date are always included.
 * - First Response is always included regardless of expiry (required within 1 year of joining).
 *   If a member has no First Response module at all, a "Not Started" record is synthesised.
 * - Growing Roots modules present in the member's LMS data are included regardless of expiry.
 *   Modules with synthesizeIfMissing=true also get a "Not Started" record synthesised when absent
 *   — GetLmsDetailsAsync can return an empty module list for members the portal considers
 *   non-compliant, which would otherwise leave them invisible in tiles.
 * - All other modules without an expiry date are excluded.
 *
 * @param memberStartDates Optional map of membership number → earliest role start date,
 *   used to populate the Start date field on First Response records so the 1-year deadline
 *   can be displayed in the UI.
 */
export function transformLearningResults(
  members: MemberLearningResult[],
  now: Date = new Date(),
  memberStartDates?: Map<string, string>,
): LearningRecord[] {
  const records: LearningRecord[] = [];

  for (const member of members) {
    // Include modules with expiry dates, or any module known to MODULE_CONFIG
    const includedModules = member.modules.filter(
      (m) =>
        m.expiryDate !== null ||
        MODULE_CONFIG.some((c) => c.name === m.title),
    );

    for (const module of includedModules) {
      const expiryDate = parseExpiryDate(module.expiryDate);
      const status = computeModuleStatus(module.currentLevel, expiryDate, now);

      const record: LearningRecord = {
        "First name": member.firstName,
        "Last name": member.lastName,
        "Membership number": member.membershipNumber,
        Learning: module.title,
        Status: status,
        "Expiry date": expiryDate ? expiryDate.toISOString() : null,
      };

      // Attach start date to any module with a deadline so the UI can show it
      const modConfig = MODULE_CONFIG.find((c) => c.name === module.title);
      if (modConfig && modConfig.deadlineDays !== null && memberStartDates) {
        record["Start date"] =
          memberStartDates.get(member.membershipNumber) ?? null;
      }

      records.push(record);
    }

    // Synthesise "Not Started" for any module with synthesizeIfMissing=true that is
    // absent from GetLmsDetailsAsync data. This covers First Response (1-year deadline)
    // and mandatory Growing Roots modules — the LMS endpoint can return an empty array
    // for members the portal flags as non-compliant, making them invisible in tiles.
    for (const modConfig of MODULE_CONFIG) {
      if (!modConfig.synthesizeIfMissing) continue;
      const hasModule = member.modules.some((m) => m.title === modConfig.name);
      if (!hasModule) {
        const synthRecord: LearningRecord = {
          "First name": member.firstName,
          "Last name": member.lastName,
          "Membership number": member.membershipNumber,
          Learning: modConfig.name,
          Status: "Not Started",
          "Expiry date": null,
        };
        if (modConfig.deadlineDays !== null && memberStartDates) {
          synthRecord["Start date"] =
            memberStartDates.get(member.membershipNumber) ?? null;
        }
        records.push(synthRecord);
      }
    }
  }

  return records;
}
