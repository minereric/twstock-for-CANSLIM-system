/**
 * 由 FinMind 同步進資料庫的「月營收歷史」「單季財報」計算 CAN SLIM 需要的成長與連續性指標。
 * 全部為純函式；資料不足一律回傳 null，不補值、不猜測。
 * 注意：FinMind 財報的日期是「財報期末日」，不含公司實際公告日；因此只代表「已入庫的最新一期」，
 *       公司尚未公告的新季度不會出現（畫面會標示最新期別與資料取得日）。
 */
export interface MonthlyRev { stock_id: string; ym: string; revenue: number | string | null }
export interface QuarterFin {
  stock_id: string;
  period_end: string; // YYYY-MM-DD（單季）
  revenue: number | string | null;
  gross_profit: number | string | null;
  operating_income: number | string | null;
  eps: number | string | null;
  fetched_at?: string | null;
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const pct = (cur: number, base: number) => ((cur - base) / Math.abs(base)) * 100;
const r1 = (x: number) => Number(x.toFixed(1));
const shiftYm = (ym: string, months: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + months;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export interface RevenueTrend {
  latestYm: string;
  yoyByMonth: { ym: string; yoy: number | null }[]; // 近 12 個月（新→舊反轉為舊→新）
  latestYoy: number | null;
  latestMom: number | null;
  consecutivePositiveYoy: number; // 由最新月往前，連續「年增 > 0」的月數
  cum3Yoy: number | null; // 近 3 個月累計營收年增
  cum6Yoy: number | null;
  cum12Yoy: number | null;
  ytdYoy: number | null; // 今年累計（含春節月份影響時的輔助觀察）
  months: number; // 已有的月份數
}

export function computeRevenueTrend(rows: MonthlyRev[]): RevenueTrend | null {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = n(r.revenue);
    if (v !== null && /^\d{4}-\d{2}$/.test(r.ym)) m.set(r.ym, v);
  }
  if (m.size === 0) return null;
  const yms = [...m.keys()].sort();
  const latest = yms[yms.length - 1];
  const yoyAt = (ym: string) => {
    const cur = m.get(ym), base = m.get(shiftYm(ym, -12));
    return cur !== undefined && base !== undefined && base > 0 ? r1(pct(cur, base)) : null;
  };
  const cum = (k: number) => {
    let cur = 0, base = 0;
    for (let i = 0; i < k; i++) {
      const a = m.get(shiftYm(latest, -i)), b = m.get(shiftYm(latest, -i - 12));
      if (a === undefined || b === undefined) return null; // 缺月就不算，避免失真
      cur += a; base += b;
    }
    return base > 0 ? r1(pct(cur, base)) : null;
  };
  const yoyByMonth = Array.from({ length: 12 }, (_, i) => shiftYm(latest, -(11 - i))).map((ym) => ({ ym, yoy: yoyAt(ym) }));
  let streak = 0;
  for (let i = 0; i < 24; i++) {
    const y = yoyAt(shiftYm(latest, -i));
    if (y === null || y <= 0) break;
    streak++;
  }
  const prev = m.get(shiftYm(latest, -1)), cur = m.get(latest)!;
  const month = Number(latest.slice(5));
  return {
    latestYm: latest, yoyByMonth, latestYoy: yoyAt(latest),
    latestMom: prev !== undefined && prev > 0 ? r1(pct(cur, prev)) : null,
    consecutivePositiveYoy: streak, cum3Yoy: cum(3), cum6Yoy: cum(6), cum12Yoy: cum(12), ytdYoy: cum(month),
    months: m.size,
  };
}

export interface QuarterTrend {
  latestPeriod: string; // 例 2026Q2
  quarters: number;
  eps: number | null;
  epsYoy: number | null; // 單季 EPS 年增（基期 ≤ 0 時為 null）
  epsYoyNote?: string;
  prevEpsYoy: number | null; // 前一季的單季 EPS 年增（觀察是否加速）
  revenueYoy: number | null;
  grossMargin: number | null;
  grossMarginQoQ: number | null; // 百分點
  grossMarginYoY: number | null;
  opMargin: number | null;
  opMarginYoY: number | null;
  ttmEps: number | null;
  ttmEpsGrowth: number | null; // 近四季 EPS 合計 vs 前四季合計（需 8 季）
  fetchedAt: string | null;
}

const label = (d: string) => `${d.slice(0, 4)}Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`;

export function computeQuarterTrend(rows: QuarterFin[]): QuarterTrend | null {
  const q = [...rows].sort((a, b) => a.period_end.localeCompare(b.period_end));
  if (q.length === 0) return null;
  const at = (period: string) => q.find((x) => x.period_end.slice(0, 7) === period.slice(0, 7));
  const yearAgo = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
  const last = q[q.length - 1];
  const lastIdx = q.length - 1;
  const base = at(yearAgo(last.period_end));
  const eps = n(last.eps);
  const epsYoyOf = (cur: QuarterFin | undefined) => {
    if (!cur) return null;
    const b = at(yearAgo(cur.period_end));
    const c = n(cur.eps), bb = b ? n(b.eps) : null;
    return c !== null && bb !== null && bb > 0 ? r1(pct(c, bb)) : null;
  };
  const epsYoy = epsYoyOf(last);
  const baseEps = base ? n(base.eps) : null;
  const margin = (x: QuarterFin | undefined, f: 'gross_profit' | 'operating_income') => {
    if (!x) return null;
    const rev = n(x.revenue), v = n(x[f]);
    return rev && rev > 0 && v !== null ? (v / rev) * 100 : null;
  };
  const gm = margin(last, 'gross_profit'), om = margin(last, 'operating_income');
  const gmPrev = lastIdx > 0 ? margin(q[lastIdx - 1], 'gross_profit') : null;
  const gmBase = margin(base, 'gross_profit'), omBase = margin(base, 'operating_income');
  const revC = n(last.revenue), revB = base ? n(base.revenue) : null;
  const sum4 = (from: number) => {
    const slice = q.slice(from, from + 4).map((x) => n(x.eps));
    return slice.length === 4 && slice.every((v) => v !== null) ? (slice as number[]).reduce((a, b) => a + b, 0) : null;
  };
  const ttm = q.length >= 4 ? sum4(q.length - 4) : null;
  const ttmPrev = q.length >= 8 ? sum4(q.length - 8) : null;
  return {
    latestPeriod: label(last.period_end), quarters: q.length, eps,
    epsYoy,
    epsYoyNote: epsYoy === null ? (baseEps !== null && baseEps <= 0 ? '去年同期 EPS ≤ 0，年增率無意義（轉盈／轉虧）' : base ? undefined : '缺少去年同期資料') : undefined,
    prevEpsYoy: lastIdx > 0 ? epsYoyOf(q[lastIdx - 1]) : null,
    revenueYoy: revC !== null && revB !== null && revB > 0 ? r1(pct(revC, revB)) : null,
    grossMargin: gm === null ? null : r1(gm), grossMarginQoQ: gm !== null && gmPrev !== null ? r1(gm - gmPrev) : null,
    grossMarginYoY: gm !== null && gmBase !== null ? r1(gm - gmBase) : null,
    opMargin: om === null ? null : r1(om), opMarginYoY: om !== null && omBase !== null ? r1(om - omBase) : null,
    ttmEps: ttm === null ? null : Number(ttm.toFixed(2)),
    ttmEpsGrowth: ttm !== null && ttmPrev !== null && ttmPrev > 0 ? r1(pct(ttm, ttmPrev)) : null,
    fetchedAt: last.fetched_at ?? null,
  };
}

/** 近 N 個「實際有資料的交易日」的法人累計（單位：股）；回報實際天數，不足 N 天時如實標示 */
export interface InstRowLike { trade_date: string; foreign_net: number | string | null; trust_net: number | string | null; dealer_net: number | string | null }
export function sumInst(rows: InstRowLike[], days = 10) {
  const d = [...rows].sort((a, b) => a.trade_date.localeCompare(b.trade_date)).slice(-days);
  if (d.length === 0) return null;
  const s = (k: 'foreign_net' | 'trust_net' | 'dealer_net') => d.reduce((a, r) => a + (n(r[k]) ?? 0), 0);
  const f = s('foreign_net'), t = s('trust_net'), de = s('dealer_net');
  return { days: d.length, from: d[0].trade_date, to: d[d.length - 1].trade_date, foreign: f, trust: t, dealer: de, total: f + t + de };
}
