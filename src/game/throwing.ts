// Deterministic ground-ball pickup + throw-to-first race (SS-THROW-001).
//
// The distance classifier used to hand out an "out" the instant a short fair
// ball landed. That is a lie: a 72-foot dribbler is only an out if a fielder
// picks it and beats the runner to the bag. This module supplies the missing
// bridge — pickup assignment, a player-timed throw release, and a throw-versus-
// runner arrival race — feeding the same outcome/runner sink as every other
// play. No RNG, no clock: identical trajectories + config give identical times.
//
// Out of scope here (reserved): throws to any base but first, double plays,
// force logic, tags, cutoffs, rolling-ball physics, and fielder movement.

import { GROUND_BALL, THROWING } from './constants';
import { DEFAULT_FIELDERS, FIELDING, type Fielder } from './fielding';
import type { HitOutcome, Trajectory } from './types';

/** Shared base coordinates (feet), matching the Canvas diamond. */
export const BASE_POSITIONS = {
  home: { x: 0, y: 0 },
  first: { x: 63, y: 63 },
  second: { x: 0, y: 127 },
  third: { x: -63, y: 63 },
} as const;

export interface BattedBallProfile {
  apexHeight: number;
  landingTime: number;
  landingPoint: { x: number; y: number };
  groundBall: boolean;
}

export interface ThrowWindow {
  /** All times are ms relative to contact (t = 0). */
  openMs: number;
  centerMs: number;
  closeMs: number;
  successHalfMs: number;
}

export interface ThrowAttempt {
  pressMs: number;
}

export type ThrowKind = 'throw-out' | 'throw-late' | 'throw-missed' | 'none';

export interface ThrowingPlay {
  /** The infielder who fields the grounder. */
  fielder: Fielder;
  /** The defender covering first base. */
  receiver: Fielder;
  pickupPoint: { x: number; y: number };
  /** When the fielder completes the scoop, seconds since contact. */
  pickupTimeSec: number;
  /** Distance of the throw to first, feet. */
  throwDistance: number;
  /** When the batter-runner reaches first, seconds since contact. */
  runnerArrivalSec: number;
  /** When a perfectly-released throw would reach first, seconds since contact. */
  idealThrowArrivalSec: number;
  /** True only when a well-timed throw can actually beat the runner. */
  throwable: boolean;
  /** The player's release-timing window (null when no out is possible). */
  window: ThrowWindow | null;
  /** The result if the runner is safe. */
  safeOutcome: 'single';
}

export interface ThrowOutcome {
  outcome: HitOutcome;
  out: boolean;
  kind: ThrowKind;
  fielderId: string;
  receiverId: string;
}

export interface GroundBallConfig {
  maxApexHeight: number;
  maxPickupDistance: number;
  maxPickupLagSec: number;
  pickupDelaySec: number;
}

export interface ThrowConfig {
  throwSpeed: number;
  releaseDelaySec: number;
  runnerHomeToFirstSec: number;
  runnerStartDelaySec: number;
  windowHalfMs: number;
  successHalfMs: number;
  tieGoesToRunnerSec: number;
}

export interface ThrowingConfig {
  fielders?: readonly Fielder[];
  groundBall?: Partial<GroundBallConfig>;
  throw?: Partial<ThrowConfig>;
}

/** Derive an explicit batted-ball profile from a simulated trajectory. */
export function profileBattedBall(
  trajectory: Trajectory,
  groundBallConfig: Partial<GroundBallConfig> = {},
): BattedBallProfile {
  const cfg = { ...GROUND_BALL, ...groundBallConfig };
  const apexHeight = trajectory.points.reduce((m, p) => Math.max(m, p.z), 0);
  const landingPoint = { x: trajectory.landing.x, y: trajectory.landing.y };
  const distance = Math.hypot(landingPoint.x, landingPoint.y);

  // Geometry-only: a fair, low ball landing in the infield with no wall event.
  // Whether the catch resolver declines it is decided by the caller.
  const groundBall =
    !trajectory.foul &&
    !trajectory.clearedWall &&
    !trajectory.wallImpact &&
    !trajectory.wallClearance &&
    apexHeight <= cfg.maxApexHeight &&
    distance <= cfg.maxPickupDistance;

  return { apexHeight, landingTime: trajectory.hangTime, landingPoint, groundBall };
}

