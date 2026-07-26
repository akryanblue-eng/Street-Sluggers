import type { GameState } from '../game/engine';

interface Props {
  state: GameState;
  onRestart: () => void;
}

export function GameOver({ state, onRestart }: Props) {
  return (
    <div className="menu-screen">
      <div className="menu-card">
        <h1 className="menu-title menu-title-sm">GAME OVER</h1>
        <p className="gameover-score">
          Final: <strong>{state.runs}</strong> {state.runs === 1 ? 'run' : 'runs'}
        </p>
        <p className="menu-tagline">{flavor(state.runs)}</p>
        <button className="btn btn-primary" onClick={onRestart}>
          Play Again
        </button>
      </div>
    </div>
  );
}

function flavor(runs: number): string {
  if (runs === 0) return 'Golden sombrero. The sandlot remembers.';
  if (runs < 4) return 'Scrappy. You put the ball in play.';
  if (runs < 8) return 'Now you are cooking on the corner.';
  return 'Neighborhood legend. Windows are not safe.';
}
