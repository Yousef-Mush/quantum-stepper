import { describe, expect, it } from 'vitest';
import { grover } from '../src/algorithms/grover';
import { Player } from '../src/core/player';
import { Timeline } from '../src/core/timeline';

const tl = new Timeline(grover.build({ n: 3, marked: 5, iterations: 2 })); // H O D O D M
/** Runs the player like requestAnimationFrame would until it stops. */
const run = (pl: Player) => { for (let i = 0; i < 10000 && pl.playing; i++) pl.tick(1 / 60); };

describe('Player', () => {
  it('next plays to the following step boundary and stops there', () => {
    const pl = new Player(tl);
    pl.seek(1);
    pl.next(); run(pl);
    expect(pl.p).toBe(2);
    pl.seek(2.4);
    pl.next(); run(pl);
    expect(pl.p).toBe(3);
  });

  it('prev jumps back one boundary, or to the start of the current step mid-gate', () => {
    const pl = new Player(tl);
    pl.seek(3); pl.prev();
    expect(pl.p).toBe(2);
    pl.seek(3.6); pl.prev();
    expect(pl.p).toBe(3);
    pl.seek(0); pl.prev();
    expect(pl.p).toBe(0);
  });

  it('clicking a gate plays exactly that gate', () => {
    const pl = new Player(tl);
    pl.playStep(2); run(pl);
    expect(pl.p).toBe(3);
  });

  it('play runs to the end, and play at the end starts over', () => {
    const pl = new Player(tl);
    pl.toggle(); run(pl);
    expect(pl.p).toBe(tl.length);
    pl.toggle();
    expect(pl.p).toBe(0);
    expect(pl.playing).toBe(true);
  });

  it('seek clamps to the timeline and stops playback', () => {
    const pl = new Player(tl);
    pl.toggle();
    pl.seek(99);
    expect(pl.p).toBe(tl.length);
    expect(pl.playing).toBe(false);
    pl.seek(-3);
    expect(pl.p).toBe(0);
  });

  it('each step takes its gate duration at normal speed', () => {
    const pl = new Player(tl);
    pl.playStep(1);
    let elapsed = 0;
    while (pl.playing) { pl.tick(0.001); elapsed += 0.001; }
    expect(elapsed).toBeCloseTo(tl.built.steps[1].gate.duration, 2);
  });
});
