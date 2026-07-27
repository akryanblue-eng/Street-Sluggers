import { PITCH, RULES } from './constants';
import {
  resolveCatch,
  resolveFielding,
  type FieldingOutcome,
  type FieldingPlay,
  type TrickAttempt,
} from './fielding';
import { computeLaunch, type LaunchWobble } from './launch';
import { basesFor, labelFor } from './outcome';
import { simulateBattedBall } from './physics';
import { createRng, type Rng } from './rng';
import { advanceRunners, EMPTY_BASES, type Bases } from './runners';
import { resolveTiming } from './timing';
import type { HitOutcome, PlayResult, SwingType } from './types';

export type GamePhase = 'menu' | 'pitching' | 'resolving' | 'gameover';

export interface GameState {
  phase: GamePhase;
  inning: number;
  outs: number;
  strikes: number;
  runs: number;
  bases: Bases;
  /** Absolute start time (ms) of the in-flight pitch, or null when not pitching. */
  pitchStartMs: number | null;
  /** Ideal contact moment relative to pitch start (ms). */
  contactMs: number;
  /** The most recently resolved play, for the HUD / overlay / animation. */
  lastResult: PlayResult | null;
}

export interface EngineOptions {
  seed?: number;
  inningsPerGame?: number;
}

/**
 * The mutable gameplay core. Frameworks (our React hook) drive it with a real
 * clock via `now`; every derived number comes from the pure modules, so the
 * same seed + same inputs always produce the same game.
 */
export class GameEngine {
  private state: GameState;
  private rng: Rng;
  private readonly inningsPerGame: number;
  /** A batted ball whose fielding outcome is not yet applied to the score,
   *  because its trick-catch window may still change it. */
  private pending: { play: FieldingPlay; attempt: TrickAttempt | null } | null = null;

  constructor(options: EngineOptions = {}) {
    this.rng = createRng(options.seed ?? 0x51ac6);
    this.inningsPerGame = options.inningsPerGame ?? RULES.inningsPerGame;
    this.state = this.freshState();
  }

  private freshState(): GameState {
    return {
      phase: 'menu',
      inning: 1,
      outs: 0,
      strikes: 0,
      runs: 0,
      bases: [...EMPTY_BASES] as Bases,
      pitchStartMs: null,
      contactMs: PITCH.travelMs,
      lastResult: null,
    };
  }

  /** A defensive copy so React never mutates engine internals. */
  getState(): GameState {
    return { ...this.state, bases: [...this.state.bases] as Bases };
  }

  reset(seed?: number): void {
    if (seed !== undefined) this.rng = createRng(seed);
    this.state = this.freshState();
    this.pending = null;
  }

  startGame(): void {
    this.state = this.freshState();
    this.pending = null;
    this.state.phase = 'menu';
  }

  /** Begin a new pitch. `now` is the current clock time in ms. */
  beginPitch(now: number): void {
    if (this.state.phase === 'gameover') return;
    // Small deterministic variation keeps pitches from feeling identical.
    const jitter = this.rng.range(-40, 40);
    this.pending = null;
    this.state.phase = 'pitching';
    this.state.pitchStartMs = now;
    this.state.contactMs = PITCH.travelMs + jitter;
    this.state.lastResult = null;
  }

  /** Register a swing at time `now`. Returns the resolved play. */
  registerSwing(now: number, swingType: SwingType = 'contact'): PlayResult {
    if (this.state.phase !== 'pitching' || this.state.pitchStartMs === null) {
      return this.state.lastResult ?? this.takeResult();
    }
    const swingMs = now - this.state.pitchStartMs;
    const timing = resolveTiming(swingMs, this.state.contactMs);

    if (!timing.contact) {
      // Swing and a miss.
      return this.applyResult({ outcome: 'strike', label: labelFor('strike'), timing });
    }

    const wobble = this.rollWobble(timing.quality);
    const launch = computeLaunch(timing, swingType, wobble);
    const trajectory = simulateBattedBall(launch);
    const play = resolveFielding(trajectory);

    // If a fielder can make a play (routine or trick), defer scoring until the
    // trick-catch window closes — the player may still change the result.
    if (play.ordinaryCatch || play.trickable) {
      const provisional = resolveCatch(play, null);
      this.pending = { play, attempt: null };
      this.state.phase = 'resolving';
      this.state.lastResult = {
        outcome: provisional.outcome,
        label: this.fieldingLabel(provisional),
        timing,
        launch,
        trajectory,
        fielding: play,
        pending: true,
        caught: provisional.caught,
        catchKind: provisional.kind,
      };
      return this.state.lastResult;
    }

    // Home run, foul, or a clean drop no fielder can reach: settle immediately.
    return this.applyResult({
      outcome: play.baseOutcome,
      label: labelFor(play.baseOutcome),
      timing,
      launch,
      trajectory,
      fielding: play,
    });
  }

