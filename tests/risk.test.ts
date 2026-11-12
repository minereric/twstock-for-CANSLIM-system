import assert from 'node:assert/strict';
import { computeRisks, mergeTags, worstLevel, rsi14 } from '../src/utils/riskEngine';
import { computeCanSlim, interp } from '../src/utils/canslim';
import type { Candle } from '../src/types';

const mk = (closes: number[], vol = 1000): Candle[] =>
  closes.map((c, i) => ({ time: `2026-01-${String(i + 1).padStart(2, '0')}`, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: vol }));
const ramp = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

// ② 均線向下：200 根從 200 跌到 100 → 季線、半年線皆向下且股價在其下
let r = computeRisks({ stockId: '2330', candles: mk(ramp(200, 100, 200)) });
assert.equal(r.find((a) => a.key === 'ma_trend')!.level, 'high');
// 資料不足 → nodata
r = computeRisks({ stockId: '2330', candles: mk(ramp(100, 110, 50)) });
assert.equal(r.find((a) => a.key === 'ma_trend')!.level, 'nodata');
// 上升趨勢 → ok
r = computeRisks({ stockId: '2330', candles: mk(ramp(100, 200, 200)) });
assert.equal(r.find((a) => a.key === 'ma_trend')!.level, 'ok');

// ③ 董監持股
const f = (v: number | null) => ({ stock_id: '3481', insider_hold_pct: v });
assert.equal(computeRisks({ stockId: '3481', candles: [], fundamental: f(0.14) }).find((a) => a.key === 'insider_low')!.level, 'high');
assert.equal(computeRisks({ stockId: '3481', candles: [], fundamental: f(8) }).find((a) => a.key === 'insider_low')!.level, 'medium');
assert.equal(computeRisks({ stockId: '3481', candles: [], fundamental: f(30) }).find((a) => a.key === 'insider_low')!.level, 'ok');
assert.equal(computeRisks({ stockId: '3481', candles: [], fundamental: null }).find((a) => a.key === 'insider_low')!.level, 'nodata');
assert.equal(computeRisks({ stockId: '0050', candles: [], fundamental: null }).find((a) => a.key === 'insider_low')!.level, 'ok'); // ETF 不適用

// ① ④ 標籤；使用者可關閉預設
const tags = mergeTags([
  { stock_id: '3481', tag: 'china_expansion', enabled: true, note: '面板', user_id: null },
  { stock_id: '2501', tag: 'demographic', enabled: true, note: '營建', user_id: null },
  { stock_id: '2501', tag: 'demographic', enabled: false, user_id: 'u1' },
]);
assert.equal(tags.length, 1);
assert.equal(computeRisks({ stockId: '3481', candles: [], tags }).find((a) => a.key === 'china_expansion')!.level, 'medium');
assert.equal(computeRisks({ stockId: '2501', candles: [], tags }).find((a) => a.key === 'demand')!.level, 'ok');

// ⑤ 追價：後 10 根暴衝
const spike = [...ramp(100, 100, 60), ...ramp(100, 140, 10)];
r = computeRisks({ stockId: '2330', candles: mk(spike) });
const chase = r.find((a) => a.key === 'chase')!;
assert.ok(chase.level === 'high' || chase.level === 'medium', chase.summary);
assert.ok((rsi14(spike) ?? 0) > 90);
const noisy = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5));
assert.equal(computeRisks({ stockId: '2330', candles: mk(noisy) }).find((a) => a.key === 'chase')!.level, 'ok');

// ⑥ 大戶出脫
const chip = [
  { stock_id: '3481', data_date: '2026-10-23', big_holder_pct: 33 },
  { stock_id: '3481', data_date: '2026-10-30', big_holder_pct: 32 },
];
const inst = Array.from({ length: 5 }, (_, i) => ({ stock_id: '3481', trade_date: `2026-11-0${i + 1}`, foreign_net: -2_000_000, trust_net: -100_000, dealer_net: 0 }));
assert.equal(computeRisks({ stockId: '3481', candles: [], chip, inst }).find((a) => a.key === 'big_holder')!.level, 'high');
assert.equal(computeRisks({ stockId: '3481', candles: [], chip: [chip[0]], inst: [] }).find((a) => a.key === 'big_holder')!.level, 'nodata'); // 單週：不亂判
assert.equal(worstLevel(computeRisks({ stockId: '3481', candles: [], chip, inst })), 'high');

// CAN SLIM
assert.equal(interp(25, [[0, 45], [25, 80], [50, 100]]), 80);
const stockC = mk(ramp(100, 200, 260), 1000).map((c, i, a) => ({ ...c, volume: i > 0 && c.close > a[i - 1].close ? 2000 : 1000 }));
const mktC = mk(ramp(100, 120, 260));
const cs = computeCanSlim({
  stockId: '2330', candles: stockC, marketCandles: mktC,
  fundamental: { stock_id: '2330', revenue_yoy: 54.6, revenue_month: '11509' },
  inst: Array.from({ length: 10 }, (_, i) => ({ stock_id: '2330', trade_date: `2026-10-${10 + i}`, foreign_net: 500, trust_net: 100, dealer_net: 0 })),
});
assert.equal(cs.c, 100);
assert.equal(cs.a, null);
assert.ok(cs.n! >= 95, `N=${cs.n}`);
assert.ok(cs.s! >= 90, `S=${cs.s}`);
assert.ok(cs.l! >= 80, `L=${cs.l}`);
assert.ok(cs.m! >= 75, `M=${cs.m}`);
assert.equal(cs.coverage, 6);
assert.equal(cs.leaderStatus, 'LEADER');
// 無資料時不給分
const empty = computeCanSlim({ stockId: '9999', candles: [] });
assert.equal(empty.coverage, 0);
assert.equal(empty.total, 0);
assert.equal(computeCanSlim({ stockId: '0050', candles: mk(ramp(1, 2, 200)), fundamental: { stock_id: '0050', revenue_yoy: 90 } }).c, null); // ETF 不計 C

console.log('risk.test.ts: 全部通過');
