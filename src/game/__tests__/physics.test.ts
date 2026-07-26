import { describe, expect, it } from 'vitest';
import { FIELD } from '../constants';
import { simulateBattedBall } from '../physics';
import type { Launch } from '../types';

const launch = (over: Partial<Launch> = {}): Launch => ({
  exitVelocity: 140,
  launchAngleDeg: 30,
  sprayAngleDeg: 0,
  ...over,
});

describe('simulateBattedBall', () => {
  it('is deterministic', () => {
    const a = simulateBattedBall(launch());
    const b = simulateBattedBall(launch());
    expect(a.distance).toBeCloseTo(b.distance, 10);
    expect(a.hangTime).toBeCloseTo(b.hangTime, 10);
  });

  it('the ball comes back down to the ground', () => {
    const t = simulateBattedBall(launch());
    expect(t.landing.z).toBeCloseTo(0, 3);
    expect(t.hangTime).toBeGreaterThan(0);
  });

  it('harder contact travels farther', () => {
    const soft = simulateBattedBall(launch({ exitVelocity: 90 }));
    const hard = simulateBattedBall(launch({ exitVelocity: 150 }));
    expect(hard.distance).toBeGreaterThan(soft.distance);
  });

  it('clears the wall in the air on a big fly', () => {
    const t = simulateBattedBall(launch({ exitVelocity: 200, launchAngleDeg: 27 }));
    expect(t.distance).toBeGreaterThan(FIELD.wallRadius);
    expect(t.clearedWall).toBe(true);
    expect(t.foul).toBe(false);
  });

  it('a towering pop-up stays shallow', () => {
    const t = simulateBattedBall(launch({ exitVelocity: 85, launchAngleDeg: 80 }));
    expect(t.distance).toBeLessThan(FIELD.outMaxDistance);
    expect(t.clearedWall).toBe(false);
  });

  it('flags balls hit outside the foul lines', () => {
    const t = simulateBattedBall(launch({ sprayAngleDeg: 60 }));
    expect(t.foul).toBe(true);
    expect(t.clearedWall).toBe(false);
  });

  it('keeps a deep foul from ever being a homer', () => {
    const t = simulateBattedBall(launch({ exitVelocity: 210, sprayAngleDeg: 55 }));
    expect(t.foul).toBe(true);
    expect(t.clearedWall).toBe(false);
  });
});
