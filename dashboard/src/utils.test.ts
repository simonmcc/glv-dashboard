import { describe, it, expect } from 'vitest';
import { parseExpiryDate, computeModuleStatus, transformLearningResults } from './utils';
import type { MemberLearningResult } from './types';

describe('parseExpiryDate', () => {
  it('should parse a valid date string', () => {
    const result = parseExpiryDate('04/25/2028 21:22:00');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2028);
    expect(result?.getMonth()).toBe(3); // April is month 3 (0-indexed)
    expect(result?.getDate()).toBe(25);
    expect(result?.getHours()).toBe(21);
    expect(result?.getMinutes()).toBe(22);
  });

  it('should return null for null input', () => {
    expect(parseExpiryDate(null)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseExpiryDate('')).toBeNull();
  });

  it('should handle date without time part', () => {
    const result = parseExpiryDate('12/31/2025');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2025);
    expect(result?.getMonth()).toBe(11); // December
    expect(result?.getDate()).toBe(31);
  });
});

describe('computeModuleStatus', () => {
  const fixedNow = new Date('2025-01-15T12:00:00Z');

  it('should return "Valid" for achieved skill with no expiry', () => {
    expect(computeModuleStatus('Achieved skill', null, fixedNow)).toBe('Valid');
  });

  it('should return "Not Started" for non-achieved skill with no expiry', () => {
    expect(computeModuleStatus('Not started', null, fixedNow)).toBe('Not Started');
    expect(computeModuleStatus('', null, fixedNow)).toBe('Not Started');
  });

  it('should return "Expired" for past expiry date', () => {
    const expiredDate = new Date('2025-01-01T00:00:00Z');
    expect(computeModuleStatus('Achieved skill', expiredDate, fixedNow)).toBe('Expired');
  });

  it('should return "Expiring" for expiry within 30 days', () => {
    const expiringDate = new Date('2025-02-01T00:00:00Z'); // 17 days from fixedNow
    expect(computeModuleStatus('Achieved skill', expiringDate, fixedNow)).toBe('Expiring');
  });

  it('should return "Renewal Due" for expiry within 60 days but after 30 days', () => {
    const renewalDate = new Date('2025-02-28T00:00:00Z'); // 44 days from fixedNow
    expect(computeModuleStatus('Achieved skill', renewalDate, fixedNow)).toBe('Renewal Due');
  });

  it('should return "Valid" for expiry more than 60 days away', () => {
    const validDate = new Date('2025-06-01T00:00:00Z'); // 137 days from fixedNow
    expect(computeModuleStatus('Achieved skill', validDate, fixedNow)).toBe('Valid');
  });
});

describe('transformLearningResults', () => {
  const fixedNow = new Date('2025-01-15T12:00:00Z');

  it('should transform member learning results into learning records', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '12345',
        contactId: 'contact-123',
        firstName: 'John',
        lastName: 'Doe',
        modules: [
          {
            title: 'Safety Training',
            currentLevel: 'Achieved skill',
            expiryDate: '06/15/2025 00:00:00',
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    expect(result).toHaveLength(1);
    expect(result[0]['First name']).toBe('John');
    expect(result[0]['Last name']).toBe('Doe');
    expect(result[0]['Membership number']).toBe('12345');
    expect(result[0]['Learning']).toBe('Safety Training');
    expect(result[0]['Status']).toBe('Valid');
    expect(result[0]['Expiry date']).toBeTruthy();
  });

  it('should filter out modules without expiry dates', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '12345',
        contactId: 'contact-123',
        firstName: 'John',
        lastName: 'Doe',
        modules: [
          {
            title: 'One-time Training',
            currentLevel: 'Achieved skill',
            expiryDate: null,
          },
          {
            title: 'Renewable Training',
            currentLevel: 'Achieved skill',
            expiryDate: '06/15/2025 00:00:00',
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    expect(result).toHaveLength(1);
    expect(result[0]['Learning']).toBe('Renewable Training');
  });

  it('should handle multiple members with multiple modules', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '111',
        contactId: 'contact-111',
        firstName: 'Alice',
        lastName: 'Smith',
        modules: [
          { title: 'Module A', currentLevel: 'Achieved skill', expiryDate: '06/15/2025 00:00:00' },
          { title: 'Module B', currentLevel: 'Achieved skill', expiryDate: '01/01/2025 00:00:00' }, // Expired
        ],
      },
      {
        membershipNumber: '222',
        contactId: 'contact-222',
        firstName: 'Bob',
        lastName: 'Jones',
        modules: [
          { title: 'Module C', currentLevel: 'Not started', expiryDate: '02/01/2025 00:00:00' }, // Expiring
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    expect(result).toHaveLength(3);
    expect(result.filter(r => r['First name'] === 'Alice')).toHaveLength(2);
    expect(result.filter(r => r['First name'] === 'Bob')).toHaveLength(1);
    expect(result.find(r => r['Learning'] === 'Module B')?.Status).toBe('Expired');
    expect(result.find(r => r['Learning'] === 'Module C')?.Status).toBe('Expiring');
  });

  it('should return empty array for empty input', () => {
    expect(transformLearningResults([], fixedNow)).toEqual([]);
  });

  it('should return empty array when all modules have no expiry', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '12345',
        contactId: 'contact-123',
        firstName: 'John',
        lastName: 'Doe',
        modules: [
          { title: 'Module 1', currentLevel: 'Achieved skill', expiryDate: null },
          { title: 'Module 2', currentLevel: 'Achieved skill', expiryDate: null },
        ],
      },
    ];

    expect(transformLearningResults(members, fixedNow)).toEqual([]);
  });
});
