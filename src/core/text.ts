// Токенизация и словари для текстовой аналитики (русский, украинский, английский).

const WORD_RE = /[\p{L}][\p{L}\p{M}'’\-]*/gu;
export const EMOJI_RE = /(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?)*)/gu;

export function tokenize(text: string): string[] {
  const out = text.toLowerCase().replace(/ё/g, 'е').match(WORD_RE);
  return out ? out.map((w) => w.replace(/^[-']+|[-']+$/g, '')).filter(Boolean) : [];
}

export function emojis(text: string): string[] {
  return text.match(EMOJI_RE) ?? [];
}

export const STOPWORDS = new Set(
  (
    // русский
    'и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это мне меня тебе тебе тебя вас вам нам нас ему ей им их его ее свой своя свои это эта эти тот та те то какие какой какая какое так там тут здесь вот ну да нет ага угу ок окей лан ладно короче типа просто вообще очень че чо што щас сча сейчас еще ещё уже тоже также вроде будто если когда пока чтобы потому поэтому зато хотя хоть либо или либо ли бы же ж вон тот этим этих эту этого этому мои моих моим твой твоя твои твоих свое своё наш наша наши ваш ваша ваши всё все весь вся всем всех всего сам сама сами само себя себе собой кто что какой чей где куда откуда когда зачем почему сколько как оно оне был была были было буду будешь будет будем будете будут есть нету нет было бы быть стал стала стали стать могу может можешь могут мочь хочу хочешь хочет хотим хотят надо нужно'
    // украинский
    + ' і й та що це як але або в на з зі до від по для про при без над під за через мене мені тебе тобі вона воно вони ми ви він його її їх нас вас нам вам є був була було були буде бути так ні не ще вже тільки навіть ось там тут де коли чому хто який яка яке які цей ця це ці той та те ті свій своя своє свої мій моя моє мої твій твоя твоє твої'
    // английский
    + ' i me my myself we our ours ourselves you your yours yourself yourselves he him his himself she her hers herself it its itself they them their theirs themselves what which who whom this that these those am is are was were be been being have has had having do does did doing a an the and but if or because as until while of at by for with about against between into through during before after above below to from up down in out on off over under again further then once here there when where why how all any both each few more most other some such no nor not only own same so than too very s t can will just don should now im ive dont its thats u ur ok okay yeah yes ya oh'
  ).split(/\s+/),
);

const rx = (src: string) => new RegExp(src, 'iu');

/* ── Приветствия и «как дела» ────────────────────────────────────────────
 * Раньше фраза искалась где угодно в тексте, и «А как ты меня отметишь?»
 * засчитывалось как вопрос о делах. Теперь сообщение режется на отдельные
 * реплики (по . ! ? , ; переносу строки), у реплики отбрасываются вводные
 * слова («а», «ну», «слушай», приветствие, ласковое обращение) и хвосты
 * («там», «сегодня», «вообще»), и остаток должен ЦЕЛИКОМ совпасть с одним
 * из шаблонов. Лишние слова («…меня отметишь») = не вопрос о делах. */

const LEAD = new Set(
  ('а ну и так слушай кстати ой эй ок окей ладно хорошо да нет вот короче ' +
    'зай зая зайка заюш солнце солнышко малыш малышка котик котенок кис киса дорогой дорогая милый милая родной родная любимый любимая бро брат братан сестра подруга друг ' +
    'so and well oh hey hi hello babe baby dear bro honey hun').split(' '),
);
const TAIL = new Set(
  ('то там тут сегодня вообще сейчас щас вчера у тебя вас твои ваши твой твоя вам тебе ' +
    'зай зая зайка зайчик солнце солнышко малыш малышка котик котя коть дорогой дорогая милый милая родной родная любимый любимая любимка любовь лапуля лапусь бро ' +
    'today now there then babe baby dear bro').split(' '),
);
const GREET_WORDS =
  'привет|приветик|приветики|приветствую|прив|приветули|хай|хей|хэй|хелло|хеллоу|здравствуй|здравствуйте|здарова|здорово|здоров|салют|йоу|ку|вітаю|привіт|hi|hello|hey|heya|hiya|yo|gm|morning|' +
  'добр(ое|ый|ой|ого|ий) (утро|утречко|день|денек|вечер|вечерок|ночи|ранку|дня|вечора)|утречко|доброутро|good (morning|afternoon|evening)';
