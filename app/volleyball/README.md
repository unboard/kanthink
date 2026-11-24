# Volleyball

Arcade beach-style volleyball at `/volleyball`: 2 v 2 (or 1 v 1), one button, super
spikes. It runs on the same engine as pickleball, so the people you made there play here
too, with the same venues, online rooms, bots and touch controls.

## Playing

- Move with the stick (WASD, arrows, a gamepad, or the on-screen stick on a phone).
- **One button does everything**, by what the ball is doing:
  - first touch: **bump** it up to the net (hold toward the net to send it straight over)
  - second touch: **set** your partner (left/right picks the side, toward the net is a
    quick low set, away is a high one)
  - ball high and near you: **jump and spike**. Left/right aims line or cross, away goes
    deep, toward the net is a soft **tip** over the block
  - ball out of reach and dropping: **dive**
  - other side attacking while you're at the net: **block**
  - nothing to do: a little hop
- **Serve:** press to toss, press again near the top for a jump serve. Don't press again
  and you get a safe float serve.

### The shot pad (phones, the right stick, or I J K L U O)

The left thumb only moves. The right thumb is the shot: swipe anywhere on the right half
the way you want the ball to go, early, while it's still in the air. There's no help text:
a small compass under the thumb shows the moves, lights up when the ball is yours, and
names the shot while your thumb is still moving (the words fade once you've played a while).

- **Tap** (or a sideways swipe): pass. It waits for the ball and bumps or sets it when it
  comes down to you; sideways sets that side.
- **Swipe up**: spike. Tilt the swipe to aim, swipe long to go deep, flick short to tip.
  On a ball set to you, the last steps of the approach and the jump are taken for you;
  how hard and clean it goes depends on the read: commit early and be close.
  On their ball at the net, swipe up is a block, timed off their hitter.
- **Swipe down**: dive, the way you swiped (straight down dives at the ball).

On a gamepad the right stick does the same flicks; on one keyboard, I U O are up, J L
are sideways and K is down. The old one-button press still works everywhere.

## Rules

Rally scoring to 15, win by 2. The rally's winner serves; a team's servers alternate.
Three touches a side; a block doesn't count; in doubles nobody touches twice in a row
(singles may use all three). Lines are in. The net is in play.

## Super spikes and heat

Good digs, sets, kills, blocks and aces build heat; at 100 you catch fire (higher jump,
faster arm) until your team loses a rally or the other side digs three hot balls in one
rally. A **super spike** is any spike while on fire, or a near-perfect swing on a great
set. It gets a beat of slow motion, a flaming ball and a shockwave where it lands. Dig one
with poor timing and it knocks you flat.

## Files

| File | Role |
| --- | --- |
| `sim.ts` | Deterministic rules and physics. `createGame`, `step`, heat, super spikes |
| `bot.ts` | Bots: pass, set the human, approach and hit, block and dig; three tiers |
| `volley.ts` | Volleyball as a `Sport`: announcer lines, awards, poses, what online guests predict |
| `Volleyball.tsx`, `page.tsx` | The page; everything else is `app/pickleball/CourtGame.tsx` |

Shared with pickleball (in `app/pickleball/`): characters and the creator, the 3D figure,
venues, renderer, game loop, online rooms, sound, menus, HUD and touch controls. Rooms use
pickleball's room API; a room knows which sport it is and turns away the other one.

```bash
npm test   # tests/volleyball.test.ts: rules, serve, touches, blocks, super spikes, bot soak
```
