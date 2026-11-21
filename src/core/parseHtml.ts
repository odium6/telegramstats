import type { Chat, Media, Msg, MsgKind } from './types';
import { extractFromText, finalizeChat } from './common';

/* HTML-экспорт Telegram Desktop (export_output_html.cpp):
 * messages.html, messages2.html … по 1000 сообщений в файле.
 *  <div class="message default clearfix [joined]" id="message123">
 *    <div class="body">
 *      <div class="pull_right date details" title="27.01.2023 12:34:56 UTC+03:00">12:34</div>
 *      <div class="from_name">Имя</div>               — отсутствует у «joined»
 *      <div class="forwarded body">…</div>             — пересланное
 *      <div class="reply_to details">In reply to <a href="#go_to_message122">…
 *      <div class="media_wrap clearfix">…</div>
 *      <div class="text">…</div>
 *      <span class="reactions">…</span>
 *  <div class="message service" id="message-1"> — разделитель даты (отрицательный id)
 * Работает в основном потоке (нужен DOMParser). */

export interface HtmlPage {
  name: string;
  text: string;
}

export function pageOrder(name: string): number {
  const m = /messages(\d*)\.html$/i.exec(name);
  return m ? (m[1] ? Number(m[1]) : 1) : 0;
}

let tzSeen = false;
let tzMissing = false;

export function parseHtmlDate(title: string | null): number | null {
  if (!title) return null;
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\s*UTC\s*([+-])(\d{1,2}):?(\d{2})?)?/.exec(title);
  if (!m) return null;
  const [, d, mo, y, h, mi, s, sign, oh, om] = m;
  if (sign) {
    tzSeen = true;
    const off = (Number(oh) * 60 + Number(om || 0)) * (sign === '-' ? -1 : 1);
    return Math.floor(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 1000) - off * 60;
  }
  tzMissing = true;
  return Math.floor(new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime() / 1000);
}

function textOf(el: Element | null): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return (clone.textContent ?? '').replace(/ /g, ' ').trim();
}

function durationFrom(s: string): number | undefined {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
}

