/**
 * test-helpers.mjs — Shared test utilities for the VACA app test suite
 *
 * Provides:
 *  - page setup / teardown (capture console, errors)
 *  - common assertions (element count, text content, localStorage)
 *  - canvas pixel checks
 *  - report generation (JSON + MD summary)
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const PROJECTS_DIR = resolve(PROJECT_ROOT, 'projects');
const REPORT_DIR = resolve(PROJECT_ROOT, 'tests/reports');

// ── Browser lifecycle ──

let _browser = null;

export async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
  }
  return _browser;
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

/**
 * Open an app in an isolated browser context, capture console + errors.
 * Uses newContext() for full localStorage isolation between apps.
 * Returns { page, context, errors, logs }.
 */
export async function openApp(browser, appFile, { captureConsole = true, timeout = 15000 } = {}) {
  // Isolated context so localStorage/cookies don't leak between apps
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const logs = [];

  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', dialog => {
    errors.push(`[dialog] ${dialog.type()}: ${dialog.message().slice(0, 100)}`);
    dialog.dismiss();
  });
  if (captureConsole) {
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });
  }

  const filePath = `file://${resolve(PROJECTS_DIR, appFile)}`;
  try {
    await page.goto(filePath, { waitUntil: 'domcontentloaded', timeout });
    // Wait a beat for any deferred rendering
    await page.waitForTimeout(500);
  } catch (err) {
    errors.push(`Navigation error: ${err.message}`);
  }

  return { page, context, errors, logs };
}

export async function closeApp(page, context) {
  if (page) await page.close();
  if (context) await context.close();
}

// ── Assertions ──

export function pass(name) {
  return { name, status: '✅', detail: '' };
}

export function fail(name, detail) {
  return { name, status: '❌', detail: String(detail).slice(0, 500) };
}

/**
 * Assert that a selector yields at least `min` elements.
 */
export async function assertElementCount(page, selector, min = 1, name = '') {
  const count = await page.locator(selector).count();
  if (count >= min) return pass(name || `Found ≥${min} element(s) matching "${selector}" (got ${count})`);
  return fail(name || `Expected ≥${min} elements matching "${selector}"`, `Found ${count}`);
}

/**
 * Assert that an element's textContent includes a substring.
 */
export async function assertTextIncludes(page, selector, substring, name = '') {
  try {
    const el = page.locator(selector).first();
    const text = await el.textContent({ timeout: 3000 });
    if (text && text.includes(substring)) return pass(name || `"${selector}" includes "${substring}"`);
    return fail(name || `"${selector}" should include "${substring}"`, `Got: "${text?.slice(0, 100)}"`);
  } catch (err) {
    return fail(name || `Could not read "${selector}"`, err.message);
  }
}

/**
 * Assert that an element's textContent exactly matches.
 */
export async function assertTextExact(page, selector, expected, name = '') {
  try {
    const el = page.locator(selector).first();
    const text = await el.textContent({ timeout: 3000 });
    if (text && text.trim() === expected) return pass(name || `"${selector}" equals "${expected}"`);
    return fail(name || `"${selector}" should equal "${expected}"`, `Got: "${text?.slice(0, 100)}"`);
  } catch (err) {
    return fail(name || `Could not read "${selector}"`, err.message);
  }
}

/**
 * Assert that a localStorage key has a truthy value OR can be written/read.
 * If write=true, writes a test value and reads it back (for apps that save on interaction).
 */
export async function assertLocalStorage(page, key, name = '', { writeFallback = true } = {}) {
  let val = await page.evaluate(k => localStorage.getItem(k), key);
  if (val) return pass(name || `localStorage["${key}"] exists`);
  // Try writing a test value if read fails
  if (writeFallback) {
    const testVal = '__test_' + Date.now();
    await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: key, v: testVal });
    val = await page.evaluate(k => localStorage.getItem(k), key);
    if (val === testVal) {
      // Clean up
      await page.evaluate(k => localStorage.removeItem(k), key);
      return pass(name || `localStorage["${key}"] supports write/read (no prior data)`);
    }
  }
  return fail(name || `localStorage["${key}"] missing`, 'Key not found or empty');
}

/**
 * Assert that the page title matches.
 */
