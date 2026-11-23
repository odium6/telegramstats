import type { Msg } from './types';
import { checkinCandidate, clauses, core, STOPWORDS, type LearnedVocab } from './text';
import { calibrate, dot, sigmoid, type ModelReport } from './calibrate';

/* ───────────── «Как дела» с учётом контекста ─────────────
 *
 * Одна и та же фраза значит разное: «чд» — это «что делаешь?», но «и чд» в
 * споре — «и что теперь делать?», а «кд 10 на 10» — игровой K/D. Человек
 * понимает разницу по тому, что ответил собеседник. Алгоритм делает так же:
 *
 *   1. Априорная вероятность по самой фразе (checkinCandidate).
 *   2. Признаки ответа собеседника (первые реплики в течение 20 мин):
 *      состояние / занятие / место / короткий ответ / только смех /
 *      встречный «а ты?» / медиа в ответ / непонимание / нет ответа.
 *   3. p = σ(w·x + b). Базовые веса w₀ подобраны вручную; ответы
 *      пользователя «верно / неверно» дообучают их (calibrate.ts).
 *   4. Словарь пополняется из самой переписки (learnVocab): обращения пары и
 *      фразы, на которые собеседник обычно отвечает о делах.
 */

export const CHECKIN_FEATURES = [
  'Априорная оценка фразы',
  'Ответ о самочувствии',
  'Ответ о занятии',
  'Ответ о месте / компании',
  'Короткий ответ по существу',
  'В ответ только смех',
  'Встречный вопрос «а ты?»',
  'В ответ кружок/голосовое/фото',
  'Собеседник не понял вопроса',
  'Ответа не было',
] as const;
export const CHECKIN_W0 = [1, 1.4, 1.2, 0.9, 0.4, -0.4, 0.8, 0.3, -0.8, 0, 0];

export interface CheckinHit {
  id: number;
  ts: number;
  from: string;
  p: number;
  phrase: string;
  text: string;
  answer?: string;
  evidence: string[];
  /** ответ пользователя, если он проверял этот случай */
  label?: 0 | 1;
  learned?: boolean;
}

export interface CheckinResult {
  hits: CheckinHit[];
  /** спорные случаи (засчитанные и нет) — для режима проверки */
  review: CheckinHit[];
  model: ModelReport;
  vocab: { address: string[]; phrases: { phrase: string; prior: number; n: number; rate: number }[] };
}

const STATE = /^((да|ну|все|всё|вроде|пока|а|я|мне|у меня) )*(норм\p{L}*|нормас|хорошо|хорошоу|хорошая|отлично|пойдет|пойдёт|неплохо|так себе|плохо|супер|прекрасно|замечательно|лучше всех|жив(ая|ой|а)?|ок|окей|устал\p{L}*|грустно|скучно|болею|болит\p{L}*|спать хочу|хочу спать|никак|обычно|нормальн\p{L}*|потихоньку|тихонько|сойдет|сойдёт)(?![\p{L}])/iu;
const ACTIVITY =
  /^((я|мы|да|ну|а|просто|щас|сейчас|пока|тока|только|уже|вот|ещё|еще|зай|зая|все|всё|тоже) )*(ничего|ниче|ничо|нечего|ниче такого|сижу|лежу|сплю|ем|еду|иду|жду|\p{L}{2,}(ю|юсь|ую|аю|яю|ею|уюсь|аюсь|у|усь|ем|им)|\p{L}{2,}(ал|ала|али|ял|яла|ел|ела|ил|ила|ыл|ыла|ла|ли|лся|лась))(?![\p{L}])/iu;
