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

// URLs we're interested in (filter out static assets, analytics, etc.)
const INTERESTING_URL_PATTERNS = [
  /membership\.scouts\.org\.uk\/api/i,
  /membership\.scouts\.org\.uk\/.*\.json/i,
  /scouts.*api/i,
];

const IGNORED_URL_PATTERNS = [
  /\.js(\?|$)/,
  /\.css(\?|$)/,
  /\.png(\?|$)/,
  /\.jpg(\?|$)/,
  /\.svg(\?|$)/,
  /\.woff/,
  /\.ttf/,
  /google/i,
  /analytics/i,
  /telemetry/i,
  /applicationinsights/i,
];

function isInterestingUrl(url: string): boolean {
  // Skip ignored patterns
  if (IGNORED_URL_PATTERNS.some(pattern => pattern.test(url))) {
    return false;
  }

  // Include if matches interesting patterns, or is a fetch/XHR to the membership site
  if (INTERESTING_URL_PATTERNS.some(pattern => pattern.test(url))) {
    return true;
  }

  // Also capture any JSON responses from the membership domain
  if (url.includes('membership.scouts.org.uk') && !url.includes('#')) {
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
  console.log('Your credentials are used only for this session and are not stored.\n');

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
    if (!isInterestingUrl(url)) return;

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
    console.log(`📤 ${method} ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
  });

  // Capture responses
  page.on('response', async (response: Response) => {
    const url = response.url();
    if (!isInterestingUrl(url)) return;

    const request = response.request();
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
      } catch (e) {
        // Response body may not be available
      }
    }

    capturedEndpoints.get(key)!.responses.push(captured);
    console.log(`📥 ${response.status()} ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
  });
}

async function authenticate(page: Page, username: string, password: string): Promise<boolean> {
  console.log('\n🌐 Navigating to membership.scouts.org.uk...');

  await page.goto('https://membership.scouts.org.uk/', {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // Wait for redirect to B2C login
  console.log('⏳ Waiting for B2C login page...');

  try {
    // Wait for the B2C login form
    await page.waitForURL(/b2clogin\.com/, { timeout: 30000 });
    console.log('✅ Redirected to B2C login');

    // Wait for the login form to be ready
    await page.waitForSelector('input[type="email"], input[name="logonIdentifier"], input#email', {
      timeout: 15000
    });

    // Find and fill email field (B2C uses various selectors)
    const emailSelectors = [
      'input[type="email"]',
      'input[name="logonIdentifier"]',
      'input#email',
      'input#signInName',
    ];

    let emailFilled = false;
    for (const selector of emailSelectors) {
      const emailInput = await page.$(selector);
      if (emailInput) {
        await emailInput.fill(username);
        emailFilled = true;
        console.log('✅ Entered username');
        break;
      }
    }

    if (!emailFilled) {
      console.error('❌ Could not find email input field');
      return false;
    }

    // Find and fill password field
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input#password',
    ];

    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      const passwordInput = await page.$(selector);
      if (passwordInput) {
        await passwordInput.fill(password);
        passwordFilled = true;
        console.log('✅ Entered password');
        break;
      }
    }

    if (!passwordFilled) {
      console.error('❌ Could not find password input field');
      return false;
    }

    // Click the sign-in button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '#next',
      'button#next',
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      const submitButton = await page.$(selector);
      if (submitButton) {
        await submitButton.click();
        submitted = true;
        console.log('✅ Clicked sign-in button');
        break;
      }
    }

    if (!submitted) {
      console.error('❌ Could not find submit button');
      return false;
    }

    // Wait for redirect back to membership site
    console.log('⏳ Waiting for authentication to complete...');
    await page.waitForURL(/membership\.scouts\.org\.uk/, { timeout: 60000 });

    // Give the SPA time to load
    await page.waitForTimeout(3000);

    console.log('✅ Authentication successful!');
    return true;

  } catch (error) {
    console.error('❌ Authentication failed:', error);
    return false;
  }
}

async function navigateAndCapture(page: Page): Promise<void> {
  // Navigate to Data Explorer
  console.log('\n📊 Navigating to Data Explorer...');
  await page.goto('https://membership.scouts.org.uk/#/dataexplorer', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Try to interact with the Data Explorer to trigger API calls
  console.log('🔍 Exploring Data Explorer interface...');

  // Look for common UI elements and click them
  const explorerSelectors = [
    'text=Training',
    'text=Learning',
    'text=Members',
    'text=Search',
    'button:has-text("Search")',
    'button:has-text("Load")',
    'button:has-text("View")',
    '.dropdown',
    'select',
  ];

  for (const selector of explorerSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      // Element may not be interactive
    }
  }

  // Navigate to Member Search
  console.log('\n🔎 Navigating to Member Search...');
  await page.goto('https://membership.scouts.org.uk/#/membersearch', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Try to interact with Member Search
  console.log('🔍 Exploring Member Search interface...');

  const searchSelectors = [
    'input[type="search"]',
    'input[type="text"]',
    'input[placeholder*="search" i]',
    'input[placeholder*="name" i]',
  ];

  for (const selector of searchSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        // Don't actually search for a real person, just trigger any autocomplete
        await element.fill('test');
        await page.waitForTimeout(2000);
        await element.fill('');
        break;
      }
    } catch (e) {
      // Element may not be found
    }
  }

  console.log('\n✅ Navigation complete');
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

  console.log('\n🚀 Launching browser...');

  const browser: Browser = await chromium.launch({
    headless: false, // Set to true for automated runs, false to see what's happening
    slowMo: 100,     // Slow down actions for visibility
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
    console.log('\nThe browser will remain open for 60 seconds for manual exploration.');
    console.log('Navigate the site to discover additional APIs.');
    console.log('Press Ctrl+C to exit early.\n');

    // Keep browser open for manual exploration
    await page.waitForTimeout(60000);

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
