import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Menu, SegmentedControl, Slider, Switch, TabBar } from 'glisse';
import type { Analysis } from '../core/analyze';
import type { AnalysisOptions, Chat } from '../core/types';
import type { Collected, MediaStore } from '../core/loader';
import { ImportMenu } from './ImportMenu';
import { chatTypeName } from '../core/parseJson';
import { fmtDuration } from '../core/time';
import { AppCtx, type Ctx } from './components';
import { Icon } from './icons';
import type { Theme } from './theme';
import { colorOf } from './theme';
import { OverviewTab } from './tabs/Overview';
import { ActivityTab } from './tabs/Activity';
import { DialogsTab } from './tabs/Dialogs';
import { ContentTab } from './tabs/Content';
import { MediaTab } from './tabs/Media';
import { MessagesTab } from './tabs/Messages';
import { AccuracyTab } from './tabs/Accuracy';
import { exportCsvMessages, exportCsvPeople, exportJson, exportReport } from './report';

interface Props {
  chat: Chat;
  a: Analysis;
  t: Theme;
  media: MediaStore;
  opts: AnalysisOptions;
  setOpts: (o: AnalysisOptions) => void;
  busy: boolean;
  onReset: () => void;
  dark: boolean;
  toggleTheme: () => void;
  addMedia: (c: Collected) => void;
}

const TABS = [
  { value: 'overview', label: 'Обзор', icon: <Icon.overview /> },
  { value: 'time', label: 'Время', icon: <Icon.time /> },
  { value: 'dialogs', label: 'Диалоги', icon: <Icon.dialog /> },
  { value: 'text', label: 'Текст', icon: <Icon.text /> },
  { value: 'media', label: 'Медиа', icon: <Icon.media /> },
  { value: 'messages', label: 'Чат', icon: <Icon.messages /> },
  { value: 'accuracy', label: 'Точность', icon: <Icon.accuracy /> },
];