const PLACE = /^((я|мы|да|ну|а|щас|сейчас|пока|уже) )*(в|во|на|у|с|со|из|по|дома|домой|в дороге|на работе|на паре|в зале|в метро|в машине)(?![\p{L}])/iu;
const COUNTER = /(^|[^\p{L}])(а ты|а вы|ты как|а у тебя|сам как|сама как|а ты чд|а ты кд|а ты что|а ты че|и ты)(?![\p{L}])/iu;
const CONFUSED = /^(чего|что|чо|че|чё|в смысле|всмысле|а|м|ммм|\?+|что\?|чего\?|в плане)[?!.]*$/iu;
const LAUGH_ONLY = /^([хx]+[аaыеэ]+|[аa]+[хx]+|ах|хах|хв|хс|пх|сх|[хвапсщж]){2,}[)!.]*$/iu;

const logit = (p: number) => Math.log(p / (1 - p));

export type ReplyKind = 'state' | 'activity' | 'place' | 'short' | 'laugh' | 'confused' | null;

export function classifyReply(text: string): ReplyKind {
  const t = text.trim().toLowerCase().replace(/ё/g, 'е');
  if (!t) return null;
  if (CONFUSED.test(t)) return 'confused';
  if (STATE.test(t)) return 'state';
  if (ACTIVITY.test(t)) return 'activity';
  if (PLACE.test(t)) return 'place';
  if (LAUGH_ONLY.test(t.replace(/\s/g, ''))) return 'laugh';
  if (t.split(/\s+/).length <= 2 && !t.includes('?') && /\p{L}{2,}/u.test(t)) return 'short';
  return null;
}

const RANK: Record<string, number> = { state: 5, activity: 4, place: 3, short: 2, laugh: 1 };

/** Признаки ответа собеседника → часть вектора x (индексы 1–9). */
function replyFeatures(replies: Msg[]): { x: number[]; answer?: string } {
  let best: ReplyKind = null;
  let answer: string | undefined;
  let counter = false;
  let confused = false;
  let media = false;
  for (const r of replies) {
    if (!r.text.trim()) {
      if (['round', 'voice', 'photo', 'video'].includes(r.kind)) media = true;
      continue;
    }
    answer ??= r.text.slice(0, 80);
    if (COUNTER.test(r.text.toLowerCase())) counter = true;
    const k = classifyReply(r.text);
    if (k === 'confused') { confused = true; continue; }
    if (k && (!best || RANK[k] > RANK[best])) best = k;
  }
  const weak = !best || best === 'laugh';
  return {
    x: [
      best === 'state' ? 1 : 0,
      best === 'activity' ? 1 : 0,
      best === 'place' ? 1 : 0,
      best === 'short' ? 1 : 0,
      best === 'laugh' ? 1 : 0,
      counter ? 1 : 0,
      media && weak ? 1 : 0,
      confused && weak ? 1 : 0,
      replies.length ? 0 : 1,
    ],
    answer,
  };
}

function repliesOf(events: Msg[], i: number): Msg[] {
  const m = events[i];
  const out: Msg[] = [];
  for (let j = i + 1; j < events.length && out.length < 3; j++) {
    const r = events[j];
    if (r.ts - m.ts > 1200) break;
    if (r.from !== m.from) out.push(r);
  }
  return out;
}

/* ───────────── Словарь из самой переписки ───────────── */

const NOT_ADDRESS = new Set([
  ...STOPWORDS,
  ...('да нет ок окей ага угу хорошо ладно лан понял поняла ясно спасибо спс привет пока ахах ахаха хах хаха ой блин блять бля капец жесть что чего чо че где когда почему зачем кто как ну ммм эээ ааа ооо люблю целую обнимаю скучаю спокойной доброе утро ночи щас сейчас иду еду дома кд чд ' +
    'ого ахереть ахринеть ахренеть афигеть офигеть абалдеть обалдеть нифига нихера хера хз писец пиздец пипец писос капец жесть реально наверное точно круто класс ' +
    'пожалуйста бл смотри сегодня завтра фу типо кстати долго похер пофиг понимаешь прикинь извини прости прикольно красиво мило умничка умница молодец согласен согласна ' +
    'серьезно вообще короче слушай стоп подожди погоди давай ладненько отлично супер ура эх мда ммм аа оо мама папа вопрос сильно очень чево чиво'
  ).split(' '),
]);

