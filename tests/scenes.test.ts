import { describe, expect, it } from 'vitest';
import { DJ_ORACLES, deutschJozsa, djTruthTable } from '../src/algorithms/deutsch-jozsa';
import { grover, groverTheta } from '../src/algorithms/grover';
import { Timeline } from '../src/core/timeline';
import { inputAmplitudes } from '../src/scenes/dj-phasors';
import { elements, num, parseC, renderScene } from './helpers';

/**
 * These tests draw each signature scene and read the picture back: where the
 * arrow tips and dots land, which mirror is shown, what the readout says. Each
 * is checked against the mathematics, not against the drawing code.
 */

const R = 100; // radius of the unit circle in every scene
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('Grover plane', () => {
  const n = 3, marked = 5, iterations = 3;
  const b = grover.build({ n, marked, iterations });
  const tl = new Timeline(b);
  const plane = b.scenes[0];
  const theta = groverTheta(n);
  /** Arrow tip in maths coordinates (y up, unit circle = 1). */
  const tip = (p: number) => {
    const [c] = elements(renderScene(plane, tl.frame(p)).html, 'circle', 'tip');
    return { x: num(c.cx) / R, y: -num(c.cy) / R };
  };

  it('after the Hadamards and after each iteration k the arrow is at angle (2k+1)θ on the unit circle', () => {
    for (let k = 0; k <= iterations; k++) {
      const { x, y } = tip(1 + 2 * k);
      near(x, Math.cos((2 * k + 1) * theta));
      near(y, Math.sin((2 * k + 1) * theta));
    }
  });

  it('after each oracle the arrow is the mirror image across |s′⟩, at angle −(2k+1)θ', () => {
    for (let k = 0; k < iterations; k++) {
      const { x, y } = tip(2 + 2 * k);
      near(x, Math.cos((2 * k + 1) * theta));
      near(y, -Math.sin((2 * k + 1) * theta));
    }
  });

  it('during the oracle the tip moves straight down: x fixed, y scaled by cos(πt)', () => {
    const start = tip(1);
    for (const p of [1.2, 1.5, 1.8]) {
      const ctx = tl.frame(p), now = tip(p);
      near(now.x, start.x);
      near(now.y, start.y * Math.cos(Math.PI * ctx.t));
    }
  });

  it('during the diffusion the tip moves straight across the |s⟩ mirror: the part along |s⟩ is fixed', () => {
    const s = { x: Math.cos(theta), y: Math.sin(theta) }, perp = { x: -s.y, y: s.x };
    const dot = (a: { x: number; y: number }, u: { x: number; y: number }) => a.x * u.x + a.y * u.y;
    const start = tip(2);
    for (const p of [2.2, 2.5, 2.8]) {
      const ctx = tl.frame(p), now = tip(p);
      near(dot(now, s), dot(start, s));
      near(dot(now, perp), dot(start, perp) * Math.cos(Math.PI * ctx.t));
    }
  });

  it('shows the |s′⟩ mirror during an oracle, the |s⟩ mirror during a diffusion, and none otherwise', () => {
    const mirror = (p: number) => elements(renderScene(plane, tl.frame(p)).html, 'line', 'mirror');
    expect(mirror(0.5)).toHaveLength(0);
    const [o] = mirror(1.5);
    near(num(o.y1), 0); near(num(o.y2), 0);
    const [d] = mirror(2.5);
    near(-(num(d.y2) - num(d.y1)) / (num(d.x2) - num(d.x1)), Math.tan(theta));
    expect(mirror(tl.length - 0.5)).toHaveLength(0); // measurement
  });

  it('the φ readout is the arrow angle', () => {
    for (const p of [1, 2.5, 3, 5]) {
      const { x, y } = tip(p);
      const { out } = renderScene(plane, tl.frame(p));
      expect(out.live).toBe(`φ = ${((Math.atan2(y, x) * 180) / Math.PI).toFixed(1).replace('-', '−')}°`);
    }
  });

  it('the caption only says "outside the plane" when the state really is', () => {
    const caption = (p: number) => renderScene(plane, tl.frame(p)).out.caption!;
    expect(caption(0)).toContain('outside the plane'); // |000> before the Hadamards
    expect(caption(0.5)).toContain('outside the plane'); // mid-H
    for (const p of [1.5, 2.5, 3.5]) { // mid-reflection: in the plane, amplitudes partly imaginary
      expect(caption(p)).not.toContain('outside');
      expect(caption(p)).toContain('still in the plane');
    }
    expect(caption(3)).toContain('Each iteration adds 2θ');
  });
});

