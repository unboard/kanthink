// Clean Cut — shared types.
// World units are metres. X runs along the street, Z toward it (front of the house is +Z), Y is up.

export type Vec2 = [number, number];
export type Poly = Vec2[];

export type TreeKind = 'oak' | 'maple' | 'birch' | 'pine' | 'ornamental';

export interface TreeDef {
  x: number;
  z: number;
  kind: TreeKind;
  height: number;
  trunk: number; // trunk radius
  crown: number; // crown radius
  ring?: number; // mulch ring radius (no grass inside)
}

export type HouseStyle = 'brick' | 'plaster' | 'siding';

export interface HouseDef {
  x: number;
  z: number;
  w: number; // along local X
  d: number; // along local Z
  rot: number; // radians, 0 = front faces +Z
  stories: 1 | 2;
  style: HouseStyle;
  trim: string;
  body: string;
  door: string;
  garage?: 'left' | 'right';
  porch?: boolean;
  roof?: 'gable' | 'hip' | 'flat';
  kind?: 'home' | 'office' | 'church';
  decor?: boolean; // neighbour house — no collision detail needed beyond the box
}

export type PropKind =
  | 'shed' | 'trampoline' | 'playset' | 'ac' | 'mailbox' | 'birdbath' | 'gnome'
  | 'boulder' | 'lamp' | 'hydrant' | 'flagpole' | 'bench' | 'raisedbed' | 'fountain'
  | 'sign' | 'grill' | 'car' | 'trailer' | 'sprinkler';

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  rot: number;
  scale?: number;
  color?: string;
}

export type BedKind = 'flowers' | 'shrubs' | 'mulch';

export interface BedDef {
  poly: Poly;
  kind: BedKind;
  palette?: string[];
}

export type HardKind = 'driveway' | 'sidewalk' | 'patio' | 'path' | 'road' | 'parking' | 'curb';

export interface HardDef {
  poly: Poly;
  kind: HardKind;
  y?: number; // height (curbs and sidewalks sit up a bit)
}

export type FenceKind = 'privacy' | 'picket' | 'rail' | 'hedge';

export interface FenceDef {
  pts: Vec2[];
  kind: FenceKind;
  h: number;
  gaps?: [number, number][]; // [segmentIndex, t] gate openings handled by splitting pts upstream
}

export interface LineDef {
  // painted road lines
  a: Vec2;
  b: Vec2;
  color: string;
  dashed?: boolean;
  width: number;
}

export interface SiteDef {
  template: TemplateId;
  lawn: Poly[]; // the job: grass inside these is what you're paid to cut
  bounds: { x0: number; z0: number; x1: number; z1: number }; // lawn bounds (+margin)
  world: { x0: number; z0: number; x1: number; z1: number }; // everything that gets built
  houses: HouseDef[];
  trees: TreeDef[];
  props: PropDef[];
  beds: BedDef[];
  hard: HardDef[];
  fences: FenceDef[];
  lines: LineDef[];
  start: { x: number; z: number; heading: number }; // where the trailer drops you
  trailer: { x: number; z: number; heading: number };
}

export type TemplateId = 'starter' | 'corner' | 'backyard' | 'estate' | 'field' | 'office' | 'wedge';

export type PatternRequest = 'any' | 'stripes' | 'diagonal' | 'checker';

export interface JobDef {
  id: string;
  seed: number;
  template: TemplateId;
  title: string; // "Starter Front Yard"
  client: string;
  street: string;
  blurb: string;
  pay: number; // at 100%
  area: number; // m² of mowable grass (approx, refined once built)
  difficulty: 1 | 2 | 3 | 4 | 5;
  obstacles: number;
  pattern: PatternRequest;
  heightIn: number; // requested cut height, inches
  mapX: number; // 0..1 on the town map
  mapY: number;
}

export interface DayState {
  v: 1;
  mode: 'daily' | 'free';
  seed: number;
  dateKey: string; // YYYY-MM-DD for daily, 'free' otherwise
  minute: number; // minutes since midnight (game clock)
  money: number;
  style: number; // style points
  doneJobs: string[];
  results: JobResult[];
  locX: number;
  locY: number;
  ended: boolean;
}

export interface JobResult {
  jobId: string;
  title: string;
  client: string;
  pay: number;
  coverage: number;
  efficiency: number;
  edges: number;
  heightMatch: number;
  pattern: number;
  patternName: string;
  damage: number;
  success: number;
  tip: number;
  earned: number;
  grade: string;
  minutes: number;
}

export interface HudState {
  mode: 'mower' | 'foot';
  clock: number;
  money: number;
  coverage: number;
  efficiency: number;
  edges: number;
  speedMph: number;
  blades: boolean;
  bladeRpm: number;
  deckIndex: number;
  heightIn: number;
  nearMower: boolean;
  trimming: boolean;
  camMode: number;
  stripeRun: number;
  overlapFlash: number;
  cat: { name: string; coat: string; owner: string; reward: number; state: 'lost' | 'carried' | 'home' } | null;
  nearCat: boolean;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'info' | 'gold';
}

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
