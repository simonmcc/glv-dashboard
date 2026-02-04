/**
 * API Discovery Script
 *
 * This script authenticates with the Scouts membership system and captures
 * all API calls made during navigation to discover the endpoints we need.
 *
 * Usage: npm run discover
 */

import { chromium, Browser, Page, Request, Response } from 'playwright';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// Types for captured API data
interface CapturedRequest {
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  postData?: string;
}

interface CapturedResponse {
  timestamp: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  body?: string;
}

interface CapturedEndpoint {
  method: string;
  url: string;
  requests: CapturedRequest[];
  responses: CapturedResponse[];
}

// Storage for captured API calls
const capturedEndpoints: Map<string, CapturedEndpoint> = new Map();

// Static assets to ignore
const IGNORED_URL_PATTERNS = [
  /\.js(\?|$)/,
  /\.css(\?|$)/,
  /\.png(\?|$)/,
  /\.jpg(\?|$)/,
  /\.gif(\?|$)/,
  /\.svg(\?|$)/,
  /\.woff/,
  /\.ttf/,
  /\.ico(\?|$)/,
  /fonts\./,
  /google/i,
  /analytics/i,
  /telemetry/i,
  /applicationinsights/i,
  /clarity\.ms/i,
  /cookielaw/i,
  /onetrust/i,
];

function isInterestingUrl(url: string, resourceType: string): boolean {
  // Always capture XHR/fetch requests
  if (resourceType === 'xhr' || resourceType === 'fetch') {
    // Skip analytics even for XHR
    if (IGNORED_URL_PATTERNS.some(pattern => pattern.test(url))) {
      return false;
    }
    return true;
  }

  // Skip static assets
  if (IGNORED_URL_PATTERNS.some(pattern => pattern.test(url))) {
    return false;
  }

  // Capture document navigations to membership site
  if (resourceType === 'document' && url.includes('membership.scouts.org.uk')) {
    return true;
  }

  return false;
}

function getEndpointKey(method: string, url: string): string {
  // Remove query params for grouping, but keep the base URL
  const urlObj = new URL(url);
  return `${method} ${urlObj.origin}${urlObj.pathname}`;
}

async function promptForCredentials(): Promise<{ username: string; password: string }> {
  // Check for environment variables first
  const envUsername = process.env.SCOUT_USERNAME;
  const envPassword = process.env.SCOUT_PASSWORD;

  if (envUsername && envPassword) {
    console.log('\n🔐 Using credentials from environment variables (SCOUT_USERNAME, SCOUT_PASSWORD)');
    return { username: envUsername, password: envPassword };
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  console.log('\n🔐 Scouts Membership Login');
  console.log('─'.repeat(40));
  console.log('Your credentials are used only for this session and are not stored.');
  console.log('(Set SCOUT_USERNAME and SCOUT_PASSWORD env vars to skip this prompt)\n');

  const username = await question('Email/Username: ');

  // Hide password input
  process.stdout.write('Password: ');
  const password = await new Promise<string>((resolve) => {
    let pwd = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      const char = data.toString();
      if (char === '\n' || char === '\r') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        console.log('');
        resolve(pwd);
      } else if (char === '\u0003') {
        // Ctrl+C
        process.exit();
      } else if (char === '\u007F') {
        // Backspace
        pwd = pwd.slice(0, -1);
      } else {
        pwd += char;
      }
    });
  });

  rl.close();
  return { username, password };
}

function setupRequestInterception(page: Page): void {
  // Capture requests
  page.on('request', (request: Request) => {
    const url = request.url();
    const resourceType = request.resourceType();

    if (!isInterestingUrl(url, resourceType)) return;

    const method = request.method();
    const key = getEndpointKey(method, url);

    if (!capturedEndpoints.has(key)) {
      capturedEndpoints.set(key, {
        method,
        url: key.split(' ')[1],
        requests: [],
        responses: [],
      });
    }

    const captured: CapturedRequest = {
      timestamp: new Date().toISOString(),
      method,
      url,
      headers: request.headers(),
    };

    const postData = request.postData();
    if (postData) {
      captured.postData = postData;
    }

    capturedEndpoints.get(key)!.requests.push(captured);
    console.log(`📤 [${resourceType}] ${method} ${url.substring(0, 120)}${url.length > 120 ? '...' : ''}`);
  });

  // Capture responses
  page.on('response', async (response: Response) => {
    const url = response.url();
    const request = response.request();
    const resourceType = request.resourceType();

    if (!isInterestingUrl(url, resourceType)) return;

    const method = request.method();
    const key = getEndpointKey(method, url);

    if (!capturedEndpoints.has(key)) {
      capturedEndpoints.set(key, {
        method,
        url: key.split(' ')[1],
        requests: [],
        responses: [],
      });
    }

    const captured: CapturedResponse = {
      timestamp: new Date().toISOString(),
      url,
      status: response.status(),
      headers: response.headers(),
    };

    // Try to capture response body for JSON responses
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await response.text();
        captured.body = body;
        console.log(`📥 [${resourceType}] ${response.status()} ${url.substring(0, 100)}... (JSON: ${body.length} bytes)`);
      } catch (e) {
        console.log(`📥 [${resourceType}] ${response.status()} ${url.substring(0, 120)}${url.length > 120 ? '...' : ''}`);
      }
    } else {
      console.log(`📥 [${resourceType}] ${response.status()} ${url.substring(0, 120)}${url.length > 120 ? '...' : ''}`);
    }

    capturedEndpoints.get(key)!.responses.push(captured);
  });
}

