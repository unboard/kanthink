# Soccer

Arcade soccer at `/soccer`: 1 v 1 or 2 v 2 on a small walled pitch, two goals, first to
five. It runs on the same engine as pickleball and volleyball, so the people you made
there play here too, with the same venues, online rooms, bots and touch controls.

## Playing

- Move with the stick (WASD, arrows, a gamepad, or the left half of a phone screen).
- **Dribble** by running into the ball: it stays at your feet while you run.
- **One button**: with the ball, shoot at their goal (left/right aims across the mouth).
  Without it, slide tackle whoever has it, or hit a loose ball at your feet first time.
- **The walls**: the pitch is boarded all round, so the ball never goes out. It comes back
  off the boards, and a goal off the wall is called a bank shot.
- **Protect your goal**: a hard shot bounces off anyone it hits. Stop one in front of your
  own goal and it's a save. Stay on someone dribbling for a moment and you win the ball.
- **Kickoff**: the team that conceded kicks off from the middle; the other side waits
  outside the circle. Nobody taking it? It starts on its own after six seconds.

### The shot pad (phones, the right stick, or I J K L U O)

- **Tap**: pass to your teammate (alone, a push forward to run onto).
- **Swipe up**: shoot. Tilt the swipe to aim; a long swipe is a rocket, a short flick a chip.
- **Sideways**: pass that way.
- **Swipe down**: slide tackle the way you're running (at the ball if you're standing still).

Swipe before the ball reaches you and the shot waits a moment for it.

## Heat

Goals, saves and tackles build heat; at 100 you catch fire (a little faster, and every
shot is a flaming super shot with a beat of slow motion). Concede and the fire goes out.

## Files

| File | Role |
| --- | --- |
| `sim.ts` | Deterministic rules and physics: the walls, goals, dribbling, kicks, tackles, saves |
| `bot.ts` | Bots: carry it and shoot, get open, chase or mind the goal; three tiers |
| `football.ts` | Soccer as a `Sport`: announcer lines, awards, poses, facing (named so it doesn't clash with `Soccer.tsx` on Windows) |
| `Soccer.tsx`, `page.tsx` | The page; everything else is `app/pickleball/CourtGame.tsx` |

The pitch, goals and boards are drawn in `app/pickleball/venue.ts` (`buildGoals`); the
kick and slide poses are in `app/pickleball/figure.ts`. Soccer is the one sport whose
players turn to face where they run: `Sport.facing`.

```bash
npm test   # tests/soccer.test.ts: walls, goals, saves, dribble, shoot, tackle, bot games
```