const GREET_START = new RegExp(`^(всем |ну |и тебе |и вам )?(${GREET_WORDS})(?=$| )`, 'u');
const GREET_ONLY = new RegExp(`^(${GREET_WORDS})$`, 'u');

const CHECKIN_FULL = new RegExp(
  '^(' +
    [
      'как (у тебя |у вас )?(твои |ваши )?(дела|делишки|делища|жизнь|жизнь молодая|настроение|настрой|самочувствие|здоровье|день|денек|выходные|работа|учеба|сам|сама|оно|ты|вы|ты сам|ты сама|поживаешь|поживаете)( у тебя| у вас| твои| в целом| вообще)?',
      'как (ты|вы) (себя )?(чувствуешь|чувствуете|поживаешь|поживаете)',
      '(ты|вы) как',
      'как (тебе )?(спалось|поспал|поспала|выспался|выспалась|ночь|прошла ночь|ночь прошла)',
      'как (прошел|прошла|прошло) (твой |твоя |твое )?(день|денек|ночь|утро|вечер|выходные|работа|учеба|встреча|поездка)',
      'как (твой |твоя |твое )?(день|ночь|утро|вечер|выходные|работа|учеба|встреча|поездка) (прошел|прошла|прошло|прошли)',
      'как (ты )?(добрался|добралась|доехал|доехала|долетел|долетела|сходил|сходила|съездил|съездила|погулял|погуляла|отдохнул|отдохнула)',
      '(что|че|чё|чо|шо|чем) (ты |вы )?(делаешь|делаете|поделываешь|поделываете|занят|занята|заняты|занимаешься|занимаетесь|там делаешь|там)',
      'что (у тебя )?нового',
      // разговорное и сокращения (кд = как дела, чд = что делаешь)
      '(ну )?(что|че|чо|шо) как( ты| вы| там| оно| дела| сам| сама| жизнь)?',
      '(ты |вы )?(кд|чд)( ты| вы| у тебя| у вас)?',
      '(кд|чд)(( и)? (кд|чд))+',
      '(как |и как )?(ты|вы) там',
      '(ты|вы) (в порядке|ок|окей|норм|нормально|живой|живая|жив|жива)',
      'все (хорошо|нормально|норм|ок|в порядке)',
      'як (справи|ти|ви|настрій|спалося|день)',
      '(що|шо) (робиш|робите)',
      'чим (займаєшся|займаєтеся)',
      'how (are|r) (you|u|ya)( doing)?',
      'hru',
      'how (is|s) (it going|your day|everything|life|work)',
      'hows (it going|your day|everything|life|work)',
      'how (was|is) your (day|night|weekend|trip|morning|evening|work)',
      'how did you sleep',
      'how have you been',
      'how do you feel',
      '(what is|whats|what s) (up|new)',
      'sup|wyd|wbu|hbu',
      'what are (you|u) (doing|up to)',
      '(are )?(you|u) (ok|okay|alright|good)',
    ].join('|') +
    ')$',
  'u',
);
/** Эти формулировки — вопрос о делах только если стоит знак вопроса. */
const NEEDS_QMARK = /^(все (хорошо|нормально|норм|ок|в порядке)|(ты|вы) (в порядке|ок|окей|норм|нормально|живой|живая|жив|жива)|(are )?(you|u) (ok|okay|alright|good))$/u;

export interface Clause {
  words: string[];
  q: boolean;
}

/* Исправление опечаток в ключевых словах («делаеш», «занемаешься»):
 * слово от 5 букв, отличающееся от канонического на одну правку. */
