import { useState } from 'react';
import { Button } from 'glisse';
import { Card, DataTable, Dot, Stat, useApp } from './components';
import { colorOf } from './theme';
import { Icon } from './icons';
import { fmtDuration } from '../core/time';
import { num, pct } from './charts';
import type { ModelReport } from '../core/calibrate';

const useNames = () => {
  const { a, chat } = useApp();
  return {
    nameOf: (k?: string) => (k ? a.people.find((p) => p.key === k)?.name ?? chat.participants.find((p) => p.key === k)?.name ?? k : '—'),
    idxOf: (k?: string) => a.people.find((p) => p.key === k)?.idx ?? -1,
  };
};
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Кнопки «верно / неверно» для одного решения. */
export function LabelButtons({ value, onSet, yes = 'Верно', no = 'Неверно' }: { value?: 0 | 1; onSet: (v: 0 | 1 | undefined) => void; yes?: string; no?: string }) {
  return (
    <span className="label-btns">
      <button className={`lbl ${value === 1 ? 'on yes' : ''}`} onClick={(e) => { e.stopPropagation(); onSet(value === 1 ? undefined : 1); }} title={yes} aria-label={yes}>✓</button>
      <button className={`lbl ${value === 0 ? 'on no' : ''}`} onClick={(e) => { e.stopPropagation(); onSet(value === 0 ? undefined : 0); }} title={no} aria-label={no}>✕</button>
    </span>
  );
}

function ModelLine({ title, m }: { title: string; m: ModelReport }) {
  if (!m.n) return <li><b>{title}</b>: пока не проверялось</li>;
  return (
    <li>
      <b>{title}</b>: ваших ответов {m.n}, совпадение с алгоритмом <b>{pct(m.agreement ?? 0)}</b>
      {m.ci && <span className="muted"> (95%: {pct(m.ci[0])}–{pct(m.ci[1])})</span>}
      {m.fitted ? <span> · веса дообучены (было {pct(m.baseAgreement ?? 0)})</span> : <span className="muted"> · для дообучения нужно ≥ 12 ответов обоих видов</span>}
    </li>
  );
}

/** Проверка алгоритма и измеренная точность. */
export function CalibrationCard({ span = 12 }: { span?: number }) {
  const { a, openReview } = useApp();
  const left = a.checkinReview.length + a.conv.review.length;
  return (
    <Card span={span} className="hero-card" title="Проверьте алгоритм — это сделает его точнее" hint="Вы отвечаете «верно / неверно» на спорные случаи. Алгоритм дообучает веса признаков под вашу переписку (логистическая регрессия с притяжением к исходным весам), а точность становится измеренной, а не расчётной. Ответы хранятся только в этом браузере.">
      <ul className="model-lines">
        <ModelLine title="Вопросы «как дела»" m={a.checkinModel} />
        <ModelLine title="Кто начал разговор" m={a.conv.model} />
      </ul>
      <div className="inline">
        <Button variant="filled" icon={<Icon.accuracy size={18} />} onClick={openReview}>Начать проверку</Button>
        <span className="muted small">Спорных случаев: {num(left)} · 2–3 минуты на 30 ответов · клавиши 1 / 2 / 0</span>
      </div>
    </Card>
  );
}

