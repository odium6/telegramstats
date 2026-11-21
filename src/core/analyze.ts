import type { AnalysisOptions, Chat, Msg, MsgKind } from './types';
import { makeTz, monthKey, monthKeyToIso, dayKeyToIso, fmtDuration } from './time';
import {
  FAREWELL_RE, LAUGH_RE, isCheckin, isGreeting, LOVE_RE, SAD_RE, SMILE_RE, STOPWORDS, SWEAR_RE,
  domainOf, emojis, sentiment, tokenize,
} from './text';
import { attribute, estimateGap, segment, sharesOf, type Conversation, type GapModel } from './conversations';

export type Pair = [string, number];

export interface ResponseStats {
  n: number;
  median: number;
  mean: number;
  p90: number;
  fast: number; // доля ответов быстрее минуты
}

export interface PersonStats {
  key: string;
  name: string;
  idx: number; // индекс цвета (серии)
  messages: number;
  words: number;
  chars: number;
  avgWords: number;
  avgChars: number;
  avgWordLen: number;
  kinds: Partial<Record<MsgKind, number>>;
  media: number;
  questions: number;
  exclaims: number;
  emojis: number;
  laughs: number;
  loves: number;
  swears: number;
  smiles: number;
  sads: number;
  links: number;
  edited: number;
  forwarded: number;
  repliesMade: number;
  repliesReceived: number;
  reactionsGiven: number;
  reactionsReceived: number;
  voiceSec: number;
  roundSec: number;
  callsMade: number;
  callSec: number;
  longest: { id: number; words: number; text: string } | null;
  firstTs: number;
  lastTs: number;
  activeDays: number;
  nightShare: number;
  weekendShare: number;
  greetings: number;
  morning: number;
  goodnight: number;
  checkins: number;
  doubleTexts: number;
  maxRun: number;
  avgRun: number;
  uniqueWords: number;
  richness: number;
  caps: number;
  sentiment: number; // средняя тональность сообщений с оценкой (−1..1)
  topWords: Pair[];
  topEmojis: Pair[];
  topPhrases: Pair[];
  response: ResponseStats;
  delayedAnswers: number;
  unansweredQuestions: number;
  engagement: number; // индекс вовлечённости, доли (сумма = 1)
}

export interface SeriesInfo {
  key: string;
  name: string;
  idx: number;
}

export interface TimeSeries {
  keys: string[];
  values: number[][]; // [серия][точка]
}

export interface AccuracyItem {
  name: string;
  value: string;
  error: number | null; // проценты
  level: 'exact' | 'high' | 'medium' | 'low';
  note: string;
}

export interface ConvLite {
  startTs: number;
  endTs: number;
  count: number;
  firstId: number;
  opener: string;
  alt?: string;
  p: number;
  responded: boolean;
  firstReplySec?: number;
  gapBefore: number;
  reasons: string[];
}

export interface InitiatorRow {
  key: string;
  weighted: number;
  raw: number;
  attempts: number;
  share: number;
  naiveShare: number;
  margin: number;
  dayFirst: number;
  dayFirstShare: number;
  dayFirstNaiveShare: number;
  ended: number;
  endedShare: number;
  checkinShare: number;
}

export interface Analysis {
  chatName: string;
  chatType: string;
  source: Chat['source'];
  isGroup: boolean;
  series: SeriesInfo[];
  people: PersonStats[];
  range: { start: number; end: number; days: number; activeDays: number };
  totals: {
    messages: number; words: number; chars: number; media: number; service: number; edited: number;
    forwarded: number; replies: number; reactions: number; links: number; questions: number; calls: number;
    callSec: number; voiceSec: number; emojis: number; stickers: number; perDay: number; perActiveDay: number;
  };
  daily: TimeSeries;
  weekly: TimeSeries;
  monthly: TimeSeries;
  hourWeek: number[][]; // [день недели][час]
  hourWeekBy: number[][][]; // [серия][день недели][час]
  hours: number[][]; // [серия][24]
  weekdays: number[][]; // [серия][7]
  monthsOfYear: number[][]; // [серия][12]
  yearly: TimeSeries;
  calendar: [string, number][];
  topDays: { date: string; total: number; by: number[] }[];
  streaks: {
    longestActive: { from: string; to: string; days: number };
    longestSilence: { from: string; to: string; sec: number };
    current: number;
  };
  words: { cloud: Pair[]; top: Pair[] };
  emojiTop: Pair[];
  reactionTop: Pair[];
  reactionMatrix: number[][]; // [кто поставил][кому]
  stickers: { key: string; count: number; emoji?: string; path?: string; thumb?: string }[];
  domains: Pair[];
  hashtags: Pair[];
  mentions: Pair[];
  forwards: Pair[];
  kinds: Pair[];
  lengthHist: { labels: string[]; values: number[][] };
  responseHist: { labels: string[]; values: number[][] };
  responseByHour: (number | null)[][];
  responseMonthly: TimeSeries;
  wordsMonthly: TimeSeries;
  sentimentMonthly: TimeSeries;
  sentimentCoverage: number;
  calls: { count: number; totalSec: number; longest: number; missed: number; byPerson: number[]; monthly: TimeSeries };
  replyMatrix: number[][];
  services: Pair[];
  conv: {
    gap: GapModel;
    T: number;
    count: number;
    responded: number;
    attempts: number;
    avgLen: number;
    medianDuration: number;
    longest: ConvLite | null;
    rows: InitiatorRow[];
    margin: number;
    confidence: number;
    ambiguous: number;
    sensitivity: { label: string; T: number; shares: number[] }[];
    sleepHour: number;
    monthly: TimeSeries;
    openingsByHour: number[][];
    durationHist: { labels: string[]; values: number[] };
    list: ConvLite[];
  };
  accuracy: { overall: number; items: AccuracyItem[] };
  facts: { icon: string; text: string }[];
  warnings: string[];
}

