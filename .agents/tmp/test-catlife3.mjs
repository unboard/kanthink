import { chromium } from '@playwright/test';

const OUT = 'C:/Users/dhodg/AppData/Local/Temp/claude/C--code-kanthink/469364a8-7826-403b-91ee-37d39ff64c25/scratchpad';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto('http://localhost:3000/catlife', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => localStorage.removeItem('catlife-save-v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.getByText('Begin the Adventure').click();
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/c1-spawn.png` });

// open build mode (spawn is at camp)
await page.mouse.click(1042, 34); // hammer icon
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/c2-build.png` });
// close build
const done = page.getByText('✕ Done');
if (await done.count()) await done.click();
await page.waitForTimeout(500);

// clan standings
await page.mouse.click(1094, 34);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/c3-clans.png` });
const close = page.getByText('Close');
if (await close.count()) await close.click();
await page.waitForTimeout(400);

// settings
await page.mouse.click(1146, 34);
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/c4-settings.png` });
const back = page.getByText('Back to the Wilds');
if (await back.count()) await back.first().click();
await page.waitForTimeout(400);

// long run to look for critters/yarn/rivals — several directions
for (const [key, ms] of [['w', 3500], ['d', 2000], ['w', 3500], ['a', 1500], ['w', 3000]]) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
}
await page.screenshot({ path: `${OUT}/c5-far.png` });

console.log('=== errors ===');
for (const e of errors.slice(0, 15)) console.log(e);
console.log(`total errors: ${errors.length}`);
await browser.close();
