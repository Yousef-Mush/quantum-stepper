import { MATRICES, bitString, dimension, layer, measurement, probability, xorOracle, type StateVector } from '../engine';
import type { AlgorithmDefinition, FrameContext, MathCard, Step } from '../core/types';
import { djPhasorScene, inputAmplitudes, phasorTerms } from '../scenes/dj-phasors';
import { fmt, fmtC, ket, link, num, v } from '../ui/format';

export interface DeutschJozsaParams extends Record<string, number> {
  /** Input qubits; the circuit has one more for the ancilla. */
  n: number;
  /** Index into DJ_ORACLES. */
  oracle: number;
}

export interface DJOracle {
  label: string;
  kind: 'constant' | 'balanced';
  /** HTML formula for f. */
  formula: string;
  f(x: number, n: number): number;
}

const parity = (x: number) => {
  let p = 0;
  for (; x; x &= x - 1) p ^= 1;
  return p;
};

/**
 * The oracle choices. scripts/qiskit_fixtures.py defines the same functions;
 * the Qiskit test checks the truth tables agree.
 */
export const DJ_ORACLES: DJOracle[] = [
  { label: 'constant · f(x) = 0', kind: 'constant', formula: 'f(x) = 0', f: () => 0 },
  { label: 'constant · f(x) = 1', kind: 'constant', formula: 'f(x) = 1', f: () => 1 },
  { label: 'balanced · first bit', kind: 'balanced', formula: 'f(x) = x₀', f: (x, n) => (x >> (n - 1)) & 1 },
  { label: 'balanced · parity', kind: 'balanced', formula: 'f(x) = x₀ ⊕ … ⊕ x<sub>n−1</sub>', f: x => parity(x) },
  {
    // x -> (5x + 3) mod N is a bijection, so exactly half the inputs land below N/2.
    label: 'balanced · scrambled', kind: 'balanced', formula: 'f(x) = [(5x+3) mod N < N/2]',
    f: (x, n) => (((5 * x + 3) % (1 << n)) < (1 << (n - 1)) ? 1 : 0),
  },
];

export const djTruthTable = (n: number, oracle: number): number[] =>
  Array.from({ length: dimension(n) }, (_, x) => DJ_ORACLES[oracle].f(x, n));

/** Step indices: X on the ancilla, H on everything, the oracle, H on the inputs, measure. */
const STEP = { X: 0, H: 1, ORACLE: 2, FINAL_H: 3, MEASURE: 4 } as const;

const near0 = (re: number, im: number) => Math.hypot(re, im) < 5e-4;

