/**
 * Check Disclosures Script
 *
 * Takes a list of membership numbers and checks their disclosure status.
 *
 * Usage: npm run check-disclosures
 *
 * Environment variables:
 *   SCOUT_USERNAME - Scouts membership email
 *   SCOUT_PASSWORD - Scouts membership password
 *   MEMBERSHIP_NUMBERS - Comma-separated list of membership numbers to check
 */

import { chromium, Browser, Page } from 'playwright';

const SCOUTS_URL = 'https://membership.scouts.org.uk/';
const API_BASE = 'https://tsa-memportal-prod-fun01.azurewebsites.net/api';

interface MemberSearchResult {
  id: string;
  membershipnumber: string;
  fullname: string;
  firstname: string;
  lastname: string;
  unitName: string;
  Role: string;
}

interface DisclosureRecord {
  PartitionKey: string;
  RowKey: string;
  DisclosureId: string;
  Status: string;
  DisclosureAuthority: string;
  DisclosureType: string;
  ExpiryDate: string | null;
  IssueDate: string | null;
  Country: string;
  Nation: string;
  DisclosureContactName?: string;
}

interface MemberDisclosureReport {
  membershipNumber: string;
  contactId: string;
  name: string;
  disclosures: {
    status: string;
    authority: string;
    type: string;
    nation: string;
    expiryDate: string | null;
    issueDate: string | null;
  }[];
  summary: string;
}

// Captured auth token
let authToken: string | null = null;

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
      // Continue trying
    }
  }
}

async function authenticate(page: Page, username: string, password: string): Promise<boolean> {
  console.log('🔐 Authenticating...');

  await page.goto(SCOUTS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await handleCookieConsent(page);

  try {
    await page.waitForURL(/b2clogin\.com/, { timeout: 30000 });
    await handleCookieConsent(page);

    // Fill login form
    await page.waitForSelector('input#signInName, input[type="email"]', { timeout: 15000 });

    const emailInput = await page.$('input#signInName') || await page.$('input[type="email"]');
    if (emailInput) {
      await emailInput.fill(username);
    }

    const passwordInput = await page.$('input#password') || await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.fill(password);
    }

    const submitButton = await page.$('button#next') || await page.$('button[type="submit"]');
    if (submitButton) {
      await submitButton.click();
    }

    await page.waitForURL(/membership\.scouts\.org\.uk/, { timeout: 60000 });
    await page.waitForTimeout(5000);

    console.log('✅ Authentication successful');
    return true;
  } catch (error) {
    console.error('❌ Authentication failed:', error);
    return false;
  }
}

