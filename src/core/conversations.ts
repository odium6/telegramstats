import type { Msg } from './types';
import { CHECKIN_RE, DELAY_RE, GREETING_RE } from './text';

/* ───────────────────────── Кто начинает разговор ─────────────────────────
 *
 * 1. Порог разрыва диалога T определяется по самой переписке: распределение
 *    log10(пауз между сообщениями) почти всегда бимодально — короткие паузы
 *    внутри разговора и длинные между разговорами. На него подгоняется смесь
 *    двух нормальных распределений (EM-алгоритм); T — точка, где апостериорные
 *    вероятности компонент равны. Качество разделения — коэффициент Ашмана D.
 *
 * 2. Сообщение после паузы > T — кандидат в начало разговора. Но «первым после
 *    паузы» бывает и тот, кто просто отвечает на вчерашний вопрос. Поэтому
 *    каждому кандидату считается вероятность p того, что это действительно
 *    инициатива, по признакам контекста:
 *      + длина паузы относительно T;
 *      + приветствие («привет», «доброе утро»…), вопрос о делах («как ты?»);
 *      + человек пишет повторно, хотя его прошлое сообщение осталось без ответа;
 *      − это ответ (reply) на сообщение собеседника из прошлого разговора;
 *      − прошлый разговор закончился вопросом собеседника, а здесь нет приветствия;
 *      − извинение за задержку («сорри, был занят»).
 *    Пауза < 2.5·T без приветствия/звонка считается паузой внутри того же
 *    разговора — такие фрагменты склеиваются.
 *    Инициатива делится: открывший получает p, «альтернативный» инициатор
 *    (автор последнего неотвеченного сообщения) получает 1 − p.
 *
 * 3. Погрешность доли инициатив складывается из:
 *      • неопределённости классификации  Σ p(1−p) / N²;
 *      • статистической ошибки выборки   S(1−S) / N;
 *      • чувствительности к порогу       |S(T·0.5) − S(T·2)| / 2.
 *    Итог — 95 % интервал «± п.п.».
 */

export interface Conversation {
  start: number; // индекс первого события в массиве events
  end: number; // индекс последнего события (включительно)
  startTs: number;
  endTs: number;
  count: number;
  opener: string;
  firstId: number;
  gapBefore: number;
  responded: boolean;
  firstReplySec?: number;
  p: number;
  alt?: string;
  reasons: string[];
  ender: string;
  participants: string[];
  /** ключ логического дня (с учётом «ночного провала» активности) */
  day: number;
  /** сколько коротких пауз было склеено внутрь разговора */
  merged?: number;
}

export interface GapModel {
  T: number;
  auto: boolean;
  mu1: number;
  mu2: number;
  sd1: number;
  sd2: number;
  w1: number;
  separation: number; // коэффициент Ашмана D (>2 — компоненты хорошо разделены)
  quality: 'high' | 'medium' | 'low';
  histogram: { x: number; count: number }[]; // log10-гистограмма пауз
}

const MIN_T = 15 * 60;
const MAX_T = 6 * 3600;

function normPdf(x: number, mu: number, sd: number) {
  const z = (x - mu) / sd;
  return Math.exp(-0.5 * z * z) / (sd * 2.5066282746);
}

