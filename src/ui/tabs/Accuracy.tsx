import { useMemo } from 'react';
import { Card, ChartCard, Stat, useApp } from '../components';
import { gapOption, num, pct, sensitivityOption } from '../charts';
import { fmtDuration } from '../../core/time';

const LEVEL = { exact: 'Точно', high: 'Высокая', medium: 'Средняя', low: 'Ориентир' } as const;

export function AccuracyTab() {
  const { a, t } = useApp();
  const gap = useMemo(() => gapOption(a, t), [a, t]);
  const sens = useMemo(() => sensitivityOption(a, t), [a, t]);
  const g = a.conv.gap;
  const acc = a.accuracy.overall;
  return (
    <div className="grid">
      <Card span={4} title="Общая достоверность">
        <div className="gauge solo">
          <div className="gauge-ring big" style={{ ['--p' as any]: acc, ['--c' as any]: acc > 90 ? t.series[2] : acc > 75 ? t.series[3] : t.series[7] }}>
            <span>{acc.toFixed(1)}%</span>
          </div>
          <p className="small muted">Отклонение всей статистики в среднем ≈ <b>{(100 - acc).toFixed(1)}%</b>. Средневзвешенное по метрикам ниже (тональность — с половинным весом, так как это заведомо приблизительная оценка).</p>
        </div>
      </Card>
      <Card span={8} title="Точность по метрикам">
        <div className="table-wrap">
          <table className="data-table acc-table">
            <thead>
              <tr><th>Метрика</th><th>Погрешность</th><th>Уровень</th><th>Почему</th></tr>
            </thead>
            <tbody>
              {a.accuracy.items.map((it) => (
                <tr key={it.name}>
                  <td><b>{it.name}</b></td>
                  <td className="nowrap">{it.value}</td>
                  <td className="nowrap"><span className={`lvl lvl-${it.level}`} /> {LEVEL[it.level]}</td>
                  <td className="small">{it.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card span={12} title="Как определяется, кто начинает разговор">
        <div className="method">
          <div className="method-step">
            <span className="step-n">1</span>
            <div>
              <h4>Порог паузы подбирается под вашу переписку</h4>
              <p>Паузы между сообщениями распределены «двугорбо»: короткие — внутри разговора, длинные — между разговорами. На логарифм пауз подгоняется смесь двух нормальных распределений (EM-алгоритм), и порог ставится там, где оба «горба» равновероятны. Для этого чата: <b>{fmtDuration(g.T)}</b>, разделение {g.quality === 'high' ? 'чёткое' : g.quality === 'medium' ? 'умеренное' : 'слабое'} (коэффициент Ашмана D = {g.separation.toFixed(2)}; больше 2 — хорошо).</p>
            </div>
          </div>
          <div className="method-step">
            <span className="step-n">2</span>
            <div>
              <h4>Паузы чуть длиннее порога склеиваются</h4>
              <p>Если пауза меньше 2.5× порога и нет приветствия или звонка — это пауза внутри того же разговора («отошёл на 20 минут»), а не новый разговор.</p>
            </div>
          </div>
          <div className="method-step">
            <span className="step-n">3</span>
            <div>
              <h4>Каждое начало оценивается по контексту</h4>
              <p>Вероятность того, что первое сообщение после паузы — настоящая инициатива, а не запоздалый ответ:</p>
              <ul className="factors">
                <li className="plus">длинная пауза (логарифмически)</li>
                <li className="plus">приветствие: «привет», «доброе утро», «hi»…</li>
                <li className="plus">интерес к собеседнику: «как дела», «ты как», «что делаешь»…</li>
                <li className="plus">звонок; вопрос в открывающем сообщении</li>
                <li className="plus">человек пишет снова, хотя прошлое сообщение было его</li>
                <li className="minus">это reply на сообщение собеседника из прошлого разговора</li>
                <li className="minus">прошлый разговор закончился вопросом собеседника</li>
                <li className="minus">извинение за задержку: «сорри, был занят», «только увидел»</li>
              </ul>
              <p>Инициатива делится пропорционально вероятности: открывший получает p, автор последнего неотвеченного сообщения — 1 − p.</p>
            </div>
          </div>
          <div className="method-step">
            <span className="step-n">4</span>
            <div>
              <h4>Погрешность — 95% доверительный интервал</h4>
              <p>Складывается из трёх источников: неопределённость классификации (Σp(1−p)/N²), статистическая ошибка выборки (S(1−S)/N) и чувствительность к выбору порога (разброс доли при пороге ×0.5 и ×2). Итог: <b>± {(a.conv.margin * 100).toFixed(1)} п.п.</b></p>
              <p className="muted small">Проверка на синтетической переписке с известной истиной: алгоритм верно определяет инициатора в ~95% разговоров против ~84% у наивного подсчёта «кто первым написал после паузы».</p>
            </div>
          </div>
        </div>
      </Card>

      <ChartCard span={7} title="Распределение пауз и найденный порог" option={gap} height={320} hint="Ось X — логарифмическая. Зелёная кривая — паузы внутри разговоров, оранжевая — между разговорами." />
      <ChartCard span={5} title="Устойчивость к порогу" option={sens} height={320} hint="Как изменилась бы доля начатых разговоров при пороге в 2 раза меньше или больше. Чем ровнее линии — тем надёжнее вывод." />

      <div className="kpis span-12">
        <Stat label="Разговоров проанализировано" value={num(a.conv.count)} />
        <Stat label="Средняя уверенность" value={pct(a.conv.confidence)} />
        <Stat label="Спорных (35–65%)" value={num(a.conv.ambiguous)} sub={pct(a.conv.ambiguous / Math.max(1, a.conv.responded))} />
        <Stat label="Ночное затишье" value={`~${a.conv.sleepHour}:00`} sub="граница логического дня" />
        <Stat label="Источник" value={a.source === 'html' ? 'HTML' : a.source === 'demo' ? 'Демо' : 'JSON'} />
      </div>
    </div>
  );
}
