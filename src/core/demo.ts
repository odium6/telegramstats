// Генерация правдоподобной демо-переписки в формате result.json Telegram.
// Известна «истина»: кто на самом деле начинал каждый разговор — это позволяет
// проверить точность алгоритма инициатора.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GREET = ['Привет!', 'Привет)', 'Доброе утро ☀️', 'Утречко', 'Хей', 'Приветик', 'Доброе утро!', 'Привет-привет'];
const CHECKIN = ['Как ты?', 'Как дела?', 'Как спалось?', 'Ты как?', 'Чем занимаешься?', 'Как день прошёл?', 'Что делаешь?'];
const OPEN_OTHER = ['Смотри что нашла', 'Слушай, а ты помнишь того кота из кафе?', 'Короче, у меня новость', 'Глянь', 'Ты не поверишь', 'Есть идея на выходные'];
const REPLIES = [
  'Да нормально, работаю', 'Всё хорошо, а ты?', 'Отлично!', 'Устал немного', 'Только проснулась', 'Хахаха', 'Ахахах, точно',
  'Ну такое', 'Согласен', 'Ага', 'Да, давай', 'Я тоже скучаю ❤️', 'Супер, спасибо', 'Не знаю даже', 'Ой, совсем забыла',
  'Это прекрасно 😂', 'Ну ты даёшь)))', 'Пойдём в кино вечером?', 'Купи хлеба пожалуйста', 'Уже еду', 'Буду через 10 минут',
  'Как же я устала сегодня', 'Смотрела новый сериал, очень круто', 'Погода ужасная', 'Ммм, вкусно', 'Ок', 'Хорошо',
  'А ты что думаешь?', 'Давай завтра обсудим', 'Это очень смешно', 'Люблю тебя', 'Обнимаю', 'Грустно как-то', 'Ура!!!',
  'Слушай, а когда у нас отпуск?', 'Я заказал пиццу', 'Ничего себе', 'Ну и денёк', 'Работа бесит', 'Классная идея!',
];
const BYE = ['Спокойной ночи 😴', 'Споки', 'Сладких снов', 'Всё, я спать', 'До завтра!'];
const DELAY = ['Сорри, была занята', 'Извини, только увидел', 'Прости, уснула'];
const EMO = ['❤', '👍', '😂', '🔥', '😁', '🥰'];

export interface DemoTruth {
  convStarts: { id: number; trueInitiator: string }[];
}

