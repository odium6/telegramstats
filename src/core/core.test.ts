// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { generateDemoJson } from './demo';
import { listChats, normalizeJsonChat } from './parseJson';
import { parseHtmlPages } from './parseHtml';
import { analyze } from './analyze';
import { segment, estimateGap } from './conversations';

describe('JSON + анализ', () => {
  const { json, truth } = generateDemoJson(7, 400);
  const chat = normalizeJsonChat(json);
  const a = analyze(chat, { tz: 0 });

  it('парсит участников и сообщения', () => {
    expect(listChats(json).single).toBe(true);
    expect(chat.participants.length).toBe(2);
    expect(a.totals.messages).toBeGreaterThan(1000);
    expect(a.totals.calls).toBeGreaterThan(0);
  });

  it('алгоритм инициатора точнее наивного подсчёта', () => {
    const events = chat.messages.filter((m) => !m.service || m.kind === 'call');
    const T = estimateGap(events).T;
    const convs = segment(events, T, (ts) => Math.floor(ts / 86400));
    const truthBy = new Map(truth.convStarts.map((t) => [t.id, t.trueInitiator]));
    let smart = 0, naive = 0, n = 0;
    for (const c of convs) {
      const t = truthBy.get(c.firstId);
      if (!t) continue;
      n++;
      const pred = c.alt && c.p < 0.5 ? c.alt : c.opener;
      if (pred === t) smart++;
      if (c.opener === t) naive++;
    }
    console.log(`T=${Math.round(T / 60)} мин, разговоров ${convs.length}, сверено ${n}; умный ${(smart / n * 100).toFixed(1)}%, наивный ${(naive / n * 100).toFixed(1)}%`);
    console.log('доли', a.conv.rows.map((r) => `${r.key}: ${(r.share * 100).toFixed(1)}% ±${(r.margin * 100).toFixed(1)} (наивно ${(r.naiveShare * 100).toFixed(1)}%)`).join('; '));
    const trueShare = truth.convStarts.filter((t) => t.trueInitiator === 'user1001').length / truth.convStarts.length;
    console.log('истинная доля Ани', (trueShare * 100).toFixed(1), 'точность общая', a.accuracy.overall.toFixed(1));
    expect(smart).toBeGreaterThan(naive);
    expect(smart / n).toBeGreaterThan(0.85);
  });
});

describe('HTML', () => {
  it('парсит базовую разметку', async () => {
    const html = `<html><body><div class="page_wrap"><div class="page_header"><a class="content block_link"><div class="text bold">Боб</div></a></div>
<div class="page_body chat_page"><div class="history">
<div class="message service" id="message-1"><div class="body details">27 January 2023</div></div>
<div class="message default clearfix" id="message10"><div class="pull_left userpic_wrap"></div><div class="body">
<div class="pull_right date details" title="27.01.2023 12:34:56 UTC+03:00">12:34</div><div class="from_name">Alice </div>
<div class="text">Привет!<br>Как дела? https://example.com</div>
<span class="reactions"><span class="reaction"><span class="emoji">❤</span><span class="count">2</span></span></span></div></div>
<div class="message default clearfix joined" id="message11"><div class="body"><div class="pull_right date details" title="27.01.2023 12:35:10 UTC+03:00">12:35</div>
<div class="media_wrap clearfix"><a class="photo_wrap clearfix pull_left" href="photos/photo_1@27-01-2023_12-35-10.jpg"><img class="photo" src="photos/photo_1@27-01-2023_12-35-10_thumb.jpg"/></a></div></div></div>
<div class="message default clearfix" id="message12"><div class="body"><div class="pull_right date details" title="27.01.2023 12:40:00 UTC+03:00">12:40</div><div class="from_name">Bob</div>
<div class="reply_to details">In reply to <a href="#go_to_message10" onclick="return GoToMessage(10)">this message</a></div>
<div class="media_wrap clearfix"><div class="media clearfix pull_left media_voice_message"><div class="fill pull_left"></div><div class="body"><div class="title bold">Voice message</div><div class="status details">00:07, 12.1 KB</div></div></div></div></div></div>
</div></div></div></body></html>`;
    const chat = await parseHtmlPages([{ name: 'messages.html', text: html }]);
    expect(chat.name).toBe('Боб');
    expect(chat.messages.length).toBe(3);
    const [m1, m2, m3] = chat.messages;
    expect(m1.from).toBe('Alice');
    expect(m1.ts).toBe(Date.UTC(2023, 0, 27, 9, 34, 56) / 1000);
    expect(m1.text).toContain('Как дела?');
    expect(m1.links?.[0]).toBe('https://example.com');
    expect(m1.reactions?.[0].count).toBe(2);
    expect(m2.from).toBe('Alice');
    expect(m2.kind).toBe('photo');
    expect(m3.replyTo).toBe(10);
    expect(m3.kind).toBe('voice');
    expect(m3.media?.duration).toBe(7);
    expect(chat.tzExact).toBe(true);
  });
});
