import type { Chat, ChatSummary, Media, Msg, MsgKind, Reaction } from './types';
import { extractFromText, finalizeChat, isMissingPath } from './common';

/* Формат result.json Telegram Desktop (export_output_json.cpp):
 *  • экспорт одного чата: { name, type, id, messages: [...] }
 *  • экспорт всего аккаунта: { personal_information, contacts, chats: { list: [...] }, left_chats: { list } ... }
 * Сообщение: id, type ("message" | "service"), date (локальное ISO без зоны), date_unixtime (UTC),
 * from/from_id, text (строка или массив), text_entities, media-поля, reactions и т.д. */

type Raw = Record<string, any>;

export function listChats(root: Raw): { single: boolean; list: ChatSummary[] } {
  if (Array.isArray(root?.messages)) {
    return { single: true, list: [{ index: 0, name: root.name ?? 'Чат', type: root.type ?? '', count: root.messages.length, left: false }] };
  }
  const list: ChatSummary[] = [];
  const add = (arr: Raw[] | undefined, left: boolean) => {
    (arr ?? []).forEach((c) => {
      list.push({
        index: list.length,
        name: c.name ?? chatTypeName(c.type),
        type: c.type ?? '',
        count: Array.isArray(c.messages) ? c.messages.length : 0,
        left,
      });
    });
  };
  add(root?.chats?.list, false);
  add(root?.left_chats?.list, true);
  if (!list.length) throw new Error('В JSON не найдено ни одного чата. Это точно экспорт Telegram (result.json)?');
  return { single: false, list };
}

export function getRawChat(root: Raw, index: number): Raw {
  if (Array.isArray(root?.messages)) return root;
  const all = [...(root?.chats?.list ?? []), ...(root?.left_chats?.list ?? [])];
  return all[index];
}

export function chatTypeName(t: string): string {
  return (
    {
      personal_chat: 'Личный чат',
      bot_chat: 'Бот',
      private_group: 'Группа',
      private_supergroup: 'Супергруппа',
      public_supergroup: 'Публичная супергруппа',
      private_channel: 'Канал',
      public_channel: 'Публичный канал',
      saved_messages: 'Избранное',
      replies: 'Ответы',
      verification_codes: 'Коды подтверждения',
    } as Record<string, string>
  )[t] ?? (t || 'Чат');
}

const MEDIA_TYPE: Record<string, MsgKind> = {
  sticker: 'sticker',
  video_message: 'round',
  voice_message: 'voice',
  animation: 'gif',
  video_file: 'video',
  audio_file: 'audio',
};

function flattenText(raw: Raw, m: Msg): string {
  const ents: Raw[] | undefined = Array.isArray(raw.text_entities) ? raw.text_entities : undefined;
  let parts: (string | Raw)[];
  if (ents) parts = ents;
  else if (Array.isArray(raw.text)) parts = raw.text;
  else parts = [String(raw.text ?? '')];
  let out = '';
  for (const p of parts) {
    if (typeof p === 'string') {
      out += p;
      continue;
    }
    const t = String(p.text ?? '');
    out += t;
    switch (p.type) {
      case 'link':
        (m.links ??= []).push(t);
        break;
      case 'text_link':
        if (p.href) (m.links ??= []).push(String(p.href));
        break;
      case 'mention':
      case 'mention_name':
        (m.mentions ??= []).push(t.toLowerCase());
        break;
      case 'hashtag':
        (m.hashtags ??= []).push(t.toLowerCase());
        break;
    }
  }
  if (!ents && !Array.isArray(raw.text)) extractFromText(out, m);
  return out;
}

function reactionsOf(raw: Raw): Reaction[] | undefined {
  if (!Array.isArray(raw.reactions) || !raw.reactions.length) return undefined;
  return raw.reactions.map((r: Raw) => ({
    emoji: r.type === 'emoji' ? String(r.emoji) : r.type === 'paid' ? '⭐' : r.type === 'custom_emoji' ? '✨' : '❔',
    count: Number(r.count) || 0,
    from: Array.isArray(r.recent) ? r.recent.map((x: Raw) => String(x.from_id ?? x.from ?? '')) : [],
    // дата реакции — ISO без зоны (локальное время экспорта), разбирается как локальное
    dates: Array.isArray(r.recent) ? r.recent.map((x: Raw) => (x.date ? Math.floor(Date.parse(x.date) / 1000) || 0 : 0)) : undefined,
  }));
}

