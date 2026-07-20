import { chromium } from '@playwright/test';
const OUT = 'C:/Users/dhodg/AppData/Local/Temp/claude/C--code-kanthink/469364a8-7826-403b-91ee-37d39ff64c25/scratchpad';
const errors = [];

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const ctxB = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
A.on('pageerror', (e) => errors.push('[A] ' + e.message));
B.on('pageerror', (e) => errors.push('[B] ' + e.message));

async function boot(page) {
  await page.goto('http://localhost:3000/catlife', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);
  await page.getByText('Begin the Adventure').click();
  await page.waitForTimeout(6500);
}
await boot(A);
await boot(B);

// A starts a playdate
await A.getByLabel('Playdate').click();
await A.waitForTimeout(600);
await A.getByText('Start a playdate').click();
await A.waitForTimeout(6000); // world regen + pusher connect
// read the code from A's overlay (reopen it)
await A.getByLabel('Playdate').click();
await A.waitForTimeout(800);
const code = await A.evaluate(() => {
  const m = document.body.innerText.match(/\b[A-Z]{4}\d{2}\b/);
  return m ? m[0] : null;
});
console.log('room code:', code);
if (!code) { console.log('NO CODE FOUND'); process.exit(1); }
await A.getByText('Back to playing').click();

// B joins with the code
await B.getByLabel('Playdate').click();
await B.waitForTimeout(600);
await B.getByText('I have a code!').click();
await B.locator('input[placeholder="PURR42"]').fill(code);
await B.getByText('Join! 🐾').click();
await B.waitForTimeout(9000); // world regen + connect + spec exchange

const stats = async (page, tag) => {
  const s = await page.evaluate(() => {
    const g = window.__ww;
    return {
      playdate: g.playdate?.code ?? null,
      remotes: g.remotes.size,
      remoteHasAvatar: [...g.remotes.values()].map((r) => !!r.avatar),
      seed: g.world.seed,
    };
  });
  console.log(tag, JSON.stringify(s));
  return s;
};
const sa = await stats(A, 'A:');
const sb = await stats(B, 'B:');
console.log('same world seed:', sa.seed === sb.seed);

// teleport B's cat next to A's cat (world coords shared), then screenshot A
const apos = await A.evaluate(() => ({ x: window.__ww.px, z: window.__ww.pz }));
await B.evaluate(({ x, z }) => {
  const g = window.__ww;
  g.px = x + 2.5; g.pz = z + 1; g.py = 99;
}, apos);
// B meows so A hears/sees it
await B.keyboard.press('m');
await A.waitForTimeout(3500);
await A.screenshot({ path: `${OUT}/p1-A-sees-B.png` });
await B.screenshot({ path: `${OUT}/p2-B-view.png` });

console.log('errors:', errors.length, errors.slice(0, 6));
await browser.close();
