// Base-runner bookkeeping. Arcade rule: every runner (and the batter) advances
// the same number of bases on a hit. Simple, forgiving, and easy to reason about.

/** Occupied bases: [first, second, third]. */
export type Bases = [boolean, boolean, boolean];

export const EMPTY_BASES: Bases = [false, false, false];

export interface AdvanceResult {
  bases: Bases;
  runs: number;
}

/**
 * Advance all runners (plus the batter) by `n` bases.
 * Returns the new base state and how many runs scored.
 */
export function advanceRunners(bases: Bases, n: number): AdvanceResult {
  if (n <= 0) return { bases: [...bases] as Bases, runs: 0 };

  // Current runner positions (1st = 1 … 3rd = 3), plus the batter at home (0).
  const positions: number[] = [0];
  bases.forEach((occupied, i) => {
    if (occupied) positions.push(i + 1);
  });

  const next: Bases = [false, false, false];
  let runs = 0;
  for (const pos of positions) {
    const dest = pos + n;
    if (dest >= 4) runs += 1; // crossed home plate
    else next[dest - 1] = true;
  }

  return { bases: next, runs };
}
