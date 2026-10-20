import { describe, expect, it } from 'vitest';
import { DJ_ORACLES, deutschJozsa, djTruthTable } from '../src/algorithms/deutsch-jozsa';
import { Timeline } from '../src/core/timeline';
import { probability } from '../src/engine';
import { inputAmplitudes, phasorTerms } from '../src/scenes/dj-phasors';

const allCases = [1, 2, 3, 4].flatMap(n => DJ_ORACLES.map((_, oracle) => [n, oracle] as const));
/** P(input register = 0...0), summed over the ancilla. */
const pZero = (tl: Timeline) => probability(tl.final, 0) + probability(tl.final, 1);

describe('Deutsch–Jozsa', () => {
  it.each(allCases)('n=%i oracle=%i is constant or balanced as labelled', (n, oracle) => {
    const ones = djTruthTable(n, oracle).reduce((s, b) => s + b, 0);
    if (DJ_ORACLES[oracle].kind === 'constant') expect([0, 1 << n]).toContain(ones);
    else expect(ones).toBe(1 << (n - 1));
  });

  it.each(allCases)('n=%i oracle=%i: one query decides with certainty', (n, oracle) => {
    const tl = new Timeline(deutschJozsa.build({ n, oracle }));
    expect(pZero(tl)).toBeCloseTo(DJ_ORACLES[oracle].kind === 'constant' ? 1 : 0, 12);
  });

  it('the ancilla stays in |−⟩ through the oracle, so the oracle only changes signs', () => {
    const n = 3, f = djTruthTable(n, 4);
    const tl = new Timeline(deutschJozsa.build({ n, oracle: 4 }));
    const a = inputAmplitudes(tl.boundaries[3]); // after the oracle
    a.forEach((ax, x) => {
      expect(ax.re).toBeCloseTo((f[x] ? -1 : 1) / Math.sqrt(8), 12);
      expect(ax.im).toBeCloseTo(0, 12);
    });
    let norm = 0;
    for (const ax of a) norm += ax.re ** 2 + ax.im ** 2;
    expect(norm).toBeCloseTo(1, 12); // nothing left in |x>|+>
  });

  it('mid-oracle, inputs with f(x) = 1 have turned by π t (phase kickback)', () => {
    const b = deutschJozsa.build({ n: 2, oracle: 2 });
    const tl = new Timeline(b);
    const a = inputAmplitudes(b.steps[2].gate.apply(tl.boundaries[2], 0.5));
    expect(a[0].re).toBeCloseTo(0.5, 12);
    expect(a[2].re).toBeCloseTo(0, 12); // e^{i pi/2} / 2
    expect(a[2].im).toBeCloseTo(0.5, 12);
  });

  it.each(allCases)('n=%i oracle=%i: phasor terms sum to the live |0…0⟩ amplitude at every t', (n, oracle) => {
    const b = deutschJozsa.build({ n, oracle });
    const tl = new Timeline(b);
    const before = tl.boundaries[3];
    for (const t of [0, 0.25, 0.5, 0.8, 1]) {
      const terms = phasorTerms(inputAmplitudes(before), n, t);
      const sum = terms.reduce((s, p) => ({ re: s.re + p.re, im: s.im + p.im }), { re: 0, im: 0 });
      const live = inputAmplitudes(b.steps[3].gate.apply(before, t))[0];
      expect(sum.re).toBeCloseTo(live.re, 12);
      expect(sum.im).toBeCloseTo(live.im, 12);
    }
  });

  it('at the end of the final Hadamards every term is ±1/N with sign (−1)^f(x)', () => {
    const n = 3, f = djTruthTable(n, 3);
    const tl = new Timeline(deutschJozsa.build({ n, oracle: 3 }));
    phasorTerms(inputAmplitudes(tl.boundaries[3]), n, 1).forEach((p, x) => {
      expect(p.re).toBeCloseTo((f[x] ? -1 : 1) / 8, 12);
      expect(p.im).toBeCloseTo(0, 12);
    });
  });

  it('builds X, H, U_f, H on the inputs, then measures the inputs', () => {
    const b = deutschJozsa.build({ n: 3, oracle: 0 });
    expect(b.n).toBe(4);
    expect(b.steps.map(s => s.gate.glyph.symbol)).toEqual(['X', 'H', 'Uf', 'H', 'M']);
    expect(b.steps[0].gate.glyph.qubits).toEqual([3]);
    expect(b.steps[3].gate.glyph.qubits).toEqual([0, 1, 2]);
    expect(b.steps[4].gate.glyph.qubits).toEqual([0, 1, 2]);
  });

  it('normalize clamps n and the oracle', () => {
    expect(deutschJozsa.normalize({ n: 9, oracle: 40 })).toEqual({ n: 4, oracle: DJ_ORACLES.length - 1 });
  });

  it.each(DJ_ORACLES.map((_, i) => i))('oracle=%i: every frame produces a narration card and a state line', oracle => {
    const b = deutschJozsa.build({ n: 2, oracle });
    const tl = new Timeline(b);
    for (let p = 0; p <= tl.length; p += 0.25) {
      const ctx = tl.frame(p);
      const card = b.narrate(ctx);
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.equation.length).toBeGreaterThan(0);
      expect(b.stateLine!(ctx).length).toBeGreaterThan(0);
    }
  });
});
