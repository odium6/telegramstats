import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis } from '../core/analyze';
import type { AnalysisOptions, Chat, ChatSummary } from '../core/types';
import { collectFromDrop, collectFromInput, MediaStore, type Collected, type InFile } from '../core/loader';
import { chatNameFromHtml, parseHtmlPages } from '../core/parseHtml';
import type { WorkerIn, WorkerOut } from '../worker/analysis.worker';
import { Landing } from './Landing';
import { Dashboard } from './Dashboard';
import { ChatPicker } from './ChatPicker';
import { DARK, LIGHT } from './theme';
import { demoMediaGenerator } from './demoMedia';

type Stage =
  | { k: 'landing'; error?: string }
  | { k: 'loading'; text: string }
  | { k: 'pick'; list: ChatSummary[]; html?: Map<string, InFile[]> }
  | { k: 'ready' };

function useTheme() {
  const [pref, setPref] = useState<'light' | 'dark' | 'auto'>(() => {
    try {
      return (localStorage.getItem('theme') as 'light' | 'dark' | null) ?? 'auto';
    } catch {
      return 'auto';
    }
  });
  const [sys, setSys] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = pref === 'auto' ? sys : pref === 'dark';
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    setPref(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* приватный режим */
    }
  };
  return { dark, toggle };
}

export function App() {
  const { dark, toggle } = useTheme();
  const t = dark ? DARK : LIGHT;
  const [stage, setStage] = useState<Stage>({ k: 'landing' });
  const [chat, setChat] = useState<Chat | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<AnalysisOptions>({ tz: 'local' });
  const [media, setMedia] = useState(() => new MediaStore());
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'progress') setStage({ k: 'loading', text: m.stage });
      else if (m.type === 'chats') setStage({ k: 'pick', list: m.list });
      else if (m.type === 'chat') {
        setChat(m.chat);
        setStage({ k: 'ready' });
      } else if (m.type === 'analysis') {
        if (m.id === reqId.current) {
          setAnalysis(m.analysis);
          setBusy(false);
        }
      } else if (m.type === 'error') {
        setBusy(false);
        setStage({ k: 'landing', error: m.message });
      }
    };
    return () => w.terminate();
  }, []);

  const post = (m: WorkerIn) => worker.current?.postMessage(m);

  useEffect(() => {
    if (!chat) return;
    setBusy(true);
    const id = ++reqId.current;
    const h = setTimeout(() => post({ type: 'analyze', id, opts }), 60);
    return () => clearTimeout(h);
  }, [chat, opts]);

  const loadCollected = useCallback(async (c: Collected) => {
    media.dispose();
    setMedia(c.media);
    setAnalysis(null);
    setChat(null);
    setOpts({ tz: 'local' });
    if (c.json.length) {
      setStage({ k: 'loading', text: 'Чтение файла…' });
      post({ type: 'json', blob: await c.json[0].get() });
      return;
    }
    if (c.html.size) {
      if (c.html.size > 1) {
        setStage({ k: 'loading', text: 'Поиск чатов…' });
        const groups = [...c.html.entries()];
        const list: ChatSummary[] = [];
        for (let i = 0; i < groups.length; i++) {
          const first = groups[i][1].find((f) => /messages\.html$/i.test(f.path)) ?? groups[i][1][0];
          const text = await (await first.get()).text();
          list.push({ index: i, name: chatNameFromHtml(text), type: 'html', count: groups[i][1].length * 1000, left: false });
        }
        setStage({ k: 'pick', list, html: new Map(groups.map(([, f], i) => [String(i), f])) });
        return;
      }
      await loadHtml([...c.html.values()][0]);
      return;
    }
    setStage({ k: 'landing', error: 'Не найден result.json или messages.html. Выберите папку экспорта Telegram целиком или сам файл.' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  const loadHtml = async (files: { path: string; get: () => Promise<Blob> }[]) => {
    setStage({ k: 'loading', text: `Чтение ${files.length} HTML-страниц…` });
    const pages = await Promise.all(files.map(async (f) => ({ name: f.path, text: await (await f.get()).text() })));
    const parsed = await parseHtmlPages(pages, (p) => setStage({ k: 'loading', text: `Разбор HTML… ${Math.round(p * 100)}%` }));
    post({ type: 'set', chat: parsed });
    setChat(parsed);
    setStage({ k: 'ready' });
  };

  const onFiles = async (files: FileList | File[]) => {
    try {
      setStage({ k: 'loading', text: 'Сбор файлов…' });
      await loadCollected(await collectFromInput(files));
    } catch (e) {
      setStage({ k: 'landing', error: String((e as Error).message ?? e) });
    }
  };
  const onDrop = async (dt: DataTransfer) => {
    try {
      setStage({ k: 'loading', text: 'Сбор файлов…' });
      await loadCollected(await collectFromDrop(dt));
    } catch (e) {
      setStage({ k: 'landing', error: String((e as Error).message ?? e) });
    }
  };
  const onDemo = () => {
    media.dispose();
    const store = new MediaStore();
    store.generator = demoMediaGenerator;
    setMedia(store);
    setAnalysis(null);
    setOpts({ tz: 'local' });
    setStage({ k: 'loading', text: 'Генерация демо-переписки…' });
    post({ type: 'demo' });
  };
  const addMedia = async (files: FileList) => {
    const c = await collectFromInput(files);
    const store = new MediaStore();
    store.merge(media);
    store.merge(c.media);
    setMedia(store);
  };

  const reset = () => {
    media.dispose();
    setChat(null);
    setAnalysis(null);
    setStage({ k: 'landing' });
  };

  const view = useMemo(() => stage, [stage]);

  if (view.k === 'landing' || view.k === 'loading')
    return <Landing onFiles={onFiles} onDrop={onDrop} onDemo={onDemo} loading={view.k === 'loading' ? view.text : null} error={view.k === 'landing' ? view.error : undefined} dark={dark} toggleTheme={toggle} />;
  if (view.k === 'pick')
    return (
      <ChatPicker
        list={view.list}
        onBack={reset}
        onPick={(i) => {
          if (view.html) loadHtml(view.html.get(String(i)) ?? []);
          else {
            setStage({ k: 'loading', text: 'Загрузка чата…' });
            post({ type: 'select', index: i });
          }
        }}
      />
    );
  if (!chat || !analysis)
    return <Landing onFiles={onFiles} onDrop={onDrop} onDemo={onDemo} loading="Считаю статистику…" dark={dark} toggleTheme={toggle} />;
  return <Dashboard chat={chat} a={analysis} t={t} media={media} opts={opts} setOpts={setOpts} busy={busy} onReset={reset} dark={dark} toggleTheme={toggle} addMedia={addMedia} />;
}
