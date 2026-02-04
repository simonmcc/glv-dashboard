/**
 * Authentication Service
 *
 * Uses Playwright to authenticate with the Scouts membership portal
 * and capture the Bearer token.
 */

import { chromium, Page } from 'playwright';

const SCOUTS_URL = 'https://membership.scouts.org.uk/';

export interface AuthResult {
  success: boolean;
  token?: string;
  contactId?: string;
  error?: string;
}

export interface MemberDisclosure {
  membershipNumber: string;
  contactId: string;
  firstName: string;
  lastName: string;
  disclosures: DisclosureDetail[];
}

export interface DisclosureDetail {
  disclosureId: string;
  status: string;
  authority: string;
  type: string;
  expiryDate: string | null;
  issueDate: string | null;
  country: string;
}

export interface ExploreResult {
  success: boolean;
  members?: MemberDisclosure[];
  error?: string;
}

export interface LearningModule {
  title: string;
  expiryDate: string | null;
  currentLevel: string;
}

export interface MemberLearning {
  membershipNumber: string;
  contactId: string;
  firstName: string;
  lastName: string;
  modules: LearningModule[];
}

export interface LearningResult {
  success: boolean;
  members?: MemberLearning[];
  error?: string;
}

async function handleCookieConsent(page: Page): Promise<void> {
  const cookieSelectors = [
    'button:has-text("Accept All")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    '#onetrust-accept-btn-handler',
  ];

  for (const selector of cookieSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      // Continue to next selector
    }
  }
}

async function performLogin(page: Page, username: string, password: string): Promise<void> {
  // Wait for the page to settle
  await page.waitForTimeout(3000);

  // Check if we're already on B2C or need to wait for redirect
  if (!page.url().includes('b2clogin.com')) {
    try {
      await page.waitForURL('**/b2clogin.com/**', { timeout: 30000 });
    } catch {
      // Check if we might already be logged in
      if (page.url().includes('membership.scouts.org.uk')) {
        const hasToken = await page.evaluate(() => {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.toLowerCase().includes('token')) return true;
          }
          return false;
        });
        if (hasToken) {
          return; // Already authenticated
        }
      }
      throw new Error('Failed to reach B2C login page');
    }
  }

  await page.waitForTimeout(2000);

  // Fill in email
  const emailSelectors = [
    'input[type="email"]',
    'input[name="logonIdentifier"]',
    'input[id="signInName"]',
  ];

  let emailFilled = false;
  for (const selector of emailSelectors) {
    const input = await page.$(selector);
    if (input) {
      await input.fill(username);
      emailFilled = true;
      break;
    }
  }

  if (!emailFilled) {
    throw new Error('Could not find email input field');
  }

  // Fill in password
  const passwordInput = await page.$('input[type="password"]');
  if (!passwordInput) {
    throw new Error('Could not find password input field');
  }
  await passwordInput.fill(password);

  // Click sign in button
  const submitSelectors = [
    'button[type="submit"]',
    'button:has-text("Sign in")',
    '#next',
  ];

  let submitted = false;
  for (const selector of submitSelectors) {
    const button = await page.$(selector);
    if (button) {
      await button.click();
      submitted = true;
      break;
    }
  }

  if (!submitted) {
    throw new Error('Could not find sign in button');
  }

  // Wait for redirect back to membership portal
  await page.waitForURL('**/membership.scouts.org.uk/**', { timeout: 60000 });
}

/**
 * Explore the API to discover member contact IDs and fetch disclosure details
 */
