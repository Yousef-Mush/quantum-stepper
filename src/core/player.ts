import type { Timeline } from './timeline';

/** Playback state over a timeline. Pure logic: the app calls tick() from requestAnimationFrame. */
export class Player {
  p = 0;
  playing = false;
  private target: number | null = null;

  constructor(private timeline: Timeline, private reduceMotion = false) {}

  setTimeline(tl: Timeline, p = 0): void {
    this.timeline = tl;
    this.stop();
    this.p = Math.min(p, tl.length);
  }

  tick(dt: number): void {
    if (!this.playing) return;
    const L = this.timeline.length;
    const i = Math.min(Math.floor(this.p), L - 1);
    const dur = this.reduceMotion ? 0.9 : this.timeline.built.steps[i].gate.duration;
    this.p += dt / dur;
    const end = this.target ?? L;
    if (this.p >= end) { this.p = end; this.stop(); }
  }

  toggle(): void {
    if (this.playing) { this.stop(); return; }
    if (this.p >= this.timeline.length) this.p = 0;
    this.target = null;
    this.playing = true;
  }

  /** Play forward to the end of the current step (or the next one, if on a boundary). */
  next(): void {
    this.target = Math.min(this.timeline.length, Math.floor(this.p + 1e-9) + 1);
    this.playing = true;
  }

  /** Jump back to the previous step boundary. */
  prev(): void {
    this.stop();
    const onBoundary = Math.abs(this.p - Math.round(this.p)) < 1e-9;
    this.p = Math.max(0, onBoundary ? Math.round(this.p) - 1 : Math.floor(this.p));
  }

  /** Jump to the start of a step and play just that step. */
  playStep(i: number): void {
    this.p = i;
    this.target = i + 1;
    this.playing = true;
  }

  seek(p: number): void {
    this.stop();
    this.p = Math.max(0, Math.min(this.timeline.length, p));
  }

  restart(): void { this.seek(0); }

  private stop(): void { this.playing = false; this.target = null; }
}
