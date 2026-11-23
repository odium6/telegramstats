// Построители опций ECharts. Чистые функции (анализ, тема) → option.
import type { Analysis, Pair, TimeSeries } from '../core/analyze';
import { kindLabel } from '../core/analyze';
import { fmtDuration } from '../core/time';
import { colorOf, type Theme } from './theme';

type Opt = Record<string, any>;

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const HOURS = Array.from({ length: 24 }, (_, h) => `${h}:00`);
const nf = new Intl.NumberFormat('ru-RU');
export const num = (v: number, d = 0) => (Number.isFinite(v) ? nf.format(Number(v.toFixed(d))) : '—');
export const pct = (v: number, d = 0) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');

function base(t: Theme): Opt {
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: t.font, color: t.text2 },
    animationDuration: 450,
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      textStyle: { color: t.text, fontFamily: t.font, fontSize: 12 },
      extraCssText: 'border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);',
      confine: true,
    },
  };
}

const axisCat = (t: Theme, data: string[], extra: Opt = {}): Opt => ({
  type: 'category',
  data,
  axisLine: { lineStyle: { color: t.axis } },
  axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 11 },
  ...extra,
});
const axisVal = (t: Theme, extra: Opt = {}): Opt => ({
  type: 'value',
  splitLine: { lineStyle: { color: t.grid } },
  axisLabel: { color: t.muted, fontSize: 11 },
  ...extra,
});
const legend = (t: Theme, show = true): Opt => ({ show, top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: t.text2, fontSize: 12 } });

function seriesColors(a: Analysis, t: Theme) {
  return a.series.map((s) => colorOf(t, s.idx));
}

/* ───────────── время ───────────── */

export function timelineOption(a: Analysis, t: Theme, gran: 'day' | 'week' | 'month' | 'year', mode: 'stack' | 'percent' | 'lines'): Opt {
  const ts: TimeSeries = gran === 'day' ? a.daily : gran === 'week' ? a.weekly : gran === 'month' ? a.monthly : a.yearly;
  const cols = seriesColors(a, t);
  let values = ts.values;
  if (mode === 'percent') {
    const sums = ts.keys.map((_, i) => values.reduce((s, row) => s + row[i], 0));
    values = values.map((row) => row.map((v, i) => (sums[i] ? (v / sums[i]) * 100 : 0)));
  }
  const many = ts.keys.length > 60;
  return {
    ...base(t),
    color: cols,
    legend: legend(t, a.series.length > 1),
    tooltip: {
      ...base(t).tooltip,
      trigger: 'axis',
      axisPointer: { type: mode === 'lines' ? 'line' : 'shadow' },
      valueFormatter: (v: number) => (mode === 'percent' ? `${v.toFixed(1)}%` : num(v)),
    },
    grid: { ...base(t).grid, bottom: many ? 44 : 8 },
    xAxis: axisCat(t, ts.keys, { boundaryGap: mode !== 'lines' }),
    yAxis: axisVal(t, mode === 'percent' ? { max: 100, axisLabel: { color: t.muted, formatter: '{value}%' } } : {}),
    dataZoom: many ? [{ type: 'inside', start: gran === 'day' ? 70 : 0 }, { type: 'slider', height: 22, bottom: 4, borderColor: t.border, textStyle: { color: t.muted }, start: gran === 'day' ? 70 : 0 }] : [],
    series: a.series.map((s, i) =>
      mode === 'lines'
        ? { name: s.name, type: 'line', data: values[i], showSymbol: false, smooth: 0.25, lineStyle: { width: 2 }, emphasis: { focus: 'series' } }
        : {
            name: s.name,
            type: 'bar',
            stack: 'a',
            data: values[i],
            barMaxWidth: 28,
            itemStyle: { borderColor: t.surface, borderWidth: many ? 0 : 1 },
            emphasis: { focus: 'series' },
          },
    ),
  };
}