/** Выучить можно только фразы о собеседнике и его делах/состоянии. */
const LEARNABLE = /(^| )(ты|вы|сам|сама)( |$).*|делаешь|делаете|занят|занята|поживаешь|чувствуешь|себя|самочувствие|настроение|спалось|день|там/u;
/** …но не вопросы о мнении, знании, причинах и выяснение отношений. */
const NOT_LEARNABLE = /(думаешь|знаешь|знала|знал|понимаешь|понял|поняла|любишь|почему|зачем|про |про$|случилось|скажи|пиши|нет$|что ли|чего|какой|какая|какое|какие|кто|сколько|куда|откуда|^ты что$|^ты че$|^что ты$|^это)/u;

/** Учит обращения и фразы-вопросы о делах по самой переписке. */
export function learnVocab(events: Msg[]): { vocab: LearnedVocab; report: CheckinResult['vocab'] } {
  // 1) обращения: слово, которое часто пишут отдельным сообщением, чтобы позвать
  //    собеседника, и сразу продолжают писать («Зай» → «ты где»)
  const solo = new Map<string, { n: number; cont: number }>();
  for (let i = 0; i < events.length; i++) {
    const t = events[i].text.trim().toLowerCase().replace(/ё/g, 'е');
    if (!/^[\p{L}]{2,15}[)!?.]*$/u.test(t)) continue;
    const w = t.replace(/[^\p{L}]/gu, '');
    const kind = classifyReply(w);
    if (NOT_ADDRESS.has(w) || (kind && kind !== 'short')) continue;
    const s = solo.get(w) ?? { n: 0, cont: 0 };
    s.n++;
    const nx = events[i + 1];
    if (nx && nx.from === events[i].from && nx.ts - events[i].ts < 120) s.cont++;
    solo.set(w, s);
  }
  // …и которое встречается в позиции обращения: «доброе утро, зай», «люблю тебя леся»,
  // «зай, ты где». Междометия («ого», «капец») так не употребляются.
  const vocative = new Map<string, number>();
  const AFTER = /(доброе утро|доброй ночи|спокойной ночи|сладких снов|привет|люблю тебя|целую|обнимаю|скучаю|спасибо|умничка|моя|мой|милая|милый)[\s,]+(\p{L}{2,15})[\s!.)❤️💋]*$/u;
  const BEFORE = /^(\p{L}{2,15}),?\s+(ты (где|как|тут|там|спишь|дома|чд|кд|занят|занята)|а ты|я тебя люблю|люблю тебя|как дела|как ты|чд|кд|доброе утро|спокойной ночи)([\s?!.,]|$)/u;
  for (const e of events) {
    const t = e.text.toLowerCase().replace(/ё/g, 'е');
    if (!t || t.length > 120) continue;
    const a = AFTER.exec(t)?.[2];
    const b = BEFORE.exec(t)?.[1];
    for (const w of [a, b]) if (w) vocative.set(w, (vocative.get(w) ?? 0) + 1);
  }
  const address = [...solo.entries()]
    .filter(([w, s]) => s.n >= 5 && s.cont / s.n >= 0.45 && (vocative.get(w) ?? 0) >= 3)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 40)
    .map(([w]) => w);
  const addressSet = new Set(address);

  // 2) фразы: короткая реплика, на которую собеседник обычно отвечает
  //    о самочувствии или занятии, — вопрос о делах, даже если её нет в словаре
  const stats = new Map<string, { n: number; ok: number; q: number }>();
  for (let i = 0; i < events.length; i++) {
    const m = events[i];
    if (!m.text || m.text.length > 60) continue;
    const cl = clauses(m.text);
    if (cl.length !== 1 || cl[0].words.length > 5) continue;
    const s = core(cl[0].words, addressSet);
    if (!s || s.split(' ').length > 4 || checkinCandidate(m.text, { address: addressSet, phrases: new Map() })) continue;
    if (!/(^| )(ты|вы|тебя|тебе|у тебя|сам|сама)( |$)/u.test(s) && !cl[0].q) continue;
    const st = stats.get(s) ?? { n: 0, ok: 0, q: 0 };
    st.n++;
    if (cl[0].q) st.q++;
    const k = repliesOf(events, i).map((r) => classifyReply(r.text));
    if (k.includes('state') || k.includes('activity')) st.ok++;
    stats.set(s, st);
  }
  // Фоновая доля: как часто вообще на короткие вопросы отвечают глаголом/состоянием.
  // Фраза выучивается, только если её ответы заметно «о делах» чаще фона.
  let bn = 0;
  let bok = 0;
  for (const s of stats.values()) {
    bn += s.n;
    bok += s.ok;
  }
  const base = bn ? bok / bn : 0.4;
  const phrases = [...stats.entries()]
    .map(([phrase, s]) => ({ phrase, n: s.n, rate: s.ok / s.n, prior: Math.min(0.75, Math.max(0.5, 0.25 + 0.5 * (s.ok / s.n))) }))
    .filter((p) => p.n >= 8 && p.rate >= Math.min(0.9, Math.max(0.7, base + 0.2)) && LEARNABLE.test(p.phrase) && !NOT_LEARNABLE.test(p.phrase))
    .sort((a, b) => b.n - a.n)
    .slice(0, 40);
  return {
    vocab: { address: addressSet, phrases: new Map(phrases.map((p) => [p.phrase, p.prior])) },
    report: { address, phrases },
  };
}