export function generateDemoJson(seed = 42, days = 540): { json: any; truth: DemoTruth } {
  const R = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  const P = [
    { id: 'user1001', name: 'Аня' },
    { id: 'user1002', name: 'Макс' },
  ];
  const messages: any[] = [];
  const truth: DemoTruth = { convStarts: [] };
  let id = 1;
  let photo = 1;
  const start = Date.UTC(2024, 4, 1, 6, 0, 0) / 1000;
  let lastAuthor = 0;
  let lastWasQuestion = false;

  const add = (who: number, ts: number, extra: Record<string, unknown> = {}) => {
    const m: any = {
      id: id++,
      type: 'message',
      date: new Date(ts * 1000).toISOString().slice(0, 19),
      date_unixtime: String(Math.floor(ts)),
      from: P[who].name,
      from_id: P[who].id,
      text: '',
      text_entities: [],
      ...extra,
    };
    if (typeof m.text === 'string' && m.text) m.text_entities = [{ type: 'plain', text: m.text }];
    if (R() < 0.05 && m.text) {
      m.reactions = [{ type: 'emoji', count: 1, emoji: pick(EMO), recent: [{ from: P[1 - who].name, from_id: P[1 - who].id, date: m.date }] }];
    }
    messages.push(m);
    lastAuthor = who;
    return m;
  };
  const stamp = (ts: number) => {
    const d = new Date(ts * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}_${p(d.getUTCHours())}-${p(d.getUTCMinutes())}-${p(d.getUTCSeconds())}`;
  };
  const mediaMsg = (who: number, ts: number) => {
    const r = R();
    if (r < 0.45) return add(who, ts, { photo: `photos/photo_${photo++}@${stamp(ts)}.jpg`, photo_file_size: 120000 + Math.floor(R() * 200000), width: 1280, height: R() < 0.5 ? 960 : 1706 });
    if (r < 0.65) return add(who, ts, { file: `stickers/sticker_${1 + Math.floor(R() * 9)}.webp`, media_type: 'sticker', sticker_emoji: pick(['😂', '❤️', '😘', '👍', '😴', '🤔']), width: 512, height: 512 });
    if (r < 0.78) return add(who, ts, { file: `voice_messages/audio_${id}@${stamp(ts)}.ogg`, media_type: 'voice_message', mime_type: 'audio/ogg', duration_seconds: 3 + Math.floor(R() * 70) });
    if (r < 0.86) return add(who, ts, { file: `round_video_messages/file_${id}@${stamp(ts)}.mp4`, media_type: 'video_message', mime_type: 'video/mp4', duration_seconds: 5 + Math.floor(R() * 40) });
    if (r < 0.93) return add(who, ts, { file: `video_files/video_${id}@${stamp(ts)}.mp4`, media_type: 'video_file', mime_type: 'video/mp4', duration_seconds: 10 + Math.floor(R() * 90), width: 720, height: 1280, thumbnail: `video_files/video_${id}@${stamp(ts)}.mp4_thumb.jpg` });
    return add(who, ts, { file: `animations/gif_${id}.mp4`, media_type: 'animation', mime_type: 'video/mp4', width: 320, height: 240 });
  };

  for (let day = 0; day < days; day++) {
    const dayTs = start + day * 86400; // 06:00 UTC ≈ 09:00 МСК
    if (R() < 0.04) continue; // иногда день без общения
    const nConv = 1 + Math.floor(R() * 3.2);
    let t = dayTs + R() * 3 * 3600;
    for (let c = 0; c < nConv; c++) {
      // истинный инициатор: Аня ~62%
      let opener = R() < 0.62 ? 0 : 1;
      let delayed = false;
      if (lastWasQuestion && R() < 0.7) {
        // отложенный ответ на вопрос прошлого разговора: «открывает» отвечающий, но инициатива не его
        delayed = true;
        opener = 1 - lastAuthor;
      }
      const trueInit = delayed ? 1 - opener : opener;
      let first: any;
      if (delayed) {
        const prevQ = [...messages].reverse().find((m) => m.from_id === P[1 - opener].id && String(m.text).includes('?'));
        first = add(opener, t, { text: R() < 0.4 ? `${pick(DELAY)}. ${pick(REPLIES)}` : pick(REPLIES), reply_to_message_id: R() < 0.6 ? prevQ?.id : undefined });
      } else if (R() < 0.08) {
        first = add(opener, t, { type: 'service', actor: P[opener].name, actor_id: P[opener].id, action: 'phone_call', duration_seconds: R() < 0.2 ? 0 : 30 + Math.floor(R() * 1800), discard_reason: 'hangup' });
        delete first.from;
        delete first.from_id;
      } else {
        const r = R();
        const text = r < 0.45 ? `${pick(GREET)} ${R() < 0.6 ? pick(CHECKIN) : ''}`.trim() : r < 0.7 ? pick(CHECKIN) : pick(OPEN_OTHER);
        first = add(opener, t, { text });
      }
      truth.convStarts.push({ id: first.id, trueInitiator: P[trueInit].id });
      if (R() < 0.06 && !delayed) {
        // попытка без ответа
        t += 4 * 3600 + R() * 4 * 3600;
        lastWasQuestion = false;
        continue;
      }
      const len = 2 + Math.floor(Math.pow(R(), 2) * 70);
      let who = 1 - opener;
      for (let k = 0; k < len; k++) {
        const gap = Math.exp(Math.log(35) + 1.3 * (R() * 2 - 1) + (R() < 0.08 ? 2.5 : 0));
        t += gap;
        if (R() < 0.3) who = 1 - who; // двойные сообщения
        if (R() < 0.11) mediaMsg(who, t);
        else add(who, t, { text: pick(REPLIES), edited: R() < 0.03 ? new Date((t + 60) * 1000).toISOString().slice(0, 19) : undefined, ...(R() < 0.06 && messages.length > 2 ? { reply_to_message_id: messages[messages.length - 1 - Math.floor(R() * 3)].id } : {}) });
        who = 1 - who;
      }
      const last = messages[messages.length - 1];
      lastWasQuestion = false;
      if (R() < 0.22) {
        t += 20 + R() * 60;
        const asker = R() < 0.5 ? 0 : 1;
        add(asker, t, { text: pick(['А ты завтра свободен?', 'Ты купил билеты?', 'Во сколько встречаемся?', 'Кстати, ты видел мой подарок?']) });
        lastWasQuestion = true;
      } else if (c === nConv - 1 && R() < 0.5) {
        add(last.from_id === P[0].id ? 1 : 0, t + 30, { text: pick(BYE) });
      }
      t += 2.5 * 3600 + R() * 6 * 3600;
    }
  }
  return {
    json: { name: 'Аня ❤ Макс (демо)', type: 'personal_chat', id: 1002, messages },
    truth,
  };
}
