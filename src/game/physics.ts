import { FIELD, PHYSICS } from './constants';
import type { Launch, Trajectory, TrajectoryPoint, Vec3 } from './types';

/** Height of the contact point off the ground, in feet. */
const CONTACT_HEIGHT = 3;
const DEG = Math.PI / 180;

export interface SimOptions {
  wallRadius: number;
  wallHeight: number;
  foulLineDeg: number;
  dt: number;
  gravity: number;
  drag: number;
  maxSteps: number;
}

const DEFAULT_OPTS: SimOptions = {
  wallRadius: FIELD.wallRadius,
  wallHeight: FIELD.wallHeight,
  foulLineDeg: FIELD.foulLineDeg,
  dt: PHYSICS.dt,
  gravity: PHYSICS.gravity,
  drag: PHYSICS.drag,
  maxSteps: PHYSICS.maxSteps,
};

/**
 * Simulate a batted ball as a projectile with gravity and simple linear drag.
 *
 * Pure and deterministic: identical launch conditions always yield the same
 * trajectory. No Magnus force yet, so a ball keeps a constant azimuth — which
 * also means foul territory is decided by the spray angle alone.
 */
export function simulateBattedBall(
  launch: Launch,
  options: Partial<SimOptions> = {},
): Trajectory {
  const opts = { ...DEFAULT_OPTS, ...options };

  const theta = launch.launchAngleDeg * DEG;
  const phi = launch.sprayAngleDeg * DEG;
  const horizontal = launch.exitVelocity * Math.cos(theta);

  let vx = horizontal * Math.sin(phi);
  let vy = horizontal * Math.cos(phi);
  let vz = launch.exitVelocity * Math.sin(theta);

  let pos: Vec3 = { x: 0, y: 0, z: CONTACT_HEIGHT };
  let t = 0;

  const points: TrajectoryPoint[] = [{ ...pos, t }];

  let clearedWall = false;
  let wallChecked = false;
  let prevRadius = 0;

  for (let step = 0; step < opts.maxSteps; step++) {
    // Semi-implicit Euler with linear drag on every velocity component.
    const dragFactor = 1 - opts.drag * opts.dt;
    vx *= dragFactor;
    vy *= dragFactor;
    vz = vz * dragFactor - opts.gravity * opts.dt;

    const next: Vec3 = {
      x: pos.x + vx * opts.dt,
      y: pos.y + vy * opts.dt,
      z: pos.z + vz * opts.dt,
    };
    t += opts.dt;

    const nextRadius = Math.hypot(next.x, next.y);

    // Detect the frame the ball crosses the outfield wall radius.
    if (!wallChecked && nextRadius >= opts.wallRadius) {
      wallChecked = true;
      const span = nextRadius - prevRadius || 1;
      const frac = (opts.wallRadius - prevRadius) / span;
      const zAtWall = pos.z + (next.z - pos.z) * frac;
      clearedWall = zAtWall > opts.wallHeight;
    }

    if (next.z <= 0) {
      // Interpolate the exact landing point at z = 0.
      const frac = pos.z / (pos.z - next.z || 1);
      const landing: Vec3 = {
        x: pos.x + (next.x - pos.x) * frac,
        y: pos.y + (next.y - pos.y) * frac,
        z: 0,
      };
      points.push({ ...landing, t: t - opts.dt + opts.dt * frac });
      return finalize(points, landing, clearedWall, opts.foulLineDeg);
    }

    points.push({ ...next, t });
    prevRadius = nextRadius;
    pos = next;
  }

  // Ran out of steps (should not happen with sane inputs) — land where we are.
  return finalize(points, pos, clearedWall, opts.foulLineDeg);
}

function finalize(
  points: TrajectoryPoint[],
  landing: Vec3,
  clearedWall: boolean,
  foulLineDeg: number,
): Trajectory {
  const distance = Math.hypot(landing.x, landing.y);
  const azimuthDeg = Math.abs(Math.atan2(landing.x, Math.max(landing.y, 1e-6)) / DEG);
  const foul = azimuthDeg > foulLineDeg;
  return {
    points,
    landing,
    distance,
    hangTime: points[points.length - 1].t,
    // A foul ball, even a deep one, never clears the wall for a homer.
    clearedWall: clearedWall && !foul,
    foul,
  };
}
