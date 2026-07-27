import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';
import {
  DEFAULT_FIELDERS,
  resolveCatch,
  resolveFielding,
  type Fielder,
} from '../fielding';
import { simulateBattedBall } from '../physics';
import type { Launch, PlayResult } from '../types';

const launch = (exitVelocity: number, launchAngleDeg: number, sprayAngleDeg = 0): Launch => ({
  exitVelocity,
  launchAngleDeg,
  sprayAngleDeg,
});

// A fair ball that just clears the wall up the middle — CF can plant and leap.
const ROBBABLE = simulateBattedBall(launch(160, 19));
// A no-doubt shot well over the fence — uncatchable.
const TOWERING = simulateBattedBall(launch(200, 27));

describe('resolveFielding — wall-assist candidacy', () => {
  it('turns a reachable, low home run into a pending wall-assist play (gate 2)', () => {
    const play = resolveFielding(ROBBABLE);
    expect(play.type).toBe('wall-assist');
    expect(play.fielder.wallEligible).toBe(true);
    expect(play.ordinaryCatch).toBe(false);
    expect(play.trickable).toBe(true);
    expect(play.trickWindow).not.toBeNull();
    expect(play.baseOutcome).toBe('home_run');
  });

  it('is deterministic (gate 1)', () => {
    const a = resolveFielding(ROBBABLE);
    const b = resolveFielding(ROBBABLE);
    expect(a.type).toBe(b.type);
    expect(a.fielder.id).toBe(b.fielder.id);
    expect(a.trickWindow).toEqual(b.trickWindow);
  });

  it('a homer too high above the wall stays an immediate home run (gate 6)', () => {
    const play = resolveFielding(TOWERING);
    expect(play.type).toBe('landing');
    expect(play.trickable).toBe(false);
    expect(play.baseOutcome).toBe('home_run');
  });

  it('respects the height envelope override', () => {
    const play = resolveFielding(ROBBABLE, { wallCatch: { maxHeightAboveWall: 0.1 } });
    expect(play.type).toBe('landing');
  });

  it('needs an eligible fielder in range (gate 6)', () => {
    // Same ball, but no defender is wall-eligible → no robbery.
    const noneEligible: Fielder[] = DEFAULT_FIELDERS.map((f) => ({ ...f, wallEligible: false }));
    expect(resolveFielding(ROBBABLE, { fielders: noneEligible }).type).toBe('landing');

    // Eligible, but the arrival envelope is impossibly tight → no robbery.
    expect(resolveFielding(ROBBABLE, { wallCatch: { maxArrivalGapSec: -5 } }).type).toBe('landing');
  });

  it('never treats a below-wall rebound as a wall-assist (gate 7)', () => {
    const rebound = simulateBattedBall(launch(200, 10));
    const play = resolveFielding(rebound);
    expect(play.type).toBe('landing');
    expect(play.fieldable).toBe(true); // ordinary fielding, as before
  });
});

describe('resolveCatch — wall-assisted robbery', () => {
  const play = resolveFielding(ROBBABLE);

  it('a press inside the window robs the home run for an out (gate 3)', () => {
    const r = resolveCatch(play, { pressMs: play.trickWindow!.centerMs });
    expect(r.outcome).toBe('out');
    expect(r.caught).toBe(true);
    expect(r.kind).toBe('wall-trick');
  });

  it('no attempt leaves it a home run (gate 4)', () => {
    const r = resolveCatch(play, null);
    expect(r.outcome).toBe('home_run');
    expect(r.caught).toBe(false);
    expect(r.kind).toBe('none');
  });

  it('a mistimed committed attempt stays a home run and reports wall-trick-failed (gate 5)', () => {
    const r = resolveCatch(play, {
      pressMs: play.trickWindow!.centerMs + play.trickWindow!.successHalfMs + 100,
    });
    expect(r.outcome).toBe('home_run'); // the ball already left the neighborhood
    expect(r.caught).toBe(false);
    expect(r.kind).toBe('wall-trick-failed');
  });
});

/** Find a swing that produces a pending wall-assist play. Deterministic across
 *  seeds; slightly-late contact swings up the middle are the reachable band. */
function findWallAssist(): { engine: GameEngine; result: PlayResult } | null {
  for (let seed = 1; seed <= 20; seed++) {
    for (let off = 15; off <= 35; off += 1) {
      const engine = new GameEngine({ seed });
      engine.startGame();
      engine.beginPitch(0);
      const contactMs = engine.getState().contactMs;
      const r = engine.registerSwing(contactMs + off, 'contact');
      if (r.fielding?.type === 'wall-assist' && r.pending) return { engine, result: r };
    }
  }
  return null;
}

describe('GameEngine — wall-assist integration (gate 9)', () => {
  it('defers the provisional home run without scoring it', () => {
    const found = findWallAssist();
    expect(found).not.toBeNull();
    const { engine } = found!;
    expect(engine.hasPendingPlay()).toBe(true);
    expect(engine.getState().runs).toBe(0);
    expect(engine.getState().outs).toBe(0);
  });

  it('a timed robbery converts the homer to an out, scoring no runs', () => {
    const found = findWallAssist();
    const { engine, result } = found!;
    const center = result.fielding!.trickWindow!.centerMs;
    engine.registerTrickAttempt(center);
    const final = engine.finalizePlay();
    expect(final?.caught).toBe(true);
    expect(final?.catchKind).toBe('wall-trick');
    expect(engine.getState().outs).toBe(1);
    expect(engine.getState().runs).toBe(0); // an out never advances runners
  });

  it('a skipped robbery scores the home run exactly once', () => {
    const found = findWallAssist();
    const { engine } = found!;
    engine.finalizePlay(); // no attempt
    expect(engine.getState().runs).toBe(1); // solo homer, bases were empty
    const runsAfterOnce = engine.getState().runs;
    engine.finalizePlay(); // must not double-apply
    expect(engine.getState().runs).toBe(runsAfterOnce);
  });

  it('a mistimed robbery still scores the home run once and reports the miss', () => {
    const found = findWallAssist();
    const { engine, result } = found!;
    const center = result.fielding!.trickWindow!.centerMs;
    engine.registerTrickAttempt(center + 100000); // wildly early/late commit
    const final = engine.finalizePlay();
    expect(final?.catchKind).toBe('wall-trick-failed');
    expect(final?.outcome).toBe('home_run');
    expect(engine.getState().runs).toBe(1);
  });
});
