/**
 * Mock data for PR previews and development
 *
 * This data is used when VITE_MOCK_MODE=true to demonstrate the dashboard
 * without requiring authentication to the real Scouts API.
 */

import type {
  LearningRecord,
  DisclosureRecord,
  JoiningJourneyRecord,
  AppointmentRecord,
  SuspensionRecord,
  TeamReviewRecord,
  PermitRecord,
  AwardRecord,
  MemberLearningResult,
} from './types';

// Helper to generate dates relative to today
const today = new Date();
const daysFromNow = (days: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};
const daysAgo = (days: number) => daysFromNow(-days);

// Format a date as the Scouts API expiry date string "MM/DD/YYYY 00:00:00"
const apiDate = (date: Date): string => {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${d}/${y} 00:00:00`;
};
const apiDaysFromNow = (days: number) => apiDate(new Date(today.getTime() + days * 24 * 60 * 60 * 1000));
const apiDaysAgo = (days: number) => apiDaysFromNow(-days);

export const mockLearningRecords: LearningRecord[] = [
  // Safety training - various statuses
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Learning': 'Safety',
    'Status': 'Valid',
    'Expiry date': daysFromNow(180),
    'Start date': daysAgo(365),
  },
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '23456789',
    'Learning': 'Safety',
    'Status': 'Expiring',
    'Expiry date': daysFromNow(30),
    'Start date': daysAgo(365),
  },
  {
    'First name': 'Carol',
    'Last name': 'Williams',
    'Membership number': '34567890',
    'Learning': 'Safety',
    'Status': 'Expired',
    'Expiry date': daysAgo(15),
    'Start date': daysAgo(400),
  },
  {
    'First name': 'David',
    'Last name': 'Brown',
    'Membership number': '45678901',
    'Learning': 'Safety',
    'Status': 'Not Started',
    'Expiry date': null,
    'Start date': daysAgo(30),
  },
  // Safeguarding training
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Learning': 'Safeguarding',
    'Status': 'Valid',
    'Expiry date': daysFromNow(200),
    'Start date': daysAgo(365),
  },
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '23456789',
    'Learning': 'Safeguarding',
    'Status': 'Valid',
    'Expiry date': daysFromNow(150),
    'Start date': daysAgo(365),
  },
  {
    'First name': 'Carol',
    'Last name': 'Williams',
    'Membership number': '34567890',
    'Learning': 'Safeguarding',
    'Status': 'Renewal Due',
    'Expiry date': daysFromNow(45),
    'Start date': daysAgo(400),
  },
  {
    'First name': 'David',
    'Last name': 'Brown',
    'Membership number': '45678901',
    'Learning': 'Safeguarding',
    'Status': 'In-Progress',
    'Expiry date': null,
    'Start date': daysAgo(30),
  },
  // First Aid training
  {
    'First name': 'Emma',
    'Last name': 'Davis',
    'Membership number': '56789012',
    'Learning': 'First Aid',
    'Status': 'Valid',
    'Expiry date': daysFromNow(365),
    'Start date': daysAgo(180),
  },
  {
    'First name': 'Frank',
    'Last name': 'Miller',
    'Membership number': '67890123',
    'Learning': 'First Aid',
    'Status': 'Expired',
    'Expiry date': daysAgo(60),
    'Start date': daysAgo(500),
  },
  // GDPR
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Learning': 'GDPR',
    'Status': 'Valid',
    'Expiry date': daysFromNow(300),
    'Start date': daysAgo(365),
  },
  {
    'First name': 'Grace',
    'Last name': 'Wilson',
    'Membership number': '78901234',
    'Learning': 'GDPR',
    'Status': 'Not Started',
    'Expiry date': null,
    'Start date': daysAgo(14),
  },
];

export const mockDisclosureRecords: DisclosureRecord[] = [
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Disclosure authority': 'PVG Scotland',
    'Disclosure status': 'Valid',
    'Disclosure issue date': daysAgo(365),
    'Disclosure expiry date': daysFromNow(730),
  },
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '23456789',
    'Disclosure authority': 'DBS England',
    'Disclosure status': 'Expiring Soon',
    'Disclosure issue date': daysAgo(1000),
    'Disclosure expiry date': daysFromNow(45),
  },
  {
    'First name': 'Carol',
    'Last name': 'Williams',
    'Membership number': '34567890',
    'Disclosure authority': 'PVG Scotland',
    'Disclosure status': 'Expired',
    'Disclosure issue date': daysAgo(1200),
    'Disclosure expiry date': daysAgo(30),
  },
  {
    'First name': 'David',
    'Last name': 'Brown',
    'Membership number': '45678901',
    'Disclosure authority': 'AccessNI',
    'Disclosure status': 'Pending',
    'Disclosure issue date': null,
    'Disclosure expiry date': null,
  },
  {
    'First name': 'Emma',
    'Last name': 'Davis',
    'Membership number': '56789012',
    'Disclosure authority': 'DBS England',
    'Disclosure status': 'Valid',
    'Disclosure issue date': daysAgo(180),
    'Disclosure expiry date': daysFromNow(900),
  },
];

export const mockJoiningJourneyRecords: JoiningJourneyRecord[] = [
  {
    'First name': 'David',
    'Last name': 'Brown',
    'Membership number': '45678901',
    'Item': 'Declaration',
    'Status': 'Incomplete',
    'Due date': daysFromNow(14),
  },
  {
    'First name': 'David',
    'Last name': 'Brown',
    'Membership number': '45678901',
    'Item': 'References',
    'Status': 'Incomplete',
    'Due date': daysFromNow(30),
  },
  {
    'First name': 'Grace',
    'Last name': 'Wilson',
    'Membership number': '78901234',
    'Item': 'Welcome Conversation',
    'Status': 'Incomplete',
    'Due date': daysFromNow(7),
  },
  {
    'First name': 'Grace',
    'Last name': 'Wilson',
    'Membership number': '78901234',
    'Item': 'Core Learning',
    'Status': 'Incomplete',
    'Due date': daysFromNow(60),
  },
  {
    'First name': 'Henry',
    'Last name': 'Taylor',
    'Membership number': '89012345',
    'Item': 'Criminal Record Check',
    'Status': 'Incomplete',
    'Due date': daysAgo(5),
  },
];

export const mockAppointmentRecords: AppointmentRecord[] = [
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Role/Accreditation': 'Assistant Section Leader',
    'Start date': daysAgo(365),
    'End date': null,
    'Days since role Started': 365,
    'Group': '1st Demo Group',
  },
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '23456789',
    'Role/Accreditation': 'Section Leader',
    'Start date': daysAgo(730),
    'End date': null,
    'Days since role Started': 730,
    'Group': '1st Demo Group',
  },
  {
    'First name': 'Emma',
    'Last name': 'Davis',
    'Membership number': '56789012',
    'Role/Accreditation': 'Group Scout Leader',
    'Start date': daysAgo(1095),
    'End date': null,
    'Days since role Started': 1095,
    'Group': '1st Demo Group',
  },
];

export const mockSuspensionRecords: SuspensionRecord[] = [
  {
    'First name': 'Frank',
    'Last name': 'Miller',
    'Membership number': '67890123',
    'Role': 'Assistant Section Leader',
    'Team': 'Beavers',
    'Unit name': '1st Demo Group',
    'Suspension date': daysAgo(30),
    'Suspension reason': 'Training non-compliance',
  },
];

export const mockTeamReviewRecords: TeamReviewRecord[] = [
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Role': 'Assistant Section Leader',
    'Team leader': 'Bob Smith',
    'Scheduled review date': daysFromNow(30),
    'Review overdue': 'No',
  },
  {
    'First name': 'Carol',
    'Last name': 'Williams',
    'Membership number': '34567890',
    'Role': 'Section Leader',
    'Team leader': 'Emma Davis',
    'Scheduled review date': daysAgo(45),
    'Review overdue': 'Yes',
  },
];

export const mockPermitRecords: PermitRecord[] = [
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '23456789',
    'Permit category': 'Nights Away',
    'Permit type': 'Indoor',
    'Permit status': 'Valid',
    'Permit expiry date': daysFromNow(180),
  },
  {
    'First name': 'Emma',
    'Last name': 'Davis',
    'Membership number': '56789012',
    'Permit category': 'Nights Away',
    'Permit type': 'Greenfield',
    'Permit status': 'Valid',
    'Permit expiry date': daysFromNow(365),
  },
  {
    'First name': 'Alice',
    'Last name': 'Johnson',
    'Membership number': '12345678',
    'Permit category': 'Water Activities',
    'Permit type': 'Kayaking',
    'Permit status': 'Expired',
    'Permit expiry date': daysAgo(30),
  },
];

export const mockAwardRecords: AwardRecord[] = [
  {
    'First name': 'Emma',
    'Last name': 'Davis',
    'Membership number': '56789012',
    'Accreditation': 'Wood Badge',
    'Role': 'Group Scout Leader',
  },
  {
    'First name': 'Bob',
    'Last name': 'Smith',
    'Membership number': '23456789',
    'Accreditation': 'Award for Merit',
    'Role': 'Section Leader',
  },
];

/**
 * Mock MemberLearningResult data for checkLearningByMembershipNumbers.
 * Covers the main First Response scenarios:
 *   Alice   – First Response valid (with expiry)
 *   Bob     – First Response expiring soon
 *   Carol   – First Response MISSING (joined 400 days ago → overdue)
 *   David   – First Response MISSING (joined 30 days ago → within 1 year)
 *   Emma    – First Response achieved with no expiry (permanent one-time module)
 *   Frank   – First Response MISSING (joined 500 days ago → overdue)
 *   Grace   – First Response MISSING (joined 14 days ago → within 1 year)
 */
export const mockMemberLearningResults: MemberLearningResult[] = [
  {
    membershipNumber: '12345678',
    contactId: 'contact-alice',
    firstName: 'Alice',
    lastName: 'Johnson',
    modules: [
      { title: 'First Response', expiryDate: apiDaysFromNow(365), currentLevel: 'Achieved skill' },
      { title: 'Safety', expiryDate: apiDaysFromNow(180), currentLevel: 'Achieved skill' },
      { title: 'Safeguarding', expiryDate: apiDaysFromNow(200), currentLevel: 'Achieved skill' },
      { title: 'GDPR', expiryDate: apiDaysFromNow(300), currentLevel: 'Achieved skill' },
    ],
  },
  {
    membershipNumber: '23456789',
    contactId: 'contact-bob',
    firstName: 'Bob',
    lastName: 'Smith',
    modules: [
      { title: 'First Response', expiryDate: apiDaysFromNow(25), currentLevel: 'Achieved skill' }, // Expiring
      { title: 'Safety', expiryDate: apiDaysFromNow(30), currentLevel: 'Achieved skill' },
      { title: 'Safeguarding', expiryDate: apiDaysFromNow(150), currentLevel: 'Achieved skill' },
    ],
  },
  {
    membershipNumber: '34567890',
    contactId: 'contact-carol',
    firstName: 'Carol',
    lastName: 'Williams',
    modules: [
      // No First Response – joined 400 days ago, overdue!
      { title: 'Safety', expiryDate: apiDaysAgo(15), currentLevel: 'Achieved skill' }, // Expired
      { title: 'Safeguarding', expiryDate: apiDaysFromNow(45), currentLevel: 'Achieved skill' },
    ],
  },
  {
    membershipNumber: '45678901',
    contactId: 'contact-david',
    firstName: 'David',
    lastName: 'Brown',
    modules: [
      // No First Response – joined 30 days ago, within 1 year
      { title: 'Safety', expiryDate: null, currentLevel: 'Not started' },
      { title: 'Safeguarding', expiryDate: null, currentLevel: 'Not started' },
    ],
  },
  {
    membershipNumber: '56789012',
    contactId: 'contact-emma',
    firstName: 'Emma',
    lastName: 'Davis',
    modules: [
      // First Response achieved as a permanent (no-expiry) module
      { title: 'First Response', expiryDate: null, currentLevel: 'Achieved skill' },
      { title: 'First Aid', expiryDate: apiDaysFromNow(365), currentLevel: 'Achieved skill' },
    ],
  },
  {
    membershipNumber: '67890123',
    contactId: 'contact-frank',
    firstName: 'Frank',
    lastName: 'Miller',
    modules: [
      // No First Response – joined 500 days ago, overdue!
      { title: 'First Aid', expiryDate: apiDaysAgo(60), currentLevel: 'Achieved skill' }, // Expired
    ],
  },
  {
    membershipNumber: '78901234',
    contactId: 'contact-grace',
    firstName: 'Grace',
    lastName: 'Wilson',
    modules: [
      // No First Response – joined 14 days ago, within 1 year
      { title: 'GDPR', expiryDate: null, currentLevel: 'Not started' },
    ],
  },
];
