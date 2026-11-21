// Разложение unix-времени на локальные компоненты с учётом выбранного часового пояса.

export interface TimeParts {
  y: number;
  mo: number; // 0..11
  d: number;
  h: number;
  dow: number; // 0 = понедельник
  dayKey: number; // число дней от эпохи в локальной зоне
}

export function makeTz(tz: 'local' | number) {
  if (tz === 'local') {
    return (ts: number): TimeParts => {
      const dt = new Date(ts * 1000);
      const y = dt.getFullYear();
      const mo = dt.getMonth();
      const d = dt.getDate();
      return { y, mo, d, h: dt.getHours(), dow: (dt.getDay() + 6) % 7, dayKey: Math.floor(Date.UTC(y, mo, d) / 86400000) };
    };
  }
  const off = tz * 60;
  return (ts: number): TimeParts => {
    const dt = new Date((ts + off) * 1000);
    return {
      y: dt.getUTCFullYear(),
      mo: dt.getUTCMonth(),
      d: dt.getUTCDate(),
      h: dt.getUTCHours(),
      dow: (dt.getUTCDay() + 6) % 7,
      dayKey: Math.floor((ts + off) / 86400),
    };
  };
}

export const dayKeyToIso = (k: number) => new Date(k * 86400000).toISOString().slice(0, 10);
export const monthKey = (p: TimeParts) => p.y * 12 + p.mo;
export const monthKeyToIso = (k: number) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
/** ISO-неделя → ключ понедельника (dayKey) */
export const weekKey = (p: TimeParts) => p.dayKey - p.dow;

export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  sec = Math.round(sec);
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} мин${sec % 60 && m < 10 ? ` ${sec % 60} с` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч${m % 60 ? ` ${m % 60} мин` : ''}`;
  const d = Math.floor(h / 24);
  return `${d} д${h % 24 ? ` ${h % 24} ч` : ''}`;
}