/** Напряжённые периоды. */
export function TensionCard() {
  const { a, goToMessage, labels, setLabel } = useApp();
  const { nameOf, idxOf } = useNames();
  const { t } = useApp();
  const [limit, setLimit] = useState(12);
  const eps = [...a.tension].reverse();
  const rec = new Map<string, number>();
  for (const e of a.tension) if (e.reconciler) rec.set(e.reconciler, (rec.get(e.reconciler) ?? 0) + 1);
  const recTotal = [...rec.values()].reduce((s, v) => s + v, 0);
  const avgDays = a.tension.length ? a.tension.reduce((s, e) => s + e.days, 0) / a.tension.length : 0;
  return (
    <Card
      span={12}
      title={`Напряжённые периоды · эксперимент`}
      hint="Ищутся дни, когда резких фраз, негатива и сухих ответов заметно больше обычного для вашей пары, а нежности меньше. Период может тянуться несколько дней с обычным общением внутри — он закрывается после примирения или нескольких спокойных дней. Это эвристика: проверьте периоды и отклоните ошибочные ✕."
    >
      {!a.tension.length ? (
        <p className="muted">Явных напряжённых периодов не найдено.</p>
      ) : (
        <>
          <div className="kpis">
            <Stat label="Периодов" value={num(a.tension.length)} sub="за всё время" />
            <Stat label="Средняя длительность" value={`${avgDays.toFixed(1)} дн.`} />
            {[...rec.entries()].map(([k, v]) => (
              <Stat key={k} label={`Первым мирится: ${nameOf(k)}`} value={pct(v / Math.max(1, recTotal))} sub={`${v} из ${recTotal}`} accent={colorOf(t, idxOf(k))} />
            ))}
          </div>
          <ul className="conv-list">
            {eps.slice(0, limit).map((e) => (
              <li key={e.start}>
                <div className="conv-row static">
                  <span className="conv-date">{fmtDate(e.start)}{e.days > 1 ? ` — ${fmtDate(e.end)}` : ''}</span>
                  <span className="conv-who">
                    {e.days} дн. · {e.waves > 1 ? `возвращались к теме ${e.waves} раз(а)` : 'один день'} · резких фраз: {e.conflictMsgs}
                    {e.reconciler && (
                      <span className="muted small">
                        {' '}· первым(ой) мирится <Dot color={colorOf(t, idxOf(e.reconciler))} /> {nameOf(e.reconciler)}
                      </span>
                    )}
                  </span>
                  <span className="conv-meta">
                    <button className="link-btn" onClick={() => goToMessage(e.firstId)}>Открыть</button>
                  </span>
                  <span className="row-end">
                    <span className={`conf ${e.confidence > 0.85 ? 'hi' : e.confidence > 0.65 ? 'mid' : 'lo'}`}>{pct(e.confidence)}</span>
                    <LabelButtons value={labels.tension[e.start]} onSet={(v) => setLabel('tension', e.start, v)} yes="Да, это было напряжение" no="Это не ссора — убрать" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {eps.length > limit && <Button onClick={() => setLimit(limit + 20)}>Показать ещё ({eps.length - limit})</Button>}
        </>
      )}
    </Card>
  );
}

/** «Прочитано» по времени реакций. */
export function ReadsCard() {
  const { a } = useApp();
  const { nameOf } = useNames();
  const rows = a.reads.filter((r) => r.reactions > 0);
  if (!rows.length) return null;
  return (
    <Card span={6} title="Прочитано по реакциям" hint="Реакция хранит время, когда её поставили, — значит, сообщение к этому моменту было прочитано. «Прочитал(а) и промолчал(а)» — реакция есть, а своего сообщения в течение 30 минут нет.">
      <DataTable
        data={{
          head: ['Кто читает', 'Реакций', 'Реагирует через', 'Прочитал(а) и промолчал(а)'],
          rows: rows.map((r) => [nameOf(r.key), r.reactions, fmtDuration(r.latency), `${r.silentReads} (${pct(r.silentReads / Math.max(1, r.reactions))})`]),
        }}
      />
    </Card>
  );
}

/** Режим сна участников. */
export function SleepCard() {
  const { a } = useApp();
  const { nameOf } = useNames();
  const rows = a.sleep.filter((s) => s.nights >= 5);
  if (!rows.length) return null;
  return (
    <Card span={6} title="Режим сна" hint="По самой длинной ночной паузе в собственных сообщениях каждого: последнее сообщение перед паузой — «отбой», первое после — «подъём». Медиана по всем ночам. «Логический день» в статистике начинается с середины общей ночной паузы, а не в полночь.">
      <DataTable
        data={{
          head: ['Участник', 'Отбой', 'Подъём', 'Пауза', 'Пишет утром первым', 'Ночей'],
          rows: rows.map((s) => [nameOf(s.key), s.sleep, s.wake, Number.isFinite(s.hours) ? `${s.hours.toFixed(1)} ч` : '—', pct(s.wakesFirst), s.nights]),
        }}
      />
    </Card>
  );
}

/** Переломные моменты. */
export function ChangesCard() {
  const { a } = useApp();
  if (!a.changes.length) return null;
  return (
    <Card span={12} title="Как менялось общение" hint="Помесячные показатели делятся на отрезки с разным средним (бинарная сегментация с BIC-штрафом). Показываются только устойчивые и заметные сдвиги: ≥ 15 % и больше обычных колебаний от месяца к месяцу.">
      <ul className="changes">
        {a.changes.map((c, i) => (
          <li key={i} className={c.up ? 'up' : 'down'}>
            <span className="ch-arrow">{c.up ? '↗' : '↘'}</span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Словарь, выученный из переписки. */
export function VocabCard() {
  const { a } = useApp();
  if (!a.vocab.address.length && !a.vocab.phrases.length) return null;
  return (
    <Card span={6} title="Выучено из вашей переписки" hint="Обращения — слова, которыми зовут собеседника («зай, ты где», «доброе утро, леся»). Фразы — короткие вопросы, на которые собеседник обычно отвечает о делах или самочувствии заметно чаще, чем на остальные вопросы. Они добавляются к словарю «как дела».">
      <div className="mini-cols">
        {a.vocab.address.length > 0 && (
          <div>
            <h4>Обращения</h4>
            <div className="tags">{a.vocab.address.map((w) => <span className="tag" key={w}>{w}</span>)}</div>
          </div>
        )}
        {a.vocab.phrases.length > 0 && (
          <div>
            <h4>Фразы «как дела»</h4>
            <div className="tags">{a.vocab.phrases.map((p) => <span className="tag" key={p.phrase} title={`${p.n} раз, ответ о делах в ${Math.round(p.rate * 100)}%`}>{p.phrase}<small>{p.n}</small></span>)}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
