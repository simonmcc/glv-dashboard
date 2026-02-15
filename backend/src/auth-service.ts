/**
 * Authentication Service
 *
 * Uses Playwright to authenticate with the Scouts membership portal
 * and capture the Bearer token.
 */

import { chromium, Page } from 'playwright';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { log, logError } from './logger.js';
import { createHash } from 'node:crypto';

const tracer = trace.getTracer('glv-backend-auth', '1.0.0');

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
    logError(`[API] Search failed for ${membershipNumber}:`, error);
    return null;
  }
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
      log(`[API] Unexpected response for learning: ${JSON.stringify(data).substring(0, 200)}`);
      return [];
    }

    return data.map((m: Record<string, unknown>) => ({
      title: String(m.title || ''),
      expiryDate: m.expiryDate ? String(m.expiryDate) : null,
      currentLevel: String(m.currentLevel || ''),
    }));
  } catch (error) {
    logError(`[API] Failed to get learning for ${contactId}:`, error);
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
  return tracer.startActiveSpan('checkLearningByMembershipNumbers', async (span) => {
  span.setAttribute('members.count', membershipNumbers.length);
  log(`[Learning] Checking ${membershipNumbers.length} membership numbers`);

  const members: MemberLearning[] = [];

  for (const membershipNumber of membershipNumbers) {
    await tracer.startActiveSpan('checkLearning.member', async (memberSpan) => {
    memberSpan.setAttribute('member.membership_number', membershipNumber);
    log(`[Learning] Looking up ${membershipNumber}...`);

    // Search for member
    const member = await searchMemberByNumber(token, membershipNumber);
    if (!member) {
      log(`[Learning] Member not found: ${membershipNumber}`);
      memberSpan.setAttribute('member.found', false);
      members.push({
        membershipNumber,
        contactId: '',
        firstName: '',
        lastName: '',
        modules: [],
      });
      memberSpan.end();
      return;
    }

    log(`[Learning] Found ${member.preferredName} ${member.lastname} (${member.id})`);
    memberSpan.setAttribute('member.found', true);
    memberSpan.setAttribute('member.contact_id', member.id);

    // Get learning details
    const modules = await getLearningForContact(token, member.id);
    log(`[Learning] Got ${modules.length} learning modules`);
    memberSpan.setAttribute('member.module_count', modules.length);

    members.push({
      membershipNumber,
      contactId: member.id,
      firstName: member.preferredName,
      lastName: member.lastname,
      modules,
    });
    memberSpan.end();
    });
  }

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
  return { success: true, members };
  });
}

export async function authenticate(username: string, password: string): Promise<AuthResult> {
  return tracer.startActiveSpan('authenticate', async (span) => {
  span.setAttribute('auth.username', username);

  const browser = await tracer.startActiveSpan('playwright.browser.launch', async (launchSpan) => {
    const b = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    launchSpan.end();
    return b;
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
      log('[Auth] Captured token from:', request.url());
      // Use SHA-256 hash for non-sensitive token identification
      const tokenHash = createHash('sha256').update(capturedToken).digest('hex').substring(0, 16);
      log(`[Auth] Token length: ${capturedToken.length}, hash: ${tokenHash}`);
    }
  });

  try {
    // Navigate to the portal
    await tracer.startActiveSpan('playwright.navigate.scouts-portal', async (navSpan) => {
      await page.goto(SCOUTS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      await handleCookieConsent(page);
      navSpan.end();
    });

    // Perform login
    await tracer.startActiveSpan('playwright.b2c-login', async (loginSpan) => {
      await performLogin(page, username, password);
      await page.waitForTimeout(2000);
      loginSpan.end();
    });

    // Wait for portal to fully load and make initial API calls
    await tracer.startActiveSpan('playwright.wait-for-token', async (tokenSpan) => {
      await page.waitForTimeout(5000);
      tokenSpan.setAttribute('auth.token_captured', !!capturedToken);
      tokenSpan.end();
    });

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
      log('[Auth] Got contactId from browser context:', contactId);
    } catch (err) {
      logError('[Auth] Error in browser context:', err);
      // Contact ID fetch failed, but we have the token
    }

    const token = capturedToken as string;
    log(`[Auth] Returning token - length: ${token.length}, starts: ${token.substring(0, 20)}..., ends: ...${token.substring(token.length - 20)}`);

    span.setStatus({ code: SpanStatusCode.OK });
    return {
      success: true,
      token: capturedToken,
      contactId,
    };
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  } finally {
    await browser.close();
    span.end();
  }
  });
}
