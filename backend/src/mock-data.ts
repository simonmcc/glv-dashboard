/**
 * Mock data for testing the dashboard without hitting the real API.
 * Enable with MOCK_MODE=true environment variable.
 */

// Sample member data
const mockMembers = [
  { membershipNumber: '1000001', contactId: 'contact-001', firstName: 'Alice', lastName: 'Smith' },
  { membershipNumber: '1000002', contactId: 'contact-002', firstName: 'Bob', lastName: 'Jones' },
  { membershipNumber: '1000003', contactId: 'contact-003', firstName: 'Charlie', lastName: 'Brown' },
  { membershipNumber: '1000004', contactId: 'contact-004', firstName: 'Diana', lastName: 'Wilson' },
  { membershipNumber: '1000005', contactId: 'contact-005', firstName: 'Eve', lastName: 'Taylor' },
  { membershipNumber: '1000006', contactId: 'contact-006', firstName: 'Frank', lastName: 'Anderson' },
  { membershipNumber: '1000007', contactId: 'contact-007', firstName: 'Grace', lastName: 'Thomas' },
  { membershipNumber: '1000008', contactId: 'contact-008', firstName: 'Henry', lastName: 'Jackson' },
];

// Generate dates relative to now
const now = new Date();
const daysFromNow = (days: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};
const daysAgo = (days: number) => daysFromNow(-days);

// Learning compliance records
export function getMockLearningCompliance() {
  const learningTypes = ['Safety', 'Safeguarding', 'First Aid', 'GDPR'];
  const statuses = ['Valid', 'Expiring', 'Expired', 'In-Progress', 'Not Started'];

  const records = [];
  for (const member of mockMembers) {
    for (const learning of learningTypes) {
      const statusIndex = Math.floor(Math.random() * statuses.length);
      const status = statuses[statusIndex];
      let expiryDate = null;

      if (status === 'Valid') expiryDate = daysFromNow(180 + Math.floor(Math.random() * 365));
      else if (status === 'Expiring') expiryDate = daysFromNow(Math.floor(Math.random() * 30));
      else if (status === 'Expired') expiryDate = daysAgo(Math.floor(Math.random() * 90));

      records.push({
        'First name': member.firstName,
        'Last name': member.lastName,
        'Membership number': member.membershipNumber,
        'Name': learning,
        'Status': status,
        'Expiry date': expiryDate,
        'Start date': daysAgo(365 + Math.floor(Math.random() * 730)),
      });
    }
  }
  return { data: records, nextPage: null, count: records.length, error: null };
}

// Learning details (for checkLearningByMembershipNumbers)
export function getMockLearningDetails(membershipNumbers: string[]) {
  const modules = [
    { title: 'Safety', currentLevel: 'Achieved skill' },
    { title: 'Safeguarding', currentLevel: 'Achieved skill' },
    { title: 'First Aid', currentLevel: 'Achieved skill' },
    { title: 'GDPR', currentLevel: 'Achieved skill' },
  ];

  const members = membershipNumbers.map((num, idx) => {
    const member = mockMembers.find(m => m.membershipNumber === num) || {
      membershipNumber: num,
      contactId: `contact-${num}`,
      firstName: `Member`,
      lastName: `${num}`,
    };

    return {
      membershipNumber: member.membershipNumber,
      contactId: member.contactId,
      firstName: member.firstName,
      lastName: member.lastName,
      modules: modules.map(m => ({
        title: m.title,
        currentLevel: m.currentLevel,
        expiryDate: idx % 3 === 0 ? null : `${(Math.floor(Math.random() * 12) + 1).toString().padStart(2, '0')}/15/${2025 + Math.floor(Math.random() * 3)} 00:00:00`,
      })),
    };
  });

  return { success: true, members };
}

// Joining journey records
export function getMockJoiningJourney() {
  const items = [
    'signDeclaration',
    'referenceRequest',
    'welcomeConversation',
    'getCriminalRecordCheck',
    'coreLearning',
  ];

  const records = [];
  // Only some members have outstanding items
  for (const member of mockMembers.slice(0, 4)) {
    const numItems = 1 + Math.floor(Math.random() * 3);
    const memberItems = items.slice(0, numItems);

    for (const item of memberItems) {
      records.push({
        'First name': member.firstName,
        'Last name': member.lastName,
        'Membership number': member.membershipNumber,
        'Category key': item,
        'On boarding action status': 'Outstanding',
        'Due date': daysFromNow(30 + Math.floor(Math.random() * 60)),
        'Completed date': null,
      });
    }
  }
  return { data: records, nextPage: null, count: records.length, error: null };
}

// Disclosure compliance records
export function getMockDisclosureCompliance() {
  const authorities = ['DBS', 'AccessNI', 'PVG'];
  const statuses = ['Disclosure Valid', 'Disclosure Expired', 'Pending'];

  const records = mockMembers.map((member, idx) => {
    const status = statuses[idx % statuses.length];
    let expiryDate = null;
    let daysExpired = null;

    if (status === 'Disclosure Valid') expiryDate = daysFromNow(365 + Math.floor(Math.random() * 730));
    else if (status === 'Disclosure Expired') {
      expiryDate = daysAgo(30 + Math.floor(Math.random() * 180));
      daysExpired = Math.floor(Math.random() * 180);
    }

    return {
      'First name': member.firstName,
      'Surname': member.lastName,
      'Membership number': member.membershipNumber,
      'Communication email': `${member.firstName.toLowerCase()}.${member.lastName.toLowerCase()}@example.com`,
      'Unit name': 'Test Scout Group',
      'Disclosure authority': authorities[idx % authorities.length],
      'Disclosure status': status,
      'Disclosure issue date': daysAgo(365 + Math.floor(Math.random() * 730)),
      'Disclosure expiry date': expiryDate,
      'Days since expiry': daysExpired,
      'Role': 'Section Leader',
      'Team': 'Scouts',
    };
  });
  return { data: records, nextPage: null, count: records.length, error: null };
}

