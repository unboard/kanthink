import { chromium } from '@playwright/test';

const OUT = 'C:/Users/dhodg/AppData/Local/Temp/claude/C--code-kanthink/469364a8-7826-403b-91ee-37d39ff64c25/scratchpad';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } }); // iPad-ish landscape
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto('http://localhost:3000/catlife', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/1-intro.png` });

// cycle kitten once
const next = page.locator('button[aria-label="Next kitten"]');
if (await next.count()) {
  await next.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/2-kitten2.png` });
}

// start the game
const begin = page.getByText('Begin the Adventure');
if (await begin.count()) {
  await begin.click();
  console.log('clicked begin');
}
await page.waitForTimeout(9000); // world gen + first frames
await page.screenshot({ path: `${OUT}/3-game.png` });

// walk forward via keyboard for a few seconds
await page.keyboard.down('w');
await page.waitForTimeout(2500);
await page.keyboard.up('w');
await page.screenshot({ path: `${OUT}/4-walked.png` });

// jump
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/5-jump.png` });

// open guide via cat chip (top-left)
await page.mouse.click(80, 30);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/6-guide.png` });

console.log('=== console errors/warnings ===');
for (const e of errors.slice(0, 30)) console.log(e);
console.log(`total: ${errors.length}`);
await browser.close();