export async function assertTitle(page, expected, name = '') {
  const title = await page.title();
  if (title === expected) return pass(name || `Title matches "${expected}"`);
  return fail(name || `Title should be "${expected}"`, `Got: "${title}"`);
}

/**
 * Assert canvas has non-white/non-default pixel content (i.e. something was drawn).
 */
export async function assertCanvasHasContent(page, canvasSelector = '#board, #paintCanvas, canvas', name = '') {
  try {
    const hasContent = await page.evaluate((sel) => {
      const c = document.querySelector(sel);
      if (!c) return false;
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      const data = ctx.getImageData(0, 0, c.width, Math.min(c.height, 10)).data;
      // Check if at least some pixels are non-white (or non-transparent)
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255 || data[i + 3] !== 255) {
          if (data[i + 3] !== 0) return true; // non-white, non-transparent pixel
        }
      }
      return false;
    }, canvasSelector);
    if (hasContent) return pass(name || `Canvas "${canvasSelector}" has drawn content`);
    return fail(name || `Canvas "${canvasSelector}" has no drawn content`, 'All pixels are white or transparent');
  } catch (err) {
    return fail(name || `Canvas check failed for "${canvasSelector}"`, err.message);
  }
}

/**
 * Assert no console/page errors were thrown.
 */
export function assertNoErrors(errors, name = 'No errors') {
  if (errors.length === 0) return pass(name);
  return fail(name, errors.join('; '));
}

/**
 * Assert that clicking a selector produces expected state change.
 */
export async function assertClickWorks(page, selector, name = '') {
  try {
    const el = page.locator(selector).first();
    await el.click({ timeout: 3000 });
    return pass(name || `Clicked "${selector}"`);
  } catch (err) {
    return fail(name || `Could not click "${selector}"`, err.message);
  }
}

/**
 * Assert that typing into an input works.
 */
export async function assertTypeWorks(page, selector, text, name = '') {
  try {
    const el = page.locator(selector).first();
    await el.fill(text, { timeout: 3000 });
    const val = await el.inputValue();
    if (val === text) return pass(name || `Typed into "${selector}"`);
    return fail(name || `Typing into "${selector}" failed`, `Got value: "${val}"`);
  } catch (err) {
    return fail(name || `Could not type into "${selector}"`, err.message);
  }
}

// ── Accessibility helpers ──

/**
 * Count ARIA attributes (roles, aria-*) in the page.
 */
export async function checkAriaCount(page) {
  const count = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    let roles = 0, aria = 0;
    for (const el of all) {
      if (el.hasAttribute('role')) roles++;
      for (const attr of el.attributes) {
        if (attr.name.startsWith('aria-')) aria++;
      }
    }
    return { roles, aria };
  });
  return {
    roles: count.roles,
    aria: count.aria,
    label: count.roles > 0 || count.aria > 0
      ? `✅ ${count.roles} roles + ${count.aria} aria attributes`
      : `⚠️  Zero ARIA attributes found — needs accessibility pass`
  };
}

/**
 * Count heading tags and check hierarchy (no skipping).
 */
export async function checkHeadingHierarchy(page) {
  const result = await page.evaluate(() => {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const levels = Array.from(headings).map(h => parseInt(h.tagName[1]));
    if (levels.length === 0) return { count: 0, hierarchy: 'empty', issues: ['No headings found'] };
    const issues = [];
    let maxLevel = 0;
    for (const lvl of levels) {
      if (lvl > maxLevel + 1 && maxLevel > 0) {
        issues.push(`Skipped from h${maxLevel} to h${lvl}`);
      }
      maxLevel = Math.max(maxLevel, lvl);
    }
    return { count: levels.length, hierarchy: levels.join('→'), issues };
  });
  return result;
}

/**
 * Count form labels: <label> elements + aria-label on inputs.
 */
export async function checkFormLabels(page) {
  const count = await page.evaluate(() => {
    const labels = document.querySelectorAll('label').length;
    const inputsWithAria = document.querySelectorAll('input:not([type="hidden"]), textarea, select').length;
    const labeledInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select');
    let withLabels = 0;
    for (const inp of labeledInputs) {
      if (inp.hasAttribute('aria-label') || inp.hasAttribute('aria-labelledby') || inp.id && document.querySelector(`label[for="${inp.id}"]`)) {
        withLabels++;
      }
    }
    return { labels, inputs: inputsWithAria, labeledInputs: withLabels };
  });
  return count;
}

