// Shared domain types for the Street Sluggers gameplay core.
//
// The gameplay math lives in small pure modules (timing, launch, physics,
// outcome) so it can be unit-tested deterministically with Vitest. The engine
// wires them together with real time and randomness.

// Type-only import — erased at build time, so there is no runtime import cycle
// with fielding.ts (which imports HitOutcome / Trajectory from here).
import type { CatchKind, FieldingPlay } from './fielding';

/** Field coordinates, in arcade "feet". Home plate is the origin.
 *  x = lateral (negative → left field, positive → right field)
 *  y = depth toward the outfield
 *  z = height above the ground
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type SwingType = 'contact' | 'power';

/** How well the swing was timed against the ideal contact moment. */
export type TimingBand = 'perfect' | 'good' | 'weak' | 'miss' | 'take';

export interface TimingResult {
  /** Did the batter swing at all? */
  swung: boolean;
  /** Did the bat make contact with the ball? */
  contact: boolean;
  /** Signed timing error in ms (negative = early, positive = late). */
  errorMs: number;
  /** 0..1 contact quality; 1 is a dead-center barrel. */
  quality: number;
  band: TimingBand;
}

/** The launch conditions of a batted ball. */
export interface Launch {
  /** Exit velocity in ft/s. */
  exitVelocity: number;
  /** Vertical launch angle in degrees (0 = line drive, 90 = straight up). */
  launchAngleDeg: number;
  /** Horizontal spray angle in degrees (0 = dead center, negative = left). */
  sprayAngleDeg: number;
}

export interface TrajectoryPoint extends Vec3 {
  t: number;
}

/** Explicit record of a ball caroming off the outfield wall (SS-WALL-001). */
export interface WallImpact {
  /** Time of impact, seconds since contact. */
  t: number;
  /** Impact point on the wall (z is the height it struck). */
  position: Vec3;
  /** Height up the wall that the ball struck, in feet. */
  height: number;
  /** Ball speed just before impact, ft/s. */
  incomingSpeed: number;
  /** Ball speed just after the bounce, ft/s. */
  reboundSpeed: number;
  /** Outward horizontal wall normal at the impact point (unit vector). */
  normal: { x: number; y: number };
  /** True when the rebound speed fell below the minimum lively threshold. */
  deadened: boolean;
}

/** Record of a fair ball crossing above the wall (SS-WALL-CATCH-001), retained
 *  so the fielding layer can attempt a wall-assisted home-run robbery. */
export interface WallClearance {
  /** Time the ball crossed the wall plane, seconds since contact. */
  t: number;
  /** Interpolated crossing point (z is the height it crossed at). */
  position: Vec3;
  /** Height at which the ball crossed, in feet (== position.z). */
  height: number;
  /** Ball velocity at the crossing. */
  incomingVelocity: Vec3;
  /** Ball speed at the crossing, ft/s. */
  incomingSpeed: number;
  /** How far above the wall top the ball crossed, in feet. */
  heightAboveWall: number;
}

export interface Trajectory {
  points: TrajectoryPoint[];
  /** Landing spot on the ground (z ≈ 0). */
  landing: Vec3;
  /** Horizontal distance from home plate to the landing spot, in feet. */
  distance: number;
  /** Time the ball spent in the air, in seconds. */
  hangTime: number;
  /** True if the ball crossed the outfield wall while still airborne. */
  clearedWall: boolean;
  /** True if the batted ball ended up in foul territory. */
  foul: boolean;
  /** Set when the ball caroms off the wall back into play (undefined if not). */
  wallImpact?: WallImpact;
  /** Set when a fair ball crosses above the wall (a would-be home run). */
  wallClearance?: WallClearance;
}

export type HitOutcome =
  | 'strike'
  | 'foul'
  | 'out'
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run';

export interface PlayResult {
  outcome: HitOutcome;
  /** Short human-readable description for the HUD / result overlay. */
  label: string;
  timing: TimingResult;
  launch?: Launch;
  trajectory?: Trajectory;
  /** Fielding geometry for a batted ball in play (undefined for dead balls). */
  fielding?: FieldingPlay;
  /** True while a fielding play is still awaiting its trick-catch window to
   *  close; the outcome may still change until it is finalized. */
  pending?: boolean;
  /** Set once a fielding play resolves: whether the ball was caught, and how. */
  caught?: boolean;
  catchKind?: CatchKind;
}