export function cumulativeOption(a: Analysis, t: Theme): Opt {
  const cols = seriesColors(a, t);
  return {
    ...base(t),
    color: cols,
    legend: legend(t, a.series.length > 1),
    tooltip: { ...base(t).tooltip, trigger: 'axis', valueFormatter: (v: number) => num(v) },
    xAxis: axisCat(t, a.monthly.keys, { boundaryGap: false }),
    yAxis: axisVal(t),
    series: a.series.map((s, i) => {
      let acc = 0;
      return { name: s.name, type: 'line', showSymbol: false, lineStyle: { width: 2 }, data: a.monthly.values[i].map((v) => (acc += v)) };
    }),
  };
}

export function heatmapOption(a: Analysis, t: Theme, si: number | null): Opt {
  const grid = si === null ? a.hourWeek : a.hourWeekBy[si];
  const data: [number, number, number][] = [];
  let max = 1;
  grid.forEach((row, d) => row.forEach((v, h) => { data.push([h, d, v]); max = Math.max(max, v); }));
  return {
    ...base(t),
    tooltip: { ...base(t).tooltip, formatter: (p: any) => `${WEEKDAYS[p.value[1]]}, ${p.value[0]}:00–${p.value[0] + 1}:00<br/><b>${num(p.value[2])}</b> сообщений` },
    grid: { left: 8, right: 8, top: 8, bottom: 52, containLabel: true },
    xAxis: axisCat(t, HOURS.map((h) => h.replace(':00', '')), { splitArea: { show: false } }),
    yAxis: axisCat(t, WEEKDAYS, { inverse: true }),
    visualMap: { min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 140, itemWidth: 10, inRange: { color: t.seq }, textStyle: { color: t.muted }, text: ['больше', 'меньше'] },
    series: [{ type: 'heatmap', data, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 }, emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1 } } }],
  };
}