const CANON = ['делаешь', 'делаете', 'занимаешься', 'занимаетесь', 'поживаешь', 'самочувствие', 'настроение', 'добралась', 'добрался', 'занята', 'спалось'];
function dist1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
function fixWord(w: string): string {
  if (w.length < 5) return w;
  for (const c of CANON) if (dist1(w, c)) return c;
  return w;
}

export function clauses(text: string): Clause[] {
  const out: Clause[] = [];
  const re = /([^.!?,;:\n…()]+)([.!?,;:\n…()]*)/g;
  const low = text.toLowerCase().replace(/ё/g, 'е').replace(/['’]/g, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(low))) {
    const words = m[1].replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean).map(fixWord);
    if (words.length) out.push({ words, q: m[2].includes('?') });
  }
  return out;
}

/** Словарь, выученный по самой переписке (обращения и фразы этой пары). */
export interface LearnedVocab {
  /** обращения: «максимка», «лесечка», «заюш» */
  address: Set<string>;
  /** фразы-вопросы о делах → априорная вероятность */
  phrases: Map<string, number>;
}

export function core(words: string[], extra?: Set<string>): string {
  let a = 0;
  let b = words.length;
  // ведущие вводные слова и приветствие («привет как дела»)
  for (;;) {
    if (a < b && (LEAD.has(words[a]) || extra?.has(words[a]))) { a++; continue; }
    const rest = words.slice(a, b).join(' ');
    const g = GREET_START.exec(rest);
    if (g && g[0].length < rest.length) { a += g[0].split(' ').length; continue; }
    break;
  }
  while (b > a && (TAIL.has(words[b - 1]) || extra?.has(words[b - 1]))) b--;
  // «ты сегодня чд», «а сейчас ты чд» — уточнения времени внутри фразы не меняют смысла
  return words
    .slice(a, b)
    .filter((w, i, arr) => !(MID.has(w) && arr.length > 2))
    .join(' ');
}
const MID = new Set(['сегодня', 'сейчас', 'щас', 'вообще', 'вообщем']);

export interface CheckinCandidate {
  /** априорная вероятность по самой фразе, без учёта ответа собеседника */
  prior: number;
  phrase: string;
  abbr: boolean;
  /** фраза выучена из этой переписки */
  learned?: boolean;
}

/** После «чд» эти слова означают не «что делаешь», а «что делать / что будем делать». */
const ABBR_SKIP = new Set(['будешь', 'будем', 'будете', 'буиш', 'теперь', 'дальше', 'мне', 'нам', 'тебе', 'им', 'ей', 'ему', 'делать', 'было', 'будет', 'такое', 'значит', 'это', 'там', 'и', 'ты', 'вы']);
const ABBR_ONLY = /^(ты |вы )?(кд|чд)( ты| вы| у тебя| у вас)?$|^(кд|чд)(( и)? (кд|чд))+$/u;
const PLANS = /(^|\s)(завтра|послезавтра|вечером|потом|на выходных|в выходные|\d+(-?го|-?е)?|понедельник\p{L}*|вторник\p{L}*|сред[уаы]|четверг\p{L}*|пятниц\p{L}*|суббот\p{L}*|воскресень\p{L}*)(?=\s|$)/u;

