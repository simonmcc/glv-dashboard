/**
 * Utility functions for data transformation and computation.
 * Extracted for testability.
 */

import type { LearningRecord, MemberLearningResult } from './types';

/** Name of the mandatory First Response module required within 1 year of joining */
export const FIRST_RESPONSE_MODULE = 'First Response';

/**
 * Growing Roots modules required as part of the joining journey.
 * deadlineDays: number of days from role start by which this module must be completed (null = no deadline).
 * These names are matched against module titles returned by GetLmsDetailsAsync.
 */
export const GROWING_ROOTS_MODULES: ReadonlyArray<{ name: string; deadlineDays: number | null }> = [
  { name: 'Safeguarding', deadlineDays: 30 },
  { name: 'Safety', deadlineDays: 30 },
  { name: 'Who We Are and What We Do', deadlineDays: null },
  { name: 'Creating Inclusion', deadlineDays: null },
  { name: 'Data Protection in Scouts', deadlineDays: null },
  { name: 'Delivering a Great Programme', deadlineDays: null },
];

/** Returns true if the module title matches a known Growing Roots module */
export function isGrowingRootsModule(title: string): boolean {
  return GROWING_ROOTS_MODULES.some(m => m.name === title);
}

/**
 * Parse expiry date from API format "MM/DD/YYYY HH:MM:SS" to Date
 */
export function parseExpiryDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  try {
    // Format: "04/25/2028 21:22:00"
    const [datePart, timePart] = dateStr.split(' ');
    const [month, day, year] = datePart.split('/').map(Number);
    const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number);

    return new Date(year, month - 1, day, hours, minutes, seconds);
  } catch {
    return null;
  }
}

/**
 * Compute status based on current level and expiry date.
 * Status bands: Expired | Expiring (<30d) | Renewal Due (30–60d) | Expiring Soon (60–90d) | Valid (>90d)
 */
export function computeModuleStatus(currentLevel: string, expiryDate: Date | null, now: Date = new Date()): string {
  if (!expiryDate) {
    return currentLevel === 'Achieved skill' ? 'Valid' : 'Not Started';
  }

  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  if (expiryDate < now) {
    return 'Expired';
  } else if (expiryDate < thirtyDaysFromNow) {
    return 'Expiring';
  } else if (expiryDate < sixtyDaysFromNow) {
    return 'Renewal Due';
  } else if (expiryDate < ninetyDaysFromNow) {
    return 'Expiring Soon';
  } else {
    return 'Valid';
  }
}

/**
 * Returns true if dateStr represents a future date within the given threshold (default 90 days).
 * Accepts ISO date strings or any format parseable by Date constructor.
 */
export function isExpiringSoon(dateStr: string | null | undefined, thresholdDays = 90): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const now = new Date();
  const threshold = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000);
  return date > now && date <= threshold;
}

/**
 * Transform MemberLearningResult[] from GetLmsDetailsAsync into LearningRecord[] format.
 * Includes modules that have expiry dates, plus First Response (required within 1 year of joining).
 * Synthesises a "Not Started" First Response record for any member missing it entirely.
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
    const hasFirstResponse = member.modules.some(m => m.title === FIRST_RESPONSE_MODULE);

    // Include modules with expiry dates, First Response, and all Growing Roots modules
    const includedModules = member.modules.filter(
      m => m.expiryDate !== null || m.title === FIRST_RESPONSE_MODULE || isGrowingRootsModule(m.title),
    );

    for (const module of includedModules) {
      const expiryDate = parseExpiryDate(module.expiryDate);
      const status = computeModuleStatus(module.currentLevel, expiryDate, now);

      const record: LearningRecord = {
        'First name': member.firstName,
        'Last name': member.lastName,
        'Membership number': member.membershipNumber,
        'Learning': module.title,
        'Status': status,
        'Expiry date': expiryDate ? expiryDate.toISOString() : null,
      };

      // Attach start date to First Response so the 1-year deadline can be shown
      if (module.title === FIRST_RESPONSE_MODULE && memberStartDates) {
        record['Start date'] = memberStartDates.get(member.membershipNumber) ?? null;
      }

      records.push(record);
    }

    // Synthesise a "Not Started" record for members with no First Response module at all
    if (!hasFirstResponse) {
      records.push({
        'First name': member.firstName,
        'Last name': member.lastName,
        'Membership number': member.membershipNumber,
        'Learning': FIRST_RESPONSE_MODULE,
        'Status': 'Not Started',
        'Expiry date': null,
        'Start date': memberStartDates?.get(member.membershipNumber) ?? null,
      });
    }

    // Synthesise "Not Started" records for any Growing Roots modules missing from the LMS entirely
    for (const grModule of GROWING_ROOTS_MODULES) {
      const hasModule = member.modules.some(m => m.title === grModule.name);
      if (!hasModule) {
        records.push({
          'First name': member.firstName,
          'Last name': member.lastName,
          'Membership number': member.membershipNumber,
          'Learning': grModule.name,
          'Status': 'Not Started',
          'Expiry date': null,
        });
      }
    }
  }

  return records;
}
