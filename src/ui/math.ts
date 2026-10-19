import { bitString } from '../engine';
import type { FrameContext } from '../core/types';
import { fmtC, ket, link, num, v } from './format';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Default "current state" line. If every state sharing a role has the same
 * amplitude (true for Grover after the Hadamards), group them; otherwise fall
 * back to the general sum.
 */
export function defaultStateLine(ctx: FrameContext): string {
  const { state, built } = ctx;
  const N = state.re.length;
  if (ctx.atStart) return `|ψ₀⟩ = ${ket('0'.repeat(built.n))}`;
  const focus: number[] = [], rest: number[] = [];
  for (let x = 0; x < N; x++) (built.role(x) === 'focus' ? focus : rest).push(x);
  const uniform = (xs: number[]) => xs.every(x => near(state.re[x], state.re[xs[0]]) && near(state.im[x], state.im[xs[0]]));
  if (focus.length === 1 && rest.length > 0 && uniform(rest)) {
    const w = focus[0], r = rest[0];
    // Pull a negative real coefficient's sign out front: "a − b Σ" instead of "a + −b Σ".
    const restNeg = Math.abs(state.im[r]) < 5e-4 && state.re[r] < -5e-4;
    const restCoef = restNeg ? fmtC(-state.re[r], 0) : fmtC(state.re[r], state.im[r]);
    return `|ψ⟩ = ${link('focus', `${num(fmtC(state.re[w], state.im[w]))} ${ket(bitString(w, built.n))}`)} ${restNeg ? '−' : '+'} ` +
      `${link('rest', `${num(restCoef)} Σ<sub>${v('x')}≠${v('w')}</sub> ${ket('x')}`)}`;
  }
  return `|ψ⟩ = Σ<sub>${v('x')}</sub> ${v('a')}<sub>${v('x')}</sub>${ket('x')} <span class="note">&nbsp;amplitudes still unequal, see the bars</span>`;
}

export class MathView {
  private last = '';
  constructor(private el: HTMLElement) {}

  render(ctx: FrameContext): void {
    const card = ctx.built.narrate(ctx);
    const total = ctx.built.steps.length;
    const rows = card.rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');
    const stateLine = (ctx.built.stateLine ?? defaultStateLine)(ctx);
    const html =
      `<div><div class="eyebrow">STEP ${ctx.stepIndex + 1} / ${total} · ${ctx.step.gate.name.toUpperCase()}</div><h2>${card.title}</h2></div>` +
      `<p class="eq">${card.equation}</p><dl class="rows">${rows}</dl><p class="note">${card.note}</p>` +
      `<div class="state"><small>Current state</small>${stateLine}</div>`;
    // Only touch the DOM when the text actually changes; keeps hover and selection stable.
    if (html !== this.last) { this.el.innerHTML = html; this.last = html; }
  }

  reset(): void { this.last = ''; }
}
