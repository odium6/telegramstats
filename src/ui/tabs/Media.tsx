import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Button, SegmentedControl } from 'glisse';
import { Card, ChartCard, Dot, Stat, useApp, useDocTop } from '../components';
import { callsMonthlyOption, kindsOption, num } from '../charts';
import { Lightbox, Thumb, useMediaUrl } from '../MediaView';
import { colorOf } from '../theme';
import { fmtDuration } from '../../core/time';
import { Icon } from '../icons';
import type { Msg } from '../../core/types';

const FILTERS = [
  { value: 'visual', label: 'Фото и видео', kinds: ['photo', 'video', 'gif'] },
  { value: 'photo', label: 'Фото', kinds: ['photo'] },
  { value: 'video', label: 'Видео', kinds: ['video', 'gif'] },
  { value: 'round', label: 'Кружки', kinds: ['round'] },
  { value: 'voice', label: 'Голосовые', kinds: ['voice'] },
  { value: 'sticker', label: 'Стикеры', kinds: ['sticker'] },
  { value: 'audio', label: 'Музыка', kinds: ['audio'] },
  { value: 'file', label: 'Файлы', kinds: ['file'] },
];

export function MediaTab() {
  const { a, t, chat, media, openMediaPicker } = useApp();
  const kinds = useMemo(() => kindsOption(a, t), [a, t]);
  const calls = useMemo(() => callsMonthlyOption(a, t), [a, t]);
  const k = (kind: string) => a.people.reduce((s, p) => s + ((p.kinds as any)[kind] ?? 0), 0);
  const hasFiles = media.count > 0 || !!media.generator;
  const nameOf = (key: string) => a.people.find((p) => p.key === key)?.name ?? chat.participants.find((p) => p.key === key)?.name ?? key;

  return (
    <div className="grid">
      <div className="kpis span-12">
        <Stat label="Фото" value={num(k('photo'))} />
        <Stat label="Видео" value={num(k('video'))} />
        <Stat label="Кружки" value={num(k('round'))} sub={fmtDuration(a.people.reduce((s, p) => s + p.roundSec, 0))} />
        <Stat label="Голосовые" value={num(k('voice'))} sub={fmtDuration(a.totals.voiceSec)} />
        <Stat label="Стикеры" value={num(k('sticker'))} />
        <Stat label="GIF" value={num(k('gif'))} />
        <Stat label="Файлы" value={num(k('file'))} />
        <Stat label="Звонки" value={num(a.calls.count)} sub={`${fmtDuration(a.calls.totalSec)} · ${num(a.calls.missed)} пропущено`} />
      </div>

      {!hasFiles && (
        <Card span={12} className="notice">
          <div className="notice-row">
            <Icon.folder size={28} />
            <div>
              <b>Медиафайлы не загружены.</b> Статистика уже посчитана, но для просмотра фото, видео и голосовых выберите папку экспорта (ту, где лежит result.json и папки photos, video_files…). Файлы тоже читаются только локально.
            </div>
            <Button variant="filled" onClick={openMediaPicker}>Выбрать папку</Button>
          </div>
        </Card>
      )}

      {a.kinds.length > 1 && <ChartCard span={7} title="Типы сообщений" option={kinds} height={320} />}
      <Card span={5} title="Голос и звонки по участникам">
        <ul className="sent-list">
          {a.people.slice(0, 8).map((p) => (
            <li key={p.key}>
              <Dot color={colorOf(t, p.idx)} /> {p.name}
              <span className="muted small">🎙 {fmtDuration(p.voiceSec)} · ⭕ {fmtDuration(p.roundSec)} · 📞 {num(p.callsMade)} ({fmtDuration(p.callSec)})</span>
            </li>
          ))}
        </ul>
        {a.calls.count > 0 && (
          <p className="small muted">Самый долгий звонок — {fmtDuration(a.calls.longest)}, в среднем {fmtDuration(a.calls.totalSec / Math.max(1, a.calls.count - a.calls.missed))}.</p>
        )}
      </Card>
      {a.calls.count > 0 && <ChartCard span={12} title="Звонки по месяцам" option={calls} height={220} />}

      {a.stickers.length > 0 && (
        <Card span={12} title="Любимые стикеры">
          <div className="sticker-grid">
            {a.stickers.slice(0, 24).map((s) => (
              <StickerCell key={s.key} path={s.thumb ?? s.path} emoji={s.emoji} count={s.count} />
            ))}
          </div>
        </Card>
      )}

      <Gallery nameOf={nameOf} />
    </div>
  );
}

function StickerCell({ path, emoji, count }: { path?: string; emoji?: string; count: number }) {
  const { media } = useApp();
  const { url } = useMediaUrl(media, path && !/\.tgs$/i.test(path) ? path : undefined);
  return (
    <div className="sticker-cell" title={`${count} раз`}>
      {url ? <img src={url} alt={emoji ?? ''} /> : <span>{emoji ?? '🧩'}</span>}
      <small>{count}</small>
    </div>
  );
}