export const deutschJozsa: AlgorithmDefinition<DeutschJozsaParams> = {
  id: 'deutsch-jozsa',
  title: 'Deutsch–Jozsa',
  headline: 'one query decides',
  intro:
    `A black box computes ${v('f')}: {0,1}<sup>${v('n')}</sup> → {0,1} and is promised to be constant or balanced. ` +
    'Classically you may need to check over half the inputs. Deutsch–Jozsa asks once: phase kickback writes f into the signs, and the final Hadamards make those signs interfere.',

  params: [
    { key: 'n', label: 'Input qubits', options: () => [1, 2, 3, 4].map(n => ({ value: n, label: `${n} · N=${dimension(n)}` })) },
    { key: 'oracle', label: 'Oracle', options: () => DJ_ORACLES.map((o, i) => ({ value: i, label: o.label })) },
  ],
  defaults: { n: 3, oracle: 4 },

  normalize(p) {
    return {
      n: Math.max(1, Math.min(4, p.n)),
      oracle: Math.max(0, Math.min(DJ_ORACLES.length - 1, p.oracle)),
    };
  },

  build({ n, oracle }) {
    const m = n + 1; // inputs plus the ancilla y
    const N = dimension(n);
    const o = DJ_ORACLES[oracle];
    const f = djTruthTable(n, oracle);
    const ones = f.reduce((s, b) => s + b, 0);
    const inputs = Array.from({ length: n }, (_, q) => q);
    const zero = bitString(0, n);
    const expected = (N - 2 * ones) / N; // (1/N) sum_x (-1)^f(x)

    const steps: Step[] = [
      { gate: layer('Pauli X', 'X', MATRICES.X, m, [n], 1.3) },
      { gate: layer('Hadamard', 'H', MATRICES.H, m) },
      { gate: xorOracle('Oracle', 'Uf', m, n, x => f[x]) },
      { gate: layer('Hadamard', 'H', MATRICES.H, m, inputs) },
      { gate: measurement(m, 3.2, inputs) },
    ];

    const zeroAmp = (s: StateVector) => inputAmplitudes(s)[0];
    const pZero = (s: StateVector) => probability(s, 0) + probability(s, 1);
    const z0 = link('focus', `${v('a')}<sub>${zero}</sub>`);

    function narrate(ctx: FrameContext): MathCard {
      const { state, before, after } = ctx;
      const progress = ctx.atEnd ? 'done' : ctx.rawT > 0 ? `t = ${ctx.t.toFixed(2)}` : 'ready';

      if (ctx.stepIndex === STEP.X) {
        return {
          title: 'Flip the ancilla',
          equation: `${v('X')}${ket('0')} = ${ket('1')} &nbsp;⇒&nbsp; ${ket('0'.repeat(n))}${ket('0')} ↦ ${ket('0'.repeat(n))}${ket('1')}`,
          rows: [
            [`amp. of ${ket(zero + '0')}`, fmtC(state.re[0], state.im[0])],
            [`amp. of ${ket(zero + '1')}`, fmtC(state.re[1], state.im[1])],
            ['progress', progress],
          ],
          note: `${v('y')} is an ancilla: it never gets measured. ${v('X')}<sup>${v('t')}</sup> is a π${v('t')} rotation about the Bloch x axis, so midway the amplitudes are complex.`,
        };
      }
      if (ctx.stepIndex === STEP.H) {
        return {
          title: 'Superpose the inputs, put the ancilla in |−⟩',
          equation: `${v('H')}<sup>⊗${m}</sup>${ket(zero)}${ket('1')} = <sup>1</sup>⁄<sub>√${N}</sub> Σ<sub>${v('x')}</sub> ${ket('x')} ⊗ ${ket('−')}, &nbsp; ${ket('−')} = (${ket('0')} − ${ket('1')}) / √2`,
          rows: [
            ['every |amplitude|', `1/√${2 * N} = ${(1 / Math.sqrt(2 * N)).toFixed(3)}`],
            [`${z0} now`, link('focus', fmtC(zeroAmp(state).re, zeroAmp(state).im))],
            ['progress', progress],
          ],
          note: `The ancilla in ${ket('−')} is the trick: it is an eigenvector of ${v('X')} with eigenvalue −1, so flipping it only changes a sign.`,
        };
      }
      if (ctx.stepIndex === STEP.ORACLE) {
        const pre = phasorTerms(inputAmplitudes(state), n, 1).reduce((s, p) => ({ re: s.re + p.re, im: s.im + p.im }), { re: 0, im: 0 });
        return {
          title: 'Query the oracle once · phase kickback',
          equation: `${v('U')}<sub>${v('f')}</sub>${ket('x')}${ket('y')} = ${ket('x')}${ket('y ⊕ f(x)')} &nbsp;⇒&nbsp; ${v('U')}<sub>${v('f')}</sub>${ket('x')}${ket('−')} = (−1)<sup>${v('f')}(${v('x')})</sup>${ket('x')}${ket('−')}`,
          rows: [
            ['oracle', `${o.kind} · ${o.formula}`],
            [`${v('f')}(${v('x')}) = 1 on`, `${ones} of ${N} inputs`],
            ['phase applied', `${(ctx.t * 180).toFixed(0)}° of 180° on those inputs · ${progress}`],
            [`preview ${z0}`, link('focus', fmtC(pre.re, pre.im))],
          ],
          note: `The oracle acts on ${v('y')}, but because ${v('y')} is in ${ket('−')} the flip comes back as a sign on ${ket('x')}. The probabilities do not change at all; the answer is hidden in the phases.`,
        };
      }
      if (ctx.stepIndex === STEP.FINAL_H) {
        const a = zeroAmp(state), fin = zeroAmp(after);
        return {
          title: 'Interfere · Hadamards on the inputs',
          equation: `${z0} = ⟨${zero}|${v('H')}<sup>⊗${n}</sup>|ψ⟩ = <sup>1</sup>⁄<sub>${N}</sub> Σ<sub>${v('x')}</sub> (−1)<sup>${v('f')}(${v('x')})</sup> = (${N - ones} − ${ones}) / ${N}`,
          rows: [
            [z0, `${link('focus', fmtC(zeroAmp(before).re, zeroAmp(before).im))}<span class="arrow">→</span>${link('focus', fmtC(fin.re, fin.im))}`],
            ['live', link('focus', fmtC(a.re, a.im))],
            [`${v('P')}(${ket(zero)})`, link('focus', pZero(state).toFixed(3))],
            ['progress', progress],
          ],
          note: o.kind === 'constant'
            ? `All ${N} terms have the same sign, so they add up: ${ket(zero)} gets all the amplitude.`
            : `Half the terms are +1/${N} and half are −1/${N}, so they cancel exactly and ${ket(zero)} gets nothing. The amplitude goes to other outputs instead.`,
        };
      }
      // Measurement
      const shown = ctx.shots?.shown ?? 0;
      let hits = 0;
      for (let i = 0; i < shown; i++) if (ctx.timeline.outcomes[i] >> 1 === 0) hits++;
      const pz = pZero(state);
      return {
        title: `Measure the inputs · ${o.kind}`,
        equation: `${v('P')}(${ket(zero)}) = |<sup>1</sup>⁄<sub>${N}</sub> Σ<sub>${v('x')}</sub> (−1)<sup>${v('f')}(${v('x')})</sup>|² = ${fmt(expected)}² = ${pz.toFixed(3)}`,
        rows: [
          ['shots so far', shown.toLocaleString('en-US')],
          [`saw ${ket(zero)}`, link('focus', `${hits} (${shown ? (hits / shown).toFixed(3) : '—'})`)],
          ['verdict', pz > 0.5 ? `all zeros ⇒ constant` : `anything else ⇒ balanced`],
        ],
        note: `One query, certainty either way. A classical algorithm that must be sure needs ${N / 2 + 1} queries in the worst case: it can see ${N / 2} equal values from a balanced ${v('f')}. The ancilla bit stays 50/50 because it is still ${ket('−')}.`,
      };
    }

    /** Write the state as (input register) (x) |->, or list its terms. */
    function stateLine(ctx: FrameContext): string {
      const { state } = ctx;
      if (ctx.atStart) return `|ψ₀⟩ = ${ket('0'.repeat(m))}`;
      const a = inputAmplitudes(state);
      let factored = true;
      for (let x = 0; x < N; x++) {
        // <x,+|psi> must vanish for the ancilla to be |->.
        const pr = (state.re[2 * x] + state.re[2 * x + 1]) * Math.SQRT1_2, pi = (state.im[2 * x] + state.im[2 * x + 1]) * Math.SQRT1_2;
        if (!near0(pr, pi)) factored = false;
      }
      const term = (re: number, im: number, label: string, x: number) =>
        link(x === 0 ? 'focus' : 'rest', `${num(fmtC(re, im))} ${ket(label)}`);
      if (factored) {
        const nz = a.map((p, x) => [p, x] as const).filter(([p]) => !near0(p.re, p.im));
        const uniformReal = nz.length === N && nz.every(([p]) => Math.abs(p.im) < 5e-4 && Math.abs(Math.abs(p.re) - 1 / Math.sqrt(N)) < 5e-4);
        if (uniformReal && N > 4) {
          const signs = nz.every(([p], x) => (p.re < 0 ? 1 : 0) === f[x]);
          if (signs) return `|ψ⟩ = <sup>1</sup>⁄<sub>√${N}</sub> Σ<sub>${v('x')}</sub> (−1)<sup>${v('f')}(${v('x')})</sup>${ket('x')} ⊗ ${ket('−')}`;
          if (nz.every(([p]) => p.re > 0)) return `|ψ⟩ = <sup>1</sup>⁄<sub>√${N}</sub> Σ<sub>${v('x')}</sub> ${ket('x')} ⊗ ${ket('−')}`;
        }
        if (nz.length <= 4) return `|ψ⟩ = (${nz.map(([p, x]) => term(p.re, p.im, bitString(x, n), x)).join(' + ')}) ⊗ ${ket('−')}`;
        return `|ψ⟩ = (Σ<sub>${v('x')}</sub> ${v('a')}<sub>${v('x')}</sub>${ket('x')}) ⊗ ${ket('−')} <span class="note">&nbsp;see the bars</span>`;
      }
      const nz: number[] = [];
      for (let i = 0; i < state.re.length; i++) if (!near0(state.re[i], state.im[i])) nz.push(i);
      if (nz.length <= 4) return `|ψ⟩ = ${nz.map(i => term(state.re[i], state.im[i], bitString(i, m), i >> 1)).join(' + ')}`;
      return `|ψ⟩ = Σ ${v('a')}<sub>${v('x')}${v('y')}</sub>${ket('x')}${ket('y')} <span class="note">&nbsp;mid-gate, see the bars</span>`;
    }

    return {
      n: m,
      steps,
      brackets: [{ from: STEP.ORACLE, to: STEP.ORACLE, label: '1 query' }],
      role: x => (x >> 1 === 0 ? 'focus' : 'rest'),
      facts: [
        { label: 'Inputs', value: `N = ${N}`, formula: `2<sup>${n}</sup> values of ${v('x')}` },
        { label: 'Oracle', value: o.kind, formula: o.formula },
        { label: `P(${zero})`, value: (expected ** 2).toFixed(3), formula: '|(1/N) Σ (−1)<sup>f(x)</sup>|²' },
        { label: 'Queries', value: `1 vs ${N / 2 + 1}`, formula: 'quantum vs classical, worst case' },
      ],
      narrate,
      stateLine,
      scenes: [djPhasorScene({ n, f, oracle: STEP.ORACLE, finalH: STEP.FINAL_H })],
      seed: 4321 + n * 31 + oracle * 7,
      startAt: STEP.ORACLE,
      wireLabels: [...inputs.map(q => `x${q} |0⟩`), 'y |0⟩'],
      showMean: false,
    };
  },
};