/* ───────────── Детектор ───────────── */

export function detectCheckins(events: Msg[], labels: Record<number, 0 | 1> = {}): CheckinResult {
  const { vocab, report } = learnVocab(events);
  interface Cand { i: number; x: number[]; phrase: string; abbr: boolean; learned?: boolean; answer?: string }
  const cands: Cand[] = [];
  for (let i = 0; i < events.length; i++) {
    const m = events[i];
    if (!m.text || m.kind === 'call') continue;
    const c = checkinCandidate(m.text, vocab);
    if (!c) continue;
    const { x, answer } = replyFeatures(repliesOf(events, i));
    cands.push({ i, x: [logit(c.prior), ...x], phrase: c.phrase, abbr: c.abbr, learned: c.learned, answer });
  }
  // калибровка по ответам пользователя
  const labeled = cands.filter((c) => labels[events[c.i].id] !== undefined);
  const model = calibrate(labeled.map((c) => c.x), labeled.map((c) => labels[events[c.i].id]), CHECKIN_W0);
  const w = model.weights;

  const hits: CheckinHit[] = [];
  const review: CheckinHit[] = [];
  const lastAsk = new Map<string, number>();
  for (const c of cands) {
    const m = events[c.i];
    const label = labels[m.id];
    const p = label !== undefined ? label : sigmoid(dot(w, c.x));
    const evidence = [
      c.learned ? `Фраза «${c.phrase}» выучена из вашей переписки` : c.abbr ? `Сокращение/разговорная форма «${c.phrase}»` : `Фраза «${c.phrase}»`,
      ...CHECKIN_FEATURES.slice(1).filter((_, k) => c.x[k + 1]),
    ];
    if (label !== undefined) evidence.push(label ? 'Подтверждено вами' : 'Отклонено вами');
    const hit: CheckinHit = { id: m.id, ts: m.ts, from: m.from, p, phrase: c.phrase, text: m.text.slice(0, 120), answer: c.answer, evidence, label, learned: c.learned };
    if (p > 0.2 && p < 0.85 && label === undefined) review.push(hit);
    if (p < 0.5) continue;
    const prev = lastAsk.get(m.from);
    lastAsk.set(m.from, m.ts);
    if (prev !== undefined && m.ts - prev < 600) continue; // «Чд» + «Кд» подряд — один вопрос
    hits.push(hit);
  }
  return { hits, review, model, vocab: report };
}