async function handleCookieConsent(page: Page): Promise<void> {
  console.log('🍪 Checking for cookie consent dialog...');

  const cookieSelectors = [
    'button:has-text("Accept All")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    'button:has-text("Allow all")',
    'button:has-text("I agree")',
    'button:has-text("OK")',
    '[id*="accept"]',
    '[class*="accept"]',
    '[data-testid*="accept"]',
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
      // Continue trying other selectors
    }
  }

  console.log('ℹ️  No cookie dialog found (or already accepted)');
}

async function authenticate(page: Page, username: string, password: string): Promise<boolean> {
  console.log('\n🌐 Navigating to membership.scouts.org.uk...');

  await page.goto('https://membership.scouts.org.uk/', {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // Handle cookie consent if present
  await handleCookieConsent(page);

  // Wait for redirect to B2C login
  console.log('⏳ Waiting for B2C login page...');

  try {
    // Wait for the B2C login form
    await page.waitForURL(/b2clogin\.com/, { timeout: 30000 });
    console.log('✅ Redirected to B2C login');
    console.log(`📍 Current URL: ${page.url()}`);

    // Handle any cookie consent on B2C page
    await handleCookieConsent(page);

    // Wait for the login form to be ready
    console.log('⏳ Waiting for login form...');
    await page.waitForSelector('input[type="email"], input[name="logonIdentifier"], input#email, input#signInName', {
      timeout: 15000
    });

    // Take a screenshot for debugging
    console.log('📸 Login form detected');

    // Find and fill email field (B2C uses various selectors)
    const emailSelectors = [
      'input#signInName',
      'input#email',
      'input[name="logonIdentifier"]',
      'input[type="email"]',
    ];

    let emailFilled = false;
    for (const selector of emailSelectors) {
      const emailInput = await page.$(selector);
      if (emailInput && await emailInput.isVisible()) {
        await emailInput.click();
        await emailInput.fill(username);
        emailFilled = true;
        console.log(`✅ Entered username (using ${selector})`);
        break;
      }
    }

    if (!emailFilled) {
      console.error('❌ Could not find email input field');
      console.log('Available inputs:', await page.$$eval('input', inputs =>
        inputs.map(i => ({ id: i.id, name: i.name, type: i.type }))
      ));
      return false;
    }

    // Find and fill password field
    const passwordSelectors = [
      'input#password',
      'input[name="password"]',
      'input[type="password"]',
    ];

    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      const passwordInput = await page.$(selector);
      if (passwordInput && await passwordInput.isVisible()) {
        await passwordInput.click();
        await passwordInput.fill(password);
        passwordFilled = true;
        console.log(`✅ Entered password (using ${selector})`);
        break;
      }
    }

    if (!passwordFilled) {
      console.error('❌ Could not find password input field');
      return false;
    }

    // Click the sign-in button
    const submitSelectors = [
      'button#next',
      '#next',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      const submitButton = await page.$(selector);
      if (submitButton && await submitButton.isVisible()) {
        await submitButton.click();
        submitted = true;
        console.log(`✅ Clicked sign-in button (using ${selector})`);
        break;
      }
    }

    if (!submitted) {
      console.error('❌ Could not find submit button');
      console.log('Available buttons:', await page.$$eval('button', buttons =>
        buttons.map(b => ({ id: b.id, text: b.textContent?.trim(), type: b.type }))
      ));
      return false;
    }

    // Wait for redirect back to membership site
    console.log('⏳ Waiting for authentication to complete...');

    // Wait for either success (redirect to membership) or error message
    await Promise.race([
      page.waitForURL(/membership\.scouts\.org\.uk/, { timeout: 60000 }),
      page.waitForSelector('.error, .errorMessage, [class*="error"]', { timeout: 60000 }).then(async () => {
        const errorText = await page.$eval('.error, .errorMessage, [class*="error"]', el => el.textContent);
        throw new Error(`Login error: ${errorText}`);
      })
    ]);

    console.log(`📍 Current URL after login: ${page.url()}`);

    // Give the SPA time to fully load and make initial API calls
    console.log('⏳ Waiting for SPA to initialize...');
    await page.waitForTimeout(5000);

    // Check if we're actually logged in by looking for typical logged-in elements
    const loggedInIndicators = [
      'text=Log out',
      'text=Logout',
      'text=Sign out',
      '[class*="user"]',
      '[class*="profile"]',
      '[class*="avatar"]',
    ];

    for (const selector of loggedInIndicators) {
      const element = await page.$(selector);
      if (element) {
        console.log('✅ Authentication successful! (found logged-in indicator)');
        return true;
      }
    }

    // If no indicator found, assume success if we're on the membership site
    if (page.url().includes('membership.scouts.org.uk')) {
      console.log('✅ Authentication appears successful (on membership site)');
      return true;
    }

    console.log('⚠️ Authentication status unclear, continuing anyway...');
    return true;

  } catch (error) {
    console.error('❌ Authentication failed:', error);
    console.log(`📍 Current URL: ${page.url()}`);
    return false;
  }
}

async function navigateAndCapture(page: Page): Promise<void> {
  // Navigate to Data Explorer
  console.log('\n📊 Navigating to Data Explorer...');

  // For SPAs with hash routing, we need to navigate differently
  await page.evaluate(() => {
    window.location.hash = '/dataexplorer';
  });

  // Wait for navigation and API calls
  await page.waitForTimeout(5000);
  console.log(`📍 Current URL: ${page.url()}`);

  // Try to interact with the Data Explorer to trigger API calls
  console.log('🔍 Exploring Data Explorer interface...');

  // Log what elements we can see
  const visibleText = await page.evaluate(() => {
    return document.body.innerText.substring(0, 500);
  });
  console.log('📄 Page content preview:', visibleText.substring(0, 200) + '...');

  // Look for common UI elements and click them
  const explorerSelectors = [
    'text=Training',
    'text=Learning',
    'text=Members',
    'text=Compliance',
    'text=Search',
    'text=Report',
    'button:has-text("Search")',
    'button:has-text("Load")',
    'button:has-text("View")',
    'button:has-text("Run")',
    'button:has-text("Generate")',
    '[class*="dropdown"]',
    '[class*="select"]',
    'select',
  ];

  for (const selector of explorerSelectors) {
    try {
      const element = await page.$(selector);
      if (element && await element.isVisible()) {
        console.log(`🖱️ Clicking: ${selector}`);
        await element.click();
        await page.waitForTimeout(3000);
      }
    } catch (e) {
      // Element may not be interactive
    }
  }

  // Navigate to Member Search
  console.log('\n🔎 Navigating to Member Search...');
  await page.evaluate(() => {
    window.location.hash = '/membersearch';
  });
  await page.waitForTimeout(5000);
  console.log(`📍 Current URL: ${page.url()}`);

  // Log what elements we can see
  const searchPageText = await page.evaluate(() => {
    return document.body.innerText.substring(0, 500);
  });
  console.log('📄 Page content preview:', searchPageText.substring(0, 200) + '...');

  // Try to interact with Member Search
  console.log('🔍 Exploring Member Search interface...');

  const searchSelectors = [
    'input[type="search"]',
    'input[type="text"]',
    'input[placeholder*="search" i]',
    'input[placeholder*="name" i]',
    'input[placeholder*="member" i]',
  ];

  for (const selector of searchSelectors) {
    try {
      const element = await page.$(selector);
      if (element && await element.isVisible()) {
        console.log(`🖱️ Typing in: ${selector}`);
        // Type a common name to trigger search API
        await element.fill('Smith');
        await page.waitForTimeout(3000);
        await element.fill('');
        break;
      }
    } catch (e) {
      // Element may not be found
    }
  }

  // Also try navigating directly via URL with some test parameters
  console.log('\n📊 Trying direct navigation patterns...');

  const additionalPaths = [
    '/#/home',
    '/#/dashboard',
    '/#/training',
    '/#/reports',
  ];

  for (const path of additionalPaths) {
    try {
      console.log(`📍 Navigating to ${path}`);
      await page.goto(`https://membership.scouts.org.uk${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
      await page.waitForTimeout(2000);
    } catch (e) {
      // Path may not exist
    }
  }

  console.log('\n✅ Automated navigation complete');
}

function generateApiDocumentation(): string {
  const lines: string[] = [
    '# Discovered API Endpoints',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `Total unique endpoints discovered: ${capturedEndpoints.size}`,
    '',
    '## Endpoints',
    '',
  ];

  // Sort endpoints by URL
  const sortedEndpoints = Array.from(capturedEndpoints.values()).sort((a, b) =>
    a.url.localeCompare(b.url)
  );

  for (const endpoint of sortedEndpoints) {
    lines.push(`### ${endpoint.method} ${endpoint.url}`);
    lines.push('');
    lines.push(`- **Requests captured**: ${endpoint.requests.length}`);
    lines.push(`- **Responses captured**: ${endpoint.responses.length}`);
    lines.push('');

    // Show a sample request
    if (endpoint.requests.length > 0) {
      const sampleReq = endpoint.requests[0];
      lines.push('#### Sample Request');
      lines.push('');
      lines.push('**Headers:**');
      lines.push('```json');

      // Filter out sensitive/noisy headers
      const filteredHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(sampleReq.headers)) {
        if (!['cookie', 'authorization'].includes(key.toLowerCase())) {
          filteredHeaders[key] = value;
        } else {
          filteredHeaders[key] = '[REDACTED]';
        }
      }
      lines.push(JSON.stringify(filteredHeaders, null, 2));
      lines.push('```');
      lines.push('');

      if (sampleReq.postData) {
        lines.push('**Body:**');
        lines.push('```json');
        try {
          const parsed = JSON.parse(sampleReq.postData);
          lines.push(JSON.stringify(parsed, null, 2));
        } catch {
          lines.push(sampleReq.postData);
        }
        lines.push('```');
        lines.push('');
      }
    }

    // Show a sample response
    if (endpoint.responses.length > 0) {
      const sampleRes = endpoint.responses[0];
      lines.push('#### Sample Response');
      lines.push('');
      lines.push(`**Status:** ${sampleRes.status}`);
      lines.push('');

      if (sampleRes.body) {
        lines.push('**Body (truncated):**');
        lines.push('```json');
        try {
          const parsed = JSON.parse(sampleRes.body);
          // Truncate large responses
          const stringified = JSON.stringify(parsed, null, 2);
          if (stringified.length > 2000) {
            lines.push(stringified.substring(0, 2000) + '\n... [truncated]');
          } else {
            lines.push(stringified);
          }
        } catch {
          lines.push(sampleRes.body.substring(0, 2000));
        }
        lines.push('```');
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  console.log('═'.repeat(50));
  console.log('  GLV Dashboard - API Discovery Tool');
  console.log('═'.repeat(50));

  const { username, password } = await promptForCredentials();

  const headless = process.env.HEADLESS !== 'false';
  console.log(`\n🚀 Launching browser (headless: ${headless})...`);

  const browser: Browser = await chromium.launch({
    headless,
    slowMo: headless ? 0 : 100, // Slow down actions for visibility when not headless
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Set up request interception
  setupRequestInterception(page);

  try {
    // Authenticate
    const authSuccess = await authenticate(page, username, password);

    if (!authSuccess) {
      console.error('\n❌ Failed to authenticate. Please check your credentials.');
      await browser.close();
      process.exit(1);
    }

    // Navigate and capture APIs
    await navigateAndCapture(page);

    // Generate documentation
    console.log('\n📝 Generating API documentation...');
    const documentation = generateApiDocumentation();

    // Save to file
    const outputDir = path.join(process.cwd(), '..', 'docs');
    const outputPath = path.join(outputDir, 'API.md');

    // Ensure docs directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, documentation);
    console.log(`\n✅ API documentation saved to: ${outputPath}`);

    // Also output to console
    console.log('\n' + '═'.repeat(50));
    console.log('  DISCOVERED ENDPOINTS');
    console.log('═'.repeat(50));

    for (const [key, endpoint] of capturedEndpoints) {
      console.log(`\n${key}`);
      console.log(`  Requests: ${endpoint.requests.length}, Responses: ${endpoint.responses.length}`);
    }

    console.log('\n' + '═'.repeat(50));
    console.log('  MANUAL EXPLORATION');
    console.log('═'.repeat(50));
    console.log('\nThe browser will remain open for 2 minutes for manual exploration.');
    console.log('Try these actions to discover more APIs:');
    console.log('  1. Navigate to Data Explorer and select your team');
    console.log('  2. Click on Training/Learning tabs');
    console.log('  3. Search for a member and view their profile');
    console.log('  4. Look for any reports or export functions');
    console.log('Press Ctrl+C to exit when done.\n');

    // Keep browser open for manual exploration
    await page.waitForTimeout(120000);

  } catch (error) {
    console.error('Error during API discovery:', error);
  } finally {
    // Final documentation update
    const documentation = generateApiDocumentation();
    const outputPath = path.join(process.cwd(), '..', 'docs', 'API.md');
    fs.writeFileSync(outputPath, documentation);
    console.log(`\n✅ Final API documentation saved to: ${outputPath}`);

    await browser.close();
    console.log('\n👋 Browser closed. Discovery complete.');
  }
}

main().catch(console.error);
