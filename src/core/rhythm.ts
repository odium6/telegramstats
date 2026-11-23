import type { Msg } from './types';
import type { TimeParts } from './time';

/* ───────────── Режим дня, адаптивные пороги, «прочитано» ─────────────
 *
 * • Граница «логического дня» — не фиксированный час, а середина самой
 *   длинной ночной паузы в общении в эту конкретную ночь.
 * • Режим сна каждого: самая длинная ночная пауза в его собственных
 *   сообщениях → время отбоя и подъёма (медианы).
 * • Порог паузы между разговорами зависит от часа суток: там, где обычно
 *   отвечают медленнее (ночь, рабочие часы), пауза должна быть длиннее.
 * • Реакции хранят время → это метка «прочитано». Реакция без ответа
 *   в течение 30 минут — «прочитал(а) и промолчал(а)».
 */

type Tp = (ts: number) => TimeParts;
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const inNight = (h: number) => h >= 20 || h < 13;
const minuteOf = (tp: Tp, ts: number) => tp(ts).h * 60 + Math.floor((ts % 3600) / 60);

/** Множитель порога паузы для каждого часа суток. */
export function hourFactors(events: Msg[], tp: Tp): number[] {
  const by: number[][] = Array.from({ length: 24 }, () => []);
  const all: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const g = events[i].ts - events[i - 1].ts;
    if (events[i].from === events[i - 1].from || g <= 0 || g > 3600) continue;
    by[tp(events[i].ts).h].push(g);
    all.push(g);
  }
  const base = median(all);
  if (!Number.isFinite(base) || base <= 0) return new Array(24).fill(1);
  const raw = by.map((a) => (a.length >= 30 ? median(a) / base : 1));
  return raw.map((_, h) => {
    const v = (raw[(h + 23) % 24] + 2 * raw[h] + raw[(h + 1) % 24]) / 4;
    return Math.min(2, Math.max(0.6, v));
  });
}

/** Логические дни: граница — середина самой длинной ночной паузы каждой ночи. */
export function dayBoundaries(events: Msg[], tp: Tp, fallback: (ts: number) => number): (ts: number) => number {
  const best = new Map<number, { gap: number; mid: number }>();
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].ts - events[i - 1].ts;
    if (gap < 1800) continue;
    const mid = events[i - 1].ts + gap / 2;
    if (!inNight(tp(mid).h)) continue;
    const night = tp(mid - 12 * 3600).dayKey;
    const b = best.get(night);
    if (!b || gap > b.gap) best.set(night, { gap, mid });
  }
  const bounds = [...best.values()].map((b) => b.mid).sort((a, b) => a - b);
  if (bounds.length < 5) return fallback;
  const base = fallback(events[0]?.ts ?? 0);
  return (ts: number) => {
    let lo = 0;
    let hi = bounds.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (bounds[m] <= ts) lo = m + 1;
      else hi = m;
    }
    return base + lo;
  };
}

export interface SleepStats {
  key: string;
  nights: number;
  /** медианное время отбоя / подъёма, «ЧЧ:ММ» */
  sleep: string;
  wake: string;
  /** медианная длительность ночной паузы, часы */
  hours: number;
  /** доля ночей, когда этот человек написал утром раньше остальных */
  wakesFirst: number;
}

const fmtMin = (m: number) => {
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

export function sleepByPerson(events: Msg[], keys: string[], tp: Tp): SleepStats[] {
  const wakeByNight = new Map<number, Map<string, number>>();
  const res: SleepStats[] = [];
  for (const key of keys) {
    const ts = events.filter((e) => e.from === key).map((e) => e.ts);
    const best = new Map<number, { gap: number; a: number; b: number }>();
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      if (gap < 3 * 3600 || gap > 20 * 3600) continue;
      const mid = ts[i - 1] + gap / 2;
      if (!inNight(tp(mid).h)) continue;
      const night = tp(mid - 12 * 3600).dayKey;
      const b = best.get(night);
      if (!b || gap > b.gap) best.set(night, { gap, a: ts[i - 1], b: ts[i] });
    }
    // минуты относительно 18:00, чтобы полночь не «рвала» медиану
    const rel = (m: number) => (m - 18 * 60 + 1440) % 1440;
    const sl: number[] = [];
    const wk: number[] = [];
    const hrs: number[] = [];
    for (const [night, b] of best) {
      sl.push(rel(minuteOf(tp, b.a)));
      wk.push(rel(minuteOf(tp, b.b)));
      hrs.push(b.gap / 3600);
      if (!wakeByNight.has(night)) wakeByNight.set(night, new Map());
      wakeByNight.get(night)!.set(key, b.b);
    }
    res.push({ key, nights: best.size, sleep: best.size ? fmtMin(median(sl) + 18 * 60) : '—', wake: best.size ? fmtMin(median(wk) + 18 * 60) : '—', hours: median(hrs), wakesFirst: 0 });
  }
  let both = 0;
  const first = new Map<string, number>();
  for (const m of wakeByNight.values()) {
    if (m.size < 2) continue;
    both++;
    const k = [...m.entries()].sort((a, b) => a[1] - b[1])[0][0];
    first.set(k, (first.get(k) ?? 0) + 1);
  }
  for (const r of res) r.wakesFirst = both ? (first.get(r.key) ?? 0) / both : 0;
  return res;
}

export interface ReadStats {
  key: string;
  /** реакций с известным временем, поставленных этим человеком */
  reactions: number;
  /** медиана: через сколько после сообщения поставлена реакция (сек) */
  latency: number;
  /** реакция есть, а ответа в течение 30 минут нет */
  silentReads: number;
}

export function readReceipts(events: Msg[], keys: string[]): ReadStats[] {
  const byKey = new Map(keys.map((k) => [k, { lat: [] as number[], silent: 0 }]));
  // времена сообщений каждого участника — для поиска «ответил ли после реакции»
  const own = new Map(keys.map((k) => [k, events.filter((e) => e.from === k).map((e) => e.ts)]));
  const hasMsgIn = (arr: number[], a: number, b: number) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (arr[m] < a) lo = m + 1;
      else hi = m;
    }
    return lo < arr.length && arr[lo] <= b;
  };
  for (const m of events) {
    for (const r of m.reactions ?? []) {
      r.from.forEach((who, i) => {
        const d = r.dates?.[i];
        const s = byKey.get(who);
        if (!s || !d || who === m.from) return;
        const lat = d - m.ts;
        if (lat < 0 || lat > 7 * 86400) return;
        s.lat.push(lat);
        if (!hasMsgIn(own.get(who) ?? [], d - 60, d + 1800)) s.silent++;
      });
    }
  }
  return keys.map((key) => {
    const s = byKey.get(key)!;
    return { key, reactions: s.lat.length, latency: median(s.lat), silentReads: s.silent };
  });
}
