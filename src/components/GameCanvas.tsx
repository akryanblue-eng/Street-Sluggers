import { useEffect, useRef } from 'react';
import type { GameState } from '../game/engine';
import type { LiveView } from '../hooks/useGameEngine';
import { drawField } from '../render/field';

interface Props {
  state: GameState;
  getLiveView: () => LiveView;
}

/** Owns the <canvas>, handles DPR + responsive resize, and runs the render loop
 *  at display refresh rate. It reads live timing from the engine each frame so
 *  the HUD never has to re-render for animation. */
export function GameCanvas({ state, getLiveView }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      cssW = parent.clientWidth;
      cssH = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resize();

    const loop = () => {
      if (cssW > 0 && cssH > 0) {
        drawField(ctx, cssW, cssH, stateRef.current, getLiveView());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [getLiveView]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
