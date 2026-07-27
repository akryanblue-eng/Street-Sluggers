import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIELDERS,
  resolveCatch,
  resolveFielding,
  upgradeToExtraBase,
  type Fielder,
} from '../fielding';
import { computeLaunch } from '../launch';
import { simulateBattedBall } from '../physics';
import { resolveTiming } from '../timing';
import type { Trajectory } from '../types';

const traj = (over: Partial<Trajectory>): Trajectory => ({
  points: [],
  landing: { x: 0, y: 0, z: 0 },
  distance: 0,
  hangTime: 1,
  clearedWall: false,
  foul: false,
  ...over,
});

/** A single fielder at the origin makes arrival-gap arithmetic predictable. */
const ONE_FIELDER: readonly Fielder[] = [{ id: 'X', label: 'X', x: 0, y: 0 }];

describe('resolveFielding — assignment & geometry', () => {
  it('is deterministic: identical trajectories give identical plays (gate 1)', () => {
    const t = resolveTiming(1150, 1100);
    const launch = computeLaunch(t, 'contact');
    const a = resolveFielding(simulateBattedBall(launch));
    const b = resolveFielding(simulateBattedBall(launch));
    expect(a.fielder.id).toBe(b.fielder.id);
    expect(a.arrivalGapSec).toBeCloseTo(b.arrivalGapSec, 10);
    expect(a.baseOutcome).toBe(b.baseOutcome);
    expect(a.playPoint).toEqual(b.playPoint);
  });

  it('assigns the nearest fielder by time to the landing spot', () => {
    // A lazy fly to shallow right-center → the closest infielder/outfielder.
    const play = resolveFielding(
      traj({ landing: { x: 40, y: 150, z: 0 }, distance: 155, hangTime: 3.5 }),
      { fielders: DEFAULT_FIELDERS },
    );
    expect(play.fielder.id).toBe('2B');
    expect(play.route.to).toEqual({ x: 40, y: 150 });
  });

  it('marks a routine fly ball as an ordinary catch', () => {
    const play = resolveFielding(
      traj({ landing: { x: 0, y: 50, z: 0 }, distance: 50, hangTime: 5 }),
      { fielders: ONE_FIELDER },
    );
    expect(play.ordinaryCatch).toBe(true);
    expect(play.trickable).toBe(true);
  });

  it('does not field a home run or a foul ball', () => {
    const hr = resolveFielding(traj({ clearedWall: true, distance: 400, hangTime: 5 }));
    expect(hr.fieldable).toBe(false);
    expect(hr.ordinaryCatch).toBe(false);
    expect(hr.trickable).toBe(false);
    expect(hr.trickWindow).toBeNull();

    const foul = resolveFielding(traj({ foul: true, distance: 200, hangTime: 4 }));
    expect(foul.fieldable).toBe(false);
  });
});

describe('resolveCatch — ordinary catches (gate 2)', () => {
  it('resolves a catchable ball as an out with no player input', () => {
    const play = resolveFielding(
      traj({ landing: { x: 0, y: 50, z: 0 }, distance: 50, hangTime: 5 }),
      { fielders: ONE_FIELDER },
    );
    const r = resolveCatch(play, null);
    expect(r.outcome).toBe('out');
    expect(r.caught).toBe(true);
    expect(r.kind).toBe('ordinary');
  });

  it('lets an unreachable ball drop for its distance outcome', () => {
    const play = resolveFielding(
      traj({ landing: { x: 0, y: 300, z: 0 }, distance: 300, hangTime: 3 }),
      { fielders: ONE_FIELDER },
    );
    expect(play.trickable).toBe(false);
    const r = resolveCatch(play, null);
    expect(r.caught).toBe(false);
    expect(r.outcome).toBe('triple');
  });
});

describe('resolveCatch — trick catches (gate 3)', () => {
  // Ball just out of reach: reachable only by a dive (0 < gap <= trickExtraSec),
  // with a base outcome of a single if it drops.
  const play = resolveFielding(
    traj({ landing: { x: 0, y: 150, z: 0 }, distance: 150, hangTime: 8 }),
    { fielders: ONE_FIELDER },
  );

  it('is set up as a trickable, non-ordinary play', () => {
    expect(play.ordinaryCatch).toBe(false);
    expect(play.trickable).toBe(true);
    expect(play.trickWindow).not.toBeNull();
  });

  it('succeeds only inside the timing window', () => {
    const center = play.trickWindow!.centerMs;
    const half = play.trickWindow!.successHalfMs;

    expect(resolveCatch(play, { pressMs: center }).outcome).toBe('out');
    expect(resolveCatch(play, { pressMs: center + half }).kind).toBe('trick'); // boundary
    expect(resolveCatch(play, { pressMs: center - half }).kind).toBe('trick');

    // Just outside the window → not a clean catch.
    expect(resolveCatch(play, { pressMs: center + half + 1 }).caught).toBe(false);
    expect(resolveCatch(play, { pressMs: center + half + 1 }).kind).toBe('trick-failed');
  });

  it('does nothing when a trick is attempted on an unreachable ball', () => {
    const far = resolveFielding(
      traj({ landing: { x: 0, y: 300, z: 0 }, distance: 300, hangTime: 3 }),
      { fielders: ONE_FIELDER },
    );
    const r = resolveCatch(far, { pressMs: 3000 });
    expect(r.caught).toBe(false);
    expect(r.outcome).toBe('triple');
  });
});

describe('resolveCatch — failed trick catches (gate 4)', () => {
  it('turns a would-be single into a double on a blown dive', () => {
    const play = resolveFielding(
      traj({ landing: { x: 0, y: 150, z: 0 }, distance: 150, hangTime: 8 }),
      { fielders: ONE_FIELDER },
    );
    const r = resolveCatch(play, { pressMs: play.trickWindow!.centerMs + 400 });
    expect(r.kind).toBe('trick-failed');
    expect(r.outcome).toBe('double');
  });

  it('turns a routine out into an extra-base hit when a showboat dive misses', () => {
    const play = resolveFielding(
      traj({ landing: { x: 0, y: 50, z: 0 }, distance: 50, hangTime: 5 }),
      { fielders: ONE_FIELDER },
    );
    expect(play.ordinaryCatch).toBe(true); // would be a routine out
    const r = resolveCatch(play, { pressMs: play.trickWindow!.centerMs + 400 });
    expect(r.caught).toBe(false);
    expect(r.outcome).toBe('double');
  });
});

describe('upgradeToExtraBase', () => {
  it('promotes weak outcomes to at least a double', () => {
    expect(upgradeToExtraBase('out')).toBe('double');
    expect(upgradeToExtraBase('single')).toBe('double');
    expect(upgradeToExtraBase('double')).toBe('triple');
    expect(upgradeToExtraBase('triple')).toBe('triple');
    expect(upgradeToExtraBase('home_run')).toBe('home_run');
  });
});
