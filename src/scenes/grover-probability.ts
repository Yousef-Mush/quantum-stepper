import { probability } from '../engine';
import type { FrameContext, Scene } from '../core/types';
import type { GroverGeometry } from './grover-plane';

/** P(k) = sin^2((2k+1) theta) with a live dot that follows the simulated state. */
export function groverProbabilityScene(g: GroverGeometry): Scene {
  const W = 360, H = 200, mL = 34, mR = 12, mT = 14, mB = 30;
  const pW = W - mL - mR, pH = H - mT - mB;
  const X = (k: number) => mL + (k / g.kMax) * pW;
  const Y = (p: number) => mT + pH - p * pH;
  const P = (k: number) => Math.sin((2 * k + 1) * g.theta) ** 2;

  // Static layer, built once per configuration.
  let base = '';
  for (const p of [0, 0.5, 1]) {
    base += `<line class="gridl" x1="${mL}" x2="${W - mR}" y1="${Y(p)}" y2="${Y(p)}"/>`;
    base += `<text class="ax" x="${mL - 6}" y="${Y(p) + 3}" text-anchor="end">${p}</text>`;
  }
  for (let k = 0; k <= g.kMax; k++) base += `<text class="ax" x="${X(k)}" y="${H - 12}" text-anchor="middle">${k}</text>`;
  base += `<text class="ax" x="${W - mR}" y="${H - 1}" text-anchor="end">iterations k</text>`;
  let d = '';
  for (let i = 0; i <= 200; i++) {
    const k = (i / 200) * g.kMax;
    d += `${i ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(P(k)).toFixed(1)}`;
  }
  base += `<path class="curve" d="${d}"/>`;
  base += `<line class="stopline" x1="${X(g.iterations)}" x2="${X(g.iterations)}" y1="${mT}" y2="${mT + pH}"/>`;
  base += `<text class="stoptext" x="${X(g.iterations) + 4}" y="${mT + 10}">your stop</text>`;
  for (let k = 0; k <= g.kMax; k++) {
    base += `<circle class="dot ${k === g.kStar ? 'star' : ''}" cx="${X(k)}" cy="${Y(P(k))}" r="${k === g.kStar ? 4.5 : 3}"/>`;
  }

  return {
    title: 'Why √N',
    viewBox: `0 0 ${W} ${H}`,
    ariaLabel: 'Success probability against number of iterations',
    caption: 'Success probability P(k) = sin²((2k+1)θ). The dark dot tracks the live state. Run more iterations than the optimum and watch it fall.',
    render(svg, ctx: FrameContext) {
      let it = 0;
      for (let j = 0; j < ctx.stepIndex; j++) if (ctx.built.steps[j].gate.glyph.symbol === 'D') it++;
      const sym = ctx.step.gate.glyph.symbol;
      if (sym === 'D') it += ctx.t;
      if (sym === 'M') it = g.iterations;
      const pw = probability(ctx.state, g.marked);
      svg.innerHTML = base + `<circle class="livept" cx="${X(it)}" cy="${Y(pw)}" r="5.5"/>`;
    },
  };
}
