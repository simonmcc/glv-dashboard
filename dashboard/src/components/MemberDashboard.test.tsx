import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemberDashboard } from './MemberDashboard';
import type { LearningRecord, JoiningJourneyRecord } from '../types';

const learningRecords: LearningRecord[] = [
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    Learning: 'Safety',
    Status: 'Valid',
    'Expiry date': '2025-12-01',
    'Start date': '2024-12-01',
  },
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    Learning: 'Safeguarding',
    Status: 'Expiring',
    'Expiry date': '2025-03-15',
    'Start date': '2024-03-15',
  },
  // Different member — should not appear
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '99999999',
    Learning: 'Safety',
    Status: 'Expired',
    'Expiry date': '2024-01-01',
    'Start date': '2023-01-01',
  },
];

const joiningJourneyRecords: JoiningJourneyRecord[] = [
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    Item: 'Criminal Records Declaration',
    Status: 'Complete',
  },
  // Different member — should not appear
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '99999999',
    Item: 'References',
    Status: 'Pending',
  },
];

describe('MemberDashboard', () => {
  it('renders the member name and membership number in the header', () => {
    render(
      <MemberDashboard
        membershipNumber="12345678"
        name="Alice Johnson"
        learningRecords={learningRecords}
        joiningJourneyRecords={joiningJourneyRecords}
        joiningJourneyState="loaded"
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Alice Johnson' })).toBeInTheDocument();
    // membership number appears in the header (and possibly in the table)
    expect(screen.getAllByText('12345678').length).toBeGreaterThan(0);
  });

  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    render(
      <MemberDashboard
        membershipNumber="12345678"
        name="Alice Johnson"
        learningRecords={learningRecords}
        joiningJourneyRecords={joiningJourneyRecords}
        joiningJourneyState="loaded"
        onBack={onBack}
      />
    );

    fireEvent.click(screen.getByText('← Back to Dashboard'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('only shows learning records for the selected member', () => {
    render(
      <MemberDashboard
        membershipNumber="12345678"
        name="Alice Johnson"
        learningRecords={learningRecords}
        joiningJourneyRecords={joiningJourneyRecords}
        joiningJourneyState="loaded"
        onBack={vi.fn()}
      />
    );

    // There should be 2 data rows (Alice's Safety + Safeguarding)
    // and no rows for Bob
    const tbody = document.querySelector('table tbody') as HTMLElement;
    const dataRows = tbody.querySelectorAll('tr');
    expect(dataRows).toHaveLength(2);
  });

  it('only shows joining journey records for the selected member', () => {
    render(
      <MemberDashboard
        membershipNumber="12345678"
        name="Alice Johnson"
        learningRecords={learningRecords}
        joiningJourneyRecords={joiningJourneyRecords}
        joiningJourneyState="loaded"
        onBack={vi.fn()}
      />
    );

    // All table cells in the page
    const cells = screen.getAllByRole('cell');
    const cellTexts = cells.map(c => c.textContent);

    expect(cellTexts.some(t => t?.includes('Criminal Records Declaration'))).toBe(true);
    expect(cellTexts.some(t => t?.includes('References'))).toBe(false);
  });

  it('shows a loading message when joining journey is loading', () => {
    render(
      <MemberDashboard
        membershipNumber="12345678"
        name="Alice Johnson"
        learningRecords={learningRecords}
        joiningJourneyRecords={[]}
        joiningJourneyState="loading"
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText(/Loading joining journey data/)).toBeInTheDocument();
  });

  it('shows a not-loaded message when joining journey is idle', () => {
    render(
      <MemberDashboard
        membershipNumber="12345678"
        name="Alice Johnson"
        learningRecords={learningRecords}
        joiningJourneyRecords={[]}
        joiningJourneyState="idle"
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText(/not yet loaded/)).toBeInTheDocument();
  });
});
