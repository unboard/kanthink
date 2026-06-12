// Paws & Found — shared types.

export type RegionId = 'woods' | 'farm' | 'creek' | 'ridge' | 'marsh';
export type Place = RegionId | 'hq';

export type PatternId =
  | 'solid'
  | 'tabby'
  | 'tuxedo'
  | 'calico'
  | 'tortie'
  | 'points'
  | 'spots'
  | 'patches'
  | 'socks'
  | 'van';

export interface AnimalAppearance {
  base: string; // main coat color
  marks: string; // patches / points / stripes color
  belly: string;
  pattern: PatternId;
  eye: string;
  eye2?: string; // odd-eyed!
  fluffy: boolean;
  earFlop?: boolean; // floppy/lop ears (dogs, rabbits)
  size: number; // 0.85–1.2 within species
}

export interface AnimalCharacter {
  id: string;
  name: string;
  species: string;
  sex: 'f' | 'm';
  appearance: AnimalAppearance;
  baby?: boolean;
  pregnant?: boolean;
  motherId?: string;
  rescuedDay?: number;
}

export interface Mission {
  id: string;
  kind: 'pet' | 'stray' | 'wildlife' | 'litter';
  animal: AnimalCharacter;
  owner: string; // owner name, or ranger for wildlife
  story: string[]; // short paragraphs; *stars* mark highlighted words
  traitIds: string[];
  trueRegion: RegionId;
  lure: string | null; // gear id that instantly calms
  trailLength: number;
  babyCount?: number; // litter missions
  reward: number;
}

export type EvidenceKind = 'prints' | 'fur' | 'chewed' | 'feather' | 'scratch' | 'nibbled' | 'mud' | 'redirect';

export interface EvidenceNode {
  x: number;
  y: number;
  kind: EvidenceKind;
  hint: string; // shown when inspected
  found: boolean;
}

export type ApproachStage = 'far' | 'near' | 'offered' | 'calmed' | 'carrying';

export interface ApproachState {
  stage: ApproachStage;
  alert: boolean; // animal is looking — freeze!
  alertT: number; // time until state flips
  spooks: number; // relocations so far (max 3, then tired)
  tired: boolean;
  offerNeeded: number; // careful-approach cycles still needed if no/wrong lure
  babiesFound: number;
}

export interface Player {
  x: number;
  y: number;
  dir: 'down' | 'up' | 'left' | 'right';
  moving: boolean;
  walkT: number;
  target: { x: number; y: number } | null;
}

export interface WildAnimalEntity {
  x: number;
  y: number;
  dir: 1 | -1;
  bob: number;
  visible: boolean; // within sight and revealed
}

export interface Resident extends AnimalCharacter {
  x: number;
  y: number;
  dir: 1 | -1;
  nextMove: number;
  hearts?: number;
  dueIn?: number; // rescues remaining until birth (pregnant residents)
}

export interface SaveData {
  version: number;
  coins: number;
  rescues: number; // total completed = XP
  level: number;
  gear: string[]; // owned gear ids
  upgrades: string[]; // facility upgrade ids
  residents: Resident[];
  book: BookEntry[]; // every rescue ever
  missionSeed: number;
  activeMission: Mission | null;
  day: number;
}

export interface BookEntry {
  animal: AnimalCharacter;
  owner: string;
  kind: Mission['kind'];
  day: number;
  outcome: 'reunited' | 'released' | 'adopted';
  babies?: number;
}

export interface Effect {
  kind: 'heart' | 'sparkle' | 'alert' | 'poof' | 'note' | 'zzz' | 'text';
  x: number;
  y: number;
  t0: number;
  dur: number;
  text?: string;
}

export interface GameSnapshot {
  place: Place;
  coins: number;
  level: number;
  rescues: number;
  missionTitle: string | null;
  phase: string;
  hintText: string;
  canPet: boolean;
  canInspect: boolean;
  carrying: boolean;
  muted: boolean;
}
