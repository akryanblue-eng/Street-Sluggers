// Canvas renderer for the field, the pitch, and the batted ball. This module is
// deliberately self-contained: it takes the current game + live view and paints
// one frame. All gameplay decisions happen upstream in the engine — here we only
// draw. Reserved arcade extras (wall pads for rebounds, hazard zones, fielders
// for trick catches) get TODO hooks so the slice leaves room for them.

import { FIELD } from '../game/constants';
import { DEFAULT_FIELDERS, type FieldingPlay } from '../game/fielding';
import { BASE_POSITIONS, type ThrowingPlay } from '../game/throwing';
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

  // A fielder actively making a play is drawn in motion; hold him out of the
  // static defensive alignment so he isn't ghosted at his home spot.
  const play = view.result?.fielding;
  const activePlay =
    view.phase === 'resolving' && play && (play.fieldable || play.type === 'wall-assist')
      ? play
      : null;
  const throwPlay = view.phase === 'resolving' ? view.result?.throwing : undefined;
  const excluded = [activePlay?.fielder.id, throwPlay?.fielder.id, throwPlay?.receiver.id]
    .filter(Boolean) as string[];

  // A short camera bump when the fielder crashes into the wall on a robbery.
  const bump = activePlay?.type === 'wall-assist' ? cameraBump(activePlay, view) : null;
  ctx.save();
  if (bump) ctx.translate(bump.x, bump.y);

  drawBackground(ctx, w, h);
  drawGrass(ctx, w, h, proj);
  drawFoulLines(ctx, proj);
  drawWall(ctx, proj);
  drawInfield(ctx, proj);

  drawPlayers(ctx, proj, excluded);
  drawRunners(ctx, proj, state);

  if (view.phase === 'pitching') {
    drawReticle(ctx, proj, view.pitchProgress);
    drawPitch(ctx, proj, view.pitchProgress);
  } else if (view.phase === 'resolving') {
    if (throwPlay) drawThrowPlay(ctx, proj, throwPlay, view);
    if (view.result?.trajectory) drawBattedBall(ctx, proj, view);
    const wallImpact = view.result?.trajectory?.wallImpact;
    if (wallImpact) drawWallImpact(ctx, proj, wallImpact, view.ballAnimSeconds);
    if (activePlay?.type === 'wall-assist') drawWallAssist(ctx, proj, activePlay, view);
    else if (activePlay) drawFieldingPlay(ctx, proj, activePlay, view);
  }

  ctx.restore();
}

/** Deterministic decaying screen shake around the moment of a wall robbery. */
function cameraBump(play: FieldingPlay, view: LiveView): { x: number; y: number } | null {
  if (!play.trickWindow) return null;
  const dt = view.ballAnimSeconds * 1000 - play.trickWindow.centerMs;
  if (dt < 0 || dt > 260) return null;
  const decay = 1 - dt / 260;
  const mag = 4 * decay;
  return { x: Math.sin(dt * 0.09) * mag, y: Math.cos(dt * 0.11) * mag };
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
  // Dirt diamond around the base paths (shared base coordinates).
  const homePt = proj.toScreen(BASE_POSITIONS.home.x, BASE_POSITIONS.home.y, 0);
  const firstPt = proj.toScreen(BASE_POSITIONS.first.x, BASE_POSITIONS.first.y, 0);
  const secondPt = proj.toScreen(BASE_POSITIONS.second.x, BASE_POSITIONS.second.y, 0);
  const thirdPt = proj.toScreen(BASE_POSITIONS.third.x, BASE_POSITIONS.third.y, 0);

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
  excludeIds: string[] = [],
) {
  // The defensive alignment (pitcher is part of it), each at its home spot.
  for (const f of DEFAULT_FIELDERS) {
    if (excludeIds.includes(f.id)) continue;
    const p = proj.toScreen(f.x, f.y, 0);
    drawBlob(ctx, p.sx, p.sy, 8 * p.scale + 2, COLORS.fielder, COLORS.fielderOutline);
  }

  // Batter at the plate.
  const bat = proj.toScreen(-9, 4, 0);
  drawBlob(ctx, bat.sx, bat.sy, 11, COLORS.batter, COLORS.fielderOutline);
}

