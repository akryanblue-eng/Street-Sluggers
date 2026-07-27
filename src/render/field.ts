// Canvas renderer for the field, the pitch, and the batted ball. This module is
// deliberately self-contained: it takes the current game + live view and paints
// one frame. All gameplay decisions happen upstream in the engine — here we only
// draw. Reserved arcade extras (wall pads for rebounds, hazard zones, fielders
// for trick catches) get TODO hooks so the slice leaves room for them.

import { FIELD } from '../game/constants';
import { DEFAULT_FIELDERS, type FieldingPlay } from '../game/fielding';
import type { GameState } from '../game/engine';
import type { WallImpact } from '../game/types';
import type { LiveView } from '../hooks/useGameEngine';

const COLORS = {
  skyTop: '#0b1f3a',
  skyBottom: '#1c3a5e',
  asphalt: '#3a3f45',
  asphaltDark: '#2c3035',
  grass: '#3f7d4a',
  grassDark: '#356b40',
  dirt: '#a9713f',
  chalk: '#f4f1e8',
  fence: '#c7ccd1',
  fenceShadow: '#8a9096',
  ball: '#fdfdf5',
  ballSeam: '#d64545',
  shadow: 'rgba(0,0,0,0.28)',
  reticle: '#ffd24a',
  reticleHot: '#57f28c',
  fielder: '#cfe0f5',
  fielderOutline: '#20344f',
  fielderActive: '#7fe3ff',
  batter: '#ffcf6b',
};

interface Projection {
  toScreen: (x: number, y: number, z: number) => { sx: number; sy: number; scale: number };
  plate: { sx: number; sy: number };
  pxPerFoot: number;
}

function makeProjection(w: number, h: number): Projection {
  const plateX = w / 2;
  const plateY = h * 0.84;
  const topY = h * 0.14;
  const pxPerFoot = (plateY - topY) / FIELD.wallRadius;
  const heightScale = pxPerFoot * 0.85;

  const toScreen = (x: number, y: number, z: number) => {
    const depth = Math.min(y, FIELD.wallRadius * 1.15) / FIELD.wallRadius;
    const spread = 0.32 + 0.95 * depth; // perspective: outfield fans out
    const sx = plateX + x * pxPerFoot * spread;
    const sy = plateY - y * pxPerFoot - z * heightScale;
    const scale = 0.6 + 0.7 * depth;
    return { sx, sy, scale };
  };

  return { toScreen, plate: { sx: plateX, sy: plateY }, pxPerFoot };
}

export function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: GameState,
  view: LiveView,
): void {
  const proj = makeProjection(w, h);

  drawBackground(ctx, w, h);
  drawGrass(ctx, w, h, proj);
  drawFoulLines(ctx, proj);
  drawWall(ctx, proj);
  drawInfield(ctx, proj);

  // A fielder actively making a play is drawn in motion; hold him out of the
  // static defensive alignment so he isn't ghosted at his home spot.
  const activePlay =
    view.phase === 'resolving' && view.result?.fielding?.fieldable
      ? view.result.fielding
      : null;
  drawPlayers(ctx, proj, activePlay?.fielder.id);
  drawRunners(ctx, proj, state);

  if (view.phase === 'pitching') {
    drawReticle(ctx, proj, view.pitchProgress);
    drawPitch(ctx, proj, view.pitchProgress);
  } else if (view.phase === 'resolving') {
    if (view.result?.trajectory) drawBattedBall(ctx, proj, view);
    const wallImpact = view.result?.trajectory?.wallImpact;
    if (wallImpact) drawWallImpact(ctx, proj, wallImpact, view.ballAnimSeconds);
    if (activePlay) drawFieldingPlay(ctx, proj, activePlay, view);
  }
}

/** A procedural flash + expanding ring where the ball caroms off the wall.
 *  The batted-ball trail already renders the incoming and reflected paths. */
