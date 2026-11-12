/**
 * 依 William J. O'Neil《笑傲股市》CAN SLIM® 七項準則，以「真實資料」計分（0~100）。
 * 資料不足的項目回傳 null（不猜測、不填預設分數），總分只對有資料的項目依權重重新正規化，並回報 coverage。
 *
 *  C 當季盈餘成長（原書：EPS 年增 ≥25%）→ 單季 EPS 年增（FinMind 單季財報）；無資料時退回月營收年增代理，並加入營收連續性檢核
 *  A 年度盈餘成長（原書：連 3 年 ≥25%）→ 近四季 EPS 合計 vs 前四季（滾動四季近似）
 *  N 創新高/新產品  → 股價距 52 週高點的幅度（日 K ≥120 根）
 *  S 供需          → 近 50 日「上漲日成交量 ÷ 下跌日成交量」（U/D Volume Ratio）
 *  L 領導股        → 近 3/6/9/12 月加權報酬 相對大盤代理（0050）的超額報酬
 *  I 法人認同      → 近 10 日外資＋投信買賣超 ÷ 平均成交量，並參考千張大戶週變化
 *  M 大盤方向      → 0050 與 50 日、200 日（不足則 120 日）均線的位置與斜率
 */
import type { Candle } from '../types';
import type { ChipRow, Fundamental, InstRow } from './riskEngine';
import { isEtfId } from './riskEngine';
import { computeQuarterTrend, computeRevenueTrend, type MonthlyRev, type QuarterFin } from './fundamentals';
import { getMonthly, getQuarterly } from './officialStore';

export interface CanSlimResult {
  c: number | null; a: number | null; n: number | null; s: number | null; l: number | null; i: number | null; m: number | null;
  total: number; // 0~100，只含有資料的項目
  coverage: number; // 有資料的項目數（0~7）
  leaderStatus: 'LEADER' | 'LAGGARD' | 'EMERGING';
  rs5d: number | null; rs20d: number | null; rs60d: number | null; // 相對大盤的強弱分數 1~99
  notes: Partial<Record<'c' | 'a' | 'n' | 's' | 'l' | 'i' | 'm', string>>;
}

