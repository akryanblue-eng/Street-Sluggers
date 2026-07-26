import { LAUNCH, PITCH } from './constants';
import type { Launch, SwingType, TimingResult } from './types';

/** Deterministic per-swing wobble, injected by the engine (0 in tests). */
export interface LaunchWobble {
  exitVelocity: number;
  launchAngleDeg: number;
  sprayAngleDeg: number;
}

const NO_WOBBLE: LaunchWobble = {
  exitVelocity: 0,
  launchAngleDeg: 0,
  sprayAngleDeg: 0,
};

/**
 * Turn a timed swing into launch conditions.
 *
 * The mapping is intentionally readable so it can be tuned by feel:
 *  - quality drives exit velocity (a barrel leaves faster),
 *  - swinging early lifts the ball and pulls it,
 *  - swinging late flattens it and pushes it the other way,
 *  - a power swing trades a little control for exit velocity.
 *
 * With zero wobble the result is fully deterministic.
 */
export function computeLaunch(
  timing: TimingResult,
  swingType: SwingType = 'contact',
  wobble: LaunchWobble = NO_WOBBLE,
  swingWindowMs: number = PITCH.swingWindowMs,
): Launch {
  const q = clamp01(timing.quality);

  const baseEv = lerp(LAUNCH.minExitVelocity, LAUNCH.maxExitVelocity, q);
  const powerEv = swingType === 'power' ? LAUNCH.powerBonus * q : 0;
  const exitVelocity = Math.max(0, baseEv + powerEv + wobble.exitVelocity);

  // Normalized timing error in [-1, 1]. Negative = early.
  const errNorm = clamp(timing.errorMs / swingWindowMs, -1, 1);

  const launchAngleDeg =
    LAUNCH.idealLaunchAngleDeg - errNorm * LAUNCH.launchAngleSkewDeg + wobble.launchAngleDeg;

  // A power swing is a little wilder off-center.
  const sprayScale = swingType === 'power' ? 1.2 : 1;
  const sprayAngleDeg = errNorm * LAUNCH.sprayFromTimingDeg * sprayScale + wobble.sprayAngleDeg;

  return { exitVelocity, launchAngleDeg, sprayAngleDeg };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
