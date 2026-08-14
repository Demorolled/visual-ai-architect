#!/usr/bin/env node

/**
 * test-runner.mjs — VACA App Test Suite
 *
 * Runs Playwright-based browser tests against all 92 HTML apps in projects/.
 *
 * Usage:
 *   node tests/test-runner.mjs              # Run all 92 apps
 *   node tests/test-runner.mjs --batch 2    # Run only Batch 2 apps
 *   node tests/test-runner.mjs --fixed      # Run only the 5 fixed apps
 *   node tests/test-runner.mjs --app=chess  # Run apps matching "chess"
 *   node tests/test-runner.mjs --quick      # Run only basic load test for all
 *   node tests/test-runner.mjs --dry-run    # List what would be tested
 *   node tests/test-runner.mjs --help       # Show options
 *   node tests/test-runner.mjs --a11y       # Include accessibility baseline checks
 */

import { resolve } from 'path';
import { fileURLToPath } from 'url';
import createConfig from './test-config.mjs';
import {
  getBrowser, closeBrowser, runTestSuite, generateReport,
  assertNoErrors, assertElementCount, assertTextIncludes, assertTitle,
  assertLocalStorage, assertCanvasHasContent, assertClickWorks,
  assertTypeWorks, assertTextExact, pass, fail, runA11yBaseline
} from './test-helpers.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ── Parse CLI args ──
const args = process.argv.slice(2);
const opts = {
  batch: null,
  app: null,
  fixed: false,
  quick: false,
  dryRun: false,
  help: false,
  a11y: false,
};

for (const arg of args) {
  if (arg === '--help' || arg === '-h') opts.help = true;
  else if (arg.startsWith('--batch=')) opts.batch = arg.split('=')[1];
  else if (arg.startsWith('--app=')) opts.app = arg.split('=')[1];
  else if (arg === '--fixed') opts.fixed = true;
  else if (arg === '--quick') opts.quick = true;
  else if (arg === '--dry-run') opts.dryRun = true;
  else if (arg === '--a11y') opts.a11y = true;
}

if (opts.help) {
  console.log(`
VACA App Test Suite

Usage:  node tests/test-runner.mjs [options]

Options:
  --batch=<n>   Run only apps from a specific batch (e.g. --batch=4)
  --app=<name>  Run only apps matching name (e.g. --app=chess)
  --fixed       Run only the 5 recently-fixed apps (Batch 3 Fixed)
  --quick       Run only basic load test for each app (no functional tests)
  --dry-run     List what would be tested without running
  --a11y        Include accessibility baseline checks for each app
  --help        Show this help
`);
  process.exit(0);
}

const batchFilter = opts.batch;
const appFilter = opts.app;
const fixedOnly = opts.fixed;
const quickMode = opts.quick;
const a11yMode = opts.a11y;

// ── Build assertion helpers for config ──
const assert = {
  assertNoErrors, assertElementCount, assertTextIncludes, assertTitle,
  assertLocalStorage, assertCanvasHasContent, assertClickWorks,
  assertTypeWorks, assertTextExact, pass, fail
};

// ── Load config ──
const allApps = createConfig(assert);

// ── Apply filters ──
let filteredApps = allApps;

if (fixedOnly) {
  filteredApps = allApps.filter(a => a.batch === 'Batch 3 (Fixed)');
  console.log(`🔍 Filter: only fixed apps (${filteredApps.length} apps)`);
}
if (batchFilter) {
  filteredApps = filteredApps.filter(a => {
    const b = a.batch || '';
    return b.toLowerCase().includes(batchFilter.toLowerCase());
  });
  console.log(`🔍 Filter: batch matching "${batchFilter}" (${filteredApps.length} apps)`);
}
if (appFilter) {
  filteredApps = filteredApps.filter(a => {
    return a.name.toLowerCase().includes(appFilter.toLowerCase()) ||
           a.file.toLowerCase().includes(appFilter.toLowerCase());
  });
  console.log(`🔍 Filter: app matching "${appFilter}" (${filteredApps.length} apps)`);
}

// In quick mode, keep only the basic load test
if (quickMode) {
  const basicTest = (page, errors) => assertNoErrors(errors, 'Loads without errors');
  // Rebuild tests to keep only the first basic load test
  for (const app of filteredApps) {
    app.tests = [basicTest];
  }
  console.log('⚡ Quick mode: basic load test only');
}

if (filteredApps.length === 0) {
  console.log('⚠️ No apps match your filter.');
  process.exit(0);
}

// ── Dry run ──
if (opts.dryRun) {
  console.log(`\n📋 DRY RUN — ${filteredApps.length} apps would be tested:\n`);
  for (const app of filteredApps) {
    const testCount = app.tests.length;
    console.log(`   ${app.file.padEnd(32)} ${app.name.padEnd(30)} ${testCount} test(s) — ${app.batch}`);
  }
  console.log(`\n   Total: ${filteredApps.length} apps, ${filteredApps.reduce((s, a) => s + a.tests.length, 0)} tests\n`);
  process.exit(0);
}

// ── Run tests ──
async function main() {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`   VACA App Test Suite`);
  console.log(`   ${filteredApps.length} apps · ${filteredApps.reduce((s, a) => s + a.tests.length, 0)} tests`);
  console.log(`   ${quickMode ? '⚡ Quick mode' : '🔬 Full functional tests'}${a11yMode ? ' · ♿ Accessibility checks' : ''}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const results = [];
  let index = 0;

  for (const app of filteredApps) {
    index++;
    console.log(`[${index}/${filteredApps.length}]`);
    // Add a11y baseline checks if --a11y flag is set
    // Wrap runA11yBaseline (returns array) into a single compound result for the runner
    const appWithA11y = a11yMode ? {
      ...app,
      tests: [...app.tests, async (page) => {
        const a11yResults = await runA11yBaseline(page);
        const passed = a11yResults.filter(r => r.status === '✅').length;
        const total = a11yResults.length;
        return {
          name: `♿ Accessibility (${passed}/${total})`,
          status: passed === total ? '✅' : '⚠️',
          detail: a11yResults.map(r => `${r.status} ${r.name}: ${r.detail || ''}`.trim()).join(' · ')
        };
      }]
    } : app;
    const result = await runTestSuite(appWithA11y);
    results.push(result);
  }

  await closeBrowser();

  // Summary
  const totalTests = results.reduce((s, r) => s + r.total, 0);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const pct = totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(1) : '0.0';
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`   RESULTS`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  console.log(`   Apps tested:    ${results.length}`);
  console.log(`   Tests run:      ${totalTests}`);
  console.log(`   Passed:         ${totalPassed} ✅`);
  console.log(`   Failed:         ${totalTests - totalPassed} ❌`);
  console.log(`   Pass rate:      ${pct}%`);
  console.log(`   Console errors: ${totalErrors}`);
  console.log();

  // Show failures
  const allFails = results.flatMap(r =>
    r.results.filter(rr => rr.status !== '✅').map(rr => ({ app: r.name, ...rr }))
  );
  if (allFails.length > 0) {
    console.log(`   ❌ Failed tests:\n`);
    for (const f of allFails) {
      console.log(`   • ${f.app} — ${f.name}`);
      if (f.detail) console.log(`     ↳ ${f.detail.slice(0, 300)}`);
    }
    console.log();
  }

  // Generate reports
  const report = generateReport(results);

  console.log(`\n✨ Test suite complete.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  closeBrowser();
  process.exit(1);
});
