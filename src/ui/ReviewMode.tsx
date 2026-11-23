import { useEffect, useMemo, useState } from 'react';
import { Button } from 'glisse';
import { useApp } from './components';
import { colorOf } from './theme';
import { Icon } from './icons';
import type { Msg } from '../core/types';

/* Режим проверки: алгоритм показывает спорные решения с контекстом, а вы
 * отвечаете «верно / неверно». Ответы сохраняются в браузере, дообучают
 * веса под вашу переписку и дают измеренную (а не расчётную) точность. */

type Item =
  | { kind: 'checkin'; id: number; from: string; p: number; why: string[] }
  | { kind: 'conv'; id: number; opener: string; alt: string; p: number; why: string[] };

export function ReviewMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { a, chat, t, labels, setLabel } = useApp();
  const [i, setI] = useState(0);
  const [answered, setAnswered] = useState(0);
  const idx = useMemo(() => new Map(chat.messages.map((m, k) => [m.id, k])), [chat]);
  const nameOf = (k: string) => chat.participants.find((p) => p.key === k)?.name ?? k;
  const colorBy = useMemo(() => new Map(chat.participants.map((p, k) => [p.key, colorOf(t, k < 8 ? k : -1)])), [chat, t]);

  // очередь: сначала самые спорные, вперемешку оба типа
  const queue = useMemo<Item[]>(() => {
    if (!open) return [];
    const c1: Item[] = a.checkinReview
      .filter((h) => labels.checkin[h.id] === undefined)
      .map((h) => ({ kind: 'checkin', id: h.id, from: h.from, p: h.p, why: h.evidence }));
    const c2: Item[] = a.conv.review
      .filter((c) => labels.conv[c.firstId] === undefined && c.alt)
      .map((c) => ({ kind: 'conv', id: c.firstId, opener: c.opener, alt: c.alt!, p: c.p, why: c.reasons }));
    const byDoubt = (x: Item, y: Item) => Math.abs(x.p - 0.5) - Math.abs(y.p - 0.5);
    c1.sort(byDoubt);
    c2.sort(byDoubt);
    const out: Item[] = [];
    for (let k = 0; k < Math.max(c1.length, c2.length) && out.length < 300; k++) {
      if (c1[k]) out.push(c1[k]);
      if (c2[k]) out.push(c2[k]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const item = queue[i];
  const answer = (v: 0 | 1 | null) => {
    if (!item) return;
    if (v !== null) {
      setLabel(item.kind === 'checkin' ? 'checkin' : 'conv', item.id, v);
      setAnswered((n) => n + 1);
    }
    setI((k) => k + 1);
  };

  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '1') answer(1);
      if (e.key === '2') answer(0);
      if (e.key === '0' || e.key === ' ') answer(null);
    };
    window.addEventListener('keydown', on);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', on);
      document.body.style.overflow = '';
    };
  });

  if (!open) return null;
  const ctx: Msg[] = [];
  if (item) {
    const k = idx.get(item.id) ?? 0;
    for (let j = Math.max(0, k - 5); j < Math.min(chat.messages.length, k + 7); j++) {
      const m = chat.messages[j];
      if (!m.service || m.kind === 'call') ctx.push(m);
    }
  }
  const total = labels ? Object.keys(labels.checkin).length + Object.keys(labels.conv).length : 0;

  return (
    <div className="im-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im-sheet review" role="dialog" aria-modal="true" aria-labelledby="rv-title">
        <div className="im-head">
          <div>
            <h2 id="rv-title">Проверка алгоритма</h2>
            <div className="muted small">
              Ответов в этот раз: {answered} · всего сохранено: {total}. Чем больше ответов, тем точнее алгоритм подстраивается под вашу переписку.
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon.close size={19} />
          </button>
        </div>
        {!item ? (
          <div className="empty">
            {queue.length ? 'Спорные случаи закончились — спасибо! Статистика пересчитается с вашими ответами.' : 'Спорных случаев нет.'}
            <div style={{ marginTop: 14 }}>
              <Button variant="filled" onClick={onClose}>
                Готово
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="review-q">
              {item.kind === 'checkin' ? (
                <>
                  Сообщение, отмеченное <b>&gt;&gt;</b>, — это вопрос <b>«как дела / что делаешь»</b> (интерес к собеседнику)?
                </>
              ) : (
                <>
                  Кто на самом деле начал этот разговор? Первым после паузы написал(а) <b>{nameOf(item.opener)}</b> — но это может быть ответ на прошлое сообщение.
                </>
              )}
              <span className="muted small"> Уверенность алгоритма: {Math.round((item.kind === 'conv' ? Math.max(item.p, 1 - item.p) : item.p) * 100)}%</span>
            </div>
            <div className="review-ctx">
              {ctx.map((m) => (
                <div key={m.id} className={`review-msg ${m.id === item.id ? 'focus' : ''}`}>
                  <span className="review-time">{new Date(m.ts * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <b style={{ color: colorBy.get(m.from) }}>{nameOf(m.from)}:</b> {m.id === item.id ? '>> ' : ''}
                  {m.text || m.transcript || `[${m.kind}]`}
                </div>
              ))}
            </div>
            <details className="small muted">
              <summary>Почему алгоритм сомневается</summary>
              <ul>{item.why.map((w, k) => <li key={k}>{w}</li>)}</ul>
            </details>
            <div className="review-actions">
              {item.kind === 'checkin' ? (
                <>
                  <Button variant="filled" onClick={() => answer(1)}>1 · Да, спрашивает о делах</Button>
                  <Button onClick={() => answer(0)}>2 · Нет</Button>
                </>
              ) : (
                <>
                  <Button variant="filled" onClick={() => answer(1)}>1 · Начал(а) {nameOf(item.opener)}</Button>
                  <Button onClick={() => answer(0)}>2 · Начал(а) {nameOf(item.alt)} (это был ответ)</Button>
                </>
              )}
              <Button onClick={() => answer(null)}>0 · Не знаю</Button>
            </div>
            <div className="muted small">
              {i + 1} из {queue.length} · Esc — закрыть
            </div>
          </>
        )}
      </div>
    </div>
  );
}
