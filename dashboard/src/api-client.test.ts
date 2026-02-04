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

    it('should count expiring soon disclosures (within 60 days)', () => {
      const client = new ScoutsApiClient('test-token');
      // Create a date 30 days from now
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

    it('should count valid disclosures (more than 60 days)', () => {
      const client = new ScoutsApiClient('test-token');
      // Create a date 90 days from now
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

      const records: DisclosureRecord[] = [
        {
          'First name': 'Bob',
          'Last name': 'Jones',
          'Membership number': '333',
          'Disclosure authority': 'DBS',
          'Disclosure status': 'Clear',
          'Disclosure issue date': '2024-01-01',
          'Disclosure expiry date': ninetyDaysFromNow.toISOString(),
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
