/// <reference lib="webworker" />
// Веб-воркер: разбор JSON и расчёт статистики вне основного потока,
// чтобы интерфейс не зависал даже на переписках в сотни тысяч сообщений.
import { analyze } from '../core/analyze';
import { generateDemoJson } from '../core/demo';
import { getRawChat, listChats, normalizeJsonChat } from '../core/parseJson';
import type { AnalysisOptions, Chat } from '../core/types';

export type WorkerIn =
  | { type: 'json'; blob: Blob }
  | { type: 'select'; index: number }
  | { type: 'set'; chat: Chat }
  | { type: 'demo' }
  | { type: 'patch'; nsent?: [number, number][]; transcripts?: [number, string][] }
  | { type: 'analyze'; id: number; opts: AnalysisOptions };

export type WorkerOut =
  | { type: 'progress'; stage: string }
  | { type: 'chats'; list: ReturnType<typeof listChats>['list'] }
  | { type: 'chat'; chat: Chat }
  | { type: 'analysis'; id: number; analysis: ReturnType<typeof analyze>; ms: number }
  | { type: 'error'; message: string };

let root: any = null;
let chat: Chat | null = null;
const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'json': {
        post({ type: 'progress', stage: 'Чтение файла…' });
        const text = await msg.blob.text();
        post({ type: 'progress', stage: 'Разбор JSON…' });
        try {
          root = JSON.parse(text);
        } catch {
          throw new Error('Файл не является корректным JSON. Возможно, экспорт был прерван.');
        }
        const { single, list } = listChats(root);
        if (single) {
          post({ type: 'progress', stage: 'Нормализация сообщений…' });
          chat = normalizeJsonChat(root);
          root = null;
          post({ type: 'chat', chat });
        } else post({ type: 'chats', list });
        break;
      }
      case 'select': {
        post({ type: 'progress', stage: 'Нормализация сообщений…' });
        chat = normalizeJsonChat(getRawChat(root, msg.index));
        post({ type: 'chat', chat });
        break;
      }
      case 'set':
        chat = msg.chat;
        break;
      case 'patch': {
        // результаты локальных нейросетей: тональность и расшифровки голосовых
        if (!chat) break;
        const byId = new Map(chat.messages.map((m) => [m.id, m]));
        for (const [id, v] of msg.nsent ?? []) {
          const m = byId.get(id);
          if (m) m.nsent = v;
        }
        for (const [id, t] of msg.transcripts ?? []) {
          const m = byId.get(id);
          if (m) m.transcript = t || undefined;
        }
        break;
      }
      case 'demo': {
        const { json } = generateDemoJson(42, 540);
        chat = normalizeJsonChat(json);
        chat.source = 'demo';
        post({ type: 'chat', chat });
        break;
      }
      case 'analyze': {
        if (!chat) throw new Error('Чат не загружен');
        const t0 = performance.now();
        const analysis = analyze(chat, msg.opts);
        post({ type: 'analysis', id: msg.id, analysis, ms: performance.now() - t0 });
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
