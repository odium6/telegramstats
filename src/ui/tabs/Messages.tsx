import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { SearchField, SegmentedControl } from 'glisse';
import { Card, useApp } from '../components';
import { Lightbox, Thumb } from '../MediaView';
import { colorOf } from '../theme';
import { kindLabel } from '../../core/analyze';
import { fmtDuration } from '../../core/time';
import type { Msg } from '../../core/types';

const SERVICE_LABEL: Record<string, string> = {
  create_group: 'создал(а) группу', invite_members: 'добавил(а) участников', remove_members: 'удалил(а) участников', join_group_by_link: 'вступил(а) по ссылке',
  edit_group_title: 'изменил(а) название', edit_group_photo: 'изменил(а) фото', pin_message: 'закрепил(а) сообщение', phone_call: 'звонок',
  migrate_from_group: 'группа преобразована', clear_history: 'история очищена', set_messages_ttl: 'изменил(а) автоудаление', joined_telegram: 'присоединился(-ась) к Telegram',
  take_screenshot: 'сделал(а) скриншот', edit_chat_theme: 'сменил(а) тему чата', group_call: 'видеочат',
};

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const out: ReactNode[] = [];
  const low = text.toLowerCase();
  let i = 0;
  let k = 0;
  for (;;) {
    const j = low.indexOf(q, i);
    if (j < 0) break;
    out.push(text.slice(i, j), <mark key={k++}>{text.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  out.push(text.slice(i));
  return out;
}

export function MessagesTab({ focusId, clearFocus }: { focusId: number | null; clearFocus: () => void }) {
  const { a, chat, t, media } = useApp();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [who, setWho] = useState('all');
  const [kind, setKind] = useState('all');
  const [lb, setLb] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const colorBy = useMemo(() => new Map(chat.participants.map((p, i) => [p.key, colorOf(t, i < 8 ? i : -1)])), [chat, t]);
  const nameBy = useMemo(() => new Map(chat.participants.map((p) => [p.key, p.name])), [chat]);
  const byId = useMemo(() => new Map(chat.messages.map((m) => [m.id, m])), [chat]);

  const list = useMemo(() => {
    const searching = dq || who !== 'all' || kind !== 'all';
    return chat.messages.filter((m) => {
      if (m.ts < a.range.start - 1 || m.ts > a.range.end + 1) return false;
      if (who !== 'all' && m.from !== who) return false;
      if (kind === 'media' && (!m.media || m.kind === 'text')) return false;
      if (kind === 'links' && !m.links?.length) return false;
      if (kind === 'questions' && !m.text.includes('?')) return false;
      if (kind === 'replies' && m.replyTo === undefined) return false;
      if (kind === 'reactions' && !m.reactions?.length) return false;
      if (dq && !m.text.toLowerCase().includes(dq) && !(m.media?.name ?? '').toLowerCase().includes(dq)) return false;
      if (searching && m.service && m.kind !== 'call') return false;
      return true;
    });
  }, [chat, a.range, who, kind, dq]);
  const mediaItems = useMemo(() => list.filter((m) => m.media && ['photo', 'video', 'gif', 'round', 'sticker', 'voice', 'audio', 'file'].includes(m.kind)), [list]);

  const wrap = useRef<HTMLDivElement>(null);
  const v = useWindowVirtualizer({ count: list.length, estimateSize: () => 72, overscan: 8, scrollMargin: wrap.current?.offsetTop ?? 0 });

  useEffect(() => {
    if (focusId === null) return;
    setQ('');
    setWho('all');
    setKind('all');
    const id = focusId;
    clearFocus();
    requestAnimationFrame(() => {
      const idx = chat.messages.filter((m) => m.ts >= a.range.start - 1 && m.ts <= a.range.end + 1).findIndex((m) => m.id === id);
      if (idx >= 0) {
        v.scrollToIndex(idx, { align: 'center' });
        setTimeout(() => v.scrollToIndex(idx, { align: 'center' }), 120);
        setFlash(id);
        setTimeout(() => setFlash(null), 2500);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const jumpToDate = (iso: string) => {
    if (!iso) return;
    const ts = new Date(iso + 'T00:00').getTime() / 1000;
    const idx = list.findIndex((m) => m.ts >= ts);
    if (idx >= 0) v.scrollToIndex(idx, { align: 'start' });
  };

  return (
    <div className="grid">
      <Card span={12} className="msg-toolbar">
        <div className="msg-ctrls">
          <SearchField value={q} onValueChange={setQ} placeholder="Поиск по сообщениям" aria-label="Поиск по сообщениям" />
          <div className="inline wrap">
            {a.people.length > 1 && (
              <select className="select small" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Отправитель">
                <option value="all">Все</option>
                {a.people.slice(0, 50).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            )}
            <div className="seg-scroll"><SegmentedControl
              aria-label="Тип"
              value={kind}
              onValueChange={setKind}
              items={[{ value: 'all', label: 'Все' }, { value: 'media', label: 'Медиа' }, { value: 'links', label: 'Ссылки' }, { value: 'questions', label: 'Вопросы' }, { value: 'reactions', label: 'С реакциями' }]}
            /></div>
            <input type="date" className="select small" onChange={(e) => jumpToDate(e.target.value)} aria-label="Перейти к дате" title="Перейти к дате" />
          </div>
          <div className="muted small">Найдено: {list.length.toLocaleString('ru-RU')}</div>
        </div>
      </Card>
      <div className="span-12 chat-view" ref={wrap} style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map((row) => {
          const m = list[row.index];
          const day = new Date(m.ts * 1000).toDateString();
          const showDay = row.index === 0 || new Date(list[row.index - 1].ts * 1000).toDateString() !== day;
          const joined = row.index > 0 && list[row.index - 1].from === m.from && !showDay && m.ts - list[row.index - 1].ts < 600 && !list[row.index - 1].service;
          const reply = m.replyTo !== undefined ? byId.get(m.replyTo) : undefined;
          return (
            <div key={row.key} data-index={row.index} ref={v.measureElement} className="msg-slot" style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${row.start - v.options.scrollMargin}px)` }}>
              {showDay && <div className="day-sep"><span>{new Date(m.ts * 1000).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>}
              {m.service && m.kind !== 'call' ? (
                <div className="service-msg">{nameBy.get(m.from) ? `${nameBy.get(m.from)} ` : ''}{m.action && SERVICE_LABEL[m.action] ? SERVICE_LABEL[m.action] : m.text || m.action}</div>
              ) : (
                <div className={`msg ${joined ? 'joined' : ''} ${flash === m.id ? 'flash' : ''}`}>
                  {!joined && <div className="msg-avatar" style={{ background: colorBy.get(m.from) }}>{(nameBy.get(m.from) ?? '?').slice(0, 1)}</div>}
                  <div className="msg-body">
                    {!joined && <div className="msg-from" style={{ color: colorBy.get(m.from) }}>{nameBy.get(m.from) ?? m.from}</div>}
                    {m.fwd && <div className="msg-fwd">Переслано от {m.fwd}</div>}
                    {reply && (
                      <button className="msg-reply" style={{ borderColor: colorBy.get(reply.from) }} onClick={() => { const i = list.findIndex((x) => x.id === reply.id); if (i >= 0) { v.scrollToIndex(i, { align: 'center' }); setFlash(reply.id); setTimeout(() => setFlash(null), 2000); } }}>
                        <b style={{ color: colorBy.get(reply.from) }}>{nameBy.get(reply.from)}</b>
                        <span>{reply.text ? reply.text.slice(0, 90) : kindLabel(reply.kind)}</span>
                      </button>
                    )}
                    {m.kind === 'call' ? (
                      <div className="msg-call">📞 {m.call?.reason === 'missed' ? 'Пропущенный звонок' : m.call?.reason === 'busy' ? 'Отклонённый звонок' : 'Звонок'}{m.call?.duration ? ` · ${fmtDuration(m.call.duration)}` : ''}</div>
                    ) : m.media && m.kind !== 'text' ? (
                      <div className="msg-media">
                        <Thumb m={m} media={media} size="sm" onClick={() => setLb(mediaItems.indexOf(m))} />
                      </div>
                    ) : m.kind !== 'text' ? (
                      <div className="msg-kind">{m.kind === 'poll' && m.poll ? `📊 ${m.poll.q} — ${m.poll.answers.map((x) => `${x.text} (${x.voters})`).join(', ')}` : m.kind === 'location' && m.loc ? `📍 ${m.loc.lat.toFixed(5)}, ${m.loc.lon.toFixed(5)}` : `[${kindLabel(m.kind)}]`}</div>
                    ) : null}
                    {m.text && <div className="msg-text">{highlight(m.text, dq)}</div>}
                    <div className="msg-foot">
                      {m.reactions?.map((r, i) => <span className="msg-react" key={i}>{r.emoji} {r.count > 1 ? r.count : ''}</span>)}
                      <span className="msg-time">{m.edited ? 'изм. ' : ''}{new Date(m.ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!list.length && <p className="muted span-12">Ничего не найдено.</p>}
      {lb !== null && lb >= 0 && <Lightbox items={mediaItems} index={lb} setIndex={setLb} media={media} nameOf={(k) => nameBy.get(k) ?? k} onJump={(id) => { const i = list.findIndex((x) => x.id === id); if (i >= 0) v.scrollToIndex(i, { align: 'center' }); }} />}
    </div>
  );
}
