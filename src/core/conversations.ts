import type { Msg } from './types';
import { DELAY_RE, isCheckin, isGreeting } from './text';
import { dot, sigmoid } from './calibrate';

export interface GapComp {
  mu: number;
  sd: number;
  w: number;
}

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
  /** вектор признаков (для калибровки) */
  x?: number[];
  /** ответ пользователя */
  label?: 0 | 1;
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
  /** все компоненты смеси (2 или 3), по возрастанию среднего */
  comps: GapComp[];
}

const MIN_T = 15 * 60;
const MAX_T = 6 * 3600;

function normPdf(x: number, mu: number, sd: number) {
  const z = (x - mu) / sd;
  return Math.exp(-0.5 * z * z) / (sd * 2.5066282746);
}

/* EM для смеси k нормальных распределений на log10(пауз). */
function fitGmm(xs: number[], init: number[]): { comps: GapComp[]; ll: number } {
  const k = init.length;
  const n = xs.length;
  let comps: GapComp[] = init.map((mu) => ({ mu, sd: 0.5, w: 1 / k }));
  const resp = new Float64Array(n * k);
  let ll = -Infinity;
  for (let it = 0; it < 120; it++) {
    let newLl = 0;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < k; j++) {
        const v = comps[j].w * normPdf(xs[i], comps[j].mu, comps[j].sd);
        resp[i * k + j] = v;
        sum += v;
      }
      if (sum <= 0) {
        // точка далеко от всех компонент — отдаём ближайшей
        let best = 0;
        for (let j = 1; j < k; j++) if (Math.abs(xs[i] - comps[j].mu) < Math.abs(xs[i] - comps[best].mu)) best = j;
        for (let j = 0; j < k; j++) resp[i * k + j] = j === best ? 1 : 0;
        newLl += -50;
        continue;
      }
      for (let j = 0; j < k; j++) resp[i * k + j] /= sum;
      newLl += Math.log(sum);
    }
    const next: GapComp[] = [];
    for (let j = 0; j < k; j++) {
      let sw = 0;
      let sm = 0;
      for (let i = 0; i < n; i++) { sw += resp[i * k + j]; sm += resp[i * k + j] * xs[i]; }
      if (sw < 2) return { comps, ll: -Infinity };
      const mu = sm / sw;
      let sv = 0;
      for (let i = 0; i < n; i++) sv += resp[i * k + j] * (xs[i] - mu) ** 2;
      next.push({ mu, sd: Math.max(0.12, Math.sqrt(sv / sw)), w: sw / n });
    }
    comps = next;
    if (Math.abs(newLl - ll) < 1e-6 * n) { ll = newLl; break; }
    ll = newLl;
  }
  comps.sort((a, b) => a.mu - b.mu);
  return { comps, ll };
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

  const fallback = (q: GapModel['quality']): GapModel => ({
    T: 3600, auto: true, mu1: 1.5, mu2: 4.3, sd1: 0.6, sd2: 0.6, w1: 0.85, separation: 0, quality: q, histogram,
    comps: [{ mu: 1.5, sd: 0.6, w: 0.85 }, { mu: 4.3, sd: 0.6, w: 0.15 }],
  });
  if (logs.length < 40) return fallback('low');

  // для огромных переписок модель строится по равномерной выборке — так быстрее и не менее точно
  const step = Math.max(1, Math.floor(logs.length / 60000));
  const xs = step > 1 ? logs.filter((_, i) => i % step === 0) : logs;
  const sorted = [...xs].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const n = xs.length;

  // Две группы (внутри / между разговорами) или три (очередь сообщений / паузы
  // внутри разговора / между разговорами) — выбирается по BIC. У активных пар
  // паузы часто именно трёхгорбые, и двухкомпонентная модель ставит порог слишком низко.
  const m2 = fitGmm(xs, [q(0.35), Math.max(q(0.96), q(0.35) + 1.5)]);
  const m3 = fitGmm(xs, [q(0.25), q(0.75), Math.max(q(0.97), q(0.75) + 1)]);
  const bic = (ll: number, k: number) => -2 * ll + (3 * k - 1) * Math.log(n);
  const use3 = Number.isFinite(m3.ll) && bic(m3.ll, 3) < bic(m2.ll, 2) - 10 && m3.comps[2].mu - m3.comps[1].mu > 0.7;
  const comps = use3 ? m3.comps : m2.comps;
  if (!comps.length || !Number.isFinite(use3 ? m3.ll : m2.ll)) return fallback('low');

  const hi = comps[comps.length - 1];
  const lo = comps[comps.length - 2];
  const separation = (Math.SQRT2 * Math.abs(hi.mu - lo.mu)) / Math.sqrt(lo.sd * lo.sd + hi.sd * hi.sd);
  // порог — точка, где «между разговорами» становится вероятнее всех нижних групп вместе
  let x = lo.mu;
  for (; x < hi.mu; x += 0.005) {
    let lower = 0;
    for (let j = 0; j < comps.length - 1; j++) lower += comps[j].w * normPdf(x, comps[j].mu, comps[j].sd);
    if (hi.w * normPdf(x, hi.mu, hi.sd) >= lower) break;
  }
  const wLow = 1 - hi.w;
  const base = { mu1: lo.mu, mu2: hi.mu, sd1: lo.sd, sd2: hi.sd, w1: wLow, separation, comps, histogram };
  if (separation < 1.2 || !Number.isFinite(x)) return { ...fallback('low'), ...base, T: 3600 };
  const T = Math.min(MAX_T, Math.max(MIN_T, 10 ** x));
  return { T, auto: true, quality: separation > 2.2 ? 'high' : 'medium', ...base };
}


