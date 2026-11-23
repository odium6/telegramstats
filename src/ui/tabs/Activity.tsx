import { useMemo, useState } from 'react';
import { SegmentedControl, Switch } from 'glisse';
import { Card, ChartCard, DataTable, Stat, useApp } from '../components';
import { MONTHS, WEEKDAYS, calendarOption, cumulativeOption, heatmapOption, hoursOption, monthsOfYearOption, num, timelineOption, weekdaysOption } from '../charts';
import { fmtDuration } from '../../core/time';
import { SleepCard } from '../insights';

export function ActivityTab() {
  const { a, t } = useApp();
  const [gran, setGran] = useState<'day' | 'week' | 'month' | 'year'>(a.range.days > 200 ? 'week' : 'day');
  const [mode, setMode] = useState<'stack' | 'percent' | 'lines'>('stack');
  const [hm, setHm] = useState<string>('all');
  const [percent, setPercent] = useState(false);
  const timeline = useMemo(() => timelineOption(a, t, gran, mode), [a, t, gran, mode]);
  const heat = useMemo(() => heatmapOption(a, t, hm === 'all' ? null : Number(hm)), [a, t, hm]);
  const cal = useMemo(() => calendarOption(a, t), [a, t]);
  const hours = useMemo(() => hoursOption(a, t, percent), [a, t, percent]);
  const wd = useMemo(() => weekdaysOption(a, t, percent), [a, t, percent]);
  const moy = useMemo(() => monthsOfYearOption(a, t, percent), [a, t, percent]);
  const cum = useMemo(() => cumulativeOption(a, t), [a, t]);
  const names = a.series.map((s) => s.name);
  const peakHour = a.hours[0] ? a.hours.reduce((acc, row) => acc.map((v, i) => v + row[i]), new Array(24).fill(0)) : [];
  const ph = peakHour.indexOf(Math.max(...peakHour));
  const wdt = a.weekdays.reduce((acc, row) => acc.map((v, i) => v + row[i]), new Array(7).fill(0));
  const pw = wdt.indexOf(Math.max(...wdt));
  const pctToggle = <Switch aria-label="В процентах" checked={percent} onCheckedChange={setPercent} title="Доли вместо количества" />;

  return (
    <div className="grid">
      <div className="kpis span-12">
        <Stat label="Пиковый час" value={`${ph}:00–${ph + 1}:00`} />
        <Stat label="Самый активный день недели" value={WEEKDAYS[pw]} />
        <Stat label="Сообщений в активный день" value={num(a.totals.perActiveDay, 1)} />
        <Stat label="Самая длинная серия" value={`${a.streaks.longestActive.days} дн.`} sub={a.streaks.longestActive.from && `${a.streaks.longestActive.from} → ${a.streaks.longestActive.to}`} />
        <Stat label="Самое долгое молчание" value={fmtDuration(a.streaks.longestSilence.sec)} sub={`${a.streaks.longestSilence.from} → ${a.streaks.longestSilence.to}`} />
        <Stat label="С последнего сообщения" value={fmtDuration(a.streaks.current)} />
      </div>

      <ChartCard
        span={12}
        title="Сообщения во времени"
        option={timeline}
        height={340}
        controls={
          <div className="ctrls">
            <SegmentedControl aria-label="Шаг" value={gran} onValueChange={(v) => setGran(v as any)} items={[{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }, { value: 'year', label: 'Год' }]} />
            <SegmentedControl aria-label="Вид" value={mode} onValueChange={(v) => setMode(v as any)} items={[{ value: 'stack', label: 'Σ' }, { value: 'percent', label: '%' }, { value: 'lines', label: 'Линии' }]} />
          </div>
        }
        table={{ head: ['Период', ...names], rows: (gran === 'day' ? a.daily : gran === 'week' ? a.weekly : gran === 'month' ? a.monthly : a.yearly).keys.map((k, i) => [k, ...a.series.map((_, si) => (gran === 'day' ? a.daily : gran === 'week' ? a.weekly : gran === 'month' ? a.monthly : a.yearly).values[si][i])]) }}
      />

      <ChartCard
        span={7}
        title="Тепловая карта: день недели × час"
        option={heat}
        height={330}
        hint="Чем темнее клетка, тем больше сообщений в этот час этого дня недели."
        controls={
          a.series.length > 1 ? (
            <select className="select small" value={hm} onChange={(e) => setHm(e.target.value)} aria-label="Участник">
              <option value="all">Все</option>
              {a.series.map((s, i) => <option key={s.key} value={i}>{s.name}</option>)}
            </select>
          ) : undefined
        }
        table={{ head: ['День', ...Array.from({ length: 24 }, (_, h) => `${h}`)], rows: WEEKDAYS.map((d, i) => [d, ...(hm === 'all' ? a.hourWeek : a.hourWeekBy[Number(hm)])[i]]) }}
      />
      <Card span={5} title="Ритм участников" hint="Пиковый час — когда человек пишет больше всего. «Сова» — доля сообщений с 0 до 6 утра.">
        <DataTable
          data={{
            head: ['Участник', 'Пик', 'Утро 6–12', 'Ночь 0–6', 'Выходные', 'Дней'],
            rows: a.people.slice(0, 12).map((p) => {
              const si = a.series.findIndex((s) => s.key === p.key);
              const h = si >= 0 ? a.hours[si] : [];
              const tot = h.reduce((s, v) => s + v, 0) || 1;
              const peak = h.indexOf(Math.max(...h));
              const morning = h.slice(6, 12).reduce((s, v) => s + v, 0) / tot;
              return [p.name, peak >= 0 ? `${peak}:00` : '—', `${(morning * 100).toFixed(0)}%`, `${(p.nightShare * 100).toFixed(0)}%`, `${(p.weekendShare * 100).toFixed(0)}%`, p.activeDays];
            }),
          }}
        />
      </Card>

      <ChartCard span={12} title="Календарь активности" option={cal.option} height={cal.height} hint="Каждая клетка — день. Наведите, чтобы увидеть количество сообщений." />

      <ChartCard span={12} title="По часам суток" option={hours} height={280} controls={pctToggle} table={{ head: ['Час', ...names], rows: Array.from({ length: 24 }, (_, h) => [`${h}:00`, ...a.hours.map((r) => r[h])]) }} />
      <ChartCard span={6} title="По дням недели" option={wd} height={260} controls={pctToggle} table={{ head: ['День', ...names], rows: WEEKDAYS.map((d, i) => [d, ...a.weekdays.map((r) => r[i])]) }} />
      <ChartCard span={6} title="По месяцам года" option={moy} height={260} controls={pctToggle} hint="Сезонность: сумма за все годы по каждому месяцу." table={{ head: ['Месяц', ...names], rows: MONTHS.map((m, i) => [m, ...a.monthsOfYear.map((r) => r[i])]) }} />
      <ChartCard span={12} title="Накопительно" option={cum} height={260} hint="Сколько всего сообщений написал каждый к данному месяцу — видно, кто «обгоняет»." />
      <SleepCard />
      <TopDays />
    </div>
  );
}

function TopDays() {
  const { a } = useApp();
  return (
    <Card span={12} title="Самые активные дни">
      <DataTable
        data={{
          head: ['Дата', 'День недели', 'Всего', ...a.series.map((s) => s.name)],
          rows: a.topDays.map((d) => [new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }), WEEKDAYS[(new Date(d.date).getUTCDay() + 6) % 7], d.total, ...d.by]),
        }}
      />
    </Card>
  );
}
