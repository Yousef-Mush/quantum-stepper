"""Generate reference state vectors with Qiskit for the TypeScript test suite.

The engine is checked against these fixtures in tests/qiskit.test.ts, so the
visualizer's physics is validated by an independent simulator.

    pip install qiskit
    python3 scripts/qiskit_fixtures.py

Indexing: both Qiskit and this project index amplitudes by the integer x. This
project's qubit 0 is the most significant bit and Qiskit's qubit 0 is the least,
so project qubit q is Qiskit qubit (m - 1 - q) and integer indices line up
directly. Grover's gates are symmetric under relabelling anyway; Deutsch-Jozsa's
ancilla (project qubit n, the last) is Qiskit qubit 0.
"""
import json
import math
from pathlib import Path

import qiskit
from qiskit import QuantumCircuit
from qiskit.circuit.library import DiagonalGate
from qiskit.quantum_info import Statevector

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
OUT = FIXTURES / "grover.json"
DJ_OUT = FIXTURES / "deutsch-jozsa.json"


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


def amplitudes(state):
    return [[float(a.real), float(a.imag)] for a in state.data]


# Same oracles, in the same order, as DJ_ORACLES in src/algorithms/deutsch-jozsa.ts.
# x is read with input qubit 0 as its most significant bit.
DJ_ORACLES = [
    lambda x, n: 0,
    lambda x, n: 1,
    lambda x, n: (x >> (n - 1)) & 1,
    lambda x, n: bin(x).count("1") % 2,
    lambda x, n: 1 if (5 * x + 3) % 2 ** n < 2 ** (n - 1) else 0,
]


def deutsch_jozsa_boundaries(n: int, f):
    """State after X on the ancilla, H on everything, U_f, and H on the inputs.

    Project input qubit q is Qiskit qubit n - q and the ancilla is Qiskit qubit 0,
    so bit i of x lives on Qiskit qubit i + 1.
    """
    m = n + 1
    inputs = list(range(1, m))
    steps = [
        lambda qc: qc.x(0),
        lambda qc: qc.h(range(m)),
    ]

    def oracle(qc):
        for x in range(2 ** n):
            if f[x]:
                qc.mcx(inputs, 0, ctrl_state=x)

    steps += [oracle, lambda qc: qc.h(inputs)]
    state = Statevector.from_label("0" * m)
    out = []
    for build in steps:
        qc = QuantumCircuit(m)
        build(qc)
        state = state.evolve(qc)
        out.append(state)
    return out


def main():
    dj_cases = []
    for n in (1, 2, 3, 4):
        for oracle, fn in enumerate(DJ_ORACLES):
            f = [fn(x, n) for x in range(2 ** n)]
            dj_cases.append({
                "n": n,
                "oracle": oracle,
                "f": f,
                "boundaries": [amplitudes(s) for s in deutsch_jozsa_boundaries(n, f)],
            })
    DJ_OUT.parent.mkdir(parents=True, exist_ok=True)
    DJ_OUT.write_text(json.dumps({"qiskit": qiskit.__version__, "cases": dj_cases}))
    print(f"wrote {len(dj_cases)} cases to {DJ_OUT} (qiskit {qiskit.__version__})")

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
                "boundaries": [amplitudes(s) for s in states],
            })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"qiskit": qiskit.__version__, "cases": cases}))
    print(f"wrote {len(cases)} cases to {OUT} (qiskit {qiskit.__version__})")


if __name__ == "__main__":
    main()
