import { bitString, histogram, probability } from '../engine';
import type { FrameContext } from '../core/types';

const W = 640, H = 320, ML = 42, MR = 14;

export interface BarsOutput { title: string; live: string; showPhaseLegend: boolean }

/**
 * Index of basis state x among the outcomes of measuring only `qubits`
 * (qubit q is bit n-1-q of x; the first listed qubit is the most significant).
 */
export function measuredOutcome(x: number, qubits: number[], n: number): number {
  let k = 0;
  for (const q of qubits) k = (k << 1) | ((x >> (n - 1 - q)) & 1);
  return k;
}

/**
 * Amplitude view. Before measurement: signed real parts as bars, complex phase
 * as dials, the mean as a dashed line, and the pre-gate amplitudes as ghosts.
 * During measurement: sampled frequencies against exact |a|^2 outlines.
 */
export function renderBars(svg: SVGSVGElement, ctx: FrameContext): BarsOutput {
  const { built, state } = ctx;
  const measuring = ctx.shots !== null;
  // While measuring, one bar per outcome of the measured qubits; unmeasured qubits are summed over.
  const qubits = measuring ? ctx.step.gate.glyph.qubits : [...Array(built.n).keys()];
  const n = qubits.length, N = 1 << n;
  const outcome = (x: number) => measuredOutcome(x, qubits, built.n);
  const members: number[][] = Array.from({ length: N }, () => []);
  for (let x = 0; x < state.re.length; x++) members[outcome(x)].push(x);
  const showPh = !measuring && N <= 16;
  const top = showPh ? 58 : 20, bottom = N > 16 ? 56 : 34;
  const pH = H - top - bottom, pW = W - ML - MR, slot = pW / N, bw = Math.min(slot * 0.62, 46);
  const cx = (x: number) => ML + (x + 0.5) * slot;
  const role = (k: number) => built.role(members[k][0]);
  const prob = (k: number) => members[k].reduce((sum, x) => sum + probability(state, x), 0);
  let h = '';

  if (!measuring) {
    const y = (val: number) => top + pH / 2 - val * (pH / 2);
    for (const g of [-1, -0.5, 0, 0.5, 1]) {
      h += `<line class="${g === 0 ? 'zero' : 'gridl'}" x1="${ML}" x2="${W - MR}" y1="${y(g)}" y2="${y(g)}"/>`;
      h += `<text class="ax" x="${ML - 6}" y="${y(g) + 3}" text-anchor="end">${g === 0 ? '0' : (g < 0 ? '−' : '') + Math.abs(g).toFixed(1)}</text>`;
    }
    const sym = ctx.step.gate.glyph.kind;
    const showGhost = sym === 'block' && ctx.rawT > 0 && !ctx.atEnd;
    let maxA = 0;
    for (let x = 0; x < N; x++) maxA = Math.max(maxA, Math.hypot(state.re[x], state.im[x]));
    for (let x = 0; x < N; x++) {
      const val = state.re[x], r = role(x);
      if (showGhost) {
        const pv = ctx.before.re[x];
        h += `<rect class="ghost" x="${cx(x) - bw / 2}" y="${y(Math.max(pv, 0))}" width="${bw}" height="${Math.max(0.5, y(Math.min(pv, 0)) - y(Math.max(pv, 0)))}"/>`;
      }
      const y0 = y(Math.max(val, 0)), y1 = y(Math.min(val, 0));
      h += `<rect class="bar ${r}" data-link="${r}" x="${cx(x) - bw / 2}" y="${y0}" width="${bw}" height="${Math.max(0.75, y1 - y0)}" rx="1.5"/>`;
      if (showPh) {
        const rad = Math.min(slot * 0.3, 13), cy = 28;
        const a = Math.hypot(state.re[x], state.im[x]), ang = Math.atan2(state.im[x], state.re[x]);
        const L = maxA > 0 ? (a / maxA) * rad : 0;
        h += `<circle class="phc" cx="${cx(x)}" cy="${cy}" r="${rad}"/>`;
        if (L > 0.4) h += `<line class="phv ${r}" x1="${cx(x)}" y1="${cy}" x2="${cx(x) + L * Math.cos(ang)}" y2="${cy - L * Math.sin(ang)}"/>`;
      }
    }
    if (!ctx.atStart && built.showMean !== false) {
      let mean = 0;
      for (let x = 0; x < N; x++) mean += state.re[x];
      mean /= N;
      const op = ctx.step.gate.glyph.symbol === 'D' && !ctx.atEnd ? 1 : 0.45;
      h += `<line class="meanline" style="opacity:${op}" x1="${ML}" x2="${W - MR}" y1="${y(mean)}" y2="${y(mean)}"/>`;
      h += `<text class="meantext" style="opacity:${op}" x="${W - MR - 4}" y="${y(mean) - 6}" text-anchor="end">mean ā</text>`;
    }
  } else {
    const y = (val: number) => top + pH - val * pH;
    for (const g of [0, 0.25, 0.5, 0.75, 1]) {
      h += `<line class="${g === 0 ? 'zero' : 'gridl'}" x1="${ML}" x2="${W - MR}" y1="${y(g)}" y2="${y(g)}"/>`;
      h += `<text class="ax" x="${ML - 6}" y="${y(g) + 3}" text-anchor="end">${g}</text>`;
    }
    const { shown, total, outcomes } = ctx.shots!;
    const counts = histogram(outcomes, shown, state.re.length);
    for (let x = 0; x < N; x++) {
      const hits = members[x].reduce((sum, i) => sum + counts[i], 0);
      const r = role(x), p = prob(x), f = shown ? hits / shown : 0;
      h += `<rect class="bar ${r}" data-link="${r}" x="${cx(x) - bw / 2}" y="${y(f)}" width="${bw}" height="${Math.max(0.75, y(0) - y(f))}" rx="1.5"/>`;
      h += `<rect class="exact" x="${cx(x) - bw / 2 - 3}" y="${y(p)}" width="${bw + 6}" height="${Math.max(0.5, y(0) - y(p))}"/>`;
    }
    h += `<text class="shots" x="${W - MR}" y="${top + 4}" text-anchor="end">${shown.toLocaleString('en-US')} / ${total.toLocaleString('en-US')} shots</text>`;
  }

  for (let x = 0; x < N; x++) {
    const cls = role(x) === 'focus' ? 'bl focus' : 'bl';
    if (N > 16) h += `<text class="${cls}" transform="translate(${cx(x) + 3} ${H - bottom + 8}) rotate(-90)" text-anchor="end">${bitString(x, n)}</text>`;
    else h += `<text class="${cls}" x="${cx(x)}" y="${H - bottom + 18}" text-anchor="middle">${bitString(x, n)}</text>`;
  }
  svg.innerHTML = h;

  const focus = [...Array(N).keys()].filter(x => role(x) === 'focus');
  const live = focus.length === 1 ? `P(${bitString(focus[0], n)}) = ${prob(focus[0]).toFixed(3)}` : '';
  return {
    title: measuring ? 'Measurement · sampled frequency vs exact |a|²' : 'Amplitudes · real part, with phase dials',
    live,
    showPhaseLegend: showPh,
  };
}
