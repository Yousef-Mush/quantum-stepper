import { describe, expect, it } from 'vitest';
import { deutschJozsa } from '../src/algorithms/deutsch-jozsa';
import { grover } from '../src/algorithms/grover';
import { SHOTS, Timeline } from '../src/core/timeline';
import { bitString, probability } from '../src/engine';
import { measuredOutcome, renderBars } from '../src/ui/bars';
import { elements, num } from './helpers';

/** Draws the amplitude view and reads bar heights, dial angles and labels back out of the SVG. */
function draw(tl: Timeline, p: number) {
  const ctx = tl.frame(p);
  const svg = { innerHTML: '' };
  const out = renderBars(svg as unknown as SVGSVGElement, ctx);
  const html = svg.innerHTML;
  const zero = num(elements(html, 'line', 'zero')[0].y1);
  const grid = elements(html, 'line', 'gridl').map(g => num(g.y1));
  const unit = zero - Math.min(...grid); // pixels for an amplitude (or probability) of 1
  const bars = elements(html, 'rect', 'bar').map(r => {
    const y = num(r.y), h = num(r.height);
    // A bar above the zero line starts at its top; one below hangs from the line.
    return { center: num(r.x) + num(r.width) / 2, value: y < zero - 1e-9 ? (zero - y) / unit : -h / unit, height: h / unit };
  });
  const labels = [...html.matchAll(/<text class="bl[^"]*"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  return { ctx, html, out, zero, unit, bars, labels };
}

const PX = 1; // bars have a minimum drawn height of 0.75px

describe('amplitude bars', () => {
  const tl = new Timeline(grover.build({ n: 3, marked: 5, iterations: 2 }));

  it('each bar is the real part of its amplitude, at boundaries and mid-gate', () => {
    for (const p of [1, 1.5, 2, 2.5, 3, 4.3]) {
      const { ctx, bars, unit } = draw(tl, p);
      expect(bars).toHaveLength(8);
      bars.forEach((b, x) => expect(Math.abs(b.value - ctx.state.re[x])).toBeLessThan(PX / unit));
    }
  });

  it('each phase dial points at the phase of its amplitude, with length proportional to |a|', () => {
    for (const p of [0.5, 1.5, 2.5]) {
      const { ctx, html, bars } = draw(tl, p);
      let maxA = 0;
      for (let x = 0; x < 8; x++) maxA = Math.max(maxA, Math.hypot(ctx.state.re[x], ctx.state.im[x]));
      const rads = elements(html, 'circle', 'phc').map(c => num(c.r));
      for (const d of elements(html, 'line', 'phv')) {
        const x1 = num(d.x1), y1 = num(d.y1), dx = num(d.x2) - x1, dy = -(num(d.y2) - y1);
        const x = bars.findIndex(b => Math.abs(b.center - x1) < 1e-6);
        const a = Math.hypot(ctx.state.re[x], ctx.state.im[x]);
        const turn = Math.atan2(dy, dx) - Math.atan2(ctx.state.im[x], ctx.state.re[x]);
        expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeLessThan(1e-6);
        expect(Math.abs(Math.hypot(dx, dy) - (a / maxA) * rads[x])).toBeLessThan(1e-6);
      }
    }
  });

  it('the dashed mean line is the mean of the real parts', () => {
    const { ctx, html, zero, unit } = draw(tl, 2.5);
    const mean = Array.from(ctx.state.re).reduce((s, v) => s + v, 0) / 8;
    expect(Math.abs((zero - num(elements(html, 'line', 'meanline')[0].y1)) / unit - mean)).toBeLessThan(1e-6);
  });

  it('ghost bars show the amplitudes from before the gate', () => {
    const { ctx, html, zero, unit } = draw(tl, 2.5);
    elements(html, 'rect', 'ghost').forEach((g, x) => {
      const v = ctx.before.re[x], y = num(g.y), h = num(g.height);
      expect(Math.abs((v >= 0 ? (zero - y) : -h) / unit - v)).toBeLessThan(PX / unit);
    });
  });
});

describe('measurement histogram', () => {
  it('Grover: one bar per basis state; the exact outlines are |a|² and all shots are counted', () => {
    const tl = new Timeline(grover.build({ n: 3, marked: 5, iterations: 2 }));
    const { ctx, html, unit, bars, labels } = draw(tl, tl.length);
    expect(labels).toEqual([...Array(8).keys()].map(x => bitString(x, 3)));
    elements(html, 'rect', 'exact').forEach((e, x) => expect(Math.abs(num(e.height) / unit - probability(ctx.state, x))).toBeLessThan(PX / unit));
    const total = bars.reduce((s, b) => s + b.height, 0);
    expect(Math.abs(total - 1)).toBeLessThan((8 * PX) / unit);
    expect(html).toContain(`${SHOTS.toLocaleString('en-US')} / ${SHOTS.toLocaleString('en-US')} shots`);
  });

  it('Deutsch–Jozsa: only the measured inputs get bars; the ancilla is summed over', () => {
    const n = 3;
    const tl = new Timeline(deutschJozsa.build({ n, oracle: 2 })); // balanced · first bit: always reads 100
    const { ctx, html, unit, bars, labels, out } = draw(tl, tl.length);
    expect(labels).toEqual([...Array(8).keys()].map(x => bitString(x, n)));
    const exact = elements(html, 'rect', 'exact').map(e => num(e.height) / unit);
    expect(Math.abs(exact[0b100] - 1)).toBeLessThan(PX / unit);
    expect(Math.abs(bars[0b100].height - 1)).toBeLessThan(PX / unit);
    expect(probability(ctx.state, 0b1000) + probability(ctx.state, 0b1001)).toBeCloseTo(1, 12);
    expect(out.live).toBe('P(000) = 0.000');
  });

  it('measuredOutcome keeps the listed qubits, most significant first', () => {
    expect(measuredOutcome(0b1011, [0, 1, 2], 4)).toBe(0b101);
    expect(measuredOutcome(0b1011, [3], 4)).toBe(1);
    expect(measuredOutcome(0b1011, [2, 0], 4)).toBe(0b11);
  });
});
