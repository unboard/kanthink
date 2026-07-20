import { chromium } from '@playwright/test';
const OUT = 'C:/Users/dhodg/AppData/Local/Temp/claude/C--code-kanthink/469364a8-7826-403b-91ee-37d39ff64c25/scratchpad';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
page.on('pageerror', (err) => errors.push(err.message));
await page.goto('http://localhost:3000/catlife', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => localStorage.removeItem('catlife-save-v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.getByText('Begin the Adventure').click();
await page.waitForTimeout(7500);
await page.screenshot({ path: `${OUT}/d1-welcome.png` });
// run far from camp to trigger compass
for (const [k, ms] of [['w', 5000], ['d', 1500], ['w', 5000]]) {
  await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k);
}
await page.screenshot({ path: `${OUT}/d2-compass.png` });
console.log('errors:', errors.length, errors.slice(0, 5));
await browser.close();