export function calendarOption(a: Analysis, t: Theme): { option: Opt; height: number } {
  const years = [...new Set(a.calendar.map(([d]) => d.slice(0, 4)))];
  let max = 1;
  for (const [, v] of a.calendar) if (v > max) max = v;
  const cell = 15;
  const per = cell * 7 + 34;
  return {
    height: years.length * per + 50,
    option: {
      ...base(t),
      tooltip: { ...base(t).tooltip, formatter: (p: any) => `${new Date(p.value[0]).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}<br/><b>${num(p.value[1])}</b> сообщений` },
      visualMap: { min: 0, max: Math.ceil(max * 0.8), show: true, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 140, itemWidth: 10, inRange: { color: t.seq }, textStyle: { color: t.muted }, text: ['больше', 'меньше'] },
      calendar: years.map((y, i) => ({
        top: 24 + i * per,
        left: 40,
        right: 8,
        cellSize: ['auto', cell],
        range: y,
        orient: 'horizontal',
        firstDay: 1,
        splitLine: { show: false },
        itemStyle: { color: t.dark ? '#222221' : '#f3f3f1', borderColor: t.surface, borderWidth: 2 },
        yearLabel: { show: true, position: 'left', color: t.text2, fontSize: 13, fontWeight: 600 },
        dayLabel: { firstDay: 1, nameMap: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'], color: t.muted, fontSize: 9 },
        monthLabel: { nameMap: MONTHS, color: t.muted, fontSize: 10 },
      })),
      series: years.map((y, i) => ({ type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: i, data: a.calendar.filter(([d, v]) => d.startsWith(y) && v > 0) })),
    },
  };
}

function groupedBars(a: Analysis, t: Theme, cats: string[], values: number[][], opts: { horizontal?: boolean; percent?: boolean; fmt?: (v: number) => string } = {}): Opt {
  const cols = seriesColors(a, t);
  let vals = values;
  if (opts.percent) vals = values.map((row) => { const s = row.reduce((x, y) => x + y, 0) || 1; return row.map((v) => (v / s) * 100); });
  const fmt = opts.fmt ?? ((v: number) => (opts.percent ? `${v.toFixed(1)}%` : num(v)));
  const cat = axisCat(t, cats);
  const val = axisVal(t, opts.percent ? { axisLabel: { color: t.muted, formatter: '{value}%' } } : {});
  return {
    ...base(t),
    color: cols,
    legend: legend(t, a.series.length > 1),
    tooltip: { ...base(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: fmt },
    xAxis: opts.horizontal ? val : cat,
    yAxis: opts.horizontal ? { ...cat, inverse: true } : val,
    series: a.series.map((s, i) => ({
      name: s.name,
      type: 'bar',
      data: vals[i],
      barMaxWidth: 18,
      barGap: '10%',
      itemStyle: { borderRadius: opts.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
    })),
  };
}

export const hoursOption = (a: Analysis, t: Theme, percent: boolean) => groupedBars(a, t, HOURS.map((h) => h.replace(':00', '')), a.hours, { percent });
export const weekdaysOption = (a: Analysis, t: Theme, percent: boolean) => groupedBars(a, t, WEEKDAYS, a.weekdays, { percent });
export const monthsOfYearOption = (a: Analysis, t: Theme, percent: boolean) => groupedBars(a, t, MONTHS, a.monthsOfYear, { percent });

export function shareDonut(t: Theme, items: { name: string; value: number; idx: number }[], fmt: (v: number) => string = (v) => num(v)): Opt {
  return {
    ...base(t),
    tooltip: { ...base(t).tooltip, trigger: 'item', formatter: (p: any) => `${p.marker}${p.name}: <b>${fmt(p.value)}</b> (${p.percent.toFixed(1)}%)` },
    legend: { ...legend(t), show: false },
    series: [
      {
        type: 'pie',
        radius: ['58%', '86%'],
        padAngle: 1.5,
        itemStyle: { borderRadius: 6, borderColor: t.surface, borderWidth: 2 },
        label: { show: false },
        data: items.map((i) => ({ name: i.name, value: i.value, itemStyle: { color: colorOf(t, i.idx) } })),
      },
    ],
  };
}

/* ───────────── сравнение участников ───────────── */

export function radarOption(a: Analysis, t: Theme): Opt {
  const people = a.people.slice(0, Math.min(4, a.people.length));
  const metrics: { name: string; get: (p: Analysis['people'][number]) => number }[] = [
    { name: 'Сообщения', get: (p) => p.messages },
    { name: 'Длина сообщений', get: (p) => p.avgWords },
    { name: 'Скорость ответа', get: (p) => (Number.isFinite(p.response.median) ? 1 / (1 + p.response.median) : 0) },
    { name: 'Инициатива', get: (p) => a.conv.rows.find((r) => r.key === p.key)?.share ?? 0 },
    { name: 'Вопросы', get: (p) => (p.messages ? p.questions / p.messages : 0) },
    { name: 'Эмодзи', get: (p) => (p.messages ? p.emojis / p.messages : 0) },
    { name: 'Медиа', get: (p) => (p.messages ? p.media / p.messages : 0) },
    { name: 'Словарный запас', get: (p) => p.richness },
  ];
  const maxes = metrics.map((m) => Math.max(1e-9, ...people.map(m.get)));
  return {
    ...base(t),
    legend: legend(t, people.length > 1),
    tooltip: { ...base(t).tooltip, trigger: 'item' },
    radar: {
      indicator: metrics.map((m) => ({ name: m.name, max: 100 })),
      radius: '66%',
      center: ['50%', '56%'],
      axisName: { color: t.text2, fontSize: 11 },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: t.grid } },
    },
    series: [
      {
        type: 'radar',
        symbolSize: 6,
        data: people.map((p) => ({
          name: p.name,
          value: metrics.map((m, i) => Math.round((m.get(p) / maxes[i]) * 100)),
          lineStyle: { width: 2, color: colorOf(t, p.idx) },
          itemStyle: { color: colorOf(t, p.idx) },
          areaStyle: { color: colorOf(t, p.idx), opacity: 0.12 },
        })),
      },
    ],
  };
}

/* ───────────── ответы ───────────── */

export const responseHistOption = (a: Analysis, t: Theme) => groupedBars(a, t, a.responseHist.labels, a.responseHist.values, { percent: true });

export function responseByHourOption(a: Analysis, t: Theme): Opt {
  return {
    ...base(t),
    color: seriesColors(a, t),
    legend: legend(t, a.series.length > 1),
    tooltip: { ...base(t).tooltip, trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : fmtDuration(v * 60)) },
    xAxis: axisCat(t, HOURS.map((h) => h.replace(':00', '')), { boundaryGap: false }),
    yAxis: axisVal(t, { name: 'мин', nameTextStyle: { color: t.muted } }),
    series: a.series.map((s, i) => ({ name: s.name, type: 'line', data: a.responseByHour[i], connectNulls: true, smooth: 0.3, showSymbol: false, lineStyle: { width: 2 } })),
  };
}

