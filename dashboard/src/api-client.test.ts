import { describe, it, expect } from 'vitest';
import { ScoutsApiClient } from './api-client';
import type { LearningRecord, DisclosureRecord } from './types';

// Test the pure functions on ScoutsApiClient
// Note: We can't easily test the API methods without mocking fetch,
// but we can test the data transformation methods

describe('ScoutsApiClient', () => {
  describe('computeComplianceSummary', () => {
    it('should compute summary for empty records', () => {
      const client = new ScoutsApiClient('test-token');
      const summary = client.computeComplianceSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.byLearningType).toEqual({});
      expect(summary.byStatus).toEqual({});
      expect(summary.expiringSoon).toBe(0);
    });

    it('should compute summary by learning type and status', () => {
      const client = new ScoutsApiClient('test-token');
      const records: LearningRecord[] = [
        {
          'First name': 'John',
          'Last name': 'Doe',
          'Membership number': '111',
          'Learning': 'Safety Training',
          'Status': 'Valid',
          'Expiry date': '2025-06-15',
        },
        {
          'First name': 'Jane',
          'Last name': 'Smith',
          'Membership number': '222',
          'Learning': 'Safety Training',
          'Status': 'Expired',
          'Expiry date': '2024-01-15',
        },
        {
          'First name': 'Bob',
          'Last name': 'Jones',
          'Membership number': '333',
          'Learning': 'First Aid',
          'Status': 'Expiring',
          'Expiry date': '2025-02-01',
        },
      ];

      const summary = client.computeComplianceSummary(records);

      expect(summary.total).toBe(3);
      expect(summary.byLearningType['Safety Training'].total).toBe(2);
      expect(summary.byLearningType['Safety Training'].compliant).toBe(1);
      expect(summary.byLearningType['Safety Training'].expired).toBe(1);
      expect(summary.byLearningType['First Aid'].total).toBe(1);
      expect(summary.byLearningType['First Aid'].expiring).toBe(1);
      expect(summary.byStatus['Valid']).toBe(1);
      expect(summary.byStatus['Expired']).toBe(1);
      expect(summary.byStatus['Expiring']).toBe(1);
    });

    it('should categorize In-Progress as compliant', () => {
      const client = new ScoutsApiClient('test-token');
      const records: LearningRecord[] = [
        {
          'First name': 'John',
          'Last name': 'Doe',
          'Membership number': '111',
          'Learning': 'Training',
          'Status': 'In-Progress',
          'Expiry date': null,
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.byLearningType['Training'].compliant).toBe(1);
    });

    it('should categorize Renewal Due as expiring', () => {
      const client = new ScoutsApiClient('test-token');
      const records: LearningRecord[] = [
        {
          'First name': 'John',
          'Last name': 'Doe',
          'Membership number': '111',
          'Learning': 'Training',
          'Status': 'Renewal Due',
          'Expiry date': '2025-03-01',
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.byLearningType['Training'].expiring).toBe(1);
    });

    it('should categorize Not Started as expired', () => {
      const client = new ScoutsApiClient('test-token');
      const records: LearningRecord[] = [
        {
          'First name': 'John',
          'Last name': 'Doe',
          'Membership number': '111',
          'Learning': 'Training',
          'Status': 'Not Started',
          'Expiry date': null,
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.byLearningType['Training'].expired).toBe(1);
    });

    it('should categorize Expiring Soon as expiring', () => {
      const client = new ScoutsApiClient('test-token');
      const records: LearningRecord[] = [
        {
          'First name': 'John',
          'Last name': 'Doe',
          'Membership number': '111',
          'Learning': 'Training',
          'Status': 'Expiring Soon',
          'Expiry date': '2025-06-01',
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.byLearningType['Training'].expiring).toBe(1);
    });

    it('should count expiringSoon as sum of Expiring, Renewal Due, and Expiring Soon', () => {
      const client = new ScoutsApiClient('test-token');
      const records: LearningRecord[] = [
        { 'First name': 'A', 'Last name': 'B', 'Membership number': '1', 'Learning': 'T', 'Status': 'Expiring', 'Expiry date': '2025-02-01' },
        { 'First name': 'C', 'Last name': 'D', 'Membership number': '2', 'Learning': 'T', 'Status': 'Renewal Due', 'Expiry date': '2025-03-01' },
        { 'First name': 'E', 'Last name': 'F', 'Membership number': '3', 'Learning': 'T', 'Status': 'Expiring Soon', 'Expiry date': '2025-04-01' },
        { 'First name': 'G', 'Last name': 'H', 'Membership number': '4', 'Learning': 'T', 'Status': 'Valid', 'Expiry date': '2026-01-01' },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.expiringSoon).toBe(3);
    });
  });

  describe('deduplicateRecords', () => {
    const client = new ScoutsApiClient('test-token');
    // Access private method for testing
    const dedup = (records: LearningRecord[]) =>
      (client as unknown as { deduplicateRecords: (r: LearningRecord[]) => LearningRecord[] }).deduplicateRecords(records);

    const base = (overrides: Partial<LearningRecord>): LearningRecord => ({
      'First name': 'Alice',
      'Last name': 'Smith',
      'Membership number': '111',
      'Learning': 'Safeguarding',
      'Status': 'Valid',
      'Expiry date': '2027-01-01',
      'Start date': null,
      ...overrides,
    });

    it('passes a single record through unchanged', () => {
      const record = base({ 'Status': 'Not Started', 'Expiry date': null });
      expect(dedup([record])).toEqual([record]);
    });

    it('keeps "Not Started" over "Valid" for the same member+learning', () => {
      const valid = base({ 'Status': 'Valid', 'Start date': '2023-01-01' });
      const notStarted = base({ 'Status': 'Not Started', 'Expiry date': null, 'Start date': null });
      const result = dedup([valid, notStarted]);
      expect(result).toHaveLength(1);
      expect(result[0].Status).toBe('Not Started');
    });

    it('keeps "Not Started" regardless of insertion order', () => {
      const notStarted = base({ 'Status': 'Not Started', 'Expiry date': null, 'Start date': null });
      const valid = base({ 'Status': 'Valid', 'Start date': '2023-01-01' });
      const result = dedup([notStarted, valid]);
      expect(result).toHaveLength(1);
      expect(result[0].Status).toBe('Not Started');
    });

    it('preserves the earliest start date when taking a worse status record', () => {
      // Valid record has an earlier start date; Not Started has a later one.
      // The result should be "Not Started" status with the earlier start date.
      const valid = base({ 'Status': 'Valid', 'Start date': '2022-06-01' });
      const notStarted = base({ 'Status': 'Not Started', 'Expiry date': null, 'Start date': '2023-01-01' });
      const result = dedup([valid, notStarted]);
      expect(result).toHaveLength(1);
      expect(result[0].Status).toBe('Not Started');
      expect(result[0]['Start date']).toBe(new Date('2022-06-01').toISOString());
    });

    it('keeps "Expired" over "Valid"', () => {
      const valid = base({ 'Status': 'Valid' });
      const expired = base({ 'Status': 'Expired', 'Expiry date': '2020-01-01' });
      const result = dedup([valid, expired]);
      expect(result[0].Status).toBe('Expired');
    });

    it('keeps distinct records for different members', () => {
      const alice = base({ 'Membership number': '111', 'Status': 'Valid' });
      const bob = base({ 'Membership number': '222', 'Status': 'Not Started', 'Expiry date': null });
      expect(dedup([alice, bob])).toHaveLength(2);
    });

    it('keeps distinct records for different learning modules', () => {
      const safety = base({ 'Learning': 'Safety', 'Status': 'Valid' });
      const gdpr = base({ 'Learning': 'GDPR', 'Status': 'Not Started', 'Expiry date': null });
      expect(dedup([safety, gdpr])).toHaveLength(2);
    });

    it('uses earliest start date as tiebreaker when status is equal', () => {
      const older = base({ 'Status': 'Expired', 'Start date': '2021-01-01' });
      const newer = base({ 'Status': 'Expired', 'Start date': '2023-06-01' });
      const result = dedup([newer, older]);
      expect(result[0]['Start date']).toBe('2021-01-01');
    });
  });

  describe('computeDisclosureSummary', () => {
    it('should compute summary for empty records', () => {
      const client = new ScoutsApiClient('test-token');
      const summary = client.computeDisclosureSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.byStatus).toEqual({});
      expect(summary.expired).toBe(0);
      expect(summary.expiringSoon).toBe(0);
      expect(summary.valid).toBe(0);
    });

    it('should count expired disclosures by status', () => {
      const client = new ScoutsApiClient('test-token');
      const records: DisclosureRecord[] = [
        {
          'First name': 'John',
          'Last name': 'Doe',
          'Membership number': '111',
          'Disclosure authority': 'DBS',
          'Disclosure status': 'Expired',
          'Disclosure issue date': '2020-01-01',
          'Disclosure expiry date': '2023-01-01',
          'Days since expiry': 365,
        },
      ];

      const summary = client.computeDisclosureSummary(records);

      expect(summary.total).toBe(1);
      expect(summary.byStatus['Expired']).toBe(1);
      expect(summary.expired).toBe(1);
    });

    it('should count expiring soon disclosures (within 90 days)', () => {
      const client = new ScoutsApiClient('test-token');
      // Create a date 30 days from now (well within 90d threshold)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const records: DisclosureRecord[] = [
        {
          'First name': 'Jane',
          'Last name': 'Smith',
          'Membership number': '222',
          'Disclosure authority': 'AccessNI',
          'Disclosure status': 'Valid',
          'Disclosure issue date': '2022-01-01',
          'Disclosure expiry date': thirtyDaysFromNow.toISOString(),
          'Days since expiry': null,
        },
      ];

      const summary = client.computeDisclosureSummary(records);

      expect(summary.total).toBe(1);
      expect(summary.expiringSoon).toBe(1);
      expect(summary.valid).toBe(0);
    });

    it('should count valid disclosures (more than 90 days)', () => {
      const client = new ScoutsApiClient('test-token');
      // Create a date 120 days from now (beyond 90d threshold)
      const oneHundredTwentyDaysFromNow = new Date();
      oneHundredTwentyDaysFromNow.setDate(oneHundredTwentyDaysFromNow.getDate() + 120);

      const records: DisclosureRecord[] = [
        {
          'First name': 'Bob',
          'Last name': 'Jones',
          'Membership number': '333',
          'Disclosure authority': 'DBS',
          'Disclosure status': 'Clear',
          'Disclosure issue date': '2024-01-01',
          'Disclosure expiry date': oneHundredTwentyDaysFromNow.toISOString(),
          'Days since expiry': null,
        },
      ];

      const summary = client.computeDisclosureSummary(records);

      expect(summary.total).toBe(1);
      expect(summary.valid).toBe(1);
      expect(summary.expired).toBe(0);
      expect(summary.expiringSoon).toBe(0);
    });

    it('should count records without expiry date as valid', () => {
      const client = new ScoutsApiClient('test-token');
      const records: DisclosureRecord[] = [
        {
          'First name': 'Test',
          'Last name': 'User',
          'Membership number': '444',
          'Disclosure authority': 'DBS',
          'Disclosure status': 'Clear',
          'Disclosure issue date': '2024-01-01',
          'Disclosure expiry date': null,
          'Days since expiry': null,
        },
      ];

      const summary = client.computeDisclosureSummary(records);

      expect(summary.valid).toBe(1);
    });
  });
});
