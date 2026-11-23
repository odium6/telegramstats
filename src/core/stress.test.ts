import { describe, expect, it } from 'vitest';
import { generateDemoJson } from './demo';
import { normalizeJsonChat } from './parseJson';
import { analyze } from './analyze';

// Регрессия «Maximum call stack size exceeded» на больших экспортах.
describe('большие переписки', () => {
  it('~400 тыс. сообщений за 8 лет', () => {
    const { json } = generateDemoJson(3, 3000);
    // утраиваем объём, сдвигая копии во времени
    const base = json.messages;
    const span = Number(base[base.length - 1].date_unixtime) - Number(base[0].date_unixtime) + 86400;
    let id = 1;
    json.messages = [0, 1, 2].flatMap((k) => base.map((m: any) => ({ ...m, id: id++, date_unixtime: String(Number(m.date_unixtime) + k * span) })));
    const chat = normalizeJsonChat(json);
    const t0 = Date.now();
    const a = analyze(chat, { tz: 'local' });
    console.log(`сообщений ${chat.messages.length}, анализ ${Date.now() - t0} мс`);
    expect(a.totals.messages).toBeGreaterThan(300000);
  }, 120000);

  it('один человек пишет 250 тыс. сообщений подряд', () => {
    const messages = Array.from({ length: 250000 }, (_, i) => ({
      id: i + 1, type: 'message', date_unixtime: String(1600000000 + i * 5), from: 'A', from_id: 'user1', text: 'да', text_entities: [],
    }));
    messages.push({ id: 250001, type: 'message', date_unixtime: '1700000000', from: 'B', from_id: 'user2', text: 'ну?', text_entities: [] });
    const a = analyze(normalizeJsonChat({ name: 'x', type: 'personal_chat', messages }), { tz: 0 });
    expect(a.people[0].maxRun).toBe(250000);
  }, 120000);

  it('250 тыс. быстрых ответов (большие массивы времени ответа)', () => {
    const messages = Array.from({ length: 250000 }, (_, i) => ({
      id: i + 1, type: 'message', date_unixtime: String(1600000000 + i * 3), from: i % 2 ? 'A' : 'B', from_id: i % 2 ? 'user1' : 'user2', text: 'ок', text_entities: [],
    }));
    const a = analyze(normalizeJsonChat({ name: 'x', type: 'personal_chat', messages }), { tz: 0 });
    expect(a.people[0].response.n).toBeGreaterThan(100000);
  }, 120000);
});
