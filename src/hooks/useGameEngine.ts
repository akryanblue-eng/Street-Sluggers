import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../audio/sound';
import { GameEngine, type GameState } from '../game/engine';
import { PITCH } from '../game/constants';
import type { PlayResult, SwingType } from '../game/types';

/** A frame-by-frame snapshot the canvas polls; kept out of React state so the
 *  HUD doesn't re-render 60 times a second. */
export interface LiveView {
  phase: GameState['phase'];
  /** Ball flight progress toward the plate, 0..1 (1 = at the plate). */
  pitchProgress: number;
  /** Seconds elapsed since the batted ball was launched (for flight animation). */
  ballAnimSeconds: number;
  result: PlayResult | null;
}

const RESOLVE_TAIL_MS = 1400;

export interface UseGameEngine {
  state: GameState;
  soundOn: boolean;
  getLiveView: () => LiveView;
  start: () => void;
  restart: () => void;
  swing: (type: SwingType) => void;
  toggleSound: () => void;
}

export function useGameEngine(seed?: number): UseGameEngine {
  const engineRef = useRef<GameEngine>(new GameEngine({ seed }));
  const [state, setState] = useState<GameState>(() => engineRef.current.getState());
  const [soundOn, setSoundOn] = useState(true);

  const rafRef = useRef<number | null>(null);
  const resolveStartRef = useRef<number>(0);
  const liveRef = useRef<LiveView>({
    phase: 'menu',
    pitchProgress: 0,
    ballAnimSeconds: 0,
    result: null,
  });

  const sync = useCallback(() => {
    setState(engineRef.current.getState());
  }, []);

  const playResultSound = useCallback((result: PlayResult) => {
    switch (result.outcome) {
      case 'home_run':
        sound.play('homer');
        break;
      case 'triple':
      case 'double':
        sound.play('hit_solid');
        break;
      case 'single':
        sound.play('hit_weak');
        break;
      case 'out':
        sound.play('out');
        break;
      case 'strike':
        sound.play(result.timing.swung ? 'whiff' : 'out');
        break;
      case 'foul':
        sound.play('hit_weak');
        break;
    }
  }, []);

  const enterResolving = useCallback(
    (result: PlayResult, now: number) => {
      resolveStartRef.current = now;
      liveRef.current.result = result;
      playResultSound(result);
      sync();
    },
    [playResultSound, sync],
  );

  const throwPitch = useCallback(
    (now: number) => {
      engineRef.current.beginPitch(now);
      liveRef.current.result = null;
      sound.play('pitch');
      sync();
    },
    [sync],
  );

  // Main loop: advances the state machine and keeps the live view fresh.
  useEffect(() => {
    const loop = (now: number) => {
      const engine = engineRef.current;
      const s = engine.getState();
      liveRef.current.phase = s.phase;

      if (s.phase === 'pitching' && s.pitchStartMs !== null) {
        const elapsed = now - s.pitchStartMs;
        liveRef.current.pitchProgress = Math.min(1.15, elapsed / s.contactMs);
        if (engine.pitchExpired(now)) {
          enterResolving(engine.registerTake(), now);
        }
      } else if (s.phase === 'resolving') {
        liveRef.current.ballAnimSeconds = (now - resolveStartRef.current) / 1000;
        const traj = s.lastResult?.trajectory;
        const flight = traj ? traj.hangTime * 1000 : 0;
        if (now - resolveStartRef.current > flight + RESOLVE_TAIL_MS) {
          engine.advanceAfterResult();
          const after = engine.getState();
          if (after.phase === 'pitching') {
            throwPitch(now);
          } else {
            sync();
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [enterResolving, throwPitch, sync]);

  const start = useCallback(() => {
    sound.resume();
    engineRef.current.startGame();
    throwPitch(performance.now());
  }, [throwPitch]);

  const restart = useCallback(() => {
    sound.resume();
    engineRef.current.reset(seed);
    engineRef.current.startGame();
    throwPitch(performance.now());
  }, [seed, throwPitch]);

  const swing = useCallback(
    (type: SwingType) => {
      const engine = engineRef.current;
      if (engine.getState().phase !== 'pitching') return;
      sound.resume();
      const now = performance.now();
      enterResolving(engine.registerSwing(now, type), now);
    },
    [enterResolving],
  );

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      sound.setEnabled(next);
      if (next) sound.resume();
      return next;
    });
  }, []);

  const getLiveView = useCallback(() => liveRef.current, []);

  return useMemo(
    () => ({ state, soundOn, getLiveView, start, restart, swing, toggleSound }),
    [state, soundOn, getLiveView, start, restart, swing, toggleSound],
  );
}

/** Exposed for UI hints (e.g. the timing bar width). */
export const SWING_WINDOW_MS = PITCH.swingWindowMs;
