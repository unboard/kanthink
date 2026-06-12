// Wildwood — shared state types between the simulation (game.ts) and renderer.

import type { World } from './world';

export interface Camera {
  x: number; // world focus (tile coords)
  y: number;
  zoom: number;
}

export type BirdState = 'idle' | 'hop' | 'fly' | 'flee' | 'swim' | 'soar' | 'feed' | 'sing';

export interface BirdEntity {
  uid: number;
  species: string;
  x: number;
  y: number;
  z: number; // height above ground, world px
  zTarget: number;
  state: BirdState;
  facing: 1 | -1;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  anchorX: number;
  anchorY: number;
  landZ: number; // resting height once landed (0 = ground, >0 = perched in a tree)
  nextAction: number; // sim time of next behavior change
  nextSong: number;
  singingUntil: number;
  wingPhase: number;
  despawnAt: number;
  leaving?: boolean;
  onWater?: boolean;
  pecking?: number;
}

export interface StructureInstance {
  id: string; // instance id
  type: string; // StructureType id
  x: number;
  y: number;
  placedDay: number;
}

export type NestStage = 'building' | 'eggs' | 'chicks' | 'fledged';

export interface Nest {
  id: string;
  species: string;
  x: number;
  y: number;
  inBox?: boolean;
  stage: NestStage;
  stageStartDay: number;
  discovered: boolean;
  done?: boolean;
}

export interface Effect {
  kind: 'ripple' | 'splash' | 'note' | 'sparkle' | 'poof' | 'text';
  x: number;
  y: number;
  z?: number;
  t0: number;
  dur: number;
  text?: string;
  color?: string;
}

export type FishingPhase =
  | 'cast'
  | 'wait'
  | 'nibble'
  | 'strike'
  | 'reel'
  | 'caught'
  | 'missed';

export interface FishingState {
  phase: FishingPhase;
  bobX: number;
  bobY: number;
  castT: number; // phase timer
  nextEvent: number;
  fishId?: string;
  fishLen?: number;
  tension: number; // 0..1
  progress: number; // 0..1
  pull: number; // current fish pull strength
  pullPhase: number;
  reeling: boolean;
}

export interface Player {
  x: number;
  y: number;
  facing: 1 | -1;
  moving: boolean;
  walkPhase: number;
  moveTarget: { x: number; y: number } | null;
}

export interface JournalEntry {
  seen: boolean;
  heard: boolean;
  count: number;
  firstDay: number;
}

export interface FishRecord {
  count: number;
  best: number; // inches
  firstDay: number;
}

export interface BinoState {
  active: boolean;
  x: number; // screen px
  y: number;
  targetUid: number | null;
  progress: number; // 0..1
}

export interface QuizState {
  speciesId: string;
  options: string[]; // 3 species ids, shuffled
  birdUid: number;
}

export interface SongMarker {
  uid: number;
  species: string;
  x: number;
  y: number;
  until: number;
  identified: boolean; // species already heard/seen → label it
}

export interface GameTime {
  day: number;
  t: number; // 0..1 through the day
}

export interface GameState {
  world: World;
  cam: Camera;
  player: Player;
  birds: BirdEntity[];
  structures: StructureInstance[];
  nests: Nest[];
  effects: Effect[];
  songMarkers: SongMarker[];
  time: GameTime;
  simT: number; // seconds since world start
  seeds: number;
  journal: Record<string, JournalEntry>;
  fishRecords: Record<string, FishRecord>;
  nestsFound: number;
  nestsFledged: number;
  mode: 'explore' | 'bino' | 'fishing' | 'build';
  bino: BinoState;
  fishing: FishingState | null;
  buildSelection: string | null; // structure type id being placed
  buildPreview: { x: number; y: number; ok: boolean } | null;
  hintFish: boolean; // near water
  muted: boolean;
}
