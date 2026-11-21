import { useMemo, useState } from 'react';
import { Button, SegmentedControl } from 'glisse';
import { Bar, Card, ChartCard, DataTable, Dot, Stat, useApp } from '../components';
import { durationHistOption, initiatorMonthlyOption, initiatorOption, monthlyLines, num, openingsByHourOption, pct, responseByHourOption, responseHistOption, shareDonut } from '../charts';
import { colorOf } from '../theme';
import { fmtDuration } from '../../core/time';
import { Icon } from '../icons';

export function DialogsTab() {
  const { a, t } = useApp();
  const nameOf = (k?: string) => (k ? a.people.find((p) => p.key === k)?.name ?? k : '—');
  const idxOf = (k?: string) => a.people.find((p) => p.key === k)?.idx ?? -1;
  const rows = [...a.conv.rows].filter((r) => r.raw + r.attempts + r.weighted > 0).sort((x, y) => y.share - x.share);
  const leader = rows[0];
  const init = useMemo(() => initiatorOption(a, t), [a, t]);
  const monthly = useMemo(() => initiatorMonthlyOption(a, t), [a, t]);
  const byHour = useMemo(() => openingsByHourOption(a, t), [a, t]);
  const respHist = useMemo(() => responseHistOption(a, t), [a, t]);
  const respHour = useMemo(() => responseByHourOption(a, t), [a, t]);
  const respMonth = useMemo(() => monthlyLines(a, t, a.responseMonthly, (v) => fmtDuration(v * 60), { yAxis: { name: 'мин', nameTextStyle: { color: t.muted } } }), [a, t]);
  const durHist = useMemo(() => durationHistOption(a, t), [a, t]);
  const eng = useMemo(() => shareDonut(t, a.people.slice(0, 8).map((p) => ({ name: p.name, value: +(p.engagement * 100).toFixed(1), idx: p.idx })), (v) => `${v}%`), [a, t]);
  const dayFirst = useMemo(
    () => shareDonut(t, rows.slice(0, 8).map((r) => ({ name: nameOf(r.key), value: +(r.dayFirstShare * 100).toFixed(1), idx: idxOf(r.key) })), (v) => `${v}%`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, t],
  );

  if (!a.conv.responded)
    return (
      <div className="grid">
        <Card span={12} title="Разговоры">
          <p className="muted">Недостаточно сообщений, чтобы выделить разговоры.</p>
        </Card>
      </div>
    );

  return (
    <div className="grid">
      {leader && (
        <Card span={12} className="hero-card wide" title="Кто начинает разговор — с учётом контекста">
          <div className="hero-split">
            <div>
              <div className="hero-num">
                <Dot color={colorOf(t, idxOf(leader.key))} />
                <span className="hero-name">{nameOf(leader.key)}</span>
                <span className="hero-val">{pct(leader.share, 1)}</span>
                <span className="hero-pm">± {(leader.margin * 100).toFixed(1)} п.п.</span>
              </div>
              <Bar parts={rows.map((r) => ({ value: r.share, color: colorOf(t, idxOf(r.key)), label: nameOf(r.key) }))} />
              <p className="small">
                Проанализировано <b>{num(a.conv.count)}</b> эпизодов общения, из них <b>{num(a.conv.responded)}</b> состоявшихся разговоров. Пауза больше <b>{fmtDuration(a.conv.T)}</b> {a.conv.gap.auto ? '(определена автоматически по вашей переписке)' : '(задана вручную)'} разделяет разговоры. Средняя уверенность классификации — <b>{pct(a.conv.confidence)}</b>, спорных случаев — {num(a.conv.ambiguous)}.
              </p>
              <p className="small muted">
                Наивный подсчёт («кто первым написал после паузы») дал бы {nameOf(leader.key)} {pct(leader.naiveShare, 1)}; «кто первым после полуночи» — {pct(leader.dayFirstNaiveShare, 1)}. Разница — это отложенные ответы, извинения за задержку и ответы на вчерашние вопросы, которые алгоритм не считает инициативой.
              </p>
            </div>
            <div className="hero-stats">
              <Stat label="Разговоров" value={num(a.conv.responded)} sub={`${num(a.conv.attempts)} попыток без ответа`} />
              <Stat label="Сообщений в разговоре" value={num(a.conv.avgLen, 1)} sub="в среднем" />
              <Stat label="Длительность" value={fmtDuration(a.conv.medianDuration)} sub="медиана" />
              <Stat label="Самый длинный" value={a.conv.longest ? `${num(a.conv.longest.count)} сообщ.` : '—'} sub={a.conv.longest ? new Date(a.conv.longest.startTs * 1000).toLocaleDateString('ru-RU') : ''} />
            </div>
          </div>
        </Card>
      )}

      <ChartCard
        span={7}
        title="Доля начатых разговоров"
        option={init}
        height={320}
        hint="Цветной столбец — с учётом контекста (с 95% интервалом погрешности), серый — наивный подсчёт «первый после паузы»."
        table={{ head: ['Участник', 'С учётом контекста', '±, п.п.', 'Наивно', 'Взвешенно начато', 'Без ответа'], rows: rows.map((r) => [nameOf(r.key), pct(r.share, 1), (r.margin * 100).toFixed(1), pct(r.naiveShare, 1), +r.weighted.toFixed(1), r.attempts]) }}
      />
      <ChartCard span={5} title="Первый контакт за день" option={dayFirst} height={320} hint={`«День» начинается после ночного затишья (~${a.conv.sleepHour}:00), а не в полночь. Учитывается первый новый разговор дня, а не продолжение вчерашнего.`} />

      <Card span={12} title="Инициатива и вовлечённость по участникам">
        <DataTable
          data={{
            head: ['Участник', 'Начинает', '±', 'Наивно', 'Первым за день', 'После полуночи (наивно)', 'Без ответа', 'Последнее слово', 'Отложенные ответы', 'Неотвеченные вопросы', '«Как дела?»', 'Двойные сообщения'],
            rows: rows.map((r) => {
              const p = a.people.find((x) => x.key === r.key);
              return [nameOf(r.key), pct(r.share, 1), `${(r.margin * 100).toFixed(1)} п.п.`, pct(r.naiveShare, 1), pct(r.dayFirstShare, 1), pct(r.dayFirstNaiveShare, 1), r.attempts, pct(r.endedShare, 1), p?.delayedAnswers ?? 0, p?.unansweredQuestions ?? 0, p?.checkins ?? 0, p?.doubleTexts ?? 0];
            }),
          }}
        />
      </Card>

      <ChartCard span={8} title="Кто начинает — по месяцам" option={monthly} height={280} hint="Доля начатых разговоров в каждом месяце. Пунктир — 50%." />
      <ChartCard span={4} title="Индекс вовлечённости" option={eng} height={280} hint="Сводная оценка: 35% — инициатива, 25% — скорость ответа, 20% — доля сообщений, 20% — вопросы и интерес к делам собеседника." />
      <ChartCard span={12} title="Во сколько начинают разговоры" option={byHour} height={260} />

      <div className="kpis span-12">
        {a.people.slice(0, 6).map((p) => (
          <Stat key={p.key} label={`Ответ ${p.name}`} accent={colorOf(t, p.idx)} value={fmtDuration(p.response.median)} sub={`медиана · 90% ≤ ${fmtDuration(p.response.p90)} · ${pct(p.response.fast)} < 1 мин`} />
        ))}
      </div>
      <ChartCard span={6} title="Распределение времени ответа" option={respHist} height={280} hint="Ответ — сообщение другого участника внутри одного разговора. Доли от всех ответов человека." />
      <ChartCard span={6} title="Скорость ответа по часам" option={respHour} height={280} hint="Медиана времени ответа в зависимости от часа суток." />
      <ChartCard span={8} title="Скорость ответа по месяцам" option={respMonth} height={260} hint="Среднее время ответа (мин) — видно, как менялась динамика отношений." />
      <ChartCard span={4} title="Длительность разговоров" option={durHist} height={260} />
      <ConversationList />
    </div>
  );
}

