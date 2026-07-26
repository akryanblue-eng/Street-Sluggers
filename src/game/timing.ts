import { PITCH } from './constants';
import type { TimingBand, TimingResult } from './types';

export interface TimingConfig {
  swingWindowMs: number;
  goodWindowMs: number;
  perfectWindowMs: number;
}

const DEFAULT_CONFIG: TimingConfig = {
  swingWindowMs: PITCH.swingWindowMs,
  goodWindowMs: PITCH.goodWindowMs,
  perfectWindowMs: PITCH.perfectWindowMs,
};

/**
 * Resolve how a swing lined up with the ideal contact moment.
 *
 * @param swingMs   When the batter swung, relative to pitch start (ms).
 *                  Pass `null` for a take (no swing).
 * @param contactMs When the ball crosses the plate — the ideal moment (ms).
 */
export function resolveTiming(
  swingMs: number | null,
  contactMs: number,
  config: Partial<TimingConfig> = {},
): TimingResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (swingMs === null) {
    // A take is a called strike in the vertical slice.
    return { swung: false, contact: false, errorMs: 0, quality: 0, band: 'take' };
  }

  const errorMs = swingMs - contactMs;
  const absErr = Math.abs(errorMs);

  if (absErr > cfg.swingWindowMs) {
    // Swung and missed entirely.
    return { swung: true, contact: false, errorMs, quality: 0, band: 'miss' };
  }

  // Quality falls off linearly from a dead-center barrel to the window edge.
  const quality = clamp01(1 - absErr / cfg.swingWindowMs);

  let band: TimingBand;
  if (absErr <= cfg.perfectWindowMs) band = 'perfect';
  else if (absErr <= cfg.goodWindowMs) band = 'good';
  else band = 'weak';

  return { swung: true, contact: true, errorMs, quality, band };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
