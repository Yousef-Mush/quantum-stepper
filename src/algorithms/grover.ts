import {
  MATRICES, bitString, dimension, layer, markOracle, measurement, probability, reflectAbout, uniformState,
} from '../engine';
import type { AlgorithmDefinition, Bracket, FrameContext, MathCard, Step } from '../core/types';
import { groverPlaneScene, type GroverGeometry } from '../scenes/grover-plane';
import { groverProbabilityScene } from '../scenes/grover-probability';
import { deg, fmt, fmtC, ket, link, v } from '../ui/format';

export interface GroverParams extends Record<string, number> {
  n: number;
  marked: number;
  iterations: number;
}

export const groverTheta = (n: number): number => Math.asin(1 / Math.sqrt(dimension(n)));
/** Optimal number of iterations: floor(pi / (4 theta)). */
export const groverOptimal = (n: number): number => Math.floor(Math.PI / (4 * groverTheta(n)));
/** Theoretical success probability after k iterations. */
export const groverSuccess = (n: number, k: number): number => Math.sin((2 * k + 1) * groverTheta(n)) ** 2;

export const grover: AlgorithmDefinition<GroverParams> = {
  id: 'grover',
  title: 'Grover’s search',
  headline: 'one gate at a time',
  intro:
    `Grover’s algorithm finds one marked item among ${v('N')} in about √${v('N')} steps. ` +
    'Each iteration is two reflections, and two reflections make a rotation. Step through it and watch the circuit, geometry, amplitudes and math move together.',

  params: [
    { key: 'n', label: 'Qubits', options: () => [2, 3, 4, 5].map(n => ({ value: n, label: `${n} · N=${dimension(n)}` })) },
    {
      key: 'marked', label: 'Marked state',
      options: p => Array.from({ length: dimension(p.n) }, (_, x) => ({ value: x, label: `|${bitString(x, p.n)}⟩` })),
    },
    {
      key: 'iterations', label: 'Iterations',
      options: p => {
        const k = groverOptimal(p.n);
        return Array.from({ length: 2 * k + 3 }, (_, i) => ({ value: i, label: i === k ? `${i} (optimal)` : String(i) }));
      },
    },
  ],
  defaults: { n: 3, marked: 5, iterations: 2 },

  normalize(p, changed) {
    const n = Math.max(2, Math.min(5, p.n));
    const k = groverOptimal(n);
    return {
      n,
      marked: Math.min(p.marked, dimension(n) - 1),
      iterations: changed === 'n' ? k : Math.min(p.iterations, 2 * k + 2),
    };
  },

  build({ n, marked, iterations }) {
    const N = dimension(n);
    const theta = groverTheta(n);
    const kStar = groverOptimal(n);
    const geo: GroverGeometry = { N, marked, theta, kStar, kMax: 2 * kStar + 2, iterations };
    const rep = marked === 0 ? 1 : 0; // a representative unmarked index
    const wb = bitString(marked, n);

    const steps: Step[] = [{ gate: layer('Hadamard', 'H', MATRICES.H, n) }];
    const brackets: Bracket[] = [];
    for (let i = 1; i <= iterations; i++) {
      steps.push({ gate: markOracle(n, [marked]) });
      steps.push({ gate: reflectAbout('Diffusion', 'D', uniformState(n)) });
      brackets.push({ from: steps.length - 2, to: steps.length - 1, label: i === kStar ? `k=${i} · optimal` : `k=${i}`, emphasis: i === kStar });
    }
    steps.push({ gate: measurement(n) });

    const iterationOf = (stepIndex: number) => Math.ceil(stepIndex / 2);

    function narrate(ctx: FrameContext): MathCard {
      const { before, after, state } = ctx;
      const aw = (s: typeof state) => fmtC(s.re[marked], s.im[marked]);
      const ar = (s: typeof state) => fmtC(s.re[rep], s.im[rep]);
      const awV = link('focus', `${v('a')}<sub>${v('w')}</sub>`);
      const arV = link('rest', `${v('a')}<sub>${v('r')}</sub>`);
      const progress = ctx.atEnd ? 'done' : ctx.rawT > 0 ? `t = ${ctx.t.toFixed(2)}` : 'ready';
      const sym = ctx.step.gate.glyph.symbol;

      if (sym === 'H') {
        return {
          title: 'Prepare the uniform superposition',
          equation: `${v('H')}${ket('0')} = (${ket('0')} + ${ket('1')}) / √2 &nbsp;⇒&nbsp; ${v('H')}<sup>⊗${n}</sup>${ket('0'.repeat(n))} = <sup>1</sup>⁄<sub>√${N}</sub> Σ<sub>${v('x')}</sub> ${ket('x')} = ${ket('s')}`,
          rows: [
            ['every amplitude', `1/√${N} = ${(1 / Math.sqrt(N)).toFixed(3)}`],
            [`${awV} now`, link('focus', aw(state))],
            ['progress', progress],
          ],
          note: `H is a reflection (H² = I), so the animation follows ${v('H')}<sup>${v('t')}</sup>, a rotation by π${v('t')} about the Bloch axis (x+z)/√2. Midway, amplitudes are complex: watch the dials turn.`,
        };
      }
      if (sym === 'O') {
        return {
          title: `Iteration ${iterationOf(ctx.stepIndex)} of ${iterations} · flip the marked sign`,
          equation: `${v('O')} = ${v('I')} − 2${ket('w')}⟨${v('w')}| &nbsp;:&nbsp; ${awV} ↦ −${awV}, &nbsp;all other amplitudes unchanged`,
          rows: [
            [`${awV} (|${wb}⟩)`, `${link('focus', aw(before))}<span class="arrow">→</span>${link('focus', aw(after))}`],
            ['live', link('focus', aw(state))],
            ['phase applied', `${(ctx.t * 180).toFixed(0)}° of 180° · ${progress}`],
          ],
          note: `The oracle recognises ${ket(wb)} but does not reveal it: the probability |${v('a')}<sub>${v('w')}</sub>|² is unchanged. In the plane this is a reflection across the ${ket('s′')} axis.`,
        };
      }
      if (sym === 'D') {
        let mean = 0;
        for (let x = 0; x < N; x++) mean += before.re[x];
        mean /= N;
        return {
          title: `Iteration ${iterationOf(ctx.stepIndex)} of ${iterations} · invert about the mean`,
          equation: `${v('D')} = 2${ket('s')}⟨${v('s')}| − ${v('I')} &nbsp;:&nbsp; ${v('a')}<sub>${v('x')}</sub> ↦ 2${v('ā')} − ${v('a')}<sub>${v('x')}</sub>`,
          rows: [
            [`mean ${v('ā')}`, `(${aw(before)} + ${N - 1}·${ar(before)}) / ${N} = ${fmt(mean)}`],
            [awV, link('focus', `2·${fmt(mean)} − (${aw(before)}) = ${aw(after)}`)],
            [arV, link('rest', `2·${fmt(mean)} − ${ar(before)} = ${ar(after)}`)],
            ['progress', progress],
          ],
          note: `The negative ${awV} sits far below the mean, so reflecting about the mean throws it far above. In the plane this is a reflection across ${ket('s')}. Two reflections make one rotation by 2θ = ${deg(2 * theta)}.`,
        };
      }
      // Measurement
      const pw = probability(state, marked);
      const shown = ctx.shots?.shown ?? 0;
      let hits = 0;
      for (let i = 0; i < shown; i++) if (ctx.timeline.outcomes[i] === marked) hits++;
      let note: string;
      if (iterations > kStar) note = `<span class="warn">You ran past the optimum (k* = ${kStar}).</span> Extra iterations keep rotating the state beyond ${ket('w')}, and the success rate drops. Grover is a rotation, not a search that keeps improving.`;
      else if (iterations < kStar) note = `You stopped before the optimum (k* = ${kStar}). The state has not finished rotating toward ${ket('w')}. Try more iterations.`;
      else note = `k* = ${kStar} iterations is optimal for N = ${N}. A classical search needs about N/2 = ${N / 2} guesses on average; Grover needs about (π/4)√N.`;
      return {
        title: 'Measure',
        equation: `${v('P')}(${ket(wb)}) = |${awV}|² = sin²((2·${iterations}+1)·${v('θ')}) = sin²(${deg((2 * iterations + 1) * theta)}) = ${pw.toFixed(3)}`,
        rows: [
          ['shots so far', shown.toLocaleString('en-US')],
          [`found ${ket(wb)}`, link('focus', `${hits} (${shown ? (hits / shown).toFixed(3) : '—'})`)],
          ['exact', pw.toFixed(3)],
        ],
        note,
      };
    }

    return {
      n,
      steps,
      brackets,
      role: x => (x === marked ? 'focus' : 'rest'),
      facts: [
        { label: 'States', value: `N = ${N}`, formula: `2<sup>${n}</sup> basis states` },
        { label: 'Angle θ', value: deg(theta, 2), formula: 'sin θ = 1/√N' },
        { label: 'Optimal k*', value: String(kStar), formula: '⌊π / 4θ⌋' },
        { label: 'P at k*', value: groverSuccess(n, kStar).toFixed(3), formula: 'sin²((2k*+1)θ)' },
      ],
      narrate,
      scenes: [groverPlaneScene(geo), groverProbabilityScene(geo)],
      seed: 1234 + n * 97 + marked * 13 + iterations,
      startAt: 1,
    };
  },
};
