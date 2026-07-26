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
