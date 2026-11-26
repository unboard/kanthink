# Soccer

Arcade soccer at `/soccer`: small-sided (1 v 1 or 2 v 2 out on the pitch) in a walled
arena, plus a goalkeeper on each side that the game plays. First to five. Same engine,
characters, venues, online rooms, bots and touch controls as pickleball and volleyball.

The game is built around the keeper, the way the arcade soccer people love it is: a shot
at the keeper gets saved, so scoring is about where and how, not just pressing shoot.

## Playing

- Run anywhere on the pitch (not into either keeper's area). Run into the ball to dribble.
- Stay on someone dribbling for a moment and you win it; a slide tackle wins it at once.
- The boards are in play: bank passes and shots off the walls.
- Kickoff from the middle after each goal, by the side that conceded.

### Finishing (the right thumb, I J K L U O, or one button)

| Do | Finish |
| --- | --- |
| Tap | **Low shot**, placed by the stick (a pass, with a teammate and no aim) |
| Swipe up, tilted | **Corner**: tilt picks the side |
| Long swipe up | **Top corner**: hardest to save, can sail over |
| Short flick up | **Chip**: over a keeper who has come off its line |
| Sideways | **Curler**: starts outside the post and bends in |
| Swipe down | **Tackle** (without the ball) |

Swipe before the ball reaches you and you strike it **first time**: harder, and the keeper
is a beat late. A defender on you, or shooting on the run, costs accuracy.

### The keeper

Stands on the line between ball and goal, coming out to narrow the angle as you get close
(which is when a chip works). It reads each shot, a little wrong on a hard one, steps
across and dives. It catches what it gets to cleanly, parries the rest, and throws it out
long to a teammate. A super shot (on fire) can knock it flat.

Measured against a settled keeper (tests/soccer.test.ts pins these): down the middle
almost never scores; a corner from the edge of the box about half the time; a chip from
close most of the time, from distance hardly ever.

## Files

| File | Role |
| --- | --- |
| `sim.ts` | Deterministic rules and physics: dribbling, finishes, curl, the keepers, walls, goals |
| `bot.ts` | Field-player bots: carry it, pick a finish (better tiers find corners, curl and chip), support, tackle |
| `football.ts` | Soccer as a `Sport` (named so it can't clash with `Soccer.tsx` on Windows) |
| `Soccer.tsx`, `page.tsx` | The page; everything else is `app/pickleball/CourtGame.tsx` |

Keepers are extra players after the seats: the controller gives them a keeper's kit and
leaves them out of the HUD. The pitch, goals and boards are in `app/pickleball/venue.ts`.

```bash
npm test   # tests/soccer.test.ts: the keeper's save rates, finishes, walls, goals, bot games
```
