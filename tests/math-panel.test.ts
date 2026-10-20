import { describe, expect, it } from 'vitest';
import { DJ_ORACLES, deutschJozsa, djTruthTable } from '../src/algorithms/deutsch-jozsa';
import { grover, groverSuccess } from '../src/algorithms/grover';
import { Timeline } from '../src/core/timeline';
import type { FrameContext } from '../src/core/types';
import { probability, type C } from '../src/engine';
import { inputAmplitudes } from '../src/scenes/dj-phasors';
import { defaultStateLine } from '../src/ui/math';
import { parseC, text } from './helpers';

/**
 * The math notebook promises live numbers linked to the visuals. These tests
 * read the numbers back out of each card and compare them to the simulated
 * state, or to a closed form computed independently of the app.
 */

const TOL = 5e-4 + 1e-9; // the panel prints 3 decimals, so it can be off by half the last digit
const frames = (tl: Timeline, step = 0.05) => {
  const out: FrameContext[] = [];
  for (let p = 0; p <= tl.length + 1e-9; p += step) out.push(tl.frame(p));
  return out;
};
const expectC = (printed: string, expected: C) => {
  const got = parseC(printed);
  expect(Math.abs(got.re - expected.re)).toBeLessThan(TOL);
  expect(Math.abs(got.im - expected.im)).toBeLessThan(TOL);
};
const amp = (s: { re: Float64Array; im: Float64Array }, x: number): C => ({ re: s.re[x], im: s.im[x] });
/** Splits "a → b" rows on the arrow span. */
const arrowParts = (html: string) => html.split('<span class="arrow">→</span>');
/** The number after the last "=" in a row like "2·0.265 − (−0.354) = 0.884". */
const afterEquals = (html: string) => text(html).split('=').pop()!.trim();
const isLinked = (html: string, role: 'focus' | 'rest') => html.includes(`data-link="${role}"`);

describe("math notebook · Grover", () => {
  const cases = [
    { n: 2, marked: 3, iterations: 1 },
    { n: 3, marked: 5, iterations: 2 },
    { n: 4, marked: 0, iterations: 5 },
  ];

  it.each(cases)('n=$n marked=$marked: every printed number matches the live state', ({ n, marked, iterations }) => {
    const b = grover.build({ n, marked, iterations });
    const tl = new Timeline(b);
    const N = 1 << n, rep = marked === 0 ? 1 : 0;
    for (const ctx of frames(tl)) {
      const card = b.narrate(ctx);
      const sym = ctx.step.gate.glyph.symbol;
      if (sym === 'H') {
        expectC(card.rows[1][1], amp(ctx.state, marked));
        expect(isLinked(card.rows[1][1], 'focus')).toBe(true);
      } else if (sym === 'O') {
        const [was, will] = arrowParts(card.rows[0][1]);
        expectC(was, amp(ctx.before, marked));
        expectC(will, { re: -ctx.before.re[marked], im: -ctx.before.im[marked] }); // O flips the marked sign
        expectC(card.rows[1][1], amp(ctx.state, marked));
        expect(text(card.rows[2][1])).toContain(`${(ctx.t * 180).toFixed(0)}° of 180°`);
      } else if (sym === 'D') {
        let mean = 0;
        for (let x = 0; x < N; x++) mean += ctx.before.re[x];
        mean /= N;
        expectC(afterEquals(card.rows[0][1]), { re: mean, im: 0 });
        // Inversion about the mean, checked against the state the bars will show at the end of the step.
        expectC(afterEquals(card.rows[1][1]), { re: 2 * mean - ctx.before.re[marked], im: 0 });
        expectC(afterEquals(card.rows[1][1]), amp(ctx.after, marked));
        expectC(afterEquals(card.rows[2][1]), amp(ctx.after, rep));
        expect(isLinked(card.rows[1][1], 'focus') && isLinked(card.rows[2][1], 'rest')).toBe(true);
      } else {
        const exact = groverSuccess(n, iterations);
        expectC(afterEquals(card.equation), { re: exact, im: 0 });
        expectC(card.rows[2][1], { re: probability(ctx.state, marked), im: 0 });
      }
    }
  });

  it('the state line prints the marked and shared amplitudes of the live state', () => {
    const b = grover.build({ n: 3, marked: 5, iterations: 3 });
    const tl = new Timeline(b);
    for (let i = 1; i < tl.boundaries.length - 1; i++) {
      const ctx = tl.frame(i);
      const line = defaultStateLine(ctx);
      const nums = [...line.matchAll(/<span class="num">([^<]*)<\/span>/g)].map(m => m[1]);
      expect(nums).toHaveLength(2);
      expectC(nums[0], amp(ctx.state, 5));
      // "a |w> − b Σ" pulls the rest's sign out front.
      const sign = text(line).split('|101⟩')[1].trim().startsWith('-') ? -1 : 1;
      expectC(nums[1], { re: sign * ctx.state.re[0], im: sign * ctx.state.im[0] });
    }
  });
});

describe('math notebook · Deutsch–Jozsa', () => {
  const cases = [1, 3].flatMap(n => DJ_ORACLES.map((_, oracle) => ({ n, oracle })));

  it.each(cases)('n=$n oracle=$oracle: every printed number matches the live state or its closed form', ({ n, oracle }) => {
    const b = deutschJozsa.build({ n, oracle });
    const tl = new Timeline(b);
    const N = 1 << n, f = djTruthTable(n, oracle);
    const ones = f.reduce((s, v) => s + v, 0);
    for (const ctx of frames(tl)) {
      const card = b.narrate(ctx);
      const t = ctx.t;
      switch (ctx.stepIndex) {
        case 0: {
          // X^t = P+ + e^{iπt} P−, so |0> goes to e^{iπt/2}(cos(πt/2)|0> − i sin(πt/2)|1>).
          const h = (Math.PI * t) / 2;
          expectC(card.rows[0][1], { re: Math.cos(h) * Math.cos(h), im: Math.sin(h) * Math.cos(h) });
          expectC(card.rows[1][1], { re: Math.sin(h) * Math.sin(h), im: -Math.cos(h) * Math.sin(h) });
          break;
        }
        case 1:
          expectC(card.rows[1][1], inputAmplitudes(ctx.state)[0]);
          break;
        case 2: {
          // Preview of <0|H^n|psi>: (1/N) Σ_x e^{iπ f(x) t}.
          let re = 0, im = 0;
          for (const fx of f) { re += Math.cos(Math.PI * fx * t) / N; im += Math.sin(Math.PI * fx * t) / N; }
          expectC(card.rows[3][1], { re, im });
          expect(text(card.rows[1][1])).toBe(`${ones} of ${N} inputs`);
          break;
        }
        case 3: {
          const live = inputAmplitudes(ctx.state)[0];
          expectC(card.rows[1][1], live);
          expectC(card.rows[2][1], { re: probability(ctx.state, 0) + probability(ctx.state, 1), im: 0 });
          expectC(arrowParts(card.rows[0][1])[1], { re: (N - 2 * ones) / N, im: 0 });
          break;
        }
        default: {
          const constant = DJ_ORACLES[oracle].kind === 'constant';
          expectC(afterEquals(card.equation), { re: constant ? 1 : 0, im: 0 });
          expect(text(card.rows[2][1])).toContain(constant ? 'constant' : 'balanced');
        }
      }
    }
  });
});
