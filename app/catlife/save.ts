// Whisker Wilds — per-device localStorage save (same approach as Wildwood / Paws & Found)

import type { SaveData } from './types';
import { RIVAL_CLANS, generateCat, genderOf } from './data';

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
    unlockedAccessories: ['none'],
    treats: 0,
    soundOn: true,
    musicOn: true,
    tutorialDone: [],
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export function loadSave(): SaveData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
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
    return data;
  } catch {
    return null;
  }
}

export function persistSave(data: SaveData) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked — game keeps running in memory
  }
}

export function clearSave() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
