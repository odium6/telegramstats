// Сбор файлов из папки / drag&drop / ZIP. Всё читается локально в браузере —
// ни один байт не отправляется в сеть.
import type JSZipType from 'jszip';

export interface InFile {
  path: string; // относительный путь с прямыми слэшами
  size: number;
  get: () => Promise<Blob>;
}

export interface Collected {
  json: InFile[];
  html: Map<string, InFile[]>; // папка → страницы messages*.html
  media: MediaStore;
  total: number;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');
const tail = (p: string, n = 2) => norm(p).toLowerCase().split('/').slice(-n).join('/');

export class MediaStore {
  private byTail = new Map<string, InFile>();
  private urls = new Map<string, string>();
  generator?: (path: string) => Promise<Blob | null>;
  count = 0;

  add(f: InFile) {
    this.byTail.set(tail(f.path), f);
    this.count++;
  }
  merge(other: MediaStore) {
    other.byTail.forEach((v, k) => this.byTail.set(k, v));
    this.count = this.byTail.size;
  }
  has(path?: string): boolean {
    if (!path) return false;
    return this.byTail.has(tail(path)) || !!this.generator;
  }
  async url(path?: string): Promise<string | null> {
    if (!path) return null;
    const k = tail(path);
    const cached = this.urls.get(k);
    if (cached) return cached;
    const f = this.byTail.get(k);
    let blob: Blob | null = null;
    if (f) blob = await f.get();
    else if (this.generator) blob = await this.generator(path);
    if (!blob) return null;
    if (!blob.type) blob = new Blob([blob], { type: mimeOf(path) });
    const u = URL.createObjectURL(blob);
    this.urls.set(k, u);
    return u;
  }
  file(path?: string): InFile | undefined {
    return path ? this.byTail.get(tail(path)) : undefined;
  }
  dispose() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls.clear();
  }
}

export function mimeOf(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  return (
    {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
      mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
      mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', tgs: 'application/x-tgsticker', pdf: 'application/pdf',
    } as Record<string, string>
  )[ext] ?? 'application/octet-stream';
}

function classify(files: InFile[]): Collected {
  const media = new MediaStore();
  const json: InFile[] = [];
  const html = new Map<string, InFile[]>();
  for (const f of files) {
    const p = f.path.toLowerCase();
    const base = p.split('/').pop() ?? p;
    if (base.endsWith('.json')) json.push(f);
    else if (/^messages\d*\.html$/.test(base)) {
      const dir = f.path.split('/').slice(0, -1).join('/');
      if (!html.has(dir)) html.set(dir, []);
      html.get(dir)!.push(f);
    } else if (!/\.(html|css|js)$/.test(base) && !p.includes('/css/') && !p.includes('/js/')) media.add(f);
  }
  // result.json — главный файл; если их несколько, ближайший к корню
  json.sort((a, b) => Number(b.path.endsWith('result.json')) - Number(a.path.endsWith('result.json')) || a.path.split('/').length - b.path.split('/').length || b.size - a.size);
  return { json, html, media, total: files.length };
}

async function expandZip(file: File): Promise<InFile[]> {
  const JSZip = (await import('jszip')).default as unknown as typeof JSZipType;
  const zip = await JSZip.loadAsync(file);
  const out: InFile[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    out.push({ path: norm(path), size: (entry as any)._data?.uncompressedSize ?? 0, get: () => entry.async('blob') });
  });
  return out;
}

async function wrapFiles(list: { file: File; path: string }[]): Promise<InFile[]> {
  const out: InFile[] = [];
  for (const { file, path } of list) {
    if (/\.zip$/i.test(file.name)) out.push(...(await expandZip(file)));
    else out.push({ path: norm(path || file.name), size: file.size, get: async () => file });
  }
  return out;
}

export async function collectFromInput(files: FileList | File[]): Promise<Collected> {
  const arr = [...files].map((f) => ({ file: f, path: (f as any).webkitRelativePath || f.name }));
  return classify(await wrapFiles(arr));
}

export async function collectFromDrop(dt: DataTransfer): Promise<Collected> {
  const entries: any[] = [];
  for (const item of [...dt.items]) {
    const e = (item as any).webkitGetAsEntry?.();
    if (e) entries.push(e);
  }
  if (!entries.length) return collectFromInput(dt.files);
  const list: { file: File; path: string }[] = [];
  const walk = async (entry: any, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file: File = await new Promise((res, rej) => entry.file(res, rej));
      list.push({ file, path: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch: any[];
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, prefix + entry.name + '/');
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, '');
  return classify(await wrapFiles(list));
}
