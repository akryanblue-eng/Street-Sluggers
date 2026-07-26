import type { GameState } from '../game/engine';
import { RULES } from '../game/constants';

interface Props {
  state: GameState;
  soundOn: boolean;
  onToggleSound: () => void;
}

export function HUD({ state, soundOn, onToggleSound }: Props) {
  const inningLabel =
    state.inning > RULES.inningsPerGame ? 'Final' : `Inning ${state.inning}/${RULES.inningsPerGame}`;

  return (
    <header className="hud">
      <div className="hud-group">
        <span className="hud-label">Runs</span>
        <span className="hud-value hud-runs">{state.runs}</span>
      </div>

      <div className="hud-group">
        <span className="hud-label">{inningLabel}</span>
        <div className="hud-counts">
          <Count label="O" filled={state.outs} total={RULES.outsPerInning} tone="out" />
          <Count label="K" filled={state.strikes} total={RULES.strikesPerOut - 1} tone="strike" />
        </div>
      </div>

      <div className="hud-group hud-bases">
        <span className="hud-label">Bases</span>
        <Diamond bases={state.bases} />
      </div>

      <button className="hud-sound" onClick={onToggleSound} aria-label="Toggle sound">
        {soundOn ? '🔊' : '🔇'}
      </button>
    </header>
  );
}

function Count({
  label,
  filled,
  total,
  tone,
}: {
  label: string;
  filled: number;
  total: number;
  tone: 'out' | 'strike';
}) {
  return (
    <div className="count-row">
      <span className="count-tag">{label}</span>
      <div className="count-dots">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`dot ${i < filled ? `dot-on dot-${tone}` : ''}`} />
        ))}
      </div>
    </div>
  );
}

function Diamond({ bases }: { bases: GameState['bases'] }) {
  const [first, second, third] = bases;
  return (
    <svg viewBox="0 0 40 40" className="diamond" aria-hidden>
      <polygon points="20,26 26,20 20,14 14,20" className={second ? 'base on' : 'base'} />
      <polygon points="26,20 32,26 26,32 20,26" className={first ? 'base on' : 'base'} />
      <polygon points="14,20 20,26 14,32 8,26" className={third ? 'base on' : 'base'} />
    </svg>
  );
}
