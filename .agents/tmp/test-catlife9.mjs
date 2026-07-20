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

// ——— 1. hopscotch duel: teleport a rival next to us and start ———
await page.evaluate(() => {
  const g = window.__ww;
  const r = g.rivals[0];
  r.x = g.px + 2; r.z = g.pz + 2;
});
await page.waitForTimeout(800);
await page.keyboard.press('e'); // context should be Duel
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/g1-choose.png` });
const hopBtn = page.getByText('Hopscotch');
if (await hopBtn.count()) {
  await hopBtn.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/g2-hopscotch.png` });
  // play: read the correct answer from the engine and tap it (kid-perfect play)
  // (headless renderer runs game-time at ~half speed, so be patient)
  for (let i = 0; i < 60; i++) {
    const done = await page.evaluate(() => {
      const g = window.__ww;
      if (!g.hop) return true;
      const n = g.hop.rows[g.hop.playerRow];
      if (n) g.hopscotchTap(n);
      return false;
    });
    if (done) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/g3-hopdone.png` });
  const doneBtn = page.getByText('Done', { exact: true });
  if (await doneBtn.count()) await doneBtn.click();
  await page.waitForTimeout(600);
  // safety: force-close any lingering duel so the rest of the test can run
  await page.evaluate(() => { if (window.__ww.duel) window.__ww.endDuel(); });
  await page.waitForTimeout(400);
}
console.log('after hopscotch, wins:', await page.evaluate(() => window.__ww.save.cats[0].wins));

// ——— 2. love flow: teleport a wanderer close, meow at it, force smitten ———
await page.evaluate(() => {
  const g = window.__ww;
  const w = g.wanderers[0];
  w.x = g.px + 2.5; w.z = g.pz;
  w.cooldown = 0; w.state = 'wander';
  const origRandom = Math.random;
  Math.random = () => 0.1; // guarantee smitten + hearts
  setTimeout(() => { Math.random = origRandom; }, 3000);
});
await page.waitForTimeout(800);
console.log('context before love:', await page.evaluate(() => JSON.stringify(window.__ww.context)));
await page.keyboard.press('e'); // "Meow at X 💕"
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/g4-love.png` });
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(2500);
  console.log('wanderer states:', await page.evaluate(() => JSON.stringify(window.__ww.wanderers.map((w) => ({ s: w.state, t: Math.round(w.stateT * 10) / 10, d: Math.round(Math.hypot(w.x - window.__ww.px, w.z - window.__ww.pz) * 10) / 10 })))));
}
const familyState = await page.evaluate(() => {
  const g = window.__ww;
  return { cats: g.save.cats.length, mate: g.save.cats.some((c) => c.isMate) };
});
console.log('family:', JSON.stringify(familyState));
await page.screenshot({ path: `${OUT}/g5-married.png` });

// ——— 3. litter at camp + nursing ———
await page.evaluate(() => {
  const g = window.__ww;
  g.px = g.world.playerCamp.x + 2; g.pz = g.world.playerCamp.z + 2; g.py = 99;
});
await page.waitForTimeout(3500);
const nursery = await page.evaluate(() => window.__ww.save.nursery.length);
console.log('nursery size:', nursery);
await page.screenshot({ path: `${OUT}/g6-litter.png` });
console.log('context at camp:', await page.evaluate(() => JSON.stringify(window.__ww.context)));
await page.keyboard.press('e'); // Nurse kittens
let growth = '[]';
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(1500);
  growth = await page.evaluate(() => JSON.stringify(window.__ww.save.nursery.map((n) => n.growth)));
  if (growth !== '[0,0,0]' && growth !== '[]') break;
}
console.log('growth after nursing:', growth);
await page.screenshot({ path: `${OUT}/g6b-nursed.png` });

// ——— 4. platform jump: teleport to tower trial, hop onto first pillar ———
await page.evaluate(() => {
  const g = window.__ww;
  const t = g.world.towerTop;
  const p = g.world.platforms.find((pp) => pp.topY < t.topY - 5); // a low pillar
  g.px = p.x + 1.8; g.pz = p.z; g.py = 99;
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/g7-tower.png` });

console.log('errors:', errors.length, errors.slice(0, 6));
await browser.close();
