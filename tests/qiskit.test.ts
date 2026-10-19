import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/grover.json';
import djFixtures from './fixtures/deutsch-jozsa.json';
import { deutschJozsa, djTruthTable } from '../src/algorithms/deutsch-jozsa';
import { grover } from '../src/algorithms/grover';
import { Timeline } from '../src/core/timeline';

/**
 * Cross-check against Qiskit. Fixtures come from scripts/qiskit_fixtures.py,
 * which builds the same circuits with Qiskit gates (H, DiagonalGate) and
 * records the state vector after every step.
 */
describe(`engine matches Qiskit ${fixtures.qiskit}`, () => {
  it.each(fixtures.cases.map(c => [c.n, c.marked, c.iterations, c] as const))(
    'Grover n=%i marked=%i iterations=%i: every step boundary agrees',
    (n, marked, iterations, c) => {
      const tl = new Timeline(grover.build({ n, marked, iterations }));
      c.boundaries.forEach((expected, i) => {
        const s = tl.boundaries[i + 1]; // our boundary 0 is |0...0>, before the Hadamards
        expected.forEach(([re, im], x) => {
          expect(Math.abs(s.re[x] - re)).toBeLessThan(1e-9);
          expect(Math.abs(s.im[x] - im)).toBeLessThan(1e-9);
        });
      });
    },
  );
});

/**
 * Deutsch–Jozsa against Qiskit: X on the ancilla, H on every qubit, the oracle
 * as one multi-controlled X per input with f(x) = 1, then H on the inputs.
 */
describe(`Deutsch–Jozsa matches Qiskit ${djFixtures.qiskit}`, () => {
  it.each(djFixtures.cases.map(c => [c.n, c.oracle, c] as const))(
    'n=%i oracle=%i: same truth table, and every step boundary agrees',
    (n, oracle, c) => {
      expect(djTruthTable(n, oracle)).toEqual(c.f);
      const tl = new Timeline(deutschJozsa.build({ n, oracle }));
      c.boundaries.forEach((expected, i) => {
        const s = tl.boundaries[i + 1];
        expected.forEach(([re, im], x) => {
          expect(Math.abs(s.re[x] - re)).toBeLessThan(1e-9);
          expect(Math.abs(s.im[x] - im)).toBeLessThan(1e-9);
        });
      });
    },
  );
});
