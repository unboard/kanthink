// What a court sport has to provide so the shared pieces (the game loop, the online
// lobby, the renderer, the menus and HUD) can run it. Pickleball and volleyball each
// export one of these; nothing shared imports a particular sport's rules.

import type { Format, PlayerInput, Team, Traits } from './sim';
import type { BotTier } from './bot';
import type { CourtSpec } from './venue';
import type { FigureAction, FigureProp } from './figure';

export interface BasePlayer {
  team: Team;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** feet off the ground (volleyball) */
  y?: number;
  swingT: number;
  heat: number;
  fire: number;
  chefUntil: number;
  stats: object;
}

export interface BaseBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hot: boolean;
  super?: boolean;
}

export interface BasePoint {
  faultTeam: Team;
  faultBy: number;
  reason: string;
  scorer: Team | null;
  sideOut: boolean;
  shotBy: number;
  rally: number;
}

export interface BaseCall {
  seq: number;
  kind: string;
  player: number;
  n?: number;
}

export interface BaseState {
  seed: number;
  tick: number;
  format: Format;
  phase: 'serve' | 'rally' | 'point' | 'over';
  phaseTicks: number;
  players: BasePlayer[];
  traits: Traits[];
  scores: [number, number];
  servingTeam: Team;
  server: number;
  serverNum?: 1 | 2;
  ball: BaseBall;
  lastBounce: { x: number; z: number; tick: number; in: boolean } | null;
  lastPoint: BasePoint | null;
  pointSeq: number;
  hitSeq: number;
  bounceSeq: number;
  /** bumps each time a super spike is struck */
  superSeq?: number;
  winner: Team | -1;
  calls: BaseCall[];
  callSeq: number;
}

export interface FigurePose {
  action: FigureAction;
  /** 0..1 through the action */
  phase: number;
  /** feet off the ground */
  air: number;
  chef: boolean;
}

export interface Award {
  player: number;
  title: string;
  line: string;
}

export interface Sport<S extends BaseState = BaseState> {
  id: 'pickleball' | 'volleyball';
  name: string;
  /** the line above the title on the home screen */
  tagline: string;
  /** the loading line */
  loading: string;
  path: string;
  court: CourtSpec;
  prop: FigureProp;
  ball: 'pickle' | 'volley';
  /** how big the ball is drawn, in feet */
  ballRadius: number;
  /** seconds per sim tick */
  dt: number;
  botNames: string[];
  /** what the one button is called, and what the directions do while pressing it */
  action: string;
  hint: string;
  teamNames: [string, string];

  createGame(seed: number, opts: { format: Format; traits: Traits[]; firstTeam?: Team }): S;
  step(state: S, inputs: PlayerInput[]): S;
  rematch(prev: S, seed: number): S;
  cloneState(state: S): S;
  scoreCall(state: S): string;
  botInput(state: S, i: number, opts: { tier: BotTier; humans: number[] }): PlayerInput;
  /** an online guest moving one of its own players a tick ahead of the host */
  moveOwn(view: S, seat: number, own: BasePlayer, input: PlayerInput): void;
  /** an online guest coasting everything it doesn't control between snapshots */
  coast(view: S, age: number, own: (seat: number) => boolean): void;
  /** ticks the guest shows its own swing for */
  swingTicks: number;

  pose(state: S, i: number): FigurePose;
  /** the patch of court to light for a local server, or null */
  serveTarget(state: S): { x: number; z: number; w: number; d: number } | null;
  /** a local player is standing somewhere they shouldn't hit from */
  warnZone(state: S, focus: number[]): Team | null;

  callText(kind: string, name: string, n?: number): { text: string; sub: string };
  /** most exciting first: which callout wins the banner when several land together */
  callRank: string[];
  /** callouts loud enough to bring the crowd to its feet, 0..1 */
  callCheer: Record<string, number>;
  /** callouts that slow time for a beat */
  slowmo: string[];
  faultText(reason: string): string;
  /** the headline for the last rally */
  pointTitle(point: BasePoint, teamName: (t: Team) => string): string;
  serveHint(state: S, serverName: string, shared: boolean): string;
  awards(players: Array<{ stats: object }>): Award[];
  zeroStats: object;
}
