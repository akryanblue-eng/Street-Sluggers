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
  // Hold the announcement until a fielding play has actually resolved.
  if (!result || result.pending) return null;

  // A robbery at the wall is a highlight, not a routine out — flash it gold.
  const tone =
    result.catchKind === 'wall-trick' ? 'flash-homer' : TONE[result.outcome] ?? 'flash-neutral';
  const distance = result.trajectory ? Math.round(result.trajectory.distance) : null;
  const isRobbery = result.catchKind === 'wall-trick';

  return (
    <div className={`result-flash ${tone}`} key={`${result.label}-${result.timing.errorMs}`}>
      <div className="result-label">{result.label}</div>
      {isRobbery && <div className="result-sub">HOME-RUN ROBBERY</div>}
      {!isRobbery && result.timing.band === 'perfect' && result.timing.contact && (
        <div className="result-sub">PERFECT TIMING</div>
      )}
      {distance !== null && result.outcome !== 'foul' && !isRobbery && (
        <div className="result-distance">{distance} ft</div>
      )}
    </div>
  );
}
