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
await page.waitForTimeout(7000);
await page.evaluate(() => {
  const g = window.__ww;
  const r = g.rivals[0];
  r.x = g.px + 2; r.z = g.pz + 2;
});
await page.waitForTimeout(800);
await page.keyboard.press('e');
await page.waitForTimeout(800);
await page.getByText('Hopscotch').click();
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/h1-board.png` });
// hop a few rows to see highlight advance + dimmed completed rows
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    const g = window.__ww;
    if (g.hop) g.hopscotchTap(g.hop.rows[g.hop.playerRow]);
  });
  await page.waitForTimeout(1400);
}
await page.screenshot({ path: `${OUT}/h2-midrace.png` });
console.log('errors:', errors.length, errors.slice(0, 4));
await browser.close();