/** 分段線性插值，超出範圍時夾在端點 */
export function interp(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    if (x <= pts[k][0]) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const sma = (a: number[], p: number, off = 0) => {
  const e = a.length - off;
  if (e < p) return null;
  let s = 0;
  for (let i = e - p; i < e; i++) s += a[i];
  return s / p;
};
const ret = (closes: number[], days: number) =>
  closes.length > days ? ((closes[closes.length - 1] - closes[closes.length - 1 - days]) / closes[closes.length - 1 - days]) * 100 : null;
const r0 = (x: number) => Math.round(x);

function weightedReturn(closes: number[]): number | null {
  const parts: [number, number][] = [[63, 0.4], [126, 0.2], [189, 0.2], [252, 0.2]];
  let sum = 0, w = 0;
  for (const [d, wt] of parts) {
    const r = ret(closes, d);
    if (r !== null) { sum += r * wt; w += wt; }
  }
  return closes.length > 126 && w > 0 ? sum / w : null;
}

export function marketScore(mkt: Candle[]): { score: number | null; note: string } {
  const c = mkt.map((x) => x.close);
  if (c.length < 120) return { score: null, note: '大盤代理(0050)日K不足' };
  const px = c[c.length - 1];
  const ma50 = sma(c, 50)!, ma50p = sma(c, 50, 10)!;
  const longP = c.length >= 200 ? 200 : 120;
  const maL = sma(c, longP)!;
  const up50 = ma50 > ma50p;
  let score = 15;
  if (px > ma50 && px > maL) score = up50 ? 90 : 75;
  else if (px > ma50) score = 65;
  else if (px > maL) score = 40;
  return { score, note: `0050 ${px.toFixed(2)}｜MA50 ${ma50.toFixed(1)}（${up50 ? '上彎' : '下彎'}）｜MA${longP} ${maL.toFixed(1)}` };
}

export function computeCanSlim(args: {
  stockId: string;
  candles: Candle[];
  fundamental?: Fundamental | null;
  inst?: InstRow[];
  chip?: ChipRow[];
  monthly?: MonthlyRev[];
  quarterly?: QuarterFin[];
  marketCandles?: Candle[];
  modelHint?: unknown;
}): CanSlimResult {
  const { stockId, candles } = args;
  const etf = isEtfId(stockId);
  const closes = candles.map((c) => c.close);
  const notes: CanSlimResult['notes'] = {};

  // C：優先用「單季 EPS 年增」（FinMind 單季財報）；沒有時退回月營收年增作代理，並在說明中標明
  const qt = etf ? null : computeQuarterTrend(args.quarterly ?? getQuarterly(stockId));
  const rt = etf ? null : computeRevenueTrend(args.monthly ?? getMonthly(stockId));
  let c: number | null = null;
  if (etf) notes.c = 'ETF 不適用（改看淨值與折溢價）';
  else if (qt && qt.epsYoy !== null) {
    let sc = interp(qt.epsYoy, [[-20, 10], [0, 40], [25, 80], [50, 100]]);
    const extra: string[] = [];
    if (qt.prevEpsYoy !== null && qt.prevEpsYoy >= 25 && qt.epsYoy >= qt.prevEpsYoy) { sc += 5; extra.push('連續加速'); }
    if (qt.epsYoy >= 25 && qt.revenueYoy !== null && qt.revenueYoy < 0) { sc -= 10; extra.push('營收年增為負，EPS 成長品質存疑'); }
    c = r0(Math.max(0, Math.min(100, sc)));
    notes.c = `${qt.latestPeriod} 單季 EPS ${qt.eps}，年增 ${qt.epsYoy}%` + (qt.revenueYoy !== null ? `；單季營收年增 ${qt.revenueYoy}%` : '') + (extra.length ? `（${extra.join('、')}）` : '');
  } else {
    const yoy = rt?.latestYoy ?? num(args.fundamental?.revenue_yoy);
    if (yoy !== null && yoy !== undefined) {
      c = r0(interp(yoy, [[-20, 10], [0, 45], [25, 80], [50, 100]]));
      notes.c = `最新月營收年增 ${yoy}%（代理指標；${qt?.epsYoyNote ?? '尚無單季 EPS 年增資料'}）`;
    } else notes.c = '無財報與營收資料';
  }
  // 營收連續性：已連續成長且累計年增為正 → 小幅加分；累計轉負 → 扣分
  if (c !== null && rt) {
    if (rt.consecutivePositiveYoy >= 6 && (rt.cum3Yoy ?? 0) > 0) { c = Math.min(100, c + 5); notes.c += `；營收已連續 ${rt.consecutivePositiveYoy} 個月年增`; }
    else if (rt.cum3Yoy !== null && rt.cum3Yoy < 0) { c = Math.max(0, c - 8); notes.c += `；近3月累計營收年增 ${rt.cum3Yoy}%（轉弱）`; }
  }

  // A：近四季 EPS 合計 vs 前四季合計（原書為連續 3 年年度 EPS；官方來源僅取近 3 年，故以滾動四季近似）
  let a: number | null = null;
  if (etf) notes.a = 'ETF 不適用';
  else if (qt && qt.ttmEpsGrowth !== null) {
    a = r0(interp(qt.ttmEpsGrowth, [[-10, 10], [0, 40], [25, 85], [40, 100]]));
    notes.a = `近四季 EPS 合計 ${qt.ttmEps}，較前四季成長 ${qt.ttmEpsGrowth}%（滾動四季近似，非完整 3 年）`;
  } else notes.a = '單季財報不足 8 季或前期 EPS ≤ 0，暫無資料';

  // N
  let n: number | null = null;
  if (candles.length >= 120) {
    const hi = Math.max(...candles.slice(-250).map((x) => x.high));
    const below = ((hi - closes[closes.length - 1]) / hi) * 100;
    n = r0(interp(below, [[0, 100], [5, 85], [15, 60], [30, 30], [50, 10]]));
    notes.n = `距52週高點 ${below.toFixed(1)}%（高點 ${hi}）`;
  } else notes.n = '日K不足120根';

  // S
  let s: number | null = null;
  if (candles.length >= 51) {
    let up = 0, dn = 0;
    for (let i = candles.length - 50; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) up += candles[i].volume;
      else if (candles[i].close < candles[i - 1].close) dn += candles[i].volume;
    }
    if (dn > 0) {
      const ud = up / dn;
      s = r0(interp(ud, [[0.5, 10], [0.7, 30], [1.0, 60], [1.5, 95]]));
      notes.s = `50日 上漲量/下跌量 = ${ud.toFixed(2)}`;
    } else if (up > 0) {
      s = 95;
      notes.s = '50日皆無下跌日成交量';
    }
  } else notes.s = '日K不足51根';

  // L
  let l: number | null = null;
  let rs5: number | null = null, rs20: number | null = null, rs60: number | null = null;
  const mc = (args.marketCandles ?? []).map((x) => x.close);
  const wr = weightedReturn(closes);
  const wm = weightedReturn(mc);
  if (wr !== null && wm !== null) {
    const excess = wr - wm;
    l = r0(interp(excess, [[-30, 10], [0, 50], [30, 80], [60, 100]]));
    notes.l = `加權報酬 ${wr.toFixed(1)}% vs 大盤代理 ${wm.toFixed(1)}%（超額 ${excess.toFixed(1)}%）`;
  } else notes.l = '日K或大盤代理資料不足';
  const rel = (d: number) => {
    const r = ret(closes, d), m = ret(mc, d);
    return r !== null && m !== null ? r0(interp(r - m, [[-20, 10], [0, 50], [20, 90]])) : null;
  };
  rs5 = rel(5); rs20 = rel(20); rs60 = rel(60);

  // I
  let i: number | null = null;
  const inst = [...(args.inst ?? [])].sort((x, y) => x.trade_date.localeCompare(y.trade_date)).slice(-10);
  if (!etf && inst.length >= 3 && candles.length >= 10) {
    const net = inst.reduce((acc, r) => acc + (num(r.foreign_net) ?? 0) + (num(r.trust_net) ?? 0), 0);
    const avgVol = candles.slice(-10).reduce((acc, x) => acc + x.volume, 0) / 10;
    if (avgVol > 0) {
      const ratio = net / (avgVol * inst.length);
      let sc = interp(ratio, [[-0.05, 15], [0, 50], [0.05, 85]]);
      const chip = [...(args.chip ?? [])].sort((x, y) => x.data_date.localeCompare(y.data_date));
      let chipTxt = '';
      if (chip.length >= 2) {
        const d = (num(chip[chip.length - 1].big_holder_pct) ?? 0) - (num(chip[chip.length - 2].big_holder_pct) ?? 0);
        sc += d > 0.3 ? 8 : d < -0.3 ? -8 : 0;
        chipTxt = `；千張大戶週變化 ${d >= 0 ? '+' : ''}${d.toFixed(2)} 點`;
      }
      i = r0(Math.max(0, Math.min(100, sc)));
      notes.i = `近${inst.length}日外資+投信 ${Math.round(net / 1000).toLocaleString()} 張（占均量 ${(ratio * 100).toFixed(1)}%）${chipTxt}`;
    }
  } else notes.i = etf ? 'ETF 不適用' : '三大法人資料不足';

  // M
  const mk = marketScore(args.marketCandles ?? []);
  const m = mk.score;
  notes.m = mk.note;

  const weights: [number | null, number][] = [[c, 0.2], [a, 0.15], [n, 0.15], [s, 0.15], [l, 0.15], [i, 0.1], [m, 0.1]];
  let sum = 0, w = 0, coverage = 0;
  for (const [v, wt] of weights) if (v !== null) { sum += v * wt; w += wt; coverage++; }
  const total = w > 0 ? r0(sum / w) : 0;
  const leaderStatus: CanSlimResult['leaderStatus'] = l === null ? 'EMERGING' : l >= 75 ? 'LEADER' : l < 45 ? 'LAGGARD' : 'EMERGING';
  return { c, a, n, s, l, i, m, total, coverage, leaderStatus, rs5d: rs5, rs20d: rs20, rs60d: rs60, notes };
}
