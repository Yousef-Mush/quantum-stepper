/**
 * Fractional powers of gates, U^t for t in [0, 1].
 *
 * This is what lets every gate animate continuously instead of snapping: the
 * frame at time t shows the state after U^t. The path is the shortest one
 * (principal branch), so U^0 = I and U^1 = U exactly.
 */

export interface C { re: number; im: number }
/** Row-major 2x2 complex matrix [m00, m01, m10, m11]. */
export type Mat2 = readonly [C, C, C, C];

export const c = (re: number, im = 0): C => ({ re, im });
const mul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const sub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
const expi = (phi: number): C => c(Math.cos(phi), Math.sin(phi));
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * U^t for any 2x2 unitary.
 *
 * Write U = e^{i a} V with V in SU(2), and V = cos(b/2) I - i sin(b/2) (n . sigma).
 * Then U^t = e^{i a t} [cos(b t / 2) I - i sin(b t / 2) (n . sigma)]:
 * a global phase that grows linearly plus a rotation about a fixed Bloch axis n.
 */
export function fractionalPower(U: Mat2, t: number): Mat2 {
  const [m00, m01, m10, m11] = U;
  const det = sub(mul(m00, m11), mul(m01, m10));
  let alpha = Math.atan2(det.im, det.re) / 2;
  const unphase = expi(-alpha);
  const v00 = mul(m00, unphase);
  const v01 = mul(m01, unphase);

  const cosHalf = clamp(v00.re);
  let half = Math.acos(cosHalf);
  const s = Math.sin(half);

  if (s < 1e-12) {
    // V = +I or -I: U is a pure phase.
    if (cosHalf < 0) alpha += Math.PI;
    const ph = expi(alpha * t);
    return [ph, c(0), c(0), ph];
  }

  const nx = -v01.im / s;
  const ny = -v01.re / s;
  const nz = -v00.im / s;
  half *= t;
  const ct = Math.cos(half), st = Math.sin(half);
  const ph = expi(alpha * t);
  return [
    mul(ph, c(ct, -st * nz)),
    mul(ph, c(-st * ny, -st * nx)),
    mul(ph, c(st * ny, -st * nx)),
    mul(ph, c(ct, st * nz)),
  ];
}

const r2 = Math.SQRT1_2;
export const MATRICES = {
  I: [c(1), c(0), c(0), c(1)] as Mat2,
  H: [c(r2), c(r2), c(r2), c(-r2)] as Mat2,
  X: [c(0), c(1), c(1), c(0)] as Mat2,
  Y: [c(0), c(0, -1), c(0, 1), c(0)] as Mat2,
  Z: [c(1), c(0), c(0), c(-1)] as Mat2,
  S: [c(1), c(0), c(0), c(0, 1)] as Mat2,
  T: [c(1), c(0), c(0), expi(Math.PI / 4)] as Mat2,
};
