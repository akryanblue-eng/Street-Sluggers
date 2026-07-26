import type { PlayResult } from '../game/types';

interface Props {
  result: PlayResult | null;
}

const TONE: Record<string, string> = {
  home_run: 'flash-homer',
  triple: 'flash-hit',
  double: 'flash-hit',
  single: 'flash-hit',
  out: 'flash-out',
  strike: 'flash-out',
  foul: 'flash-neutral',
};

/** The big arcade call-out after each play. Keyed by play so it re-triggers the
 *  pop animation every time. */
export function ResultOverlay({ result }: Props) {
  if (!result) return null;

  const tone = TONE[result.outcome] ?? 'flash-neutral';
  const distance = result.trajectory ? Math.round(result.trajectory.distance) : null;

  return (
    <div className={`result-flash ${tone}`} key={`${result.label}-${result.timing.errorMs}`}>
      <div className="result-label">{result.label}</div>
      {result.timing.band === 'perfect' && result.timing.contact && (
        <div className="result-sub">PERFECT TIMING</div>
      )}
      {distance !== null && result.outcome !== 'foul' && (
        <div className="result-distance">{distance} ft</div>
      )}
    </div>
  );
}
