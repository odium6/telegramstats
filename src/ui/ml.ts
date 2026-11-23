import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chat, Msg } from '../core/types';
import type { MediaStore } from '../core/loader';
import type { MlIn, MlOut } from '../ml/ml.worker';
import { fingerprint, idbGet, idbSet } from './store';

/* Управление локальными нейросетями (по желанию):
 *  • тональность — rubert-tiny (12 МБ) по случайной выборке: до 400 сообщений
 *    на каждый месяц и участника; этого достаточно для графика по месяцам;
 *  • расшифровка голосовых и кружков — Whisper base (~75 МБ) или small (~250 МБ).
 * Результаты сохраняются в IndexedDB этого браузера и подхватываются при
 * следующем открытии того же экспорта. */

export interface MlState {
  sentiment: { status: 'idle' | 'loading' | 'running' | 'done' | 'error'; done: number; total: number; error?: string };
  asr: {
    status: 'idle' | 'loading' | 'running' | 'paused' | 'done' | 'error';
    done: number;
    total: number;
    failed: number;
    model: 'base' | 'small';
    device?: string;
    etaSec?: number;
    error?: string;
  };
  download: { file: string; progress: number } | null;
}

export interface Patch {
  nsent?: [number, number][];
  transcripts?: [number, string][];
}

const initial: MlState = {
  sentiment: { status: 'idle', done: 0, total: 0 },
  asr: { status: 'idle', done: 0, total: 0, failed: 0, model: 'base' },
  download: null,
};

