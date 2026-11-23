import type { Msg } from './types';
import { LOVE_RE, SWEAR_RE, sentiment, emojis, tokenize } from './text';
import { CONFLICT_RE, DRY_RE, RECONCILE_RE } from './lexicon';

/* ───────────── Напряжённые периоды (эксперимент) ─────────────
 *
 * Ссора редко укладывается в один разговор: она тянется днями, между
 * ней идёт обычное общение, а к теме возвращаются позже. Поэтому:
 *
 *  1. Для каждого дня считается «напряжённость» — отклонение от обычного
 *     для этой пары уровня (z-оценки к скользящей медиане ±30 дней):
 *       + резкие фразы («обидно», «ты опять», «как хочешь»…)
 *       + негатив, сухие ответы («ок.», «ясно»), рост времени ответа
 *       − слова нежности
 *     Мат учитывается слабо и тоже относительно нормы пары.
 *  2. Период начинается по явным признакам (несколько резких фраз и высокая
 *     напряжённость), продолжается, пока к теме возвращаются, даже если
 *     между этим есть обычные дни, и заканчивается после примирения
 *     («прости», «давай мириться») + 2 спокойных дней или после 3 спокойных
 *     дней подряд.
 *  3. Это эвристика: в списке видны ключевые сообщения, а неверные периоды
 *     можно отклонить — они перестанут учитываться.
 */

export interface TensionEpisode {
  start: string; // YYYY-MM-DD
  end: string;
  days: number;
  /** дней с резкими фразами внутри периода — «волны» возвращения к теме */
  waves: number;
  peak: number;
  confidence: number;
  conflictMsgs: number;
  firstId: number;
  /** кто первым сделал шаг к примирению */
  reconciler?: string;
  reconcileId?: number;
  label?: 0 | 1;
}

interface Day {
  key: number;
  n: number;
  conflict: number;
  love: number;
  dry: number;
  neg: number;
  swear: number;
  resp: number[];
  /** кто писал резкие фразы в этот день */
  who: Set<string>;
  firstConflictId?: number;
  firstReconcile?: { id: number; from: string };
}

const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

export function findTension(
  events: Msg[],
  dayKeyOf: (ts: number) => number,
  isoOf: (k: number) => string,
  labels: Record<string, 0 | 1> = {},
): TensionEpisode[] {
  if (events.length < 500) return [];
  const days = new Map<number, Day>();
  for (let i = 0; i < events.length; i++) {
    const m = events[i];
    const k = dayKeyOf(m.ts);
    let d = days.get(k);
    if (!d) days.set(k, (d = { key: k, n: 0, conflict: 0, love: 0, dry: 0, neg: 0, swear: 0, resp: [], who: new Set() }));
    d.n++;
    if (i && events[i - 1].from !== m.from) {
      const g = m.ts - events[i - 1].ts;
      if (g < 3 * 3600) d.resp.push(g);
    }
    const t = m.text;
    if (!t) continue;
    if (CONFLICT_RE.test(t)) {
      d.conflict++;
      d.who.add(m.from);
      d.firstConflictId ??= m.id;
    }
    if (RECONCILE_RE.test(t)) d.firstReconcile ??= { id: m.id, from: m.from };
    if (LOVE_RE.test(t)) d.love++;
    if (DRY_RE.test(t.trim())) d.dry++;
    if (SWEAR_RE.test(t)) d.swear++;
    let s = m.nsent;
    if (s === undefined) {
      const r = sentiment(tokenize(t), emojis(t));
      s = r.hits ? r.score / r.hits : 0;
    }
    if (s < -0.3) d.neg++;
  }
  const list = [...days.values()].sort((a, b) => a.key - b.key);
  const rate = (d: Day, f: 'conflict' | 'neg' | 'dry' | 'love' | 'swear') => d[f] / Math.max(1, d.n);
  const W = { conflict: 1.5, neg: 0.7, dry: 0.5, love: -0.6, swear: 0.2 } as const;
  const respMed = list.map((d) => median(d.resp));
  const score = new Map<number, number>();
  for (let i = 0; i < list.length; i++) {
    const a = Math.max(0, i - 30);
    const b = Math.min(list.length, i + 31);
    const win = list.slice(a, b);
    let s = 0;
    for (const f of Object.keys(W) as (keyof typeof W)[]) {
      const vals = win.map((d) => rate(d, f));
      const med = median(vals);
      const mad = median(vals.map((v) => Math.abs(v - med))) || 0.01;
      s += W[f] * Math.max(-3, Math.min(6, (rate(list[i], f) - med) / (1.4826 * mad)));
    }
    const rm = median(respMed.slice(a, b).filter(Number.isFinite));
    if (Number.isFinite(respMed[i]) && Number.isFinite(rm) && rm > 0) s += 0.4 * Math.max(-2, Math.min(3, Math.log2(respMed[i] / rm)));
    score.set(list[i].key, s);
  }

  const episodes: TensionEpisode[] = [];
  let cur: { start: Day; last: Day; days: Day[]; reconciled: boolean } | null = null;
  const opens = (d: Day) => {
    const s = score.get(d.key) ?? 0;
    // ссора — когда резкие фразы есть у обоих, или их много и день явно выбивается из нормы
    return (d.conflict >= 2 && d.who.size >= 2 && s >= 2) || (d.conflict >= 4 && s >= 1.5);
  };
  const close = () => {
    if (!cur) return;
    const c = cur;
    const ds = c.days.filter((d) => d.key <= c.last.key);
    const peak = Math.max(...ds.map((d) => score.get(d.key) ?? 0));
    const conflictMsgs = ds.reduce((s, d) => s + d.conflict, 0);
    const rec = c.days.find((d) => d.firstReconcile);
    const start = isoOf(c.start.key);
    const ep: TensionEpisode = {
      start,
      end: isoOf(c.last.key),
      days: c.last.key - c.start.key + 1,
      waves: ds.filter((d) => d.conflict > 0).length,
      peak,
      confidence: 1 / (1 + Math.exp(-(peak - 2.5 + 0.35 * (conflictMsgs - 2)))),
      conflictMsgs,
      firstId: c.start.firstConflictId ?? 0,
      reconciler: rec?.firstReconcile?.from,
      reconcileId: rec?.firstReconcile?.id,
      label: labels[start],
    };
    if (ep.label !== 0 && (ep.label === 1 || ep.confidence >= 0.5)) episodes.push(ep);
    cur = null;
  };
  for (const d of list) {
    if (!cur) {
      if (opens(d)) cur = { start: d, last: d, days: [d], reconciled: false };
      continue;
    }
    // дни без сообщений тоже считаются спокойными
    const calm = d.key - cur.last.key - 1;
    if (calm >= (cur.reconciled ? 2 : 3)) {
      close();
      if (opens(d)) cur = { start: d, last: d, days: [d], reconciled: false };
      continue;
    }
    cur.days.push(d);
    if (d.firstReconcile) cur.reconciled = true;
    if (d.conflict >= 1 && (score.get(d.key) ?? 0) >= 1) cur.last = d;
  }
  close();
  return episodes;
}
