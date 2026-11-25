# Soccer

Arcade soccer at `/soccer`, played like the other court games: each side keeps to the box
in front of its own goal and the ball goes back and forth between them. 1 v 1 or 2 v 2,
first to five. Same engine, characters, venues, camera, online rooms, bots and touch
controls as pickleball and volleyball.

## Playing

- **Your box**: you move only inside the shaded box in front of your goal. The middle of the
  pitch is nobody's; a ball that dies there rolls to the side that didn't play it last.
- **The walls**: the pitch is boarded all round, so the ball comes back off the side walls,
  and a shot banked off the wall into the goal counts (and gets called).
- **Protecting your goal**: stand in its way. A hard shot bounces off whoever it hits, and a
  dive covers more ground. Stopping one is a save.
- **Kickoff**: whoever conceded puts the ball in play from the front of their box.
- **Holding it**: four seconds at most, then it goes.

### Kicks (the right thumb, or I J K L U O, or one button)

| Do | Kick |
| --- | --- |
| Tap | **Drive**: low and hard along the ground |
| Swipe up | **Shoot**: rising, aimed by the tilt; a long swipe is a **rocket** |
| Short flick up | **Lob**: high, dropping in under the bar |
| Swipe sideways | **Bank**: off that side wall and back across into the goal |
| Swipe down | **Dive**: the way you're running, or across to where the ball will cross |

Swipe before the ball reaches you and the kick waits for it: a first-time strike, and a
**volley** if the ball's in the air. One button is a drive, aimed with the stick.

## Heat

Goals, saves and volleys build heat; at 100 you catch fire (a little faster, and every
kick is a flaming super shot with a beat of slow motion). Concede and the fire goes out.

## Files

| File | Role |
| --- | --- |
| `sim.ts` | Deterministic rules and physics: the boxes, walls, goals, kicks, dives, saves |
| `bot.ts` | Bots: read where the ball will cross and get in its way, fetch loose balls, pick a kick; three tiers |
| `football.ts` | Soccer as a `Sport` (named so it can't clash with `Soccer.tsx` on Windows) |
| `Soccer.tsx`, `page.tsx` | The page; everything else is `app/pickleball/CourtGame.tsx` |

The pitch, the shaded boxes, the goals and the boards are drawn in `app/pickleball/venue.ts`
(`buildGoals`); the kick pose is in `app/pickleball/figure.ts`.

```bash
npm test   # tests/soccer.test.ts: boxes, walls, goals, kicks, saves, dives, bot games
```