export function monthlyLines(a: Analysis, t: Theme, ts: TimeSeries, fmt: (v: number) => string, extra: Opt = {}): Opt {
  return {
    ...base(t),
    color: seriesColors(a, t),
    legend: legend(t, a.series.length > 1),
    tooltip: { ...base(t).tooltip, trigger: 'axis', valueFormatter: (v: number) => (v == null || Number.isNaN(v) ? '—' : fmt(v)) },
    xAxis: axisCat(t, ts.keys, { boundaryGap: false }),
    yAxis: axisVal(t, extra.yAxis ?? {}),
    series: a.series.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: ts.values[i].map((v) => (Number.isFinite(v) ? Number(v.toFixed(3)) : null)),
      connectNulls: true,
      smooth: 0.3,
      showSymbol: ts.keys.length < 24,
      symbolSize: 8,
      lineStyle: { width: 2 },
      ...(extra.markLine && i === 0 ? { markLine: extra.markLine } : {}),
    })),
  };
}

/* ───────────── разговоры ───────────── */

export function initiatorOption(a: Analysis, t: Theme): Opt {
  const rows = a.conv.rows.filter((r) => r.raw > 0 || r.weighted > 0).sort((x, y) => y.share - x.share).slice(0, 10);
  const nameOf = (k: string) => a.people.find((p) => p.key === k)?.name ?? k;
  const idxOf = (k: string) => a.people.find((p) => p.key === k)?.idx ?? -1;
  const cats = rows.map((r) => nameOf(r.key));
  return {
    ...base(t),
    legend: { ...legend(t), data: ['С учётом контекста', 'Наивно: первый после паузы'] },
    tooltip: {
      ...base(t).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: any[]) => {
        const r = rows[ps[0].dataIndex];
        return `<b>${nameOf(r.key)}</b><br/>С учётом контекста: <b>${pct(r.share, 1)}</b> ± ${(r.margin * 100).toFixed(1)} п.п.<br/>Наивно: ${pct(r.naiveShare, 1)}<br/>Разговоров начато: ${num(r.weighted, 1)} из ${num(a.conv.responded)}`;
      },
    },
    grid: { ...base(t).grid, top: 44 },
    xAxis: axisCat(t, cats),
    yAxis: axisVal(t, { max: 100, axisLabel: { color: t.muted, formatter: '{value}%' } }),
    series: [
      {
        name: 'С учётом контекста',
        type: 'bar',
        barMaxWidth: 48,
        data: rows.map((r) => ({ value: +(r.share * 100).toFixed(2), itemStyle: { color: colorOf(t, idxOf(r.key)), borderRadius: [4, 4, 0, 0] } })),
        itemStyle: { color: t.series[0] },
        label: { show: true, position: 'insideTop', color: '#fff', fontWeight: 600, formatter: (p: any) => `${p.value.toFixed(1)}%` },
      },
      {
        name: 'Наивно: первый после паузы',
        type: 'bar',
        barMaxWidth: 48,
        data: rows.map((r) => +(r.naiveShare * 100).toFixed(2)),
        itemStyle: { color: t.neutral, borderRadius: [4, 4, 0, 0] },
      },
      {
        name: 'Погрешность',
        type: 'custom',
        z: 10,
        tooltip: { show: false },
        data: rows.map((r, i) => [i, (r.share - r.margin) * 100, (r.share + r.margin) * 100]),
        renderItem: (_: any, api: any) => {
          const i = api.value(0);
          const lo = api.coord([i, Math.max(0, api.value(1))]);
          const hi = api.coord([i, Math.min(100, api.value(2))]);
          const size = api.size([1, 0])[0];
          const x = lo[0] - size * 0.2;
          const w = 8;
          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: x, y1: lo[1], x2: x, y2: hi[1] }, style: { stroke: t.text, lineWidth: 1.5 } },
              { type: 'line', shape: { x1: x - w / 2, y1: lo[1], x2: x + w / 2, y2: lo[1] }, style: { stroke: t.text, lineWidth: 1.5 } },
              { type: 'line', shape: { x1: x - w / 2, y1: hi[1], x2: x + w / 2, y2: hi[1] }, style: { stroke: t.text, lineWidth: 1.5 } },
            ],
          };
        },
      },
    ],
  };
}

