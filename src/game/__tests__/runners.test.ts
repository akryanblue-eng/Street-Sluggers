import { describe, expect, it } from 'vitest';
import { advanceRunners, EMPTY_BASES, type Bases } from '../runners';

describe('advanceRunners', () => {
  it('puts the batter on first with a single, nobody scores', () => {
    const { bases, runs } = advanceRunners([...EMPTY_BASES] as Bases, 1);
    expect(bases).toEqual([true, false, false]);
    expect(runs).toBe(0);
  });

  it('clears the bases and scores everyone on a grand slam', () => {
    const loaded: Bases = [true, true, true];
    const { bases, runs } = advanceRunners(loaded, 4);
    expect(runs).toBe(4);
    expect(bases).toEqual([false, false, false]);
  });

  it('scores the runner from second on a double', () => {
    const { bases, runs } = advanceRunners([false, true, false], 2);
    expect(runs).toBe(1); // runner from 2nd scores
    expect(bases).toEqual([false, true, false]); // batter to 2nd
  });

  it('does nothing on a zero-base outcome', () => {
    const { bases, runs } = advanceRunners([true, false, true], 0);
    expect(runs).toBe(0);
    expect(bases).toEqual([true, false, true]);
  });
});
