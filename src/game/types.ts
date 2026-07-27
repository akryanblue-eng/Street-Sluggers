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
