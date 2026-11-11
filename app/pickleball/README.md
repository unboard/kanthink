# Pickleball (prototype)

Two-player singles pickleball at `/pickleball`. Practice against a bot, or open a room
and play a friend on another computer. Everything on screen is generated in code with
Three.js primitives and small canvases (court, lines, kitchen, net, players, paddles,
ball, shadows, sky, lighting, sounds). There are no image, model, texture, audio or font
files.

## Setup and env vars

No new credentials. Online play reuses the Pusher app the rest of Kanthink uses
(see `lib/sync/pusherServer.ts` and `.env.local.example`):

| Var | Used by |
| --- | --- |
| `NEXT_PUBLIC_PUSHER_KEY` | browser (`pusher-js`) and server |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | browser and server |
| `PUSHER_APP_ID` | server (auth + room lookup) |
| `PUSHER_SECRET` | server only |

The Pusher app must have **client events** enabled (it already does for the Whisker
Wilds playdates). Without these vars, Practice still works; Create/Join explain that
online play isn't set up.

## Local dev

```bash
npm run dev            # then open http://localhost:3000/pickleball
npm test               # includes tests/pickleball.test.ts
```

### Testing multiplayer in two windows

1. Make sure the four Pusher vars are in `.env.local`.
2. Window A: `/pickleball` → **Create a room**. Note the four-letter code.
3. Window B (a second browser profile or a private window works best, since each tab
   keeps its own client id in `sessionStorage`): `/pickleball` → type the code → **Join**.
   Or open the copied invite link, `/pickleball?room=CODE`.
4. Only the focused window gets keyboard input, so click between them to play both sides.
5. A third window joining the same code is turned away ("room is full").
6. Close window B mid-game: A pauses with "Opponent disconnected"; reopen B in the same
   tab (reload) and join the same code to pick up where you left off.

## Controls

Both players use the same keys on their own computer, and each sees the court from
behind their own baseline.

- **WASD** or **arrow keys**: move (up is toward the net)
- **Space**: swing, or serve when it's your serve
- While swinging: hold **left/right** to aim, **up** for a dink into the kitchen,
  **down** for a lob. Where the ball is relative to your body and how early or late you
  swing also bend the shot; a badly timed swing loses accuracy and can find the net.

## Rules implemented (singles)

- Only the serving side scores. Any server fault is a side out (one serve per side in singles).
- The server serves from the right when their score is even, left when odd.
- The serve is underhand and must land diagonally, past the kitchen line (the line counts
  as kitchen), inside the service court. The target court is lightly lit for the server.
- Two-bounce rule: the return of serve and the third shot must bounce before they are hit.
- Volleying while standing in the kitchen is a fault (the kitchen glows when you're in it).
- Out of bounds, into the net, not crossing the net, and a second bounce are faults.
- Games to 11, win by 2. Score is shown server–receiver.

## Architecture

| File | Role |
| --- | --- |
| `sim.ts` | Deterministic rules and physics. `createGame(seed)`, `step(state, inputs)` |
| `bot.ts` | Practice bot: a pure function from state to the same input a keyboard produces |
| `controller.ts` | Game loop: fixed-step sim, keyboard, guest prediction, sounds, HUD feed |
| `render.ts` | Three.js scene; reads state, never writes it |
| `net.ts` | Pusher presence-channel client, rate-limited client events |
| `room.ts` | Room codes and seat ids, shared by client and server |
| `audio.ts` | Synthesized hit/bounce/point sounds (Web Audio) |
| `Pickleball.tsx`, `page.tsx` | React shell: menu, lobby, HUD, overlays |
| `app/api/pickleball/room` | `POST` new free room code, `GET ?code=` open/full/missing |
| `app/api/pickleball/pusher-auth` | Presence auth scoped to `presence-pickleball-XXXX`, one host seat and one guest seat |

### Sync

Host-authoritative. The room creator's browser runs the sim at 120 Hz with its own
keyboard for side 0 and the guest's inputs for side 1. It sends the full state (numbers
rounded, about 600 bytes) as a `client-snap` event. The guest sends `client-input`
(`mx`, `mz`, and a running count of swing presses) when its keys change, plus a slow
heartbeat; the host clamps every field and only accepts events whose Pusher-authenticated
`user_id` is the guest seat.

Pusher caps client events at 10 per second per connection, so all sends go through a
token bucket at 9/s. Snapshots go out about every 105 ms, and right away after a hit,
bounce or point. Between snapshots the guest runs the sim's own ball physics
(`stepBall`) forward, extrapolates the host's player from its velocity, and predicts its
own player locally with the sim's `movePlayer`, snapping only if it drifts more than 4.5 ft.

Rooms have no database rows: the presence channel is the room. Member ids carry the seat
(`h_…`, `g_…`), and the auth route checks Pusher's presence list so a seat is only given
when it's free or the same client is reconnecting. Rematch needs both players to agree.

### Determinism

`sim.ts` uses a fixed 1/120 s step, a mulberry32 RNG whose state lives in `GameState.rng`,
and no `Date`, `Math.random`, timers or DOM. State is plain JSON. `step()` clones and
returns a new state. The tests run bot-vs-bot and scripted inputs twice and compare the
serialized state. Only the host simulates, so cross-browser floating-point differences
can't split the game.

## Known limitations

- Prototype: no accounts, no persistence, no spectators, no doubles.
- The guest's actions reach the host with network delay, so the guest's swing timing
  and movement land one round trip late. Fine on a good connection, noticeable on a bad one.
- Snapshots are about 9 per second (the Pusher client-event cap), so a hit by the host can
  show up a beat late on the guest's screen.
- Simplified physics: no spin, no air drag. The net is a flat 35-inch plane in the sim
  (drawn with its real sag). A ball touching the net is always a fault, so there are no
  net-cord winners or let serves.
- No momentum rule after a volley near the kitchen, no line-call disputes, no timeouts.
- Keyboard only; touch isn't supported.
- If the host closes their tab, the game is lost; the guest sees "Host disconnected".