/** Признаки начала разговора (вектор x). Веса по умолчанию — CONV_W0. */
export const CONV_FEATURES = [
  'Длина паузы',
  'Приветствие',
  'Вопрос о делах',
  'Звонок',
  'Открывающее сообщение — вопрос',
  'Пауза больше 5 часов',
  'Пишет снова, хотя прошлое сообщение было его/её',
  'Ответ (reply) на сообщение собеседника из прошлого разговора',
  'Прошлый разговор закончился вопросом собеседника',
  'Извинение за задержку',
  'Реакция на прошлое сообщение собеседника',
  'Ответ (reply) на своё старое сообщение',
] as const;
export const CONV_W0 = [1, 1.6, 1.3, 0.8, 0.4, 0.3, 1.0, -2.4, -1.4, -1.6, -3.5, 0.3, 0];

export interface SegmentOptions {
  /** вероятность «вопрос о делах» по id сообщения */
  checkinP?: Map<number, number>;
  /** множитель порога паузы по часу суток (24 значения) */
  hourFactor?: number[];
  hourOf?: (ts: number) => number;
  /** веса признаков (по умолчанию CONV_W0) */
  weights?: number[];
  /** ответы пользователя: id первого сообщения → 1 начал открывший, 0 — собеседник */
  labels?: Record<number, 0 | 1>;
}