const MAX_SERIES = 8;

function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = Float64Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(a: number[], q: number): number {
  if (!a.length) return NaN;
  const s = Float64Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
const inc = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) ?? 0) + v);
const top = (m: Map<string, number>, n: number): Pair[] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const zeros = (n: number) => new Array<number>(n).fill(0);

const KIND_LABEL: Record<string, string> = {
  text: 'Текст', photo: 'Фото', video: 'Видео', round: 'Кружки', voice: 'Голосовые', audio: 'Музыка', sticker: 'Стикеры',
  gif: 'GIF', file: 'Файлы', location: 'Геопозиция', live_location: 'Трансляция геопозиции', venue: 'Места', contact: 'Контакты',
  poll: 'Опросы', call: 'Звонки', game: 'Игры', invoice: 'Счета', todo: 'Списки задач', giveaway: 'Розыгрыши', other: 'Другое',
};
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

const LEN_BINS = [1, 2, 3, 5, 10, 20, 50, Infinity];
const LEN_LABELS = ['1', '2', '3', '4–5', '6–10', '11–20', '21–50', '50+'];
const RESP_BINS = [10, 30, 60, 300, 900, 3600, Infinity];
const RESP_LABELS = ['<10 с', '10–30 с', '30 с–1 мин', '1–5 мин', '5–15 мин', '15–60 мин', '> 1 ч'];