const toDateInput = (ts: number) => new Date(ts * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function Dashboard({ chat, a, t, media, opts, setOpts, busy, onReset, dark, toggleTheme, addMedia }: Props) {
  const [tab, setTab] = useState(() => (location.hash.slice(1) && TABS.some((x) => x.value === location.hash.slice(1)) ? location.hash.slice(1) : 'overview'));
  const [focusId, setFocusId] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  const [mediaMenu, setMediaMenu] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
    window.scrollTo({ top: 0 });
  }, [tab]);

  const ctx: Ctx = useMemo(
    () => ({
      a, chat, t, media,
      goToMessage: (id: number) => {
        setFocusId(id);
        setTab('messages');
      },
      openMediaPicker: () => setMediaMenu(true),
    }),
    [a, chat, t, media],
  );

  const chatStart = chat.messages[0]?.ts ?? 0;
  const chatEnd = chat.messages[chat.messages.length - 1]?.ts ?? 0;
  // Пресеты периода. Выбранный пресет вычисляется из opts, поэтому переключатель
  // всегда показывает актуальное значение; ручной ввод дат даёт пункт «Свой».
  const DAY = 86400;
  const PRESETS: Record<string, number> = { year: 365, '90': 90, '30': 30 };
  const preset =
    opts.from === undefined && opts.to === undefined
      ? 'all'
      : opts.to === undefined && opts.from !== undefined
        ? (Object.keys(PRESETS).find((k) => opts.from === chatEnd - PRESETS[k] * DAY) ?? 'custom')
        : 'custom';
  const setPreset = (p: string) => {
    if (p === 'custom') return;
    if (p === 'all') setOpts({ ...opts, from: undefined, to: undefined });
    else setOpts({ ...opts, from: chatEnd - PRESETS[p] * DAY, to: undefined });
  };
  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <AppCtx.Provider value={ctx}>
      <div className="dash" data-glisse-backdrop>
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={onReset} aria-label="Открыть другой файл" title="Открыть другой файл">
              <Icon.back size={19} />
            </button>
            <div className="chat-title">
              <h1 title={a.chatName}>{a.chatName}</h1>
              <div className="muted small">
                {chatTypeName(a.chatType)} · {fmtDate(a.range.start)} — {fmtDate(a.range.end)} · {a.totals.messages.toLocaleString('ru-RU')} сообщений
                {chat.source === 'demo' && <span className="badge">демо</span>}
                {busy && <span className="badge pulse">пересчёт…</span>}
              </div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="people-chips">
              {a.series.slice(0, 4).map((s) => (
                <span className="chip" key={s.key}>
                  <span className="dot" style={{ background: colorOf(t, s.idx) }} />
                  {s.name}
                </span>
              ))}
            </div>
            <Button icon={<Icon.settings size={18} />} onClick={() => setSettings((s) => !s)} aria-expanded={settings} aria-label="Настройки">
              <span className="btn-label">Настройки</span>
            </Button>
            <Menu
              aria-label="Экспорт"
              align="end"
              icon={<Icon.download size={18} />}
              items={[
                { label: 'Красивый отчёт (HTML)', icon: <Icon.file size={16} />, onSelect: () => exportReport(a, t, false) },
                { label: 'Печать / сохранить в PDF', icon: <Icon.file size={16} />, onSelect: () => exportReport(a, t, true) },
                'separator',
                { label: 'Статистика (JSON)', onSelect: () => exportJson(a) },
                { label: 'Участники (CSV)', onSelect: () => exportCsvPeople(a) },
                { label: 'Все сообщения (CSV)', onSelect: () => exportCsvMessages(chat, opts) },
              ]}
            />
            <button className="icon-btn" onClick={toggleTheme} aria-label="Сменить тему">
              {dark ? <Icon.sun size={19} /> : <Icon.moon size={19} />}
            </button>
          </div>
        </header>

        {settings && (
          <div className="settings card">
            <div className="settings-row">
              <label>Период</label>
              <div className="seg-scroll">
                <SegmentedControl
                  aria-label="Период"
                  value={preset}
                  onValueChange={setPreset}
                  items={[
                    { value: 'all', label: 'Всё время' },
                    { value: 'year', label: 'Год' },
                    { value: '90', label: '90 дней' },
                    { value: '30', label: '30 дней' },
                    ...(preset === 'custom' ? [{ value: 'custom', label: 'Свой' }] : []),
                  ]}
                />
              </div>
              <div className="date-range">
                <input type="date" value={toDateInput(opts.from ?? chatStart)} min={toDateInput(chatStart)} max={toDateInput(chatEnd)} onChange={(e) => setOpts({ ...opts, from: e.target.value ? new Date(e.target.value + 'T00:00').getTime() / 1000 : undefined })} aria-label="С даты" />
                <span>—</span>
                <input type="date" value={toDateInput(opts.to ?? chatEnd)} min={toDateInput(chatStart)} max={toDateInput(chatEnd)} onChange={(e) => setOpts({ ...opts, to: e.target.value ? new Date(e.target.value + 'T23:59:59').getTime() / 1000 : undefined })} aria-label="По дату" />
              </div>
            </div>
            <div className="settings-row">
              <label>Часовой пояс</label>
              <select
                className="select"
                value={opts.tz === 'local' ? 'local' : String(opts.tz)}
                onChange={(e) => setOpts({ ...opts, tz: e.target.value === 'local' ? 'local' : Number(e.target.value) })}
              >
                <option value="local">Как в браузере ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option>
                {Array.from({ length: 27 }, (_, i) => (i - 12) * 60).map((m) => (
                  <option key={m} value={m}>
                    UTC{m >= 0 ? '+' : '−'}
                    {Math.abs(m / 60)}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-row">
              <label>
                Порог паузы между разговорами
                <span className="muted small"> — пауза дольше считается концом разговора</span>
              </label>
              <div className="inline">
                <Switch aria-label="Автоматически" checked={opts.gapOverride === undefined} onCheckedChange={(c) => setOpts({ ...opts, gapOverride: c ? undefined : Math.round(a.conv.T / 60) * 60 })} />
                <span>{opts.gapOverride === undefined ? `Авто: ${fmtDuration(a.conv.gap.T)}` : fmtDuration(opts.gapOverride)}</span>
              </div>
              {opts.gapOverride !== undefined && (
                <Slider aria-label="Порог паузы, минут" min={10} max={480} step={5} value={Math.round(opts.gapOverride / 60)} onValueChange={(v) => setOpts({ ...opts, gapOverride: v * 60 })} />
              )}
            </div>
            {a.people.length > 2 && a.people.length <= 30 && (
              <div className="settings-row">
                <label>Участники</label>
                <div className="people-toggle">
                  {chat.participants.slice(0, 30).map((p) => {
                    const on = !opts.people?.length || opts.people.includes(p.key);
                    return (
                      <button
                        key={p.key}
                        className={`chip toggle ${on ? 'on' : ''}`}
                        onClick={() => {
                          const cur = opts.people?.length ? opts.people : chat.participants.map((x) => x.key);
                          const next = on ? cur.filter((k) => k !== p.key) : [...cur, p.key];
                          setOpts({ ...opts, people: next.length === chat.participants.length ? undefined : next });
                        }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="settings-row">
              <label>Медиафайлы</label>
              <div className="inline">
                <span className="muted">{media.generator ? 'демо-медиа' : `${media.count.toLocaleString('ru-RU')} файлов загружено`}</span>
                <Button icon={<Icon.folder size={16} />} onClick={() => setMediaMenu(true)}>
                  Добавить папку с медиа
                </Button>
              </div>
            </div>
          </div>
        )}

        {a.warnings.length > 0 && tab === 'overview' && (
          <div className="warnings">
            {a.warnings.map((w, i) => (
              <div key={i} className="warn">ⓘ {w}</div>
            ))}
          </div>
        )}

        <main className="content">
          {tab === 'overview' && <OverviewTab onTab={setTab} />}
          {tab === 'time' && <ActivityTab />}
          {tab === 'dialogs' && <DialogsTab />}
          {tab === 'text' && <ContentTab />}
          {tab === 'media' && <MediaTab />}
          {tab === 'messages' && <MessagesTab focusId={focusId} clearFocus={() => setFocusId(null)} />}
          {tab === 'accuracy' && <AccuracyTab />}
        </main>

        <nav className="tabbar-wrap" aria-label="Разделы">
          <TabBar items={TABS} value={tab} onValueChange={setTab} aria-label="Разделы" />
        </nav>
        <ImportMenu
          open={mediaMenu}
          mode="media"
          onClose={() => setMediaMenu(false)}
          onCollected={(c) => {
            setMediaError(c.media.count ? null : 'В выбранной папке не найдено медиафайлов.');
            addMedia(c);
          }}
          onError={setMediaError}
        />
        {mediaError && (
          <div className="toast" role="alert" onClick={() => setMediaError(null)}>
            ⚠️ {mediaError}
          </div>
        )}
      </div>
    </AppCtx.Provider>
  );
}