export function estimateGap(events: Msg[]): GapModel {
  const logs: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const g = events[i].ts - events[i - 1].ts;
    if (g >= 1) logs.push(Math.log10(g));
  }
  const histogram: { x: number; count: number }[] = [];
  for (let b = 0; b <= 70; b++) histogram.push({ x: b / 10, count: 0 });
  for (const l of logs) histogram[Math.min(70, Math.max(0, Math.round(l * 10)))].count++;

  const fallback = (q: GapModel['quality']): GapModel => ({ T: 3600, auto: true, mu1: 1.5, mu2: 4.3, sd1: 0.6, sd2: 0.6, w1: 0.85, separation: 0, quality: q, histogram });
  if (logs.length < 40) return fallback('low');

  const sorted = [...logs].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  let mu1 = q(0.35);
  let mu2 = Math.max(q(0.96), mu1 + 1.5);
  let sd1 = 0.5;
  let sd2 = 0.5;
  let w1 = 0.85;
  const n = logs.length;
  const r1 = new Float64Array(n);
  for (let it = 0; it < 80; it++) {
    let s1 = 0;
    for (let i = 0; i < n; i++) {
      const a = w1 * normPdf(logs[i], mu1, sd1);
      const b = (1 - w1) * normPdf(logs[i], mu2, sd2);
      r1[i] = a + b > 0 ? a / (a + b) : logs[i] < (mu1 + mu2) / 2 ? 1 : 0;
      s1 += r1[i];
    }
    const s2 = n - s1;
    if (s1 < 2 || s2 < 2) break;
    let m1 = 0;
    let m2 = 0;
    for (let i = 0; i < n; i++) {
      m1 += r1[i] * logs[i];
      m2 += (1 - r1[i]) * logs[i];
    }
    m1 /= s1;
    m2 /= s2;
    let v1 = 0;
    let v2 = 0;
    for (let i = 0; i < n; i++) {
      v1 += r1[i] * (logs[i] - m1) ** 2;
      v2 += (1 - r1[i]) * (logs[i] - m2) ** 2;
    }
    const nsd1 = Math.max(0.15, Math.sqrt(v1 / s1));
    const nsd2 = Math.max(0.15, Math.sqrt(v2 / s2));
    const conv = Math.abs(m1 - mu1) + Math.abs(m2 - mu2) < 1e-5;
    mu1 = m1; mu2 = m2; sd1 = nsd1; sd2 = nsd2; w1 = s1 / n;
    if (conv) break;
  }
  if (mu1 > mu2) {
    [mu1, mu2] = [mu2, mu1];
    [sd1, sd2] = [sd2, sd1];
    w1 = 1 - w1;
  }
  const separation = (Math.SQRT2 * Math.abs(mu2 - mu1)) / Math.sqrt(sd1 * sd1 + sd2 * sd2);
  let x = mu1;
  for (; x < mu2; x += 0.005) {
    if ((1 - w1) * normPdf(x, mu2, sd2) >= w1 * normPdf(x, mu1, sd1)) break;
  }
  if (separation < 1.2 || !Number.isFinite(x)) return { ...fallback('low'), mu1, mu2, sd1, sd2, w1, separation };
  const T = Math.min(MAX_T, Math.max(MIN_T, 10 ** x));
  return { T, auto: true, mu1, mu2, sd1, sd2, w1, separation, quality: separation > 2.2 ? 'high' : 'medium', histogram };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** dayOf(ts) — номер логического дня. */
