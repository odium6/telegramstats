import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Content-Security-Policy только для продакшн-сборки: браузер физически не даст
// странице отправить данные на чужой сервер (connect-src 'self'), подключить
// внешние скрипты или шрифты. Файлы переписки остаются на компьютере.
const CSP = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' — только для WebAssembly среды нейросетей (onnxruntime), не для JS
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  // Наружу разрешены только загрузки файлов моделей с Hugging Face (по кнопке, по желанию).
  // Переписка туда не отправляется: модели работают в браузере.
  "connect-src 'self' blob: data: https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// base './' — сайт работает и на GitHub Pages (подпапка), и на Cloudflare Pages (корень)
export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