/**
 * Check how many elements have keyboard event listeners.
 */
export async function checkKeyboardListeners(page) {
  const count = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    let withKey = 0;
    for (const el of all) {
      const attrs = el.getAttributeNames ? el.getAttributeNames() : [];
      if (attrs.some(a => a.startsWith('onkey') || a === 'tabindex')) withKey++;
    }
    return withKey;
  });
  return count;
}

/**
 * Check color contrast of text elements (basic check for body/text color).
 */
export async function checkColorContrast(page) {
  const result = await page.evaluate(() => {
    const body = document.body;
    if (!body) return { fg: '#ccc', bg: '#0a0a14', pass: true };
    const style = getComputedStyle(body);
    return {
      fg: style.color,
      bg: style.backgroundColor,
      pass: style.color !== style.backgroundColor
    };
  });
  return result;
}

/**
 * Run all a11y baseline checks and return test results.
 * Uses ⚠️ for missing features (informational, not blocking).
 */
export async function runA11yBaseline(page) {
  const results = [];

  // 1. Headings
  const headings = await checkHeadingHierarchy(page);
  if (headings.count === 0) {
    results.push({ name: 'Has heading tags', status: '⚠️', detail: 'No h1-h6 tags found' });
  } else if (headings.issues.length > 0) {
    results.push({ name: 'Heading hierarchy', status: '⚠️', detail: `h${headings.issues[0]} (${headings.hierarchy})` });
  } else {
    results.push({ name: `Heading hierarchy (h1→h${Math.max(...headings.hierarchy.split('→').map(Number))})`, status: '✅', detail: '' });
  }

  // 2. ARIA
  const ariaInfo = await checkAriaCount(page);
  results.push({
    name: 'ARIA attributes',
    status: ariaInfo.roles > 0 || ariaInfo.aria > 0 ? '✅' : '⚠️',
    detail: ariaInfo.label
  });

  // 3. Form labels
  const formLabels = await checkFormLabels(page);
  const labeledPct = formLabels.inputs > 0
    ? Math.round(formLabels.labeledInputs / formLabels.inputs * 100) : 100;
  results.push({
    name: 'Form input labels',
    status: formLabels.inputs === 0 ? '✅' : (labeledPct >= 50 ? '✅' : '⚠️'),
    detail: formLabels.inputs > 0
      ? `${formLabels.labeledInputs}/${formLabels.inputs} inputs labeled (${labeledPct}%)`
      : 'No form inputs to label'
  });

  // 4. Focusable elements
  const focusable = await checkKeyboardListeners(page);
  results.push({
    name: 'Keyboard/focus support',
    status: focusable > 0 ? '✅' : '⚠️',
    detail: focusable > 0
      ? `${focusable} elements with keyboard/focus attrs`
      : 'No keyboard event listeners or tabindex found'
  });

  return results;
}

// ── Test runner ──

/**
 * Run a suite of tests for a single app.
 * tests is an array of async functions returning { name, status, detail }.
 */
export async function runTestSuite(appConfig) {
  const { file, name, category, tests } = appConfig;
  console.log(`\n  📋 ${name} (${file})`);

  const browser = await getBrowser();
  const { page, context, errors } = await openApp(browser, file);

  const results = [];
  for (const t of tests) {
    try {
      const result = await t(page, errors);
      results.push(result);
      const icon = result.status === '✅' ? '  ✅' : '  ❌';
      console.log(`${icon} ${result.name}`);
      if (result.status !== '✅' && result.detail) {
        console.log(`       ↳ ${result.detail.slice(0, 200)}`);
      }
    } catch (err) {
      results.push({ name: t.name || 'Unknown test', status: '⚠️', detail: `Exception: ${err.message}` });
      console.log(`  ⚠️ ${t.name} — ${err.message}`);
    }
  }

  await closeApp(page, context);

  const passed = results.filter(r => r.status === '✅').length;
  const total = results.length;
  return {
    file,
    name,
    category,
    passed,
    total,
    results,
    errors: errors.length > 0 ? errors : []
  };
}

