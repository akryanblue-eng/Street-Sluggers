import { useCallback, useEffect, useRef } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameOver } from './components/GameOver';
import { HUD } from './components/HUD';
import { MainMenu } from './components/MainMenu';
import { ResultOverlay } from './components/ResultOverlay';
import { useGameEngine } from './hooks/useGameEngine';
import type { SwingType } from './game/types';
import './App.css';

const LONG_PRESS_MS = 240;

export function App() {
  const game = useGameEngine();
  const { state, swing, trickCatch, start, restart } = game;

  const pressTimer = useRef<number | null>(null);
  const pressFired = useRef(false);

  // Keyboard: Space / Enter = contact, Shift = power.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.phase === 'menu' || state.phase === 'gameover') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          state.phase === 'menu' ? start() : restart();
        }
        return;
      }
      if (e.repeat) return;
      // While a batted ball is in flight, the action button attempts a trick catch.
      if (state.phase === 'resolving') {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') {
          e.preventDefault();
          trickCatch();
        }
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        swing('contact');
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') {
        e.preventDefault();
        swing('power');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, swing, trickCatch, start, restart]);

  // Touch / mouse: tap = contact, long-press = power. During a batted ball,
  // any press attempts a trick catch.
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (state.phase === 'resolving') {
        e.preventDefault();
        trickCatch();
        return;
      }
      if (state.phase !== 'pitching') return;
      e.preventDefault();
      pressFired.current = false;
      pressTimer.current = window.setTimeout(() => {
        pressFired.current = true;
        swing('power');
      }, LONG_PRESS_MS);
    },
    [state.phase, swing, trickCatch],
  );

  const endPress = useCallback(
    (fire: SwingType | null) => {
      if (pressTimer.current !== null) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
      if (fire && !pressFired.current && state.phase === 'pitching') {
        swing(fire);
      }
      pressFired.current = false;
    },
    [state.phase, swing],
  );

  return (
    <div className="app">
      <div className="stage">
        <GameCanvas state={state} getLiveView={game.getLiveView} />

        {(state.phase === 'pitching' || state.phase === 'resolving') && (
          <>
            <HUD state={state} soundOn={game.soundOn} onToggleSound={game.toggleSound} />
            <ResultOverlay result={state.lastResult} />
            <div
              className="touch-layer"
              onPointerDown={onPointerDown}
              onPointerUp={() => endPress('contact')}
              onPointerLeave={() => endPress(null)}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="swing-hint">
              <span>{state.phase === 'resolving' ? 'CATCH' : 'SWING'}</span>
            </div>
          </>
        )}

        {state.phase === 'menu' && <MainMenu onStart={start} />}
        {state.phase === 'gameover' && <GameOver state={state} onRestart={restart} />}
      </div>
    </div>
  );
}

export default App;