export function initiatorMonthlyOption(a: Analysis, t: Theme): Opt {
  const ts = a.conv.monthly;
  const sums = ts.keys.map((_, i) => ts.values.reduce((s, r) => s + r[i], 0));
  const vals = ts.values.map((r) => r.map((v, i) => (sums[i] >= 2 ? +((v / sums[i]) * 100).toFixed(1) : null)));
  return {
    ...base(t),
    color: seriesColors(a, t),
    legend: legend(t, a.series.length > 1),
    tooltip: { ...base(t).tooltip, trigger: 'axis', valueFormatter: (v: number) => (v == null ? '—' : `${v}%`) },
    xAxis: axisCat(t, ts.keys, { boundaryGap: false }),
    yAxis: axisVal(t, { max: 100, axisLabel: { color: t.muted, formatter: '{value}%' } }),
    series: a.series.map((s, i) => ({
      name: s.name, type: 'line', stack: 'a', data: vals[i], showSymbol: false, smooth: 0.3, lineStyle: { width: 0 }, areaStyle: { opacity: 0.85 },
      ...(i === 0 ? { markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.text, type: 'dashed', opacity: 0.4 }, data: [{ yAxis: 50 }] } } : {}),
    })),
  };
}

export const openingsByHourOption = (a: Analysis, t: Theme) => groupedBars(a, t, HOURS.map((h) => h.replace(':00', '')), a.conv.openingsByHour);

export function gapOption(a: Analysis, t: Theme): Opt {
  const g = a.conv.gap;
  const n = g.histogram.reduce((s, b) => s + b.count, 0) || 1;
  const pdf = (x: number, mu: number, sd: number) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * 2.5066);
  const labels = g.histogram.map((b) => fmtDuration(10 ** b.x));
  const thresholdX = Math.round(Math.log10(a.conv.T) * 10);
  return {
    ...base(t),
    legend: legend(t),
    tooltip: { ...base(t).tooltip, trigger: 'axis', valueFormatter: (v: number) => `${(v * 100).toFixed(2)}%` },
    xAxis: axisCat(t, labels, { axisLabel: { color: t.muted, fontSize: 10, interval: 9 } }),
    yAxis: axisVal(t, { axisLabel: { color: t.muted, formatter: (v: number) => `${(v * 100).toFixed(0)}%` } }),
    series: [
      {
        name: 'Паузы между сообщениями',
        type: 'bar',
        barCategoryGap: '8%',
        data: g.histogram.map((b) => b.count / n),
        itemStyle: { color: t.seq[4], borderRadius: [2, 2, 0, 0] },
        markLine: {
          symbol: 'none',
          label: { formatter: `порог ${fmtDuration(a.conv.T)}`, color: t.text, position: 'insideEndTop' },
          lineStyle: { color: t.neg, width: 2, type: 'dashed' },
          data: [{ xAxis: Math.min(70, thresholdX) }],
        },
      },
      ...(g.separation > 0
        ? [
            { name: 'Внутри разговора', type: 'line', showSymbol: false, smooth: true, lineStyle: { width: 2, color: t.series[2] }, itemStyle: { color: t.series[2] }, data: g.histogram.map((b) => g.w1 * pdf(b.x, g.mu1, g.sd1) * 0.1) },
            { name: 'Между разговорами', type: 'line', showSymbol: false, smooth: true, lineStyle: { width: 2, color: t.series[1] }, itemStyle: { color: t.series[1] }, data: g.histogram.map((b) => (1 - g.w1) * pdf(b.x, g.mu2, g.sd2) * 0.1) },
          ]
        : []),
    ],
  };
}

