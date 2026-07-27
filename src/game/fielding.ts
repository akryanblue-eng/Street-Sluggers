// Deterministic, framework-free fielding resolver (SS-FIELDING-001).
//
// It consumes an already-simulated batted-ball Trajectory and turns the
// distance-based "verdict" into a fielded play: which fielder is nearest, the
// route they run, whether the ball is an ordinary catch, and — when it is just
// out of reach or the batter is showboating — a narrow, player-triggered
// trick-catch timing window. No RNG, no clock: identical trajectories always
// produce identical assignments and outcomes.
//
// SS-WALL-CATCH-001 extends this same resolver with a wall-assisted home-run
// robbery — an eligible outfielder plants a foot on the wall and leaps to rob a
// ball barely clearing it — rather than a parallel wall-play resolver.

import { WALL_CATCH } from './constants';
import { classifyBattedBall, type OutcomeConfig } from './outcome';
import type { HitOutcome, Trajectory } from './types';

export interface Fielder {
  id: string;
  label: string;
  /** Home position on the field, in feet (x lateral, y depth). */
  x: number;
  y: number;
  /** May attempt a wall-assisted robbery (default outfielders LF/CF/RF only). */
  wallEligible?: boolean;
}

/** A fixed defensive alignment. Positions are arcade-spaced, not to scale. */
export const DEFAULT_FIELDERS: readonly Fielder[] = [
  { id: 'P', label: 'Pitcher', x: 0, y: 60 },
  { id: 'C', label: 'Catcher', x: 0, y: -4 },
  { id: '1B', label: 'First', x: 58, y: 84 },
  { id: '2B', label: 'Second', x: 34, y: 138 },
  { id: 'SS', label: 'Short', x: -34, y: 138 },
  { id: '3B', label: 'Third', x: -58, y: 84 },
  { id: 'LF', label: 'Left', x: -168, y: 250, wallEligible: true },
  { id: 'CF', label: 'Center', x: 0, y: 312, wallEligible: true },
  { id: 'RF', label: 'Right', x: 168, y: 250, wallEligible: true },
];

export const FIELDING = {
  /** Fielder run speed, ft/s (arcade-quick, but not teleporting). */
  speed: 18,
  /** Reaction delay before a fielder breaks on the ball, seconds. */
  reactionSec: 0.45,
  /** Standing reach — the ball is caught if it lands within this, in feet. */
  catchRadius: 6,
  /** Extra time a diving trick catch can make up beyond an ordinary play, s. */
  trickExtraSec: 0.55,
  /** Half-width of the success window for a trick catch, ms. Tight on purpose. */
  trickSuccessHalfMs: 90,
  /** Half-width of the window during which a trick attempt is even accepted, ms. */
  trickWindowHalfMs: 260,
} as const;

export type CatchKind =
  | 'ordinary'
  | 'trick'
  | 'trick-failed'
  | 'wall-trick'
  | 'wall-trick-failed'
  | 'none';

/** Whether a play is fielded off the landing point or up against the wall. */
export type FieldingPlayType = 'landing' | 'wall-assist';

export interface TrickWindow {
  /** All times are ms relative to contact (ball launch at t = 0). */
  openMs: number;
  centerMs: number;
  closeMs: number;
  /** |pressMs - centerMs| must be within this for the catch to succeed. */
  successHalfMs: number;
}

export interface FieldingPlay {
  /** Whether the play is made off the landing spot or up against the wall. */
  type: FieldingPlayType;
  /** The nearest eligible fielder assigned to the ball. */
  fielder: Fielder;
  /** Where the play happens: the landing spot, or the wall-crossing point. */
  playPoint: { x: number; y: number };
  /** Straight-line interception route the fielder runs. */
  route: { from: { x: number; y: number }; to: { x: number; y: number } };
  /** Effective catch radius for this play (standing reach). */
  catchRadius: number;
  /** Seconds the fielder is short by. <= 0 means they get there in time. */
  arrivalGapSec: number;
  /** A routine, no-input catch is available. */
  ordinaryCatch: boolean;
  /** A trick catch is possible (either to rob a hit, or to showboat an out). */
  trickable: boolean;
  /** Present only when trickable — the player's timing window. */
  trickWindow: TrickWindow | null;
  /** The outcome if the ball simply drops (distance-based). */
  baseOutcome: HitOutcome;
  /** False for balls no fielder can play (home runs, foul balls). */
  fieldable: boolean;
}

