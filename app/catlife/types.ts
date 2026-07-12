// Whisker Wilds — shared types

export type PatternId =
  | 'solid'
  | 'tabby'
  | 'spots'
  | 'tuxedo'
  | 'calico'
  | 'siamese'
  | 'star'      // unlockable
  | 'moon';     // unlockable

export type AccessoryId =
  | 'none'
  | 'collar'
  | 'bandana'
  | 'bow'
  | 'flowercrown'
  | 'goldcollar'
  | 'scarf';

export interface CoatSpec {
  base: string;       // hex
  marking: string;    // hex for stripes/spots/patches
  belly: string;      // hex for chest/belly/muzzle
  pattern: PatternId;
  eyeColor: string;
  noseColor: string;
  accentColor: string; // accessory color
}

export interface CatTraits {
  canSwim: boolean;
  brave: boolean;     // will duel more, less scared
  sneaky: boolean;    // better at stalking
  speed: number;      // 1..10
  strength: number;   // 1..10
  agility: number;    // 1..10
}

export type LifeStage = 'baby' | 'kitten' | 'adult';

export interface CatSpec {
  id: string;
  name: string;
  clanId: string;      // 'player', rival clan id, or 'wanderer'
  coat: CoatSpec;
  traits: CatTraits;
  personality: string; // short quote
  favorite: string;    // favorite activity
  size: number;        // 0.85..1.15 scale
  voicePitch: number;  // 0.7..1.4
  level: number;
  xp: number;
  wins: number;
  losses: number;
  accessory: AccessoryId;
  bestAgility: number | null; // seconds
  gender?: 'girl' | 'boy';
  stage?: LifeStage;   // babies/kittens grow their patterns in as they age
  isMate?: boolean;    // fell in love with the player's cat and joined the family
  parents?: [string, string]; // names, for the guide ("kitten of X & Y")
}

export interface BuildingInstance {
  id: string;
  type: string;   // BuildableId from data
  x: number;
  z: number;
  rot: number;
}

export interface RivalClanState {
  yarn: number;
  // per rival cat W/L vs player; beat a cat twice and it joins your clan
  records: Record<string, { wins: number; losses: number; recruited?: boolean }>;
}

export interface SaveData {
  v: number;
  seed: number;
  wave: number;                 // yarn respawn wave
  clanName: string;
  yarn: number;
  totalYarn: number;            // lifetime collected
  cats: CatSpec[];
  kittens: CatSpec[];           // rescued/grown kittens; first 5 follow the player
  nursery: { spec: CatSpec; growth: number }[]; // newborn babies at camp (nurse to grow)
  hadLitter: string[];          // mate ids that already had a litter
  activeCatId: string;
  collectedYarn: string[];      // ids collected this wave
  goldenDone: string[];         // golden yarn ids completed
  buildings: BuildingInstance[];
  rivals: Record<string, RivalClanState>;
  unlockedPatterns: PatternId[];
  unlockedAccessories: AccessoryId[];
  treats: number;               // dug-up treats (bonus xp currency)
  soundOn: boolean;
  musicOn: boolean;
  tutorialDone: string[];       // tutorial step keys shown
  createdAt: number;
}

export type GameMode = 'explore' | 'sneak' | 'build' | 'agility' | 'duel';

// Rescued kittens follow the active cat and mimic it (run, sneak, jump, dig…).

export type CatAction =
  | 'idle' | 'walk' | 'run' | 'sneak' | 'jump' | 'fall'
  | 'climb' | 'swim' | 'dig' | 'scratch' | 'sit' | 'pounce' | 'meow' | 'nap';

// Context-sensitive interactable the action button targets
export interface ContextTarget {
  kind: 'dig' | 'climb' | 'scratch' | 'yarn' | 'golden' | 'duel' | 'prey' | 'agility' | 'islet' | 'building' | 'rescue'
    | 'love' | 'nurse' | 'pickup' | 'setdown' | 'stray';
  label: string;
  id: string;
  x: number;
  z: number;
}

// ——— UI bridge: game engine -> React ———
export interface HudState {
  yarn: number;
  treats: number;
  mode: GameMode;
  activeCat: { name: string; level: number; rank: string } | null;
  context: ContextTarget | null;
  swimming: boolean;
  climbing: boolean;
  sneaking: boolean;
  timeOfDay: number; // 0..1 (0=midnight .5=noon)
  agility: { running: boolean; t: number; par: number; nextGate: number; total: number } | null;
  compass: number;   // camera yaw for minimap
  camp: { angle: number; dist: number }; // direction home (camera-relative)
  rescue: { angle: number; dist: number } | null; // kitten-in-tree direction
  kittens: number;   // rescued kitten count
}

export interface ToastMsg {
  id: number;
  text: string;
  icon?: string;
  ms?: number;
}

export interface DuelState {
  rivalCat: CatSpec;
  rivalClanName: string;
  kind: 'pounce' | 'hopscotch';
  round: number;        // 0..2 (pounce)
  playerScore: number;
  rivalScore: number;
  stake: boolean;       // yarn at stake
  markerSpeed: number;
  zoneSize: number;     // 0..1 fraction of bar that scores
  results: { player: number; rival: number }[]; // per-round accuracy 0..1
  // hopscotch race: tap the number matching the next row of squares
  hs?: { rows: number[]; playerRow: number; rivalRow: number; locked: boolean };
  phase: 'choose' | 'intro' | 'aim' | 'reveal' | 'done';
  won?: boolean;
  recruited?: boolean;  // beaten twice → the rival joins your clan
}

export type ChallengeKind = 'race' | 'yarnrush' | 'hideseek' | 'agility';

export interface ChallengeState {
  kind: ChallengeKind;
  goldenId: string;
  title: string;
  desc: string;
  timeLimit: number;
  t: number;
  progress: number;     // e.g. yarn collected
  goal: number;
  phase: 'offer' | 'running' | 'won' | 'lost';
  rewardCat?: CatSpec;  // generated on win
}

export interface GameEvents {
  onHud: (h: HudState) => void;
  onToast: (t: ToastMsg) => void;
  onDuel: (d: DuelState | null) => void;
  onChallenge: (c: ChallengeState | null) => void;
  onSaveChanged: () => void;     // yarn/cats/etc changed; UI screens re-read save
  onCelebrate: (kind: 'recruit' | 'levelup' | 'build' | 'rankup', text: string) => void;
}
