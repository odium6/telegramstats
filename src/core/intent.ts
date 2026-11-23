import type { Msg } from './types';
import { checkinCandidate } from './text';

/* ───────────── «Как дела» с учётом контекста ─────────────
 *
 * Одна и та же фраза значит разное: «чд» — это «что делаешь?», но «и чд» в
 * споре — «и что теперь делать?», а «кд 10 на 10» — игровой K/D. Человек
 * понимает разницу по тому, что ответил собеседник. Алгоритм делает так же:
 *
 *   1. Априорная вероятность по самой фразе (checkinCandidate): полная фраза
 *      «как дела» ≈ 0.86, сокращение «чд» ≈ 0.6, риторическое «и чд» ≈ 0.3.
 *   2. Свидетельства из ответа собеседника (первые реплики в течение 20 мин):
 *      + состояние: «норм», «хорошо», «устала», «так себе»…
 *      + занятие: глагол от первого лица — «лежу», «кушаю», «работаю», «спала»…
 *      + место/компания: «на паре», «дома», «с Глебом»…
 *      + встречный вопрос «а ты?» / «а ты чд»
 *      + кружок/голосовое/фото в ответ (часто показывают, чем заняты)
 *      − недоумение: «чего?», «в смысле?»; только смех.
 *   3. Итог p = σ(logit(prior) + Σ свидетельств); засчитывается при p ≥ 0.5.
 *      Повтор вопроса тем же человеком в течение 10 минут считается одним.
 */

export interface CheckinHit {
  id: number;
  ts: number;
  from: string;
  p: number;
  phrase: string;
  text: string;
  answer?: string;
  evidence: string[];
}

const STATE = /^((да|ну|все|всё|вроде|пока|а|я|мне|у меня) )*(норм\p{L}*|нормас|хорошо|хорошоу|хорошая|отлично|пойдет|пойдёт|неплохо|так себе|плохо|супер|прекрасно|замечательно|лучше всех|жив(ая|ой|а)?|ок|окей|устал\p{L}*|грустно|скучно|болею|болит\p{L}*|спать хочу|хочу спать|никак|обычно|нормальн\p{L}*|потихоньку|тихонько|сойдет|сойдёт)(?![\p{L}])/iu;
const ACTIVITY =
  /^((я|мы|да|ну|а|просто|щас|сейчас|пока|тока|только|уже|вот|ещё|еще|зай|зая|все|всё|тоже) )*(ничего|ниче|ничо|нечего|ниче такого|сижу|лежу|сплю|ем|еду|иду|жду|\p{L}{2,}(ю|юсь|ую|аю|яю|ею|уюсь|аюсь|у|усь|ем|им)|\p{L}{2,}(ал|ала|али|ял|яла|ел|ела|ил|ила|ыл|ыла|ла|ли|лся|лась))(?![\p{L}])/iu;
const PLACE = /^((я|мы|да|ну|а|щас|сейчас|пока|уже) )*(в|во|на|у|с|со|из|по|дома|домой|в дороге|на работе|на паре|в зале|в метро|в машине)(?![\p{L}])/iu;
const COUNTER = /(^|[^\p{L}])(а ты|а вы|ты как|а у тебя|сам как|сама как|а ты чд|а ты кд|а ты что|а ты че|и ты)(?![\p{L}])/iu;
const CONFUSED = /^(чего|что|чо|че|чё|в смысле|всмысле|а|м|ммм|\?+|что\?|чего\?|в плане)[?!.]*$/iu;
const LAUGH_ONLY = /^([хx]+[аaыеэ]+|[аa]+[хx]+|ах|хах|хв|хс|пх|сх|[хвапсщж]){2,}[)!.]*$/iu;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const logit = (p: number) => Math.log(p / (1 - p));

function answerEvidence(replies: Msg[]): { score: number; ev: string[]; answer?: string } {
  let best = 0;
  let label = '';
  let answer: string | undefined;
  let counter = false;
  let confused = false;
  let media = false;
  for (const r of replies) {
    const t = r.text.trim().toLowerCase().replace(/ё/g, 'е');
    if (!t) {
      if (['round', 'voice', 'photo', 'video'].includes(r.kind)) media = true;
      continue;
    }
    answer ??= r.text.slice(0, 80);
    if (COUNTER.test(t)) counter = true;
    if (CONFUSED.test(t)) { confused = true; continue; }
    let s = 0;
    let l = '';
    if (STATE.test(t)) { s = 1.4; l = 'Собеседник ответил о самочувствии'; }
    else if (ACTIVITY.test(t)) { s = 1.2; l = 'Собеседник рассказал, чем занят'; }
    else if (PLACE.test(t)) { s = 0.9; l = 'Собеседник ответил, где он/с кем'; }
    else if (LAUGH_ONLY.test(t.replace(/\s/g, ''))) { s = -0.4; l = 'В ответ только смех'; }
    else if (t.split(/\s+/).length <= 2 && !t.includes('?') && /\p{L}{2,}/u.test(t)) { s = 0.4; l = 'Короткий ответ по существу'; }
    if (Math.abs(s) > Math.abs(best)) { best = s; label = l; }
  }
  const ev: string[] = [];
  let score = best;
  if (label) ev.push(label);
  if (counter) { score += 0.8; ev.push('Встречный вопрос «а ты?»'); }
  if (media && best <= 0) { score += 0.3; ev.push('В ответ — кружок/голосовое/фото'); }
  if (confused && best <= 0) { score -= 0.8; ev.push('Собеседник не понял вопроса'); }
  return { score, ev, answer };
}

/** Находит вопросы о делах с учётом ответа собеседника. events — по времени. */
export function detectCheckins(events: Msg[]): CheckinHit[] {
  const hits: CheckinHit[] = [];
  const lastAsk = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const m = events[i];
    if (!m.text || m.kind === 'call') continue;
    const cand = checkinCandidate(m.text);
    if (!cand) continue;
    // ответы собеседника: первые 3 сообщения другого участника в течение 20 минут
    const replies: Msg[] = [];
    for (let j = i + 1; j < events.length && replies.length < 3; j++) {
      const r = events[j];
      if (r.ts - m.ts > 1200) break;
      if (r.from !== m.from) replies.push(r);
    }
    const { score, ev, answer } = answerEvidence(replies);
    const evidence = [cand.abbr ? `Сокращение/разговорная форма «${cand.phrase}»` : `Фраза «${cand.phrase}»`, ...ev];
    if (!replies.length) evidence.push('Ответа в течение 20 минут не было');
    const p = sigmoid(logit(cand.prior) + score);
    if (p < 0.5) continue;
    const prev = lastAsk.get(m.from);
    lastAsk.set(m.from, m.ts);
    if (prev !== undefined && m.ts - prev < 600) continue; // «Чд» + «Кд» подряд — один вопрос
    hits.push({ id: m.id, ts: m.ts, from: m.from, p, phrase: cand.phrase, text: m.text.slice(0, 120), answer, evidence });
  }
  return hits;
}
