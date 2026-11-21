// Экспорт: автономный HTML-отчёт (графики встроены картинками), печать в PDF, JSON и CSV.
// Всё формируется в браузере и сохраняется как файл — без сети.
import type { Analysis } from '../core/analyze';
import { kindLabel } from '../core/analyze';
import type { AnalysisOptions, Chat } from '../core/types';
import { fmtDuration } from '../core/time';
import { chatTypeName } from '../core/parseJson';
import { echarts } from './echarts';
import {
  calendarOption, heatmapOption, hoursOption, initiatorMonthlyOption, initiatorOption, kindsOption, num, pct,
  radarOption, responseHistOption, sentimentOption, timelineOption, weekdaysOption, wordCloudOption,
} from './charts';
import { LIGHT, colorOf, type Theme } from './theme';
import { comparisonRows, peopleTable } from './tabs/Overview';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'chat';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function renderPng(option: any, width: number, height: number, wait = 0): Promise<string> {
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(div);
  const inst = echarts.init(div, undefined, { renderer: 'canvas', width, height });
  inst.setOption({ ...option, animation: false });
  await new Promise((r) => setTimeout(r, wait || 30));
  const url = inst.getDataURL({ pixelRatio: 2, backgroundColor: '#ffffff' });
  inst.dispose();
  div.remove();
  return url;
}

