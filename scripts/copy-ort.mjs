// Копирует среду выполнения нейросетей (onnxruntime-web) в public/ort,
// чтобы сайт загружал её с себя, а не с внешнего CDN.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const src = join('node_modules', 'onnxruntime-web', 'dist');
const dst = join('public', 'ort');
if (!existsSync(src)) {
  console.warn('onnxruntime-web не установлен — нейросети будут недоступны');
  process.exit(0);
}
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (/^ort-wasm-simd-threaded(\.jsep)?\.(wasm|mjs)$/.test(f)) {
    copyFileSync(join(src, f), join(dst, f));
    n++;
  }
}
console.log(`ort: скопировано файлов — ${n}`);