async function searchMemberByNumber(
  page: Page,
  membershipNumber: string
): Promise<MemberSearchResult | null> {
  console.log(`🔍 Searching for membership number: ${membershipNumber}`);

  try {
    const response = await page.evaluate(
      async ({ apiBase, membershipNumber, token }) => {
        const res = await fetch(`${apiBase}/MemberListingAsync`, {
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
        return res.json();
      },
      { apiBase: API_BASE, membershipNumber, token: authToken }
    );

    if (response.data && response.data.length > 0) {
      const member = response.data[0];
      console.log(`   Found: ${member.fullname} (${member.id})`);
      return member;
    }

    console.log(`   ⚠️ No member found`);
    return null;
  } catch (error) {
    console.error(`   ❌ Search failed:`, error);
    return null;
  }
}

async function getDisclosures(
  page: Page,
  contactId: string
): Promise<DisclosureRecord[]> {
  console.log(`📋 Fetching disclosures for contact: ${contactId}`);

  try {
    // First, get the SAS token
    const sasResponse = await page.evaluate(
      async ({ apiBase, contactId, token }) => {
        const res = await fetch(`${apiBase}/GenerateSASTokenAsync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tableName: 'Disclosures',
            partitionKey: contactId,
          }),
        });
        return res.json();
      },
      { apiBase: API_BASE, contactId, token: authToken }
    );

    if (!sasResponse.token) {
      console.log('   ⚠️ No SAS token returned');
      return [];
    }

    // Now fetch from Table Storage
    const disclosureResponse = await page.evaluate(async (sasUrl: string) => {
      const res = await fetch(sasUrl, {
        headers: {
          Accept: 'application/json;odata=nometadata',
        },
      });
      return res.json();
    }, sasResponse.token);

    const records = disclosureResponse.value || [];
    console.log(`   Found ${records.length} disclosure record(s)`);
    return records;
  } catch (error) {
    console.error(`   ❌ Failed to fetch disclosures:`, error);
    return [];
  }
}

function summarizeDisclosures(disclosures: DisclosureRecord[]): string {
  if (disclosures.length === 0) {
    return '⚠️ NO DISCLOSURE RECORDS';
  }

  const statuses = disclosures.map((d) => d.Status?.toLowerCase() || 'unknown');

  if (statuses.some((s) => s === 'valid' || s === 'clear')) {
    return '✅ VALID';
  }
  if (statuses.every((s) => s === 'expired')) {
    return '🔴 EXPIRED';
  }
  if (statuses.some((s) => s === 'required')) {
    return '🟡 REQUIRED';
  }
  if (statuses.some((s) => s === 'pending' || s === 'in progress')) {
    return '🟠 PENDING';
  }

  return `❓ ${statuses.join(', ')}`;
}

async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('  Disclosure Check Tool');
  console.log('═'.repeat(60));

  const username = process.env.SCOUT_USERNAME;
  const password = process.env.SCOUT_PASSWORD;
  const membershipNumbersEnv = process.env.MEMBERSHIP_NUMBERS;

  if (!username || !password) {
    console.error('❌ SCOUT_USERNAME and SCOUT_PASSWORD environment variables required');
    process.exit(1);
  }

  // Parse membership numbers from env or use defaults for testing
  const membershipNumbers = membershipNumbersEnv
    ? membershipNumbersEnv.split(',').map((n) => n.trim())
    : ['0012162494']; // Default test number

  console.log(`\n📋 Checking ${membershipNumbers.length} membership number(s)\n`);

  const headless = process.env.HEADLESS !== 'false';
  console.log(`🚀 Launching browser (headless: ${headless})...`);

  const browser: Browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // Capture auth token from requests
  page.on('request', (request) => {
    const authHeader = request.headers()['authorization'];
    if (authHeader?.startsWith('Bearer ') && request.url().includes('tsa-memportal-prod')) {
      authToken = authHeader.replace('Bearer ', '');
    }
  });

  try {
    // Authenticate
    const authSuccess = await authenticate(page, username, password);
    if (!authSuccess) {
      console.error('❌ Authentication failed');
      process.exit(1);
    }

    // Navigate to trigger API calls and capture token
    console.log('\n⏳ Capturing auth token...');
    await page.goto('https://membership.scouts.org.uk/#/membersearch', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (!authToken) {
      console.error('❌ Failed to capture auth token');
      process.exit(1);
    }
    console.log('✅ Auth token captured\n');

    // Process each membership number
    const reports: MemberDisclosureReport[] = [];

    for (const membershipNumber of membershipNumbers) {
      console.log('\n' + '─'.repeat(50));

      const member = await searchMemberByNumber(page, membershipNumber);
      if (!member) {
        reports.push({
          membershipNumber,
          contactId: '',
          name: 'NOT FOUND',
          disclosures: [],
          summary: '❌ MEMBER NOT FOUND',
        });
        continue;
      }

      const disclosures = await getDisclosures(page, member.id);

      const report: MemberDisclosureReport = {
        membershipNumber,
        contactId: member.id,
        name: member.fullname,
        disclosures: disclosures.map((d) => ({
          status: d.Status || 'Unknown',
          authority: d.DisclosureAuthority || d.Nation || 'Unknown',
          type: d.DisclosureType || 'Unknown',
          nation: d.Nation || d.Country || 'Unknown',
          expiryDate: d.ExpiryDate,
          issueDate: d.IssueDate,
        })),
        summary: summarizeDisclosures(disclosures),
      };

      reports.push(report);
    }

    // Print summary report
    console.log('\n\n' + '═'.repeat(60));
    console.log('  DISCLOSURE STATUS REPORT');
    console.log('═'.repeat(60));

    for (const report of reports) {
      console.log(`\n${report.summary} ${report.name} (${report.membershipNumber})`);
      if (report.disclosures.length > 0) {
        for (const d of report.disclosures) {
          console.log(`   └─ ${d.status} | ${d.authority} | ${d.type} | Expires: ${d.expiryDate || 'N/A'}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(60));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