export async function exploreDisclosures(token: string, contactId: string): Promise<ExploreResult> {
  const API_BASE = 'https://tsa-memportal-prod-fun01.azurewebsites.net/api';

  const makeRequest = async (endpoint: string, body: unknown) => {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json, text/plain, */*',
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!text) return { error: 'Empty response' };
      return JSON.parse(text);
    } catch (err) {
      return { error: String(err) };
    }
  };

  try {
    console.log('[Explore] Starting disclosure exploration...');

    // First, try to find a view that has member contact IDs
    // Try MemberSearchView or similar
    const viewsToTry = [
      'MemberSearchView',
      'ContactView',
      'MemberView',
      'ContactSearchView',
      'HierarchyMembersView',
      'ContactHierarchyMembersView',
      'TeamMembersView',
      'RoleMembersView',
      'UnitMembersView',
      'GroupMembersView',
      'MemberRolesView',
      'ContactRolesView',
    ];

    let memberContactIds: Array<{ membershipNumber: string; contactId: string; firstName: string; lastName: string }> = [];

    for (const viewName of viewsToTry) {
      console.log(`[Explore] Trying view: ${viewName}`);
      const result = await makeRequest('/DataExplorer/GetResultsAsync', {
        table: viewName,
        query: '',
        selectFields: [],
        pageNo: 1,
        pageSize: 10,
        orderBy: '',
        order: null,
        distinct: true,
        isDashboardQuery: false,
        contactId: contactId,
        id: '',
        name: '',
      });

      if (result.data && result.data.length > 0) {
        console.log(`[Explore] ${viewName} SUCCESS - Fields:`, Object.keys(result.data[0]));
        console.log(`[Explore] Sample record:`, JSON.stringify(result.data[0]).substring(0, 500));

        // Check if this view has both membership number and contact ID
        const sample = result.data[0];
        const hasContactId = 'Contact ID' in sample || 'ContactId' in sample || 'contact_id' in sample || 'Id' in sample;
        const hasMembershipNumber = 'Membership number' in sample || 'MembershipNumber' in sample;

        if (hasContactId && hasMembershipNumber) {
          console.log(`[Explore] Found view with both contact ID and membership number: ${viewName}`);
          // Fetch all records
          const allRecords = await makeRequest('/DataExplorer/GetResultsAsync', {
            table: viewName,
            query: '',
            selectFields: [],
            pageNo: 1,
            pageSize: 500,
            orderBy: '',
            order: null,
            distinct: true,
            isDashboardQuery: false,
            contactId: contactId,
            id: '',
            name: '',
          });

          if (allRecords.data) {
            memberContactIds = allRecords.data.map((r: Record<string, unknown>) => ({
              membershipNumber: String(r['Membership number'] || r['MembershipNumber'] || ''),
              contactId: String(r['Contact ID'] || r['ContactId'] || r['Id'] || ''),
              firstName: String(r['First name'] || r['FirstName'] || ''),
              lastName: String(r['Last name'] || r['LastName'] || ''),
            }));
          }
          break;
        }
      } else {
        console.log(`[Explore] ${viewName} - no data or error:`, result.error || 'empty');
      }
    }

    // If we didn't find a view with contact IDs, try a few more approaches
    if (memberContactIds.length === 0) {
      console.log('[Explore] Trying DisclosureComplianceDashboardView...');
      const disclosureResult = await makeRequest('/DataExplorer/GetResultsAsync', {
        table: 'DisclosureComplianceDashboardView',
        query: '',
        selectFields: [],
        pageNo: 1,
        pageSize: 500, // Increase page size
        orderBy: '',
        order: null,
        distinct: true,
        isDashboardQuery: false,
        contactId: contactId,
        id: '',
        name: '',
      });

      console.log('[Explore] DisclosureComplianceDashboardView count:', disclosureResult.count);
      console.log('[Explore] DisclosureComplianceDashboardView data length:', disclosureResult.data?.length);

      if (disclosureResult.data && disclosureResult.data.length > 0) {
        console.log('[Explore] DisclosureComplianceDashboardView fields:', Object.keys(disclosureResult.data[0]));

        // Log all records to see who's included
        console.log('[Explore] All disclosure records:');
        for (const record of disclosureResult.data) {
          console.log(`  - ${record['First name']} ${record['Surname']}: ${record['Disclosure status']} (${record['Membership number']})`);
        }
      }

      // Also try without contactId to see if that changes results
      console.log('[Explore] Trying DisclosureComplianceDashboardView WITHOUT contactId...');
      const disclosureResultNoContact = await makeRequest('/DataExplorer/GetResultsAsync', {
        table: 'DisclosureComplianceDashboardView',
        query: '',
        selectFields: [],
        pageNo: 1,
        pageSize: 500,
        orderBy: '',
        order: null,
        distinct: true,
        isDashboardQuery: false,
        contactId: '', // Empty contactId
        id: '',
        name: '',
      });
      console.log('[Explore] Without contactId - count:', disclosureResultNoContact.count, 'data:', disclosureResultNoContact.data?.length);

      // Try with isDashboardQuery: true
      console.log('[Explore] Trying DisclosureComplianceDashboardView with isDashboardQuery=true...');
      const disclosureResultDashboard = await makeRequest('/DataExplorer/GetResultsAsync', {
        table: 'DisclosureComplianceDashboardView',
        query: '',
        selectFields: [],
        pageNo: 1,
        pageSize: 500,
        orderBy: '',
        order: null,
        distinct: true,
        isDashboardQuery: true, // Try dashboard mode
        contactId: contactId,
        id: '',
        name: '',
      });
      console.log('[Explore] With isDashboardQuery=true - count:', disclosureResultDashboard.count, 'data:', disclosureResultDashboard.data?.length);

      // Try getting member list from units we have access to
      console.log('[Explore] Trying to get members from ContactHierarchyUnitsView...');
      const unitsResult = await makeRequest('/DataExplorer/GetResultsAsync', {
        table: 'ContactHierarchyUnitsView',
        query: '',
        selectFields: [],
        pageNo: 1,
        pageSize: 50,
        orderBy: '',
        order: null,
        distinct: true,
        isDashboardQuery: false,
        contactId: contactId,
        id: '',
        name: '',
      });

      if (unitsResult.data && unitsResult.data.length > 0) {
        console.log('[Explore] ContactHierarchyUnitsView fields:', Object.keys(unitsResult.data[0]));
        console.log('[Explore] Units found:', unitsResult.data.length);

        // For each unit, try to get its members using GetTeamMembersAsync
        for (const unit of unitsResult.data.slice(0, 3)) {
          const unitId = unit.id || unit.Id;
          const unitName = unit.unitName || unit.UnitName;
          if (!unitId) continue;

          console.log(`[Explore] Trying GetTeamMembersAsync for unit: ${unitName} (${unitId})`);

          const teamMembersResult = await makeRequest('/GetTeamMembersAsync', {
            teamId: unitId,
          });

          if (teamMembersResult && !teamMembersResult.error) {
            console.log('[Explore] GetTeamMembersAsync result:', JSON.stringify(teamMembersResult).substring(0, 1000));

            // Check if it's an array with members
            if (Array.isArray(teamMembersResult) && teamMembersResult.length > 0) {
              console.log('[Explore] Member fields:', Object.keys(teamMembersResult[0]));
              console.log('[Explore] Sample member:', JSON.stringify(teamMembersResult[0]).substring(0, 500));
            }
          } else {
            console.log('[Explore] GetTeamMembersAsync error:', teamMembersResult?.error || 'unknown');
          }
        }
      } else {
        console.log('[Explore] ContactHierarchyUnitsView - no data or error:', unitsResult?.error || 'empty');
      }

      // Try GetMemberSearchResultsAsync
      console.log('[Explore] Trying GetMemberSearchResultsAsync...');
      const memberSearchResult = await makeRequest('/GetMemberSearchResultsAsync', {
        searchText: '',
        pageNo: 1,
        pageSize: 50,
      });
      if (memberSearchResult && !memberSearchResult.error) {
        console.log('[Explore] GetMemberSearchResultsAsync result:', JSON.stringify(memberSearchResult).substring(0, 1000));
      } else {
        console.log('[Explore] GetMemberSearchResultsAsync error:', memberSearchResult?.error || 'unknown');
      }

      // Try GetMembersAsync
      console.log('[Explore] Trying GetMembersAsync...');
      const membersResult = await makeRequest('/GetMembersAsync', {});
      if (membersResult && !membersResult.error) {
        console.log('[Explore] GetMembersAsync result:', JSON.stringify(membersResult).substring(0, 1000));
      } else {
        console.log('[Explore] GetMembersAsync error:', membersResult?.error || 'unknown');
      }

      // Try different query filters to get more disclosure statuses
      const queriesToTry = [
        { name: 'All statuses (no filter)', query: '' },
        { name: 'Disclosure Required', query: "Disclosure status eq 'Disclosure Required'" },
        { name: 'Status contains Required', query: "contains(Disclosure status, 'Required')" },
        { name: 'Status not Expired', query: "Disclosure status ne 'Disclosure Expired'" },
      ];

      for (const q of queriesToTry) {
        console.log(`[Explore] Trying query: ${q.name}`);
        const result = await makeRequest('/DataExplorer/GetResultsAsync', {
          table: 'DisclosureComplianceDashboardView',
          query: q.query,
          selectFields: [],
          pageNo: 1,
          pageSize: 100,
          orderBy: '',
          order: null,
          distinct: true,
          isDashboardQuery: false,
          contactId: contactId,
          id: '',
          name: '',
        });
        console.log(`[Explore] Query "${q.name}" - count: ${result.count}, data: ${result.data?.length}, error: ${result.error || 'none'}`);
        if (result.data && result.data.length > 0) {
          const statuses = [...new Set(result.data.map((r: Record<string, unknown>) => r['Disclosure status']))];
          console.log(`[Explore] Unique statuses found:`, statuses);
        }
      }

      // Also try DisclosureView (without Compliance/Dashboard)
      console.log('[Explore] Trying DisclosureView...');
      const disclosureViewResult = await makeRequest('/DataExplorer/GetResultsAsync', {
        table: 'DisclosureView',
        query: '',
        selectFields: [],
        pageNo: 1,
        pageSize: 100,
        orderBy: '',
        order: null,
        distinct: true,
        isDashboardQuery: false,
        contactId: contactId,
        id: '',
        name: '',
      });
      console.log('[Explore] DisclosureView - count:', disclosureViewResult.count, 'data:', disclosureViewResult.data?.length, 'error:', disclosureViewResult.error || 'none');
      if (disclosureViewResult.data && disclosureViewResult.data.length > 0) {
        console.log('[Explore] DisclosureView fields:', Object.keys(disclosureViewResult.data[0]));
      }

      // Try RoleDisclosureView
      console.log('[Explore] Trying RoleDisclosureView...');
      const roleDisclosureResult = await makeRequest('/DataExplorer/GetResultsAsync', {
        table: 'RoleDisclosureView',
        query: '',
        selectFields: [],
        pageNo: 1,
        pageSize: 100,
        orderBy: '',
        order: null,
        distinct: true,
        isDashboardQuery: false,
        contactId: contactId,
        id: '',
        name: '',
      });
      console.log('[Explore] RoleDisclosureView - count:', roleDisclosureResult.count, 'data:', roleDisclosureResult.data?.length, 'error:', roleDisclosureResult.error || 'none');
    }

    // Now fetch disclosures for each member using SAS tokens
    const members: MemberDisclosure[] = [];

    for (const member of memberContactIds.slice(0, 10)) { // Limit to 10 for testing
      if (!member.contactId) continue;

      console.log(`[Explore] Fetching disclosures for ${member.firstName} ${member.lastName} (${member.contactId})`);

      // Generate SAS token
      const sasResult = await makeRequest('/GenerateSASTokenAsync', {
        table: 'Disclosures',
        partitionkey: member.contactId,
        permissions: 'R',
      });

      if (sasResult.token) {
        // Fetch from Table Storage
        try {
          const storageResponse = await fetch(sasResult.token, {
            headers: { 'Accept': 'application/json' },
          });
          const storageData = await storageResponse.json();

          const disclosures: DisclosureDetail[] = (storageData.value || []).map((d: Record<string, unknown>) => ({
            disclosureId: String(d.DisclosureId || ''),
            status: String(d.Status || ''),
            authority: String(d.DisclosureAuthority || ''),
            type: String(d.DisclosureType || ''),
            expiryDate: d.ExpiryDate as string | null,
            issueDate: d.IssueDate as string | null,
            country: String(d.Country || ''),
          }));

          members.push({
            membershipNumber: member.membershipNumber,
            contactId: member.contactId,
            firstName: member.firstName,
            lastName: member.lastName,
            disclosures,
          });

          console.log(`[Explore] Got ${disclosures.length} disclosures for ${member.firstName}`);
        } catch (err) {
          console.error(`[Explore] Failed to fetch disclosures for ${member.contactId}:`, err);
        }
      }
    }

    return { success: true, members };
  } catch (error) {
    console.error('[Explore] Error:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Scrape disclosure data for specific members by navigating to their pages
 * This captures the SAS tokens generated when viewing each member's disclosure page
 */
export async function scrapeDisclosures(
  username: string,
  password: string,
  memberContactIds: string[]
): Promise<ExploreResult> {
  console.log(`[Scrape] Starting disclosure scrape for ${memberContactIds.length} members`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-GB',
  });

  const page = await context.newPage();

  // Hide webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Capture SAS tokens and disclosure data from network requests
  const disclosureData: Map<string, { sasToken: string; data?: unknown[] }> = new Map();
  let capturedToken: string | null = null;

  page.on('request', (request) => {
    const authHeader = request.headers()['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ') && request.url().includes('tsa-memportal-prod-fun01')) {
      capturedToken = authHeader.replace('Bearer ', '');
    }
  });

  page.on('response', async (response) => {
    const url = response.url();

    // Capture SAS token responses
    if (url.includes('GenerateSASTokenAsync')) {
      try {
        const data = await response.json();
        if (data.token && data.token.includes('Disclosures')) {
          // Extract partition key (contact ID) from the SAS URL
          const match = data.token.match(/spk=([^&]+)/);
          if (match) {
            const contactId = match[1];
            console.log(`[Scrape] Captured SAS token for contact: ${contactId}`);
            disclosureData.set(contactId, { sasToken: data.token });
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Capture Table Storage responses
    if (url.includes('tsauksprodasa001.table.core.windows.net/Disclosures')) {
      try {
        const data = await response.json();
        const match = url.match(/spk=([^&]+)/);
        if (match && data.value) {
          const contactId = match[1];
          console.log(`[Scrape] Captured disclosure data for contact: ${contactId}, records: ${data.value.length}`);
          const existing = disclosureData.get(contactId) || { sasToken: '' };
          existing.data = data.value;
          disclosureData.set(contactId, existing);
        }
      } catch {
        // Ignore parse errors
      }
    }
  });

  try {
    // Navigate to the portal and login
    console.log('[Scrape] Navigating to portal...');
    await page.goto(SCOUTS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Handle cookie consent
    await handleCookieConsent(page);

    // Perform login
    console.log('[Scrape] Logging in...');
    await performLogin(page, username, password);
    await page.waitForTimeout(3000);

    // Wait for initial load
    await page.waitForTimeout(5000);
    console.log('[Scrape] Login complete');

    // Now navigate to each member's disclosure page
    const members: MemberDisclosure[] = [];

    for (const contactId of memberContactIds) {
      console.log(`[Scrape] Navigating to member ${contactId}...`);

      const memberUrl = `https://membership.scouts.org.uk/#/membersearch/${contactId}/viewmember/disclosures`;
      await page.goto(memberUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for the page to load and make API calls
      await page.waitForTimeout(5000);

      // Try to get member name from the page
      let firstName = '';
      let lastName = '';
      let membershipNumber = '';

      try {
        // Try to extract member info from the page
        const memberInfo = await page.evaluate(() => {
          // Look for member name in various places
          const nameEl = document.querySelector('h1, h2, .member-name, [class*="name"]');
          const name = nameEl?.textContent?.trim() || '';

          // Look for membership number
          const memberNumEl = document.querySelector('[class*="membership"], [class*="member-number"]');
          const memberNum = memberNumEl?.textContent?.replace(/[^0-9]/g, '') || '';

          return { name, memberNum };
        });

        if (memberInfo.name) {
          const parts = memberInfo.name.split(' ');
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || '';
        }
        membershipNumber = memberInfo.memberNum;
      } catch {
        console.log(`[Scrape] Could not extract member info from page for ${contactId}`);
      }

      // Check if we captured disclosure data for this member
      const captured = disclosureData.get(contactId);
      if (captured?.data) {
        const disclosures: DisclosureDetail[] = captured.data.map((d: Record<string, unknown>) => ({
          disclosureId: String(d.DisclosureId || ''),
          status: String(d.Status || ''),
          authority: String(d.DisclosureAuthority || ''),
          type: String(d.DisclosureType || ''),
          expiryDate: d.ExpiryDate as string | null,
          issueDate: d.IssueDate as string | null,
          country: String(d.Country || ''),
        }));

        // Get name from disclosure data if not from page
        if (!firstName && captured.data.length > 0) {
          const firstRecord = captured.data[0] as Record<string, unknown>;
          const fullName = String(firstRecord.DisclosureContactName || firstRecord.Name || '');
          const parts = fullName.split(' ');
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || '';
        }

        members.push({
          membershipNumber,
          contactId,
          firstName,
          lastName,
          disclosures,
        });

        console.log(`[Scrape] Got ${disclosures.length} disclosures for ${firstName} ${lastName}`);
      } else {
        console.log(`[Scrape] No disclosure data captured for ${contactId}`);
      }
    }

    console.log(`[Scrape] Completed. Found disclosures for ${members.length} members`);
    return { success: true, members };

  } catch (error) {
    console.error('[Scrape] Error:', error);
    return { success: false, error: (error as Error).message };
  } finally {
    await browser.close();
  }
}

const API_BASE = 'https://tsa-memportal-prod-fun01.azurewebsites.net/api';

/**
 * Search for a member by membership number using MemberListingAsync
 */
async function searchMemberByNumber(
  token: string,
  membershipNumber: string
): Promise<{ id: string; fullname: string; firstname: string; lastname: string; preferredName: string } | null> {
  try {
    const response = await fetch(`${API_BASE}/MemberListingAsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        pagesize: 10,
        nexttoken: 1,
        filter: {
          global: '',
          globaland: false,
          fieldand: true,
          filterfields: [
            {
              field: 'membershipnumber',
              value: membershipNumber,
            },
          ],
        },
        isSuspended: false,
      }),
    });

    const data = await response.json();
    if (data.data && data.data.length > 0) {
      const member = data.data[0];
      // Use PreferredName if available, otherwise fall back to firstname
      const preferredName = member.PreferredName?.trim() || member.firstname?.trim() || '';
      return {
        id: member.id,
        fullname: member.fullname,
        firstname: member.firstname,
        lastname: member.lastname,
        preferredName,
      };
    }
    return null;
  } catch (error) {
    console.error(`[API] Search failed for ${membershipNumber}:`, error);
    return null;
  }
}

/**
 * Get disclosures for a contact ID using SAS token
 */
async function getDisclosuresForContact(
  token: string,
  contactId: string
): Promise<DisclosureDetail[]> {
  try {
    // Generate SAS token
    const sasResponse = await fetch(`${API_BASE}/GenerateSASTokenAsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        table: 'Disclosures',
        partitionkey: contactId,
      }),
    });

    const sasData = await sasResponse.json();
    if (!sasData.token) {
      console.log(`[API] No SAS token for contact ${contactId}`);
      return [];
    }

    // Fetch from Table Storage
    const storageResponse = await fetch(sasData.token, {
      headers: {
        Accept: 'application/json;odata=nometadata',
      },
    });

    const storageData = await storageResponse.json();
    const records = storageData.value || [];

    return records.map((d: Record<string, unknown>) => ({
      disclosureId: String(d.DisclosureId || ''),
      status: String(d.Status || ''),
      authority: String(d.DisclosureAuthority || d.Nation || ''),
      type: String(d.DisclosureType || ''),
      expiryDate: (d.ExpiryDate as string) || null,
      issueDate: (d.IssueDate as string) || null,
      country: String(d.Country || d.Nation || ''),
    }));
  } catch (error) {
    console.error(`[API] Failed to get disclosures for ${contactId}:`, error);
    return [];
  }
}

/**
 * Check disclosures for a list of membership numbers
 * Uses MemberListingAsync to find contact IDs, then fetches disclosures
 */
export async function checkDisclosuresByMembershipNumbers(
  token: string,
  membershipNumbers: string[]
): Promise<ExploreResult> {
  console.log(`[Disclosures] Checking ${membershipNumbers.length} membership numbers`);

  const members: MemberDisclosure[] = [];

  for (const membershipNumber of membershipNumbers) {
    console.log(`[Disclosures] Looking up ${membershipNumber}...`);

    // Search for member
    const member = await searchMemberByNumber(token, membershipNumber);
    if (!member) {
      console.log(`[Disclosures] Member not found: ${membershipNumber}`);
      members.push({
        membershipNumber,
        contactId: '',
        firstName: '',
        lastName: '',
        disclosures: [],
      });
      continue;
    }

    console.log(`[Disclosures] Found ${member.preferredName} ${member.lastname} (${member.id})`);

    // Get disclosures
    const disclosures = await getDisclosuresForContact(token, member.id);
    console.log(`[Disclosures] Got ${disclosures.length} disclosure records`);

    members.push({
      membershipNumber,
      contactId: member.id,
      firstName: member.preferredName,
      lastName: member.lastname,
      disclosures,
    });
  }

  return { success: true, members };
}

/**
 * Get learning details for a contact ID using GetLmsDetailsAsync
 */
async function getLearningForContact(
  token: string,
  contactId: string
): Promise<LearningModule[]> {
  try {
    const response = await fetch(`${API_BASE}/GetLmsDetailsAsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contactid: contactId,
      }),
    });

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.log(`[API] Unexpected response for learning: ${JSON.stringify(data).substring(0, 200)}`);
      return [];
    }

    return data.map((m: Record<string, unknown>) => ({
      title: String(m.title || ''),
      expiryDate: m.expiryDate ? String(m.expiryDate) : null,
      currentLevel: String(m.currentLevel || ''),
    }));
  } catch (error) {
    console.error(`[API] Failed to get learning for ${contactId}:`, error);
    return [];
  }
}

/**
 * Check learning for a list of membership numbers
 * Uses MemberListingAsync to find contact IDs, then fetches learning via GetLmsDetailsAsync
 */
export async function checkLearningByMembershipNumbers(
  token: string,
  membershipNumbers: string[]
): Promise<LearningResult> {
  console.log(`[Learning] Checking ${membershipNumbers.length} membership numbers`);

  const members: MemberLearning[] = [];

  for (const membershipNumber of membershipNumbers) {
    console.log(`[Learning] Looking up ${membershipNumber}...`);

    // Search for member
    const member = await searchMemberByNumber(token, membershipNumber);
    if (!member) {
      console.log(`[Learning] Member not found: ${membershipNumber}`);
      members.push({
        membershipNumber,
        contactId: '',
        firstName: '',
        lastName: '',
        modules: [],
      });
      continue;
    }

    console.log(`[Learning] Found ${member.preferredName} ${member.lastname} (${member.id})`);

    // Get learning details
    const modules = await getLearningForContact(token, member.id);
    console.log(`[Learning] Got ${modules.length} learning modules`);

    members.push({
      membershipNumber,
      contactId: member.id,
      firstName: member.preferredName,
      lastName: member.lastname,
      modules,
    });
  }

  return { success: true, members };
}

export async function authenticate(username: string, password: string): Promise<AuthResult> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-GB',
  });

  const page = await context.newPage();

  // Hide webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Capture Bearer token from network requests to the API domain
  let capturedToken: string | null = null;

  page.on('request', (request) => {
    const authHeader = request.headers()['authorization'];
    // Only capture tokens from requests to the Scouts API
    if (authHeader && authHeader.startsWith('Bearer ') && request.url().includes('tsa-memportal-prod-fun01')) {
      capturedToken = authHeader.replace('Bearer ', '');
      console.log('[Auth] Captured token from:', request.url());
    }
  });

  try {
    // Navigate to the portal
    await page.goto(SCOUTS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Handle cookie consent
    await handleCookieConsent(page);

    // Perform login
    await performLogin(page, username, password);
    await page.waitForTimeout(2000);

    // Wait for portal to fully load and make initial API calls
    await page.waitForTimeout(5000);

    if (!capturedToken) {
      throw new Error('Failed to capture Bearer token');
    }

    // Get contact ID by making a request
    let contactId: string | undefined;
    try {
      const contactResponse = await page.evaluate(async (token) => {
        const response = await fetch('https://tsa-memportal-prod-fun01.azurewebsites.net/api/GetContactDetailAsync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });
        return response.json();
      }, capturedToken);

      contactId = contactResponse.id;
      console.log('[Auth] Got contactId from browser context:', contactId);

      // Test: Try simpler query first (ContactHierarchyUnitsView - used by scraper)
      const unitsResponse = await fetch('https://tsa-memportal-prod-fun01.azurewebsites.net/api/DataExplorer/GetResultsAsync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${capturedToken}`,
          'Accept': 'application/json, text/plain, */*',
        },
        body: JSON.stringify({
          table: 'ContactHierarchyUnitsView',
          query: '',
          selectFields: ['Id', 'UnitName'],
          pageNo: 1,
          pageSize: 10,
          orderBy: 'UnitName',
          order: 'asc',
          distinct: true,
          isDashboardQuery: false,
          contactId: contactId,
          id: '',
          name: '',
        }),
      });
      const unitsQuery = await unitsResponse.json();
      console.log('[Auth] Units query (Node.js):', JSON.stringify(unitsQuery).substring(0, 300));

      // Test: Try LearningComplianceDashboardView with exact scraper parameters
      const learningResponse = await fetch('https://tsa-memportal-prod-fun01.azurewebsites.net/api/DataExplorer/GetResultsAsync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${capturedToken}`,
          'Accept': 'application/json, text/plain, */*',
        },
        body: JSON.stringify({
          table: 'LearningComplianceDashboardView',
          query: '',
          selectFields: ['FirstName', 'LastName', 'MembershipNumber', 'Name', 'Status', 'ExpiryDate'],
          pageNo: 1,
          pageSize: 200,
          orderBy: '',
          order: null,
          distinct: true,
          isDashboardQuery: false,
          contactId: contactId,
          id: '',
          name: '',
        }),
      });
      const learningQuery = await learningResponse.json();
      console.log('[Auth] Learning query (Node.js):', JSON.stringify(learningQuery).substring(0, 300));
    } catch (err) {
      console.error('[Auth] Error in browser context:', err);
      // Contact ID fetch failed, but we have the token
    }

    console.log(`[Auth] Returning token - length: ${capturedToken.length}, starts: ${capturedToken.substring(0, 20)}..., ends: ...${capturedToken.substring(capturedToken.length - 20)}`);

    return {
      success: true,
      token: capturedToken,
      contactId,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  } finally {
    await browser.close();
  }
}
