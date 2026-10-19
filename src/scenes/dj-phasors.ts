import { MATRICES, bitString, c, fractionalPower, type C, type StateVector } from '../engine';
import type { FrameContext, Scene } from '../core/types';
import { fmtC } from '../ui/format';

export interface DJGeometry {
  /** Number of input qubits; the ancilla is one more qubit after them. */
  n: number;
  /** Truth table of f. */
  f: number[];
  /** Index of the step holding the final Hadamards. */
  finalH: number;
  /** Index of the oracle step. */
  oracle: number;
}

const cmul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);

/**
 * Input-register amplitudes with the ancilla projected onto |->:
 * a_x = <x, -|psi> = (psi[x,0] - psi[x,1]) / sqrt 2. The ancilla is the last
 * (least significant) qubit. Once the ancilla is in |->, the state is exactly
 * (sum_x a_x |x>) (x) |->.
 */
export function inputAmplitudes(s: StateVector): C[] {
  const out: C[] = [];
  for (let x = 0; x < s.re.length / 2; x++) {
    out.push(c((s.re[2 * x] - s.re[2 * x + 1]) * Math.SQRT1_2, (s.im[2 * x] - s.im[2 * x + 1]) * Math.SQRT1_2));
  }
  return out;
}

/**
 * The terms of <z| (H^t)^{(x)n} |psi_in>: term x is (H^t)_{z_q x_q} multiplied
 * over the input qubits, times a_x. Their sum is the amplitude of |z> after
 * applying H^t to every input qubit, so drawing them tip to tail shows exactly
 * how the final Hadamards build (or cancel) that amplitude.
 */
export function phasorTerms(a: C[], n: number, t: number, z = 0): C[] {
  const M = fractionalPower(MATRICES.H, t);
  return a.map((ax, x) => {
    let w = c(1);
    for (let q = 0; q < n; q++) {
      const zb = (z >> (n - 1 - q)) & 1, xb = (x >> (n - 1 - q)) & 1;
      w = cmul(w, M[2 * zb + xb]);
    }
    return cmul(w, ax);
  });
}

const R = 100;

/** Largest distance from the origin reached by a tip-to-tail chain. */
function reach(terms: C[]): number {
  let x = 0, y = 0, r = 0;
  for (const p of terms) { x += p.re; y += p.im; r = Math.max(r, Math.hypot(x, y)); }
  return r;
}

function arrow(x0: number, y0: number, x1: number, y1: number, cls: string, attrs = ''): string {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 0.6) return '';
  const ux = dx / len, uy = dy / len, hl = Math.min(9, len * 0.45), hw = hl * 0.5;
  const bx = x1 - ux * hl, by = y1 - uy * hl;
  return `<g class="${cls}" ${attrs}><line x1="${x0}" y1="${y0}" x2="${bx}" y2="${by}"/>` +
    `<polygon points="${x1},${y1} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}"/></g>`;
}

/**
 * Deutsch–Jozsa's signature view. The amplitude of |0...0> after the final
 * Hadamards is (1/N) sum_x (-1)^{f(x)}: one arrow per input, added tip to tail.
 * A constant f lines them up; a balanced f makes them cancel exactly.
 */
