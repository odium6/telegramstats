/* ───────────── Переломные моменты ─────────────
 *
 * Помесячные ряды (инициатива, сообщения в день, скорость ответа, «люблю
 * тебя»…) делятся на отрезки с разным средним методом бинарной
 * сегментации. Новая точка принимается, только если выигрыш в сумме
 * квадратов больше штрафа BIC и сдвиг заметный (≥ 15 % и ≥ 0.6 σ шума).
 */

export interface ChangePoint {
  index: number;
  before: number;
  after: number;
}

export function changePoints(raw: (number | null)[], minSeg = 3, maxCp = 3): ChangePoint[] {
  const idx: number[] = [];
  const y: number[] = [];
  raw.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) {
      idx.push(i);
      y.push(v);
    }
  });
  const n = y.length;
  if (n < minSeg * 2 + 2) return [];
  // шум — по разностям соседних точек (устойчиво к самим сдвигам)
  const diffs = y
    .slice(1)
    .map((v, i) => Math.abs(v - y[i]))
    .sort((a, b) => a - b);
  const sigma = Math.max(1e-9, diffs[diffs.length >> 1] / 0.6745 / Math.SQRT2);
  const penalty = 3 * sigma * sigma * Math.log(n);
  const mean = (a: number, b: number) => {
    let s = 0;
    for (let i = a; i < b; i++) s += y[i];
    return s / (b - a);
  };
  const cost = (a: number, b: number) => {
    const m = mean(a, b);
    let s = 0;
    for (let i = a; i < b; i++) s += (y[i] - m) ** 2;
    return s;
  };
  const cps: number[] = [];
  const segs: [number, number][] = [[0, n]];
  while (cps.length < maxCp) {
    let best: { gain: number; k: number; seg: number } | null = null;
    for (let si = 0; si < segs.length; si++) {
      const [a, b] = segs[si];
      const c0 = cost(a, b);
      for (let k = a + minSeg; k <= b - minSeg; k++) {
        const gain = c0 - cost(a, k) - cost(k, b);
        const m1 = mean(a, k);
        const m2 = mean(k, b);
        const rel = Math.abs(m2 - m1) / Math.max(1e-9, Math.abs(m1));
        if (gain > penalty && rel >= 0.15 && Math.abs(m2 - m1) >= 0.6 * sigma && (!best || gain > best.gain)) best = { gain, k, seg: si };
      }
    }
    if (!best) break;
    const [a, b] = segs[best.seg];
    segs.splice(best.seg, 1, [a, best.k], [best.k, b]);
    cps.push(best.k);
  }
  cps.sort((a, b) => a - b);
  const bounds = [0, ...cps, n];
  return cps.map((k, i) => ({ index: idx[k], before: mean(bounds[i], k), after: mean(k, bounds[i + 2]) }));
}