// Appointments records
export function getMockAppointments() {
  const roles = ['Section Leader', 'Assistant Leader', 'Group Scout Leader', 'District Commissioner'];

  const records = mockMembers.map((member, idx) => ({
    'First name': member.firstName,
    'Last name': member.lastName,
    'Membership number': member.membershipNumber,
    'Role/Accreditation': roles[idx % roles.length],
    'Start date': daysAgo(365 + Math.floor(Math.random() * 1825)),
    'End date': null,
    'Days since role Started': 365 + Math.floor(Math.random() * 1825),
    'Communication email': `${member.firstName.toLowerCase()}.${member.lastName.toLowerCase()}@example.com`,
    'Group': 'Test Scout Group',
    'District': 'Test District',
    'EDI': idx % 3 === 0 ? '0' : '1',
  }));
  return { data: records, nextPage: null, count: records.length, error: null };
}

// Suspensions records
export function getMockSuspensions() {
  // Only 1-2 members suspended
  const suspendedMembers = mockMembers.slice(0, 1);

  const records = suspendedMembers.map(member => ({
    'First name': member.firstName,
    'Last name': member.lastName,
    'Membership number': member.membershipNumber,
    'Role': 'Section Leader',
    'Team': 'Scouts',
    'Unit name': 'Test Scout Group',
    'Suspension date': daysAgo(30 + Math.floor(Math.random() * 60)),
    'Suspension reason': 'Pending investigation',
    'Communication email': `${member.firstName.toLowerCase()}.${member.lastName.toLowerCase()}@example.com`,
  }));
  return { data: records, nextPage: null, count: records.length, error: null };
}

// Team reviews records
export function getMockTeamReviews() {
  const records = mockMembers.map((member, idx) => ({
    'First name': member.firstName,
    'Last name': member.lastName,
    'Membership number': member.membershipNumber,
    'Role': 'Section Leader',
    'Team leader': `${mockMembers[(idx + 1) % mockMembers.length].firstName} ${mockMembers[(idx + 1) % mockMembers.length].lastName}`,
    'Scheduled review date': idx % 3 === 0 ? daysAgo(30) : daysFromNow(60 + Math.floor(Math.random() * 180)),
    'Review overdue': idx % 3 === 0 ? 'Yes' : 'No',
    'Group': 'Test Scout Group',
    'District': 'Test District',
  }));
  return { data: records, nextPage: null, count: records.length, error: null };
}

// Permits records
export function getMockPermits() {
  const categories = ['Nights Away', 'Water Activities', 'Climbing'];
  const statuses = ['Valid', 'Expired', 'Pending'];

  // Only some members have permits
  const membersWithPermits = mockMembers.slice(0, 5);

  const records = membersWithPermits.map((member, idx) => ({
    'First name': member.firstName,
    'Last name': member.lastName,
    'Membership number': member.membershipNumber,
    'Permit category': categories[idx % categories.length],
    'Permit type': 'Full',
    'Permit status': statuses[idx % statuses.length],
    'Permit expiry date': statuses[idx % statuses.length] === 'Valid'
      ? daysFromNow(180 + Math.floor(Math.random() * 365))
      : statuses[idx % statuses.length] === 'Expired'
        ? daysAgo(30 + Math.floor(Math.random() * 90))
        : null,
    'Permit restriction details': null,
    'Unit name': 'Test Scout Group',
    'Team': 'Scouts',
    'Communication email': `${member.firstName.toLowerCase()}.${member.lastName.toLowerCase()}@example.com`,
  }));
  return { data: records, nextPage: null, count: records.length, error: null };
}

// Awards records
export function getMockAwards() {
  const accreditations = ['Wood Badge', 'Award for Merit', 'Silver Acorn', 'Chief Scout Commendation'];

  // Only some members have awards
  const membersWithAwards = mockMembers.slice(0, 4);

  const records = membersWithAwards.map((member, idx) => ({
    'First name': member.firstName,
    'Last name': member.lastName,
    'Membership number': member.membershipNumber,
    'Accreditation': accreditations[idx % accreditations.length],
    'Role': 'Section Leader',
    'Team': 'Scouts',
    'Unit name': 'Test Scout Group',
    'Contact number': '07700 900000',
    'Communication email': `${member.firstName.toLowerCase()}.${member.lastName.toLowerCase()}@example.com`,
  }));
  return { data: records, nextPage: null, count: records.length, error: null };
}

// Mock authentication
export function getMockAuth() {
  return {
    success: true,
    token: 'mock-token-' + Date.now(),
    contactId: 'mock-contact-id',
  };
}

// Get mock data for proxy endpoint based on table name
export function getMockProxyResponse(tableName: string) {
  switch (tableName) {
    case 'LearningComplianceDashboardView':
      return getMockLearningCompliance();
    case 'InProgressActionDashboardView':
      return getMockJoiningJourney();
    case 'DisclosureComplianceDashboardView':
      return getMockDisclosureCompliance();
    case 'AppointmentsDashboardView':
      return getMockAppointments();
    case 'SuspensionDashboardView':
      return getMockSuspensions();
    case 'TeamDirectoryReviewsDashboardView':
      return getMockTeamReviews();
    case 'PermitsDashboardView':
      return getMockPermits();
    case 'PreloadedAwardsDashboardView':
      return getMockAwards();
    default:
      return { data: [], nextPage: null, count: 0, error: `Unknown table: ${tableName}` };
  }
}
