// Нормализованная модель переписки. Оба формата экспорта (JSON и HTML)
// приводятся к ней, после чего вся аналитика работает одинаково.

export type MsgKind =
  | 'text' | 'photo' | 'video' | 'round' | 'voice' | 'audio' | 'sticker' | 'gif'
  | 'file' | 'location' | 'live_location' | 'venue' | 'contact' | 'poll' | 'call'
  | 'game' | 'invoice' | 'todo' | 'giveaway' | 'service' | 'other';

export interface Reaction {
  emoji: string;
  count: number;
  /** ключи участников, поставивших реакцию (Telegram отдаёт только «recent») */
  from: string[];
  /** когда поставлена реакция (unix, сек) — параллельно from; это метка «прочитано» */
  dates?: number[];
}

export interface Media {
  path?: string;
  thumb?: string;
  /** файл не был выгружен Telegram (настройки экспорта / лимит размера) */
  missing?: boolean;
  name?: string;
  size?: number;
  mime?: string;
  duration?: number;
  w?: number;
  h?: number;
  emoji?: string;
  title?: string;
  performer?: string;
  spoiler?: boolean;
}

export interface Msg {
  id: number;
  /** unix-время, секунды (UTC) */
  ts: number;
  /** ключ участника: from_id (JSON) или имя (HTML) */
  from: string;
  service: boolean;
  action?: string;
  kind: MsgKind;
  text: string;
  links?: string[];
  mentions?: string[];
  hashtags?: string[];
  media?: Media;
  replyTo?: number;
  fwd?: string;
  edited?: number;
  viaBot?: string;
  reactions?: Reaction[];
  call?: { duration: number; reason?: string };
  poll?: { q: string; answers: { text: string; voters: number }[]; total: number };
  loc?: { lat: number; lon: number };
  members?: string[];
  /** расшифровка голосового/кружка (локальная нейросеть, по желанию) */
  transcript?: string;
  /** тональность от локальной нейросети: −1…+1 */
  nsent?: number;
}

/** Ответы пользователя в режиме проверки: 1 — алгоритм прав / да, 0 — нет. */
export interface Labels {
  /** id сообщения → это вопрос «как дела»? */
  checkin: Record<number, 0 | 1>;
  /** id первого сообщения разговора → начал ли его открывший (1) или собеседник (0) */
  conv: Record<number, 0 | 1>;
  /** дата начала периода (YYYY-MM-DD) → это была ссора/напряжение? */
  tension: Record<string, 0 | 1>;
}

export interface Participant {
  key: string;
  name: string;
  color: string;
  count: number;
  /** бот или посторонний участник личного чата — по умолчанию не учитывается */
  bot?: 'bot' | 'guest';
}

export interface Chat {
  name: string;
  type: string;
  id?: string | number;
  messages: Msg[];
  participants: Participant[];
  source: 'json' | 'html' | 'demo';
  /** известна ли точная временная зона меток времени */
  tzExact: boolean;
  /** сколько медиа-файлов упомянуто / отсутствует в экспорте */
  mediaRefs: number;
  mediaMissing: number;
  warnings: string[];
}

/** Короткое описание чата из полного экспорта аккаунта (для выбора). */
export interface ChatSummary {
  index: number;
  name: string;
  type: string;
  count: number;
  left: boolean;
}

export interface AnalysisOptions {
  /** 'local' — часовой пояс браузера, число — фиксированное смещение от UTC в минутах */
  tz: 'local' | number;
  from?: number;
  to?: number;
  /** порог разрыва диалога в секундах; undefined — определить автоматически */
  gapOverride?: number;
  /** ограничение на участников (пусто — все) */
  people?: string[];
  /** учитывать ботов и посторонних (по умолчанию нет) */
  includeBots?: boolean;
  /** разметка пользователя: калибрует веса алгоритма и даёт измеренную точность */
  labels?: Labels;
  /** использовать расшифровки голосовых в текстовой статистике */
  useTranscripts?: boolean;
}
