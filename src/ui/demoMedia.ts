// Демо-режим: медиафайлы рисуются на лету, чтобы галерея и плееры были живыми.
const EMO = ['🌅', '🐈', '☕', '🍕', '🌲', '🎉', '🏖️', '🌃', '🍰', '🚲', '🌸', '🎸'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function canvasBlob(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, type = 'image/jpeg'): Promise<Blob | null> {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  return new Promise((res) => cv.toBlob(res, type, 0.85));
}

function wavTone(seconds: number, seed: number): Blob {
  const rate = 8000;
  const n = Math.floor(rate * Math.min(seconds, 6));
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  const f = 180 + (seed % 200);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 8) * Math.min(1, (n / rate - t) * 8) * (0.5 + 0.5 * Math.sin(t * 9));
    v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * f * t) * 6000 * env, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function demoMediaGenerator(path: string): Promise<Blob | null> {
  const h = hash(path);
  if (path.startsWith('photos/') || path.endsWith('_thumb.jpg')) {
    const tall = h % 2 === 0;
    return canvasBlob(tall ? 480 : 640, tall ? 640 : 480, (c) => {
      const W = c.canvas.width, H = c.canvas.height;
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, `hsl(${h % 360} 70% 62%)`);
      g.addColorStop(1, `hsl(${(h >> 8) % 360} 65% 42%)`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.font = `${Math.round(W / 3)}px serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(EMO[h % EMO.length], W / 2, H / 2);
    });
  }
  if (path.startsWith('stickers/')) {
    return canvasBlob(256, 256, (c) => {
      c.font = '180px serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(['😂', '❤️', '😘', '👍', '😴', '🤔', '🐱', '🔥', '🥳'][h % 9], 128, 140);
    }, 'image/png');
  }
  if (path.startsWith('voice_messages/')) return wavTone(3 + (h % 5), h);
  return null;
}