  /**
   * Register a player-triggered trick-catch attempt during a batted ball's
   * flight. `pressMs` is the time of the press relative to contact.
   */
  registerTrickAttempt(pressMs: number): PlayResult | null {
    if (!this.pending || this.pending.attempt !== null) return this.state.lastResult;
    if (!this.pending.play.trickable) return this.state.lastResult;

    this.pending.attempt = { pressMs };
    const r = resolveCatch(this.pending.play, this.pending.attempt);
    // Reflect the attempt in the display, but keep it pending until finalized.
    this.state.lastResult = this.state.lastResult && {
      ...this.state.lastResult,
      outcome: r.outcome,
      label: this.fieldingLabel(r),
      caught: r.caught,
      catchKind: r.kind,
      pending: true,
    };
    return this.state.lastResult;
  }

  /** True while a batted ball's fielding play is awaiting resolution. */
  hasPendingPlay(): boolean {
    return this.pending !== null;
  }

  /** The active trick-catch window (ms relative to contact), if any. */
  activeTrickWindow(): FieldingPlay['trickWindow'] {
    return this.pending?.play.trickable ? this.pending.play.trickWindow : null;
  }

  /**
   * Finalize a pending fielding play: compute the outcome from the recorded
   * trick attempt (if any) and apply it to the score.
   */
  finalizePlay(): PlayResult | null {
    if (!this.pending) return this.state.lastResult;
    const r = resolveCatch(this.pending.play, this.pending.attempt);
    const play = this.pending.play;
    this.pending = null;
    this.applyOutcome(r.outcome);
    this.state.lastResult = {
      ...(this.state.lastResult as PlayResult),
      outcome: r.outcome,
      label: this.fieldingLabel(r),
      fielding: play,
      caught: r.caught,
      catchKind: r.kind,
      pending: false,
    };
    return this.state.lastResult;
  }

  /** The pitch flew by without a swing — a called strike. */
  registerTake(): PlayResult {
    if (this.state.phase !== 'pitching') {
      return this.state.lastResult ?? this.takeResult();
    }
    return this.applyResult(this.takeResult());
  }

  /**
   * True once the swing window has fully closed for the current pitch, i.e. the
   * hook should record a take. `now` is the current clock time.
   */
  pitchExpired(now: number): boolean {
    if (this.state.phase !== 'pitching' || this.state.pitchStartMs === null) return false;
    const elapsed = now - this.state.pitchStartMs;
    return elapsed > this.state.contactMs + PITCH.swingWindowMs;
  }

  /** Move on after a resolved play: next pitch, or game over. */
  advanceAfterResult(): void {
    // Safety net: if a fielding play was never finalized (e.g. the driver
    // skipped it), settle it now so the score is never silently dropped.
    if (this.pending) this.finalizePlay();
    if (this.state.phase === 'gameover') return;
    this.state.phase = this.state.inning > this.inningsPerGame ? 'gameover' : 'pitching';
    this.state.pitchStartMs = null;
  }

  // --- internals -----------------------------------------------------------

  private fieldingLabel(r: FieldingOutcome): string {
    switch (r.kind) {
      case 'trick':
        return 'ROBBED! 🧤';
      case 'ordinary':
        return 'Caught — out!';
      case 'trick-failed':
        return `${labelFor(r.outcome)} (missed!)`;
      default:
        return labelFor(r.outcome);
    }
  }

  private takeResult(): PlayResult {
    return {
      outcome: 'strike',
      label: 'Called strike',
      timing: resolveTiming(null, this.state.contactMs),
    };
  }

  private rollWobble(quality: number): LaunchWobble {
    // Better contact → tighter dispersion. Perfect barrels are nearly pure.
    const spread = 1 - quality;
    return {
      exitVelocity: this.rng.range(-6, 6) * spread,
      launchAngleDeg: this.rng.range(-5, 5) * spread,
      sprayAngleDeg: this.rng.range(-7, 7) * spread,
    };
  }

  private applyResult(result: PlayResult): PlayResult {
    this.applyOutcome(result.outcome);
    this.state.lastResult = result;
    this.state.phase = 'resolving';
    return result;
  }

  private applyOutcome(outcome: HitOutcome): void {
    switch (outcome) {
      case 'strike':
        this.state.strikes += 1;
        if (this.state.strikes >= RULES.strikesPerOut) this.recordOut();
        break;
      case 'foul':
        // A foul can't be strike three.
        if (this.state.strikes < RULES.strikesPerOut - 1) this.state.strikes += 1;
        break;
      case 'out':
        this.recordOut();
        break;
      default: {
        // A hit: advance runners, tally runs, fresh count for the next batter.
        const { bases, runs } = advanceRunners(this.state.bases, basesFor(outcome));
        this.state.bases = bases;
        this.state.runs += runs;
        this.state.strikes = 0;
        break;
      }
    }
  }

  private recordOut(): void {
    this.state.outs += 1;
    this.state.strikes = 0;
    if (this.state.outs >= RULES.outsPerInning) this.endInning();
  }

  private endInning(): void {
    this.state.outs = 0;
    this.state.bases = [...EMPTY_BASES] as Bases;
    this.state.inning += 1;
    if (this.state.inning > this.inningsPerGame) {
      this.state.phase = 'gameover';
    }
  }
}
