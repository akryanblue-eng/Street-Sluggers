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
  /** True while the player may trigger a trick catch on the ball in flight. */
  trickPrompt: boolean;
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
  /** The defensive timing press — dispatches to the pending catch or throw. */
  defensiveAction: () => void;
  toggleSound: () => void;
}

export function useGameEngine(seed?: number): UseGameEngine {
  const engineRef = useRef<GameEngine>(new GameEngine({ seed }));
  const [state, setState] = useState<GameState>(() => engineRef.current.getState());
  const [soundOn, setSoundOn] = useState(true);

  const rafRef = useRef<number | null>(null);
  const resolveStartRef = useRef<number>(0);
  /** Real-clock time at which the current play became final (0 = not yet). */
  const finalizeRef = useRef<number>(0);
  /** Guards the one-shot wall-impact clang per batted ball. */
  const wallSoundRef = useRef<boolean>(false);
  /** Guards the one-shot sneaker-plant scuff on a wall-assist play. */
  const plantSoundRef = useRef<boolean>(false);
  /** Guards the one-shot scoop on a ground-ball throw play. */
  const scoopSoundRef = useRef<boolean>(false);
  const liveRef = useRef<LiveView>({
    phase: 'menu',
    pitchProgress: 0,
    ballAnimSeconds: 0,
    trickPrompt: false,
    result: null,
  });

  const sync = useCallback(() => {
    setState(engineRef.current.getState());
  }, []);

  const playResultSound = useCallback((result: PlayResult) => {
    if (result.throwKind === 'throw-out') {
      sound.play('glove');
      sound.play('out');
      return;
    }
    if (result.throwKind && result.throwKind !== 'none') {
      sound.play('safe'); // beat the throw / pulled wide
      return;
    }
    if (result.catchKind === 'wall-trick') {
      sound.play('glove');
      sound.play('cheer');
      return;
    }
    if (result.catchKind === 'trick') {
      sound.play('cheer');
      return;
    }
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
      finalizeRef.current = 0;
      wallSoundRef.current = false;
      plantSoundRef.current = false;
      scoopSoundRef.current = false;
      liveRef.current.result = result;
      liveRef.current.ballAnimSeconds = 0;
      liveRef.current.trickPrompt = false;
      // Only announce the outcome now if it is already final; a pending
      // fielding play waits for its trick-catch window to close.
      if (!result.pending) playResultSound(result);
      sync();
    },
    [playResultSound, sync],
  );

  const throwPitch = useCallback(
    (now: number) => {
      engineRef.current.beginPitch(now);
      finalizeRef.current = 0;
      wallSoundRef.current = false;
      plantSoundRef.current = false;
      scoopSoundRef.current = false;
      liveRef.current.result = null;
      liveRef.current.trickPrompt = false;
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
        const ballMs = now - resolveStartRef.current;
        liveRef.current.ballAnimSeconds = ballMs / 1000;
        const traj = s.lastResult?.trajectory;
        const flightMs = traj ? traj.hangTime * 1000 : 0;

        // One-shot clang as the ball reaches the wall.
        if (traj?.wallImpact && !wallSoundRef.current && ballMs >= traj.wallImpact.t * 1000) {
          wallSoundRef.current = true;
          sound.play('wall');
        }

        // Sneaker scuff as the fielder plants against the wall (wall-assist).
        const wallPlay = s.lastResult?.fielding;
        if (
          wallPlay?.type === 'wall-assist' &&
          wallPlay.trickWindow &&
          !plantSoundRef.current &&
          ballMs >= wallPlay.trickWindow.openMs
        ) {
          plantSoundRef.current = true;
          sound.play('plant');
        }

        // Scoop as the infielder gloves a grounder on a throw play.
        const throwPlay = s.lastResult?.throwing;
        if (
          throwPlay &&
          !scoopSoundRef.current &&
          ballMs >= throwPlay.pickupTimeSec * 1000
        ) {
          scoopSoundRef.current = true;
          sound.play('scoop');
        }

        if (engine.hasPendingPlay()) {
          // A defensive play is unfolding: run its timing window, then settle.
          const win = engine.activeTrickWindow() ?? engine.activeThrowWindow();
          liveRef.current.trickPrompt =
            !!win && ballMs >= win.openMs && ballMs <= win.closeMs;
          const resolvePointMs = win ? win.closeMs : flightMs;
          if (ballMs >= resolvePointMs) {
            const finalResult = engine.finalizePlay();
            liveRef.current.trickPrompt = false;
            liveRef.current.result = finalResult;
            finalizeRef.current = now;
            if (finalResult) playResultSound(finalResult);
            sync();
          }
        } else {
          // Final outcome (immediate result, or a just-finalized fielding play).
          if (finalizeRef.current === 0) {
            // Immediate result: let any ball finish flying before the tail.
            finalizeRef.current = resolveStartRef.current + flightMs;
          }
          if (now - finalizeRef.current >= RESOLVE_TAIL_MS) {
            engine.advanceAfterResult();
            const after = engine.getState();
            if (after.phase === 'pitching') throwPitch(now);
            else sync();
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [enterResolving, throwPitch, playResultSound, sync]);

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

  const defensiveAction = useCallback(() => {
    const engine = engineRef.current;
    const kind = engine.pendingKind();
    if (!kind) return;
    sound.resume();
    const pressMs = performance.now() - resolveStartRef.current;
    let result: PlayResult | null;
    if (kind === 'catch') {
      result = engine.registerTrickAttempt(pressMs);
    } else {
      result = engine.registerThrowAttempt(pressMs);
      sound.play('whoosh');
    }
    if (result) liveRef.current.result = result;
  }, []);

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
    () => ({ state, soundOn, getLiveView, start, restart, swing, defensiveAction, toggleSound }),
    [state, soundOn, getLiveView, start, restart, swing, defensiveAction, toggleSound],
  );
}

/** Exposed for UI hints (e.g. the timing bar width). */
export const SWING_WINDOW_MS = PITCH.swingWindowMs;
