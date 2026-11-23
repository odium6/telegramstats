import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { echarts } from './echarts';
import type { Theme } from './theme';
import { Icon } from './icons';
import type { Analysis } from '../core/analyze';
import type { Chat, Labels } from '../core/types';
import type { useMl } from './ml';
import type { MediaStore } from '../core/loader';

export interface Ctx {
  a: Analysis;
  chat: Chat;
  t: Theme;
  media: MediaStore;
  goToMessage: (id: number) => void;
  openMediaPicker: () => void;
  labels: Labels;
  setLabel: SetLabel;
  ml: ReturnType<typeof useMl>;
  openReview: () => void;
}
export type SetLabel = <K extends keyof Labels>(kind: K, key: keyof Labels[K] & (string | number), v: 0 | 1 | undefined) => void;
export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx');
  return c;
};

export interface TableData {
  head: string[];
  rows: (string | number)[][];
}

export function Chart({ option, height = 300, onClick, label, onInstance }: { option: any; height?: number; onClick?: (p: any) => void; label: string; onInstance?: (i: any) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<any>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  useEffect(() => {
    const el = ref.current!;
    const i = echarts.init(el, undefined, { renderer: 'canvas' });
    inst.current = i;
    onInstance?.(i);
    i.on('click', (p: any) => clickRef.current?.(p));
    const ro = new ResizeObserver(() => i.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      i.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    inst.current?.setOption(option, true);
  }, [option]);
  return <div ref={ref} className="chart" style={{ height }} role="img" aria-label={label} />;
}

export function Card({ title, hint, children, span = 6, actions, className = '', id }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; span?: number; actions?: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card span-${span} ${className}`} id={id}>
      {(title || actions) && (
        <header className="card-head">
          <div className="card-title">
            <h3>{title}</h3>
            {hint && <Info text={hint} />}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Info({ text }: { text: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="icon-btn tiny" aria-label="Как считается" onClick={() => setOpen((o) => !o)}>
        <Icon.info size={15} />
      </button>
      {open && <span className="info-pop" role="tooltip">{text}</span>}
    </span>
  );
}

export function ChartCard({ title, hint, option, height, span = 6, table, controls, onClick, filename }: { title: string; hint?: ReactNode; option: any; height?: number; span?: number; table?: TableData; controls?: ReactNode; onClick?: (p: any) => void; filename?: string }) {
  const { t } = useApp();
  const [showTable, setShowTable] = useState(false);
  const inst = useRef<any>(null);
  const png = () => {
    const url = inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: t.surface });
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename ?? title}.png`;
    a.click();
  };
  return (
    <Card
      title={title}
      hint={hint}
      span={span}
      actions={
        <>
          {controls}
          {table && (
            <button className={`icon-btn ${showTable ? 'on' : ''}`} onClick={() => setShowTable((s) => !s)} aria-label="Показать таблицей" title="Таблица">
              <Icon.table size={17} />
            </button>
          )}
          <button className="icon-btn" onClick={png} aria-label="Скачать PNG" title="Скачать PNG">
            <Icon.download size={17} />
          </button>
        </>
      }
    >
      {showTable && table ? <DataTable data={table} /> : <Chart option={option} height={height} label={title} onClick={onClick} onInstance={(i) => (inst.current = i)} />}
    </Card>
  );
}

export function DataTable({ data, max = 400 }: { data: TableData; max?: number }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>{data.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.slice(0, max).map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{typeof c === 'number' ? c.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />;
}

export function Bar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="split-bar" role="img" aria-label={parts.map((p) => `${p.label}: ${((p.value / total) * 100).toFixed(1)}%`).join(', ')}>
      {parts.map((p, i) => (
        <span key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${((p.value / total) * 100).toFixed(1)}%`} />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/**
 * Позиция элемента относительно начала документа (для useWindowVirtualizer).
 * offsetTop не подходит — он считается от ближайшего позиционированного предка,
 * и виртуальный список тогда рисует не те строки при прокрутке.
 */
export function useDocTop(ref: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  const [top, setTop] = useState(0);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setTop(Math.round(r.top + window.scrollY));
      setWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { top, width };
}