export function djPhasorScene(g: DJGeometry): Scene {
  const N = 1 << g.n;
  const zero = bitString(0, g.n);
  // Stack collinear arrows a few pixels apart so overlapping ones stay visible.
  const lane = Math.min(10, 72 / N);
  const laneY = (x: number) => (x - (N - 1) / 2) * lane;

  function chain(terms: C[], cls: string, labels: boolean, k: number): string {
    let h = '', sx = 0, sy = 0;
    terms.forEach((p, x) => {
      const ex = sx + p.re * k, ey = sy - p.im * k, dy = laneY(x);
      const kind = g.f[x] ? 'kick' : 'keep';
      h += arrow(sx, sy + dy, ex, ey + dy, `ph ${cls} ${kind}`);
      if (labels && N <= 8 && Math.hypot(ex - sx, ey - sy) > 14) {
        h += `<text class="phl ${kind}" x="${(sx + ex) / 2}" y="${(sy + ey) / 2 + dy - 4}" text-anchor="middle">${bitString(x, g.n)}</text>`;
      }
      sx = ex; sy = ey;
    });
    return h;
  }
  const sum = (terms: C[]) => terms.reduce((s, p) => c(s.re + p.re, s.im + p.im), c(0));

  // Through the oracle the chain always starts out unit length, so that view is unzoomed.
  // From the final Hadamards on, zoom so the largest chain of the step fills the circle.
  // The zoom is fixed for the whole step, so every motion inside it is the real H^t.
  let zoomFor: StateVector | null = null, zoom = 1;
  function liveZoom(before: StateVector): number {
    if (zoomFor !== before) {
      const a = inputAmplitudes(before);
      let r = 0;
      for (let i = 0; i <= 40; i++) r = Math.max(r, reach(phasorTerms(a, g.n, i / 40)));
      zoom = Math.max(1, Math.min(8, 0.95 / Math.max(r, 1e-9)));
      zoomFor = before;
    }
    return zoom;
  }

  return {
    title: 'Interference · phasors at the final Hadamards',
    viewBox: '-122 -116 244 232',
    ariaLabel: `Each input's contribution to the amplitude of |${zero}⟩, drawn as arrows added tip to tail`,
    render(svg, ctx: FrameContext) {
      const live = ctx.stepIndex >= g.finalH;
      // Before the final Hadamards: a preview of what they will add up to, from the live state.
      // During them: the exact terms of the live amplitude under H^t, growing into that preview.
      const src = live ? ctx.timeline.boundaries[g.finalH] : ctx.state;
      const zm = live ? liveZoom(src) : 1;
      const k = R * zm, u = 1 / zm; // u: the value at the circle's edge

      let h = `<circle class="unit" r="${R}"/>`;
      h += `<line class="axis" x1="-118" x2="118" y1="0" y2="0"/><line class="axis" y1="-112" y2="112" x1="0" x2="0"/>`;
      const tick = (val: number) => (zm === 1 ? '1' : val.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
      h += `<text class="ax" x="${R - 3}" y="13" text-anchor="end">+${tick(u)}</text><text class="ax" x="${-R + 3}" y="13">−${tick(u)}</text>`;
      h += `<text class="ax" x="4" y="${-R - 4}">${zm === 1 ? 'i' : `${tick(u)}i`}</text>`;
      if (zm > 1) h += `<text class="ax" x="-116" y="-104">zoom ×${zm.toFixed(1)}</text>`;

      if (ctx.stepIndex < g.oracle) {
        svg.innerHTML = h;
        return {
          live: '',
          caption: `Waiting for the ancilla to reach |−⟩. From the oracle on, this shows ⟨${zero}|H⊗${g.n}|ψ⟩ as ${N} arrows, one per input x.`,
        };
      }

      const a = inputAmplitudes(src);
      const target = phasorTerms(a, g.n, 1);
      const terms = live ? phasorTerms(a, g.n, ctx.stepIndex === g.finalH ? ctx.t : 1) : target;
      const total = sum(terms);

      if (live) h += chain(target, 'ghost', false, k);
      h += chain(terms, live ? 'live' : 'pre', true, k);
      h += arrow(0, 0, total.re * k, -total.im * k, 'ph resultant', 'data-link="focus"');
      h += `<circle class="tip" cx="${total.re * k}" cy="${-total.im * k}" r="3"/>`;
      svg.innerHTML = h;

      const amp = fmtC(total.re, total.im);
      const p = (total.re ** 2 + total.im ** 2).toFixed(3);
      return {
        live: `${live ? '' : 'preview '}⟨${zero}|ψ⟩ = ${amp}`,
        caption: live
          ? `Each arrow is input x's share of the |${zero}⟩ amplitude under Hᵗ, and they sum to the live amplitude (pink). The dashed arrows are where they end up: ±1/${N} each, so P(${zero}) = ${p}.${zm > 1 ? ` Zoomed ×${zm.toFixed(1)}: the circle is |a| = ${tick(u)}.` : ''}`
          : `Preview: what the final Hadamards would add up to from the current state, (1/√${N})·a_x per input. Amber arrows are inputs with f(x) = 1, which the oracle turns by π. Arrows are stacked a few pixels apart so overlapping ones stay visible.`,
      };
    },
  };
}
