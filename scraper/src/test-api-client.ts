/**
 * Test script for the Scouts API Client
 *
 * Uses Playwright to authenticate with Azure AD B2C, then tests the API client
 * with real API calls.
 *
 * Usage: npm run test-api
 */

import { chromium, Page } from 'playwright';
import { ScoutsApiClient, ComplianceSummary } from './api-client.js';
import { LearningComplianceRecord } from './types.js';

const SCOUTS_URL = 'https://membership.scouts.org.uk/';

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

async function extractBearerToken(page: Page): Promise<string | null> {
  console.log('🔑 Extracting Bearer token...');

  // Listen for API requests to capture the token
  let token: string | null = null;

  page.on('request', (request) => {
    const authHeader = request.headers()['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    }
  });

  // Navigate to Data Explorer to trigger an API call
  console.log('📍 Navigating to Data Explorer to capture token...');
  await page.goto(`${SCOUTS_URL}#/dataexplorer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // If we didn't capture it from requests, try to get it from localStorage/sessionStorage
  if (!token) {
    token = await page.evaluate(() => {
      // Check for MSAL tokens in session storage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.includes('accesstoken')) {
          try {
            const data = JSON.parse(sessionStorage.getItem(key) || '{}');
            if (data.secret) {
              return data.secret;
            }
          } catch (e) {
            // Not JSON, skip
          }
        }
      }

      // Check local storage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('accesstoken')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.secret) {
              return data.secret;
            }
          } catch (e) {
            // Not JSON, skip
          }
        }
      }

      return null;
    });
  }

  return token;
}

async function testApiClient(client: ScoutsApiClient): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing API Client');
  console.log('='.repeat(60));

  // Test 1: Get View List
  console.log('\n📋 Test 1: Get available dashboard views...');
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

  // Test 2: Get Navigation
  console.log('\n🗺️  Test 2: Get user navigation...');
  try {
    const nav = await client.getNavigation();
    console.log(`   ✅ Navigation loaded`);
    console.log(`   ${JSON.stringify(nav).slice(0, 200)}...`);
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 3: Query Learning Compliance
  console.log('\n📊 Test 3: Query Learning Compliance (first 10 records)...');
  try {
    const result = await client.queryLearningCompliance({
      take: 10,
      sorts: [{ field: 'FullName', dir: 'asc' }],
    });
    console.log(`   ✅ Found ${result.total} total records`);
    console.log(`   Showing first ${result.data.length}:`);
    result.data.forEach((record) => {
      const safeguarding = record.SafeguardingStatus || 'N/A';
      const safety = record.SafetyStatus || 'N/A';
      console.log(
        `      - ${record.FullName} | Safeguarding: ${safeguarding} | Safety: ${safety}`
      );
    });
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 4: Get Safeguarding Expiring Soon
  console.log('\n⚠️  Test 4: Get members with safeguarding expiring in 90 days...');
  try {
    const result = await client.getSafeguardingExpiring(90, { take: 10 });
    console.log(`   ✅ Found ${result.total} members with safeguarding expiring soon`);
    if (result.data.length > 0) {
      console.log(`   First ${Math.min(5, result.data.length)}:`);
      result.data.slice(0, 5).forEach((record) => {
        console.log(
          `      - ${record.FullName} | Expires: ${record.SafeguardingExpiryDate}`
        );
      });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 5: Get Safeguarding Expired
  console.log('\n🚨 Test 5: Get members with expired safeguarding...');
  try {
    const result = await client.getSafeguardingExpired({ take: 10 });
    console.log(`   ✅ Found ${result.total} members with expired safeguarding`);
    if (result.data.length > 0) {
      console.log(`   First ${Math.min(5, result.data.length)}:`);
      result.data.slice(0, 5).forEach((record) => {
        console.log(
          `      - ${record.FullName} | Expired: ${record.SafeguardingExpiryDate}`
        );
      });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 6: Get Safety Expired
  console.log('\n🦺 Test 6: Get members with expired safety training...');
  try {
    const result = await client.getSafetyExpired({ take: 10 });
    console.log(`   ✅ Found ${result.total} members with expired safety training`);
    if (result.data.length > 0) {
      console.log(`   First ${Math.min(5, result.data.length)}:`);
      result.data.slice(0, 5).forEach((record) => {
        console.log(
          `      - ${record.FullName} | Expired: ${record.SafetyExpiryDate}`
        );
      });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 7: Get First Response Non-Compliant
  console.log('\n🏥 Test 7: Get members requiring First Response who are non-compliant...');
  try {
    const result = await client.getFirstResponseNonCompliant({ take: 10 });
    console.log(`   ✅ Found ${result.total} non-compliant First Response members`);
    if (result.data.length > 0) {
      console.log(`   First ${Math.min(5, result.data.length)}:`);
      result.data.slice(0, 5).forEach((record) => {
        console.log(
          `      - ${record.FullName} | Status: ${record.FirstResponseStatus}`
        );
      });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }

  // Test 8: Get Compliance Summary
  console.log('\n📈 Test 8: Get compliance summary...');
  try {
    const summary = await client.getComplianceSummary();
    console.log(`   ✅ Compliance Summary for ${summary.total} members:`);
    console.log(`
   Safeguarding:
      - Compliant: ${summary.safeguarding.compliant}
      - Expiring Soon: ${summary.safeguarding.expiringSoon}
      - Expired: ${summary.safeguarding.expired}

   Safety:
      - Compliant: ${summary.safety.compliant}
      - Expiring Soon: ${summary.safety.expiringSoon}
      - Expired: ${summary.safety.expired}

   First Response (of ${summary.firstResponse.required} required):
      - Compliant: ${summary.firstResponse.compliant}
      - Non-Compliant: ${summary.firstResponse.nonCompliant}

   Growing Roots:
      - Complete: ${summary.growingRoots.complete}
      - Incomplete: ${summary.growingRoots.incomplete}
    `);
  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
  }
}

async function main(): Promise<void> {
  console.log('🔐 Scouts API Client Test');
  console.log('='.repeat(60));
  console.log('This will open a browser window for authentication.');
  console.log('Please log in with your Scouts credentials.\n');

  const browser = await chromium.launch({
    headless: false, // Show browser for manual login
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to Scouts membership portal
    console.log('📍 Navigating to membership.scouts.org.uk...');
    await page.goto(SCOUTS_URL, { waitUntil: 'networkidle' });

    // Handle cookie consent
    await handleCookieConsent(page);

    // Wait for user to complete login
    console.log('\n⏳ Waiting for login...');
    console.log('   Please complete the login process in the browser window.');

    // Wait for redirect back to membership portal after login
    await page.waitForURL('**/membership.scouts.org.uk/**', {
      timeout: 120000, // 2 minutes to login
    });

    console.log('✅ Login detected!');
    await page.waitForTimeout(2000);

    // Extract the Bearer token
    const token = await extractBearerToken(page);

    if (!token) {
      console.error('❌ Could not extract Bearer token');
      console.log('   Try navigating around the site to trigger API calls...');

      // Give user time to manually trigger API calls
      console.log('   Waiting 30 seconds for manual navigation...');
      await page.waitForTimeout(30000);

      // Try again
      const retryToken = await extractBearerToken(page);
      if (!retryToken) {
        throw new Error('Failed to extract Bearer token');
      }
    }

    console.log(`✅ Bearer token extracted (${token!.length} chars)`);

    // Create API client and test it
    const client = new ScoutsApiClient({ token: token! });

    await testApiClient(client);

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  } finally {
    console.log('\n📝 Test complete. Closing browser in 5 seconds...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

main().catch(console.error);
