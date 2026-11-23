import { useMemo } from 'react';
import { Button } from 'glisse';
import { Bar, Card, ChartCard, DataTable, Dot, Stat, useApp } from '../components';
import { num, pct, radarOption, shareDonut, timelineOption } from '../charts';
import { colorOf } from '../theme';
import { fmtDuration } from '../../core/time';
import type { PersonStats } from '../../core/analyze';
import { ChangesCard } from '../insights';

export function peopleTable(people: PersonStats[], rowsOf: (p: PersonStats) => Record<string, string | number>) {
  const cols = Object.keys(rowsOf(people[0]));
  return { head: ['Метрика', ...people.map((p) => p.name)], rows: cols.map((c) => [c, ...people.map((p) => rowsOf(p)[c])]) };
}

export function comparisonRows(a: ReturnType<typeof useApp>['a']) {
  const init = new Map(a.conv.rows.map((r) => [r.key, r]));
  return (p: PersonStats): Record<string, string | number> => ({
    'Сообщений': p.messages,
    'Слов': p.words,
    'Символов': p.chars,
    'Слов в сообщении (ср.)': +p.avgWords.toFixed(1),
    'Средняя длина слова': +p.avgWordLen.toFixed(1),
    'Уникальных слов': p.uniqueWords,
    'Богатство словаря (индекс Гиро)': +p.richness.toFixed(1),
    'Начинает разговоры': init.get(p.key) ? `${pct(init.get(p.key)!.share, 1)} ± ${(init.get(p.key)!.margin * 100).toFixed(1)}` : '—',
    'Первый контакт за день': init.get(p.key) ? pct(init.get(p.key)!.dayFirstShare, 1) : '—',
    'Последнее слово в разговоре': init.get(p.key) ? pct(init.get(p.key)!.endedShare, 1) : '—',
    'Медиана ответа': fmtDuration(p.response.median),
    'Ответов быстрее минуты': pct(p.response.fast),
    'Спрашивает «как дела / что делаешь» (с учётом кд/чд)': p.checkins,
    'Приветствий': p.greetings,
    '«Доброе утро»': p.morning,
    'Первым желает доброе утро (дней)': p.morningFirst,
    '«Спокойной ночи»': p.goodnight,
    '«Люблю тебя»': p.ily,
    '«Скучаю»': p.missYou,
    'Извиняется': p.apologies,
    'Благодарит': p.thanks,
    'Вопросов': p.questions,
    'Восклицаний': p.exclaims,
    'Эмодзи': p.emojis,
    'Смеётся (хаха, 😂…)': p.laughs,
    'Слова нежности': p.loves,
    'Скобочки ))) и :)': p.smiles,
    'Мат': p.swears,
    'КАПСОМ': p.caps,
    'Медиа': p.media,
    'Голосовые, мин': +(p.voiceSec / 60).toFixed(1),
    'Кружки, мин': +(p.roundSec / 60).toFixed(1),
    'Стикеров': p.kinds.sticker ?? 0,
    'Звонков начато': p.callsMade,
    'Ссылок': p.links,
    'Пересланных': p.forwarded,
    'Отредактировано': p.edited,
    'Ответов (reply)': p.repliesMade,
    'Реакций получено': p.reactionsReceived,
    'Реакций поставлено': p.reactionsGiven,
    'Двойных сообщений (без ответа >10 мин)': p.doubleTexts,
    'Макс. сообщений подряд': p.maxRun,
    'Сообщений подряд (ср.)': +p.avgRun.toFixed(2),
    'Активных дней': p.activeDays,
    'Ночью (0–6 ч)': pct(p.nightShare, 1),
    'В выходные': pct(p.weekendShare, 1),
    'Тональность (−1…+1)': +p.sentiment.toFixed(2),
  });
}

