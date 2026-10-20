import { describe, expect, it } from 'vitest';
import {
  MATRICES, basisState, fractionalPower, layer, markOracle, norm, probability, reflectAbout,
  sampleShots, uniformState, xorOracle, type Mat2, type StateVector,
} from '../src/engine';

const EPS = 1e-10;

function matMul(A: Mat2, B: Mat2): Mat2 {
  const m = (a: { re: number; im: number }, b: { re: number; im: number }) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  const add = (a: { re: number; im: number }, b: { re: number; im: number }) => ({ re: a.re + b.re, im: a.im + b.im });
  return [
    add(m(A[0], B[0]), m(A[1], B[2])), add(m(A[0], B[1]), m(A[1], B[3])),
    add(m(A[2], B[0]), m(A[3], B[2])), add(m(A[2], B[1]), m(A[3], B[3])),
  ];
}
function expectMatClose(A: Mat2, B: Mat2) {
  for (let i = 0; i < 4; i++) {
    expect(A[i].re).toBeCloseTo(B[i].re, 10);
    expect(A[i].im).toBeCloseTo(B[i].im, 10);
  }
}
function expectStateClose(a: StateVector, b: StateVector) {
  for (let x = 0; x < a.re.length; x++) {
    expect(a.re[x]).toBeCloseTo(b.re[x], 10);
    expect(a.im[x]).toBeCloseTo(b.im[x], 10);
  }
}
/** U^dagger U = I */
function expectUnitary(U: Mat2) {
  const dag: Mat2 = [
    { re: U[0].re, im: -U[0].im }, { re: U[2].re, im: -U[2].im },
    { re: U[1].re, im: -U[1].im }, { re: U[3].re, im: -U[3].im },
  ];
  expectMatClose(matMul(dag, U), MATRICES.I);
}

describe('fractionalPower', () => {
  const gates = Object.entries(MATRICES) as [string, Mat2][];

  it.each(gates)('%s^0 = I and %s^1 = itself', (_name, U) => {
    expectMatClose(fractionalPower(U, 0), MATRICES.I);
    expectMatClose(fractionalPower(U, 1), U);
  });

  it.each(gates)('%s^t is unitary for every t', (_name, U) => {
    for (const t of [0.1, 0.33, 0.5, 0.77, 0.95]) expectUnitary(fractionalPower(U, t));
  });

  it.each(gates)('%s^a %s^b = %s^(a+b)', (_name, U) => {
    expectMatClose(matMul(fractionalPower(U, 0.3), fractionalPower(U, 0.45)), fractionalPower(U, 0.75));
  });

  it('sqrt(X) squared is X', () => {
    const r = fractionalPower(MATRICES.X, 0.5);
    expectMatClose(matMul(r, r), MATRICES.X);
  });
});

describe('gates', () => {
  it('H on every qubit maps |000> to the uniform superposition', () => {
    const s = layer('Hadamard', 'H', MATRICES.H, 3).apply(basisState(3, 0), 1);
    expectStateClose(s, uniformState(3));
  });

  it('every gate preserves the norm at every t', () => {
    const n = 4;
    const gates = [layer('H', 'H', MATRICES.H, n), markOracle(n, [6]), reflectAbout('D', 'D', uniformState(n))];
    let s = basisState(n, 3);
    for (const g of gates) {
      for (const t of [0, 0.2, 0.5, 0.8, 1]) expect(Math.abs(norm(g.apply(s, t)) - 1)).toBeLessThan(EPS);
      s = g.apply(s, 1);
    }
  });

  it('the oracle flips only the marked sign and leaves probabilities unchanged', () => {
    const s0 = uniformState(3);
    const s1 = markOracle(3, [5]).apply(s0, 1);
    for (let x = 0; x < 8; x++) {
      expect(s1.re[x]).toBeCloseTo(x === 5 ? -s0.re[x] : s0.re[x], 12);
      expect(probability(s1, x)).toBeCloseTo(probability(s0, x), 12);
    }
  });

  it('reflections compose along their path: R^0.3 then R^0.7 equals R', () => {
    const R = reflectAbout('D', 'D', uniformState(3));
    const s0 = markOracle(3, [2]).apply(uniformState(3), 1);
    expectStateClose(R.apply(R.apply(s0, 0.3), 0.7), R.apply(s0, 1));
  });

  it('diffusion is inversion about the mean', () => {
    const s0 = markOracle(3, [5]).apply(uniformState(3), 1);
    let mean = 0;
    for (let x = 0; x < 8; x++) mean += s0.re[x];
    mean /= 8;
    const s1 = reflectAbout('D', 'D', uniformState(3)).apply(s0, 1);
    for (let x = 0; x < 8; x++) expect(s1.re[x]).toBeCloseTo(2 * mean - s0.re[x], 12);
  });

  it('a layer on a qubit subset leaves the other qubits alone: X on the last qubit maps |000> to |001>', () => {
    expectStateClose(layer('X', 'X', MATRICES.X, 3, [2]).apply(basisState(3, 0), 1), basisState(3, 1));
  });

  it('the XOR oracle maps |x>|y> to |x>|y xor f(x)>, with the target anywhere', () => {
    const f = (x: number) => (x === 1 || x === 2 ? 1 : 0);
    // Target last: index = 2x + y.
    const last = xorOracle('U', 'U', 3, 2, f);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) {
      expectStateClose(last.apply(basisState(3, 2 * x + y), 1), basisState(3, 2 * x + (y ^ f(x))));
    }
    // Target in the middle: x is qubit 0 then qubit 2.
    const mid = xorOracle('U', 'U', 3, 1, f);
    for (let i = 0; i < 8; i++) {
      const x = ((i >> 2) << 1) | (i & 1);
      expectStateClose(mid.apply(basisState(3, i), 1), basisState(3, i ^ (f(x) << 1)));
    }
  });

  it('the XOR oracle is a reflection: unitary along its path, U^0.3 U^0.7 = U, U^2 = I', () => {
    const U = xorOracle('U', 'U', 3, 2, x => x & 1);
    const s0 = layer('H', 'H', MATRICES.H, 3).apply(basisState(3, 1), 1);
    for (const t of [0.2, 0.5, 0.8]) expect(Math.abs(norm(U.apply(s0, t)) - 1)).toBeLessThan(EPS);
    expectStateClose(U.apply(U.apply(s0, 0.3), 0.7), U.apply(s0, 1));
    expectStateClose(U.apply(U.apply(s0, 1), 1), s0);
  });

  it('gates never mutate their input', () => {
    const s = uniformState(3);
    const copy = Float64Array.from(s.re);
    markOracle(3, [1]).apply(s, 1);
    reflectAbout('D', 'D', uniformState(3)).apply(s, 0.5);
    expect(Array.from(s.re)).toEqual(Array.from(copy));
  });
});

describe('sampling', () => {
  it('is deterministic for a seed and follows the distribution', () => {
    const probs = [0.1, 0.6, 0.3, 0];
    const a = sampleShots(probs, 20000, 7), b = sampleShots(probs, 20000, 7);
    expect(Array.from(a)).toEqual(Array.from(b));
    const counts = [0, 0, 0, 0];
    for (const x of a) counts[x]++;
    probs.forEach((p, x) => expect(Math.abs(counts[x] / 20000 - p)).toBeLessThan(0.015));
    expect(counts[3]).toBe(0);
  });
});
