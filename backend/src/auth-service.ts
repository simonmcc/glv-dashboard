/**
 * Authentication Service
 *
 * Uses Playwright to authenticate with the Scouts membership portal
 * and capture the Bearer token.
 */

import { chromium, Frame, Page } from 'playwright';
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

  log(`[Auth] Checking for cookie consent banner (url: ${page.url()})`);

  for (const selector of cookieSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        log(`[Auth] Clicking cookie consent button: ${selector}`);
        await button.click();
        // Wait for the banner container to disappear (more reliable than waiting for the button itself)
        try {
          await page.waitForSelector('#onetrust-banner-sdk', {
            state: 'hidden',
            timeout: 2000,
          });
          log('[Auth] Cookie consent banner dismissed');
        } catch {
          log('[Auth] Cookie consent banner did not disappear within 2s, continuing');
        }
        return;
      }
    } catch {
      // Continue to next selector
    }
  }

  log('[Auth] No cookie consent banner found');
}

/**
 * Poll for a condition with timeout
 */
async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  pollIntervalMs = 100
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) return true;
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  return await condition();
}

async function performLogin(page: Page, username: string, password: string): Promise<void> {
  log(`[Auth] performLogin: current url=${page.url()}`);

  // Check if we're already on B2C or need to wait for redirect
  if (!page.url().includes('b2clogin.com')) {
    log('[Auth] Not yet on B2C, waiting up to 30s for redirect...');
    try {
      // Use a predicate to match the B2C login host (including subdomains like prodscoutsb2c.b2clogin.com)
      // by inspecting the parsed URL hostname instead of doing a substring match on the full href.
      await page.waitForURL(url => {
        try {
          const hostname = new URL(url.href).hostname.toLowerCase();
          return hostname === 'b2clogin.com' || hostname.endsWith('.b2clogin.com');
        } catch (err) {
          logError('[Auth] Error parsing URL in B2C waitForURL predicate', err instanceof Error ? err : new Error(String(err)));
          return false;
        }
      }, { timeout: 30000 });
      log(`[Auth] Reached B2C login page: ${page.url()}`);
    } catch {
      log(`[Auth] waitForURL(b2clogin) timed out, current url=${page.url()}`);
      // If we landed on B2C but the wait timed out (e.g. slow load), continue anyway
      if (page.url().includes('b2clogin.com')) {
        log('[Auth] Already on B2C despite timeout, continuing');
      } else if (page.url().includes('membership.scouts.org.uk')) {
        // Check if we might already be logged in
        log('[Auth] Still on membership portal, checking for existing token in sessionStorage...');
        const hasToken = await page.evaluate(() => {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.toLowerCase().includes('token')) return true;
          }
          return false;
        });
        if (hasToken) {
          log('[Auth] Found existing token in sessionStorage, skipping login form');
          return; // Already authenticated
        }
        log('[Auth] No token found in sessionStorage');
        throw new Error('Failed to reach B2C login page');
      } else {
        throw new Error('Failed to reach B2C login page');
      }
    }
  } else {
    log('[Auth] Already on B2C login page');
  }

  // Wait for the login form to render — B2C is a JS SPA, domcontentloaded fires
  // while the page still shows "Loading...". Wait for the actual email input instead.
  const emailInputSelector = 'input[type="email"], input[name="logonIdentifier"], input[id="signInName"]';
  log('[Auth] Waiting for email input to appear in login form...');
  let emailInput;
  try {
    emailInput = await page.waitForSelector(emailInputSelector, { timeout: 15000 });
  } catch {
    log(`[Auth] Email input did not appear within 15s, page title="${await page.title()}", url=${page.url()}`);
    throw new Error('Could not find email input field');
  }
  log(`[Auth] Login form ready, url=${page.url()}`);

  // Fill in email — use the handle returned by waitForSelector
  log(`[Auth] Filling email`);
  await emailInput.fill(username);

  // Fill in password
  const passwordInput = await page.$('input[type="password"]');
  if (!passwordInput) {
    log(`[Auth] Could not find password input, page title="${await page.title()}", url=${page.url()}`);
    throw new Error('Could not find password input field');
  }
  log('[Auth] Filling password');
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
      log(`[Auth] Clicking submit using selector: ${selector}`);
      await button.click();
      submitted = true;
      break;
    }
  }

  if (!submitted) {
    log(`[Auth] Could not find submit button, page title="${await page.title()}", url=${page.url()}`);
    throw new Error('Could not find sign in button');
  }

  // Wait for redirect back to membership portal
  log('[Auth] Waiting up to 60s for redirect back to membership portal...');
  await page.waitForURL('**/membership.scouts.org.uk/**', { timeout: 60000 });
  log(`[Auth] Returned to membership portal: ${page.url()}`);
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

  // Log every top-level navigation so we can trace the auth redirect chain
  const navigationHandler = (frame: Frame) => {
    if (frame === page.mainFrame()) {
      const rawUrl = frame.url();
      let safeUrl = rawUrl;
      try {
        const parsed = new URL(rawUrl);
        safeUrl = `${parsed.origin}${parsed.pathname}`;
      } catch {
        // If URL parsing fails, fall back to the raw URL (unlikely to contain sensitive query params in this case)
      }
      log(`[Auth] Navigation -> ${safeUrl}`);
    }
  };

  page.on('framenavigated', navigationHandler);
  page.once('close', () => {
    page.off('framenavigated', navigationHandler);
  });

  // Capture Bearer token and contactId from network traffic — the portal makes
  // these calls itself immediately after login, so we intercept rather than repeat them.
  let capturedToken: string | null = null;
  let capturedContactId: string | null = null;

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

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('tsa-memportal-prod-fun01') || !url.includes('GetContactDetailAsync')) {
      return;
    }

    if (capturedContactId !== null) {
      log('[Auth] Skipping GetContactDetailAsync response because contactId is already captured');
      return;
    }

    try {
      const data = await response.json();
      if (data?.id) {
        capturedContactId = data.id;
        log('[Auth] Captured contactId from response:', capturedContactId);
      }
    } catch {
      // Non-JSON or unexpected shape — ignore
    }
  });

  try {
    // Navigate to the portal
    await tracer.startActiveSpan('playwright.navigate.scouts-portal', async (navSpan) => {
      log(`[Auth] Navigating to ${SCOUTS_URL}`);
      await page.goto(SCOUTS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      log(`[Auth] Initial navigation complete, url=${page.url()}`);
      await handleCookieConsent(page);
      navSpan.end();
    });

    // Perform login
    await tracer.startActiveSpan('playwright.b2c-login', async (loginSpan) => {
      await performLogin(page, username, password);
      loginSpan.end();
    });

    // Wait for token — the portal fires GetContactDetailAsync immediately after
    // login so contactId typically arrives in the same burst, but it is optional.
    await tracer.startActiveSpan('playwright.wait-for-token', async (tokenSpan) => {
      const startTime = Date.now();
      const captured = await waitForCondition(
        () => capturedToken !== null,
        15000, // max 15s timeout
        200    // check every 200ms
      );
      const waitDuration = Date.now() - startTime;
      tokenSpan.setAttribute('auth.token_captured', captured);
      tokenSpan.setAttribute('auth.wait_duration_ms', waitDuration);
      log(`[Auth] Token wait completed in ${waitDuration}ms, captured: ${captured}`);
      tokenSpan.end();
    });

    if (!capturedToken) {
      throw new Error('Failed to capture Bearer token');
    }

    const contactId = capturedContactId ?? undefined;
    if (contactId) {
      log('[Auth] Got contactId from intercepted response:', contactId);
    } else {
      log('[Auth] contactId not captured from page responses');
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