export function OverviewTab({ onTab }: { onTab: (t: string) => void }) {
  const { a, t } = useApp();
  const people = a.people.slice(0, 8);
  const leader = [...a.conv.rows].sort((x, y) => y.share - x.share)[0];
  const leaderP = a.people.find((p) => p.key === leader?.key);
  const timeline = useMemo(() => timelineOption(a, t, a.range.days > 400 ? 'month' : 'week', 'stack'), [a, t]);
  const radar = useMemo(() => radarOption(a, t), [a, t]);
  const donut = useMemo(() => shareDonut(t, people.map((p) => ({ name: p.name, value: p.messages, idx: p.idx }))), [people, t]);
  const table = useMemo(() => (people.length ? peopleTable(people, comparisonRows(a)) : null), [a, people]);
  const acc = a.accuracy.overall;

  return (
    <div className="grid">
      <div className="kpis span-12">
        <Stat label="Сообщений" value={num(a.totals.messages)} sub={`${num(a.totals.perDay, 1)} в день`} />
        <Stat label="Слов" value={num(a.totals.words)} sub={`${num(a.totals.chars)} символов`} />
        <Stat label="Дней общения" value={num(a.range.activeDays)} sub={`из ${num(a.range.days)} (${pct(a.range.activeDays / a.range.days)})`} />
        <Stat label="Разговоров" value={num(a.conv.responded)} sub={`медиана ${fmtDuration(a.conv.medianDuration)}`} />
        <Stat label="Медиа" value={num(a.totals.media)} sub={`${num(a.totals.stickers)} стикеров`} />
        <Stat label="Голосовые" value={fmtDuration(a.totals.voiceSec)} sub={`${num(a.people.reduce((s, p) => s + (p.kinds.voice ?? 0), 0))} шт.`} />
        <Stat label="Звонки" value={num(a.calls.count)} sub={fmtDuration(a.calls.totalSec)} />
        <Stat label="Реакций" value={num(a.totals.reactions)} sub={`${num(a.totals.emojis)} эмодзи в тексте`} />
      </div>

      {leader && leaderP && a.conv.responded > 3 && (
        <Card span={6} className="hero-card" title="Кто чаще начинает разговор">
          <div className="hero-num">
            <Dot color={colorOf(t, leaderP.idx)} />
            <span className="hero-name">{leaderP.name}</span>
            <span className="hero-val">{pct(leader.share, 1)}</span>
            <span className="hero-pm">± {(leader.margin * 100).toFixed(1)} п.п.</span>
          </div>
          <Bar parts={a.conv.rows.filter((r) => r.share > 0).map((r) => ({ value: r.share, label: a.people.find((p) => p.key === r.key)?.name ?? r.key, color: colorOf(t, a.people.find((p) => p.key === r.key)?.idx ?? -1) }))} />
          <p className="muted small">
            По {num(a.conv.responded)} разговорам с учётом контекста: пауз, приветствий, вопросов «как дела», отложенных ответов. Первым за день (после ночного затишья ~{a.conv.sleepHour}:00) — {pct(leader.dayFirstShare)}.
          </p>
          <Button onClick={() => onTab('dialogs')}>Подробнее о разговорах →</Button>
        </Card>
      )}

      <Card span={leader && a.conv.responded > 3 ? 6 : 12} title="Достоверность анализа" hint="Средневзвешенная точность всех метрик. Каждая метрика оценивается отдельно — подробно во вкладке «Точность».">
        <div className="gauge">
          <div className="gauge-ring" style={{ ['--p' as any]: acc, ['--c' as any]: acc > 90 ? t.series[2] : acc > 75 ? t.series[3] : t.series[7] }}>
            <span>{acc.toFixed(1)}%</span>
          </div>
          <ul className="gauge-list">
            {a.accuracy.items.slice(0, 5).map((it) => (
              <li key={it.name}>
                <span className={`lvl lvl-${it.level}`} />
                {it.name}: <b>{it.value}</b>
              </li>
            ))}
          </ul>
        </div>
        <Button onClick={() => onTab('accuracy')}>Как считается точность →</Button>
      </Card>

      <ChartCard span={4} title="Доля сообщений" option={donut} height={240} table={{ head: ['Участник', 'Сообщений', 'Доля'], rows: people.map((p) => [p.name, p.messages, pct(p.messages / a.totals.messages, 1)]) }} />
      <Card span={8} title="Кто сколько вкладывает">
        <div className="split-list">
          {[
            ['Сообщения', (p: PersonStats) => p.messages],
            ['Слова', (p: PersonStats) => p.words],
            ['Медиа', (p: PersonStats) => p.media],
            ['Голосовые (время)', (p: PersonStats) => p.voiceSec],
            ['Вопросы', (p: PersonStats) => p.questions],
            ['Эмодзи', (p: PersonStats) => p.emojis],
            ['Реакции получено', (p: PersonStats) => p.reactionsReceived],
          ].map(([label, get]) => {
            const g = get as (p: PersonStats) => number;
            const total = people.reduce((s, p) => s + g(p), 0);
            if (!total) return null;
            return (
              <div className="split-row" key={label as string}>
                <div className="split-label">{label as string}</div>
                <Bar parts={people.map((p) => ({ value: g(p), color: colorOf(t, p.idx), label: p.name }))} />
                <div className="split-vals">{people.slice(0, 3).map((p) => pct(g(p) / total)).join(' / ')}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <ChartCard span={12} title="Активность во времени" option={timeline} height={280} hint="Количество сообщений по неделям/месяцам. Подробные графики — во вкладке «Время»." />

      <Card span={6} title="Интересные факты">
        <ul className="facts">
          {a.facts.map((f, i) => (
            <li key={i}>
              <span className="fact-icon">{f.icon}</span>
              {f.text}
            </li>
          ))}
        </ul>
      </Card>
      {people.length > 1 && <ChartCard span={6} title="Профиль общения" option={radar} height={340} hint="Каждая ось нормирована: 100 — максимум среди участников." />}

      <ChangesCard />

      {table && (
        <Card span={12} title="Сравнение участников" hint="Все ключевые метрики по каждому участнику. Можно выгрузить в CSV через меню экспорта.">
          <DataTable data={table} />
        </Card>
      )}
    </div>
  );
}
