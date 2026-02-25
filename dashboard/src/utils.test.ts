import { describe, it, expect } from 'vitest';
import { parseExpiryDate, computeModuleStatus, transformLearningResults, FIRST_RESPONSE_MODULE } from './utils';
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

    // Safety Training (with expiry) + synthesised First Response = 2 records
    expect(result).toHaveLength(2);
    const safetyRecord = result.find(r => r['Learning'] === 'Safety Training');
    expect(safetyRecord?.['First name']).toBe('John');
    expect(safetyRecord?.['Last name']).toBe('Doe');
    expect(safetyRecord?.['Membership number']).toBe('12345');
    expect(safetyRecord?.['Status']).toBe('Valid');
    expect(safetyRecord?.['Expiry date']).toBeTruthy();
  });

  it('should filter out non-First-Response modules without expiry dates', () => {
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

    // 'One-time Training' is excluded (no expiry, not First Response)
    // 'Renewable Training' is included (has expiry)
    // 'First Response' is synthesised (missing from modules)
    expect(result).toHaveLength(2);
    expect(result.find(r => r['Learning'] === 'Renewable Training')).toBeDefined();
    expect(result.find(r => r['Learning'] === 'First Response')).toBeDefined();
    expect(result.find(r => r['Learning'] === 'One-time Training')).toBeUndefined();
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

    // Alice: Module A + Module B + synthesised First Response = 3
    // Bob:   Module C + synthesised First Response = 2
    expect(result).toHaveLength(5);
    expect(result.filter(r => r['First name'] === 'Alice')).toHaveLength(3);
    expect(result.filter(r => r['First name'] === 'Bob')).toHaveLength(2);
    expect(result.find(r => r['Learning'] === 'Module B')?.Status).toBe('Expired');
    expect(result.find(r => r['Learning'] === 'Module C')?.Status).toBe('Expiring');
  });

  it('should return empty array for empty input', () => {
    expect(transformLearningResults([], fixedNow)).toEqual([]);
  });

  it('should return only First Response synthesised record when all non-FR modules have no expiry', () => {
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

    const result = transformLearningResults(members, fixedNow);
    // Only the synthesised First Response record should appear
    expect(result).toHaveLength(1);
    expect(result[0]['Learning']).toBe('First Response');
  });
});

describe('transformLearningResults – First Response', () => {
  const fixedNow = new Date('2025-01-15T12:00:00Z');

  it('should include a First Response module even without an expiry date (achieved)', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '111',
        contactId: 'c1',
        firstName: 'Alice',
        lastName: 'Smith',
        modules: [
          { title: FIRST_RESPONSE_MODULE, expiryDate: null, currentLevel: 'Achieved skill' },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    expect(result).toHaveLength(1);
    expect(result[0]['Learning']).toBe(FIRST_RESPONSE_MODULE);
    expect(result[0]['Status']).toBe('Valid');
    expect(result[0]['Expiry date']).toBeNull();
  });

  it('should include a First Response module without expiry date when not started', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '222',
        contactId: 'c2',
        firstName: 'Bob',
        lastName: 'Jones',
        modules: [
          { title: FIRST_RESPONSE_MODULE, expiryDate: null, currentLevel: 'Not started' },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    expect(result).toHaveLength(1);
    expect(result[0]['Learning']).toBe(FIRST_RESPONSE_MODULE);
    expect(result[0]['Status']).toBe('Not Started');
  });

  it('should synthesise a Not Started First Response record for members missing it', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '333',
        contactId: 'c3',
        firstName: 'Carol',
        lastName: 'Davis',
        modules: [
          { title: 'Safety', expiryDate: '06/15/2025 00:00:00', currentLevel: 'Achieved skill' },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    const firstResponse = result.find(r => r['Learning'] === FIRST_RESPONSE_MODULE);
    expect(firstResponse).toBeDefined();
    expect(firstResponse!['Status']).toBe('Not Started');
    expect(firstResponse!['Expiry date']).toBeNull();
  });

  it('should attach start date from memberStartDates to synthesised First Response record', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '444',
        contactId: 'c4',
        firstName: 'Dave',
        lastName: 'Lee',
        modules: [],
      },
    ];
    const startDates = new Map([['444', '2024-06-01']]);

    const result = transformLearningResults(members, fixedNow, startDates);

    const fr = result.find(r => r['Learning'] === FIRST_RESPONSE_MODULE);
    expect(fr).toBeDefined();
    expect(fr!['Start date']).toBe('2024-06-01');
  });

  it('should attach start date from memberStartDates to existing First Response module', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '555',
        contactId: 'c5',
        firstName: 'Eve',
        lastName: 'Brown',
        modules: [
          { title: FIRST_RESPONSE_MODULE, expiryDate: null, currentLevel: 'Not started' },
        ],
      },
    ];
    const startDates = new Map([['555', '2024-09-01']]);

    const result = transformLearningResults(members, fixedNow, startDates);

    const fr = result.find(r => r['Learning'] === FIRST_RESPONSE_MODULE);
    expect(fr!['Start date']).toBe('2024-09-01');
  });

  it('should not synthesise a duplicate First Response when one already exists', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '666',
        contactId: 'c6',
        firstName: 'Frank',
        lastName: 'Mills',
        modules: [
          { title: FIRST_RESPONSE_MODULE, expiryDate: '06/15/2026 00:00:00', currentLevel: 'Achieved skill' },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    const frRecords = result.filter(r => r['Learning'] === FIRST_RESPONSE_MODULE);
    expect(frRecords).toHaveLength(1);
  });

  it('should handle members with no modules (synthesise First Response)', () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: '777',
        contactId: 'c7',
        firstName: 'Grace',
        lastName: 'Hill',
        modules: [],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    expect(result).toHaveLength(1);
    expect(result[0]['Learning']).toBe(FIRST_RESPONSE_MODULE);
    expect(result[0]['Status']).toBe('Not Started');
  });
});
