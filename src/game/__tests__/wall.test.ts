import { describe, expect, it } from 'vitest';
import { FIELD } from '../constants';
import { resolveCatch, resolveFielding } from '../fielding';
import { simulateBattedBall } from '../physics';
import type { Launch } from '../types';

const launch = (exitVelocity: number, launchAngleDeg: number, sprayAngleDeg = 0): Launch => ({
  exitVelocity,
  launchAngleDeg,
  sprayAngleDeg,
});

// A hard, flat drive that reaches the wall below its top → a carom back in play.
const REBOUND = launch(200, 10);

function maxRadius(points: { x: number; y: number }[]): number {
  return points.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0);
}

describe('wall rebound physics', () => {
  it('is deterministic: same launch + config → identical impact and landing (gate 1)', () => {
    const a = simulateBattedBall(REBOUND);
    const b = simulateBattedBall(REBOUND);
    expect(a.wallImpact).toEqual(b.wallImpact);
    expect(a.landing).toEqual(b.landing);
    expect(a.distance).toBe(b.distance);
  });

  it('a fair ball below the wall rebounds inward and never passes through (gate 2)', () => {
    const t = simulateBattedBall(REBOUND);
    expect(t.wallImpact).toBeDefined();
    expect(t.wallImpact!.height).toBeLessThanOrEqual(FIELD.wallHeight);
    expect(t.clearedWall).toBe(false);
    expect(t.foul).toBe(false);
    // The ball is never simulated beyond the wall radius (sub-foot tolerance
    // for the linear impact interpolation), and it lands back inside.
    expect(maxRadius(t.points)).toBeLessThanOrEqual(FIELD.wallRadius + 0.5);
    expect(Math.hypot(t.landing.x, t.landing.y)).toBeLessThan(FIELD.wallRadius);
  });

  it('reflects inward: the ball lands closer to home than the impact point', () => {
    const t = simulateBattedBall(REBOUND);
    const wi = t.wallImpact!;
    const impactR = Math.hypot(wi.position.x, wi.position.y);
    expect(Math.hypot(t.landing.x, t.landing.y)).toBeLessThan(impactR);
  });

  it('a ball crossing above the wall stays a home run and does not rebound (gate 3)', () => {
    const t = simulateBattedBall(launch(200, 27));
    expect(t.clearedWall).toBe(true);
    expect(t.wallImpact).toBeUndefined();
  });

  it('leaves foul-ball behavior unchanged (gate 6)', () => {
    const t = simulateBattedBall(launch(180, 10, 60));
    expect(t.foul).toBe(true);
    expect(t.wallImpact).toBeUndefined();
    expect(t.clearedWall).toBe(false);
  });

  it('applies restitution: the rebound is slower than the incoming ball', () => {
    const wi = simulateBattedBall(REBOUND).wallImpact!;
    expect(wi.reboundSpeed).toBeGreaterThan(0);
    expect(wi.reboundSpeed).toBeLessThan(wi.incomingSpeed);
  });

  it('supports at most one rebound: maxWallImpacts=0 lets the ball pass the radius', () => {
    const t = simulateBattedBall(REBOUND, { maxWallImpacts: 0 });
    expect(t.wallImpact).toBeUndefined();
    expect(Math.hypot(t.landing.x, t.landing.y)).toBeGreaterThan(FIELD.wallRadius);
  });

  it('flags a rebound below the minimum post-impact speed as deadened (both sides)', () => {
    const lively = simulateBattedBall(REBOUND, { minPostImpactSpeed: 5 });
    const dead = simulateBattedBall(REBOUND, { minPostImpactSpeed: 500 });
    expect(lively.wallImpact!.deadened).toBe(false);
    expect(dead.wallImpact!.deadened).toBe(true);
    // The physical rebound is identical; only the classification flag differs.
    expect(lively.wallImpact!.reboundSpeed).toBeCloseTo(dead.wallImpact!.reboundSpeed, 6);
  });
});

describe('wall rebound feeds the existing fielding pipeline (gate 4)', () => {
  it('a rebound trajectory resolves through resolveFielding / resolveCatch', () => {
    const t = simulateBattedBall(REBOUND);
    const play = resolveFielding(t);
    expect(play.fieldable).toBe(true);
    expect(play.fielder).toBeDefined();
    // Same distance-based outcome + catch resolution as any other batted ball —
    // no separate "wall play" pipeline.
    const dropped = resolveCatch(play, null);
    expect(['out', 'single', 'double', 'triple']).toContain(dropped.outcome);
  });
});
