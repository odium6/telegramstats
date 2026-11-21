import type { Chat, Msg, Participant } from './types';

// Категориальная палитра (проверенная на различимость при дальтонизме).
// Цвет закрепляется за участником по порядку и не меняется при фильтрации.
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
export const OTHER_COLOR = '#8a8984';

export const isMissingPath = (p: unknown): boolean =>
  typeof p !== 'string' || p.length === 0 || p.startsWith('(');

/** Сортирует сообщения, считает участников и раздаёт им цвета. */
export function finalizeChat(
  base: Omit<Chat, 'participants' | 'mediaRefs' | 'mediaMissing'>,
  names: Map<string, string>,
): Chat {
  const messages = base.messages;
  messages.sort((a, b) => a.ts - b.ts || a.id - b.id);
  const counts = new Map<string, number>();
  let mediaRefs = 0;
  let mediaMissing = 0;
  for (const m of messages) {
    if (m.media) {
      mediaRefs++;
      if (m.media.missing) mediaMissing++;
    }
    if (m.service && m.kind !== 'call') continue;
    if (!m.from) continue;
    counts.set(m.from, (counts.get(m.from) ?? 0) + 1);
  }
  const participants: Participant[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count], i) => ({
      key,
      name: (names.get(key) || key).trim() || 'Удалённый аккаунт',
      color: i < SERIES_LIGHT.length ? SERIES_LIGHT[i] : OTHER_COLOR,
      count,
    }));
  return { ...base, messages, participants, mediaRefs, mediaMissing };
}

export function extractFromText(text: string, m: Msg) {
  const links = text.match(/\bhttps?:\/\/[^\s<>"')]+/gi);
  if (links) m.links = [...(m.links ?? []), ...links];
  const tags = text.match(/(^|\s)#[\p{L}\p{N}_]{2,}/gu);
  if (tags) m.hashtags = [...(m.hashtags ?? []), ...tags.map((t) => t.trim().toLowerCase())];
  const ments = text.match(/(^|\s)@[A-Za-z0-9_]{4,}/g);
  if (ments) m.mentions = [...(m.mentions ?? []), ...ments.map((t) => t.trim().toLowerCase())];
}
