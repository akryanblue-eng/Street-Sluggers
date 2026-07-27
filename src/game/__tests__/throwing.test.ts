import { describe, expect, it } from 'vitest';
import {
  BASE_POSITIONS,
  profileBattedBall,
  resolveThrow,
  resolveThrowing,
  type ThrowConfig,
} from '../throwing';
import type { Trajectory } from '../types';

/** Build a synthetic ground-ball trajectory landing at a chosen point. */
function groundTraj(
  landing: { x: number; y: number },
  hangTime: number,
  apex = 5,
  over: Partial<Trajectory> = {},
): Trajectory {
  return {
    points: [
      { x: 0, y: 0, z: 0, t: 0 },
      { x: landing.x / 2, y: landing.y / 2, z: apex, t: hangTime / 2 },
      { x: landing.x, y: landing.y, z: 0, t: hangTime },
    ],
    landing: { x: landing.x, y: landing.y, z: 0 },
    distance: Math.hypot(landing.x, landing.y),
    hangTime,
    clearedWall: false,
    foul: false,
    ...over,
  };
}

// A grounder right at the second baseman: fieldable, and an out is possible.
const THROWABLE = groundTraj({ x: 30, y: 120 }, 1.2);

describe('profileBattedBall', () => {
  it('classifies a low, shallow fair ball as a ground ball', () => {
    const p = profileBattedBall(THROWABLE);
    expect(p.groundBall).toBe(true);
    expect(p.apexHeight).toBeLessThanOrEqual(12);
    expect(p.landingPoint).toEqual({ x: 30, y: 120 });
  });

  it('is not a ground ball when it peaks too high', () => {
    expect(profileBattedBall(groundTraj({ x: 30, y: 120 }, 1.2, 20)).groundBall).toBe(false);
  });

  it('is not a ground ball beyond the infield pickup radius', () => {
    expect(profileBattedBall(groundTraj({ x: 0, y: 260 }, 2)).groundBall).toBe(false);
  });

  it('excludes foul balls, home runs, rebounds, and wall clearances (gates 3, 8)', () => {
    expect(profileBattedBall(groundTraj({ x: 30, y: 120 }, 1.2, 5, { foul: true })).groundBall).toBe(false);
    expect(profileBattedBall(groundTraj({ x: 30, y: 120 }, 1.2, 5, { clearedWall: true })).groundBall).toBe(false);
    const wi = { t: 1, position: { x: 0, y: 0, z: 0 }, height: 5, incomingSpeed: 1, reboundSpeed: 1, normal: { x: 0, y: 1 }, deadened: false };
    expect(profileBattedBall(groundTraj({ x: 30, y: 120 }, 1.2, 5, { wallImpact: wi })).groundBall).toBe(false);
  });
});

describe('resolveThrowing — pickup + race', () => {
  it('is deterministic and assigns the nearest eligible infielder (gate 1)', () => {
    const a = resolveThrowing(THROWABLE, profileBattedBall(THROWABLE));
    const b = resolveThrowing(THROWABLE, profileBattedBall(THROWABLE));
    expect(a!.fielder.id).toBe('2B');
    expect(a!.receiver.id).toBe('1B');
    expect(a).toEqual(b);
  });

  it('builds a throwable play with a window when an out is possible (gate 4)', () => {
    const play = resolveThrowing(THROWABLE, profileBattedBall(THROWABLE))!;
    expect(play.throwable).toBe(true);
    expect(play.window).not.toBeNull();
    expect(play.idealThrowArrivalSec).toBeLessThan(play.runnerArrivalSec);
    // Throw distance is measured to first base.
    expect(play.throwDistance).toBeCloseTo(
      Math.hypot(30 - BASE_POSITIONS.first.x, 120 - BASE_POSITIONS.first.y),
      6,
    );
  });

  it('is not throwable when the fielder cannot reach the ball in time (gate 4)', () => {
    // Deep grounder in the hole — no infielder fields it before it scoots through.
    const deep = groundTraj({ x: 0, y: 178 }, 1.4);
    const play = resolveThrowing(deep, profileBattedBall(deep))!;
    expect(play.throwable).toBe(false);
    expect(play.window).toBeNull();
  });

  it('returns null when nothing is a ground ball', () => {
    const fly = groundTraj({ x: 30, y: 120 }, 1.2, 30);
    expect(resolveThrowing(fly, profileBattedBall(fly))).toBeNull();
  });
});

describe('resolveThrow — timed release', () => {
  const play = resolveThrowing(THROWABLE, profileBattedBall(THROWABLE))!;
  const center = play.window!.centerMs;

  it('a clean, well-timed throw beats the runner for an out (gate 5)', () => {
    const r = resolveThrow(play, { pressMs: center });
    expect(r.out).toBe(true);
    expect(r.outcome).toBe('out');
    expect(r.kind).toBe('throw-out');
  });

  it('no press leaves the runner safe (single) (gate 6)', () => {
    const r = resolveThrow(play, null);
    expect(r.outcome).toBe('single');
    expect(r.kind).toBe('none');
  });

  it('a wild (mistimed) throw is safe, throw-missed (gate 6)', () => {
    const r = resolveThrow(play, { pressMs: center + play.window!.successHalfMs + 80 });
    expect(r.outcome).toBe('single');
    expect(r.kind).toBe('throw-missed');
  });

  it('a clean but late throw is safe, throw-late, on a tight race (gate 6)', () => {
    // Squeeze the runner's time so a slightly-late clean release loses the race.
    const tight: Partial<ThrowConfig> = { runnerHomeToFirstSec: play.idealThrowArrivalSec + 0.02 };
    const tightPlay = resolveThrowing(THROWABLE, profileBattedBall(THROWABLE), { throw: tight })!;
    expect(tightPlay.throwable).toBe(true);
    const c = tightPlay.window!.centerMs;
    // Centered → out; late-but-clean (+80ms) → beaten to the bag.
    expect(resolveThrow(tightPlay, { pressMs: c }, tight).kind).toBe('throw-out');
    expect(resolveThrow(tightPlay, { pressMs: c + 80 }, tight).kind).toBe('throw-late');
  });

  it('never upgrades a failed throw past a single', () => {
    for (const off of [200, 500, -400]) {
      expect(resolveThrow(play, { pressMs: center + off }).outcome).toBe('single');
    }
  });
});
