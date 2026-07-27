import { beforeEach, describe, expect, it } from 'vitest';
import { GameEngine } from '../engine';

/** Swing exactly on the ideal contact moment of the current pitch. */
function perfectSwing(engine: GameEngine, startMs = 0) {
  engine.beginPitch(startMs);
  const contactMs = engine.getState().contactMs;
  return engine.registerSwing(startMs + contactMs, 'power');
}

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine({ seed: 12345, inningsPerGame: 3 });
    engine.startGame();
  });

  it('turns a perfectly timed power swing into solid contact', () => {
    const result = perfectSwing(engine);
    expect(result.timing.contact).toBe(true);
    expect(result.timing.band).toBe('perfect');
    expect(result.outcome).not.toBe('strike');
  });

  it('rings up the batter after three strikes', () => {
    let t = 0;
    for (let k = 0; k < 3; k++) {
      engine.beginPitch(t);
      const contact = engine.getState().contactMs;
      // Swing wildly late, well outside the contact window → whiff.
      engine.registerSwing(t + contact + 1000);
      engine.advanceAfterResult();
      t += 2000;
    }
    expect(engine.getState().strikes).toBe(0); // reset after the out
    expect(engine.getState().outs).toBe(1);
  });

  it('a take is a called strike', () => {
    engine.beginPitch(0);
    const r = engine.registerTake();
    expect(r.outcome).toBe('strike');
    expect(engine.getState().strikes).toBe(1);
  });

  it('reports the swing window has closed only after it elapses', () => {
    engine.beginPitch(1000);
    const contact = engine.getState().contactMs;
    expect(engine.pitchExpired(1000 + contact)).toBe(false);
    expect(engine.pitchExpired(1000 + contact + 500)).toBe(true);
  });

  it('advances innings after three outs and ends the game', () => {
    let t = 0;
    // Strike out repeatedly; three whiffs make an out.
    for (let i = 0; i < 30 && engine.getState().phase !== 'gameover'; i++) {
      engine.beginPitch(t);
      const contact = engine.getState().contactMs;
      engine.registerSwing(t + contact + 1000);
      engine.advanceAfterResult();
      t += 2000;
    }
    const s = engine.getState();
    expect(s.phase).toBe('gameover');
    expect(s.inning).toBeGreaterThan(3);
  });

  it('is reproducible for a given seed', () => {
    const a = new GameEngine({ seed: 999 });
    a.startGame();
    const b = new GameEngine({ seed: 999 });
    b.startGame();
    const ra = perfectSwing(a);
    const rb = perfectSwing(b);
    expect(ra.outcome).toBe(rb.outcome);
    expect(ra.trajectory?.distance).toBeCloseTo(rb.trajectory?.distance ?? -1, 8);
  });
});

/** Swing across a range of timings on a fresh engine until we find a batted
 *  ball whose fielding play matches `pick`. Keeps the fielding integration
 *  tests independent of exact pitch jitter. */
function findPlay(
  seed: number,
  pick: (r: import('../types').PlayResult) => boolean,
): { engine: GameEngine; contactMs: number } | null {
  for (let off = -150; off <= 150; off += 3) {
    const engine = new GameEngine({ seed });
    engine.startGame();
    engine.beginPitch(0);
    const contactMs = engine.getState().contactMs;
    const r = engine.registerSwing(contactMs + off, 'contact');
    if (r.pending && r.fielding && pick(r)) return { engine, contactMs };
  }
  return null;
}

describe('GameEngine — fielding integration', () => {
  it('defers a fielding play and does not touch the score until finalized', () => {
    const found = findPlay(5, (r) => !!r.fielding);
    expect(found).not.toBeNull();
    const { engine } = found!;
    expect(engine.hasPendingPlay()).toBe(true);
    // Score untouched while the play is pending.
    expect(engine.getState().outs).toBe(0);
    expect(engine.getState().runs).toBe(0);

    engine.finalizePlay();
    expect(engine.hasPendingPlay()).toBe(false);
    expect(engine.getState().lastResult?.pending).toBe(false);
  });

  it('records an out when a trick catch is timed inside the window', () => {
    const found = findPlay(
      5,
      (r) => !!r.fielding && r.fielding.trickable && !r.fielding.ordinaryCatch,
    );
    expect(found).not.toBeNull();
    const { engine } = found!;
    const center = engine.getState().lastResult!.fielding!.trickWindow!.centerMs;

    engine.registerTrickAttempt(center); // perfectly timed dive
    const result = engine.finalizePlay();
    expect(result?.caught).toBe(true);
    expect(result?.catchKind).toBe('trick');
    expect(engine.getState().outs).toBe(1);
  });

  it('lets the ball drop for a hit when no trick is attempted', () => {
    const found = findPlay(
      5,
      (r) => !!r.fielding && r.fielding.trickable && !r.fielding.ordinaryCatch,
    );
    expect(found).not.toBeNull();
    const { engine } = found!;
    const base = engine.getState().lastResult!.fielding!.baseOutcome;

    const result = engine.finalizePlay();
    expect(result?.caught).toBe(false);
    expect(result?.outcome).toBe(base);
  });
});
