import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JoiningJourneyProgress } from './JoiningJourneyProgress';
import type { JoiningJourneyRecord, LearningRecord } from '../types';

// Two members: Alice has 2 outstanding steps; David has Growing Roots + 1 step
const joiningJourneyRecords: JoiningJourneyRecord[] = [
  { 'First name': 'Alice', 'Last name': 'Johnson', 'Membership number': '11111', Item: 'Declaration', Status: 'Incomplete' },
  { 'First name': 'Alice', 'Last name': 'Johnson', 'Membership number': '11111', Item: 'References', Status: 'Incomplete' },
  { 'First name': 'David', 'Last name': 'Brown',   'Membership number': '22222', Item: 'Growing Roots', Status: 'Incomplete' },
  { 'First name': 'David', 'Last name': 'Brown',   'Membership number': '22222', Item: 'Declaration', Status: 'Incomplete' },
];

// David has 3 outstanding GR modules; Safeguarding and Safety are done
const learningRecords: LearningRecord[] = [
  { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Safeguarding',               Status: 'Valid',        'Expiry date': null },
  { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Safety',                     Status: 'Valid',        'Expiry date': null },
  { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Who We Are and What We Do',  Status: 'Not Started',  'Expiry date': null },
  { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Creating Inclusion',         Status: 'Not Started',  'Expiry date': null },
  { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Data Protection in Scouts',  Status: 'Not Started',  'Expiry date': null },
];

const defaultProps = {
  joiningJourneyRecords,
  learningRecords,
  isLoading: false,
};

describe('JoiningJourneyProgress', () => {
  it('renders one row per member', () => {
    render(<JoiningJourneyProgress {...defaultProps} />);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('David Brown')).toBeInTheDocument();
  });

  it('renders outstanding journey step chips for admin steps', () => {
    render(<JoiningJourneyProgress {...defaultProps} />);
    // Alice has Declaration and References
    expect(screen.getAllByText(/Decl\./).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ref\./).length).toBeGreaterThan(0);
  });

  it('expands Growing Roots to per-module chips', () => {
    render(<JoiningJourneyProgress {...defaultProps} />);
    // David's outstanding GR modules should render as chips (chip text includes icon prefix)
    expect(screen.getByText(/Who We Are and What We Do/)).toBeInTheDocument();
    expect(screen.getByText(/Creating Inclusion/)).toBeInTheDocument();
    expect(screen.getByText(/Data Protection in Scouts/)).toBeInTheDocument();
    // Done modules (Safeguarding, Safety) should not appear
    expect(screen.queryByText(/^[–✓⚠✗⟳] Safeguarding/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^[–✓⚠✗⟳] Safety/)).not.toBeInTheDocument();
  });

  it('shows Delivering a Great Programme as not-started when absent from learningRecords', () => {
    render(<JoiningJourneyProgress {...defaultProps} />);
    // Delivering a Great Programme has no learningRecord entry → defaults to not-started chip
    expect(screen.getByText(/Delivering a Great Programme/)).toBeInTheDocument();
  });

  it('shows fallback "Growing Roots" chip when all GR modules are done', () => {
    const allDoneLearning: LearningRecord[] = [
      { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Safeguarding',               Status: 'Valid', 'Expiry date': null },
      { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Safety',                     Status: 'Valid', 'Expiry date': null },
      { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Who We Are and What We Do',  Status: 'Valid', 'Expiry date': null },
      { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Creating Inclusion',         Status: 'Valid', 'Expiry date': null },
      { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Data Protection in Scouts',  Status: 'Valid', 'Expiry date': null },
      { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Delivering a Great Programme', Status: 'Valid', 'Expiry date': null },
      { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Leading Scout Volunteers',    Status: 'Valid', 'Expiry date': null },
      { 'First name': 'David', 'Last name': 'Brown', 'Membership number': '22222', Learning: 'Being a Trustee',            Status: 'Valid', 'Expiry date': null },
    ];
    render(<JoiningJourneyProgress {...defaultProps} learningRecords={allDoneLearning} />);
    // Exactly 2 matches: the "Growing Roots" group label + the fallback chip (group label alone = 1)
    expect(screen.getAllByText(/Growing Roots/).length).toBe(2);
  });

  it('filters members by search term (name match)', () => {
    render(<JoiningJourneyProgress {...defaultProps} searchTerm="alice" />);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('David Brown')).not.toBeInTheDocument();
  });

  it('filters members by search term (membership number match)', () => {
    render(<JoiningJourneyProgress {...defaultProps} searchTerm="22222" />);
    expect(screen.getByText('David Brown')).toBeInTheDocument();
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
  });

  it('shows "no records match" message when search finds nothing', () => {
    render(<JoiningJourneyProgress {...defaultProps} searchTerm="zzz" />);
    expect(screen.getByText(/No records match/)).toBeInTheDocument();
  });

  it('sorts by "Most outstanding" (expanded chip count) by default', () => {
    // David has Declaration (1) + 4 outstanding GR chips = 5 chips total
    // Alice has Declaration (1) + References (1) = 2 chips
    // David should appear first
    const { container } = render(<JoiningJourneyProgress {...defaultProps} />);
    const memberRows = container.querySelectorAll('.divide-y > div');
    expect(memberRows[0].textContent).toContain('Brown');
    expect(memberRows[1].textContent).toContain('Johnson');
  });

  it('sorts alphabetically by name when "Name" sort is selected', () => {
    const { container } = render(<JoiningJourneyProgress {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    const memberRows = container.querySelectorAll('.divide-y > div');
    // Brown before Johnson alphabetically
    expect(memberRows[0].textContent).toContain('Brown');
    expect(memberRows[1].textContent).toContain('Johnson');
  });

  it('calls onMemberSelect with membership number and name when a member is clicked', () => {
    const onMemberSelect = vi.fn();
    render(<JoiningJourneyProgress {...defaultProps} onMemberSelect={onMemberSelect} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    expect(onMemberSelect).toHaveBeenCalledWith('11111', 'Alice Johnson');
  });

  it('renders a loading skeleton when isLoading is true', () => {
    const { container } = render(<JoiningJourneyProgress {...defaultProps} isLoading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows empty state when no members are in the joining journey', () => {
    render(<JoiningJourneyProgress {...defaultProps} joiningJourneyRecords={[]} />);
    expect(screen.getByText(/No members currently in their joining journey/)).toBeInTheDocument();
  });

  it('shows member count in the toolbar', () => {
    render(<JoiningJourneyProgress {...defaultProps} />);
    expect(screen.getByText(/2 members in joining journey/)).toBeInTheDocument();
  });

  it('renders "Within 30 days" group label and CRC chip for a member with CRC outstanding', () => {
    const records: JoiningJourneyRecord[] = [
      { 'First name': 'Eve', 'Last name': 'Smith', 'Membership number': '33333', Item: 'Criminal Record Check', Status: 'Incomplete' },
    ];
    render(<JoiningJourneyProgress joiningJourneyRecords={records} learningRecords={[]} isLoading={false} />);
    expect(screen.getByText('Within 30 days')).toBeInTheDocument();
    expect(screen.getByText(/CRC/)).toBeInTheDocument();
  });

  it('renders "Welcome & Checks" group label for a member with References outstanding', () => {
    const records: JoiningJourneyRecord[] = [
      { 'First name': 'Eve', 'Last name': 'Smith', 'Membership number': '33333', Item: 'References', Status: 'Incomplete' },
    ];
    render(<JoiningJourneyProgress joiningJourneyRecords={records} learningRecords={[]} isLoading={false} />);
    expect(screen.getByText('Welcome & Checks')).toBeInTheDocument();
    expect(screen.getByText(/Ref\./)).toBeInTheDocument();
  });

  it('renders "Growing Roots" group label when Growing Roots modules are outstanding', () => {
    // David has Growing Roots outstanding with non-30d modules not started
    render(<JoiningJourneyProgress {...defaultProps} />);
    expect(screen.getByText('Growing Roots')).toBeInTheDocument();
  });

  it('CRC chip carries a 30d orange indicator', () => {
    const records: JoiningJourneyRecord[] = [
      { 'First name': 'Eve', 'Last name': 'Smith', 'Membership number': '33333', Item: 'Criminal Record Check', Status: 'Incomplete' },
    ];
    render(<JoiningJourneyProgress joiningJourneyRecords={records} learningRecords={[]} isLoading={false} />);
    // The CRC chip span contains both the label and the nested 30d indicator
    const crcChip = screen.getByText(/CRC/);
    expect(crcChip.textContent).toContain('30d');
  });

  it('renders chips for unknown outstanding items not in JOURNEY_STEPS or known categories', () => {
    const records: JoiningJourneyRecord[] = [
      { 'First name': 'Eve', 'Last name': 'Smith', 'Membership number': '33333', Item: 'Declaration', Status: 'Incomplete' },
      { 'First name': 'Eve', 'Last name': 'Smith', 'Membership number': '33333', Item: 'dataProtectionTrainingComplete', Status: 'Incomplete' },
      { 'First name': 'Eve', 'Last name': 'Smith', 'Membership number': '33333', Item: 'managerDisclosureCheck', Status: 'Incomplete' },
      { 'First name': 'Eve', 'Last name': 'Smith', 'Membership number': '33333', Item: 'updateMemberProfile', Status: 'Incomplete' },
    ];
    render(<JoiningJourneyProgress joiningJourneyRecords={records} learningRecords={[]} isLoading={false} />);
    expect(screen.getByText(/dataProtectionTrainingComplete/)).toBeInTheDocument();
    expect(screen.getByText(/managerDisclosureCheck/)).toBeInTheDocument();
    expect(screen.getByText(/updateMemberProfile/)).toBeInTheDocument();
    // Known step is still rendered
    expect(screen.getByText(/Decl\./)).toBeInTheDocument();
  });
});
