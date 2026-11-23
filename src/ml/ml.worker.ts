/// <reference lib="webworker" />
// Локальные нейросети (по желанию пользователя). Модели скачиваются один раз
// с Hugging Face и кэшируются браузером. Тексты и аудио переписки никуда не
// отправляются — модели выполняются здесь, в браузере.
import { env, pipeline } from '@huggingface/transformers';

export type MlIn =
  | { type: 'init'; ortBase: string }
  | { type: 'sentiment'; items: { id: number; text: string }[] }
  | { type: 'asr-load'; model: 'base' | 'small' }
  | { type: 'asr'; id: number; audio: Float32Array };

export type MlOut =
  | { type: 'download'; file: string; progress: number; loaded: number; total: number }
  | { type: 'ready'; what: 'sentiment' | 'asr'; device: string }
  | { type: 'sentiment'; scores: [number, number][]; done: number; total: number }
  | { type: 'asr'; id: number; text: string; ms: number }
  | { type: 'error'; message: string };

const post = (m: MlOut) => (self as unknown as Worker).postMessage(m);
const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator && !!(navigator as any).gpu;

let sentimentPipe: any = null;
let asrPipe: any = null;
let asrModel = '';

const progress = (p: any) => {
  if (p?.status === 'progress' && p.file) post({ type: 'download', file: p.file, progress: p.progress ?? 0, loaded: p.loaded ?? 0, total: p.total ?? 0 });
};

async function gpuOk(): Promise<boolean> {
  if (!hasGpu) return false;
  try {
    return !!(await (navigator as any).gpu.requestAdapter());
  } catch {
    return false;
  }
}

self.onmessage = async (e: MessageEvent<MlIn>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      // среда выполнения — с нашего же сайта, без внешних CDN
      (env.backends.onnx as any).wasm.wasmPaths = msg.ortBase;
      // GitHub Pages не даёт заголовков COOP/COEP — работаем в один поток
      (env.backends.onnx as any).wasm.numThreads = 1;
      return;
    }
    if (msg.type === 'sentiment') {
      if (!sentimentPipe) {
        sentimentPipe = await pipeline('text-classification', 'onnx-community/rubert-tiny-sentiment-balanced-ONNX', {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: progress,
        } as any);
        post({ type: 'ready', what: 'sentiment', device: 'wasm' });
      }
      const B = 32;
      for (let i = 0; i < msg.items.length; i += B) {
        const batch = msg.items.slice(i, i + B);
        const out: any[] = await sentimentPipe(batch.map((b) => b.text.slice(0, 400)), { top_k: null });
        const scores: [number, number][] = batch.map((b, k) => {
          const labels: { label: string; score: number }[] = Array.isArray(out[k]) ? out[k] : [out[k]];
          const get = (l: string) => labels.find((x) => x.label.toLowerCase() === l)?.score ?? 0;
          return [b.id, +(get('positive') - get('negative')).toFixed(3)];
        });
        post({ type: 'sentiment', scores, done: Math.min(msg.items.length, i + B), total: msg.items.length });
      }
      return;
    }
    if (msg.type === 'asr-load') {
      const id = msg.model === 'small' ? 'onnx-community/whisper-small' : 'onnx-community/whisper-base';
      if (asrPipe && asrModel === id) {
        post({ type: 'ready', what: 'asr', device: 'cached' });
        return;
      }
      const gpu = await gpuOk();
      asrPipe = await pipeline('automatic-speech-recognition', id, {
        device: gpu ? 'webgpu' : 'wasm',
        dtype: gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: progress,
      } as any);
      asrModel = id;
      post({ type: 'ready', what: 'asr', device: gpu ? 'webgpu' : 'wasm' });
      return;
    }
    if (msg.type === 'asr') {
      if (!asrPipe) throw new Error('Модель расшифровки не загружена');
      const t0 = performance.now();
      const r: any = await asrPipe(msg.audio, { language: 'russian', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
      post({ type: 'asr', id: msg.id, text: String(r?.text ?? '').trim(), ms: performance.now() - t0 });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
