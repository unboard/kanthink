# Pickleball

Arcade doubles (or singles) pickleball at `/pickleball`, built for a family to play
together: everyone makes a character of themselves, plays with a play style that suits
them, and builds heat until they catch fire. Play on one computer (shared keyboard and
gamepads, bots in empty spots), on a phone or tablet with an on-screen stick and button, or
online with a four-letter room code. Pick where to play: a park at sunset, a beach, an
indoor arena or a city rooftop at night. Everything on screen and every sound is generated
in code: no image, model, texture, audio or font files.

This folder is also the engine `/volleyball` runs on (see `app/volleyball/README.md`).
Anything not named for pickleball here is shared: `sport.ts` is the contract a sport fills in.

The game design numbers (characters, hot streaks, play styles, announcer lines, bot
tiers, family moments) came from a Gemini 4 Neon design pass and are noted where used.

## Playing

- **Who's playing?** Pick saved players (stored in this browser) or make new ones.
- **Play here:** set the court (doubles or singles), put each person in a seat with a
  device, and fill the rest with bots (Chill, Club or Champ).
  - One person: WASD or arrows, Space to swing.
  - Two people: WASD + Space, and arrows + Enter. Gamepads: stick or d-pad, A to swing.
  - People on opposite teams on one screen get a side ("broadcast") view, and the keys
    follow the screen.
- **Online:** one computer hosts and gets a code; up to three more join (each can bring
  two players). The host arranges teams and starts. Empty seats get bots; someone who
  drops mid-game is covered by a bot until they're back.
- While swinging: left/right aims, up dinks into the kitchen, down lobs. Timing and where
  the ball is relative to your body bend the shot.

- **Shot pad** (phones, the right stick, I J K L U O): tap to hit, swipe up to drive (tilt
  to aim), flick up to dink, swipe down to lob. Ask early; the swing is timed for you as
  the ball arrives and keeps the rules (it waits for the bounce on the serve and return,
  and in the kitchen). Where you stand is still yours.

## Rules implemented

- Doubles serving: games start 0–0–2, two servers per side after that, the server serves
  from the court they stand in and swaps with their partner after each point, and only
  the diagonal receiver may return the serve. Score call is server–receiver–server number.
- Singles: one serve per side; serve from the right on an even score.
- Only the serving team scores. Two-bounce rule, kitchen (non-volley zone) faults, out,
  net, not crossing, double bounce. Games to 11, win by 2.

## Hot streaks

Heat runs 0–100 per player (sim.ts has the numbers): +6 a shot that lands in, +12 a
sweet-spot contact, +22 a winner, +10 each when both teammates hit in a won rally;
−30 your own error, −18 when your team loses the rally. Trailing teams gain 25–45% faster.
From 50 you're warming up (slightly faster shots); at 100 you catch fire: faster, more
accurate shots, quicker feet, a burning ball. The fire burns down over 22 s of rally time
and 50 per rally won (one +25 top-up for a winner), and goes out at once if your team
loses a rally ("Doused") or the other team returns three of your fire shots in a row
("Ice cold defense").

## Play styles

Per character, never labeled easy: **Pro Control** (pure physics), **Arcade Flow**
(longer reach, kinder timing, wild shots bend back toward the lines) and **Turbo Fun**
(huge reach, very kind timing, an early swing at a ball that must bounce waits for the
bounce instead of faulting). Bots leave a ball to a human teammate who's close to it.

## Architecture

| File | Role |
| --- | --- |
| `sim.ts` | Pickleball's deterministic rules, physics and hot streaks. `createGame(seed, opts)`, `step(state, inputs)` |
| `bot.ts` | Pickleball bots: a pure function from state to the same input a keyboard produces |
| `pickle.ts` | Pickleball as a `Sport`: announcer lines, awards, poses, serve target, kitchen warning |
| `sport.ts` | What any court sport provides to the shared pieces below |
| `characters.ts` | Character model, presets, storage, sanitizing, victory moves, the 2D portrait |
| `figure.ts` | The 3D person: a lofted body (torso, limbs with muscle shape, fingers, sneakers), a sculpted head with eyes, lids, brows, nose, ears and a mouth, printed jersey, hair; and the animator (run, ready, swing, bump, set, spike, block, dive, knock-down, victory moves, sulk, blinking, moods) |
| `venue.ts` | The four venues: sky, light, the surface and its lines, the net, surroundings, the crowd |
| `render.ts` | Three.js view: ball, camera, sparks, dust, shockwaves, confetti, nameplates, bloom, quality fallback. Also `FigurePreview` |
| `controller.ts` | Game loop for any sport: seats, keyboard/gamepads/touch, the online lobby (host) and prediction (guest), callouts, slow motion |
| `net.ts`, `room.ts` | Pusher presence-channel client and room codes |
| `audio.ts` | Synthesized hits, bounces, points and announcer stingers (Web Audio) |
| `CourtGame.tsx`, `Creator.tsx`, `Hud.tsx`, `Touch.tsx`, `ui.tsx` | React: menus, venue picker, creator, setup, lobby, HUD, awards, touch controls |
| `app/api/pickleball/room` | `POST` a free room code, `GET ?code=` open/full/missing |
| `app/api/pickleball/pusher-auth` | Presence auth for `presence-pickleball-XXXX`: one host, up to three guests |

## Phones and slower machines

Touch devices get two circles, the same in every court game (`Touch.tsx`): a move stick
that appears wherever the left thumb lands (analog, carried online in tenths), and an
action circle wherever the right thumb lands (tap, or drag to aim, release to shoot).
Hits buzz the phone. The menus scroll on short screens. The renderer has two paths: "high" (bloom, 4x MSAA, 2k
shadows) and "low" (no post-processing, smaller shadows, lower pixel ratio). Touch devices
and low-memory machines start on low; anything else steps down by itself if it can't hold
its frame rate in the first couple of seconds.

## Setup and env vars

No new credentials. Online play reuses the Pusher app the rest of Kanthink uses
(`lib/sync/pusherServer.ts`): `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`,
`PUSHER_APP_ID`, `PUSHER_SECRET`. The Pusher app must have **client events** enabled.
Without them, playing on one computer still works.

```bash
npm run dev            # http://localhost:3000/pickleball
npm test               # tests/pickleball.test.ts covers rules, doubles, heat, styles, awards
```

In development the controller is on `window.__pb` for poking at state from the console.

## Known limitations

- Online play is host-authoritative over Pusher client events (about 9 snapshots a second
  with prediction for your own players); it plays well on normal connections, not on
  very laggy ones.
- Characters are saved per browser. To play as yourself on another computer, make your
  character there too.
