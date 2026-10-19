import { basisState, probabilities, sampleShots, type StateVector } from '../engine';
import type { BuiltAlgorithm, FrameContext } from './types';

export const SHOTS = 1024;

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Precomputes the exact state at every step boundary, then produces any
 * in-between frame by applying the current gate fractionally.
 */
export class Timeline {
  readonly boundaries: StateVector[];
  readonly outcomes: Int32Array;

  constructor(readonly built: BuiltAlgorithm, initial: StateVector = basisState(built.n, 0)) {
    this.boundaries = [initial];
    for (const step of built.steps) {
      this.boundaries.push(step.gate.apply(this.boundaries[this.boundaries.length - 1], 1));
    }
    this.outcomes = sampleShots(probabilities(this.final), SHOTS, built.seed);
  }

  get length(): number { return this.built.steps.length; }
  get final(): StateVector { return this.boundaries[this.boundaries.length - 1]; }

  frame(p: number, opts: { reduceMotion?: boolean } = {}): FrameContext {
    const L = this.length;
    const clamped = Math.max(0, Math.min(L, p));
    let stepIndex = Math.min(Math.floor(clamped), L - 1);
    let rawT = clamped - stepIndex;
    if (clamped >= L) { stepIndex = L - 1; rawT = 1; }
    const t = opts.reduceMotion ? (rawT > 0 ? 1 : 0) : easeInOutCubic(rawT);
    const step = this.built.steps[stepIndex];
    const before = this.boundaries[stepIndex];
    const state = step.gate.apply(before, t);
    const measuring = step.gate.glyph.kind === 'measure';
    return {
      built: this.built,
      timeline: this,
      p: clamped,
      stepIndex,
      step,
      t,
      rawT,
      state,
      before,
      after: this.boundaries[stepIndex + 1],
      atStart: clamped === 0,
      atEnd: clamped >= L,
      shots: measuring ? { shown: Math.floor(t * SHOTS), total: SHOTS, outcomes: this.outcomes } : null,
    };
  }
}
