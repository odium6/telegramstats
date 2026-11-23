import { useState } from 'react';
import { Button, SegmentedControl, Switch } from 'glisse';
import { useApp } from './components';
import { fmtDuration } from '../core/time';
import type { AnalysisOptions } from '../core/types';

/** Настройки локальных нейросетей (по желанию). */
export function MlPanel({ opts, setOpts }: { opts: AnalysisOptions; setOpts: (o: AnalysisOptions) => void }) {
  const { ml, media, chat } = useApp();
  const { st } = ml;
  const [model, setModel] = useState<'base' | 'small'>(st.asr.model);
  const hasMedia = media.count > 0 || !!media.generator;
  const voices = chat.messages.filter((m) => m.kind === 'voice' || m.kind === 'round').length;
  const pct = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0);
  const busyS = st.sentiment.status === 'loading' || st.sentiment.status === 'running';
  const busyA = st.asr.status === 'loading' || st.asr.status === 'running';

  return (
    <div className="settings-row ml-panel">
      <label>
        Нейросети — по желанию, бесплатно и локально
        <span className="muted small">
          {' '}
          — модели один раз скачиваются с Hugging Face и работают прямо в браузере. Переписка и голосовые никуда не отправляются.
        </span>
      </label>

      <div className="ml-block">
        <div className="ml-title">
          <b>Тональность нейросетью</b> <span className="muted small">rubert-tiny, 12 МБ · точнее словаря, понимает контекст фразы</span>
        </div>
        {st.sentiment.status === 'done' ? (
          <div className="small">✓ Оценено {st.sentiment.done.toLocaleString('ru-RU')} сообщений (выборка по каждому месяцу). Используется во «Тональности» и поиске напряжённых периодов.</div>
        ) : busyS ? (
          <Progress value={pct(st.sentiment.done, st.sentiment.total)} text={st.sentiment.status === 'loading' ? 'Загрузка модели…' : `${st.sentiment.done.toLocaleString('ru-RU')} из ${st.sentiment.total.toLocaleString('ru-RU')}`} />
        ) : (
          <Button onClick={ml.runSentiment}>Оценить тональность</Button>
        )}
        {st.sentiment.error && <div className="small bad">Ошибка: {st.sentiment.error}</div>}
      </div>

      <div className="ml-block">
        <div className="ml-title">
          <b>Расшифровка голосовых и кружков</b> <span className="muted small">Whisper · {voices.toLocaleString('ru-RU')} шт.</span>
        </div>
        {!hasMedia ? (
          <div className="small muted">Нужна папка экспорта с медиа — добавьте её ниже.</div>
        ) : (
          <>
            {!busyA && st.asr.status !== 'done' && (
              <div className="seg-scroll">
                <SegmentedControl
                  aria-label="Модель"
                  value={model}
                  onValueChange={(v) => setModel(v as 'base' | 'small')}
                  items={[
                    { value: 'base', label: 'Быстрая (75 МБ)' },
                    { value: 'small', label: 'Точная (250 МБ)' },
                  ]}
                />
              </div>
            )}
            {(busyA || st.asr.done > 0) && (
              <Progress
                value={pct(st.asr.done, st.asr.total)}
                text={
                  st.asr.status === 'loading'
                    ? 'Загрузка модели…'
                    : `${st.asr.done.toLocaleString('ru-RU')} из ${st.asr.total.toLocaleString('ru-RU')}${st.asr.failed ? ` · не удалось: ${st.asr.failed}` : ''}${st.asr.etaSec ? ` · осталось ≈ ${fmtDuration(st.asr.etaSec)}` : ''}${st.asr.device ? ` · ${st.asr.device === 'webgpu' ? 'видеокарта' : 'процессор'}` : ''}`
                }
              />
            )}
            <div className="inline">
              {busyA ? (
                <Button onClick={ml.pauseAsr}>Пауза</Button>
              ) : st.asr.status !== 'done' ? (
                <Button onClick={() => ml.startAsr(model)}>{st.asr.done ? 'Продолжить' : 'Начать расшифровку'}</Button>
              ) : (
                <span className="small">✓ Все голосовые расшифрованы</span>
              )}
            </div>
            <div className="inline">
              <Switch aria-label="Учитывать расшифровки" checked={!!opts.useTranscripts} onCheckedChange={(c) => setOpts({ ...opts, useTranscripts: c || undefined })} />
              <span className="small">Учитывать расшифровки в статистике (слова, «как дела», тональность, инициатива)</span>
            </div>
            <div className="muted small">Можно поставить на паузу и продолжить позже — готовые расшифровки сохраняются в браузере. Это долго: часы на тысячи голосовых.</div>
          </>
        )}
        {st.asr.error && <div className="small bad">Ошибка: {st.asr.error}</div>}
      </div>
      {st.download && <Progress value={Math.round(st.download.progress)} text={`Скачивание модели: ${st.download.file.split('/').pop()}`} />}
    </div>
  );
}

function Progress({ value, text }: { value: number; text: string }) {
  return (
    <div className="progress">
      <div className="progress-bar">
        <span style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <div className="small muted">{text}</div>
    </div>
  );
}
