# Street Sluggers ⚾

Exaggerated arcade **street baseball** — not a realistic sim. Time your swing,
barrel it up, and send it over the wall. React runs the clubhouse (menus, HUD,
game-state screens); an HTML5 Canvas gets dirty on the field (real-time action
and physics).

This repo is the **first playable vertical slice**:

- A pitcher throws; you time a swing.
- The ball launches with a real trajectory (gravity + drag) and collision with
  the outfield wall.
- The play resolves as **strike, out, single, double, triple, or home run**.
- Score / inning / outs / strikes HUD, a big arcade result call-out, and a
  restart flow.
- Keyboard **and** touch controls, responsive browser layout.

## Tech stack

- **React + Vite + TypeScript** — clubhouse UI (menus, HUD, overlays).
- **HTML5 Canvas** — the field, the pitch, and batted-ball flight.
- **Vitest** — deterministic gameplay tests for the physics and rules.
- **Web Audio API** — synthesized SFX (no audio assets shipped).

## Controls

| Action        | Keyboard              | Touch / Mouse       |
| ------------- | --------------------- | ------------------- |
| Contact swing | `Space` / `Enter`     | Tap                 |
| Power swing   | `Shift` / `K`         | Long-press          |
| Start / retry | `Space` / `Enter`     | Tap **Play Ball**   |

Swing when the closing ring snaps onto the target reticle at the plate for a
**perfect barrel**. Early swings lift and pull the ball; late swings flatten and
push it.

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
    physics.ts     #   projectile trajectory + wall collision
    outcome.ts     #   trajectory → hit outcome
    runners.ts     #   base-runner advancement
    engine.ts      #   state machine: pitches, count, outs, innings
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

Street Sluggers should feel like **exaggerated arcade street baseball**. The
slice deliberately leaves room for the signature mechanics to come — the code
has hooks and TODOs for:

- **Wall rebounds** — the outfield wall is drawn as a segmentable barrier.
- **Trick catches** — fielders / catch logic slot into the outcome step.
- **Power swings & abilities** — swing types already flow through the physics.
- **Environmental hazards & character abilities** — isolated in the pure core so
  they can modify launch/outcome without touching rendering.

No backend, accounts, multiplayer, or asset pipeline yet — by design.
