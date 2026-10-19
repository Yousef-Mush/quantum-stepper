import type { Role } from '../core/types';

/** Fixed decimals with a real minus sign, and no "-0.000". */
export function fmt(v: number, d = 3): string {
  const neg = v < -0.5 * 10 ** -d;
  return (neg ? '−' : '') + Math.abs(v).toFixed(d);
}

/** Complex number, real-only when the imaginary part is negligible. */
export function fmtC(re: number, im: number): string {
  if (Math.abs(im) < 5e-4) return fmt(re);
  return `${fmt(re)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toFixed(3)}i`;
}

export const ket = (s: string): string => `<span class="ket">|${s}⟩</span>`;
export const bra = (s: string): string => `<span class="ket">⟨${s}|</span>`;
/** Italic math variable. */
export const v = (s: string): string => `<span class="m">${s}</span>`;
export const num = (s: string): string => `<span class="num">${s}</span>`;

/** Wrap HTML so hovering it highlights every element with the same role (bars, plane, terms). */
export const link = (role: Role, html: string): string =>
  `<span class="t-${role}" data-link="${role}">${html}</span>`;

export const deg = (rad: number, d = 1): string => `${fmt((rad * 180) / Math.PI, d)}°`;
