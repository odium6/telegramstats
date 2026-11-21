import { useEffect, useRef, useState } from 'react';
import { Button } from 'glisse';
import type { Msg } from '../core/types';
import type { MediaStore } from '../core/loader';
import { fmtDuration } from '../core/time';
import { Icon } from './icons';

export function useMediaUrl(media: MediaStore, path?: string, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'none'>('idle');
  useEffect(() => {
    let alive = true;
    if (!enabled || !path) {
      setState(path ? 'idle' : 'none');
      return;
    }
    setState('loading');
    media.url(path).then((u) => {
      if (!alive) return;
      setUrl(u);
      setState(u ? 'ok' : 'none');
    }).catch(() => alive && setState('none'));
    return () => {
      alive = false;
    };
  }, [media, path, enabled]);
  return { url, state };
}

const KIND_ICON: Record<string, string> = { video: '🎬', round: '⭕', gif: 'GIF', voice: '🎙️', audio: '🎵', file: '📄', sticker: '🧩', photo: '🖼️' };

export function Thumb({ m, media, onClick, size = 'md' }: { m: Msg; media: MediaStore; onClick?: () => void; size?: 'sm' | 'md' }) {
  const isImg = m.kind === 'photo' || m.kind === 'sticker';
  const src = isImg ? m.media?.thumb ?? m.media?.path : m.media?.thumb;
  const isTgs = /\.tgs$/i.test(m.media?.path ?? '');
  const { url, state } = useMediaUrl(media, isTgs ? undefined : src);
  const [failed, setFailed] = useState(false);
  return (
    <button className={`thumb thumb-${size} kind-${m.kind}`} onClick={onClick} aria-label={`${m.kind} ${new Date(m.ts * 1000).toLocaleString('ru-RU')}`}>
      {url && state === 'ok' && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-ph">{m.kind === 'sticker' && m.media?.emoji ? m.media.emoji : KIND_ICON[m.kind] ?? '•'}</span>
      )}
      {(m.kind === 'video' || m.kind === 'round' || m.kind === 'voice' || m.kind === 'audio') && m.media?.duration ? <span className="thumb-dur">{fmtDuration(m.media.duration)}</span> : null}
      {m.kind === 'gif' && <span className="thumb-dur">GIF</span>}
      {m.media?.missing && <span className="thumb-missing" title="Файл не выгружен в экспорте">нет файла</span>}
    </button>
  );
}

export function Lightbox({ items, index, setIndex, media, nameOf, onJump }: { items: Msg[]; index: number; setIndex: (i: number | null) => void; media: MediaStore; nameOf: (k: string) => string; onJump: (id: number) => void }) {
  const m = items[index];
  const { url, state } = useMediaUrl(media, /\.tgs$/i.test(m?.media?.path ?? '') ? undefined : m?.media?.path);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndex(null);
      if (e.key === 'ArrowRight' && index < items.length - 1) setIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    window.addEventListener('keydown', on);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', on);
      document.body.style.overflow = '';
    };
  }, [index, items.length, setIndex]);
  if (!m) return null;
  const content = () => {
    if (state === 'loading') return <div className="spinner" />;
    if (!url)
      return (
        <div className="lb-missing">
          <div className="big">{m.kind === 'sticker' && m.media?.emoji ? m.media.emoji : KIND_ICON[m.kind] ?? '📎'}</div>
          <p>{m.media?.missing ? 'Файл не был выгружен Telegram (настройки экспорта или ограничение размера).' : 'Файл не найден в загруженной папке. Загрузите папку экспорта целиком.'}</p>
          {m.media?.name && <p className="muted">{m.media.name}</p>}
        </div>
      );
    switch (m.kind) {
      case 'photo':
      case 'sticker':
        return <img src={url} alt="" className="lb-media" />;
      case 'video':
      case 'round':
        return <video src={url} className={`lb-media ${m.kind === 'round' ? 'round' : ''}`} controls autoPlay playsInline />;
      case 'gif':
        return <video src={url} className="lb-media" autoPlay loop muted playsInline />;
      case 'voice':
      case 'audio':
        return (
          <div className="lb-audio">
            <div className="big">{KIND_ICON[m.kind]}</div>
            {m.media?.title && <p><b>{m.media.performer ? `${m.media.performer} — ` : ''}{m.media.title}</b></p>}
            <audio src={url} controls autoPlay />
          </div>
        );
      default:
        return (
          <div className="lb-audio">
            <div className="big">📄</div>
            <p>{m.media?.name ?? m.media?.path}</p>
            <a className="link-btn" href={url} download={m.media?.name ?? 'file'}>Скачать файл</a>
          </div>
        );
    }
  };
  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр медиа"
      onClick={(e) => e.target === e.currentTarget && setIndex(null)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (dx < -50 && index < items.length - 1) setIndex(index + 1);
        if (dx > 50 && index > 0) setIndex(index - 1);
        touch.current = null;
      }}
    >
      <div className="lb-top">
        <div>
          <b>{nameOf(m.from)}</b>
          <span className="muted"> · {new Date(m.ts * 1000).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}</span>
          <span className="muted"> · {index + 1} из {items.length}</span>
        </div>
        <div className="lb-actions">
          {url && <a className="icon-btn" href={url} download={m.media?.name ?? m.media?.path?.split('/').pop()} aria-label="Скачать"><Icon.download size={19} /></a>}
          <Button icon={<Icon.jump size={16} />} onClick={() => { setIndex(null); onJump(m.id); }}>В переписке</Button>
          <button className="icon-btn" onClick={() => setIndex(null)} aria-label="Закрыть"><Icon.close size={20} /></button>
        </div>
      </div>
      <div className="lb-body">
        {index > 0 && <button className="lb-nav left" onClick={() => setIndex(index - 1)} aria-label="Предыдущее"><Icon.left size={28} /></button>}
        <div className="lb-stage">{content()}</div>
        {index < items.length - 1 && <button className="lb-nav right" onClick={() => setIndex(index + 1)} aria-label="Следующее"><Icon.right size={28} /></button>}
      </div>
      {m.text && <div className="lb-caption">{m.text}</div>}
    </div>
  );
}
