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

/** Приветствия — признак начала нового разговора. */
export const GREETING_RE = rx(
  '(^|[^\\p{L}])(привет\\p{L}*|приветик\\p{L}*|прив|хай|хеллоу|здравствуй\\p{L}*|здарова|здоров[ао]|добр(ое|ый|ой) (утр|день|вечер|ноч)\\p{L}*|утречк\\p{L}*|доброутр\\p{L}*|салют|йоу|ку|q|hi|hello|hey|heya|hiya|good (morning|afternoon|evening)|morning|gm|yo|sup|вітаю|привіт\\p{L}*|добр(ого|ий) (ранку|дня|вечора))(?=$|[^\\p{L}])',
);

/** «Как дела» и прочие проявления интереса к собеседнику. */
export const CHECKIN_RE = rx(
  '(как (у тебя |у вас )?(дела|делишки|ты|вы|жизнь|день|прошел|прошёл|настроени\\p{L}*|спалось|сам|сама|оно|поживаешь)|ты как|как ты там|чем занят\\p{L}*|что делаешь|че делаешь|чё делаешь|що робиш|як справи|як ти|чем занимаешься|ты где|где ты|ты дома|как добрал\\p{L}*|как самочувствие|how are (you|u)|how r u|hru|wyd|what are you (doing|up to)|how was your|how\'s it going|how is it going|what\'s up|whats up|how have you been|you ok|are you ok)',
);

/** Извинения за задержку — признак отложенного ответа, а не нового разговора. */
export const DELAY_RE = rx(
  '(извини|прости|сорри|сори|sorry|sry|соррян|вибач)[^.!?]{0,40}(не (видел|видела|ответил|ответила|заметил|заметила|мог|могла)|был\\p{L}* занят|занят\\p{L}*|спал\\p{L}*|уснул\\p{L}*|за(держ|поздал)\\p{L}*|late|busy|asleep|missed)|только (увидел|увидела|проснул\\p{L}*)|just saw|was (busy|asleep|sleeping)',
);

export const FAREWELL_RE = rx(
  '(спокойной ночи|споки|сладких снов|доброй ночи|пока|до завтра|до встречи|бывай|good ?night|gn|bye|see (you|ya)|cya|на связи|добраніч|до побачення)',
);

export const LAUGH_RE = rx('(([хx][аa]){2,}|([аa][хx]){2,}|хех|хи-?хи|ржу|ржака|лол|lol|lmao|rofl|haha|hehe|ахаха|кек|😂|🤣|😆|😹)');
export const LOVE_RE = rx('(люблю|любимы\\p{L}*|любимк\\p{L}*|скучаю|соскучил\\p{L}*|целую|обнимаю|обнима\\p{L}*|милы\\p{L}*|зай(ка|чик|ка)?\\b|котик\\p{L}*|солнышк\\p{L}*|малыш\\p{L}*|родн(ой|ая|ульк)\\p{L}*|кохаю|love (you|u)|miss (you|u)|ily|xoxo|❤|💕|💖|💗|💓|💘|💞|😘|😍|🥰)');
export const SWEAR_RE = rx('(\\bху[йяеи]\\p{L}*|пизд\\p{L}*|\\bбля\\p{L}*|\\bеба\\p{L}*|\\bёба\\p{L}*|\\bеб[ау]т\\p{L}*|\\bсук[аи]\\b|мудак\\p{L}*|fuck\\p{L}*|shit\\p{L}*|bitch\\p{L}*)');
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
