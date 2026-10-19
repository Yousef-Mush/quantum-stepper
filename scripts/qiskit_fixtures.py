"""Generate reference state vectors with Qiskit for the TypeScript test suite.

The engine is checked against these fixtures in tests/qiskit.test.ts, so the
visualizer's physics is validated by an independent simulator.

    pip install qiskit
    python3 scripts/qiskit_fixtures.py

Indexing: both Qiskit and this project index amplitudes by the integer x. The
gates used here (H on every qubit, diagonal oracles) are symmetric under qubit
relabelling, so integer indices line up directly despite Qiskit's little-endian
bit order.
"""
import json
import math
from pathlib import Path

import qiskit
from qiskit import QuantumCircuit
from qiskit.circuit.library import DiagonalGate
from qiskit.quantum_info import Statevector

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "grover.json"


def grover_boundaries(n: int, marked: int, iterations: int):
    """State after every step: H layer, then (oracle, diffusion) x iterations."""
    N = 2 ** n
    oracle = DiagonalGate([-1 if x == marked else 1 for x in range(N)])
    # 2|0><0| - I, conjugated by H on every qubit, gives 2|s><s| - I.
    zero_reflect = DiagonalGate([1 if x == 0 else -1 for x in range(N)])

    def evolve(state, build):
        qc = QuantumCircuit(n)
        build(qc)
        return state.evolve(qc)

    state = Statevector.from_label("0" * n)
    out = []
    state = evolve(state, lambda qc: qc.h(range(n)))
    out.append(state)
    for _ in range(iterations):
        state = evolve(state, lambda qc: qc.append(oracle, range(n)))
        out.append(state)

        def diffusion(qc):
            qc.h(range(n))
            qc.append(zero_reflect, range(n))
            qc.h(range(n))

        state = evolve(state, diffusion)
        out.append(state)
    return out


def main():
    cases = []
    for n in (2, 3, 4, 5):
        N = 2 ** n
        k_star = math.floor(math.pi / (4 * math.asin(1 / math.sqrt(N))))
        for marked in sorted({0, 1, N // 2 + 1, N - 1}):
            iterations = 2 * k_star + 2  # include over-rotation
            states = grover_boundaries(n, marked, iterations)
            cases.append({
                "n": n,
                "marked": marked,
                "iterations": iterations,
                "boundaries": [[[float(a.real), float(a.imag)] for a in s.data] for s in states],
            })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"qiskit": qiskit.__version__, "cases": cases}))
    print(f"wrote {len(cases)} cases to {OUT} (qiskit {qiskit.__version__})")


if __name__ == "__main__":
    main()
