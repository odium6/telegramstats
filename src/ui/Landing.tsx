import { useEffect, useState } from 'react';
import { Button } from 'glisse';
import { Icon } from './icons';
import { ImportMenu } from './ImportMenu';
import type { Collected } from '../core/loader';

interface Props {
  onCollected: (c: Collected) => void;
  onError: (msg: string) => void;
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

export function Landing({ onCollected, onError, onDrop, onDemo, loading, error, dark, toggleTheme }: Props) {
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState(false);

  // перетаскивание папки на любую часть страницы — без системных запросов браузера
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setOver(false);
      if (e.dataTransfer?.files.length && !menu) onDrop(e.dataTransfer);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, [onDrop, menu]);

  return (
    <div className="landing">
      {over && !menu && !loading && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <Icon.upload size={40} />
            <b>Отпустите папку, чтобы начать анализ</b>
            <span>Файлы прочитаются локально</span>
          </div>
        </div>
      )}
      <ImportMenu open={menu} onClose={() => setMenu(false)} onCollected={onCollected} onDemo={onDemo} onError={onError} />
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

      <div className={`dropzone ${over ? 'over' : ''}`}>
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
            <div className="drop-title">Перетащите папку экспорта сюда</div>
            <div className="drop-sub">ChatExport_…, result.json, messages.html или ZIP-архив</div>
            <div className="drop-actions">
              <Button variant="filled" icon={<Icon.upload size={18} />} onClick={() => setMenu(true)}>
                Открыть экспорт
              </Button>
              <Button icon={<Icon.sparkle size={18} />} onClick={onDemo}>
                Демо
              </Button>
            </div>
            <div className="drop-note">Папка целиком = статистика + просмотр фото, видео и голосовых</div>
          </>
        )}
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