export function analyze(chat: Chat, opts: AnalysisOptions): Analysis {
  const tp = makeTz(opts.tz);
  const from = opts.from ?? -Infinity;
  const to = opts.to ?? Infinity;
  const allowed = opts.people?.length ? new Set(opts.people) : null;
  const msgs = chat.messages.filter((m) => m.ts >= from && m.ts <= to && (!allowed || allowed.has(m.from) || (m.service && m.kind !== 'call')));

  // ── серии (участники с цветами) ──
  const counts = new Map<string, number>();
  for (const m of msgs) if ((!m.service || m.kind === 'call') && m.from) inc(counts, m.from);
  const order = chat.participants.filter((p) => counts.has(p.key)).sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0));
  const colorIdx = new Map(chat.participants.map((p, i) => [p.key, i]));
  const overflow = order.length > MAX_SERIES;
  const seriesPeople = overflow ? order.slice(0, MAX_SERIES - 1) : order;
  const series: SeriesInfo[] = seriesPeople.map((p) => ({ key: p.key, name: p.name, idx: Math.min(colorIdx.get(p.key) ?? 0, MAX_SERIES - 1) }));
  if (overflow) series.push({ key: '__other', name: 'Остальные', idx: -1 });
  const S = series.length;
  const sIndex = new Map<string, number>();
  series.forEach((s, i) => sIndex.set(s.key, i));
  const sOf = (key: string) => sIndex.get(key) ?? (overflow ? S - 1 : 0);
  const nameOf = new Map(chat.participants.map((p) => [p.key, p.name]));
  const isGroup = order.length > 2 || /group|channel/.test(chat.type);

  const events = msgs.filter((m) => (!m.service || m.kind === 'call') && m.from);
  const firstTs = events[0]?.ts ?? msgs[0]?.ts ?? 0;
  const lastTs = events[events.length - 1]?.ts ?? firstTs;
  const firstDay = tp(firstTs).dayKey;
  const lastDay = tp(lastTs).dayKey;
  const nDays = Math.max(1, lastDay - firstDay + 1);

  // ── накопители ──
  const daily = Array.from({ length: S }, () => zeros(nDays));
  const hourWeek = Array.from({ length: 7 }, () => zeros(24));
  const hourWeekBy = Array.from({ length: S }, () => Array.from({ length: 7 }, () => zeros(24)));
  const hours = Array.from({ length: S }, () => zeros(24));
  const weekdays = Array.from({ length: S }, () => zeros(7));
  const monthsOfYear = Array.from({ length: S }, () => zeros(12));
  const firstMonth = monthKey(tp(firstTs));
  const nMonths = Math.max(1, monthKey(tp(lastTs)) - firstMonth + 1);
  const monthly = Array.from({ length: S }, () => zeros(nMonths));
  const wordsMonthly = Array.from({ length: S }, () => zeros(nMonths));
  const sentSum = Array.from({ length: S }, () => zeros(nMonths));
  const sentN = Array.from({ length: S }, () => zeros(nMonths));
  const callsMonthly = [zeros(nMonths)];
  const lengthHist = Array.from({ length: S }, () => zeros(LEN_BINS.length));

  const words = new Map<string, number>();
  const emo = new Map<string, number>();
  const reacts = new Map<string, number>();
  const stickers = new Map<string, { key: string; count: number; emoji?: string; path?: string; thumb?: string }>();
  const domains = new Map<string, number>();
  const hashtags = new Map<string, number>();
  const mentions = new Map<string, number>();
  const forwards = new Map<string, number>();
  const kinds = new Map<string, number>();
  const services = new Map<string, number>();
  const reactionMatrix = Array.from({ length: S }, () => zeros(S));
  const replyMatrix = Array.from({ length: S }, () => zeros(S));

  interface Acc {
    ps: PersonStats;
    words: Map<string, number>;
    emo: Map<string, number>;
    phrases: Map<string, number>;
    days: Set<number>;
    night: number;
    weekend: number;
    wordLetters: number;
    sentSum: number;
    sentN: number;
    resp: number[];
    respHour: number[][];
    respMonthSum: number[];
    respMonthN: number[];
    runs: number[];
  }
  const acc = new Map<string, Acc>();
  const personOf = (key: string): Acc => {
    let a = acc.get(key);
    if (!a) {
      a = {
        ps: {
          key, name: nameOf.get(key) ?? key, idx: series[sOf(key)]?.idx ?? -1,
          messages: 0, words: 0, chars: 0, avgWords: 0, avgChars: 0, avgWordLen: 0, kinds: {}, media: 0, questions: 0, exclaims: 0,
          emojis: 0, laughs: 0, loves: 0, swears: 0, smiles: 0, sads: 0, links: 0, edited: 0, forwarded: 0, repliesMade: 0,
          repliesReceived: 0, reactionsGiven: 0, reactionsReceived: 0, voiceSec: 0, roundSec: 0, callsMade: 0, callSec: 0,
          longest: null, firstTs: Infinity, lastTs: 0, activeDays: 0, nightShare: 0, weekendShare: 0, greetings: 0, morning: 0,
          goodnight: 0, checkins: 0, doubleTexts: 0, maxRun: 0, avgRun: 0, uniqueWords: 0, richness: 0, caps: 0, sentiment: 0,
          topWords: [], topEmojis: [], topPhrases: [], response: { n: 0, median: NaN, mean: NaN, p90: NaN, fast: 0 },
          delayedAnswers: 0, unansweredQuestions: 0, engagement: 0,
        },
        words: new Map(), emo: new Map(), phrases: new Map(), days: new Set(), night: 0, weekend: 0, wordLetters: 0,
        sentSum: 0, sentN: 0, resp: [], respHour: Array.from({ length: 24 }, () => []), respMonthSum: zeros(nMonths),
        respMonthN: zeros(nMonths), runs: [],
      };
      acc.set(key, a);
    }
    return a;
  };

  const byId = new Map<number, Msg>();
  for (const m of msgs) byId.set(m.id, m);

  let tot = { messages: 0, words: 0, chars: 0, media: 0, service: 0, edited: 0, forwarded: 0, replies: 0, reactions: 0, links: 0, questions: 0, calls: 0, callSec: 0, voiceSec: 0, emojis: 0, stickers: 0 };
  let callLongest = 0;
  let callMissed = 0;
  const callsBy = zeros(S);
  let sentimentHits = 0;
  let textMsgs = 0;
  let reactRecent = 0;
  let reactTotal = 0;

  for (const m of msgs) {
    if (m.service && m.kind !== 'call') {
      tot.service++;
      if (m.action) inc(services, m.action);
      continue;
    }
    if (!m.from) continue;
    const p = tp(m.ts);
    const si = sOf(m.from);
    const a = personOf(m.from);
    const ps = a.ps;
    const mi = monthKey(p) - firstMonth;
    a.days.add(p.dayKey);
    if (m.ts < ps.firstTs) ps.firstTs = m.ts;
    if (m.ts > ps.lastTs) ps.lastTs = m.ts;
    ps.kinds[m.kind] = (ps.kinds[m.kind] ?? 0) + 1;
    inc(kinds, m.kind);

    if (m.kind === 'call') {
      tot.calls++;
      const d = m.call?.duration ?? 0;
      tot.callSec += d;
      ps.callsMade++;
      ps.callSec += d;
      callsBy[si]++;
      callLongest = Math.max(callLongest, d);
      if (m.call?.reason === 'missed' || m.call?.reason === 'busy') callMissed++;
      callsMonthly[0][mi]++;
      continue;
    }

    tot.messages++;
    ps.messages++;
    daily[si][p.dayKey - firstDay]++;
    hourWeek[p.dow][p.h]++;
    hourWeekBy[si][p.dow][p.h]++;
    hours[si][p.h]++;
    weekdays[si][p.dow]++;
    monthsOfYear[si][p.mo]++;
    monthly[si][mi]++;
    if (p.h < 6) a.night++;
    if (p.dow >= 5) a.weekend++;

    if (m.media || (m.kind !== 'text')) {
      if (m.kind !== 'text') {
        tot.media++;
        ps.media++;
      }
    }
    if (m.kind === 'voice') { const d = m.media?.duration ?? 0; ps.voiceSec += d; tot.voiceSec += d; }
    if (m.kind === 'round') ps.roundSec += m.media?.duration ?? 0;
    if (m.kind === 'sticker') {
      tot.stickers++;
      const key = m.media?.path || m.media?.emoji || '?';
      const st = stickers.get(key) ?? { key, count: 0, emoji: m.media?.emoji, path: m.media?.path, thumb: m.media?.thumb };
      st.count++;
      stickers.set(key, st);
    }
    if (m.edited) { tot.edited++; ps.edited++; }
    if (m.fwd) { tot.forwarded++; ps.forwarded++; inc(forwards, m.fwd); }
    if (m.replyTo !== undefined) {
      tot.replies++;
      ps.repliesMade++;
      const target = byId.get(m.replyTo);
      if (target && target.from && !target.service) {
        personOf(target.from).ps.repliesReceived++;
        replyMatrix[si][sOf(target.from)]++;
      }
    }
    if (m.reactions) {
      for (const r of m.reactions) {
        tot.reactions += r.count;
        reactTotal += r.count;
        reactRecent += r.from.length;
        inc(reacts, r.emoji, r.count);
        ps.reactionsReceived += r.count;
        for (const f of r.from) {
          if (!f) continue;
          const giver = acc.get(f) ?? (nameOf.has(f) ? personOf(f) : null);
          if (giver) giver.ps.reactionsGiven++;
          if (sIndex.has(f) || overflow) reactionMatrix[sOf(f)][si]++;
        }
      }
    }
    for (const l of m.links ?? []) {
      tot.links++;
      ps.links++;
      const d = domainOf(l);
      if (d) inc(domains, d);
    }
    for (const h of m.hashtags ?? []) inc(hashtags, h);
    for (const h of m.mentions ?? []) inc(mentions, h);

    const text = m.text;
    if (!text) continue;
    textMsgs++;
    const toks = tokenize(text);
    const em = emojis(text);
    ps.words += toks.length;
    ps.chars += text.length;
    tot.words += toks.length;
    tot.chars += text.length;
    wordsMonthly[si][mi] += toks.length;
    let bin = 0;
    while (toks.length > LEN_BINS[bin]) bin++;
    if (toks.length) lengthHist[si][bin]++;
    if (!ps.longest || toks.length > ps.longest.words) ps.longest = { id: m.id, words: toks.length, text: text.slice(0, 400) };
    if (text.includes('?')) { ps.questions++; tot.questions++; }
    if (text.includes('!')) ps.exclaims++;
    if (em.length) {
      ps.emojis += em.length;
      tot.emojis += em.length;
      for (const e of em) { inc(emo, e); inc(a.emo, e); }
    }
    if (LAUGH_RE.test(text)) ps.laughs++;
    if (LOVE_RE.test(text)) ps.loves++;
    if (SWEAR_RE.test(text)) ps.swears++;
    ps.smiles += (text.match(SMILE_RE) ?? []).length;
    ps.sads += (text.match(SAD_RE) ?? []).length;
    if (isGreeting(text)) {
      ps.greetings++;
      if (/(добр\p{L}* утр|утречк|доброутр|good morning|morning|gm|добрий ранок|доброго ранку)/iu.test(text)) ps.morning++;
    }
    if (FAREWELL_RE.test(text) && /(ноч|снов|night|gn|добраніч)/iu.test(text)) ps.goodnight++;
    if (isCheckin(text)) ps.checkins++;
    const letters = text.replace(/[^\p{L}]/gu, '');
    if (letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) ps.caps++;
    let prevTok = '';
    for (const t of toks) {
      a.wordLetters += t.length;
      inc(a.words, t);
      if (t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t)) {
        inc(words, t);
        if (prevTok) inc(a.phrases, prevTok + ' ' + t);
        prevTok = t;
      } else prevTok = '';
    }
    const s = sentiment(toks, em);
    if (s.hits) {
      sentimentHits++;
      const v = Math.max(-1, Math.min(1, s.score / Math.max(1, s.hits)));
      a.sentSum += v;
      a.sentN++;
      sentSum[si][mi] += v;
      sentN[si][mi]++;
    }
  }

  // ── разговоры и ответы ──
  const hourTotals = zeros(24);
  for (let h = 0; h < 24; h++) for (let d = 0; d < 7; d++) hourTotals[h] += hourWeek[d][h];
  let sleepHour = 5;
  {
    let best = Infinity;
    for (let h = 0; h < 24; h++) {
      const v = hourTotals[(h + 23) % 24] + 2 * hourTotals[h] + hourTotals[(h + 1) % 24];
      if (v < best) { best = v; sleepHour = h; }
    }
  }
  const dayOf = (ts: number) => tp(ts - sleepHour * 3600).dayKey;

  const gap = estimateGap(events);
  const T = opts.gapOverride ?? gap.T;
  if (opts.gapOverride) gap.auto = false;
  const convs = segment(events, T, dayOf);
  const peopleKeys = order.map((p) => p.key);

  // ответы, двойные сообщения, серии
  let run = 1;
  for (let i = 1; i < events.length; i++) {
    const e = events[i];
    const pr = events[i - 1];
    const g = e.ts - pr.ts;
    const a = personOf(e.from);
    if (e.from !== pr.from) {
      personOf(pr.from).runs.push(run);
      run = 1;
      if (g <= T) {
        a.resp.push(g);
        const p = tp(e.ts);
        a.respHour[p.h].push(g);
        const mi = monthKey(p) - firstMonth;
        a.respMonthSum[mi] += g;
        a.respMonthN[mi]++;
      }
    } else {
      if (g <= T) run++;
      else { personOf(pr.from).runs.push(run); run = 1; }
      if (g > 600) a.ps.doubleTexts++;
    }
  }
  if (events.length) personOf(events[events.length - 1].from).runs.push(run);

  // кто оставил без ответа и отложенные ответы
  for (let ci = 0; ci < convs.length; ci++) {
    const c = convs[ci];
    const last = events[c.end];
    if (last.text.includes('?') && ci + 1 < convs.length && convs[ci + 1].opener === last.from) personOf(last.from).ps.unansweredQuestions++;
    if (c.alt && c.p < 0.5) personOf(c.opener).ps.delayedAnswers++;
  }

  const att = attribute(convs, peopleKeys);
  const N = att.N;
  const rows: InitiatorRow[] = [];
  const attempts = new Map<string, number>();
  const ended = new Map<string, number>();
  for (const c of convs) {
    if (!c.responded) inc(attempts, c.opener);
    else inc(ended, c.ender);
  }
  // первый контакт за логический день
  const dayFirst = new Map<string, number>();
  const dayFirstNaive = new Map<string, number>();
  let nDayFirst = 0;
  {
    let lastDayKey = NaN;
    for (const c of convs) {
      if (c.day === lastDayKey) continue;
      lastDayKey = c.day;
      nDayFirst++;
      if (c.alt && c.alt !== c.opener) {
        inc(dayFirst, c.opener, c.p);
        inc(dayFirst, c.alt, 1 - c.p);
      } else inc(dayFirst, c.opener, 1);
    }
    let lastCal = NaN;
    for (const e of events) {
      const k = tp(e.ts).dayKey;
      if (k !== lastCal) { lastCal = k; inc(dayFirstNaive, e.from); }
    }
  }
  const nNaiveDays = [...dayFirstNaive.values()].reduce((s, v) => s + v, 0);

  // чувствительность к порогу
  const sens = [0.5, 1, 2].map((f) => {
    const cs = f === 1 ? convs : segment(events, T * f, dayOf);
    const sh = sharesOf(cs, peopleKeys);
    return { label: f === 1 ? 'T' : f < 1 ? 'T × 0.5' : 'T × 2', T: T * f, shares: peopleKeys.map((k) => sh.get(k) ?? 0) };
  });
  const totalCheckins = [...acc.values()].reduce((s, a) => s + a.ps.checkins, 0);
  const endedTotal = [...ended.values()].reduce((s, v) => s + v, 0);
  peopleKeys.forEach((k, i) => {
    const share = N ? (att.w.get(k) ?? 0) / N : 0;
    const vc = N ? (att.varClass.get(k) ?? 0) / (N * N) : 0;
    const vs = N ? (share * (1 - share)) / N : 0;
    const shs = sens.map((s) => s.shares[i]);
    const delta = Math.max(...shs) - Math.min(...shs);
    rows.push({
      key: k,
      weighted: att.w.get(k) ?? 0,
      raw: att.raw.get(k) ?? 0,
      attempts: attempts.get(k) ?? 0,
      share,
      naiveShare: N ? (att.raw.get(k) ?? 0) / N : 0,
      margin: Math.min(1, 1.96 * Math.sqrt(vc + vs) + delta / 2),
      dayFirst: dayFirst.get(k) ?? 0,
      dayFirstShare: nDayFirst ? (dayFirst.get(k) ?? 0) / nDayFirst : 0,
      dayFirstNaiveShare: nNaiveDays ? (dayFirstNaive.get(k) ?? 0) / nNaiveDays : 0,
      ended: ended.get(k) ?? 0,
      endedShare: endedTotal ? (ended.get(k) ?? 0) / endedTotal : 0,
      checkinShare: totalCheckins ? (acc.get(k)?.ps.checkins ?? 0) / totalCheckins : 0,
    });
  });
  const responded = convs.filter((c) => c.responded);
  const withAlt = responded.filter((c) => c.alt);
  const confidence = responded.length
    ? responded.reduce((s, c) => s + (c.alt ? Math.max(c.p, 1 - c.p) : Math.max(c.p, 0.9)), 0) / responded.length
    : 0;
  const ambiguous = withAlt.filter((c) => c.p > 0.35 && c.p < 0.65).length;
  const topRows = [...rows].sort((a, b) => b.share - a.share).slice(0, 2);
  const convMargin = topRows.length ? Math.max(...topRows.map((r) => r.margin)) : 0;

  const convMonthly = Array.from({ length: S }, () => zeros(nMonths));
  const openingsByHour = Array.from({ length: S }, () => zeros(24));
  for (const c of responded) {
    const p = tp(c.startTs);
    const mi = monthKey(p) - firstMonth;
    if (c.alt && c.alt !== c.opener) {
      convMonthly[sOf(c.opener)][mi] += c.p;
      convMonthly[sOf(c.alt)][mi] += 1 - c.p;
    } else convMonthly[sOf(c.opener)][mi] += 1;
    openingsByHour[sOf(c.opener)][p.h]++;
  }
  const DUR_BINS = [60, 300, 900, 1800, 3600, 7200, 14400, Infinity];
  const DUR_LABELS = ['< 1 мин', '1–5 мин', '5–15 мин', '15–30 мин', '30–60 мин', '1–2 ч', '2–4 ч', '> 4 ч'];
  const durationHist = zeros(DUR_BINS.length);
  const durs: number[] = [];
  for (const c of responded) {
    const d = c.endTs - c.startTs;
    durs.push(d);
    let b = 0;
    while (d >= DUR_BINS[b]) b++;
    durationHist[b]++;
  }
  const lite = (c: Conversation): ConvLite => ({
    startTs: c.startTs, endTs: c.endTs, count: c.count, firstId: c.firstId, opener: c.opener, alt: c.alt, p: c.p,
    responded: c.responded, firstReplySec: c.firstReplySec, gapBefore: c.gapBefore, reasons: c.reasons,
  });
  let longestConv: Conversation | null = null;
  for (const c of responded) if (!longestConv || c.count > longestConv.count) longestConv = c;

  // ── финализация участников ──
  const people: PersonStats[] = [];
  const respHist = Array.from({ length: S }, () => zeros(RESP_BINS.length));
  const responseByHour: (number | null)[][] = Array.from({ length: S }, () => new Array(24).fill(null));
  const responseMonthly = Array.from({ length: S }, () => new Array<number>(nMonths).fill(NaN));
  const hourBuckets = Array.from({ length: S }, () => Array.from({ length: 24 }, () => [] as number[]));
  for (const [key, a] of acc) {
    const ps = a.ps;
    if (!ps.messages && !ps.callsMade) continue;
    const si = sOf(key);
    ps.avgWords = ps.messages ? ps.words / ps.messages : 0;
    ps.avgChars = ps.messages ? ps.chars / ps.messages : 0;
    ps.avgWordLen = ps.words ? a.wordLetters / ps.words : 0;
    ps.activeDays = a.days.size;
    ps.nightShare = ps.messages ? a.night / ps.messages : 0;
    ps.weekendShare = ps.messages ? a.weekend / ps.messages : 0;
    ps.maxRun = a.runs.length ? Math.max(...a.runs) : 0;
    ps.avgRun = a.runs.length ? a.runs.reduce((s, v) => s + v, 0) / a.runs.length : 0;
    ps.uniqueWords = a.words.size;
    ps.richness = ps.words ? a.words.size / Math.sqrt(ps.words) : 0;
    ps.sentiment = a.sentN ? a.sentSum / a.sentN : 0;
    ps.topWords = top(new Map([...a.words].filter(([w]) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))), 30);
    ps.topEmojis = top(a.emo, 20);
    ps.topPhrases = top(new Map([...a.phrases].filter(([, c]) => c >= 3)), 15);
    const r = a.resp;
    ps.response = {
      n: r.length,
      median: median(r),
      mean: r.length ? r.reduce((s, v) => s + v, 0) / r.length : NaN,
      p90: quantile(r, 0.9),
      fast: r.length ? r.filter((v) => v < 60).length / r.length : 0,
    };
    for (const v of r) {
      let b = 0;
      while (v >= RESP_BINS[b]) b++;
      respHist[si][b]++;
    }
    for (let h = 0; h < 24; h++) hourBuckets[si][h].push(...a.respHour[h]);
    for (let mi = 0; mi < nMonths; mi++) {
      if (a.respMonthN[mi] >= 3 && si < S && (series[si].key === key || !overflow)) responseMonthly[si][mi] = a.respMonthSum[mi] / a.respMonthN[mi] / 60;
    }
    people.push(ps);
  }
  for (let si = 0; si < S; si++) for (let h = 0; h < 24; h++) {
    const b = hourBuckets[si][h];
    responseByHour[si][h] = b.length >= 3 ? median(b) / 60 : null;
  }
  people.sort((a, b) => b.messages - a.messages);

  // индекс вовлечённости
  {
    const rowBy = new Map(rows.map((r) => [r.key, r]));
    const msgTotal = people.reduce((s, p) => s + p.messages, 0) || 1;
    const speed = people.map((p) => (Number.isFinite(p.response.median) ? 1 / (1 + p.response.median / 60) : 0));
    const speedTotal = speed.reduce((s, v) => s + v, 0) || 1;
    const chkTotal = people.reduce((s, p) => s + p.checkins + p.questions * 0.2, 0) || 1;
    const raw = people.map((p, i) =>
      0.35 * (rowBy.get(p.key)?.share ?? 0) + 0.25 * (speed[i] / speedTotal) + 0.2 * (p.messages / msgTotal) + 0.2 * ((p.checkins + p.questions * 0.2) / chkTotal),
    );
    const rs = raw.reduce((s, v) => s + v, 0) || 1;
    people.forEach((p, i) => (p.engagement = raw[i] / rs));
  }

  // ── временные ряды ──
  const dayKeys = Array.from({ length: nDays }, (_, i) => dayKeyToIso(firstDay + i));
  const monthKeys = Array.from({ length: nMonths }, (_, i) => monthKeyToIso(firstMonth + i));
  const firstWeek = firstDay - tp(firstTs).dow;
  const nWeeks = Math.ceil((lastDay - firstWeek + 1) / 7);
  const weekly = Array.from({ length: S }, () => zeros(nWeeks));
  for (let si = 0; si < S; si++) for (let d = 0; d < nDays; d++) weekly[si][Math.floor((firstDay + d - firstWeek) / 7)] += daily[si][d];
  const weekKeys = Array.from({ length: nWeeks }, (_, i) => dayKeyToIso(firstWeek + i * 7));
  const firstYear = tp(firstTs).y;
  const nYears = tp(lastTs).y - firstYear + 1;
  const yearly = Array.from({ length: S }, () => zeros(nYears));
  for (let si = 0; si < S; si++) for (let mi = 0; mi < nMonths; mi++) yearly[si][Math.floor((firstMonth + mi) / 12) - firstYear] += monthly[si][mi];

  const dayTotals = zeros(nDays);
  for (let si = 0; si < S; si++) for (let d = 0; d < nDays; d++) dayTotals[d] += daily[si][d];
  const calendar: [string, number][] = dayKeys.map((k, i) => [k, dayTotals[i]]);
  const topDays = dayTotals
    .map((t, i) => ({ date: dayKeys[i], total: t, by: daily.map((s) => s[i]) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const activeDays = dayTotals.filter((v) => v > 0).length;

  // серии активности и молчания
  let bestRun = { from: 0, to: 0, days: 0 };
  let cur = 0;
  for (let d = 0; d < nDays; d++) {
    if (dayTotals[d] > 0) {
      cur++;
      if (cur > bestRun.days) bestRun = { from: d - cur + 1, to: d, days: cur };
    } else cur = 0;
  }
  let silence = { from: firstTs, to: firstTs, sec: 0 };
  for (let i = 1; i < events.length; i++) {
    const g = events[i].ts - events[i - 1].ts;
    if (g > silence.sec) silence = { from: events[i - 1].ts, to: events[i].ts, sec: g };
  }
  const iso = (ts: number) => dayKeyToIso(tp(ts).dayKey);

  // тональность по месяцам
  const sentimentMonthly = sentSum.map((row, si) => row.map((v, mi) => (sentN[si][mi] >= 5 ? v / sentN[si][mi] : NaN)));

  // ── точность ──
  const items: AccuracyItem[] = [];
  items.push({ name: 'Количество сообщений, медиа, звонков', value: 'точный подсчёт', error: 0, level: 'exact', note: 'Считается напрямую по файлу экспорта. Удалённые до экспорта сообщения в файл не попадают и не учитываются.' });
  items.push({ name: 'Слова и символы', value: '±1%', error: 1, level: 'high', note: 'Слова выделяются по буквенным последовательностям Unicode; ссылки, числа и смайлы-скобки дают небольшую погрешность.' });
  items.push(
    chat.tzExact
      ? { name: 'Время суток, дни недели', value: 'точно', error: 0, level: 'exact', note: `Метки времени содержат часовой пояс. Показаны в зоне: ${opts.tz === 'local' ? 'браузера' : `UTC${opts.tz >= 0 ? '+' : ''}${opts.tz / 60}`}.` }
      : { name: 'Время суток, дни недели', value: '±1–3 ч', error: 8, level: 'medium', note: 'В экспорте нет часового пояса — время могло сместиться. Укажите пояс вручную в настройках.' },
  );
  items.push({
    name: 'Кто начинает разговор',
    value: `±${(convMargin * 100).toFixed(1)} п.п.`,
    error: convMargin * 100,
    level: convMargin < 0.05 ? 'high' : convMargin < 0.12 ? 'medium' : 'low',
    note: `95% интервал: неопределённость классификации ${N} разговоров (средняя уверенность ${(confidence * 100).toFixed(0)}%), статистическая ошибка и чувствительность к порогу паузы (${fmtDuration(T)}). Разделение «внутри/между разговорами»: ${gap.quality === 'high' ? 'чёткое' : gap.quality === 'medium' ? 'умеренное' : 'слабое — порог по умолчанию'}.`,
  });
  {
    const meds = [0.5, 2].map((f) => {
      const arr: number[] = [];
      for (let i = 1; i < events.length; i++) if (events[i].from !== events[i - 1].from && events[i].ts - events[i - 1].ts <= T * f) arr.push(events[i].ts - events[i - 1].ts);
      return median(arr);
    });
    const all: number[] = [];
    for (const a of acc.values()) all.push(...a.resp);
    const base = median(all);
    const err = Number.isFinite(base) && base > 0 ? (Math.max(...meds.map((m) => Math.abs(m - base))) / base) * 100 : null;
    items.push({ name: 'Время ответа (медиана)', value: err === null ? '—' : `±${err.toFixed(0)}%`, error: err, level: err === null ? 'low' : err < 10 ? 'high' : err < 30 ? 'medium' : 'low', note: 'Ответом считается сообщение другого участника в пределах одного разговора. Погрешность — изменение медианы при пороге паузы ×0.5 и ×2.' });
  }
  {
    const cov = textMsgs ? sentimentHits / textMsgs : 0;
    const err = Math.round(Math.min(60, Math.max(20, 65 - cov * 80)));
    items.push({ name: 'Тональность', value: `±${err}%`, error: err, level: 'low', note: `Словарный метод: оценено ${(cov * 100).toFixed(0)}% текстовых сообщений. Сарказм, ирония и контекст не распознаются — используйте как ориентир.` });
  }
  if (reactTotal) {
    const cov = reactRecent / reactTotal;
    items.push({ name: 'Кто ставил реакции', value: `${(cov * 100).toFixed(0)}% известно`, error: (1 - cov) * 100, level: cov > 0.95 ? 'high' : cov > 0.7 ? 'medium' : 'low', note: 'Telegram сохраняет авторов только «последних» реакций; общее число реакций точное.' });
  }
  if (chat.mediaRefs) {
    const miss = chat.mediaMissing / chat.mediaRefs;
    items.push({ name: 'Медиафайлы в экспорте', value: `${((1 - miss) * 100).toFixed(0)}% выгружено`, error: miss * 100, level: miss < 0.05 ? 'high' : miss < 0.3 ? 'medium' : 'low', note: 'Статистика медиа точная, но просмотр доступен только для выгруженных файлов (зависит от настроек экспорта).' });
  }
  if (/supergroup|channel/.test(chat.type)) {
    let gaps = 0;
    const ids = chat.messages.map((m) => m.id).sort((a, b) => a - b);
    for (let i = 1; i < ids.length; i++) gaps += Math.max(0, ids[i] - ids[i - 1] - 1);
    const share = gaps / (ids.length + gaps || 1);
    items.push({ name: 'Удалённые сообщения (оценка)', value: `~${gaps}`, error: share * 100, level: share < 0.05 ? 'high' : 'medium', note: 'В супергруппах ID сообщений последовательны — пропуски означают удалённые сообщения.' });
  }
  if (chat.source === 'html') items.push({ name: 'Формат HTML', value: 'ограничен', error: 5, level: 'medium', note: 'Нет ID участников и отметок редактирования; одноимённые участники сливаются. Для точности используйте JSON.' });
  const weights = items.map((i) => (i.name.startsWith('Тональность') ? 0.5 : 1));
  const overall = items.reduce((s, it, i) => s + weights[i] * (100 - Math.min(100, it.error ?? 50)), 0) / weights.reduce((s, v) => s + v, 0);

  // ── интересные факты ──
  const facts: { icon: string; text: string }[] = [];
  const nm = (k: string) => nameOf.get(k) ?? k;
  if (people.length >= 2) {
    const [a, b] = people;
    facts.push({ icon: '💬', text: `${a.name} написал(а) на ${(((a.messages - b.messages) / Math.max(1, b.messages)) * 100).toFixed(0)}% больше сообщений, чем ${b.name}.` });
    const fastest = [...people].filter((p) => p.response.n > 20).sort((x, y) => x.response.median - y.response.median)[0];
    if (fastest) facts.push({ icon: '⚡', text: `Быстрее всех отвечает ${fastest.name}: медиана ${fmtDuration(fastest.response.median)}.` });
    const talk = [...people].sort((x, y) => y.avgWords - x.avgWords)[0];
    facts.push({ icon: '📝', text: `Самые длинные сообщения у ${talk.name} — в среднем ${talk.avgWords.toFixed(1)} слова.` });
    const owl = [...people].filter((p) => p.messages > 50).sort((x, y) => y.nightShare - x.nightShare)[0];
    if (owl && owl.nightShare > 0.03) facts.push({ icon: '🦉', text: `Главная сова — ${owl.name}: ${(owl.nightShare * 100).toFixed(0)}% сообщений с 0:00 до 6:00.` });
    const chk = [...people].sort((x, y) => y.checkins - x.checkins)[0];
    if (chk.checkins) facts.push({ icon: '🤗', text: `Чаще интересуется делами ${chk.name} — ${chk.checkins} раз(а) спросил(а) «как ты/как дела».` });
  }
  const leader = [...rows].sort((a, b) => b.share - a.share)[0];
  if (leader && N > 5) facts.push({ icon: '🚀', text: `Разговоры чаще начинает ${nm(leader.key)} — ${(leader.share * 100).toFixed(0)}% ± ${(leader.margin * 100).toFixed(0)} п.п.` });
  if (topDays[0]?.total) facts.push({ icon: '🔥', text: `Самый активный день — ${new Date(topDays[0].date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}: ${topDays[0].total} сообщений.` });
  if (bestRun.days > 1) facts.push({ icon: '📅', text: `Самая длинная серия — ${bestRun.days} дней подряд без перерыва.` });
  if (silence.sec > 86400 * 2) facts.push({ icon: '🤫', text: `Самое долгое молчание — ${fmtDuration(silence.sec)} (с ${iso(silence.from)} по ${iso(silence.to)}).` });
  if (tot.voiceSec > 60) facts.push({ icon: '🎙️', text: `Голосовых наговорено на ${fmtDuration(tot.voiceSec)}.` });
  if (tot.callSec > 60) facts.push({ icon: '📞', text: `В звонках проведено ${fmtDuration(tot.callSec)}, самый долгий — ${fmtDuration(callLongest)}.` });
  const topEmoji = top(emo, 1)[0];
  if (topEmoji) facts.push({ icon: topEmoji[0], text: `Любимый эмодзи переписки встречается ${topEmoji[1]} раз.` });
  const topWord = top(words, 1)[0];
  if (topWord) facts.push({ icon: '🔤', text: `Самое частое значимое слово — «${topWord[0]}» (${topWord[1]} раз).` });

  const warnings = [...chat.warnings];
  if (gap.quality === 'low') warnings.push('Мало данных для автоматического порога паузы — использовано 60 минут. Его можно изменить в настройках.');

  return {
    chatName: chat.name,
    chatType: chat.type,
    source: chat.source,
    isGroup,
    series,
    people,
    range: { start: firstTs, end: lastTs, days: nDays, activeDays },
    totals: { ...tot, perDay: tot.messages / nDays, perActiveDay: activeDays ? tot.messages / activeDays : 0 },
    daily: { keys: dayKeys, values: daily },
    weekly: { keys: weekKeys, values: weekly },
    monthly: { keys: monthKeys, values: monthly },
    yearly: { keys: Array.from({ length: nYears }, (_, i) => String(firstYear + i)), values: yearly },
    hourWeek,
    hourWeekBy,
    hours,
    weekdays,
    monthsOfYear,
    calendar,
    topDays,
    streaks: {
      longestActive: { from: dayKeys[bestRun.from] ?? '', to: dayKeys[bestRun.to] ?? '', days: bestRun.days },
      longestSilence: { from: iso(silence.from), to: iso(silence.to), sec: silence.sec },
      current: Math.floor(Date.now() / 1000) - lastTs,
    },
    words: { cloud: top(words, 150), top: top(words, 50) },
    emojiTop: top(emo, 40),
    reactionTop: top(reacts, 20),
    reactionMatrix,
    stickers: [...stickers.values()].sort((a, b) => b.count - a.count).slice(0, 30),
    domains: top(domains, 20),
    hashtags: top(hashtags, 20),
    mentions: top(mentions, 20),
    forwards: top(forwards, 15),
    kinds: top(kinds, 30).map(([k, v]) => [k, v] as Pair),
    lengthHist: { labels: LEN_LABELS, values: lengthHist },
    responseHist: { labels: RESP_LABELS, values: respHist },
    responseByHour,
    responseMonthly: { keys: monthKeys, values: responseMonthly },
    wordsMonthly: { keys: monthKeys, values: wordsMonthly },
    sentimentMonthly: { keys: monthKeys, values: sentimentMonthly },
    sentimentCoverage: textMsgs ? sentimentHits / textMsgs : 0,
    calls: { count: tot.calls, totalSec: tot.callSec, longest: callLongest, missed: callMissed, byPerson: callsBy, monthly: { keys: monthKeys, values: callsMonthly } },
    replyMatrix,
    services: top(services, 20),
    conv: {
      gap,
      T,
      count: convs.length,
      responded: responded.length,
      attempts: convs.length - responded.length,
      avgLen: responded.length ? responded.reduce((s, c) => s + c.count, 0) / responded.length : 0,
      medianDuration: median(durs),
      longest: longestConv ? lite(longestConv) : null,
      rows,
      margin: convMargin,
      confidence,
      ambiguous,
      sensitivity: sens,
      sleepHour,
      monthly: { keys: monthKeys, values: convMonthly },
      openingsByHour,
      durationHist: { labels: DUR_LABELS, values: durationHist },
      list: convs.map(lite),
    },
    accuracy: { overall, items },
    facts,
    warnings,
  };
}
