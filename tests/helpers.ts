import type { C } from '../src/engine';
import type { FrameContext, Scene, SceneOutput } from '../src/core/types';

/** Scenes and bars only write innerHTML, so a plain object stands in for the SVG element in Node. */
export function renderToString(render: (svg: SVGSVGElement) => SceneOutput | void): { html: string; out: SceneOutput } {
  const svg = { innerHTML: '' };
  const out = render(svg as unknown as SVGSVGElement) ?? {};
  return { html: svg.innerHTML, out };
}

export const renderScene = (scene: Scene, ctx: FrameContext) => renderToString(svg => scene.render(svg, ctx));

/** Attributes of every element with the given tag whose class list includes `cls`, in document order. */
export function elements(html: string, tag: string, cls: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    if ((attrs.class ?? '').split(/\s+/).includes(cls)) out.push(attrs);
  }
  return out;
}

export const num = (s: string): number => Number(s);

/** Visible text of an HTML fragment, with the typographic minus turned back into '-'. */
export const text = (html: string): string => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/−/g, '-');

/**
 * Parses a number printed by fmtC ("0.354", "-0.125 - 0.125i", "0.500 + 0.500i").
 * The panel prints 3 decimals, so callers compare to within 5e-4.
 */
export function parseC(s: string): C {
  const m = text(s).trim().match(/^(-?\d+\.\d+)(?:\s*([+-])\s*(\d+\.\d+)i)?$/);
  if (!m) throw new Error(`not a printed complex number: "${s}"`);
  return { re: Number(m[1]), im: m[2] ? (m[2] === '-' ? -1 : 1) * Number(m[3]) : 0 };
}
