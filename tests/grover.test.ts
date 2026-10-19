import { describe, expect, it } from 'vitest';
import { grover, groverOptimal, groverSuccess, type GroverParams } from '../src/algorithms/grover';
import { Timeline } from '../src/core/timeline';
import { probability } from '../src/engine';

describe("Grover's algorithm", () => {
  it.each([2, 3, 4, 5])('n=%i: P(marked) after k iterations is sin²((2k+1)θ)', n => {
    const kMax = 2 * groverOptimal(n) + 2;
    const marked = (1 << n) - 2;
    const tl = new Timeline(grover.build({ n, marked, iterations: kMax }));
    // boundaries: [|0>, after H, after O1, after D1, ...]
    for (let k = 0; k <= kMax; k++) {
      expect(probability(tl.boundaries[1 + 2 * k], marked)).toBeCloseTo(groverSuccess(n, k), 10);
    }
  });

  it('optimal iteration counts match floor(pi/4 * sqrt(N)) for these sizes', () => {
    expect([2, 3, 4, 5].map(groverOptimal)).toEqual([1, 2, 3, 4]);
  });

  it('n=2 with one iteration finds the marked state with certainty', () => {
    const tl = new Timeline(grover.build({ n: 2, marked: 3, iterations: 1 }));
    expect(probability(tl.final, 3)).toBeCloseTo(1, 12);
  });

  it('builds H, then (O, D) per iteration, then a measurement', () => {
    const b = grover.build({ n: 3, marked: 5, iterations: 2 });
    expect(b.steps.map(s => s.gate.glyph.symbol)).toEqual(['H', 'O', 'D', 'O', 'D', 'M']);
    expect(b.brackets).toHaveLength(2);
    expect(b.brackets[1].emphasis).toBe(true);
  });

  it('normalize clamps the marked state and resets iterations when n changes', () => {
    const p: GroverParams = { n: 2, marked: 30, iterations: 9 };
    expect(grover.normalize(p, 'n')).toEqual({ n: 2, marked: 3, iterations: 1 });
    expect(grover.normalize({ n: 3, marked: 1, iterations: 40 }, 'iterations').iterations).toBe(6);
  });

  it('every frame produces a narration card', () => {
    const b = grover.build({ n: 3, marked: 5, iterations: 2 });
    const tl = new Timeline(b);
    for (let p = 0; p <= tl.length; p += 0.25) {
      const card = b.narrate(tl.frame(p));
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.equation.length).toBeGreaterThan(0);
    }
  });
});