export async function exportReport(a: Analysis, _t: Theme, print: boolean) {
  const t = LIGHT;
  const W = 960;
  const nameOf = (k: string) => a.people.find((p) => p.key === k)?.name ?? k;
  const imgs: { title: string; note?: string; src: string }[] = [];
  const add = async (title: string, option: any, h = 320, note?: string, wait = 0) => imgs.push({ title, note, src: await renderPng(option, W, h, wait) });

  await add('Активность во времени', timelineOption(a, t, a.range.days > 400 ? 'month' : 'week', 'stack'), 300);
  if (a.conv.responded > 3) {
    await add('Кто начинает разговор', initiatorOption(a, t), 320, 'Цветной столбец — с учётом контекста (с 95% интервалом), серый — наивный подсчёт.');
    await add('Инициатива по месяцам', initiatorMonthlyOption(a, t), 260);
  }
  await add('Тепловая карта: день недели × час', heatmapOption(a, t, null), 300);
  const cal = calendarOption(a, t);
  await add('Календарь активности', cal.option, cal.height);
  await add('По часам суток', hoursOption(a, t, false), 260);
  await add('По дням недели', weekdaysOption(a, t, false), 240);
  if (a.people.length > 1) await add('Время ответа', responseHistOption(a, t), 260);
  if (a.people.length > 1) await add('Профиль общения', radarOption(a, t), 380);
  await add('Облако слов', wordCloudOption(a.words.cloud, t), 380, undefined, 900);
  if (a.kinds.length > 1) await add('Типы сообщений', kindsOption(a, t), 300);
  await add('Тональность по месяцам', sentimentOption(a, t), 240, 'Приблизительная словарная оценка.');

  const leader = [...a.conv.rows].sort((x, y) => y.share - x.share)[0];
  const people = a.people.slice(0, 8);
  const cmp = people.length ? peopleTable(people, comparisonRows(a)) : null;
  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const kpi = (label: string, value: string, sub = '') => `<div class="kpi"><div class="l">${esc(label)}</div><div class="v">${esc(value)}</div><div class="s">${esc(sub)}</div></div>`;

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Отчёт · ${esc(a.chatName)}</title>
<style>
:root{--t:#0b0b0b;--t2:#52514e;--m:#8a8984;--b:rgba(0,0,0,.08);--s:#fcfcfb;--acc:#2a78d6}
*{box-sizing:border-box}body{margin:0;background:#f4f4f2;color:var(--t);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:40px 24px 80px}
header{background:linear-gradient(135deg,#2a78d6,#6250d6 60%,#e87ba4);color:#fff;border-radius:28px;padding:36px 36px 30px;margin-bottom:24px}
header h1{margin:0 0 6px;font-size:34px;letter-spacing:-.02em}header p{margin:0;opacity:.9}
.chips{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px}.chip{background:rgba(255,255,255,.18);border-radius:999px;padding:4px 12px;font-size:13px}
section{background:var(--s);border:1px solid var(--b);border-radius:22px;padding:24px;margin:0 0 18px;break-inside:avoid}
h2{margin:0 0 14px;font-size:20px;letter-spacing:-.01em}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi{background:#fff;border:1px solid var(--b);border-radius:16px;padding:14px}
.kpi .l{color:var(--m);font-size:12px}.kpi .v{font-size:24px;font-weight:700;letter-spacing:-.02em}.kpi .s{color:var(--t2);font-size:12px}
.hero{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;font-size:18px}.hero b{font-size:44px;letter-spacing:-.03em}
.pm{color:var(--t2)}
img{width:100%;height:auto;display:block}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--b);vertical-align:top}th{color:var(--m);font-weight:600}
td:not(:first-child),th:not(:first-child){text-align:right}.acc td:not(:first-child){text-align:left}
.facts{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}.facts li{background:#fff;border:1px solid var(--b);border-radius:14px;padding:10px 14px}
.note{color:var(--t2);font-size:13px;margin:8px 0 0}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
footer{color:var(--m);font-size:12px;text-align:center;margin-top:24px}
@media (max-width:700px){.kpis{grid-template-columns:1fr 1fr}.facts{grid-template-columns:1fr}}
@media print{body{background:#fff}.wrap{padding:0}section{border-color:#ddd}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:14mm}}
</style></head><body><div class="wrap">
<header><h1>${esc(a.chatName)}</h1><p>${esc(chatTypeName(a.chatType))} · ${fmtDate(a.range.start)} — ${fmtDate(a.range.end)} · ${num(a.range.days)} дней</p>
<div class="chips">${people.map((p) => `<span class="chip"><span class="dot" style="background:${colorOf(t, p.idx)}"></span>${esc(p.name)} · ${num(p.messages)}</span>`).join('')}</div></header>
<section><h2>Главное</h2><div class="kpis">
${kpi('Сообщений', num(a.totals.messages), `${num(a.totals.perDay, 1)} в день`)}${kpi('Слов', num(a.totals.words), `${num(a.totals.chars)} символов`)}
${kpi('Дней общения', num(a.range.activeDays), `из ${num(a.range.days)}`)}${kpi('Разговоров', num(a.conv.responded), `медиана ${fmtDuration(a.conv.medianDuration)}`)}
${kpi('Медиа', num(a.totals.media), `${num(a.totals.stickers)} стикеров`)}${kpi('Голосовые', fmtDuration(a.totals.voiceSec))}
${kpi('Звонки', num(a.calls.count), fmtDuration(a.calls.totalSec))}${kpi('Достоверность', `${a.accuracy.overall.toFixed(1)}%`, 'средневзвешенная')}
</div></section>
${leader && a.conv.responded > 3 ? `<section><h2>Кто чаще начинает разговор</h2><div class="hero"><span class="dot" style="background:${colorOf(t, a.people.find((p) => p.key === leader.key)?.idx ?? 0)}"></span>${esc(nameOf(leader.key))} <b>${pct(leader.share, 1)}</b><span class="pm">± ${(leader.margin * 100).toFixed(1)} п.п. (95% интервал)</span></div>
<p class="note">По ${num(a.conv.responded)} разговорам. Порог паузы между разговорами — ${fmtDuration(a.conv.T)}; учитываются приветствия, вопросы «как дела», отложенные ответы и извинения за задержку. Средняя уверенность классификации — ${pct(a.conv.confidence)}.</p>
<table><thead><tr><th>Участник</th><th>Начинает</th><th>±</th><th>Наивно</th><th>Первым за день</th><th>Без ответа</th><th>Последнее слово</th><th>Медиана ответа</th></tr></thead><tbody>
${[...a.conv.rows].sort((x, y) => y.share - x.share).slice(0, 12).map((r) => `<tr><td>${esc(nameOf(r.key))}</td><td>${pct(r.share, 1)}</td><td>${(r.margin * 100).toFixed(1)}</td><td>${pct(r.naiveShare, 1)}</td><td>${pct(r.dayFirstShare, 1)}</td><td>${r.attempts}</td><td>${pct(r.endedShare, 1)}</td><td>${fmtDuration(a.people.find((p) => p.key === r.key)?.response.median ?? NaN)}</td></tr>`).join('')}
</tbody></table></section>` : ''}
<section><h2>Интересные факты</h2><ul class="facts">${a.facts.map((f) => `<li>${esc(f.icon)} ${esc(f.text)}</li>`).join('')}</ul></section>
${imgs.map((i) => `<section><h2>${esc(i.title)}</h2><img src="${i.src}" alt="${esc(i.title)}">${i.note ? `<p class="note">${esc(i.note)}</p>` : ''}</section>`).join('\n')}
${cmp ? `<section><h2>Сравнение участников</h2><table><thead><tr>${cmp.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${cmp.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(typeof c === 'number' ? c.toLocaleString('ru-RU') : c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>` : ''}
<section><h2>Типы сообщений</h2><table><thead><tr><th>Тип</th><th>Количество</th></tr></thead><tbody>${a.kinds.map(([k, v]) => `<tr><td>${esc(kindLabel(k))}</td><td>${num(v)}</td></tr>`).join('')}</tbody></table></section>
<section><h2>Топ слов и эмодзи</h2><p>${a.words.top.slice(0, 40).map(([w, c]) => `${esc(w)} <span style="color:#8a8984">${c}</span>`).join(' · ')}</p><p style="font-size:22px">${a.emojiTop.slice(0, 20).map(([e]) => esc(e)).join(' ')}</p></section>
<section><h2>Точность статистики</h2><table class="acc"><thead><tr><th>Метрика</th><th>Погрешность</th><th>Пояснение</th></tr></thead><tbody>
${a.accuracy.items.map((i) => `<tr><td><b>${esc(i.name)}</b></td><td>${esc(i.value)}</td><td>${esc(i.note)}</td></tr>`).join('')}
</tbody></table><p class="note">Общая достоверность: <b>${a.accuracy.overall.toFixed(1)}%</b> (среднее отклонение ≈ ${(100 - a.accuracy.overall).toFixed(1)}%).</p></section>
<footer>Отчёт создан ${new Date().toLocaleString('ru-RU')} локально в браузере · TG Stats · данные не покидали ваш компьютер</footer>
</div></body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  if (print) {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) w.addEventListener('load', () => setTimeout(() => w.print(), 400));
    else download(blob, `TG-Stats-${safeName(a.chatName)}.html`);
  } else download(blob, `TG-Stats-${safeName(a.chatName)}.html`);
}

export function exportJson(a: Analysis) {
  download(new Blob([JSON.stringify(a, null, 1)], { type: 'application/json' }), `TG-Stats-${safeName(a.chatName)}.json`);
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');

export function exportCsvPeople(a: Analysis) {
  const people = a.people.slice(0, 200);
  if (!people.length) return;
  const t = peopleTable(people, comparisonRows(a));
  download(new Blob([csv([t.head, ...t.rows])], { type: 'text/csv' }), `TG-Stats-${safeName(a.chatName)}-участники.csv`);
}

export function exportCsvMessages(chat: Chat, opts: AnalysisOptions) {
  const names = new Map(chat.participants.map((p) => [p.key, p.name]));
  const rows: unknown[][] = [['id', 'дата', 'время', 'отправитель', 'тип', 'текст', 'ответ_на', 'переслано_от', 'изменено', 'реакции', 'файл', 'длительность_с']];
  for (const m of chat.messages) {
    if (opts.from && m.ts < opts.from) continue;
    if (opts.to && m.ts > opts.to) continue;
    const d = new Date(m.ts * 1000);
    rows.push([
      m.id, d.toLocaleDateString('ru-RU'), d.toLocaleTimeString('ru-RU'), names.get(m.from) ?? m.from, m.service && m.kind !== 'call' ? `служебное:${m.action}` : kindLabel(m.kind),
      m.text, m.replyTo ?? '', m.fwd ?? '', m.edited ? 'да' : '', m.reactions?.map((r) => `${r.emoji}×${r.count}`).join(' ') ?? '', m.media?.path ?? '', m.media?.duration ?? m.call?.duration ?? '',
    ]);
  }
  download(new Blob([csv(rows)], { type: 'text/csv' }), `TG-Stats-${safeName(chat.name)}-сообщения.csv`);
}