function drawWallImpact(
  ctx: CanvasRenderingContext2D,
  proj: Projection,
  impact: WallImpact,
  ballAnimSeconds: number,
) {
  const age = ballAnimSeconds - impact.t;
  if (age < 0 || age > 0.5) return; // only around the moment of contact

  const p = proj.toScreen(impact.position.x, impact.position.y, impact.position.z);
  const fade = 1 - age / 0.5;

  // Expanding shock ring.
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.beginPath();
  ctx.arc(p.sx, p.sy, 5 + age * 90, 0, Math.PI * 2);
  ctx.strokeStyle = impact.deadened ? '#c7ccd1' : '#ffd24a';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Bright core flash for the first instant.
  if (age < 0.16) {
    ctx.globalAlpha = 1 - age / 0.16;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff6d5';
    ctx.fill();
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.45);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(1, COLORS.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Street backdrop below the horizon.
  const street = ctx.createLinearGradient(0, h * 0.35, 0, h);
  street.addColorStop(0, COLORS.asphaltDark);
  street.addColorStop(1, COLORS.asphalt);
  ctx.fillStyle = street;
  ctx.fillRect(0, h * 0.35, w, h * 0.65);
}

function angledPoint(proj: Projection, deg: number, dist: number) {
  const rad = (deg * Math.PI) / 180;
  const x = Math.sin(rad) * dist;
  const y = Math.cos(rad) * dist;
  return proj.toScreen(x, y, 0);
}

function drawGrass(ctx: CanvasRenderingContext2D, _w: number, _h: number, proj: Projection) {
  // Fair-territory wedge from the plate out to the wall.
  ctx.beginPath();
  ctx.moveTo(proj.plate.sx, proj.plate.sy);
  for (let d = -FIELD.foulLineDeg; d <= FIELD.foulLineDeg; d += 3) {
    const p = angledPoint(proj, d, FIELD.wallRadius);
    ctx.lineTo(p.sx, p.sy);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, proj.plate.sy, 0, proj.plate.sy - 400);
  g.addColorStop(0, COLORS.grassDark);
  g.addColorStop(1, COLORS.grass);
  ctx.fillStyle = g;
  ctx.fill();

  // Mowing stripes for a bit of texture.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 2;
  for (let d = -FIELD.foulLineDeg; d <= FIELD.foulLineDeg; d += 6) {
    const a = proj.plate;
    const b = angledPoint(proj, d, FIELD.wallRadius);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFoulLines(ctx: CanvasRenderingContext2D, proj: Projection) {
  ctx.strokeStyle = COLORS.chalk;
  ctx.lineWidth = 3;
  for (const d of [-FIELD.foulLineDeg, FIELD.foulLineDeg]) {
    const b = angledPoint(proj, d, FIELD.wallRadius);
    ctx.beginPath();
    ctx.moveTo(proj.plate.sx, proj.plate.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
}

function drawWall(ctx: CanvasRenderingContext2D, proj: Projection) {
  // TODO(arcade): segment the wall so individual pads can trigger rebounds.
  ctx.beginPath();
  for (let d = -FIELD.foulLineDeg; d <= FIELD.foulLineDeg; d += 2) {
    const top = angledPoint(proj, d, FIELD.wallRadius);
    const sy = top.sy - FIELD.wallHeight * proj.pxPerFoot * 0.85;
    if (d === -FIELD.foulLineDeg) ctx.moveTo(top.sx, sy);
    else ctx.lineTo(top.sx, sy);
  }
  ctx.lineWidth = 6;
  ctx.strokeStyle = COLORS.fence;
  ctx.stroke();

  ctx.beginPath();
  for (let d = -FIELD.foulLineDeg; d <= FIELD.foulLineDeg; d += 2) {
    const base = angledPoint(proj, d, FIELD.wallRadius);
    if (d === -FIELD.foulLineDeg) ctx.moveTo(base.sx, base.sy);
    else ctx.lineTo(base.sx, base.sy);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.fenceShadow;
  ctx.stroke();
}

function drawInfield(ctx: CanvasRenderingContext2D, proj: Projection) {
  // Dirt diamond around the base paths.
  const homePt = proj.toScreen(0, 0, 0);
  const firstPt = proj.toScreen(63, 63, 0);
  const secondPt = proj.toScreen(0, 127, 0);
  const thirdPt = proj.toScreen(-63, 63, 0);

  ctx.beginPath();
  ctx.moveTo(homePt.sx, homePt.sy);
  ctx.lineTo(firstPt.sx, firstPt.sy);
  ctx.lineTo(secondPt.sx, secondPt.sy);
  ctx.lineTo(thirdPt.sx, thirdPt.sy);
  ctx.closePath();
  ctx.fillStyle = COLORS.dirt;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Bases.
  ctx.fillStyle = COLORS.chalk;
  for (const p of [firstPt, secondPt, thirdPt]) {
    ctx.fillRect(p.sx - 5, p.sy - 5, 10, 10);
  }
  // Home plate.
  ctx.beginPath();
  ctx.moveTo(homePt.sx, homePt.sy + 6);
  ctx.lineTo(homePt.sx - 7, homePt.sy);
  ctx.lineTo(homePt.sx - 7, homePt.sy - 6);
  ctx.lineTo(homePt.sx + 7, homePt.sy - 6);
  ctx.lineTo(homePt.sx + 7, homePt.sy);
  ctx.closePath();
  ctx.fill();
}

function drawPlayers(
  ctx: CanvasRenderingContext2D,
  proj: Projection,
  excludeFielderId?: string,
) {
  // The defensive alignment (pitcher is part of it), each at its home spot.
  for (const f of DEFAULT_FIELDERS) {
    if (f.id === excludeFielderId) continue;
    const p = proj.toScreen(f.x, f.y, 0);
    drawBlob(ctx, p.sx, p.sy, 8 * p.scale + 2, COLORS.fielder, COLORS.fielderOutline);
  }

  // Batter at the plate.
  const bat = proj.toScreen(-9, 4, 0);
  drawBlob(ctx, bat.sx, bat.sy, 11, COLORS.batter, COLORS.fielderOutline);
}

/** Little dots on the diamond for any runners currently aboard. */
function drawRunners(ctx: CanvasRenderingContext2D, proj: Projection, state: GameState) {
  const spots: Array<[number, number]> = [
    [63, 63], // first
    [0, 127], // second
    [-63, 63], // third
  ];
  state.bases.forEach((occupied, i) => {
    if (!occupied) return;
    const [x, y] = spots[i];
    const p = proj.toScreen(x, y, 0);
    drawBlob(ctx, p.sx, p.sy, 7 * p.scale + 1, '#ffd24a', COLORS.fielderOutline);
  });
}

/** The assigned fielder runs toward the landing spot; when the ball is
 *  trick-eligible a closing timing ring cues the dive. */
function drawFieldingPlay(
  ctx: CanvasRenderingContext2D,
  proj: Projection,
  play: FieldingPlay,
  view: LiveView,
) {
  const ballMs = view.ballAnimSeconds * 1000;
  const arriveMs = play.trickWindow?.centerMs ?? (view.result?.trajectory?.hangTime ?? 1) * 1000;
  const t = clamp01(ballMs / Math.max(1, arriveMs));

  // Interpolate the fielder from his home spot toward the landing point.
  const fx = play.route.from.x + (play.route.to.x - play.route.from.x) * t;
  const fy = play.route.from.y + (play.route.to.y - play.route.from.y) * t;
  const fp = proj.toScreen(fx, fy, 0);

  // Catch target on the ground.
  const target = proj.toScreen(play.playPoint.x, play.playPoint.y, 0);
  ctx.beginPath();
  ctx.arc(target.sx, target.sy, 10, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Closing timing ring during the trick window.
  if (play.trickWindow) {
    const { centerMs, successHalfMs } = play.trickWindow;
    const remaining = Math.abs(centerMs - ballMs);
    const hot = remaining <= successHalfMs;
    const ringR = 12 + Math.min(60, remaining / 6);
    ctx.beginPath();
    ctx.arc(fp.sx, fp.sy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = hot ? COLORS.reticleHot : COLORS.reticle;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  drawBlob(ctx, fp.sx, fp.sy, 9 * fp.scale + 2, COLORS.fielderActive, COLORS.fielderOutline);

  if (view.trickPrompt) {
    ctx.save();
    ctx.font = '700 16px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.reticleHot;
    ctx.fillText('TRICK CATCH!', fp.sx, fp.sy - 22);
    ctx.restore();
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  body: string,
  outline: string,
) {
  ctx.beginPath();
  ctx.ellipse(sx, sy + r * 0.9, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.shadow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

function drawReticle(ctx: CanvasRenderingContext2D, proj: Projection, progress: number) {
  const p = proj.toScreen(0, 6, 2.5);
  const targetR = 20;
  const incomingR = targetR * (1 + Math.max(0, 1 - progress) * 3.2);
  const hot = Math.abs(progress - 1) < 0.09;

  ctx.beginPath();
  ctx.arc(p.sx, p.sy, targetR, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = hot ? COLORS.reticleHot : COLORS.reticle;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(p.sx, p.sy, incomingR, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = hot ? COLORS.reticleHot : 'rgba(255,210,74,0.65)';
  ctx.stroke();
}

function drawPitch(ctx: CanvasRenderingContext2D, proj: Projection, progress: number) {
  const y = 60 - 54 * Math.min(1, progress); // mound → plate
  const z = 5 - 2.5 * Math.min(1, progress);
  const p = proj.toScreen(0, Math.max(2, y), Math.max(0.5, z));
  drawBall(ctx, p.sx, p.sy, 6 + 4 * Math.min(1, progress));
}

function drawBattedBall(ctx: CanvasRenderingContext2D, proj: Projection, view: LiveView) {
  const traj = view.result!.trajectory!;
  const t = view.ballAnimSeconds;
  const pts = traj.points;

  // Find the current point by time.
  let idx = pts.length - 1;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].t >= t) {
      idx = i;
      break;
    }
  }
  const cur = pts[idx];

  // Trail.
  ctx.beginPath();
  for (let i = 0; i <= idx; i++) {
    const s = proj.toScreen(pts[i].x, pts[i].y, pts[i].z);
    if (i === 0) ctx.moveTo(s.sx, s.sy);
    else ctx.lineTo(s.sx, s.sy);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Shadow on the ground + ball in the air.
  const ground = proj.toScreen(cur.x, cur.y, 0);
  ctx.beginPath();
  ctx.ellipse(ground.sx, ground.sy, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.shadow;
  ctx.fill();

  const air = proj.toScreen(cur.x, cur.y, cur.z);
  drawBall(ctx, air.sx, air.sy, 6 * air.scale + 2);
}

function drawBall(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number) {
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.ball;
  ctx.fill();
  ctx.strokeStyle = COLORS.ballSeam;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.7, -0.6, 0.6);
  ctx.stroke();
}