export interface TrickAttempt {
  /** When the player triggered, ms relative to contact. */
  pressMs: number;
}

export interface FieldingOutcome {
  outcome: HitOutcome;
  caught: boolean;
  kind: CatchKind;
  fielderId: string;
}

export interface WallCatchConfig {
  maxHeightAboveWall: number;
  plantLeadSec: number;
  maxArrivalGapSec: number;
}

export interface FieldingConfig {
  fielders?: readonly Fielder[];
  outcome?: Partial<OutcomeConfig>;
  wallCatch?: Partial<WallCatchConfig>;
}

/**
 * Resolve the geometry of a batted ball: the assigned fielder, whether it is an
 * ordinary catch, and the trick-catch window. Pure and deterministic.
 */
export function resolveFielding(
  trajectory: Trajectory,
  config: FieldingConfig = {},
): FieldingPlay {
  const fielders = config.fielders ?? DEFAULT_FIELDERS;
  const baseOutcome = classifyBattedBall(trajectory, config.outcome);
  const playPoint = { x: trajectory.landing.x, y: trajectory.landing.y };
  const timeAvailable = trajectory.hangTime;

  // A fair ball barely clearing the wall can be robbed by an eligible
  // outfielder who reaches the wall in time — same pending trick machinery.
  const wallAssist = tryWallAssist(trajectory, fielders, baseOutcome, config.wallCatch);
  if (wallAssist) return wallAssist;

  // A ball over the wall or in foul ground is not a fieldable play here.
  const fieldable =
    !trajectory.foul && !trajectory.clearedWall && baseOutcome !== 'home_run';

  // Nearest fielder by time-to-reach the landing spot.
  let best = fielders[0];
  let bestGap = Number.POSITIVE_INFINITY;
  for (const f of fielders) {
    const d = Math.hypot(playPoint.x - f.x, playPoint.y - f.y);
    const travel = Math.max(0, d - FIELDING.catchRadius) / FIELDING.speed;
    const gap = FIELDING.reactionSec + travel - timeAvailable;
    if (gap < bestGap) {
      bestGap = gap;
      best = f;
    }
  }

  const ordinaryCatch = fieldable && bestGap <= 0;
  const trickable = fieldable && bestGap <= FIELDING.trickExtraSec;

  const centerMs = timeAvailable * 1000;
  const trickWindow: TrickWindow | null = trickable
    ? {
        openMs: centerMs - FIELDING.trickWindowHalfMs,
        centerMs,
        closeMs: centerMs + FIELDING.trickWindowHalfMs,
        successHalfMs: FIELDING.trickSuccessHalfMs,
      }
    : null;

  return {
    type: 'landing',
    fielder: best,
    playPoint,
    route: { from: { x: best.x, y: best.y }, to: playPoint },
    catchRadius: FIELDING.catchRadius,
    arrivalGapSec: bestGap,
    ordinaryCatch,
    trickable,
    trickWindow,
    baseOutcome,
    fieldable,
  };
}

/**
 * If the trajectory is a fair home run barely clearing the wall and an eligible
 * outfielder can plant a foot on the wall in time, build a wall-assist play
 * (a pending, player-triggered robbery). Otherwise return null and let the ball
 * stand as an immediate home run.
 */
