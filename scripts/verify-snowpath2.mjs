// Verify round 2: camera tilt drag + mobile viewport nav check
import { chromium } from 'playwright';

const OUT = process.argv[2] ?? '.';
const errors = [];
const browser = await chromium.launch();

// -- mobile viewport: make sure no app nav overlays the game --
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mob.on('pageerror', (e) => errors.push('MOBILE PAGEERROR: ' + e.message));
await mob.goto('http://localhost:3000/snowpath', { waitUntil: 'domcontentloaded', timeout: 90000 });
await mob.waitForTimeout(5000);
const navCount = await mob.locator('[data-mini-nav]').count();
console.log('mobile mini-nav elements on /snowpath:', navCount);
await mob.getByRole('button', { name: /Start Day/i }).click();
await mob.waitForTimeout(2000);
await mob.screenshot({ path: OUT + '/m1-mobile.png' });
await mob.close();

// -- desktop: camera tilt via vertical drag --
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000/snowpath', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.getByRole('button', { name: /Start Day/i }).click({ timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/m2-before-tilt.png' });
// drag down on canvas => tilt toward top-down
await page.mouse.move(800, 300);
await page.mouse.down();
await page.mouse.move(800, 560, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + '/m3-tilt-down.png' });
// drag up => flatter view toward horizon
await page.mouse.move(800, 500);
await page.mouse.down();
await page.mouse.move(800, 140, { steps: 16 });
await page.mouse.up();
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + '/m4-tilt-up.png' });

console.log('ERRORS:', errors.length ? JSON.stringify(errors) : 'none');
await browser.close();