export function segment(events: Msg[], T: number, dayOf: (ts: number) => number): Conversation[] {
  const convs: Conversation[] = [];
  const out: Conversation[] = [];
  if (!events.length) return convs;
  const idIndex = new Map<number, number>();
  events.forEach((e, i) => idIndex.set(e.id, i));

  let s = 0;
  const flush = (e: number) => {
    const opener = events[s].from;
    const parts = new Set<string>();
    let firstReply: number | undefined;
    for (let i = s; i <= e; i++) {
      parts.add(events[i].from);
      if (firstReply === undefined && events[i].from !== opener) firstReply = events[i].ts - events[s].ts;
    }
    convs.push({
      start: s,
      end: e,
      startTs: events[s].ts,
      endTs: events[e].ts,
      count: e - s + 1,
      opener,
      firstId: events[s].id,
      gapBefore: s > 0 ? events[s].ts - events[s - 1].ts : Infinity,
      responded: firstReply !== undefined,
      firstReplySec: firstReply,
      p: 1,
      reasons: [],
      ender: events[e].from,
      participants: [...parts],
      day: dayOf(events[s].ts),
    });
  };
  for (let i = 1; i < events.length; i++) {
    if (events[i].ts - events[i - 1].ts > T) {
      flush(i - 1);
      s = i;
    }
  }
  flush(events.length - 1);

  // оценка инициативы (и склейка «продолжений» с предыдущим разговором)
  for (let ci = 0; ci < convs.length; ci++) {
    const c = convs[ci];
    if (ci === 0) {
      c.p = 0.85;
      c.reasons.push('Начало сохранённой истории — что было до неё, неизвестно');
      out.push(c);
      continue;
    }
    const prev = out[out.length - 1];
    // открывающий блок: сообщения открывшего до первой реплики собеседника
    let openText = '';
    let replyTarget: Msg | undefined;
    for (let i = c.start; i <= c.end && i < c.start + 8; i++) {
      const e = events[i];
      if (e.from !== c.opener) break;
      openText += ' ' + e.text;
      if (e.kind === 'call') openText += ' [звонок]';
      if (replyTarget === undefined && e.replyTo !== undefined) {
        const ti = idIndex.get(e.replyTo);
        if (ti !== undefined && ti < c.start) replyTarget = events[ti];
      }
    }
    // последний блок прошлого разговора
    const lastPrev = events[prev.end];
    let prevBlock = '';
    for (let i = prev.end; i >= prev.start && events[i].from === lastPrev.from; i--) prevBlock = events[i].text + ' ' + prevBlock;

    const r = c.gapBefore / T;
    let z = 0.6 + Math.min(2, 0.9 * Math.log2(Math.max(1, r)));
    const greet = GREETING_RE.test(openText);
    const checkin = CHECKIN_RE.test(openText);
    const delay = DELAY_RE.test(openText);
    const isCall = events[c.start].kind === 'call';

    // Пауза чуть больше порога без приветствия/звонка — это пауза внутри
    // того же разговора, а не новый разговор: склеиваем.
    if (r < 2.5 && !greet && !checkin && !isCall) {
      prev.end = c.end;
      prev.endTs = c.endTs;
      prev.count += c.count;
      prev.ender = c.ender;
      prev.merged = (prev.merged ?? 0) + 1;
      for (const k of c.participants) if (!prev.participants.includes(k)) prev.participants.push(k);
      if (!prev.responded) {
        for (let i = prev.start; i <= prev.end; i++) {
          if (events[i].from !== prev.opener) {
            prev.responded = true;
            prev.firstReplySec = events[i].ts - prev.startTs;
            break;
          }
        }
      }
      continue;
    }

    c.reasons.push(`Пауза перед разговором ${fmt(c.gapBefore)} (порог ${fmt(T)})`);
    if (greet) { z += 1.6; c.reasons.push('Приветствие в первом сообщении'); }
    if (checkin) { z += 1.3; c.reasons.push('Вопрос о делах / интерес к собеседнику'); }
    if (isCall) { z += 0.8; c.reasons.push('Разговор начался со звонка'); }
    if (/\?/.test(openText) && !delay && !replyTarget) { z += 0.4; c.reasons.push('Открывающее сообщение — вопрос'); }
    if (c.gapBefore >= 5 * 3600) z += 0.3;

    if (lastPrev.from === c.opener) {
      z += 1.0;
      c.reasons.push('Пишет снова, хотя прошлое сообщение было его/её');
    } else {
      c.alt = lastPrev.from;
      if (replyTarget && replyTarget.from !== c.opener) {
        z -= 2.4;
        c.reasons.push('Это ответ (reply) на сообщение собеседника из прошлого разговора');
      }
      if (/\?/.test(prevBlock) && !greet && !checkin) {
        z -= 1.4;
        c.reasons.push('Прошлый разговор закончился вопросом собеседника — похоже на отложенный ответ');
      }
      if (delay) {
        z -= 1.6;
        c.reasons.push('Извинение за задержку — это продолжение, а не новый разговор');
      }
    }
    if (replyTarget && replyTarget.from === c.opener) z += 0.3;
    c.p = sigmoid(z);
    out.push(c);
  }
  return out;
}

function fmt(sec: number) {
  if (!Number.isFinite(sec)) return '—';
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1).replace('.0', '')} ч`;
  return `${(sec / 86400).toFixed(1).replace('.0', '')} дн`;
}

export interface InitiatorShare {
  key: string;
  weighted: number; // взвешенное число инициатив (только разговоры с ответом)
  raw: number; // «наивно»: просто первым после паузы
  attempts: number; // начал, но ответа не было
  share: number; // 0..1
  margin: number; // 0..1, 95 % интервал
  dayFirst: number;
  dayFirstShare: number;
  dayFirstNaive: number; // наивный «первый после полуночи»
  ended: number; // кто закончил разговор (последнее слово)
}

export function attribute(convs: Conversation[], keys: string[]) {
  const w = new Map<string, number>(keys.map((k) => [k, 0]));
  const raw = new Map<string, number>(keys.map((k) => [k, 0]));
  const varClass = new Map<string, number>(keys.map((k) => [k, 0]));
  let N = 0;
  for (const c of convs) {
    if (!c.responded) continue;
    N++;
    raw.set(c.opener, (raw.get(c.opener) ?? 0) + 1);
    if (c.alt && c.alt !== c.opener) {
      w.set(c.opener, (w.get(c.opener) ?? 0) + c.p);
      w.set(c.alt, (w.get(c.alt) ?? 0) + (1 - c.p));
      const v = c.p * (1 - c.p);
      varClass.set(c.opener, (varClass.get(c.opener) ?? 0) + v);
      varClass.set(c.alt, (varClass.get(c.alt) ?? 0) + v);
    } else {
      w.set(c.opener, (w.get(c.opener) ?? 0) + 1);
    }
  }
  return { w, raw, varClass, N };
}

export function sharesOf(convs: Conversation[], keys: string[]): Map<string, number> {
  const { w, N } = attribute(convs, keys);
  return new Map(keys.map((k) => [k, N ? (w.get(k) ?? 0) / N : 0]));
}
