import { chromium } from '@playwright/test';

const OUT = 'C:/Users/dhodg/AppData/Local/Temp/claude/C--code-kanthink/469364a8-7826-403b-91ee-37d39ff64c25/scratchpad';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[${msg.type()}] ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto('http://localhost:3000/catlife', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => localStorage.removeItem('catlife-save-v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const begin = page.getByText('Begin the Adventure');
await begin.click();
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/b1-spawn.png` });

// rotate camera with a drag (right side)
await page.mouse.move(800, 400);
await page.mouse.down();
for (let i = 0; i < 14; i++) { await page.mouse.move(800 - i * 22, 400 - i * 4); await page.waitForTimeout(30); }
await page.mouse.up();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/b2-camrotate.png` });

// walk around for a while (toward camp yarn)
for (const [key, ms] of [['w', 2600], ['a', 1400], ['w', 2600], ['d', 1200], ['w', 2400]]) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
await page.screenshot({ path: `${OUT}/b3-explored.png` });

// sneak toggle
await page.keyboard.press('q');
await page.keyboard.down('w');
await page.waitForTimeout(1500);
await page.keyboard.up('w');
await page.screenshot({ path: `${OUT}/b4-sneak.png` });
await page.keyboard.press('q');

// meow + jump
await page.keyboard.press('m');
await page.waitForTimeout(300);
await page.keyboard.press('Space');
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/b5-air.png` });

// hud state dump
const hudText = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('HUD text:', hudText.replace(/\n/g, ' | '));

console.log('=== errors ===');
for (const e of errors.slice(0, 20)) console.log(e);
console.log(`total errors: ${errors.length}`);
await browser.close();
