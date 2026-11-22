import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canPickDirectory, collectFromDrop, collectFromInput, pickDirectory, type Collected } from '../core/loader';
import { Icon } from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Получены файлы (папка, файл, ZIP или перетаскивание). */
  onCollected: (c: Collected) => void;
  onDemo?: () => void;
  onError: (msg: string) => void;
  /** 'chat' — загрузка переписки, 'media' — догрузка медиа к уже открытому чату */
  mode?: 'chat' | 'media';
}

function Tile({ icon, title, text, badge, onClick, accent }: { icon: ReactNode; title: string; text: string; badge?: string; onClick: () => void; accent?: boolean }) {
  return (
    <button className={`im-tile ${accent ? 'accent' : ''}`} onClick={onClick}>
      <span className="im-tile-icon">{icon}</span>
      <span className="im-tile-body">
        <span className="im-tile-title">
          {title}
          {badge && <span className="im-badge">{badge}</span>}
        </span>
        <span className="im-tile-text">{text}</span>
      </span>
      <Icon.right size={18} />
    </button>
  );
}

/** Собственное меню загрузки вместо системного окна браузера. */
export function ImportMenu({ open, onClose, onCollected, onDemo, onError, mode = 'chat' }: Props) {
  const dirInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    first.current?.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const run = async (fn: () => Promise<Collected | null>) => {
    try {
      setBusy(true);
      const c = await fn();
      if (c) {
        onClose();
        onCollected(c);
      }
    } catch (e) {
      onError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = () => {
    if (canPickDirectory) run(pickDirectory);
    else dirInput.current?.click();
  };

  return (
    <div className="im-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`im-sheet ${over ? 'over' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="im-title"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const dt = e.dataTransfer;
          run(() => collectFromDrop(dt));
        }}
      >
        <div className="im-head">
          <div>
            <h2 id="im-title">{mode === 'media' ? 'Добавить медиафайлы' : 'Загрузить переписку'}</h2>
            <div className="im-private">
              <Icon.lock size={14} /> Всё остаётся на этом компьютере
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon.close size={19} />
          </button>
        </div>

        {busy ? (
          <div className="loading im-loading">
            <div className="spinner" />
            <div>Читаю файлы…</div>
          </div>
        ) : (
          <div className="im-tiles" ref={first}>
            <Tile
              accent
              icon={<Icon.folder size={24} />}
              title={mode === 'media' ? 'Папка экспорта' : 'Папка экспорта'}
              badge={mode === 'chat' ? 'лучший вариант' : undefined}
              text={mode === 'media' ? 'Та же папка ChatExport_…, где лежат photos, video_files и voice_messages' : 'Статистика + просмотр фото, видео, кружков, голосовых и стикеров'}
              onClick={pickFolder}
            />
            {mode === 'chat' && (
              <Tile icon={<Icon.file size={24} />} title="Только файл переписки" text="result.json, messages.html или ZIP-архив — быстро, но без просмотра медиа" onClick={() => fileInput.current?.click()} />
            )}
            {mode === 'chat' && onDemo && (
              <Tile
                icon={<Icon.sparkle size={24} />}
                title="Демо"
                text="Посмотреть возможности на вымышленной переписке"
                onClick={() => {
                  onClose();
                  onDemo();
                }}
              />
            )}
          </div>
        )}

        <div className={`im-drop ${over ? 'over' : ''}`}>
          <Icon.upload size={20} />
          <span>
            {over ? 'Отпустите, чтобы открыть' : <>или <b>перетащите папку</b> прямо в это окно — без лишних вопросов от браузера</>}
          </span>
        </div>

        <p className="im-note">
          {canPickDirectory
            ? 'После выбора папки браузер попросит разрешение на просмотр файлов — это стандартная защита. Сайт только читает файлы и технически не может ничего отправить в интернет.'
            : 'Браузер может показать окно «загрузить файлы на сайт» — это его стандартная формулировка. На самом деле файлы читаются только на вашем компьютере, сайту запрещено что-либо отправлять.'}
        </p>

        <input ref={dirInput} type="file" hidden multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => { const f = e.target.files; if (f?.length) run(() => collectFromInput(f)); e.target.value = ''; }} />
        <input ref={fileInput} type="file" hidden multiple accept=".json,.html,.zip,application/json,text/html,application/zip" onChange={(e) => { const f = e.target.files; if (f?.length) run(() => collectFromInput(f)); e.target.value = ''; }} />
      </div>
    </div>
  );
}
