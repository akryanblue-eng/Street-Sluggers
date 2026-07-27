import { FIELD, PHYSICS, WALL } from './constants';
import type { Launch, Trajectory, TrajectoryPoint, Vec3, WallImpact } from './types';

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
  /** Wall-rebound calibration. */
  normalRestitution: number;
  tangentialRetention: number;
  verticalRetention: number;
  maxWallImpacts: number;
  minPostImpactSpeed: number;
}

const DEFAULT_OPTS: SimOptions = {
  wallRadius: FIELD.wallRadius,
  wallHeight: FIELD.wallHeight,
  foulLineDeg: FIELD.foulLineDeg,
  dt: PHYSICS.dt,
  gravity: PHYSICS.gravity,
  drag: PHYSICS.drag,
  maxSteps: PHYSICS.maxSteps,
  normalRestitution: WALL.normalRestitution,
  tangentialRetention: WALL.tangentialRetention,
  verticalRetention: WALL.verticalRetention,
  maxWallImpacts: WALL.maxImpacts,
  minPostImpactSpeed: WALL.minPostImpactSpeed,
};

/**
 * Simulate a batted ball as a projectile with gravity and simple linear drag,
 * with a deterministic outfield-wall rebound (SS-WALL-001).
 *
 * The wall is a vertical circular fence at `wallRadius`. A fair ball that
 * reaches the wall below its top caroms back into play: its inward (normal)
 * velocity reverses and scales by `normalRestitution`, its along-the-wall
 * (tangential) velocity by `tangentialRetention`, and its vertical velocity by
 * `verticalRetention`. Simulation then continues from the impact point until
 * the ball lands. A ball that crosses above the wall is a home run and does not
 * rebound; foul balls are untouched. At most `maxWallImpacts` rebounds happen.
 *
 * Pure and deterministic: identical launch conditions + options always yield
 * the same trajectory, impact data, and landing point.
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
  let wallImpact: WallImpact | undefined;
  let wallImpacts = 0;
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

    // Detect the frame the ball reaches the outfield wall radius.
    if (wallImpacts < opts.maxWallImpacts && prevRadius < opts.wallRadius && nextRadius >= opts.wallRadius) {
      const span = nextRadius - prevRadius || 1;
      const frac = (opts.wallRadius - prevRadius) / span;
      const impact: Vec3 = {
        x: pos.x + (next.x - pos.x) * frac,
        y: pos.y + (next.y - pos.y) * frac,
        z: pos.z + (next.z - pos.z) * frac,
      };
      const impactT = t - opts.dt + opts.dt * frac;
      const azimuthDeg = Math.abs(Math.atan2(impact.x, Math.max(impact.y, 1e-6)) / DEG);
      const fair = azimuthDeg <= opts.foulLineDeg;

      if (impact.z > opts.wallHeight) {
        // Over the fence: a home run if fair; foul balls never clear for a homer.
        clearedWall = fair;
        wallImpacts = opts.maxWallImpacts; // stop checking; ball leaves the park
      } else if (fair) {
        // Struck the wall below its top → carom back into play.
        const incomingSpeed = Math.hypot(vx, vy, vz);
        const nx = impact.x / opts.wallRadius;
        const ny = impact.y / opts.wallRadius;
        const vn = vx * nx + vy * ny; // inward/outward (normal) scalar, +outward
        const vtx = vx - vn * nx; // tangential (along the wall) components
        const vty = vy - vn * ny;
        const vnPrime = -opts.normalRestitution * vn; // reversed and damped
        vx = vnPrime * nx + opts.tangentialRetention * vtx;
        vy = vnPrime * ny + opts.tangentialRetention * vty;
        vz = opts.verticalRetention * vz;

        const reboundSpeed = Math.hypot(vx, vy, vz);
        wallImpact = {
          t: impactT,
          position: impact,
          height: impact.z,
          incomingSpeed,
          reboundSpeed,
          normal: { x: nx, y: ny },
          deadened: reboundSpeed < opts.minPostImpactSpeed,
        };
        wallImpacts += 1;

        // Resume simulation from the impact point with the reflected velocity.
        pos = impact;
        t = impactT;
        points.push({ ...impact, t: impactT });
        prevRadius = opts.wallRadius - 1e-6; // just inside; heading back in
        continue;
      } else {
        // Foul ball at the wall radius: no fence in foul ground — unchanged.
        wallImpacts = opts.maxWallImpacts;
      }
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
      return finalize(points, landing, clearedWall, opts.foulLineDeg, wallImpact);
    }

    points.push({ ...next, t });
    prevRadius = nextRadius;
    pos = next;
  }

  // Ran out of steps (should not happen with sane inputs) — land where we are.
  return finalize(points, pos, clearedWall, opts.foulLineDeg, wallImpact);
}

function finalize(
  points: TrajectoryPoint[],
  landing: Vec3,
  clearedWall: boolean,
  foulLineDeg: number,
  wallImpact: WallImpact | undefined,
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
    wallImpact,
  };
}
