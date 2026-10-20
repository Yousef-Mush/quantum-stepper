import { describe, expect, it } from 'vitest';
import { deutschJozsa } from '../src/algorithms/deutsch-jozsa';
import { grover } from '../src/algorithms/grover';
import type { BuiltAlgorithm } from '../src/core/types';
import { COL, MIN_COL, circuitMarkup, layoutCircuit, playheadX } from '../src/ui/circuit';
import { elements, num } from './helpers';

/** Lays the circuit out for a panel `available` px wide and reads gate positions back out of the SVG. */
function draw(built: BuiltAlgorithm, available: number) {
  const L = layoutCircuit(built.n, built.steps.length, available);
  const html = circuitMarkup(built, L);
  const hits = elements(html, 'rect', 'hit').map(r => ({ x: num(r.x), w: num(r.width) }));
  const boxes = elements(html, 'rect', 'box').map(r => num(r.width));
  const wires = elements(html, 'line', 'wire').map(l => num(l.x2));
  return { L, html, hits, boxes, wires };
}

describe('circuit layout', () => {
  const shallow = grover.build({ n: 3, marked: 5, iterations: 2 });
  const deep = grover.build({ n: 5, marked: 3, iterations: 10 });

  it('a shallow circuit fills the panel: wires and the last gate reach the right edge', () => {
    for (const panel of [700, 1200, 1650]) {
      const { L, hits, wires } = draw(shallow, panel);
      expect(L.width).toBe(panel);
      expect(L.col).toBeGreaterThan(COL);
      wires.forEach(x2 => expect(x2).toBeGreaterThan(panel - 10));
      const last = hits[hits.length - 1];
      expect(last.x + last.w).toBeGreaterThan(panel - 25);
    }
  });

  it('columns are evenly spaced and one per step, so the playhead at p = i sits on gate i\'s left edge', () => {
    const { L, hits } = draw(shallow, 1400);
    expect(hits).toHaveLength(shallow.steps.length);
    hits.forEach((h, i) => {
      expect(h.w).toBeCloseTo(L.col, 9);
      expect(h.x).toBeCloseTo(playheadX(L, i), 9);
    });
  });

  it('gate boxes grow with the column but stop at 1.5x, so shallow circuits do not balloon', () => {
    const narrow = draw(shallow, 62 + shallow.steps.length * COL + 20);
    const wide = draw(shallow, 4000);
    expect(narrow.L.boxScale).toBeCloseTo(1, 9);
    expect(wide.L.boxScale).toBe(1.5);
    wide.boxes.forEach((w, i) => expect(w / narrow.boxes[i]).toBeCloseTo(1.5, 9));
    // every box still fits inside its column, with room between neighbours
    wide.boxes.forEach(w => expect(w).toBeLessThan(wide.L.col));
  });

  it('a deep circuit shrinks to the minimum column, then overflows the panel to scroll', () => {
    expect(deep.steps.length).toBeGreaterThan(20);
    const { L, boxes } = draw(deep, 600);
    expect(L.col).toBe(MIN_COL);
    expect(L.width).toBeGreaterThan(600);
    boxes.forEach(w => expect(w).toBeLessThan(MIN_COL));
  });

  it('depth changes the column width, not the drawing width, while the circuit fits', () => {
    const a = draw(grover.build({ n: 3, marked: 5, iterations: 1 }), 1600);
    const b = draw(grover.build({ n: 3, marked: 5, iterations: 4 }), 1600);
    expect(a.L.width).toBe(1600);
    expect(b.L.width).toBe(1600);
    expect(a.L.col).toBeGreaterThan(b.L.col);
  });

  it('iteration brackets span exactly their steps\' columns', () => {
    const { L, html } = draw(shallow, 1300);
    const braces = elements(html, 'path', 'kbrace');
    expect(braces).toHaveLength(shallow.brackets.length);
    shallow.brackets.forEach((b, k) => {
      const [, xa, xb] = braces[k].d.match(/^M([\d.]+) 22 V17 H([\d.]+)/)!.map(Number);
      expect(xa).toBeCloseTo(playheadX(L, b.from) + 6, 9);
      expect(xb).toBeCloseTo(playheadX(L, b.to + 1) - 6, 9);
    });
  });

  it('works for Deutsch–Jozsa too, and without a measured width falls back to the natural column', () => {
    const dj = deutschJozsa.build(deutschJozsa.normalize({ ...deutschJozsa.defaults }));
    expect(draw(dj, 1000).L.width).toBe(1000);
    expect(layoutCircuit(dj.n, dj.steps.length).col).toBe(COL);
  });
});
