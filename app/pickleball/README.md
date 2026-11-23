# Pickleball

Arcade doubles (or singles) pickleball at `/pickleball`, built for a family to play
together: everyone makes a character of themselves, plays with a play style that suits
them, and builds heat until they catch fire. Play on one computer (shared keyboard and
gamepads, bots in empty spots) or online with a four-letter room code. Everything on
screen and every sound is generated in code: no image, model, texture, audio or font files.

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
| `sim.ts` | Deterministic rules, physics and hot streaks. `createGame(seed, opts)`, `step(state, inputs)` |
| `bot.ts` | Bots: a pure function from state to the same input a keyboard produces; doubles positioning, tiers |
| `characters.ts` | Character model, presets, storage, sanitizing, the 2D portrait and face drawing |
| `figure.ts` | The 3D big-head character, shared by the court and the creator's turntable |
| `render.ts` | Three.js scene; reads state, never writes it. Also `FigurePreview` for the creator |
| `controller.ts` | Game loop: seats, keyboard/gamepads, the online lobby (host) and prediction (guest), callouts, awards |
| `net.ts` | Pusher presence-channel client: hello, lobby, snapshots, inputs, rate-limited client events |
| `room.ts` | Room codes and member ids, shared by client and server |
| `audio.ts` | Synthesized hits, bounces, points and announcer stingers (Web Audio) |
| `Pickleball.tsx`, `Creator.tsx`, `Hud.tsx`, `ui.tsx` | React: menus, creator, setup, lobby, HUD, awards |
| `app/api/pickleball/room` | `POST` a free room code, `GET ?code=` open/full/missing |
| `app/api/pickleball/pusher-auth` | Presence auth for `presence-pickleball-XXXX`: one host, up to three guests |

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
