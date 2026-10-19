import type { Gate, StateVector } from '../engine';
import type { Timeline } from './timeline';

/**
 * The contract every algorithm implements. An algorithm is data plus a few
 * pure functions: the views, timeline and player are shared.
 */

/** Colour role of a basis state. "focus" states (e.g. Grover's marked item) get the accent colour. */
export type Role = 'focus' | 'rest';

export interface Step {
  gate: Gate;
}

/** A labelled span on the circuit, e.g. one Grover iteration. */
export interface Bracket {
  from: number; // first step index
  to: number;   // last step index (inclusive)
  label: string;
  emphasis?: boolean;
}

export interface Fact {
  label: string;
  value: string;
  formula: string; // HTML
}

/** What the math notebook shows for the current frame. All fields are HTML. */
export interface MathCard {
  title: string;
  equation: string;
  rows: Array<[label: string, value: string]>;
  note: string;
}

export interface FrameContext {
  built: BuiltAlgorithm;
  timeline: Timeline;
  /** Continuous position on the timeline, 0..steps.length. */
  p: number;
  stepIndex: number;
  step: Step;
  /** Eased progress through the current step, 0..1. */
  t: number;
  rawT: number;
  state: StateVector;
  /** Exact states at the start and end of the current step. */
  before: StateVector;
  after: StateVector;
  atStart: boolean;
  atEnd: boolean;
  /** Present only while on a measurement step. */
  shots: { shown: number; total: number; outcomes: Int32Array } | null;
}

/** Output of a scene render: optional live readout and caption for its panel. */
export interface SceneOutput {
  live?: string;
  caption?: string;
}

/** A signature visual for one algorithm. Renders into an SVG the app provides. */
export interface Scene {
  title: string;
  viewBox: string;
  ariaLabel: string;
  /** Static caption, used when render() returns none. */
  caption?: string;
  render(svg: SVGSVGElement, ctx: FrameContext): SceneOutput | void;
}

export interface BuiltAlgorithm {
  n: number;
  steps: Step[];
  brackets: Bracket[];
  role(x: number): Role;
  facts: Fact[];
  narrate(ctx: FrameContext): MathCard;
  /** Optional custom "current state" line; the default groups amplitudes by role. */
  stateLine?(ctx: FrameContext): string;
  /** First scene sits beside the amplitude view; the rest go in the side column. */
  scenes: Scene[];
  /** Seed for reproducible shot sampling. */
  seed: number;
  /** Position the player opens at. */
  startAt?: number;
}

export interface ParamOption { value: number; label: string }

export interface ParamSpec<P> {
  key: keyof P & string;
  label: string;
  options(p: P): ParamOption[];
}

export interface AlgorithmDefinition<P extends Record<string, number>> {
  id: string;
  title: string;
  /** One-paragraph HTML intro for the page header. */
  intro: string;
  /** Emphasised fragment for the page heading. */
  headline: string;
  params: ParamSpec<P>[];
  defaults: P;
  /** Make params consistent after `changed` was edited (e.g. clamp the marked state when n shrinks). */
  normalize(p: P, changed?: keyof P): P;
  build(p: P): BuiltAlgorithm;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAlgorithm = AlgorithmDefinition<any>;
