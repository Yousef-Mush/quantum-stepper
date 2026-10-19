import { fractionalPower, type Mat2 } from './fractional';
import { cloneState, dimension, inner, type StateVector } from './state';

/** How a gate is drawn on the circuit timeline. */
export interface CircuitGlyph {
  /** per-qubit: one box per listed qubit. block: one tall box over all qubits. measure: meters. */
  kind: 'per-qubit' | 'block' | 'measure';
  symbol: string;
  qubits: number[];
  /** Colour hint, matching basis-state roles in the views. */
  tone?: 'focus' | 'rest' | 'neutral';
}

export interface Gate {
  /** Short display name, e.g. "Hadamard". */
  name: string;
  glyph: CircuitGlyph;
  /** Seconds of playback for this gate at 1x. */
  duration: number;
  /** Returns a NEW state: input after U^t. t = 0 is identity, t = 1 is the full gate. */
  apply(state: StateVector, t: number): StateVector;
}

const allQubits = (n: number) => Array.from({ length: n }, (_, q) => q);

function applyMat2(s: StateVector, q: number, M: Mat2): void {
  const { n, re, im } = s;
  const mask = 1 << (n - 1 - q);
  const [a, b, cc, d] = M;
  for (let i = 0; i < re.length; i++) {
    if (i & mask) continue;
    const j = i | mask;
    const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
    re[i] = a.re * xr - a.im * xi + b.re * yr - b.im * yi;
    im[i] = a.re * xi + a.im * xr + b.re * yi + b.im * yr;
    re[j] = cc.re * xr - cc.im * xi + d.re * yr - d.im * yi;
    im[j] = cc.re * xi + cc.im * xr + d.re * yi + d.im * yr;
  }
}

/** The same single-qubit gate on several qubits at once (e.g. H on every qubit). */
export function layer(name: string, symbol: string, U: Mat2, n: number, qubits = allQubits(n), duration = 1.9): Gate {
  return {
    name, duration,
    glyph: { kind: 'per-qubit', symbol, qubits, tone: 'neutral' },
    apply(state, t) {
      const s = cloneState(state);
      if (t <= 0) return s;
      const M = fractionalPower(U, t);
      for (const q of qubits) applyMat2(s, q, M);
      return s;
    },
  };
}

/** Diagonal gate |x> -> e^{i phi(x)} |x>. Fractional power scales each phase: e^{i phi(x) t}. */
export function phaseOracle(name: string, symbol: string, n: number, phase: (x: number) => number, duration = 1.3): Gate {
  const N = dimension(n);
  const phases = Float64Array.from({ length: N }, (_, x) => phase(x));
  return {
    name, duration,
    glyph: { kind: 'block', symbol, qubits: allQubits(n), tone: 'focus' },
    apply(state, t) {
      const s = cloneState(state);
      if (t <= 0) return s;
      for (let x = 0; x < N; x++) {
        const ph = phases[x] * t;
        if (ph === 0) continue;
        const cr = Math.cos(ph), ci = Math.sin(ph), ar = s.re[x], ai = s.im[x];
        s.re[x] = ar * cr - ai * ci;
        s.im[x] = ar * ci + ai * cr;
      }
      return s;
    },
  };
}

/** Oracle that flips the sign of the marked basis states: O = I - 2 sum_w |w><w|. */
export function markOracle(n: number, marked: number[], symbol = 'O'): Gate {
  const set = new Set(marked);
  return phaseOracle('Oracle', symbol, n, x => (set.has(x) ? Math.PI : 0));
}

/**
 * Reflection about a state: U = 2|v><v| - I.
 * U^t keeps the |v> component and turns the phase of everything orthogonal:
 * U^t = |v><v| + e^{i pi t} (I - |v><v|).
 */
export function reflectAbout(name: string, symbol: string, v: StateVector, duration = 1.8): Gate {
  return {
    name, duration,
    glyph: { kind: 'block', symbol, qubits: allQubits(v.n), tone: 'rest' },
    apply(state, t) {
      const s = cloneState(state);
      if (t <= 0) return s;
      const [pr, pi] = inner(v, state); // <v|psi>
      const er = Math.cos(Math.PI * t), ei = Math.sin(Math.PI * t);
      for (let x = 0; x < s.re.length; x++) {
        // projection component c_x = <v|psi> v_x
        const cr = pr * v.re[x] - pi * v.im[x];
        const ci = pr * v.im[x] + pi * v.re[x];
        const dr = s.re[x] - cr, di = s.im[x] - ci;
        s.re[x] = cr + dr * er - di * ei;
        s.im[x] = ci + dr * ei + di * er;
      }
      return s;
    },
  };
}

/** Measurement in the computational basis. Leaves the state untouched; views sample shots from it. */
export function measurement(n: number, duration = 3.2): Gate {
  return {
    name: 'Measure', duration,
    glyph: { kind: 'measure', symbol: 'M', qubits: allQubits(n), tone: 'neutral' },
    apply: state => cloneState(state),
  };
}
