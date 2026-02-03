/**
 * Test script for the Scouts API Client
 *
 * Uses Playwright to authenticate with Azure AD B2C, then tests the API client
 * with real API calls.
 *
 * Usage:
 *   # With environment variables (headless, automated):
 *   SCOUT_USERNAME=your@email.com SCOUT_PASSWORD=yourpass npm run test-api
 *
 *   # Without env vars (opens browser for manual login):
 *   npm run test-api
 */

import { chromium, Page } from 'playwright';
import { ScoutsApiClient } from './api-client.js';

const SCOUTS_URL = 'https://membership.scouts.org.uk/';

// Get credentials from environment variables
const SCOUT_USERNAME = process.env.SCOUT_USERNAME;
const SCOUT_PASSWORD = process.env.SCOUT_PASSWORD;
const hasCredentials = !!(SCOUT_USERNAME && SCOUT_PASSWORD);

async function handleCookieConsent(page: Page): Promise<void> {
  console.log('🍪 Checking for cookie consent dialog...');

  const cookieSelectors = [
    'button:has-text("Accept All")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    '[data-testid="cookie-accept"]',
    '#onetrust-accept-btn-handler',
    '.cookie-accept',
    'button[aria-label*="accept"]',
  ];

  for (const selector of cookieSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        console.log('✅ Accepted cookie consent');
        await page.waitForTimeout(1000);
        return;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  console.log('ℹ️  No cookie dialog found or already accepted');
}

async function performAutomatedLogin(page: Page): Promise<void> {
  console.log('🔐 Performing automated login...');

  // Wait for the B2C login page to load
  // The page redirects to prodscoutsb2c.b2clogin.com
  await page.waitForURL('**/b2clogin.com/**', { timeout: 30000 });
  console.log('   Reached B2C login page');

  // Wait for the login form to be ready
  await page.waitForTimeout(2000);

  // Fill in email/username
  const emailSelectors = [
    'input[type="email"]',
    'input[name="logonIdentifier"]',
    'input[id="signInName"]',
    'input[placeholder*="email"]',
    'input[placeholder*="Email"]',
  ];

  let emailFilled = false;
  for (const selector of emailSelectors) {
    try {
      const input = await page.$(selector);
      if (input) {
        await input.fill(SCOUT_USERNAME!);
        console.log('   Filled username/email');
        emailFilled = true;
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  if (!emailFilled) {
    throw new Error('Could not find email input field');
  }

  // Fill in password
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[id="password"]',
  ];

  let passwordFilled = false;
  for (const selector of passwordSelectors) {
    try {
      const input = await page.$(selector);
      if (input) {
        await input.fill(SCOUT_PASSWORD!);
        console.log('   Filled password');
        passwordFilled = true;
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  if (!passwordFilled) {
    throw new Error('Could not find password input field');
  }

  // Click the sign in button
  const submitSelectors = [
    'button[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'input[type="submit"]',
    '#next',
  ];

  let submitted = false;
  for (const selector of submitSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        console.log('   Clicked sign in button');
        submitted = true;
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  if (!submitted) {
    throw new Error('Could not find sign in button');
  }

  // Wait for redirect back to membership portal
  console.log('   Waiting for authentication to complete...');
  await page.waitForURL('**/membership.scouts.org.uk/**', { timeout: 60000 });
  console.log('✅ Login successful!');
}

async function testApiClient(client: ScoutsApiClient): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing API Client');
  console.log('='.repeat(60));

  // Test 1: Initialize client (get contact details needed for queries)
  console.log('\n👤 Test 1: Initialize client (get contact details)...');
  try {
    await client.initialize();
    const contactId = client.getContactId();
    console.log(`   ✅ Contact ID: ${contactId}`);
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
    console.log('   ⚠️  Queries may fail without contact ID');
  }

  // Test 2: Get View List
  console.log('\n📋 Test 2: Get available dashboard views...');
  try {
    const views = await client.getViewList();
    console.log(`   ✅ Found ${views.length} dashboard views`);
    views.slice(0, 5).forEach((view) => {
      console.log(`      - ${view.name}`);
    });
    if (views.length > 5) {
      console.log(`      ... and ${views.length - 5} more`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 3: Get Navigation
  console.log('\n🗺️  Test 3: Get user navigation...');
  try {
    const nav = await client.getNavigation();
    console.log(`   ✅ Navigation loaded`);
    console.log(`   ${JSON.stringify(nav).slice(0, 200)}...`);
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 4: Query ContactHierarchyUnitsView (simple test to verify format)
  console.log('\n🏢 Test 4: Query ContactHierarchyUnitsView (verify query format)...');
  try {
    const result = await client.query({
      table: 'ContactHierarchyUnitsView',
      selectFields: ['Id', 'UnitName'],
      query: '',
      pageNo: 1,
      pageSize: 10,
      orderBy: 'UnitName',
      order: 'asc',
    });

    if (result.error) {
      console.log(`   ⚠️  API returned error: ${result.error}`);
    } else {
      const data = result.data || [];
      console.log(`   ✅ Found ${result.count} units`);
      data.slice(0, 5).forEach((record: any) => {
        console.log(`      - ${record.unitName || record.UnitName || 'N/A'}`);
      });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 5: Query Learning Compliance (all records)
  console.log('\n📊 Test 5: Query Learning Compliance...');
  try {
    const result = await client.query({
      table: 'LearningComplianceDashboardView',
      selectFields: ['FirstName', 'LastName', 'MembershipNumber', 'Name', 'Status', 'ExpiryDate'],
      query: '',
      pageNo: 1,
      pageSize: 200,
      distinct: true,
    });

    if (result.error) {
      console.log(`   ⚠️  API returned error: ${result.error}`);
    } else {
      const data = result.data || [];
      console.log(`   ✅ Found ${result.count} total records`);

      // Show sample record
      if (data.length > 0) {
        console.log(`   Sample record: ${JSON.stringify(data[0])}`);
      }

      // Show unique values (response uses spaced field names)
      const learnings = [...new Set(data.map((r: any) => r.Learning || r.Name || r.name))];
      const statuses = [...new Set(data.map((r: any) => r.Status || r.status))];
      console.log(`   Learning types: ${learnings.join(', ')}`);
      console.log(`   Status values: ${statuses.join(', ')}`);

      // Count by learning type
      const counts: Record<string, number> = {};
      data.forEach((r: any) => {
        const key = r.Learning || r.Name || r.name || 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
      });
      console.log(`   Counts by type:`);
      Object.entries(counts).forEach(([k, v]) => {
        console.log(`      - ${k}: ${v}`);
      });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 6: Try filtered query
  console.log('\n🔍 Test 6: Try filtered query (SafeGuarding only)...');
  try {
    const result = await client.query({
      table: 'LearningComplianceDashboardView',
      selectFields: ['FirstName', 'LastName', 'Name', 'Status', 'ExpiryDate'],
      query: "Name = 'SafeGuarding'",
      pageNo: 1,
      pageSize: 20,
      distinct: true,
    });

    if (result.error) {
      console.log(`   ⚠️  Filter query failed: ${result.error}`);
    } else {
      const data = result.data || [];
      console.log(`   ✅ Found ${result.count} SafeGuarding records`);
      data.slice(0, 5).forEach((record: any) => {
        // Response field names have spaces
        const firstName = record['First name'] || record.FirstName || '';
        const lastName = record['Last name'] || record.LastName || '';
        const name = `${firstName} ${lastName}`.trim();
        const status = record.Status || record.status;
        const expiry = record['Expiry date'] || record.ExpiryDate || 'N/A';
        console.log(`      - ${name} | Status: ${status} | Expiry: ${expiry}`);
      });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }
}

async function main(): Promise<void> {
  console.log('🔐 Scouts API Client Test');
  console.log('='.repeat(60));

  if (hasCredentials) {
    console.log('✅ Using credentials from environment variables');
    console.log('   Running in headless mode\n');
  } else {
    console.log('ℹ️  No credentials provided');
    console.log('   Set SCOUT_USERNAME and SCOUT_PASSWORD for automated login');
    console.log('   Running in interactive mode - please log in manually\n');
  }

  const browser = await chromium.launch({
    headless: hasCredentials, // Headless if we have credentials, visible if manual
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Set up request listener to capture Bearer token
  const capturedToken: { value: string | null } = { value: null };

  page.on('request', (request) => {
    const authHeader = request.headers()['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ') && !capturedToken.value) {
      capturedToken.value = authHeader.replace('Bearer ', '');
      console.log('   🎯 Captured Bearer token from network request');
    }
  });

  try {
    // Navigate to Scouts membership portal
    console.log('📍 Navigating to membership.scouts.org.uk...');
    await page.goto(SCOUTS_URL, { waitUntil: 'networkidle' });

    // Handle cookie consent
    await handleCookieConsent(page);

    if (hasCredentials) {
      // Automated login
      await performAutomatedLogin(page);
    } else {
      // Manual login
      console.log('\n⏳ Waiting for manual login...');
      console.log('   Please complete the login process in the browser window.');

      await page.waitForURL('**/membership.scouts.org.uk/**', {
        timeout: 120000, // 2 minutes to login
      });
      console.log('✅ Login detected!');
    }

    await page.waitForTimeout(2000);

    // Navigate to trigger API calls and capture token
    console.log('🔑 Extracting Bearer token...');
    await page.goto(`${SCOUTS_URL}#/dataexplorer`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    if (!capturedToken.value) {
      throw new Error('Failed to capture Bearer token. Authentication may have failed.');
    }

    console.log(`✅ Bearer token extracted (${capturedToken.value.length} chars)`);

    // Create API client and test it
    const client = new ScoutsApiClient({ token: capturedToken.value });

    await testApiClient(client);

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  } finally {
    console.log('\n📝 Test complete. Closing browser...');
    await page.waitForTimeout(1000);
    await browser.close();
  }
}

main().catch(console.error);
