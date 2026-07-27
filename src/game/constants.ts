// Tunable arcade constants. Street Sluggers is deliberately exaggerated — the
// numbers here are chosen to feel good, not to model real baseball.

/** Pitch timing. */
export const PITCH = {
  /** How long the ball travels from the mound to the plate, in ms. */
  travelMs: 1100,
  /** Half-width of the window in which a swing can make contact, in ms. */
  swingWindowMs: 220,
  /** Half-width of the "dead barrel" perfect window, in ms. */
  perfectWindowMs: 55,
  /** Half-width of the solid "good" window, in ms. */
  goodWindowMs: 130,
} as const;

/** Batted-ball launch tuning. */
export const LAUNCH = {
  /** Exit velocity (ft/s) for a barely-caught-up-to swing. */
  minExitVelocity: 70,
  /** Exit velocity (ft/s) for a dead-center barrel. */
  maxExitVelocity: 158,
  /** Extra exit velocity granted by a power swing at full quality. */
  powerBonus: 24,
  /** Ideal launch angle (deg) at perfect contact. */
  idealLaunchAngleDeg: 27,
  /** How much a mistimed swing skews the launch angle (deg at window edge). */
  launchAngleSkewDeg: 34,
  /** How far timing error pulls the spray angle (deg at window edge). */
  sprayFromTimingDeg: 38,
} as const;

/** Field geometry, in feet. */
export const FIELD = {
  /** Radius of the circular outfield wall from home plate. */
  wallRadius: 360,
  /** Height of the outfield wall. */
  wallHeight: 12,
  /** Foul lines sit at ±45° from dead center. */
  foulLineDeg: 45,
  /** Distance thresholds that map a fair batted ball to a hit type. */
  outMaxDistance: 95,
  singleMaxDistance: 205,
  doubleMaxDistance: 275,
  tripleMaxDistance: 330,
} as const;

/** Simple projectile physics. */
export const PHYSICS = {
  /** Gravity, ft/s². */
  gravity: 32.174,
  /** Linear drag coefficient (per second). Keeps arcade arcs tidy. */
  drag: 0.12,
  /** Integration step, seconds. */
  dt: 1 / 120,
  /** Safety cap so a pathological launch can never loop forever. */
  maxSteps: 2000,
} as const;

/**
 * Wall-rebound calibration (SS-WALL-001). Starting values, not game canon —
 * kept explicit and configurable rather than buried as magic numbers.
 */
export const WALL = {
  /** How much of the inward (normal) speed survives the bounce, reversed. */
  normalRestitution: 0.55,
  /** How much sideways-along-the-wall (tangential) speed survives. */
  tangentialRetention: 0.82,
  /** How much vertical speed survives. */
  verticalRetention: 0.72,
  /** Exactly one rebound this slice — no bounce-loop chaos. */
  maxImpacts: 1,
  /**
   * Below this post-impact speed (ft/s) the ball has essentially died against
   * the bricks: it dribbles down at the base of the wall instead of caroming
   * back into play. The rebound still simulates; it is just flagged `deadened`
   * so callers can tell a lively carom from a dead thud. Test-covered on both
   * sides of the threshold.
   */
  minPostImpactSpeed: 18,
} as const;

/**
 * Wall-assisted robbery calibration (SS-WALL-CATCH-001). Starting values, not
 * permanent canon. Movement speed and the trick-window widths are deliberately
 * reused from FIELDING — only the wall-specific envelope lives here.
 */
export const WALL_CATCH = {
  /** A homer crossing higher than this above the wall top is uncatchable, ft. */
  maxHeightAboveWall: 7,
  /** The fielder must plant a foot this long before the ball crosses, s. */
  plantLeadSec: 0.18,
  /** How late the fielder may still arrive and leap, s (beyond the plant). */
  maxArrivalGapSec: 0.35,
} as const;

/**
 * Ground-ball classification for the throw-to-first play (SS-THROW-001).
 * Starting arcade values, not permanent canon.
 */
export const GROUND_BALL = {
  /** A ball peaking above this is a fly/liner, not a grounder, ft. */
  maxApexHeight: 12,
  /** A grounder must land within this radius to be an infield play, ft. */
  maxPickupDistance: 185,
  /** How long after the ball lands a fielder may still reach it to field, s. */
  maxPickupLagSec: 0.65,
  /** Delay from reaching the ball to completing the scoop, s. */
  pickupDelaySec: 0.18,
} as const;

/** Throw-to-first calibration (SS-THROW-001). Starting values, not canon. */
export const THROWING = {
  /** Thrown-ball speed, ft/s. */
  throwSpeed: 135,
  /** Delay from the release press to the ball leaving the hand, s. */
  releaseDelaySec: 0.22,
  /** How long the batter-runner takes to run home to first, s. */
  runnerHomeToFirstSec: 4.15,
  /** How long after contact the runner gets going, s. */
  runnerStartDelaySec: 0.08,
  /** Half-width of the window in which a throw press is accepted, ms. */
  windowHalfMs: 280,
  /** Half-width of the clean-throw success window, ms. */
  successHalfMs: 100,
  /** A tie (or near-tie) at the bag goes to the runner, s. */
  tieGoesToRunnerSec: 0.03,
} as const;

/** Game rules for the vertical slice. */
export const RULES = {
  inningsPerGame: 3,
  outsPerInning: 3,
  strikesPerOut: 3,
} as const;
