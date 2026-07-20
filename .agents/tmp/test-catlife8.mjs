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

// face the camera: drag to swing behind-view around to the front
await page.mouse.move(800, 400);
await page.mouse.down();
for (let i = 0; i < 20; i++) { await page.mouse.move(800 - i * 26, 400 + i * 3); await page.waitForTimeout(28); }
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/f1-front.png` });

// force a kitten rescue next to the player and drive the full flow
const info = await page.evaluate(() => {
  const g = window.__ww;
  g.spawnRescue();
  if (!g.rescue) return null;
  const t = g.rescue.tree;
  g.px = t.x + 1.6; g.pz = t.z + 0.4; g.py = 99; // drop in next to the tree
  return { x: t.x, z: t.z };
});
console.log('rescue spawned at:', JSON.stringify(info));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/f2-rescuetree.png` });
// press E to climb, hold W to go up
await page.keyboard.press('e');
await page.keyboard.down('w');
await page.waitForTimeout(6000);
await page.keyboard.up('w');
const kittens = await page.evaluate(() => window.__ww.save.kittens.length);
console.log('kittens rescued:', kittens);
await page.screenshot({ path: `${OUT}/f3-rescued.png` });

// jump off, walk — kitten should follow & mimic
await page.keyboard.press('Space');
await page.waitForTimeout(700);
await page.keyboard.down('s');
await page.waitForTimeout(3500);
await page.keyboard.up('s');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/f4-following.png` });
// sneak — kitten should sneak too after a beat
await page.keyboard.press('q');
await page.keyboard.down('s');
await page.waitForTimeout(2200);
await page.keyboard.up('s');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/f5-sneakmimic.png` });

console.log('errors:', errors.length, errors.slice(0, 5));
await browser.close();
