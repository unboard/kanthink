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
// intro should show Girl chip
console.log('intro has Girl chip:', (await page.evaluate(() => document.body.innerText)).includes('Girl 🎀'));
await page.getByText('Begin the Adventure').click();
await page.waitForTimeout(7000);

// gender science checks
const science = await page.evaluate(() => {
  const g = window.__ww;
  return {
    starterGender: g.save.cats[0].gender,
    wandererGenders: g.wanderers.map((w) => w.spec.gender + ':' + w.spec.name),
  };
});
console.log('science:', JSON.stringify(science));

// open the map
await page.getByLabel('Map').click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/m1-map.png` });
// tap the map to set a waypoint (upper-left area of the island)
const mapBox = await page.locator('img[alt="Island map"]').boundingBox();
await page.mouse.click(mapBox.x + mapBox.width * 0.35, mapBox.y + mapBox.height * 0.4);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/m2-waypoint.png` });
const wp = await page.evaluate(() => JSON.stringify(window.__ww.waypoint));
console.log('waypoint:', wp);
console.log('errors:', errors.length, errors.slice(0, 4));
await browser.close();
