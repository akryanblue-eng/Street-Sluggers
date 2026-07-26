import { FIELD } from './constants';
import type { HitOutcome, Trajectory } from './types';

export interface OutcomeConfig {
  outMaxDistance: number;
  singleMaxDistance: number;
  doubleMaxDistance: number;
  tripleMaxDistance: number;
}

const DEFAULT_CONFIG: OutcomeConfig = {
  outMaxDistance: FIELD.outMaxDistance,
  singleMaxDistance: FIELD.singleMaxDistance,
  doubleMaxDistance: FIELD.doubleMaxDistance,
  tripleMaxDistance: FIELD.tripleMaxDistance,
};

/**
 * Classify a batted ball that made contact into a hit outcome.
 *
 * Arcade-simple and distance-driven: over the wall in the air is a homer, a
 * deep ball off the wall stretches to a triple, and everything else buckets by
 * how far it travelled. Trick catches and fielder positioning are reserved for
 * a later pass — this keeps the vertical slice deterministic and testable.
 */
export function classifyBattedBall(
  trajectory: Trajectory,
  config: Partial<OutcomeConfig> = {},
): HitOutcome {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (trajectory.foul) return 'foul';
  if (trajectory.clearedWall) return 'home_run';

  const d = trajectory.distance;
  if (d < cfg.outMaxDistance) return 'out';
  if (d < cfg.singleMaxDistance) return 'single';
  if (d < cfg.doubleMaxDistance) return 'double';
  if (d < cfg.tripleMaxDistance) return 'triple';
  // Deep, fair, but didn't clear the wall — off the wall for a stand-up triple.
  return 'triple';
}

const LABELS: Record<HitOutcome, string> = {
  strike: 'Strike!',
  foul: 'Foul ball',
  out: "You're out!",
  single: 'Single!',
  double: 'Double!',
  triple: 'Triple!',
  home_run: 'HOME RUN! 💥',
};

export function labelFor(outcome: HitOutcome): string {
  return LABELS[outcome];
}

/** How many bases a batter takes on an outcome (0 for outs / dead balls). */
export function basesFor(outcome: HitOutcome): number {
  switch (outcome) {
    case 'single':
      return 1;
    case 'double':
      return 2;
    case 'triple':
      return 3;
    case 'home_run':
      return 4;
    default:
      return 0;
  }
}
