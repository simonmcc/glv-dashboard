/**
 * CLI Test Script for Backend API
 *
 * Tests various DataExplorer views and API endpoints.
 *
 * Usage: npm run test-api
 *
 * Environment variables:
 *   SCOUT_USERNAME - Scouts membership email
 *   SCOUT_PASSWORD - Scouts membership password
 */

import { authenticate } from './auth-service.js';

const API_BASE = 'https://tsa-memportal-prod-fun01.azurewebsites.net/api';

interface ViewTestResult {
  view: string;
  success: boolean;
  count: number;
  fields: string[];
  error?: string;
}

async function queryDataExplorer(
  token: string,
  contactId: string,
  table: string,
  pageSize: number = 50
): Promise<{ data: unknown[]; count: number; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/DataExplorer/GetResultsAsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        table,
        query: '',
        selectFields: [],
        pageNo: 1,
        pageSize,
        orderBy: '',
        order: null,
        distinct: true,
        isDashboardQuery: false,
        contactId,
        id: '',
        name: '',
      }),
    });

    const result = await response.json();
    return {
      data: result.data || [],
      count: result.count || 0,
      error: result.error,
    };
  } catch (error) {
    return { data: [], count: 0, error: String(error) };
  }
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  Backend API Test - All Dashboard Views');
  console.log('═'.repeat(60));

  const username = process.env.SCOUT_USERNAME;
  const password = process.env.SCOUT_PASSWORD;

  if (!username || !password) {
    console.error('❌ SCOUT_USERNAME and SCOUT_PASSWORD environment variables required');
    process.exit(1);
  }

  console.log('\n🔐 Authenticating...');
  const authResult = await authenticate(username, password);

  if (!authResult.success || !authResult.token) {
    console.error('❌ Authentication failed:', authResult.error);
    process.exit(1);
  }

  console.log('✅ Authenticated');
  console.log(`   Contact ID: ${authResult.contactId}`);

  const token = authResult.token;
  const contactId = authResult.contactId || '';

  // All known dashboard views to test
  const viewsToTest = [
    // Core compliance views (used by dashboard)
    { name: 'LearningComplianceDashboardView', description: 'Training compliance tracking' },
    { name: 'InProgressActionDashboardView', description: 'Joining journey / onboarding actions' },
    { name: 'DisclosureComplianceDashboardView', description: 'DBS disclosure status' },

    // Other views from API-SUMMARY.md
    { name: 'AppointmentsDashboardView', description: 'Appointment progress tracking' },
    { name: 'SuspensionDashboardView', description: 'Suspended member tracking' },
    { name: 'TeamDirectoryReviewsDashboardView', description: 'Team directory reviews' },
    { name: 'PermitsDashboardView', description: 'Activity permits tracking' },
    { name: 'WelcomeEnquiryView', description: 'New member enquiries' },
    { name: 'PreloadedAwardsDashboardView', description: 'Awards and recognitions' },
  ];

  console.log('\n' + '─'.repeat(60));
  console.log('Testing All DataExplorer Views');
  console.log('─'.repeat(60));

  const results: ViewTestResult[] = [];

  for (const view of viewsToTest) {
    console.log(`\n📊 ${view.name}`);
    console.log(`   ${view.description}`);

    const result = await queryDataExplorer(token, contactId, view.name, 5);

    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
      results.push({
        view: view.name,
        success: false,
        count: 0,
        fields: [],
        error: result.error,
      });
      continue;
    }

    const fields = result.data.length > 0
      ? Object.keys(result.data[0] as Record<string, unknown>)
      : [];

    console.log(`   ✅ Count: ${result.count}, Sample: ${result.data.length} records`);
    console.log(`   📋 Fields (${fields.length}): ${fields.slice(0, 8).join(', ')}${fields.length > 8 ? '...' : ''}`);

    results.push({
      view: view.name,
      success: true,
      count: result.count,
      fields,
    });

    // Show sample record for key views
    if (result.data.length > 0 && ['InProgressActionDashboardView', 'DisclosureComplianceDashboardView'].includes(view.name)) {
      const sample = result.data[0] as Record<string, unknown>;
      console.log(`   📄 Sample record:`);
      const sampleStr = JSON.stringify(sample, null, 2);
      const truncated = sampleStr.length > 1000 ? sampleStr.substring(0, 1000) + '\n      ...' : sampleStr;
      console.log(truncated.split('\n').map(l => '      ' + l).join('\n'));
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('  Summary');
  console.log('═'.repeat(60));

  const working = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Working views (${working.length}):`);
  for (const r of working) {
    console.log(`   - ${r.view}: ${r.count} records, ${r.fields.length} fields`);
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed views (${failed.length}):`);
    for (const r of failed) {
      console.log(`   - ${r.view}: ${r.error}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  Test Complete');
  console.log('═'.repeat(60));
}

main().catch(console.error);
