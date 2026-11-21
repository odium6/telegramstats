import { useRef, useState } from 'react';
import { Button } from 'glisse';
import { Icon } from './icons';

interface Props {
  onFiles: (f: FileList | File[]) => void;
  onDrop: (dt: DataTransfer) => void;
  onDemo: () => void;
  loading: string | null;
  error?: string;
  dark: boolean;
  toggleTheme: () => void;
}

const FEATURES = [
  { icon: '🚀', title: 'Кто пишет первым — по-настоящему', text: 'Не «кто написал после полуночи», а анализ пауз, приветствий, вопросов «как дела» и отложенных ответов. С погрешностью в процентах.' },
  { icon: '🗓️', title: 'Время и ритм', text: 'Тепловые карты по часам и дням недели, календарь активности за все годы, серии и самые долгие паузы.' },
  { icon: '⚡', title: 'Скорость ответов', text: 'Медиана, распределение и динамика по месяцам и часам суток. Кто отвечает быстрее и когда.' },
  { icon: '🔤', title: 'Слова и эмоции', text: 'Облако слов, любимые фразы, эмодзи, реакции, смех, «люблю», вопросы, тональность по месяцам.' },
  { icon: '🖼️', title: 'Медиа-галерея', text: 'Загрузите папку экспорта целиком — фото, видео, кружки, голосовые и стикеры откроются прямо здесь.' },
  { icon: '📄', title: 'Красивый отчёт', text: 'Экспорт в HTML/PDF с графиками, CSV и JSON — удобно читать, распечатать и сохранить.' },
];

export function Landing({ onFiles, onDrop, onDemo, loading, error, dark, toggleTheme }: Props) {
  const dirInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="landing">
      <div className="landing-top">
        <div className="brand">
          <span className="brand-mark">◔</span> TG Stats
        </div>
        <button className="icon-btn" onClick={toggleTheme} aria-label="Сменить тему">
          {dark ? <Icon.sun size={19} /> : <Icon.moon size={19} />}
        </button>
      </div>

      <header className="hero">
        <h1>
          Анализ переписки Telegram
          <br />
          <span className="grad">до мельчайших деталей</span>
        </h1>
        <p className="lead">Дашборд с графиками, тепловыми картами и честной оценкой точности. Работает полностью в вашем браузере.</p>
        <div className="privacy">
          <Icon.lock size={16} /> Файлы не загружаются на сервер — обработка идёт локально, даже без интернета
        </div>
      </header>

      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDrop(e.dataTransfer);
        }}
      >
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <div>{loading}</div>
          </div>
        ) : (
          <>
            <div className="drop-icon">
              <Icon.upload size={34} />
            </div>
            <div className="drop-title">Перетащите сюда папку экспорта</div>
            <div className="drop-sub">или файл result.json, messages.html, ZIP-архив</div>
            <div className="drop-actions">
              <Button variant="filled" icon={<Icon.folder size={18} />} onClick={() => dirInput.current?.click()}>
                Выбрать папку
              </Button>
              <Button icon={<Icon.file size={18} />} onClick={() => fileInput.current?.click()}>
                Выбрать файл
              </Button>
              <Button icon={<Icon.sparkle size={18} />} onClick={onDemo}>
                Демо
              </Button>
            </div>
            <div className="drop-note">Папка целиком = статистика + просмотр фото, видео и голосовых</div>
          </>
        )}
        <input ref={dirInput} type="file" hidden multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => e.target.files?.length && onFiles(e.target.files)} />
        <input ref={fileInput} type="file" hidden multiple accept=".json,.html,.zip,application/json,text/html,application/zip" onChange={(e) => e.target.files?.length && onFiles(e.target.files)} />
      </div>
      {error && (
        <div className="error-banner" role="alert">
          ⚠️ {error}
        </div>
      )}

      <section className="howto">
        <h2>Как получить файл экспорта</h2>
        <ol className="steps">
          <li>
            <b>Откройте Telegram Desktop</b> (на компьютере — в мобильном приложении экспорта нет).
          </li>
          <li>
            Откройте нужный чат → <b>⋮</b> в правом верхнем углу → <b>«Экспорт истории чата»</b>.
          </li>
          <li>
            Отметьте нужные медиа (фото, видео, голосовые, кружки, стикеры) и выберите формат <b>«Машиночитаемый JSON»</b> — он точнее HTML.
          </li>
          <li>
            Нажмите «Экспортировать» и перетащите получившуюся папку <code>ChatExport_…</code> сюда.
          </li>
        </ol>
        <p className="muted small">
          Весь аккаунт сразу: <b>Настройки → Продвинутые настройки → Экспорт данных из Telegram</b> — после загрузки можно выбрать любой чат из списка. Поддерживается и HTML-экспорт, но в нём нет ID участников и отметок редактирования.
        </p>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <footer className="foot muted small">
        Открытый исходный код · Ничего не отслеживается · Данные остаются в вашем браузере до закрытия вкладки
      </footer>
    </div>
  );
}
