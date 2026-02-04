/**
 * Utility functions for data transformation and computation.
 * Extracted for testability.
 */

import type { LearningRecord, MemberLearningResult } from './types';

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
 * Compute status based on current level and expiry date
 */
export function computeModuleStatus(currentLevel: string, expiryDate: Date | null, now: Date = new Date()): string {
  if (!expiryDate) {
    return currentLevel === 'Achieved skill' ? 'Valid' : 'Not Started';
  }

  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  if (expiryDate < now) {
    return 'Expired';
  } else if (expiryDate < thirtyDaysFromNow) {
    return 'Expiring';
  } else if (expiryDate < sixtyDaysFromNow) {
    return 'Renewal Due';
  } else {
    return 'Valid';
  }
}

/**
 * Transform MemberLearningResult[] from GetLmsDetailsAsync into LearningRecord[] format.
 * Only includes modules that have actual expiry dates (filters out one-time modules).
 */
export function transformLearningResults(members: MemberLearningResult[], now: Date = new Date()): LearningRecord[] {
  const records: LearningRecord[] = [];

  for (const member of members) {
    // Only include modules that have an expiry date (i.e., need renewal)
    const expiringModules = member.modules.filter(m => m.expiryDate !== null);

    for (const module of expiringModules) {
      // Parse the expiry date (format: "MM/DD/YYYY HH:MM:SS")
      const expiryDate = parseExpiryDate(module.expiryDate);
      const status = computeModuleStatus(module.currentLevel, expiryDate, now);

      records.push({
        'First name': member.firstName,
        'Last name': member.lastName,
        'Membership number': member.membershipNumber,
        'Learning': module.title,
        'Status': status,
        'Expiry date': expiryDate ? expiryDate.toISOString() : null,
      });
    }
  }

  return records;
}
