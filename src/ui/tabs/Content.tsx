import { useMemo, useState } from 'react';
import { Card, ChartCard, DataTable, Dot, Stat, useApp } from '../components';
import { lengthHistOption, matrixOption, monthlyLines, num, pct, personCompareOption, sentimentOption, topBarsOption, wordCloudOption } from '../charts';
import { colorOf } from '../theme';
import type { PersonStats } from '../../core/analyze';

const per = (v: number, p: PersonStats) => (p.messages ? (v / p.messages) * 100 : 0);

export function ContentTab() {
  const { a, t, goToMessage } = useApp();
  const [who, setWho] = useState('all');
  const person = a.people.find((p) => p.key === who);
  const cloudWords = person ? person.topWords : a.words.cloud;
  const cloud = useMemo(() => wordCloudOption(cloudWords, t), [cloudWords, t]);
  const lenHist = useMemo(() => lengthHistOption(a, t), [a, t]);
  const sent = useMemo(() => sentimentOption(a, t), [a, t]);
  const wordsMonthly = useMemo(() => monthlyLines(a, t, a.wordsMonthly, (v) => `${num(v)} слов`), [a, t]);
  const styleCmp = useMemo(
    () =>
      personCompareOption(a, t, [
        { name: 'Вопросы, % сообщений', get: (p) => per(p.questions, p) },
        { name: 'Восклицания, %', get: (p) => per(p.exclaims, p) },
        { name: 'Смех, %', get: (p) => per(p.laughs, p) },
        { name: 'Нежность, %', get: (p) => per(p.loves, p) },
        { name: 'Скобочки ))), на 100', get: (p) => per(p.smiles, p) },
        { name: 'Эмодзи, на 100 сообщ.', get: (p) => per(p.emojis, p) },
        { name: 'Мат, %', get: (p) => per(p.swears, p) },
        { name: 'КАПС, %', get: (p) => per(p.caps, p) },
      ]),
    [a, t],
  );
  const domains = useMemo(() => topBarsOption(a.domains, t, t.series[0]), [a, t]);
  const emojiAll = useMemo(() => topBarsOption(a.emojiTop, t, t.series[3]), [a, t]);
  const reactTop = useMemo(() => topBarsOption(a.reactionTop, t, t.series[4]), [a, t]);
  const reactM = useMemo(() => matrixOption(a, t, a.reactionMatrix, 'реакций'), [a, t]);
  const replyM = useMemo(() => matrixOption(a, t, a.replyMatrix, 'ответов (reply)'), [a, t]);
  const people = a.people.slice(0, 6);

  return (
    <div className="grid">
      <div className="kpis span-12">
        <Stat label="Слов" value={num(a.totals.words)} />
        <Stat label="Уникальных значимых слов" value={num(a.words.cloud.length >= 150 ? a.people.reduce((s, p) => Math.max(s, p.uniqueWords), 0) : a.words.cloud.length)} sub="у самого «словарного» участника" />
        <Stat label="Вопросов" value={num(a.totals.questions)} sub={pct(a.totals.questions / Math.max(1, a.totals.messages), 1)} />
        <Stat label="Эмодзи" value={num(a.totals.emojis)} />
        <Stat label="Ссылок" value={num(a.totals.links)} />
        <Stat label="Пересланных" value={num(a.totals.forwarded)} />
        <Stat label="Отредактировано" value={num(a.totals.edited)} sub={pct(a.totals.edited / Math.max(1, a.totals.messages), 1)} />
        <Stat label="Ответов (reply)" value={num(a.totals.replies)} />
      </div>

      <ChartCard
        span={8}
        title="Облако слов"
        option={cloud}
        height={380}
        hint="Самые частые значимые слова (без предлогов, союзов и местоимений)."
        controls={
          <select className="select small" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Участник">
            <option value="all">Все</option>
            {a.people.slice(0, 20).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        }
        table={{ head: ['Слово', 'Раз'], rows: cloudWords.map(([w, c]) => [w, c]) }}
      />
      <Card span={4} title="Топ слов">
        <ol className="rank">
          {cloudWords.slice(0, 15).map(([w, c]) => (
            <li key={w}><span>{w}</span><b>{num(c)}</b></li>
          ))}
        </ol>
      </Card>

      {people.map((p) => (
        <Card key={p.key} span={people.length === 1 ? 12 : people.length === 2 ? 6 : 4} title={<><Dot color={colorOf(t, p.idx)} /> {p.name}</>}>
          <div className="mini-cols">
            <div>
              <h4>Любимые слова</h4>
              <div className="tags">{p.topWords.slice(0, 18).map(([w, c]) => <span className="tag" key={w} title={`${c} раз`}>{w}<small>{c}</small></span>)}</div>
            </div>
            {p.topPhrases.length > 0 && (
              <div>
                <h4>Любимые фразы</h4>
                <div className="tags">{p.topPhrases.slice(0, 10).map(([w, c]) => <span className="tag" key={w}>{w}<small>{c}</small></span>)}</div>
              </div>
            )}
            <div>
              <h4>Эмодзи</h4>
              <div className="emoji-row">{p.topEmojis.slice(0, 12).map(([e, c]) => <span key={e} title={`${c} раз`}>{e}<small>{c}</small></span>)}</div>
            </div>
            {p.longest && (
              <div>
                <h4>Самое длинное сообщение · {p.longest.words} слов</h4>
                <button className="quote" onClick={() => goToMessage(p.longest!.id)}>{p.longest.text.slice(0, 220)}{p.longest.text.length > 220 ? '…' : ''}</button>
              </div>
            )}
          </div>
        </Card>
      ))}

      <ChartCard span={6} title="Стиль общения" option={styleCmp} height={340} hint="Сколько процентов сообщений содержат вопрос, смех, слова нежности и т.д." />
      <ChartCard span={6} title="Длина сообщений (в словах)" option={lenHist} height={340} hint="Доля сообщений каждой длины. Короткие «ок», «да» — слева." />
      <ChartCard span={8} title="Тональность по месяцам" option={sent} height={280} hint={`Словарная оценка эмоциональной окраски от −1 до +1. Охват: ${pct(a.sentimentCoverage)} текстовых сообщений. Погрешность высокая — см. «Точность».`} />
      <Card span={4} title="Средняя тональность">
        <ul className="sent-list">
          {a.people.slice(0, 8).map((p) => (
            <li key={p.key}>
              <Dot color={colorOf(t, p.idx)} /> {p.name}
              <span className="sent-bar"><span style={{ left: '50%', width: `${Math.abs(p.sentiment) * 50}%`, transform: p.sentiment < 0 ? 'translateX(-100%)' : undefined, background: p.sentiment >= 0 ? t.pos : t.neg }} /></span>
              <b>{p.sentiment >= 0 ? '+' : ''}{p.sentiment.toFixed(2)}</b>
            </li>
          ))}
        </ul>
      </Card>
      <ChartCard span={12} title="Объём текста по месяцам" option={wordsMonthly} height={240} />

      {a.emojiTop.length > 0 && <ChartCard span={4} title="Эмодзи в тексте" option={emojiAll} height={380} />}
      {a.reactionTop.length > 0 && <ChartCard span={4} title="Реакции" option={reactTop} height={380} />}
      {a.domains.length > 0 && <ChartCard span={4} title="Сайты в ссылках" option={domains} height={380} />}
      {a.reactionTop.length > 0 && a.series.length > 1 && <ChartCard span={6} title="Кто кому ставит реакции" option={reactM} height={300} hint="Строка — кто поставил, столбец — чьему сообщению. По данным Telegram о последних реакциях." />}
      {a.totals.replies > 0 && a.series.length > 1 && <ChartCard span={6} title="Кто кому отвечает (reply)" option={replyM} height={300} />}

      <Card span={4} title="Хештеги">{a.hashtags.length ? <DataTable data={{ head: ['Хештег', 'Раз'], rows: a.hashtags }} /> : <p className="muted">Нет</p>}</Card>
      <Card span={4} title="Упоминания">{a.mentions.length ? <DataTable data={{ head: ['Кого', 'Раз'], rows: a.mentions }} /> : <p className="muted">Нет</p>}</Card>
      <Card span={4} title="Откуда пересылают">{a.forwards.length ? <DataTable data={{ head: ['Источник', 'Раз'], rows: a.forwards }} /> : <p className="muted">Нет</p>}</Card>
    </div>
  );
}
