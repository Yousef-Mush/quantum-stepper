import type { BuiltAlgorithm } from '../core/types';

const X0 = 62, TOP = 34, GAP = 30, PAD_R = 20;
/** Natural column width; columns stretch above it to fill the panel and shrink to MIN_COL before scrolling. */
export const COL = 58, MIN_COL = 44;
/** Gate boxes grow with their column, but only this far, so a shallow circuit spreads out rather than ballooning. */
const MAX_BOX_SCALE = 1.5;

export interface CircuitLayout {
  /** Column width in px. */
  col: number;
  /** Total drawing width and height in px. */
  width: number;
  height: number;
  /** Factor applied to gate box widths. */
  boxScale: number;
}

/**
 * Spreads `steps` columns across `available` px. Columns never drop below MIN_COL; when the circuit
 * is too deep for that, the drawing is wider than `available` and the container scrolls.
 */
export function layoutCircuit(n: number, steps: number, available = 0): CircuitLayout {
  const fit = (available - X0 - PAD_R) / Math.max(1, steps);
  const col = available > 0 ? Math.max(MIN_COL, fit) : COL;
  const boxScale = Math.min(MAX_BOX_SCALE, Math.max(1, col / COL));
  return { col, width: Math.floor(X0 + steps * col + PAD_R), height: TOP + (n - 1) * GAP + 26, boxScale };
}

/** x of the playhead at timeline position p (p = i is the left edge of gate i). */
export const playheadX = (layout: CircuitLayout, p: number): number => X0 + p * layout.col;

/** SVG markup for the circuit: wires, gates, iteration brackets and the playhead. */
export function circuitMarkup(built: BuiltAlgorithm, L: CircuitLayout): string {
  const { n, steps, brackets } = built;
  const { col: COLW, width: W, height: H, boxScale: s } = L;
  const yq = (q: number) => TOP + q * GAP;

  let h = '';
  for (let q = 0; q < n; q++) {
    h += `<line class="wire" x1="40" x2="${W - 8}" y1="${yq(q)}" y2="${yq(q)}"/>`;
    h += `<text class="wlabel" x="4" y="${yq(q) + 4}">${built.wireLabels?.[q] ?? `q${q} |0⟩`}</text>`;
  }
  for (const b of brackets) {
    const xa = X0 + b.from * COLW + 6, xb = X0 + (b.to + 1) * COLW - 6;
    h += `<path class="kbrace" d="M${xa} 22 V17 H${xb} V22"/>`;
    h += `<text class="klabel ${b.emphasis ? 'star' : ''}" x="${(xa + xb) / 2}" y="12">${b.label}</text>`;
  }
  steps.forEach((step, i) => {
    const { glyph } = step.gate;
    const cx = X0 + (i + 0.5) * COLW;
    h += `<g class="gate tone-${glyph.tone ?? 'neutral'}" data-step="${i}"><title>${step.gate.name}</title>`;
    if (glyph.kind === 'per-qubit') {
      const w = 28 * s;
      for (const q of glyph.qubits) {
        h += `<rect class="box" x="${cx - w / 2}" y="${yq(q) - 11}" width="${w}" height="22" rx="3"/><text x="${cx}" y="${yq(q)}">${glyph.symbol}</text>`;
      }
    } else if (glyph.kind === 'measure') {
      const w = 30 * s;
      for (const q of glyph.qubits) {
        const y = yq(q);
        h += `<rect class="box" x="${cx - w / 2}" y="${y - 11}" width="${w}" height="22" rx="3"/>` +
          `<path class="meter" d="M${cx - 9} ${y + 5} A9 9 0 0 1 ${cx + 9} ${y + 5} M${cx} ${y + 5} L${cx + 6} ${y - 6}"/>`;
      }
    } else {
      const w = 34 * s;
      const y0 = yq(Math.min(...glyph.qubits)) - 13, y1 = yq(Math.max(...glyph.qubits)) + 13;
      h += `<rect class="box" x="${cx - w / 2}" y="${y0}" width="${w}" height="${y1 - y0}" rx="4"/><text x="${cx}" y="${(y0 + y1) / 2}">${glyph.symbol}</text>`;
    }
    h += `<rect class="hit" x="${cx - COLW / 2}" y="0" width="${COLW}" height="${H}"/></g>`;
  });
  h += `<line class="playhead" x1="0" x2="0" y1="20" y2="${H - 2}"/>`;
  return h;
}

/**
 * Circuit timeline that fills the width of its container. It re-lays itself out when the
 * container resizes, and keeps the playhead in view when a deep circuit has to scroll.
 */
export class CircuitView {
  private gateEls: SVGGElement[] = [];
  private playhead!: SVGLineElement;
  private built: BuiltAlgorithm | null = null;
  private layout!: CircuitLayout;
  private p = 0;
  private wrap: HTMLElement | null;

  constructor(private svg: SVGSVGElement, private onSelect: (step: number) => void) {
    this.wrap = svg.parentElement;
    if (this.wrap && typeof ResizeObserver !== 'undefined') {
      let lastWidth = -1;
      new ResizeObserver(() => {
        const w = this.available();
        if (w !== lastWidth && this.built) { lastWidth = w; this.render(); }
      }).observe(this.wrap);
    }
  }

  build(built: BuiltAlgorithm): void {
    this.built = built;
    this.p = 0;
    this.render();
    if (this.wrap) this.wrap.scrollLeft = 0;
  }

  update(p: number): void {
    this.p = p;
    this.gateEls.forEach((el, i) => {
      el.classList.toggle('done', p >= i + 1);
      el.classList.toggle('active', p >= i && p < i + 1);
    });
    const x = playheadX(this.layout, p);
    this.playhead.setAttribute('x1', String(x));
    this.playhead.setAttribute('x2', String(x));
    this.keepInView(x);
  }

  /** Content width of the container, i.e. the width the drawing should fill. */
  private available(): number {
    if (!this.wrap) return 0;
    const cs = getComputedStyle(this.wrap);
    return Math.floor(this.wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  }

  private render(): void {
    const built = this.built!;
    this.layout = layoutCircuit(built.n, built.steps.length, this.available());
    const { width: W, height: H } = this.layout;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.setAttribute('width', String(W));
    this.svg.setAttribute('height', String(H));
    this.svg.innerHTML = circuitMarkup(built, this.layout);

    this.gateEls = [...this.svg.querySelectorAll<SVGGElement>('.gate')];
    this.playhead = this.svg.querySelector('.playhead')!;
    this.gateEls.forEach(el => el.addEventListener('click', () => this.onSelect(Number(el.dataset.step))));
    this.update(this.p);
  }

  /** When the circuit is wider than its container, scroll just enough to keep the playhead (and a gate either side) visible. */
  private keepInView(x: number): void {
    const wrap = this.wrap;
    if (!wrap || wrap.scrollWidth <= wrap.clientWidth) return;
    const margin = this.layout.col * 1.5;
    const pad = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
    const left = x + pad - margin, right = x + pad + margin;
    if (left < wrap.scrollLeft) wrap.scrollLeft = Math.max(0, left);
    else if (right > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = right - wrap.clientWidth;
  }
}
