// Capture frames while holding a movement key. With the camera decoupled from
// player facing, the background (buildings/trees) should stay in the same place
// across frames — only the character and snow trail move. I inspect these.
import { chromium } from 'playwright';

const OUT = process.argv[2] ?? '.';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:3000/snowpath', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.getByRole('button', { name: /Start Day/i }).click({ timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/c0-rest.png' });

// move right for ~2s
await page.keyboard.down('d');
await page.waitForTimeout(1000);
await page.screenshot({ path: OUT + '/c1-right.png' });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/c2-right.png' });
await page.keyboard.up('d');

// then move up (forward)
await page.keyboard.down('w');
await page.waitForTimeout(1400);
await page.screenshot({ path: OUT + '/c3-up.png' });
await page.keyboard.up('w');

console.log('ERRORS:', errors.length ? JSON.stringify(errors) : 'none');
await browser.close();