/** Детерминированное перемешивание (одинаковая выборка при повторном запуске). */
function shuffle<T>(a: T[], seed = 7): T[] {
  const r = [...a];
  let s = seed;
  for (let i = r.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function sentimentSample(chat: Chat, perCell = 400): Msg[] {
  const cells = new Map<string, Msg[]>();
  for (const m of chat.messages) {
    if (m.service || !m.text || m.text.split(/\s+/).length < 2) continue;
    const d = new Date(m.ts * 1000);
    const k = `${d.getFullYear()}-${d.getMonth()}:${m.from}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(m);
  }
  const out: Msg[] = [];
  for (const list of cells.values()) out.push(...shuffle(list).slice(0, perCell));
  return out;
}

/* Whisper на тишине, музыке и шуме «галлюцинирует» титрами из обучающих
 * данных («Редактор субтитров…», «Продолжение следует…»). Такие расшифровки
 * считаются пустыми — в голосовом нет распознаваемой речи. */
const HALLUCINATION =
  /(редактор субтитров|корректор [а-я]\.|субтитры (сделал|создавал|подогнал|делал)|продолжение следует|спасибо за просмотр|подписывайтесь на канал|подпишись на канал|ставьте лайк|dimatorzok|amara\.org|субтитры:|переведено)/iu;

export function cleanTranscript(t: string): string {
  const s = t.trim();
  if (!s || HALLUCINATION.test(s)) return '';
  // «...», одни знаки препинания или повтор одного слова — тоже не речь
  if (!/\p{L}{2,}/u.test(s)) return '';
  const words = s.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length >= 6 && new Set(words).size <= 2) return '';
  return s;
}

async function decode16k(blob: Blob, ctx: AudioContext): Promise<Float32Array> {
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const a = buf.getChannelData(0);
  const b = buf.getChannelData(1);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

export function useMl(chat: Chat | null, media: MediaStore, apply: (p: Patch) => void) {
  const [st, setSt] = useState<MlState>(initial);
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, (r: { text: string; ms: number } | null) => void>());
  const paused = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const key = chat ? fingerprint(chat) : '';

  const getWorker = () => {
    if (worker.current) return worker.current;
    const w = new Worker(new URL('../ml/ml.worker.ts', import.meta.url), { type: 'module' });
    w.postMessage({ type: 'init', ortBase: new URL('./ort/', document.baseURI).href } satisfies MlIn);
    w.onmessage = (e: MessageEvent<MlOut>) => {
      const m = e.data;
      if (m.type === 'download') setSt((s) => ({ ...s, download: m.progress >= 100 ? null : { file: m.file, progress: m.progress } }));
      else if (m.type === 'ready') {
        setSt((s) => (m.what === 'asr' ? { ...s, download: null, asr: { ...s.asr, device: m.device } } : { ...s, download: null }));
      } else if (m.type === 'asr') {
        pending.current.get(m.id)?.({ text: m.text, ms: m.ms });
        pending.current.delete(m.id);
      } else if (m.type === 'error') {
        // ошибка расшифровки одного файла не должна останавливать очередь
        if (pending.current.size) {
          for (const [id, res] of pending.current) {
            res(null);
            pending.current.delete(id);
          }
        } else setSt((s) => ({ ...s, download: null, sentiment: s.sentiment.status === 'running' || s.sentiment.status === 'loading' ? { ...s.sentiment, status: 'error', error: m.message } : s.sentiment, asr: s.asr.status === 'loading' ? { ...s.asr, status: 'error', error: m.message } : s.asr }));
      }
    };
    worker.current = w;
    return w;
  };

  useEffect(() => () => worker.current?.terminate(), []);

  // подхватить сохранённые результаты для этого экспорта
  useEffect(() => {
    if (!chat) return;
    let alive = true;
    setSt(initial);
    (async () => {
      const ns = await idbGet<[number, number][]>(`nsent:${key}`);
      const tr = await idbGet<[number, string][]>(`asr:${key}`);
      if (!alive) return;
      if (ns?.length || tr?.length) applyRef.current({ nsent: ns, transcripts: tr?.map(([id, t]) => [id, cleanTranscript(t)] as [number, string]) });
      const voice = chat.messages.filter((m) => (m.kind === 'voice' || m.kind === 'round') && m.media?.path && !m.media.missing).length;
      setSt((s) => ({
        ...s,
        sentiment: ns?.length ? { status: 'done', done: ns.length, total: ns.length } : s.sentiment,
        asr: { ...s.asr, done: tr?.length ?? 0, total: voice, status: tr?.length ? (tr.length >= voice ? 'done' : 'paused') : 'idle' },
      }));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const runSentiment = useCallback(async () => {
    if (!chat) return;
    const sample = sentimentSample(chat);
    const scores: [number, number][] = [];
    setSt((s) => ({ ...s, sentiment: { status: 'loading', done: 0, total: sample.length } }));
    const w = getWorker();
    await new Promise<void>((resolve) => {
      const on = (e: MessageEvent<MlOut>) => {
        const m = e.data;
        if (m.type === 'sentiment') {
          scores.push(...m.scores);
          setSt((s) => ({ ...s, sentiment: { status: 'running', done: m.done, total: m.total } }));
          if (m.done >= m.total) {
            w.removeEventListener('message', on);
            resolve();
          }
        } else if (m.type === 'error') {
          w.removeEventListener('message', on);
          resolve();
        }
      };
      w.addEventListener('message', on);
      w.postMessage({ type: 'sentiment', items: sample.map((m) => ({ id: m.id, text: m.text })) } satisfies MlIn);
    });
    if (scores.length) {
      await idbSet(`nsent:${key}`, scores);
      applyRef.current({ nsent: scores });
      setSt((s) => ({ ...s, sentiment: { status: 'done', done: scores.length, total: scores.length } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, key]);

  const startAsr = useCallback(
    async (model: 'base' | 'small') => {
      if (!chat) return;
      paused.current = false;
      const saved = new Map((await idbGet<[number, string][]>(`asr:${key}`)) ?? []);
      const queue = chat.messages.filter((m) => (m.kind === 'voice' || m.kind === 'round') && m.media?.path && !m.media.missing);
      const todo = queue.filter((m) => !saved.has(m.id));
      setSt((s) => ({ ...s, asr: { ...s.asr, status: 'loading', model, total: queue.length, done: saved.size, failed: 0 } }));
      const w = getWorker();
      w.postMessage({ type: 'asr-load', model } satisfies MlIn);
      await new Promise<void>((resolve) => {
        const on = (e: MessageEvent<MlOut>) => {
          if ((e.data.type === 'ready' && e.data.what === 'asr') || e.data.type === 'error') {
            w.removeEventListener('message', on);
            resolve();
          }
        };
        w.addEventListener('message', on);
      });
      const ctx = new AudioContext({ sampleRate: 16000 });
      let batch: [number, string][] = [];
      let failed = 0;
      let msSum = 0;
      let audioSec = 0;
      let n = 0;
      const flush = async () => {
        if (!batch.length) return;
        await idbSet(`asr:${key}`, [...saved.entries()]);
        applyRef.current({ transcripts: batch });
        batch = [];
      };
      setSt((s) => ({ ...s, asr: { ...s.asr, status: 'running' } }));
      for (const m of todo) {
        if (paused.current) break;
        try {
          const url = await media.url(m.media!.path);
          if (!url) {
            failed++;
            continue;
          }
          const audio = await decode16k(await (await fetch(url)).blob(), ctx);
          const res = await new Promise<{ text: string; ms: number } | null>((resolve) => {
            pending.current.set(m.id, resolve);
            w.postMessage({ type: 'asr', id: m.id, audio } satisfies MlIn, [audio.buffer]);
          });
          if (!res) {
            failed++;
            continue;
          }
          const text = cleanTranscript(res.text);
          saved.set(m.id, text);
          batch.push([m.id, text]);
          msSum += res.ms;
          audioSec += m.media?.duration ?? 10;
          n++;
          // оценка оставшегося времени по фактической скорости
          const remainAudio = todo.slice(todo.indexOf(m) + 1).reduce((s, x) => s + (x.media?.duration ?? 10), 0);
          const eta = audioSec ? (msSum / 1000 / audioSec) * remainAudio : undefined;
          setSt((s) => ({ ...s, asr: { ...s.asr, done: saved.size, failed, etaSec: eta } }));
          if (n % 25 === 0) await flush();
        } catch {
          failed++;
        }
      }
      await flush();
      ctx.close();
      setSt((s) => ({ ...s, asr: { ...s.asr, status: paused.current ? 'paused' : 'done', done: saved.size, failed, etaSec: undefined } }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat, key, media],
  );

  const pauseAsr = useCallback(() => {
    paused.current = true;
  }, []);

  return { st, runSentiment, startAsr, pauseAsr };
}
