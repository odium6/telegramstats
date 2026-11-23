import { describe, expect, it } from 'vitest';
import { calibrate, CONV_W0_FOR_TEST } from './calibrate.testkit';
import { changePoints } from './changes';
import { detectCheckins, learnVocab } from './intent';
import { readReceipts } from './rhythm';
import { findTension } from './tension';
import type { Msg } from './types';

let id = 0;
const msg = (from: string, text: string, ts: number, extra: Partial<Msg> = {}): Msg => ({ id: ++id, ts, from, service: false, kind: 'text', text, ...extra });

describe('калибровка по ответам пользователя', () => {
  it('дообучает вес признака, если пользователь последовательно с ним не согласен', () => {
    // признак 0 по умолчанию «за» (вес +2), но пользователь отвечает «нет»
    const X = Array.from({ length: 60 }, (_, i) => [i % 2, (i % 3) / 2]);
    const y = X.map((x) => (x[0] ? 0 : 1));
    const r = calibrate(X, y, CONV_W0_FOR_TEST);
    expect(r.fitted).toBe(true);
    expect(r.baseAgreement!).toBeLessThan(0.6);
    expect(r.agreement!).toBeGreaterThan(0.9);
    expect(r.weights[0]).toBeLessThan(0);
  });
  it('мало ответов — веса не меняются, но совпадение всё равно меряется', () => {
    const r = calibrate([[1, 0], [0, 1]], [1, 1], CONV_W0_FOR_TEST);
    expect(r.fitted).toBe(false);
    expect(r.n).toBe(2);
  });
});

describe('ответы пользователя переопределяют решение', () => {
  it('отклонённый вопрос не засчитывается, подтверждённый — засчитывается', () => {
    const ev = [msg('A', 'Как дела?', 100), msg('B', 'норм', 130), msg('A', 'чд илья', 5000), msg('B', '👎', 5030)];
    const base = detectCheckins(ev);
    expect(base.hits.map((h) => h.text)).toEqual(['Как дела?']);
    const r = detectCheckins(ev, { [ev[0].id]: 0, [ev[2].id]: 1 });
    expect(r.hits.map((h) => h.text)).toEqual(['чд илья']);
  });
});

describe('словарь из самой переписки', () => {
  it('находит обращение по имени и учит новую фразу-вопрос', () => {
    const ev: Msg[] = [];
    let t = 1000;
    for (let i = 0; i < 12; i++) {
      ev.push(msg('A', 'Максимка', (t += 600)));
      ev.push(msg('A', 'ты где', (t += 20)));
      ev.push(msg('A', 'доброе утро максимка', (t += 30)));
      ev.push(msg('B', 'дома', (t += 60)));
      ev.push(msg('A', 'шо ты?', (t += 600)));
      ev.push(msg('B', 'лежу', (t += 40)));
    }
    const { report } = learnVocab(ev);
    expect(report.address).toContain('максимка');
    expect(report.phrases.map((p) => p.phrase)).toContain('шо ты');
    expect(detectCheckins(ev).hits.some((h) => h.text === 'шо ты?')).toBe(true);
  });
});

describe('переломные моменты', () => {
  it('находят сдвиг среднего и не находят его в шуме', () => {
    const y = [...Array(10).fill(0).map((_, i) => 40 + (i % 3)), ...Array(10).fill(0).map((_, i) => 60 + (i % 3))];
    const cps = changePoints(y);
    expect(cps).toHaveLength(1);
    expect(cps[0].index).toBe(10);
    expect(changePoints(Array.from({ length: 20 }, (_, i) => 50 + ((i * 7) % 5)))).toHaveLength(0);
  });
});

describe('«прочитано» по времени реакций', () => {
  it('считает реакцию без ответа «прочитал и промолчал»', () => {
    const a = msg('A', 'ты тут?', 1000, { reactions: [{ emoji: '❤', count: 1, from: ['B'], dates: [1300] }] });
    const r = readReceipts([a, msg('A', 'алло', 9000)], ['A', 'B']).find((x) => x.key === 'B')!;
    expect(r.reactions).toBe(1);
    expect(r.latency).toBe(300);
    expect(r.silentReads).toBe(1);
  });
});

describe('напряжённые периоды', () => {
  it('находят многодневную ссору с обычным общением внутри и примирением', () => {
    const ev: Msg[] = [];
    const day = 86400;
    let t = 0;
    for (let d = 0; d < 80; d++) {
      for (let k = 0; k < 20; k++) ev.push(msg(k % 2 ? 'A' : 'B', k % 5 ? 'ок давай' : 'люблю тебя', d * day + 36000 + k * 120));
      if (d === 40) ['ты опять', 'мне обидно', 'как хочешь', 'ну и пожалуйста'].forEach((s, i) => ev.push(msg(i % 2 ? 'A' : 'B', s, d * day + 50000 + i * 60)));
      if (d === 42) ['почему ты так', 'мне больно'].forEach((s, i) => ev.push(msg('B', s, d * day + 50000 + i * 60)));
      if (d === 43) ev.push(msg('A', 'прости меня', d * day + 60000));
      t = d;
    }
    const eps = findTension(ev, (ts) => Math.floor(ts / day), (k) => `d${k}`);
    expect(t).toBe(79);
    expect(eps).toHaveLength(1);
    expect(eps[0].start).toBe('d40');
    expect(eps[0].end).toBe('d42');
    expect(eps[0].reconciler).toBe('A');
  });
});
