# Street Sluggers ⚾

Exaggerated arcade **street baseball** — not a realistic sim. Time your swing,
barrel it up, and send it over the wall. React runs the clubhouse (menus, HUD,
game-state screens); an HTML5 Canvas gets dirty on the field (real-time action
and physics).

This repo is a **playable vertical slice**:

- A pitcher throws; you time a swing.
- The ball launches with a real trajectory (gravity + drag).
- The **outfield wall is real**: a ball over it is a home run, but a hard drive
  that strikes the wall below its top **caroms back into play** (deterministic
  restitution) and stays live.
- A homer that barely clears can be **robbed at the wall**: an eligible
  outfielder sprints over, plants a foot, and — on a player-timed leap — snags it
  for an out. Mistime it and the ball's gone.
- A **ground ball** is no longer an automatic out for landing shallow: the
  infielder must field it and, on a **player-timed throw**, beat the runner to
  first. Miss the window and the batter is safe.
- **Fielders** break on the ball — including the post-rebound landing spot:
  routine flies are caught for outs, gappers fall in, and a narrow,
  player-triggered **trick-catch** window can rob a hit — or, mistimed, turn a
  routine out into an extra-base gift.
- The play resolves as **strike, out, single, double, triple, or home run**.
- Score / inning / outs / strikes HUD, base runners, a big arcade result
  call-out, and a restart flow.
- Keyboard **and** touch controls, responsive browser layout.

## Tech stack

- **React + Vite + TypeScript** — clubhouse UI (menus, HUD, overlays).
- **HTML5 Canvas** — the field, the pitch, and batted-ball flight.
- **Vitest** — deterministic gameplay tests for the physics and rules.
- **Web Audio API** — synthesized SFX (no audio assets shipped).

## Controls

| Action        | Keyboard              | Touch / Mouse       |
| ------------- | --------------------- | ------------------- |
| Contact swing   | `Space` / `Enter` | Tap                 |
| Power swing     | `Shift` / `K`     | Long-press          |
| Trick catch     | `Space` / `Shift` | Tap (while in play) |
| Throw to first  | `Space` / `Shift` | Tap (while in play) |
| Start / retry   | `Space` / `Enter` | Tap **Play Ball**   |

Swing when the closing ring snaps onto the target reticle at the plate for a
**perfect barrel**. Early swings lift and pull the ball; late swings flatten and
push it.

Once the ball is in play, the defense reacts. A closing ring over a fielder is
your defensive-timing cue: **TRICK CATCH!** for a diving grab, **ROB IT!** at the
wall, or **THROW!** on a ground ball — press as it snaps shut. Time it and you
record the out; miss it and the runner is safe (or the ball gets past for extra
bases).

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm test           # run the gameplay test suite
npm run build      # type-check + production build
```

## Project layout

```
src/
  game/            # framework-free gameplay core (pure + testable)
    timing.ts      #   swing timing → contact quality
    launch.ts      #   contact quality → launch conditions
    physics.ts     #   projectile trajectory + deterministic wall rebound
    outcome.ts     #   trajectory → hit outcome
    fielding.ts    #   trajectory → fielder assignment, catches, trick window
    throwing.ts    #   ground-ball profile, pickup + throw-to-first race
    runners.ts     #   base-runner advancement
    engine.ts      #   state machine: pitches, count, catch|throw plays, outs
    __tests__/     #   deterministic Vitest suites
  render/field.ts  # Canvas field + ball renderer
  hooks/           # useGameEngine — drives the engine with requestAnimationFrame
  components/      # React UI: MainMenu, HUD, ResultOverlay, GameOver, GameCanvas
  audio/sound.ts   # Web Audio SFX hooks
```

The gameplay math lives in small **pure functions** so it can be unit-tested
deterministically; the engine wires them together with a real clock and a
seedable RNG, and React only ever reads snapshots.

## Design intent & what's next

Street Sluggers should feel like **exaggerated arcade street baseball**. Each
slice leaves room for the signature mechanics to come:

- **Trick catches** — ✅ `fielding.ts`: fielder pursuit, ordinary catches, and a
  player-timed diving-catch window.
- **Wall rebounds** — ✅ `physics.ts` (SS-WALL-001): a fair ball off the wall
  caroms back into play via configurable restitution, then flows through the
  *same* fielding / trick-catch / outcome / runner systems — no second pipeline.
- **Wall-assisted trick catch** — ✅ `fielding.ts` (SS-WALL-CATCH-001): a fair
  homer barely clearing the wall becomes a pending, player-timed robbery for an
  eligible outfielder — built on the *same* trick-catch window and pending-play
  machinery, retaining `home_run` as the base outcome.
- **Ground-ball throw to first** — ✅ `throwing.ts` (SS-THROW-001): an eligible
  grounder is a single unless the infielder fields it and a player-timed throw
  beats the runner. The engine's pending play is now a `catch | throw` union
  feeding the *same* outcome/runner sink — no separate scoring path.
- **Force plays, baserunning, double plays, arm ratings** — next, on top of the
  throw foundation.
- **Environmental hazards & character abilities** — isolated in the pure core so
  they can modify launch/outcome/fielding without touching rendering.

Deliberately **out of scope** for the current slices: throws to bases other than
first, force/tag logic, roster / character-selection UI, a new art pipeline,
backend, accounts, and multiplayer.