/** Little dots on the diamond for any runners currently aboard. */
function drawRunners(ctx: CanvasRenderingContext2D, proj: Projection, state: GameState) {
  const spots = [BASE_POSITIONS.first, BASE_POSITIONS.second, BASE_POSITIONS.third];
  state.bases.forEach((occupied, i) => {
    if (!occupied) return;
    const spot = spots[i];
    const p = proj.toScreen(spot.x, spot.y, 0);
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

/** The wall-assisted robbery: the outfielder sprints to the fence, plants a
 *  foot, and leaps to snag a would-be homer as it crosses. All procedural. */
function drawWallAssist(
  ctx: CanvasRenderingContext2D,
  proj: Projection,
  play: FieldingPlay,
  view: LiveView,
) {
  const win = play.trickWindow;
  if (!win) return;
  const ballMs = view.ballAnimSeconds * 1000;
  const { x: px, y: py } = play.playPoint;
  const { from } = play.route;

  // Sprint to the base of the wall, arriving by the plant (window open).
  const runT = clamp01(win.openMs > 0 ? ballMs / win.openMs : 1);
  const rx = from.x + (px - from.x) * runT;
  const ry = from.y + (py - from.y) * runT;

  // After arrival, plant and leap up the wall (up then down).
  const leap = clamp01((ballMs - win.openMs) / Math.max(1, win.closeMs - win.openMs));
  const z = 18 * Math.sin(leap * Math.PI);
  const atWall = runT >= 1;
  const fxy = atWall ? { x: px, y: py } : { x: rx, y: ry };

  // Ground shadow at the wall base.
  const ground = proj.toScreen(fxy.x, fxy.y, 0);
  ctx.beginPath();
  ctx.ellipse(ground.sx, ground.sy, 8, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.shadow;
  ctx.fill();

  // Brick dust kicking off the wall as the sneaker plants.
  if (atWall && leap > 0 && leap < 0.6) {
    const fade = 1 - leap / 0.6;
    ctx.save();
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = '#c98a5a';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI - Math.PI / 2;
      const r = 6 + leap * 26;
      ctx.beginPath();
      ctx.arc(ground.sx + Math.cos(a) * r, ground.sy - Math.abs(Math.sin(a)) * r * 0.6, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The leaping fielder.
  const air = proj.toScreen(fxy.x, fxy.y, z);
  drawBlob(ctx, air.sx, air.sy, 10 * air.scale + 2, COLORS.fielderActive, COLORS.fielderOutline);

  // Glove reaching above the top of the wall at the apex of the leap.
  const glove = proj.toScreen(fxy.x, fxy.y, z + 6);
  ctx.beginPath();
  ctx.arc(glove.sx, glove.sy, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#8a5a2b';
  ctx.fill();

  // Timing ring at the wall-clearance height, closing on the crossing moment.
  const target = proj.toScreen(px, py, FIELD.wallHeight);
  const remaining = Math.abs(win.centerMs - ballMs);
  const hot = remaining <= win.successHalfMs;
  ctx.beginPath();
  ctx.arc(target.sx, target.sy, 12 + Math.min(64, remaining / 6), 0, Math.PI * 2);
  ctx.strokeStyle = hot ? COLORS.reticleHot : COLORS.reticle;
  ctx.lineWidth = 3;
  ctx.stroke();

  if (view.trickPrompt) {
    ctx.save();
    ctx.font = '800 16px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.reticleHot;
    ctx.fillText('ROB IT!', target.sx, target.sy - 22);
    ctx.restore();
  }
}

/** The ground-ball throw to first: the batter-runner sprints, the infielder
 *  scoops, a timing ring cues the release, the ball flies to the bag, and a
 *  dust puff marks the close play. All procedural. */
function drawThrowPlay(
  ctx: CanvasRenderingContext2D,
  proj: Projection,
  play: ThrowingPlay,
  view: LiveView,
) {
  const ballMs = view.ballAnimSeconds * 1000;
  const first = BASE_POSITIONS.first;

  // The batter-runner sprinting home → first.
  const runnerT = clamp01(ballMs / (play.runnerArrivalSec * 1000));
  const rx = BASE_POSITIONS.home.x + (first.x - BASE_POSITIONS.home.x) * runnerT;
  const ry = BASE_POSITIONS.home.y + (first.y - BASE_POSITIONS.home.y) * runnerT;
  const rp = proj.toScreen(rx, ry, 0);
  drawBlob(ctx, rp.sx, rp.sy, 9 * rp.scale + 1, COLORS.batter, COLORS.fielderOutline);

  // The infielder charging the ball, dipping into a scoop on arrival.
  const fielderT = clamp01(ballMs / (play.pickupTimeSec * 1000));
  const fx = play.fielder.x + (play.pickupPoint.x - play.fielder.x) * fielderT;
  const fy = play.fielder.y + (play.pickupPoint.y - play.fielder.y) * fielderT;
  const scooping = fielderT >= 1 && ballMs < play.pickupTimeSec * 1000 + 200;
  const fp = proj.toScreen(fx, fy, 0);
  if (scooping) {
    ctx.beginPath();
    ctx.ellipse(fp.sx, fp.sy + 4, 7, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.dirt;
    ctx.fill();
  }
  drawBlob(ctx, fp.sx, fp.sy, 9 * fp.scale + 2, COLORS.fielderActive, COLORS.fielderOutline);

  // The first baseman waiting on the bag.
  const firstScreen = proj.toScreen(first.x, first.y, 0);
  drawBlob(ctx, firstScreen.sx, firstScreen.sy, 9 * firstScreen.scale + 2, COLORS.fielder, COLORS.fielderOutline);

  // Release-timing ring at the fielder, closing on the ideal release.
  if (play.window) {
    const remaining = Math.abs(play.window.centerMs - ballMs);
    const hot = remaining <= play.window.successHalfMs;
    ctx.beginPath();
    ctx.arc(fp.sx, fp.sy, 12 + Math.min(60, remaining / 6), 0, Math.PI * 2);
    ctx.strokeStyle = hot ? COLORS.reticleHot : COLORS.reticle;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (view.trickPrompt) {
      ctx.save();
      ctx.font = '800 16px "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.reticleHot;
      ctx.fillText('THROW!', fp.sx, fp.sy - 22);
      ctx.restore();
    }

    // The thrown ball travelling to first after the release.
    const releaseSec = play.window.centerMs / 1000;
    const span = Math.max(0.05, play.idealThrowArrivalSec - releaseSec);
    const ballT = clamp01((view.ballAnimSeconds - releaseSec) / span);
    if (ballT > 0 && ballT < 1) {
      const bx = play.pickupPoint.x + (first.x - play.pickupPoint.x) * ballT;
      const by = play.pickupPoint.y + (first.y - play.pickupPoint.y) * ballT;
      const bp = proj.toScreen(bx, by, 4);
      drawBall(ctx, bp.sx, bp.sy, 5);
    }
  }

  // Close-play dust puff at the bag around the moment of decision.
  const closeMs = Math.min(play.idealThrowArrivalSec, play.runnerArrivalSec) * 1000;
  if (ballMs >= closeMs && ballMs < closeMs + 320) {
    const fade = 1 - (ballMs - closeMs) / 320;
    ctx.save();
    ctx.globalAlpha = 0.55 * fade;
    ctx.fillStyle = COLORS.dirt;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 5 + (1 - fade) * 22;
      ctx.beginPath();
      ctx.arc(firstScreen.sx + Math.cos(a) * r, firstScreen.sy - Math.abs(Math.sin(a)) * r * 0.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
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