/**
 * Build the pickup + throw play for a ground ball. Returns null only when the
 * defense structurally cannot make the play (no eligible fielder or no first-
 * base receiver). When a play exists but no out is possible, `throwable` is
 * false and `window` is null — the caller resolves it immediately as a single.
 */
export function resolveThrowing(
  _trajectory: Trajectory,
  profile: BattedBallProfile,
  config: ThrowingConfig = {},
): ThrowingPlay | null {
  if (!profile.groundBall) return null;

  const fielders = config.fielders ?? DEFAULT_FIELDERS;
  const gb = { ...GROUND_BALL, ...config.groundBall };
  const th = { ...THROWING, ...config.throw };

  const receiver = fielders.find((f) => f.firstBaseReceiver);
  const eligible = fielders.filter((f) => f.throwEligible);
  if (!receiver || eligible.length === 0) return null;

  // Treat the landing point as the pickup point (no rolling physics this slice).
  const pickupPoint = profile.landingPoint;

  // Nearest eligible fielder by time to reach the ball.
  let best = eligible[0];
  let bestArrival = Number.POSITIVE_INFINITY;
  for (const f of eligible) {
    const d = Math.hypot(pickupPoint.x - f.x, pickupPoint.y - f.y);
    const arrival = FIELDING.reactionSec + d / FIELDING.speed;
    if (arrival < bestArrival) {
      bestArrival = arrival;
      best = f;
    }
  }

  const lag = Math.max(0, bestArrival - profile.landingTime);
  const canField = lag <= gb.maxPickupLagSec;
  const pickupTimeSec = Math.max(bestArrival, profile.landingTime) + gb.pickupDelaySec;

  const throwDistance = Math.hypot(
    pickupPoint.x - BASE_POSITIONS.first.x,
    pickupPoint.y - BASE_POSITIONS.first.y,
  );
  const idealThrowArrivalSec = pickupTimeSec + th.releaseDelaySec + throwDistance / th.throwSpeed;
  const runnerArrivalSec = th.runnerStartDelaySec + th.runnerHomeToFirstSec;

  const beatsRunner = idealThrowArrivalSec <= runnerArrivalSec - th.tieGoesToRunnerSec;
  const throwable = canField && beatsRunner;

  const centerMs = pickupTimeSec * 1000;
  const window: ThrowWindow | null = throwable
    ? {
        openMs: centerMs - th.windowHalfMs,
        centerMs,
        closeMs: centerMs + th.windowHalfMs,
        successHalfMs: th.successHalfMs,
      }
    : null;

  return {
    fielder: best,
    receiver,
    pickupPoint,
    pickupTimeSec,
    throwDistance,
    runnerArrivalSec,
    idealThrowArrivalSec,
    throwable,
    window,
    safeOutcome: 'single',
  };
}

/**
 * Resolve the throw play against the player's optional release press.
 *
 *  - No throwable play or no press: the runner is safe (single).
 *  - Press outside the success window (a wild throw): single, 'throw-missed'.
 *  - Clean press whose throw beats the runner: out, 'throw-out'.
 *  - Clean press whose throw arrives too late: single, 'throw-late'.
 *
 * A failed throw is never upgraded past a single in this slice.
 */
export function resolveThrow(
  play: ThrowingPlay,
  attempt: ThrowAttempt | null,
  throwConfig: Partial<ThrowConfig> = {},
): ThrowOutcome {
  const th = { ...THROWING, ...throwConfig };
  const ids = { fielderId: play.fielder.id, receiverId: play.receiver.id };
  const safe = (kind: ThrowKind): ThrowOutcome => ({
    outcome: 'single',
    out: false,
    kind,
    ...ids,
  });

  if (!play.throwable || !play.window) return safe('none');
  if (attempt === null) return safe('none');

  const err = attempt.pressMs - play.window.centerMs;
  if (Math.abs(err) > play.window.successHalfMs) return safe('throw-missed');

  // A clean release: the ball can never leave before the scoop is complete.
  const releaseSec = Math.max(play.pickupTimeSec, attempt.pressMs / 1000);
  const arrivalSec = releaseSec + th.releaseDelaySec + play.throwDistance / th.throwSpeed;

  if (arrivalSec <= play.runnerArrivalSec - th.tieGoesToRunnerSec) {
    return { outcome: 'out', out: true, kind: 'throw-out', ...ids };
  }
  return safe('throw-late');
}