export function normalizeJsonChat(raw: Raw): Chat {
  const names = new Map<string, string>();
  const botHints = new Set<string>();
  const messages: Msg[] = [];
  const warnings: string[] = [];
  let unsupported = 0;

  for (const r of raw.messages as Raw[]) {
    if (r.type === 'unsupported') {
      unsupported++;
      continue;
    }
    const ts = Number(r.date_unixtime) || Math.floor(Date.parse(r.date) / 1000);
    if (!Number.isFinite(ts)) continue;
    const service = r.type === 'service';
    const fromKey = String((service ? r.actor_id ?? r.actor : r.from_id ?? r.from) ?? '');
    const fromName = service ? r.actor : r.from;
    if (fromKey && !r.via_bot && Array.isArray(r.inline_bot_buttons) && r.inline_bot_buttons.length) botHints.add(fromKey);
    if (fromKey && fromName) names.set(fromKey, String(fromName));
    else if (fromKey && !names.has(fromKey)) names.set(fromKey, fromKey.startsWith('user') ? 'Удалённый аккаунт' : fromKey);

    const m: Msg = { id: Number(r.id), ts, from: fromKey, service, kind: service ? 'service' : 'text', text: '' };
    m.text = flattenText(r, m);
    if (r.action) m.action = String(r.action);
    if (r.reply_to_message_id != null) m.replyTo = Number(r.reply_to_message_id);
    if (r.forwarded_from) m.fwd = String(r.forwarded_from);
    else if (r.saved_from) m.fwd = String(r.saved_from);
    if (r.edited_unixtime) m.edited = Number(r.edited_unixtime);
    else if (r.edited) m.edited = Math.floor(Date.parse(r.edited) / 1000) || undefined;
    if (r.via_bot) m.viaBot = String(r.via_bot);
    m.reactions = reactionsOf(r);
    if (Array.isArray(r.members)) m.members = r.members.filter(Boolean).map(String);

    if (service && r.action === 'phone_call') {
      m.kind = 'call';
      m.call = { duration: Number(r.duration_seconds) || 0, reason: r.discard_reason || undefined };
    } else if (service && (r.action === 'group_call' || r.action === 'conference_call')) {
      m.kind = 'call';
      m.call = { duration: Number(r.duration ?? r.duration_seconds) || 0, reason: r.is_missed ? 'missed' : undefined };
    }

    if (!service) {
      let media: Media | undefined;
      if (r.photo !== undefined) {
        m.kind = 'photo';
        media = { path: isMissingPath(r.photo) ? undefined : r.photo, missing: isMissingPath(r.photo), size: r.photo_file_size, w: r.width, h: r.height };
      } else if (r.file !== undefined || r.media_type) {
        m.kind = MEDIA_TYPE[r.media_type] ?? 'file';
        media = {
          path: isMissingPath(r.file) ? undefined : r.file,
          missing: isMissingPath(r.file),
          thumb: isMissingPath(r.thumbnail) ? undefined : r.thumbnail,
          name: r.file_name,
          size: r.file_size,
          mime: r.mime_type,
          duration: r.duration_seconds,
          w: r.width,
          h: r.height,
          emoji: r.sticker_emoji,
          title: r.title,
          performer: r.performer,
        };
        // фото, отправленное «файлом», остаётся файлом, но это изображение
      } else if (r.location_information !== undefined || r.place_name) {
        m.kind = r.place_name ? 'venue' : r.live_location_period_seconds ? 'live_location' : 'location';
        if (r.location_information) m.loc = { lat: Number(r.location_information.latitude), lon: Number(r.location_information.longitude) };
        if (r.place_name) m.text ||= `${r.place_name}${r.address ? ', ' + r.address : ''}`;
      } else if (r.contact_information) {
        m.kind = 'contact';
      } else if (r.poll) {
        m.kind = 'poll';
        m.poll = {
          q: String(typeof r.poll.question === 'string' ? r.poll.question : flatAny(r.poll.question)),
          total: Number(r.poll.total_voters) || 0,
          answers: (r.poll.answers ?? []).map((a: Raw) => ({ text: typeof a.text === 'string' ? a.text : flatAny(a.text), voters: Number(a.voters) || 0 })),
        };
      } else if (r.game_title) m.kind = 'game';
      else if (r.invoice_information) m.kind = 'invoice';
      else if (r.todo_list) m.kind = 'todo';
      else if (r.giveaway_information || r.giveaway_results) m.kind = 'giveaway';
      if (r.media_spoiler && media) media.spoiler = true;
      if (media) m.media = media;
    } else if (r.photo && !isMissingPath(r.photo)) {
      m.media = { path: r.photo, w: r.width, h: r.height };
    }
    messages.push(m);
  }
  if (unsupported) warnings.push(`${unsupported} сообщений с неподдерживаемым типом пропущено`);

  return finalizeChat(
    {
      name: raw.name ?? chatTypeName(raw.type),
      type: raw.type ?? '',
      id: raw.id,
      messages,
      source: 'json',
      tzExact: true,
      warnings,
    },
    names,
    botHints,
  );
}

function flatAny(t: unknown): string {
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join('');
  if (t && typeof t === 'object' && 'text' in (t as Raw)) return flatAny((t as Raw).text);
  return '';
}