function parseMedia(wrap: Element, m: Msg): { kind: MsgKind; media?: Media } {
  const a = (sel: string) => wrap.querySelector(sel);
  const href = (el: Element | null) => (el?.getAttribute('href') || el?.getAttribute('src') || undefined);
  let el: Element | null;
  if ((el = a('.photo_wrap'))) {
    return { kind: 'photo', media: { path: href(el), thumb: el.querySelector('img')?.getAttribute('src') ?? undefined } };
  }
  if ((el = a('.sticker_wrap, img.sticker'))) {
    const img = el.matches('img') ? el : el.querySelector('img');
    return { kind: 'sticker', media: { path: href(el.closest('a')) ?? href(img), thumb: img?.getAttribute('src') ?? undefined } };
  }
  if ((el = a('.animated_wrap'))) return { kind: 'gif', media: { path: href(el), thumb: el.querySelector('img')?.getAttribute('src') ?? undefined } };
  if ((el = a('.video_file_wrap'))) {
    return {
      kind: 'video',
      media: { path: href(el), thumb: el.querySelector('img')?.getAttribute('src') ?? undefined, duration: durationFrom(textOf(el.querySelector('.video_duration'))) },
    };
  }
  if ((el = a('.media_poll'))) {
    const answers = [...el.querySelectorAll('.answer')].map((x) => {
      const det = textOf(x.querySelector('.details'));
      return { text: textOf(x).replace(det, '').replace(/^-\s*/, '').trim(), voters: Number(/(\d+)/.exec(det)?.[1] ?? 0) };
    });
    m.poll = { q: textOf(el.querySelector('.question')), answers, total: Number(/(\d+)/.exec(textOf(el.querySelector('.total')))?.[1] ?? 0) };
    return { kind: 'poll' };
  }
  const gen = a('.media');
  if (!gen) return { kind: 'other' };
  const cls = gen.className;
  const title = textOf(gen.querySelector('.title'));
  const status = textOf(gen.querySelector('.status'));
  const desc = textOf(gen.querySelector('.description'));
  const path = href(gen);
  const missing = !path;
  const thumb = gen.querySelector('img.thumb')?.getAttribute('src') ?? undefined;
  if (cls.includes('media_call')) {
    const dur = /(\d+)\s*sec/i.exec(status)?.[1];
    const low = status.toLowerCase();
    m.service = true;
    m.action = 'phone_call';
    m.call = {
      duration: dur ? Number(dur) : 0,
      reason: low.includes('missed') ? 'missed' : low.includes('declined') || low.includes('cancel') ? 'busy' : undefined,
    };
    return { kind: 'call' };
  }
  if (cls.includes('media_voice_message')) return { kind: 'voice', media: { path, missing, duration: durationFrom(status) } };
  if (cls.includes('media_audio_file')) return { kind: 'audio', media: { path, missing, title, performer: desc, duration: durationFrom(status) } };
  if (cls.includes('media_video')) {
    const round = /video message|видеосообщ/i.test(title);
    return { kind: round ? 'round' : 'video', media: { path, missing, thumb, duration: durationFrom(status) } };
  }
  if (cls.includes('media_photo')) return { kind: 'photo', media: { path, missing } };
  if (cls.includes('media_file')) return { kind: 'file', media: { path, missing, name: title, thumb } };
  if (cls.includes('media_live_location')) return { kind: 'live_location' };
  if (cls.includes('media_location')) {
    const ll = /(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(desc || status || path || '');
    if (ll) m.loc = { lat: Number(ll[1]), lon: Number(ll[2]) };
    return { kind: 'location' };
  }
  if (cls.includes('media_venue')) return { kind: 'venue' };
  if (cls.includes('media_contact')) return { kind: 'contact' };
  if (cls.includes('media_game')) return { kind: 'game' };
  if (cls.includes('media_invoice')) return { kind: 'invoice' };
  return { kind: 'other', media: path ? { path } : undefined };
}

export function chatNameFromHtml(text: string): string {
  const m = /<div class="page_header">[\s\S]*?<div class="text bold">\s*([\s\S]*?)\s*<\/div>/.exec(text);
  if (!m) return 'Чат';
  const tmp = new DOMParser().parseFromString(`<p>${m[1]}</p>`, 'text/html');
  return (tmp.body.textContent ?? 'Чат').trim();
}

export async function parseHtmlPages(pages: HtmlPage[], onProgress?: (p: number) => void): Promise<Chat> {
  tzSeen = false;
  tzMissing = false;
  pages.sort((a, b) => pageOrder(a.name) - pageOrder(b.name));
  const parser = new DOMParser();
  const messages: Msg[] = [];
  const names = new Map<string, string>();
  let name = 'Чат';
  let prevFrom = '';
  let prevTs = 0;

  for (let pi = 0; pi < pages.length; pi++) {
    const doc = parser.parseFromString(pages[pi].text, 'text/html');
    if (pi === 0) name = (doc.querySelector('.page_header .text.bold')?.textContent ?? 'Чат').trim();
    const nodes = doc.querySelectorAll('.history > .message');
    for (const node of nodes) {
      const idNum = Number(node.id.replace('message', ''));
      if (!Number.isFinite(idNum) || idNum < 0) continue; // разделители дат
      const cls = node.className;
      if (cls.includes('service')) {
        const text = textOf(node.querySelector('.body.details'));
        messages.push({ id: idNum, ts: prevTs, from: '', service: true, kind: 'service', action: 'service_text', text });
        continue;
      }
      const body = node.querySelector(':scope > .body');
      if (!body) continue;
      const ts = parseHtmlDate(body.querySelector(':scope > .date')?.getAttribute('title') ?? null) ?? prevTs;
      prevTs = ts;
      let from = prevFrom;
      const fn = body.querySelector(':scope > .from_name');
      let viaBot: string | undefined;
      if (fn) {
        let n = textOf(fn);
        const via = / via (@\w+)$/.exec(n);
        if (via) {
          viaBot = via[1];
          n = n.slice(0, via.index);
        }
        from = n.trim() || 'Удалённый аккаунт';
        names.set(from, from);
      }
      prevFrom = from;
      const m: Msg = { id: idNum, ts, from, service: false, kind: 'text', text: '' };
      if (viaBot) m.viaBot = viaBot;
      const fwd = body.querySelector(':scope > .forwarded.body');
      const content = fwd ?? body;
      if (fwd) {
        const ffn = fwd.querySelector(':scope > .from_name');
        if (ffn) {
          const c = ffn.cloneNode(true) as Element;
          c.querySelectorAll('.details').forEach((d) => d.remove());
          m.fwd = (c.textContent ?? '').trim();
        } else m.fwd = '…';
      }
      const reply = body.querySelector('.reply_to a') ?? body.querySelector('.reply_to');
      const rh = reply?.getAttribute?.('href') ?? '';
      const rm = /go_to_message(\d+)/.exec(rh);
      if (rm) m.replyTo = Number(rm[1]);
      const mw = content.querySelector(':scope > .media_wrap');
      if (mw) {
        const { kind, media } = parseMedia(mw, m);
        m.kind = kind;
        if (media) m.media = media;
      }
      const textEl = content.querySelector(':scope > .text');
      m.text = textOf(textEl);
      if (textEl) {
        textEl.querySelectorAll('a[href]').forEach((a) => {
          const h = a.getAttribute('href') ?? '';
          if (/^https?:/i.test(h)) (m.links ??= []).push(h);
        });
        const hashOrMention = m.text;
        const tmp: Msg = { ...m, links: undefined };
        extractFromText(hashOrMention, tmp);
        if (tmp.hashtags) m.hashtags = tmp.hashtags;
        if (tmp.mentions) m.mentions = tmp.mentions;
        if (!m.links && tmp.links) m.links = tmp.links;
      }
      const reacts = body.querySelectorAll('.reactions .reaction');
      if (reacts.length) {
        m.reactions = [...reacts].map((r) => {
          const cnt = textOf(r.querySelector('.count'));
          const pics = r.querySelectorAll('.userpics .userpic');
          return {
            emoji: textOf(r.querySelector('.emoji')) || '❔',
            count: cnt ? Number(cnt) : pics.length || 1,
            from: [...pics].map((p) => p.getAttribute('title') ?? '').filter(Boolean),
          };
        });
      }
      messages.push(m);
    }
    onProgress?.((pi + 1) / pages.length);
    if (pi % 5 === 4) await new Promise((r) => setTimeout(r, 0));
  }
  // временные метки сервисных сообщений: берём ближайшее следующее сообщение, если перед ними ничего не было
  for (let i = messages.length - 2; i >= 0; i--) if (!messages[i].ts) messages[i].ts = messages[i + 1].ts;

  const warnings: string[] = [];
  if (tzMissing && !tzSeen) warnings.push('В HTML нет часового пояса — время интерпретировано как локальное время браузера');
  warnings.push('HTML-экспорт не содержит отметок редактирования и ID участников — часть статистики недоступна. Для максимальной точности экспортируйте в JSON.');
  return finalizeChat({ name, type: 'html', messages, source: 'html', tzExact: tzSeen && !tzMissing, warnings }, names);
}
