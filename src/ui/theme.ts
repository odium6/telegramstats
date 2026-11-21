import { OTHER_COLOR, SERIES_DARK, SERIES_LIGHT } from '../core/common';

export interface Theme {
  dark: boolean;
  text: string;
  text2: string;
  muted: string;
  grid: string;
  axis: string;
  surface: string;
  border: string;
  series: string[];
  other: string;
  seq: string[]; // последовательная шкала (синий)
  pos: string;
  neg: string;
  neutral: string;
  font: string;
}

export const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

export const LIGHT: Theme = {
  dark: false,
  text: '#0b0b0b',
  text2: '#52514e',
  muted: '#8a8984',
  grid: 'rgba(0,0,0,0.06)',
  axis: 'rgba(0,0,0,0.18)',
  surface: '#fcfcfb',
  border: 'rgba(0,0,0,0.08)',
  series: SERIES_LIGHT,
  other: OTHER_COLOR,
  seq: ['#eef4fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  pos: '#2a78d6',
  neg: '#e34948',
  neutral: '#b9b8b3',
  font: FONT,
};

export const DARK: Theme = {
  dark: true,
  text: '#f0efec',
  text2: '#c3c2b7',
  muted: '#8f8e88',
  grid: 'rgba(255,255,255,0.07)',
  axis: 'rgba(255,255,255,0.2)',
  surface: '#1a1a19',
  border: 'rgba(255,255,255,0.09)',
  series: SERIES_DARK,
  other: '#6f6e69',
  seq: ['#23262b', '#104281', '#184f95', '#1c5cab', '#2a78d6', '#3987e5', '#6da7ec', '#9ec5f4'],
  pos: '#3987e5',
  neg: '#e66767',
  neutral: '#5e5d58',
  font: FONT,
};

export const colorOf = (t: Theme, idx: number) => (idx < 0 ? t.other : t.series[idx % t.series.length]);
