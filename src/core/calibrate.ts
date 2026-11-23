/* ───────────── Калибровка по ответам пользователя ─────────────
 *
 * Каждое решение алгоритма — логистическая модель p = σ(w·x + b) над
 * признаками (приветствие, ответ собеседника, пауза…). Базовые веса w₀
 * подобраны вручную. Когда пользователь отмечает «верно / неверно»,
 * веса дообучаются под конкретную переписку:
 *
 *   min Σ logloss(yᵢ, σ(w·xᵢ)) + λ·‖w − w₀‖²
 *
 * Штраф λ тянет веса к базовым — при малом числе ответов модель почти не
 * меняется, при сотнях ответов подстраивается сильнее. Точность меряется
 * честно: перекрёстной проверкой (5 частей), т.е. на ответах, которых
 * модель при обучении не видела.
 */

export interface ModelReport {
  /** сколько ответов пользователя */
  n: number;
  /** веса дообучены (хватило ответов обоих классов) */
  fitted: boolean;
  /** доля совпадений базовой модели с ответами пользователя */
  baseAgreement: number | null;
  /** доля совпадений дообученной модели (перекрёстная проверка) */
  agreement: number | null;
  /** 95% интервал Уилсона для agreement */
  ci: [number, number] | null;
  weights: number[];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
export const dot = (w: number[], x: number[]) => {
  let s = w[w.length - 1]; // последний вес — сдвиг (bias)
  for (let i = 0; i < x.length; i++) s += w[i] * x[i];
  return s;
};

export function fitLogistic(X: number[][], y: number[], w0: number[], lambda = 2): number[] {
  const w = [...w0];
  const m = [...w0].fill(0);
  const v = [...w0].fill(0);
  const lr = 0.05;
  for (let it = 1; it <= 600; it++) {
    const g = w.map((wi, j) => 2 * lambda * (wi - w0[j]));
    for (let i = 0; i < X.length; i++) {
      const err = sigmoid(dot(w, X[i])) - y[i];
      for (let j = 0; j < X[i].length; j++) g[j] += err * X[i][j];
      g[g.length - 1] += err;
    }
    // Adam
    for (let j = 0; j < w.length; j++) {
      m[j] = 0.9 * m[j] + 0.1 * g[j];
      v[j] = 0.999 * v[j] + 0.001 * g[j] * g[j];
      const mh = m[j] / (1 - 0.9 ** it);
      const vh = v[j] / (1 - 0.999 ** it);
      w[j] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
    }
  }
  return w;
}

export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** Дообучает веса по ответам и меряет точность перекрёстной проверкой. */
export function calibrate(X: number[][], y: number[], w0: number[]): ModelReport {
  const n = y.length;
  const agree = (w: number[], idx: number[]) => idx.filter((i) => (sigmoid(dot(w, X[i])) >= 0.5 ? 1 : 0) === y[i]).length;
  const all = y.map((_, i) => i);
  const baseAgreement = n ? agree(w0, all) / n : null;
  const pos = y.filter((v) => v === 1).length;
  if (n < 12 || pos === 0 || pos === n) {
    return { n, fitted: false, baseAgreement, agreement: baseAgreement, ci: n ? wilson(agree(w0, all), n) : null, weights: w0 };
  }
  // 5-кратная перекрёстная проверка
  let k = 0;
  const folds = 5;
  for (let f = 0; f < folds; f++) {
    const test = all.filter((i) => i % folds === f);
    const train = all.filter((i) => i % folds !== f);
    const w = fitLogistic(train.map((i) => X[i]), train.map((i) => y[i]), w0);
    k += agree(w, test);
  }
  return { n, fitted: true, baseAgreement, agreement: k / n, ci: wilson(k, n), weights: fitLogistic(X, y, w0) };
}

export { sigmoid };
