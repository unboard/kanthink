// Whisker Wilds — localStorage save + cloud sync for signed-in kids.
// Local write happens on every persist; the cloud push is throttled in cloud.ts.

import type { SaveData } from './types';
import { RIVAL_CLANS, generateCat, genderOf } from './data';
import { queueCloudPush } from './cloud';

const KEY = 'catlife-save-v1';

export function newSave(seed: number, clanName: string, firstCatSeed: number): SaveData {
  const rivals: SaveData['rivals'] = {};
  for (const c of RIVAL_CLANS) rivals[c.id] = { yarn: 6 + Math.floor(Math.random() * 5), records: {} };
  // starters are girls, so every kid's main cat can be a mama someday
  const starter = generateCat(firstCatSeed, 'player', { minStat: 3, gender: 'girl' });
  return {
    v: 1,
    seed,
    wave: 0,
    clanName,
    yarn: 0,
    totalYarn: 0,
    cats: [starter],
    kittens: [],
    nursery: [],
    hadLitter: [],
    activeCatId: starter.id,
    collectedYarn: [],
    goldenDone: [],
    buildings: [],
    rivals,
    unlockedPatterns: ['solid', 'tabby', 'spots', 'tuxedo', 'calico', 'siamese'],
    unlockedAccessories: ['none', 'heartcollar'],
    treats: 0,
    fish: {},
    toybox: [],
    soundOn: true,
    musicOn: true,
    shelves: {},
    tutorialDone: [],
    createdAt: Math.floor(Date.now() / 1000),
  };
}

/** migrations shared by local loads and cloud pulls */
export function migrateSave(data: SaveData | null): SaveData | null {
  if (!data || data.v !== 1 || !Array.isArray(data.cats) || data.cats.length === 0) return null;
  if (!Array.isArray(data.kittens)) data.kittens = []; // saves from before the kitten update
  if (!Array.isArray(data.nursery)) data.nursery = []; // saves from before the family update
  if (!Array.isArray(data.hadLitter)) data.hadLitter = [];
  // saves from before genders existed: the first (starter) cat becomes a girl
  // so she can have kittens; everyone else keeps a stable derived gender
  data.cats.forEach((c, i) => {
    if (!c.gender) c.gender = i === 0 ? 'girl' : genderOf(c);
  });
  for (const k of data.kittens) if (!k.gender) k.gender = genderOf(k);
  // Style Studio update: everyone starts with the heart collar unlocked
  if (!data.unlockedAccessories.includes('heartcollar')) data.unlockedAccessories.push('heartcollar');
  // fear of water is gone — every cat in the Wilds can swim now
  for (const c of data.cats) c.traits.canSwim = true;
  for (const k of data.kittens) k.traits.canSwim = true;
  for (const n of data.nursery) n.spec.traits.canSwim = true;
  // fishing + toybox update
  if (!data.fish || typeof data.fish !== 'object') data.fish = {};
  if (!Array.isArray(data.toybox)) data.toybox = [];
  // enterable buildings update: every room starts with an empty shelf
  if (!data.shelves || typeof data.shelves !== 'object') data.shelves = {};
  return data;
}

export function loadSave(): SaveData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrateSave(JSON.parse(raw) as SaveData);
  } catch {
    return null;
  }
}

export function persistSave(data: SaveData) {
  if (typeof window === 'undefined') return;
  data.savedAt = Math.floor(Date.now() / 1000);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked — game keeps running in memory
  }
  queueCloudPush(data); // no-op unless a kid is signed in
}

export function clearSave() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