/** Лучший кандидат на вопрос о делах в сообщении (без учёта контекста). */
export function checkinCandidate(text: string, vocab?: LearnedVocab): CheckinCandidate | null {
  if (!text || text.length > 3000) return null;
  let best: CheckinCandidate | null = null;
  for (const c of clauses(text)) {
    if (c.words.length > 9) continue;
    const s = core(c.words, vocab?.address);
    if (!s) continue;
    const learned = vocab?.phrases.get(s);
    if (learned !== undefined && !CHECKIN_FULL.test(s)) {
      if (!best || best.prior < learned) best = { prior: learned, phrase: s, abbr: false, learned: true };
      continue;
    }
    // «чд максимка», «чд боб» — сокращение + обращение по имени. Имени в словаре нет,
    // поэтому уверенность ниже 50 %: засчитается, только если ответ похож на ответ о делах.
    const named = /^(ты |вы |а ты )?(кд|чд) (\p{L}+)$/u.exec(s);
    if (named && !ABBR_SKIP.has(named[3]) && !PLANS.test(named[3])) {
      if (!best || best.prior < 0.45) best = { prior: 0.45, phrase: s, abbr: true };
      continue;
    }
    if (!CHECKIN_FULL.test(s)) continue;
    if (NEEDS_QMARK.test(s) && !c.q) continue;
    if (PLANS.test(c.words.join(' '))) continue; // «что делаешь завтра / 16-го» — вопрос о планах
    const abbr = ABBR_ONLY.test(s) || /^(ну )?(что|че|чо|шо) как$/u.test(s) || s === 'как оно';
    let prior = abbr ? (/(кд|чд).*(кд|чд)/u.test(s) ? 0.8 : /ты|вы/u.test(s) ? 0.7 : 0.6) : 0.86;
    // «И чд», «и кд» — чаще риторическое «и что делать / и что дальше»
    if (abbr && c.words[0] === 'и' && !/ты|вы/u.test(s)) prior = 0.3;
    if (c.q) prior = Math.min(0.95, prior + 0.05);
    if (!best || prior > best.prior) best = { prior, phrase: s, abbr };
  }
  return best;
}

/** Вопрос о делах по одной фразе, без контекста. Точный подсчёт — detectCheckins (intent.ts). */
export function isCheckin(text: string): boolean {
  const c = checkinCandidate(text);
  return !!c && c.prior >= 0.5;
}

/** Сообщение начинается с приветствия (а не просто содержит слово «привет»). */
export function isGreeting(text: string): boolean {
  if (!text) return false;
  const first = clauses(text)[0];
  if (!first || first.words.length > 8) return false;
  let a = 0;
  while (a < first.words.length && LEAD.has(first.words[a]) && !GREET_ONLY.test(first.words[a])) a++;
  return GREET_START.test(first.words.slice(a).join(' '));
}

/** Извинения за задержку — признак отложенного ответа, а не нового разговора. */
export const DELAY_RE = rx(
  '(извини|прости|сорри|сори|sorry|sry|соррян|вибач)[^.!?]{0,40}(не (видел|видела|ответил|ответила|заметил|заметила|мог|могла)|был\\p{L}* занят|занят\\p{L}*|спал\\p{L}*|уснул\\p{L}*|за(держ|поздал)\\p{L}*|late|busy|asleep|missed)|только (увидел|увидела|проснул\\p{L}*)|just saw|was (busy|asleep|sleeping)',
);

export const FAREWELL_RE = rx(
  '(спокойной ночи|споки|сладких снов|доброй ночи|пока|до завтра|до встречи|бывай|good ?night|gn|bye|see (you|ya)|cya|на связи|добраніч|до побачення)',
);