export function sensitivityOption(a: Analysis, t: Theme): Opt {
  const keys = a.conv.rows.map((r) => r.key);
  const top = keys.map((k, i) => ({ k, i, s: a.conv.rows[i].share })).sort((x, y) => y.s - x.s).slice(0, 4);
  const nameOf = (k: string) => a.people.find((p) => p.key === k)?.name ?? k;
  const idxOf = (k: string) => a.people.find((p) => p.key === k)?.idx ?? -1;
  return {
    ...base(t),
    legend: legend(t),
    tooltip: { ...base(t).tooltip, trigger: 'axis', valueFormatter: (v: number) => `${v.toFixed(1)}%` },
    xAxis: axisCat(t, a.conv.sensitivity.map((s) => `${s.label} (${fmtDuration(s.T)})`)),
    yAxis: axisVal(t, { max: 100, axisLabel: { color: t.muted, formatter: '{value}%' } }),
    series: top.map(({ k, i }) => ({
      name: nameOf(k), type: 'line', symbolSize: 9, lineStyle: { width: 2, color: colorOf(t, idxOf(k)) }, itemStyle: { color: colorOf(t, idxOf(k)) },
      data: a.conv.sensitivity.map((s) => +(s.shares[i] * 100).toFixed(2)),
    })),
  };
}

