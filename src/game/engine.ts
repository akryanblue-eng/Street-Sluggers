import { PITCH, RULES } from './constants';
import { computeLaunch, type LaunchWobble } from './launch';
import { basesFor, classifyBattedBall, labelFor } from './outcome';
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
  }

  startGame(): void {
    this.state = this.freshState();
    this.state.phase = 'menu';
  }

  /** Begin a new pitch. `now` is the current clock time in ms. */
  beginPitch(now: number): void {
    if (this.state.phase === 'gameover') return;
    // Small deterministic variation keeps pitches from feeling identical.
    const jitter = this.rng.range(-40, 40);
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
    const outcome = classifyBattedBall(trajectory);

    return this.applyResult({
      outcome,
      label: labelFor(outcome),
      timing,
      launch,
      trajectory,
    });
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
    if (this.state.phase === 'gameover') return;
    this.state.phase = this.state.inning > this.inningsPerGame ? 'gameover' : 'pitching';
    this.state.pitchStartMs = null;
  }

  // --- internals -----------------------------------------------------------

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
