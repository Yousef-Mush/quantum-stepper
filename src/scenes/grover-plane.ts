import type { StateVector } from '../engine';
import type { FrameContext, Scene } from '../core/types';
import { fmt } from '../ui/format';

export interface GroverGeometry {
  N: number;
  marked: number;
  theta: number;
  kStar: number;
  kMax: number;
  iterations: number;
}

const R = 100;

/** Coordinates of a state in the plane spanned by |s'> (x axis) and |w> (y axis). */
export function projectToGroverPlane(s: StateVector, marked: number): { x: number; y: number } {
  const N = s.re.length;
  let rest = 0;
  for (let i = 0; i < N; i++) if (i !== marked) rest += s.re[i];
  return { x: rest / Math.sqrt(N - 1), y: s.re[marked] };
}

/**
 * Squared length of the state's component inside the plane, using the full
 * complex amplitudes: |<s'|psi>|^2 + |<w|psi>|^2. This is 1 exactly when the
 * state lies in the plane, even mid-gate when the amplitudes are complex and
 * the drawn (real-part) arrow is shorter.
 */
export function planeWeight(s: StateVector, marked: number): number {
  const N = s.re.length;
  let re = 0, im = 0;
  for (let i = 0; i < N; i++) if (i !== marked) { re += s.re[i]; im += s.im[i]; }
  return (re * re + im * im) / (N - 1) + s.re[marked] ** 2 + s.im[marked] ** 2;
}

function arcPath(r: number, a0: number, a1: number): string {
  const sweep = a1 > a0 ? 0 : 1;
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M${r * Math.cos(a0)} ${-r * Math.sin(a0)} A${r} ${r} 0 ${large} ${sweep} ${r * Math.cos(a1)} ${-r * Math.sin(a1)}`;
}

function arrow(x: number, y: number): string {
  const len = Math.hypot(x, y);
  if (len < 1e-3) return '';
  const ux = x / len, uy = y / len, hl = Math.min(12, len * 0.4), hw = hl * 0.5;
  const bx = x - ux * hl, by = y - uy * hl;
  return `<line class="vec" x1="0" y1="0" x2="${bx}" y2="${by}"/>` +
    `<polygon class="vechead" points="${x},${y} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}"/>`;
}

/**
 * Grover's signature view: the whole algorithm lives in a 2D plane, and each
 * iteration is two reflections (oracle across |s'>, diffusion across |s>),
 * which together rotate the state by 2 theta.
 */
export function groverPlaneScene(g: GroverGeometry): Scene {
  const sx = Math.cos(g.theta), sy = Math.sin(g.theta);
  return {
    title: 'Geometry · the Grover plane',
    viewBox: '-135 -135 270 270',
    ariaLabel: 'State vector in the plane spanned by the marked state and the unmarked superposition',
    render(svg, ctx: FrameContext) {
      const kind = ctx.step.gate.glyph.symbol;
      let h = `<circle class="unit" r="${R}"/>`;
      h += `<line class="axis" x1="-118" x2="118" y1="0" y2="0"/><line class="axis" y1="-118" y2="118" x1="0" x2="0"/>`;
      h += `<text class="alabel rest" data-link="rest" x="104" y="-7">|s′⟩</text>`;
      h += `<text class="alabel focus" data-link="focus" x="7" y="-110">|w⟩</text>`;
      h += `<line class="sray" x1="0" y1="0" x2="${sx * 124}" y2="${-sy * 124}"/>`;
      h += `<text class="alabel" x="${sx * 112 + 4}" y="${-sy * 112 - 6}">|s⟩</text>`;
      h += `<path class="arc" d="${arcPath(32, 0, g.theta)}"/>`;
      h += `<text class="atext" x="${36 * Math.cos(g.theta / 2) + 3}" y="${-36 * Math.sin(g.theta / 2) + 4}">θ</text>`;

      if ((kind === 'O' || kind === 'D') && !ctx.atEnd) {
        const op = (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, ctx.rawT))).toFixed(3);
        const a = kind === 'O' ? 0 : g.theta, L = 128;
        h += `<line class="mirror" style="opacity:${op}" x1="${-L * Math.cos(a)}" y1="${L * Math.sin(a)}" x2="${L * Math.cos(a)}" y2="${-L * Math.sin(a)}"/>`;
        h += `<text class="mtext" style="opacity:${op}" x="${-L * Math.cos(a) + 2}" y="${L * Math.sin(a) + 14}">MIRROR</text>`;
      }

      const steps = ctx.built.steps, bounds = ctx.timeline.boundaries;
      for (let b = 1; b <= ctx.stepIndex; b++) {
        if (steps[b - 1].gate.glyph.kind === 'measure') continue;
        const P = projectToGroverPlane(bounds[b], g.marked);
        const op = (0.1 + (0.25 * b) / Math.max(1, ctx.stepIndex)).toFixed(2);
        h += `<line class="trail" style="opacity:${op}" x1="0" y1="0" x2="${P.x * R}" y2="${-P.y * R}"/>`;
      }

      const P = projectToGroverPlane(ctx.state, g.marked);
      const X = P.x * R, Y = -P.y * R;
      h += `<line class="comp-focus" x1="${X}" y1="${Y}" x2="${X}" y2="0"/>`;
      h += `<line class="comp-rest" x1="${X}" y1="${Y}" x2="0" y2="${Y}"/>`;
      const phi = Math.atan2(P.y, P.x), len = Math.hypot(P.x, P.y);
      if (len > 0.15) h += `<path class="arc phi" d="${arcPath(56, 0, phi)}"/>`;
      h += arrow(X, Y);
      h += `<circle class="tip" cx="${X}" cy="${Y}" r="3"/>`;
      svg.innerHTML = h;

      return {
        live: len > 0.15 ? `φ = ${fmt((phi * 180) / Math.PI, 1)}°` : 'φ undefined',
        caption: planeWeight(ctx.state, g.marked) < 0.98
          ? `The state’s shadow in this plane has length ${len.toFixed(2)}: part of it lies outside the plane. After the Hadamards it lands exactly on |s⟩ and never leaves.`
          : len < 0.98
          ? `Mid-reflection the state is still in the plane, but its amplitudes are partly imaginary. The arrow shows the real parts, so it shortens to ${len.toFixed(2)} and grows back as the reflection completes.`
          : `Each iteration adds 2θ = ${fmt((2 * g.theta * 180) / Math.PI, 1)}°, so after k iterations φ = (2k+1)θ. The dashed lines are the two components: the marked amplitude and the shared amplitude of the rest.`,
      };
    },
  };
}