function ConversationList() {
  const { a, t, goToMessage } = useApp();
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(30);
  const [open, setOpen] = useState<number | null>(null);
  const nameOf = (k?: string) => (k ? a.people.find((p) => p.key === k)?.name ?? k : '—');
  const idxOf = (k?: string) => a.people.find((p) => p.key === k)?.idx ?? -1;
  const list = useMemo(() => {
    let l = [...a.conv.list].reverse();
    if (filter === 'ambiguous') l = l.filter((c) => c.alt && c.p > 0.3 && c.p < 0.7);
    else if (filter === 'delayed') l = l.filter((c) => c.alt && c.p < 0.5);
    else if (filter === 'attempts') l = l.filter((c) => !c.responded);
    else if (filter === 'long') l = l.sort((x, y) => y.count - x.count);
    return l;
  }, [a, filter]);
  return (
    <Card span={12} title="Все разговоры" hint="Нажмите на разговор, чтобы увидеть, почему алгоритм так решил, и перейти к нему в переписке.">
      <div className="seg-scroll"><SegmentedControl
        aria-label="Фильтр разговоров"
        value={filter}
        onValueChange={(v) => { setFilter(v); setLimit(30); }}
        items={[
          { value: 'all', label: 'Все' },
          { value: 'long', label: 'Самые длинные' },
          { value: 'ambiguous', label: 'Спорные' },
          { value: 'delayed', label: 'Отложенные ответы' },
          { value: 'attempts', label: 'Без ответа' },
        ]}
      /></div>
      <ul className="conv-list">
        {list.slice(0, limit).map((c) => {
          const initiator = c.alt && c.p < 0.5 ? c.alt : c.opener;
          const conf = c.alt ? Math.max(c.p, 1 - c.p) : Math.max(c.p, 0.9);
          return (
            <li key={c.firstId} className={open === c.firstId ? 'open' : ''}>
              <button className="conv-row" onClick={() => setOpen(open === c.firstId ? null : c.firstId)}>
                <span className="conv-date">{new Date(c.startTs * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="conv-who">
                  <Dot color={colorOf(t, idxOf(initiator))} /> {nameOf(initiator)}
                  {initiator !== c.opener && <span className="muted small"> (первым написал(а) {nameOf(c.opener)})</span>}
                </span>
                <span className="conv-meta">{c.responded ? `${num(c.count)} сообщ. · ${fmtDuration(c.endTs - c.startTs)}` : 'без ответа'}</span>
                <span className={`conf ${conf > 0.8 ? 'hi' : conf > 0.6 ? 'mid' : 'lo'}`}>{pct(conf)}</span>
              </button>
              {open === c.firstId && (
                <div className="conv-detail">
                  <ul>
                    {c.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    {c.alt && <li>Вероятность, что инициатива у {nameOf(c.opener)}: <b>{pct(c.p)}</b>; у {nameOf(c.alt)}: <b>{pct(1 - c.p)}</b></li>}
                    {c.firstReplySec !== undefined && <li>Первый ответ через {fmtDuration(c.firstReplySec)}</li>}
                  </ul>
                  <Button icon={<Icon.jump size={16} />} onClick={() => goToMessage(c.firstId)}>Открыть в переписке</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {list.length > limit && <Button onClick={() => setLimit(limit + 50)}>Показать ещё ({num(list.length - limit)})</Button>}
      {!list.length && <p className="muted">Нет разговоров в этой категории.</p>}
    </Card>
  );
}

