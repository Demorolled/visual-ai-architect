// Use playwright with the real (persistent) Chrome profile to stop the Kaggle run.
import { chromium } from 'playwright';

const PROFILE = process.env.CHROME_PROFILE || '/home/final-flash1/.config/google-chrome';
// NOTE: can't attach to a running Chrome's profile dir directly without --user-data-dir conflicts.
// Instead, launch with the profile but a copy-safe approach: use context for preview only.

const URL = 'https://www.kaggle.com/code/stevenawoods/vaca-qlora-round-sky1';

// Launching with the existing profile dir may fail if Chrome is already using it.
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,       // needs the session-> fine in non/headless
  channel: 'chrome',
  args: ['--no-sandbox'],
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
const txt = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('PAGE TEXT:', txt.replace(/\n+/g, ' | ').slice(0, 400));
await ctx.close();