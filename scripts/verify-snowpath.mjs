// Headless verification of /snowpath: load, start a day, drive, screenshot
import { chromium } from 'playwright';

const OUT = process.argv[2] ?? '.';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:3000/snowpath', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: OUT + '/1-menu.png' });

// start the day
const startBtn = page.getByRole('button', { name: /Start Day/i });
await startBtn.waitFor({ state: 'visible', timeout: 30000 });
await startBtn.click();
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/2-playing.png' });

// drive forward with W for a bit, orbit slightly
await page.keyboard.down('w');
await page.waitForTimeout(2500);
await page.keyboard.up('w');
await page.screenshot({ path: OUT + '/3-walked.png' });

// walk toward plow area, press E to try action
await page.keyboard.down('a');
await page.waitForTimeout(1500);
await page.keyboard.up('a');
await page.keyboard.press('e');
await page.waitForTimeout(1000);
await page.screenshot({ path: OUT + '/4-action.png' });

// throw a snowball
await page.keyboard.press(' ');
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/5-snowball.png' });

// let requests spawn
await page.waitForTimeout(9000);
await page.screenshot({ path: OUT + '/6-requests.png' });

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
await browser.close();