function tryWallAssist(
  trajectory: Trajectory,
  fielders: readonly Fielder[],
  baseOutcome: HitOutcome,
  overrides: Partial<WallCatchConfig> = {},
): FieldingPlay | null {
  const wc = trajectory.wallClearance;
  // Must be a fair, would-be home run whose crossing we retained.
  if (!wc || trajectory.foul || !trajectory.clearedWall || baseOutcome !== 'home_run') {
    return null;
  }

  const cfg: WallCatchConfig = { ...WALL_CATCH, ...overrides };
  // Too high over the wall to rob.
  if (wc.heightAboveWall > cfg.maxHeightAboveWall) return null;

  const playPoint = { x: wc.position.x, y: wc.position.y };
  // The fielder must be at the wall base a beat before the ball crosses.
  const plantDeadline = wc.t - cfg.plantLeadSec;

  let best: Fielder | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const f of fielders) {
    if (!f.wallEligible) continue;
    const d = Math.hypot(playPoint.x - f.x, playPoint.y - f.y);
    const travel = Math.max(0, d - FIELDING.catchRadius) / FIELDING.speed;
    const gap = FIELDING.reactionSec + travel - plantDeadline;
    if (gap < bestGap) {
      bestGap = gap;
      best = f;
    }
  }

  // No eligible fielder can reach the wall in time.
  if (!best || bestGap > cfg.maxArrivalGapSec) return null;

  // The catch happens as the ball crosses the wall — plant, leap, snap.
  const centerMs = wc.t * 1000;
  return {
    type: 'wall-assist',
    fielder: best,
    playPoint,
    route: { from: { x: best.x, y: best.y }, to: playPoint },
    catchRadius: FIELDING.catchRadius,
    arrivalGapSec: bestGap,
    ordinaryCatch: false,
    trickable: true,
    trickWindow: {
      openMs: centerMs - FIELDING.trickWindowHalfMs,
      centerMs,
      closeMs: centerMs + FIELDING.trickWindowHalfMs,
      successHalfMs: FIELDING.trickSuccessHalfMs,
    },
    baseOutcome: 'home_run',
    fieldable: false,
  };
}

/**
 * Resolve the final outcome of a fielding play given the player's optional
 * trick-catch attempt. Deterministic.
 *
 *  - No attempt: ordinary catches are outs; otherwise the ball drops for its
 *    distance-based outcome.
 *  - Attempt inside the success window: a trick catch — an out.
 *  - Attempt outside the success window (a committed dive that misses): the ball
 *    skips past for an upgraded, extra-base hit.
 */
export function resolveCatch(
  play: FieldingPlay,
  attempt: TrickAttempt | null,
): FieldingOutcome {
  const fielderId = play.fielder.id;

  // Wall-assisted robbery: rob a would-be home run, or let it stand. A failed
  // or skipped attempt never changes the home run — the ball already left.
  if (play.type === 'wall-assist') {
    if (attempt === null || !play.trickWindow) {
      return { outcome: 'home_run', caught: false, kind: 'none', fielderId };
    }
    const err = Math.abs(attempt.pressMs - play.trickWindow.centerMs);
    if (err <= play.trickWindow.successHalfMs) {
      return { outcome: 'out', caught: true, kind: 'wall-trick', fielderId };
    }
    return { outcome: 'home_run', caught: false, kind: 'wall-trick-failed', fielderId };
  }

  if (!play.fieldable) {
    return { outcome: play.baseOutcome, caught: false, kind: 'none', fielderId };
  }

  if (attempt === null) {
    if (play.ordinaryCatch) {
      return { outcome: 'out', caught: true, kind: 'ordinary', fielderId };
    }
    return { outcome: play.baseOutcome, caught: false, kind: 'none', fielderId };
  }

  // A trick attempt was made.
  if (!play.trickable || !play.trickWindow) {
    // Nothing to dive for — the attempt has no effect on an unreachable ball.
    return { outcome: play.baseOutcome, caught: false, kind: 'none', fielderId };
  }

  const err = Math.abs(attempt.pressMs - play.trickWindow.centerMs);
  if (err <= play.trickWindow.successHalfMs) {
    return { outcome: 'out', caught: true, kind: 'trick', fielderId };
  }

  // Committed and missed: the ball gets past for extra bases.
  return {
    outcome: upgradeToExtraBase(play.baseOutcome),
    caught: false,
    kind: 'trick-failed',
    fielderId,
  };
}

/** A blown dive turns a routine play into an extra-base hit. */
export function upgradeToExtraBase(base: HitOutcome): HitOutcome {
  switch (base) {
    case 'out':
    case 'single':
      return 'double';
    case 'double':
      return 'triple';
    default:
      return base;
  }
}