/** dayOf(ts) — номер логического дня. */
export function segment(events: Msg[], T: number, dayOf: (ts: number) => number, o: SegmentOptions = {}): Conversation[] {
  const convs: Conversation[] = [];
  const out: Conversation[] = [];
  if (!events.length) return convs;
  const idIndex = new Map<number, number>();
  events.forEach((e, i) => idIndex.set(e.id, i));
  const w = o.weights ?? CONV_W0;
  // порог зависит от часа суток: там, где обычно отвечают медленнее, пауза длиннее
  const Tat = (ts: number) => (o.hourFactor && o.hourOf ? T * o.hourFactor[o.hourOf(ts)] : T);

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
    if (events[i].ts - events[i - 1].ts > Tat(events[i].ts)) {
      flush(i - 1);
      s = i;
    }
  }
  flush(events.length - 1);

  const mergeInto = (prev: Conversation, c: Conversation) => {
    prev.end = c.end;
    prev.endTs = c.endTs;
    prev.count += c.count;
    prev.ender = c.ender;
    prev.merged = (prev.merged ?? 0) + 1;
    for (const k of c.participants) if (!prev.participants.includes(k)) prev.participants.push(k);
  };

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
    let checkinPr = 0;
    for (let i = c.start; i <= c.end && i < c.start + 8; i++) {
      const e = events[i];
      if (e.from !== c.opener) break;
      openText += '\n' + e.text;
      checkinPr = Math.max(checkinPr, o.checkinP?.get(e.id) ?? 0);
      if (replyTarget === undefined && e.replyTo !== undefined) {
        const ti = idIndex.get(e.replyTo);
        if (ti !== undefined && ti < c.start) replyTarget = events[ti];
      }
    }
    if (!o.checkinP && isCheckin(openText)) checkinPr = 0.9;
    const lastPrev = events[prev.end];
    let prevBlock = '';
    for (let i = prev.end; i >= prev.start && events[i].from === lastPrev.from; i--) prevBlock = events[i].text + ' ' + prevBlock;

    const Tl = Tat(c.startTs);
    const r = c.gapBefore / Tl;
    const greet = isGreeting(openText);
    const checkin = checkinPr >= 0.5;
    const delay = DELAY_RE.test(openText);
    const isCall = events[c.start].kind === 'call';
    const first = events[c.start];

    // Цепочка без ответа: человек пишет снова, а прошлое осталось без ответа — одна попытка.
    if (!prev.responded && prev.opener === c.opener && c.gapBefore < 12 * 3600) {
      mergeInto(prev, c);
      if (c.responded) {
        prev.responded = true;
        prev.firstReplySec = c.startTs - prev.startTs + (c.firstReplySec ?? 0);
      }
      if (!prev.reasons.includes(CHAIN)) prev.reasons.push(CHAIN);
      continue;
    }
    // Пауза чуть больше порога без приветствия/вопроса о делах/звонка — та же беседа.
    if (r < 2.5 && !greet && !checkin && !isCall) {
      mergeInto(prev, c);
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

    const alt = lastPrev.from !== c.opener;
    if (alt) c.alt = lastPrev.from;
    const x = [
      0.6 + Math.min(2, 0.9 * Math.log2(Math.max(1, r))),
      greet ? 1 : 0,
      checkinPr,
      isCall ? 1 : 0,
      /\?/.test(openText) && !delay && !replyTarget ? 1 : 0,
      c.gapBefore >= 5 * 3600 ? 1 : 0,
      alt ? 0 : 1,
      alt && replyTarget && replyTarget.from !== c.opener ? 1 : 0,
      alt && /\?/.test(prevBlock) && !greet && !checkin ? 1 : 0,
      alt && delay ? 1 : 0,
      alt && !greet && !checkin && !isCall && c.gapBefore < 8 * 3600 && isReaction(first) ? 1 : 0,
      replyTarget && replyTarget.from === c.opener ? 1 : 0,
    ];
    c.x = x;
    c.reasons.push(`Пауза перед разговором ${fmt(c.gapBefore)} (порог в это время суток ${fmt(Tl)})`);
    for (let k = 1; k < x.length; k++) {
      if (!x[k]) continue;
      c.reasons.push(k === 2 ? `${CONV_FEATURES[k]} (уверенность ${Math.round(checkinPr * 100)}%)` : CONV_FEATURES[k]);
    }
    const label = o.labels?.[c.firstId];
    if (label !== undefined) {
      c.label = label;
      c.reasons.push(label ? 'Подтверждено вами: начал(а) открывший' : 'Отмечено вами: на самом деле начал(а) собеседник');
    }
    c.p = label !== undefined ? (alt ? label : 1) : sigmoid(dot(w, x));
    out.push(c);
  }
  return out;
}

const CHAIN = 'Несколько сообщений подряд без ответа объединены в одну попытку';
const ACK = /^(ахах\p{L}*|хах\p{L}*|хахах\p{L}*|ору|орно|жесть|капец|пипец|ого|ничего себе|нифига\p{L}*|офигеть|красиво\p{L}*|красота|класс\p{L}*|круто|прикольно|мило|миленько|умничк\p{L}*|умница|хорошо|хорошоу|хорошо\)|понял\p{L}*|поняла|ясно|понятно|ок|окей|ага|угу|да|нет|ладно|лан|лады|спасибо|спс|пон|база|согласен|согласна|точно|кайф|вау|ммм|оу|ой|блин|ееее|ееееее)[)!.?\s]*$/iu;
const LAUGH = /^([хx]+[аaыеэ]+|[аa]+[хx]+|хв|хс|пх|сх|вх|ах|хах){2,}[)!.]*$/iu;

function isReaction(m: Msg): boolean {
  if (m.kind === 'sticker' || m.kind === 'gif') return true;
  const t = m.text.trim().toLowerCase().replace(/ё/g, 'е');
  if (!t) return false;
  if (t.length <= 40 && (ACK.test(t) || LAUGH.test(t.replace(/\s/g, '')))) return true;
  // только эмодзи / скобочки
  return /^[\p{Extended_Pictographic}\uFE0F\u200D)(\s]+$/u.test(t);
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
