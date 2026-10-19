import { Player } from '../core/player';
import { Timeline } from '../core/timeline';
import type { AnyAlgorithm, BuiltAlgorithm, Scene } from '../core/types';
import { renderBars } from './bars';
import { CircuitView } from './circuit';
import { MathView } from './math';

const $ = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;
const SVG_NS = 'http://www.w3.org/2000/svg';

interface ScenePanel { scene: Scene; svg: SVGSVGElement; live: HTMLElement | null; caption: HTMLElement }

/** Wires a list of algorithms to the shared views. The app knows nothing algorithm-specific. */
export function startApp(algorithms: AnyAlgorithm[]): void {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const app = $('app');

  let algo = algorithms[0];
  let params: Record<string, number> = algo.normalize({ ...algo.defaults });
  let built: BuiltAlgorithm;
  let timeline: Timeline;
  let player: Player | null = null;
  let panels: ScenePanel[] = [];

  const circuit = new CircuitView($('circuit'), i => player?.playStep(i));
  const math = new MathView($('math'));

  /* ---------- configuration ---------- */
  function renderControls(): void {
    const algoSel = $<HTMLSelectElement>('selAlgo');
    algoSel.innerHTML = algorithms.map(a => `<option value="${a.id}" ${a === algo ? 'selected' : ''}>${a.title}</option>`).join('');
    $('params').innerHTML = algo.params.map(spec =>
      `<div class="field"><label for="p-${spec.key}">${spec.label}</label><select id="p-${spec.key}" data-key="${spec.key}">` +
      spec.options(params).map(o => `<option value="${o.value}" ${o.value === params[spec.key] ? 'selected' : ''}>${o.label}</option>`).join('') +
      `</select></div>`).join('');
  }

  function mountScenes(): void {
    const main = $('sceneMain'), side = $('sceneSide');
    main.innerHTML = ''; side.innerHTML = '';
    panels = built.scenes.map((scene, i) => {
      const host = i === 0 ? main : side;
      const wrap = document.createElement('div');
      wrap.className = 'scene';
      wrap.innerHTML = `<div class="ph-head"><h3>${scene.title}</h3><span class="live"></span></div>`;
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', scene.viewBox);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', scene.ariaLabel);
      const cap = document.createElement('figcaption');
      cap.innerHTML = scene.caption ?? '';
      wrap.append(svg, cap);
      host.append(wrap);
      return { scene, svg, live: wrap.querySelector('.live'), caption: cap };
    });
    $('sceneMainPanel').hidden = panels.length === 0;
  }

  function renderFacts(): void {
    $('facts').innerHTML = built.facts.map(f =>
      `<div class="fact"><div class="k">${f.label}</div><div class="v">${f.value}</div><div class="f">${f.formula}</div></div>`).join('');
  }

  function configure(): void {
    built = algo.build(params);
    timeline = new Timeline(built);
    if (!player) player = new Player(timeline, reduceMotion);
    player.setTimeline(timeline, built.startAt ?? 0);
    $('headline').textContent = algo.headline;
    $('title').textContent = `${algo.title}, `;
    $('intro').innerHTML = algo.intro;
    $<HTMLInputElement>('scrub').max = String(timeline.length);
    renderControls();
    circuit.build(built);
    mountScenes();
    renderFacts();
    math.reset();
  }

  $('selAlgo').addEventListener('change', e => {
    algo = algorithms.find(a => a.id === (e.target as HTMLSelectElement).value) ?? algorithms[0];
    params = algo.normalize({ ...algo.defaults });
    configure();
  });
  $('params').addEventListener('change', e => {
    const sel = e.target as HTMLSelectElement;
    const key = sel.dataset.key!;
    params = algo.normalize({ ...params, [key]: Number(sel.value) }, key);
    configure();
  });

  /* ---------- transport ---------- */
  $('bPlay').addEventListener('click', () => player!.toggle());
  $('bNext').addEventListener('click', () => player!.next());
  $('bPrev').addEventListener('click', () => player!.prev());
  $('bRestart').addEventListener('click', () => player!.restart());
  $('scrub').addEventListener('input', e => player!.seek(Number((e.target as HTMLInputElement).value)));
  document.addEventListener('keydown', e => {
    if ((e.target as Element).matches('select, input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); player!.toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); player!.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); player!.prev(); }
  });

  /* ---------- hover linking: any [data-link] element highlights its whole role ---------- */
  let hover: string | null = null;
  document.addEventListener('pointermove', e => {
    const el = (e.target as Element).closest?.('[data-link]') as HTMLElement | null;
    const k = el?.dataset.link ?? null;
    if (k === hover) return;
    hover = k;
    if (k) app.dataset.hover = k; else delete app.dataset.hover;
  });

  /* ---------- render loop ---------- */
  const playIcon = $('playIcon');
  let wasPlaying: boolean | null = null;
  function render(): void {
    const ctx = timeline.frame(player!.p, { reduceMotion });
    circuit.update(ctx.p);
    for (const pnl of panels) {
      const out = pnl.scene.render(pnl.svg, ctx);
      if (out?.live !== undefined && pnl.live) pnl.live.textContent = out.live;
      if (out?.caption !== undefined) pnl.caption.textContent = out.caption;
    }
    const bars = renderBars($('bars'), ctx);
    $('barsTitle').textContent = bars.title;
    $('pwLive').textContent = bars.live;
    $('phLegend').hidden = !bars.showPhaseLegend;
    math.render(ctx);
    $<HTMLInputElement>('scrub').value = String(ctx.p);
    $('readout').innerHTML = `<b>${ctx.step.gate.name}</b> · step ${ctx.stepIndex + 1}/${timeline.length}`;
    if (wasPlaying !== player!.playing) {
      wasPlaying = player!.playing;
      playIcon.innerHTML = wasPlaying ? '<path d="M3 2h4v12H3zM9 2h4v12H9z"/>' : '<path d="M4 2l10 6-10 6z"/>';
      $('bPlay').setAttribute('aria-label', wasPlaying ? 'Pause' : 'Play');
    }
  }

  let last = performance.now();
  function frame(now: number): void {
    player!.tick(Math.min(0.05, (now - last) / 1000));
    last = now;
    render();
    requestAnimationFrame(frame);
  }

  configure();
  requestAnimationFrame(frame);
}
