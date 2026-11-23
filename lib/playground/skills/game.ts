/**
 * The small-game skill.
 *
 * Quick, physical, one-input browser games (hop, stack, chop, throw, dodge, balance,
 * time a tap) are built on the game kit (public/kit/game-v1.js, imported as
 * 'kit/game'): a world that fits any screen, a posed stick figure with an animation
 * queue, particles, popups, shake, synthesized sound, and test modes that let the game
 * play itself. The design and play-testing rules come from goofyfish
 * (github.com/nilbuild/goofyfish, MIT, Kamran Ahmed); its house look does not. A game
 * built with this skill keeps whatever look and mechanics were asked for.
 *
 * isSmallGame decides when the skill applies; GAME_PROMPT is what the builder is told.
 * Change the prompt and the kit together.
 */

/** Words that mean "a game". */
const GAME = /\b(game|arcade|minigame|mini-game|high ?score|endless (runner|jumper)|one[- ](button|tap|touch|input)|tap to (jump|hop|flap|swing|chop|stack|drop)|flappy|platformer)\b/i

/** Small physical games: a body or an object doing one thing, timed or aimed. */
const PHYSICAL = /\b(hop|hopping|jump|jumping|stack|stacking|chop|chopping|punch|punching|throw|throwing|toss|catch|catching|dodge|dodging|balance|balancing|swing|swinging|bounce|bouncing|roll|rolling|kick|slice|slicing|smash|bop|bopping|whack|launch|fling|glide|gliding|drop|dropping|fly|flying|run|running|runner|timing|reflex|aim|stick ?figure|stickman|ragdoll|physics|juggle|knock ?down|shoot hoops|hoops)\b/i

/**
 * Games the skill isn't for: thinking games, ones built from text or cards, worlds that
 * need 3D or other players. Those keep their own build.
 */
const NOT_THIS = /\b(quiz|trivia|flash ?cards?|crossword|sudoku|word (game|search|puzzle)|spelling|times tables?|math (game|practice|facts)|chess|checkers|card game|board game|solitaire|poker|blackjack|memory (game|match)|matching game|visual novel|choose your own|text adventure|rpg|role-?playing|idle game|tycoon|simulation|sim game|3d|three\.?js|webgl|first[- ]person|open world|multiplayer|online (play|match)|real[- ]time.*players|room codes?)\b/i