function Gallery({ nameOf }: { nameOf: (k: string) => string }) {
  const { a, chat, media, goToMessage } = useApp();
  const [filter, setFilter] = useState('visual');
  const [who, setWho] = useState('all');
  const [order, setOrder] = useState<'new' | 'old'>('new');
  const [open, setOpen] = useState<number | null>(null);
  const items = useMemo(() => {
    const kinds = new Set(FILTERS.find((f) => f.value === filter)!.kinds);
    const list = chat.messages.filter((m) => kinds.has(m.kind) && m.ts >= a.range.start && m.ts <= a.range.end && (who === 'all' || m.from === who));
    return order === 'new' ? list.reverse() : list;
  }, [chat, filter, who, order, a.range]);
  const listMode = filter === 'voice' || filter === 'audio' || filter === 'file';

  const wrap = useRef<HTMLDivElement>(null);
  const { top, width } = useDocTop(wrap, [filter]);
  const cols = Math.max(2, Math.floor((width || 800) / (filter === 'sticker' || filter === 'round' ? 120 : 170)));
  const rows = listMode ? items.length : Math.ceil(items.length / cols);
  // высота строки = ширина плитки (квадрат) + зазор 6px
  const rowH = listMode ? 64 : ((width || 800) - 6 * (cols - 1)) / cols + 6;
  const v = useWindowVirtualizer({ count: rows, estimateSize: () => rowH, overscan: 3, scrollMargin: top });
  useEffect(() => v.measure(), [rowH, cols, listMode, top, v]);

  return (
    <Card span={12} title={`Галерея · ${num(items.length)}`}>
      <div className="gallery-ctrls">
        <div className="seg-scroll"><SegmentedControl aria-label="Тип медиа" value={filter} onValueChange={setFilter} items={FILTERS.map((f) => ({ value: f.value, label: f.label }))} /></div>
        <div className="inline">
          {a.people.length > 1 && (
            <select className="select small" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Отправитель">
              <option value="all">Все отправители</option>
              {a.people.slice(0, 30).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          )}
          <SegmentedControl aria-label="Сортировка" value={order} onValueChange={(v2) => setOrder(v2 as any)} items={[{ value: 'new', label: 'Новые' }, { value: 'old', label: 'Старые' }]} />
        </div>
      </div>
      <div ref={wrap} className="gallery" style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.key} className={listMode ? 'gallery-list-row' : 'gallery-row'} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: row.size, transform: `translateY(${row.start - v.options.scrollMargin}px)`, gridTemplateColumns: listMode ? undefined : `repeat(${cols}, 1fr)` }}>
            {listMode ? (
              <AudioRow m={items[row.index]} name={nameOf(items[row.index].from)} onJump={() => goToMessage(items[row.index].id)} />
            ) : (
              items.slice(row.index * cols, row.index * cols + cols).map((m, j) => <Thumb key={m.id} m={m} media={media} onClick={() => setOpen(row.index * cols + j)} />)
            )}
          </div>
        ))}
      </div>
      {!items.length && <p className="muted">Нет медиа этого типа за выбранный период.</p>}
      {open !== null && <Lightbox items={items} index={open} setIndex={setOpen} media={media} nameOf={nameOf} onJump={goToMessage} />}
    </Card>
  );
}

function AudioRow({ m, name, onJump }: { m: Msg; name: string; onJump: () => void }) {
  const { media } = useApp();
  const [load, setLoad] = useState(false);
  const { url, state } = useMediaUrl(media, m.media?.path, load);
  const icon = m.kind === 'voice' ? '🎙️' : m.kind === 'audio' ? '🎵' : '📄';
  return (
    <div className="audio-row">
      <span className="audio-icon">{icon}</span>
      <div className="audio-meta">
        <b>{m.kind === 'file' ? m.media?.name ?? m.media?.path?.split('/').pop() : m.kind === 'audio' ? `${m.media?.performer ? m.media.performer + ' — ' : ''}${m.media?.title ?? m.media?.name ?? 'Аудио'}` : name}</b>
        <span className="muted small">{new Date(m.ts * 1000).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}{m.media?.duration ? ` · ${fmtDuration(m.media.duration)}` : ''}{m.kind !== 'voice' ? ` · ${name}` : ''}</span>
      </div>
      <div className="audio-ctl">
        {m.media?.missing ? (
          <span className="muted small">файл не выгружен</span>
        ) : m.kind === 'file' ? (
          url ? <a className="link-btn" href={url} download={m.media?.name}>Скачать</a> : <button className="link-btn" onClick={() => setLoad(true)}>{state === 'none' ? 'нет в папке' : 'Открыть'}</button>
        ) : url ? (
          <audio src={url} controls autoPlay preload="none" />
        ) : (
          <button className="icon-btn" onClick={() => setLoad(true)} aria-label="Воспроизвести">{state === 'none' ? '✕' : <Icon.play size={16} />}</button>
        )}
        <button className="icon-btn" onClick={onJump} aria-label="Показать в переписке" title="Показать в переписке"><Icon.jump size={16} /></button>
      </div>
    </div>
  );
}
