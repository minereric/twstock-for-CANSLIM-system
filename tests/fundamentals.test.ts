import { computeQuarterTrend, computeRevenueTrend, sumInst } from '../src/utils/fundamentals';
import { computeCanSlim } from '../src/utils/canslim';

let fail = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fail++; console.error('✗ ' + msg); } };
const near = (a: number | null, b: number, t = 0.11) => a !== null && Math.abs(a - b) <= t;

// 月營收：2024-08 ~ 2026-10 共 27 個月，2026 年前每月 100，2026 年起每月 130（2026 年各月年增 30%）
const monthly = [];
for (let i = 0; i < 27; i++) {
  const t = 2024 * 12 + 7 + i; const ym = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  monthly.push({ stock_id: 'X', ym, revenue: t >= 2026 * 12 ? 130 : 100 });
}
const rt = computeRevenueTrend(monthly)!;
ok(rt.latestYm === '2026-10', 'latestYm');
ok(near(rt.latestYoy, 30), `latestYoy ${rt.latestYoy}`);
ok(rt.consecutivePositiveYoy === 10, `streak ${rt.consecutivePositiveYoy}`);
ok(near(rt.cum3Yoy, 30) && near(rt.ytdYoy, 30) && near(rt.cum12Yoy, 25), `cum ${rt.cum3Yoy}/${rt.ytdYoy}/${rt.cum12Yoy}`);
// 缺月 → 累計為 null，不硬算
const gap = monthly.filter((m) => m.ym !== '2026-09');
ok(computeRevenueTrend(gap)!.cum3Yoy === null, '缺月時 cum3 應為 null');
ok(computeRevenueTrend([]) === null, '空資料');

// 單季財報：台積電真實數字（2025Q2=15.36 → 2026Q2=27.25）
const q = (d: string, eps: number, rev = 1000, gp = 500, oi = 400) => ({ stock_id: 'X', period_end: d, eps, revenue: rev, gross_profit: gp, operating_income: oi });
const rows = [
  q('2024-06-30', 9.56), q('2024-09-30', 12.55), q('2024-12-31', 14.45), q('2025-03-31', 13.95),
  q('2025-06-30', 15.36), q('2025-09-30', 17.44), q('2025-12-31', 19.51), q('2026-03-31', 22.08), q('2026-06-30', 27.25, 1300, 700, 600),
];
const qt = computeQuarterTrend(rows)!;
ok(qt.latestPeriod === '2026Q2', `period ${qt.latestPeriod}`);
ok(near(qt.epsYoy, 77.4, 0.2), `epsYoy ${qt.epsYoy}`);
ok(near(qt.prevEpsYoy, 58.3, 0.2), `prevEpsYoy ${qt.prevEpsYoy}`); // 22.08/13.95
ok(near(qt.ttmEps, 86.28, 0.01), `ttm ${qt.ttmEps}`);
ok(qt.ttmEpsGrowth !== null, 'ttm growth 需 8 季，這裡剛好 9 季');
ok(near(qt.grossMargin, 53.8, 0.1), `gm ${qt.grossMargin}`);
// 去年同期為負 → 年增 null（不產生誤導的百分比）
const neg = computeQuarterTrend([q('2025-06-30', -1), q('2026-06-30', 2)])!;
ok(neg.epsYoy === null && !!neg.epsYoyNote, '基期為負');

// 法人：只取最近 N 個實際有資料的日期，並如實回報天數
const inst = Array.from({ length: 12 }, (_, i) => ({ trade_date: `2026-11-${String(i + 1).padStart(2, '0')}`, foreign_net: 1000, trust_net: -500, dealer_net: 0 }));
const s10 = sumInst(inst, 10)!;
ok(s10.days === 10 && s10.foreign === 10000 && s10.trust === -5000 && s10.total === 5000, 'sumInst 10 日');
ok(sumInst(inst.slice(0, 4), 10)!.days === 4, '不足 10 日如實回報');

// CAN SLIM：C 用單季 EPS 年增；ETF 不適用
const cs = computeCanSlim({ stockId: '2330', candles: [], quarterly: rows, monthly });
ok(cs.c !== null && cs.c >= 90, `C ${cs.c}`);
ok(cs.a !== null && cs.a >= 80, `A ${cs.a}`);
ok(/單季 EPS/.test(cs.notes.c ?? ''), 'C 說明');
const etf = computeCanSlim({ stockId: '0050', candles: [], quarterly: rows, monthly });
ok(etf.c === null && etf.a === null, 'ETF 不計 C/A');
const none = computeCanSlim({ stockId: '9999', candles: [], quarterly: [], monthly: [] });
ok(none.c === null && none.a === null, '無資料回 null');

if (fail) { console.error(`fundamentals.test.ts: ${fail} 項失敗`); process.exit(1); }
console.log('fundamentals.test.ts: 全部通過');
