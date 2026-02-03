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