/** True for code already built on the game kit: every edit to it keeps the skill. */
export function usesGameKit(code: string | null | undefined): boolean {
  return !!code && /from\s+['"]kit\/game['"]/.test(code)
}

/** Whether a brief (the ask, the card, its thread; not the code) is for a small physical game. */
export function isSmallGame(...texts: (string | null | undefined)[]): boolean {
  const all = texts.filter(Boolean).join('\n')
  if (usesGameKit(all)) return true
  if (!GAME.test(all) && !/\b(stick ?figure|stickman)\b/i.test(all)) return false
  if (NOT_THIS.test(all)) return false
  return PHYSICAL.test(all) || /\b(arcade|flappy|platformer|endless runner|one[- ](button|tap))\b/i.test(all)
}

export const GAME_PROMPT = `SMALL GAME SKILL — this app is a small physical browser game. Build it on the game kit, and follow these rules. They are about how the game plays; the look is whatever was asked for (pick a fitting one if nothing was).

WHAT MAKES ONE GOOD
- One input: tap/click, hold, swipe, or aim-and-release. Space and Enter do the same as a tap. Arrow keys only when the game truly needs steering.
- One body or object doing one physical thing: hop, stack, chop, punch, throw, balance, swing, glide.
- Playing within 3 seconds of opening. A run lasts 30 seconds to 3 minutes: a first-timer lasts at least 20 seconds, and difficulty ramps smoothly so nobody lasts forever.
- A feel moment: perfect landings, chains and combos, near misses. Reward precision with a popup, a sound, a little shake.
- Works for a 6-year-old and a 40-year-old: no rules to read, cartoon bonks only, losing feels fair and funny, never cheap.
- Original: don't recreate an existing commercial game, its name, characters or levels.

THE KIT
  import { fitView, sizeCanvas, applyCam, toWorld, visibleX, loop, Actor, P, mk, drawFigure, walkPose, blendPose,
           drawGround, contactShadow, roundRect, inkShape, inkBar, createFx, createSound, createBot, testMode,
           reportRun, createStats, rng, gauss, lerp, clamp, EASE } from 'kit/game';

- Screen: one <canvas> that FILLS the screen (fixed inset-0, touch-action: none). Design the world in fixed units, a VIEW box like { x0: -260, x1: 260, y0: -360, y1: 20, minW: 340, focusX: -50 }. On resize: sizeCanvas(canvas), then cam = fitView(VIEW). Every frame: applyCam(ctx, cam, fx.shake, 0) and draw in world units, ground at y = 0. On a portrait phone fitView shows at least minW units centered on focusX, so put the action there; things outside that slice scroll, roll or fly into view instead of sitting off-screen. Pointer → world: toWorld(cam, e.clientX, e.clientY).
- Loop: const stop = loop((dt, now) => { update(dt, now); render(); }) inside a useEffect, returning stop. Keep game state in refs or plain objects, not React state: React renders the HUD and cards over the canvas, the canvas draws the world. Update the HUD with setState only when a number changes.
- Figures (when the game has a person in it): a = new Actor(P.ready); a.push({ pose: P.crouch, d: 0.12 }, { pose: P.leap, d: 0.2, ez: 'out' }, { fn: () => land() }); a.update(dt) each frame; drawFigure(ctx, a, x, y + 8, { style, flip, scale, ink, paper, breath, under, mid, over }). Built-in poses: P.stand, ready, crouch, leap, cheer, wince, phew, punch. Make new ones by moving a few joints: mk({ hF: [44, -98], eF: [26, -96] }, P.ready). Poses face right with feet near y -8 and head near -121; hF/hB are the front/back hands, eF/eB elbows, fF/fB feet, kF/kB knees, ax a prop angle. Styles: 'classic', 'doodle', 'doodleshirt' (teams, opts.shirt), 'sketch', 'chunky', 'googly'. Props hang off the joints drawFigure passes to under/mid/over (J.handF, J.head, J.ax). For a walk, blendPose(pose, walkPose(pose, phase), w). Don't hand-draw a stick figure.
- Motion that reads right: big moves (a slam, a cheer) take several frames, never one or two. For a fast swing over the head, go through a waypoint: { path: [P.ready, P.cheer, P.punch], d: 0.25 }. Keep a working back hand in front of the body (add hang: 0 to the pose). Don't actor.clear() in the middle of a swing.
- Juice: const fx = createFx({ ink, accent }); fx.popup('Perfect!', 'CHAIN ×3', true, x, y); fx.burst(x, y, 12); fx.dust(x, 0, 30, 8); fx.kick(40); fx.update(dt) each frame; fx.draw(ctx, ...visibleX(cam)) last. Ink-style ground: drawGround(ctx, ...visibleX(cam), ink). Soft contact shadows under anything on the ground.
- Sound: const snd = createSound(); call snd.unlock() inside the first pointerdown/keydown (browsers block audio before that). Every action gets a sound: snd.SND.tok(), thunk(k), whoosh(), perfect(), streak(n), record(), lose(), or your own from snd.partial(freq, toFreq, dur, vol, type, wet) and snd.hiss(...). Keep volumes low. snd.buzz(20) vibrates on hits. A mute toggle in a corner.
- Best score: const stats = createStats('<short-game-id>'); seed from stats.initial(), stats.save({ best, plays }) when a run ends. It follows a signed-in player to any device.

SCREENS (HTML over the canvas)
- A small HUD panel top-left: the big number and a label. A hint pill at the bottom center with the control ("Tap or Space to hop") that hides after the first successful action.
- Start card: the title, a one-line tagline, the control as key chips, a big Play button (Space also starts), the best score. End card: the result as a big number, a "New best" chip when earned, one or two secondary stats, Play again (Space also restarts).
- Phone and laptop both: touch, mouse and keyboard; pointerdown, never hover; respect safe areas; no scrolling or text selection during play.

PLAY-TEST MODES (always build these; they're how the game gets checked without a person)
- const T = testMode(): ?bot plays itself, ?autoplay skips the start card, ?still freezes after one frame. T.autoplay is true for ?bot too.
- ?bot plays like a decent first-timer, never perfectly: const tick = createBot({ seed: 7 }); each frame tick(now, nextThreat, (aimError) => doWhatATapDoes(aimError)), where nextThreat is the next thing to react to with a stable id (undefined when there's none). For a hold or aim game, decide the hold length or angle with a little gauss() error.
- When a run ends, call reportRun(score, secondsSurvived). In ?bot mode, wait a second on the end card and start again, so several runs play back to back.
- Before you finish, walk through it as the bot would: does a run last 20 seconds to 3 minutes, does difficulty ramp, do start → lose → end card → play again all work by tap and by Space, does a portrait phone keep the action big and on screen? Fix what fails before you hand it over.

Keep it one page, no accounts needed to play, no network calls during play, no image or audio files: everything drawn in code and synthesized.`