export const LAUGH_RE = rx('(([хx][аa]){2,}|([аa][хx]){2,}|хех|хи-?хи|ржу|ржака|лол|lol|lmao|rofl|haha|hehe|ахаха|кек|😂|🤣|😆|😹)');
// В JS \b не считает кириллицу буквами (из-за этого мат почти не находился),
// поэтому границы слов задаются через (?<!\p{L}) и (?!\p{L}).
const W0 = '(?<![\\p{L}])';
const W1 = '(?![\\p{L}])';
export const LOVE_RE = rx(
  `(${W0}(люблю|любимы\\p{L}*|любимк\\p{L}*|скучаю|соскучил\\p{L}*|целую|обнимаю|обнима\\p{L}*|мил(ый|ая|ой|енький|енькая|ашка)|зай(ка|ки|чик|чонок|ку|кой)?|зая|котик\\p{L}*|котен\\p{L}*|солнышк\\p{L}*|малыш\\p{L}*|родн(ой|ая|улька|уля)|кохаю|лапу\\p{L}*)${W1}|любовь моя|love (you|u)|miss (you|u)|${W0}ily${W1}|xoxo|❤|💕|💖|💗|💓|💘|💞|😘|😍|🥰|💋)`,
);
export const SWEAR_RE = rx(
  `${W0}(ху[йяеиё]\\p{L}*|пизд\\p{L}*|бля\\p{L}*|бл[еэ]ть|еба\\p{L}*|ёба\\p{L}*|еб[ауеи]т\\p{L}*|въеб\\p{L}*|заеб\\p{L}*|наеб\\p{L}*|уеб\\p{L}*|сук[аиу]|сучк\\p{L}*|мудак\\p{L}*|мудил\\p{L}*|гандон\\p{L}*|пидор\\p{L}*|пидр\\p{L}*|херн\\p{L}*|fuck\\p{L}*|shit\\p{L}*|bitch\\p{L}*)`,
);
export const APOLOGY_RE = rx(`${W0}(прости|простите|извини|извините|сорри|сори|соррян|виноват|виновата|прошу прощения|sorry)${W1}`);
export const THANKS_RE = rx(`${W0}(спасибо|спс|благодарю|пасиб\\p{L}*|спасиб\\p{L}*|thanks|thank you|thx)${W1}`);
export const MISS_RE = rx(`${W0}(скучаю|соскучил\\p{L}*|скучала|скучал|miss (you|u))${W1}`);
export const ILY_RE = rx(`${W0}(люблю тебя|я тебя люблю|тебя люблю|тебя очень люблю|очень тебя люблю|i love (you|u)|love (you|u)|ily|кохаю)${W1}`);
export const SMILE_RE = /(?<![\p{L}\d])(?::-?\)|;-?\)|\){2,}|:d|xd)/giu;
export const SAD_RE = /(?<![\p{L}\d])(?::-?\(|\({2,})/giu;

// Небольшой тональный словарь. Тональность — оценка с заметной погрешностью (см. вкладку «Точность»).
const POS = 'хорош отличн прекрасн класс круто крут супер обожа люблю нрав рад рада радост счасть спасибо благодар ура молодец замечат великолеп чудес умниц мил уют весел смешн кайф кайфов топ лучш здорово ахуен красив добр приятн восхит восторг good great love nice awesome cool amazing thanks thank happy glad wonderful perfect best beautiful fun lol хаха ахах';
const NEG = 'плох ужас ужасн отврат груст печал тоск устал устала бес раздраж зл злюсь ненави обид боль болит больн страш страх тревож плак слез жаль жалк скучн проблем дерьм отстой хуже худш кошмар депресс одинок разочар неприят бред сожал bad sad hate angry tired awful terrible worst sick hurt cry sorry upset annoying boring problem';
const POS_STEMS = POS.split(' ');
const NEG_STEMS = NEG.split(' ');
const POS_EMO = new Set(['😊', '😀', '😃', '😄', '😁', '😍', '🥰', '😘', '❤', '❤️', '💕', '👍', '🔥', '🎉', '😂', '🤣', '☺️', '🙂', '😎', '💖', '✨', '🥳']);
const NEG_EMO = new Set(['😢', '😭', '😞', '😔', '😟', '😠', '😡', '🤬', '💔', '😩', '😫', '😣', '😖', '👎', '🙁', '☹️', '😒', '😤']);

export function sentiment(tokens: string[], emo: string[]): { score: number; hits: number } {
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.length < 3) continue;
    const negated = i > 0 && (tokens[i - 1] === 'не' || tokens[i - 1] === 'not' || tokens[i - 1] === 'ні');
    let p = false;
    let n = false;
    for (const s of POS_STEMS) if (t.startsWith(s)) { p = true; break; }
    if (!p) for (const s of NEG_STEMS) if (t.startsWith(s)) { n = true; break; }
    if (negated) [p, n] = [n, p];
    if (p) pos++;
    if (n) neg++;
  }
  for (const e of emo) {
    if (POS_EMO.has(e)) pos++;
    else if (NEG_EMO.has(e)) neg++;
  }
  return { score: pos - neg, hits: pos + neg };
}

export function domainOf(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}
