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

/** Game rules for the vertical slice. */
export const RULES = {
  inningsPerGame: 3,
  outsPerInning: 3,
  strikesPerOut: 3,
} as const;