describe('Grover P(k) chart', () => {
  const n = 4, marked = 9, iterations = 5;
  const b = grover.build({ n, marked, iterations });
  const tl = new Timeline(b);
  const chart = b.scenes[1];
  const draw = (p: number) => {
    const { html } = renderScene(chart, tl.frame(p));
    return { live: elements(html, 'circle', 'livept')[0], dots: elements(html, 'circle', 'dot') };
  };

  it('after k iterations the live dot sits exactly on the curve point for k', () => {
    for (let k = 0; k <= iterations; k++) {
      const { live, dots } = draw(1 + 2 * k);
      near(num(live.cx), num(dots[k].cx));
      near(num(live.cy), num(dots[k].cy));
    }
  });

  it('the dot stays put during an oracle, which leaves probabilities alone and is half an iteration', () => {
    const { live: start } = draw(3);
    for (const p of [3.25, 3.5, 3.75]) {
      const { live } = draw(p);
      near(num(live.cx), num(start.cx));
      near(num(live.cy), num(start.cy));
    }
  });

  it('the dot moves from k to k+1 during the diffusion that completes iteration k+1', () => {
    const { dots } = draw(4);
    let last = num(dots[1].cx);
    for (const p of [4.25, 4.5, 4.75]) {
      const x = num(draw(p).live.cx);
      expect(x).toBeGreaterThan(last);
      expect(x).toBeLessThan(num(dots[2].cx));
      last = x;
    }
  });

  it('at measurement the dot sits on the chosen stop', () => {
    const { live, dots } = draw(tl.length - 0.5);
    near(num(live.cx), num(dots[iterations].cx));
    near(num(live.cy), num(dots[iterations].cy));
  });
});

describe('Deutsch–Jozsa phasors', () => {
  const cases = [2, 3].flatMap(n => DJ_ORACLES.map((_, oracle) => ({ n, oracle })));
  const ORACLE = 2, FINAL_H = 3;

  it.each(cases)('n=$n oracle=$oracle: the readout and the pink resultant are the live amplitude', ({ n, oracle }) => {
    const b = deutschJozsa.build({ n, oracle });
    const tl = new Timeline(b);
    const scene = b.scenes[0];
    const N = 1 << n, f = djTruthTable(n, oracle);
    let zoom: number | null = null;
    for (let p = ORACLE; p <= tl.length; p += 0.1) {
      const ctx = tl.frame(p);
      const { html, out } = renderScene(scene, ctx);
      let expected: { re: number; im: number };
      if (ctx.stepIndex === ORACLE) {
        // Preview of what the final Hadamards will give: (1/N) Σ_x e^{iπ f(x) t}.
        expected = { re: 0, im: 0 };
        for (const fx of f) { expected.re += Math.cos(Math.PI * fx * ctx.t) / N; expected.im += Math.sin(Math.PI * fx * ctx.t) / N; }
        expect(out.live!.startsWith('preview ')).toBe(true);
      } else {
        expected = inputAmplitudes(ctx.state)[0];
      }
      const printed = parseC(out.live!.split('= ')[1]);
      near(printed.re, expected.re, 5e-4 + 1e-9);
      near(printed.im, expected.im, 5e-4 + 1e-9);

      const [t] = elements(html, 'circle', 'tip');
      const tx = num(t.cx) / R, ty = -num(t.cy) / R;
      if (ctx.stepIndex === ORACLE) {
        near(tx, expected.re); near(ty, expected.im); // unzoomed through the oracle
      } else if (Math.hypot(expected.re, expected.im) > 1e-6) {
        // Zoomed from the final Hadamards on, but by one fixed factor, so the motion is still exactly H^t.
        const k = Math.hypot(tx, ty) / Math.hypot(expected.re, expected.im);
        zoom ??= k;
        near(k, zoom);
        near(tx, expected.re * zoom); near(ty, expected.im * zoom);
      }
    }
  });

  it.each(cases)('n=$n oracle=$oracle: one arrow per input, amber exactly where f(x) = 1', ({ n, oracle }) => {
    const b = deutschJozsa.build({ n, oracle });
    const tl = new Timeline(b);
    const f = djTruthTable(n, oracle);
    const { html } = renderScene(b.scenes[0], tl.frame(FINAL_H - 0.001)); // end of the oracle
    const ones = f.reduce((s, v) => s + v, 0);
    expect(elements(html, 'g', 'kick')).toHaveLength(ones);
    expect(elements(html, 'g', 'keep')).toHaveLength(f.length - ones);
  });

  it('before the oracle the scene waits and draws no arrows', () => {
    const b = deutschJozsa.build({ n: 3, oracle: 2 });
    const { html, out } = renderScene(b.scenes[0], new Timeline(b).frame(1.5));
    expect(elements(html, 'g', 'ph')).toHaveLength(0);
    expect(out.caption).toContain('Waiting');
  });
});
