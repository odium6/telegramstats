import { describe, expect, it } from 'vitest';
import { detectCheckins } from './intent';
import { checkinCandidate, SWEAR_RE, LOVE_RE } from './text';
import { normalizeJsonChat } from './parseJson';
import { analyze } from './analyze';
import type { Msg } from './types';

let id = 0;
const conv = (lines: [string, string, number?][]): Msg[] => {
  let ts = 1700000000;
  return lines.map(([from, text, dt]) => {
    ts += dt ?? 30;
    return { id: ++id, ts, from, service: false, kind: text.startsWith('[') ? 'round' : 'text', text: text.startsWith('[') ? '' : text };
  });
};
const asked = (lines: [string, string, number?][]) => detectCheckins(conv(lines)).map((h) => h.text);

describe('сокращения «кд / чд» по контексту', () => {
  it('«чд» с ответом о занятии — вопрос о делах', () => {
    expect(asked([['A', 'Чд'], ['B', 'Лежу, смотрю ютуб']])).toEqual(['Чд']);
    expect(asked([['A', 'А ты чд'], ['B', 'Ниче сижу']])).toEqual(['А ты чд']);
    expect(asked([['A', 'Кд'], ['B', 'норм а ты?']])).toEqual(['Кд']);
    expect(asked([['A', 'Ты сегодня чд'], ['B', 'Ресницы в два']])).toEqual(['Ты сегодня чд']);
  });
  it('«чд максимка» — только если ответ похож на ответ о делах', () => {
    expect(asked([['A', 'чд максимка'], ['B', 'Домой едем']])).toEqual(['чд максимка']);
    expect(asked([['A', 'чд илья'], ['B', '👎']])).toEqual([]);
  });
  it('риторическое «и чд», «я не знаю чд», планы и игровой K/D — не вопрос о делах', () => {
    expect(asked([['A', 'И чд'], ['B', 'Капец']])).toEqual([]);
    expect(asked([['A', 'Я не знаю чд'], ['B', 'Сама решай']])).toEqual([]);
    expect(asked([['A', 'Чд будем'], ['B', 'Хотелось бы погулять']])).toEqual([]);
    expect(asked([['A', 'Ты чд завтра?'], ['B', 'в 9 на работу']])).toEqual([]);
    expect(asked([['A', 'ты видел когда нибудь кд 10 на 10 матчей'], ['B', 'чиго']])).toEqual([]);
    expect(asked([['A', 'что такое кд'], ['B', 'как дела ахаха']])).toEqual([]);
  });
  it('«Кд» и «Чд» подряд считаются одним вопросом', () => {
    expect(asked([['A', 'Кд'], ['A', 'Чд', 5], ['B', 'сижу']])).toHaveLength(1);
  });
  it('полная фраза засчитывается даже без ответа', () => {
    expect(asked([['A', 'Привет, как дела?']])).toEqual(['Привет, как дела?']);
  });
  it('опечатки в ключевых словах', () => {
    expect(checkinCandidate('что делаеш')?.prior).toBeGreaterThan(0.5);
    expect(checkinCandidate('чем занемаешься?')?.prior).toBeGreaterThan(0.5);
  });
});

describe('словари на кириллице', () => {
  it('мат находится (в JS \\b не работает с кириллицей)', () => {
    expect(SWEAR_RE.test('бля ну')).toBe(true);
    expect(SWEAR_RE.test('Ну блять')).toBe(true);
    expect(SWEAR_RE.test('употреблять')).toBe(false);
    expect(SWEAR_RE.test('оскорблять')).toBe(false);
  });
  it('нежность без ложных срабатываний внутри слов', () => {
    expect(LOVE_RE.test('Зай, ты где')).toBe(true);
    expect(LOVE_RE.test('займусь завтра')).toBe(false);
    expect(LOVE_RE.test('помилуйте')).toBe(false);
  });
});

describe('боты и посторонние', () => {
  const messages = [
    ...Array.from({ length: 300 }, (_, i) => ({ id: i + 1, type: 'message', date_unixtime: String(1700000000 + i * 60), from: i % 2 ? 'A' : 'B', from_id: i % 2 ? 'user1' : 'user2', text: 'ок', text_entities: [] })),
    { id: 1000, type: 'message', date_unixtime: '1700020000', from: 'Spru', from_id: 'user9', text: 'реклама', text_entities: [] },
    { id: 1001, type: 'message', date_unixtime: '1700020100', from: 'A', from_id: 'user1', via_bot: '@gif', text: 'гиф', inline_bot_buttons: [[{ type: 'url', text: 'x' }]], text_entities: [] },
  ];
  const chat = normalizeJsonChat({ name: 'x', type: 'personal_chat', messages });
  it('посторонний в личном чате помечается, собеседник с инлайн-ботом — нет', () => {
    expect(chat.participants.find((p) => p.key === 'user9')?.bot).toBe('guest');
    expect(chat.participants.find((p) => p.key === 'user1')?.bot).toBeUndefined();
  });
  it('по умолчанию исключается, по опции — учитывается', () => {
    expect(analyze(chat, { tz: 0 }).people.map((p) => p.key)).not.toContain('user9');
    expect(analyze(chat, { tz: 0, includeBots: true }).people.map((p) => p.key)).toContain('user9');
  });
});
