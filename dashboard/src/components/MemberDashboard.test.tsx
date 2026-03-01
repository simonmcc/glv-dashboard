import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemberDashboard } from './MemberDashboard';
import type { LearningRecord, JoiningJourneyRecord, DisclosureRecord, TeamReviewRecord, PermitRecord, AwardRecord } from '../types';

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

const disclosureRecords: DisclosureRecord[] = [
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Disclosure authority': 'Disclosure Scotland',
    'Disclosure status': 'Disclosure Valid',
  },
  // Different member — should not appear
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '99999999',
    'Disclosure authority': 'DBS',
    'Disclosure status': 'Disclosure Expired',
  },
];

const teamReviewRecords: TeamReviewRecord[] = [
  {
    'Membership number': '12345678',
    Role: 'Scout Leader',
    'Team leader': 'Alice Johnson',
    'Scheduled review date': '2025-06-01',
    'Review overdue': 'No',
  },
  // Different member — should not appear
  {
    'Membership number': '99999999',
    Role: 'Assistant Leader',
    'Team leader': 'Bob Smith',
    'Scheduled review date': '2024-01-01',
    'Review overdue': 'Yes',
  },
];

const permitRecords: PermitRecord[] = [
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Permit category': 'Nights Away',
    'Permit status': 'Valid',
    'Permit expiry date': '2026-01-01',
  },
  // Different member — should not appear
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '99999999',
    'Permit category': 'Water Activities',
    'Permit status': 'Expired',
    'Permit expiry date': '2024-01-01',
  },
];

const awardRecords: AwardRecord[] = [
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    Accreditation: 'Wood Badge',
    Role: 'Scout Leader',
  },
  // Different member — should not appear
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '99999999',
    Accreditation: 'Silver Award',
    Role: 'Assistant Leader',
  },
];

/** Default props with all sections loaded and populated with test data */
const defaultProps = {
  membershipNumber: '12345678',
  name: 'Alice Johnson',
  learningRecords,
  joiningJourneyRecords,
  joiningJourneyState: 'loaded' as const,
  disclosureRecords,
  disclosuresState: 'loaded' as const,
  teamReviewRecords,
  teamReviewsState: 'loaded' as const,
  permitRecords,
  permitsState: 'loaded' as const,
  awardRecords,
  awardsState: 'loaded' as const,
  onBack: vi.fn(),
};

describe('MemberDashboard', () => {
  it('renders the member name and membership number in the header', () => {
    render(<MemberDashboard {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Alice Johnson' })).toBeInTheDocument();
    // membership number appears in the header
    expect(screen.getByText('12345678')).toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    render(<MemberDashboard {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByText('← Back to Dashboard'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('only shows learning records for the selected member', () => {
    render(<MemberDashboard {...defaultProps} />);

    const section = screen.getByTestId('learning-section');
    // Alice's learning items should be visible
    expect(section.textContent).toContain('Safety');
    expect(section.textContent).toContain('Safeguarding');
    // Bob's records should not appear in the learning section
    expect(section.textContent).not.toContain('Expired');
  });

  it('only shows joining journey records for the selected member', () => {
    render(<MemberDashboard {...defaultProps} />);

    const section = screen.getByTestId('joining-journey-section');
    expect(section.textContent).toContain('Criminal Records Declaration');
    expect(section.textContent).not.toContain('References');
  });

  it('shows a loading message when joining journey is loading', () => {
    render(<MemberDashboard {...defaultProps} joiningJourneyState="loading" joiningJourneyRecords={[]} />);

    expect(screen.getByText(/Loading joining journey data/)).toBeInTheDocument();
  });

  it('shows a not-loaded message when joining journey is idle', () => {
    render(<MemberDashboard {...defaultProps} joiningJourneyState="idle" joiningJourneyRecords={[]} />);

    expect(screen.getByText(/not yet loaded/)).toBeInTheDocument();
  });

  it('only shows disclosure records for the selected member', () => {
    render(<MemberDashboard {...defaultProps} />);

    const section = screen.getByTestId('disclosure-section');
    expect(section.textContent).toContain('Disclosure Scotland');
    expect(section.textContent).not.toContain('DBS');
  });

  it('shows a loading message when disclosures are loading', () => {
    render(<MemberDashboard {...defaultProps} disclosuresState="loading" disclosureRecords={[]} />);

    expect(screen.getByText(/Loading disclosure data/)).toBeInTheDocument();
  });

  it('only shows team review records for the selected member', () => {
    render(<MemberDashboard {...defaultProps} />);

    const section = screen.getByTestId('team-reviews-section');
    expect(section.textContent).toContain('Scout Leader');
    expect(section.textContent).not.toContain('Assistant Leader');
  });

  it('shows a loading message when team reviews are loading', () => {
    render(<MemberDashboard {...defaultProps} teamReviewsState="loading" teamReviewRecords={[]} />);

    expect(screen.getByText(/Loading team review data/)).toBeInTheDocument();
  });

  it('only shows permit records for the selected member', () => {
    render(<MemberDashboard {...defaultProps} />);

    const section = screen.getByTestId('permits-section');
    expect(section.textContent).toContain('Nights Away');
    expect(section.textContent).not.toContain('Water Activities');
  });

  it('shows a loading message when permits are loading', () => {
    render(<MemberDashboard {...defaultProps} permitsState="loading" permitRecords={[]} />);

    expect(screen.getByText(/Loading permit data/)).toBeInTheDocument();
  });

  it('only shows award records for the selected member', () => {
    render(<MemberDashboard {...defaultProps} />);

    const section = screen.getByTestId('awards-section');
    expect(section.textContent).toContain('Wood Badge');
    expect(section.textContent).not.toContain('Silver Award');
  });

  it('shows a loading message when awards are loading', () => {
    render(<MemberDashboard {...defaultProps} awardsState="loading" awardRecords={[]} />);

    expect(screen.getByText(/Loading awards data/)).toBeInTheDocument();
  });

  it('displays expiry dates for learning records', () => {
    render(<MemberDashboard {...defaultProps} />);

    // Alice's Safety expiry date should be formatted
    expect(screen.getByText('1 Dec 2025')).toBeInTheDocument();
    expect(screen.getByText('15 Mar 2025')).toBeInTheDocument();
  });

  it('displays status badges with correct text', () => {
    render(<MemberDashboard {...defaultProps} />);

    const section = screen.getByTestId('learning-section');
    expect(section.textContent).toContain('Valid');
    expect(section.textContent).toContain('Expiring');
  });
});