export function durationHistOption(a: Analysis, t: Theme): Opt {
  return {
    ...base(t),
    tooltip: { ...base(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${num(v)} разговоров` },
    xAxis: axisCat(t, a.conv.durationHist.labels),
    yAxis: axisVal(t),
    series: [{ type: 'bar', data: a.conv.durationHist.values, barMaxWidth: 36, itemStyle: { color: t.series[0], borderRadius: [4, 4, 0, 0] } }],
  };
}

/* ───────────── текст ───────────── */

export function wordCloudOption(words: Pair[], t: Theme): Opt {
  const palette = t.series.slice(0, 4);
  return {
    ...base(t),
    tooltip: { ...base(t).tooltip, formatter: (p: any) => `«${p.name}» — ${num(p.value)}` },
    series: [
      {
        type: 'wordCloud',
        shape: 'circle',
        left: 'center',
        top: 'center',
        width: '100%',
        height: '100%',
        sizeRange: [12, 58],
        rotationRange: [0, 0],
        gridSize: 6,
        drawOutOfBound: false,
        layoutAnimation: true,
        textStyle: { fontFamily: t.font, fontWeight: 600, color: (p: any) => palette[p.dataIndex % palette.length] },
        emphasis: { textStyle: { color: t.text } },
        // Важно: не задавать textStyle у отдельных слов — echarts-wordcloud 2.x
        // тогда ничего не рисует. Частота передаётся размером и порядком цвета.
        data: words.map(([w, c]) => ({ name: w, value: c })),
      },
    ],
  };
}

export function topBarsOption(items: Pair[], t: Theme, color: string, fmt: (v: number) => string = (v) => num(v)): Opt {
  const list = items.slice(0, 15);
  return {
    ...base(t),
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...base(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: fmt },
    xAxis: axisVal(t, { show: false }),
    yAxis: axisCat(t, list.map(([k]) => k), { inverse: true, axisLabel: { color: t.text2, fontSize: 12, width: 140, overflow: 'truncate' } }),
    series: [{ type: 'bar', data: list.map(([, v]) => v), barMaxWidth: 16, itemStyle: { color, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: t.muted, fontSize: 11, formatter: (p: any) => fmt(p.value) } }],
  };
}

export const lengthHistOption = (a: Analysis, t: Theme) => groupedBars(a, t, a.lengthHist.labels, a.lengthHist.values, { percent: true });

export function sentimentOption(a: Analysis, t: Theme): Opt {
  return monthlyLines(a, t, a.sentimentMonthly, (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)), {
    yAxis: { min: -1, max: 1, axisLabel: { color: t.muted } },
    markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.neutral, type: 'dashed' }, data: [{ yAxis: 0 }] },
  });
}

export function personCompareOption(a: Analysis, t: Theme, metrics: { name: string; get: (p: Analysis['people'][number]) => number }[]): Opt {
  const people = a.people.slice(0, 8);
  return {
    ...base(t),
    legend: legend(t, people.length > 1),
    tooltip: { ...base(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => num(v, 1) },
    grid: { ...base(t).grid, left: 8 },
    xAxis: axisVal(t),
    yAxis: axisCat(t, metrics.map((m) => m.name), { inverse: true, axisLabel: { color: t.text2, fontSize: 12 } }),
    series: people.map((p) => ({ name: p.name, type: 'bar', barMaxWidth: 14, data: metrics.map((m) => +m.get(p).toFixed(2)), itemStyle: { color: colorOf(t, p.idx), borderRadius: [0, 4, 4, 0] } })),
  };
}

/* ───────────── медиа ───────────── */

export function kindsOption(a: Analysis, t: Theme): Opt {
  const kinds = a.kinds.filter(([k]) => k !== 'text').map(([k]) => k);
  const people = a.people.slice(0, 8);
  return {
    ...base(t),
    legend: legend(t, people.length > 1),
    tooltip: { ...base(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => num(v) },
    xAxis: axisVal(t),
    yAxis: axisCat(t, kinds.map(kindLabel), { inverse: true, axisLabel: { color: t.text2, fontSize: 12 } }),
    series: people.map((p) => ({ name: p.name, type: 'bar', stack: 'k', barMaxWidth: 18, data: kinds.map((k) => p.kinds[k as keyof typeof p.kinds] ?? 0), itemStyle: { color: colorOf(t, p.idx), borderColor: t.surface, borderWidth: 1 } })),
  };
}

export function callsMonthlyOption(a: Analysis, t: Theme): Opt {
  return {
    ...base(t),
    tooltip: { ...base(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${num(v)} звонков` },
    xAxis: axisCat(t, a.calls.monthly.keys),
    yAxis: axisVal(t),
    series: [{ type: 'bar', data: a.calls.monthly.values[0], barMaxWidth: 20, itemStyle: { color: t.series[2], borderRadius: [4, 4, 0, 0] } }],
  };
}

export function matrixOption(a: Analysis, t: Theme, m: number[][], label: string): Opt {
  const names = a.series.map((s) => s.name);
  const data: [number, number, number][] = [];
  let max = 1;
  m.forEach((row, i) => row.forEach((v, j) => { data.push([j, i, v]); max = Math.max(max, v); }));
  return {
    ...base(t),
    tooltip: { ...base(t).tooltip, formatter: (p: any) => `${names[p.value[1]]} → ${names[p.value[0]]}: <b>${num(p.value[2])}</b> ${label}` },
    grid: { left: 8, right: 8, top: 8, bottom: 48, containLabel: true },
    xAxis: axisCat(t, names, { axisLabel: { color: t.muted, rotate: 30, fontSize: 11 } }),
    yAxis: axisCat(t, names, { inverse: true }),
    visualMap: { min: 0, max, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 140, itemWidth: 10, inRange: { color: t.seq }, textStyle: { color: t.muted } },
    series: [{ type: 'heatmap', data, label: { show: names.length <= 6, color: t.text, fontSize: 11 }, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 } }],
  };
}
