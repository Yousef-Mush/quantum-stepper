import type { BuiltAlgorithm } from '../core/types';

const COL = 58, X0 = 62, TOP = 34, GAP = 30;

/** Circuit timeline: wires, gates, iteration brackets and a playhead. Click a gate to play it. */
export class CircuitView {
  private gateEls: SVGGElement[] = [];
  private playhead!: SVGLineElement;

  constructor(private svg: SVGSVGElement, private onSelect: (step: number) => void) {}

  build(built: BuiltAlgorithm): void {
    const { n, steps, brackets } = built;
    const yq = (q: number) => TOP + q * GAP;
    const yLast = yq(n - 1);
    const W = X0 + steps.length * COL + 20, H = yLast + 26;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.setAttribute('width', String(W));
    this.svg.setAttribute('height', String(H));

    let h = '';
    for (let q = 0; q < n; q++) {
      h += `<line class="wire" x1="40" x2="${W - 8}" y1="${yq(q)}" y2="${yq(q)}"/>`;
      h += `<text class="wlabel" x="4" y="${yq(q) + 4}">q${q} |0⟩</text>`;
    }
    for (const b of brackets) {
      const xa = X0 + b.from * COL + 6, xb = X0 + (b.to + 1) * COL - 6;
      h += `<path class="kbrace" d="M${xa} 22 V17 H${xb} V22"/>`;
      h += `<text class="klabel ${b.emphasis ? 'star' : ''}" x="${(xa + xb) / 2}" y="12">${b.label}</text>`;
    }
    steps.forEach((step, i) => {
      const { glyph } = step.gate;
      const cx = X0 + (i + 0.5) * COL;
      h += `<g class="gate tone-${glyph.tone ?? 'neutral'}" data-step="${i}"><title>${step.gate.name}</title>`;
      if (glyph.kind === 'per-qubit') {
        for (const q of glyph.qubits) {
          h += `<rect class="box" x="${cx - 14}" y="${yq(q) - 11}" width="28" height="22" rx="3"/><text x="${cx}" y="${yq(q)}">${glyph.symbol}</text>`;
        }
      } else if (glyph.kind === 'measure') {
        for (const q of glyph.qubits) {
          const y = yq(q);
          h += `<rect class="box" x="${cx - 15}" y="${y - 11}" width="30" height="22" rx="3"/>` +
            `<path class="meter" d="M${cx - 9} ${y + 5} A9 9 0 0 1 ${cx + 9} ${y + 5} M${cx} ${y + 5} L${cx + 6} ${y - 6}"/>`;
        }
      } else {
        const y0 = yq(Math.min(...glyph.qubits)) - 13, y1 = yq(Math.max(...glyph.qubits)) + 13;
        h += `<rect class="box" x="${cx - 17}" y="${y0}" width="34" height="${y1 - y0}" rx="4"/><text x="${cx}" y="${(y0 + y1) / 2}">${glyph.symbol}</text>`;
      }
      h += `<rect class="hit" x="${cx - COL / 2}" y="0" width="${COL}" height="${H}"/></g>`;
    });
    h += `<line class="playhead" x1="0" x2="0" y1="20" y2="${H - 2}"/>`;
    this.svg.innerHTML = h;

    this.gateEls = [...this.svg.querySelectorAll<SVGGElement>('.gate')];
    this.playhead = this.svg.querySelector('.playhead')!;
    this.gateEls.forEach(el => el.addEventListener('click', () => this.onSelect(Number(el.dataset.step))));
  }

  update(p: number): void {
    this.gateEls.forEach((el, i) => {
      el.classList.toggle('done', p >= i + 1);
      el.classList.toggle('active', p >= i && p < i + 1);
    });
    const x = X0 + p * COL;
    this.playhead.setAttribute('x1', String(x));
    this.playhead.setAttribute('x2', String(x));
  }
}