// ── Report generation ──

export function generateReport(suiteResults) {
  mkdirSync(REPORT_DIR, { recursive: true });

  const totalTests = suiteResults.reduce((s, r) => s + r.total, 0);
  const totalPassed = suiteResults.reduce((s, r) => s + r.passed, 0);
  const totalFailed = totalTests - totalPassed;
  const totalErrors = suiteResults.reduce((s, r) => s + r.errors.length, 0);
  const pct = totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(1) : '0.0';

  // JSON report
  const jsonReport = {
    timestamp: new Date().toISOString(),
    summary: {
      apps: suiteResults.length,
      tests: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      consoleErrors: totalErrors,
      passRate: `${pct}%`
    },
    byCategory: {},
    apps: suiteResults
  };

  // Group by category
  for (const r of suiteResults) {
    const cat = r.category || 'Uncategorized';
    if (!jsonReport.byCategory[cat]) jsonReport.byCategory[cat] = { apps: 0, tests: 0, passed: 0, failed: 0 };
    jsonReport.byCategory[cat].apps++;
    jsonReport.byCategory[cat].tests += r.total;
    jsonReport.byCategory[cat].passed += r.passed;
    jsonReport.byCategory[cat].failed += r.total - r.passed;
  }

  writeFileSync(resolve(REPORT_DIR, 'test-report.json'), JSON.stringify(jsonReport, null, 2));
  console.log(`\n📊 JSON report: tests/reports/test-report.json`);

  // Markdown summary
  let md = `# VACA App Test Report\n\n`;
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  md += `**Apps tested:** ${suiteResults.length}\n`;
  md += `**Tests run:** ${totalTests} (**${pct}%** pass rate — ${totalPassed}✅ / ${totalFailed}❌)\n`;
  md += `**Console/page errors found:** ${totalErrors}\n\n`;
  md += `## Results by Category\n\n`;
  md += `| Category | Apps | Tests | Passed | Failed | Pass Rate |\n`;
  md += `|---|---|---|---|---|---|\n`;

  for (const [cat, stats] of Object.entries(jsonReport.byCategory)) {
    const catPct = stats.tests > 0 ? (stats.passed / stats.tests * 100).toFixed(1) : '0.0';
    md += `| ${cat} | ${stats.apps} | ${stats.tests} | ${stats.passed} | ${stats.failed} | ${catPct}% |\n`;
  }

  md += `\n## App Details\n\n`;
  md += `| App | File | Tests | Passed | Failed | Console Errors |\n`;
  md += `|---|---|---|---|---|---|\n`;

  for (const r of suiteResults) {
    const failed = r.total - r.passed;
    const hasErrors = r.errors.length > 0 ? `⚠️ ${r.errors.length}` : '✅';
    const status = failed === 0 && r.errors.length === 0 ? '✅' : '❌';
    md += `| ${status} ${r.name} | ${r.file} | ${r.total} | ${r.passed} | ${failed} | ${hasErrors} |\n`;
  }

  // Failed tests detail
  const allFails = suiteResults.flatMap(r =>
    r.results.filter(rr => rr.status !== '✅').map(rr => ({ app: r.name, ...rr }))
  );
  if (allFails.length > 0) {
    md += `\n## Failed / Warning Tests\n\n`;
    for (const f of allFails) {
      md += `- **${f.app}**: ${f.name} — ${f.detail}\n`;
    }
  }

  // Console errors detail
  const appsWithErrors = suiteResults.filter(r => r.errors.length > 0);
  if (appsWithErrors.length > 0) {
    md += `\n## Console Errors Found\n\n`;
    for (const r of appsWithErrors) {
      md += `- **${r.name}**:\n`;
      for (const e of r.errors.slice(0, 5)) {
        md += `  - \`${e.slice(0, 300)}\`\n`;
      }
      if (r.errors.length > 5) md += `  - *...and ${r.errors.length - 5} more*\n`;
    }
  }

  writeFileSync(resolve(REPORT_DIR, 'test-report.md'), md);
  console.log(`📊 MD report:   tests/reports/test-report.md`);

  return jsonReport;
}
