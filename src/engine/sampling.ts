/** Small deterministic PRNG so shot histograms are reproducible across reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw `shots` basis outcomes from a probability vector. */
export function sampleShots(probs: ArrayLike<number>, shots: number, seed = 1): Int32Array {
  const cum = new Float64Array(probs.length);
  let acc = 0;
  for (let x = 0; x < probs.length; x++) cum[x] = acc += probs[x];
  const rnd = mulberry32(seed);
  const out = new Int32Array(shots);
  for (let i = 0; i < shots; i++) {
    const u = rnd() * acc;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < u) lo = mid + 1; else hi = mid;
    }
    out[i] = lo;
  }
  return out;
}

/** Counts of the first `count` outcomes. */
export function histogram(outcomes: Int32Array, count: number, size: number): Int32Array {
  const h = new Int32Array(size);
  for (let i = 0; i < count; i++) h[outcomes[i]]++;
  return h;
}
