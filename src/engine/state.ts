/**
 * Dense state-vector representation.
 *
 * Basis ordering: index x is read as an n-bit string, most significant bit first,
 * and qubit 0 is that most significant bit. So for n = 3, |q0 q1 q2> = |101> is x = 5.
 */
export interface StateVector {
  readonly n: number;
  readonly re: Float64Array;
  readonly im: Float64Array;
}

export const dimension = (n: number): number => 1 << n;

export function basisState(n: number, x = 0): StateVector {
  const N = dimension(n);
  if (x < 0 || x >= N) throw new RangeError(`basis index ${x} out of range for ${n} qubits`);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  re[x] = 1;
  return { n, re, im };
}

/** Equal superposition (1/sqrt N) sum_x |x>, i.e. |s>. */
export function uniformState(n: number): StateVector {
  const N = dimension(n);
  const re = new Float64Array(N).fill(1 / Math.sqrt(N));
  return { n, re, im: new Float64Array(N) };
}

export function cloneState(s: StateVector): StateVector {
  return { n: s.n, re: Float64Array.from(s.re), im: Float64Array.from(s.im) };
}

export function probability(s: StateVector, x: number): number {
  return s.re[x] ** 2 + s.im[x] ** 2;
}

export function probabilities(s: StateVector): Float64Array {
  const out = new Float64Array(s.re.length);
  for (let x = 0; x < out.length; x++) out[x] = probability(s, x);
  return out;
}

export function norm(s: StateVector): number {
  let t = 0;
  for (let x = 0; x < s.re.length; x++) t += probability(s, x);
  return Math.sqrt(t);
}

/** <a|b> as [re, im]. */
export function inner(a: StateVector, b: StateVector): [number, number] {
  let r = 0, i = 0;
  for (let x = 0; x < a.re.length; x++) {
    // conj(a) * b
    r += a.re[x] * b.re[x] + a.im[x] * b.im[x];
    i += a.re[x] * b.im[x] - a.im[x] * b.re[x];
  }
  return [r, i];
}

/** Bit string for x with qubit 0 first. */
export const bitString = (x: number, n: number): string => x.toString(2).padStart(n, '0');
