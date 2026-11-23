// Локальное хранилище в браузере (IndexedDB): расшифровки, оценки тональности.
// Данные лежат только на этом компьютере, в профиле браузера.
import type { Chat, Labels } from '../core/types';

const DB = 'tgstats';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result as T);
      r.onerror = () => res(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch {
    /* приватный режим — просто не сохраняем */
  }
}

/** Отпечаток чата: один и тот же экспорт → тот же ключ хранения. */
export function fingerprint(chat: Chat): string {
  const f = chat.messages[0];
  const l = chat.messages[chat.messages.length - 1];
  return `${chat.id ?? chat.name}:${f?.id}:${f?.ts}:${l?.id}:${chat.messages.length}`;
}

export const emptyLabels = (): Labels => ({ checkin: {}, conv: {}, tension: {} });

export function loadLabels(chat: Chat): Labels {
  try {
    const raw = localStorage.getItem(`labels:${fingerprint(chat)}`);
    if (raw) return { ...emptyLabels(), ...JSON.parse(raw) };
  } catch {
    /* нет доступа к хранилищу */
  }
  return emptyLabels();
}

export function saveLabels(chat: Chat, labels: Labels) {
  try {
    localStorage.setItem(`labels:${fingerprint(chat)}`, JSON.stringify(labels));
  } catch {
    /* нет доступа к хранилищу */
  }
}
