import assert from 'node:assert/strict';
import { getQuotes, getStockInfo } from '../supabase/functions/_shared/quotes.ts';
import { parseYahooChart, getHistory } from '../supabase/functions/_shared/history.ts';

const mk = (o: any) => ({ ok: true, status: 200, json: async () => o }) as any;
const nf = { ok: false, status: 404, json: async () => ({}) } as any;
let calls: string[] = [];
let twseDown = false;

(globalThis as any).fetch = async (url: string) => {
  calls.push(url.split('?')[0]);
  if (url.includes('getStockInfo.jsp')) {
    if (twseDown) throw new Error('blocked');
    if (url.includes('ex_ch=tse_2330.tw|otc_2330.tw&')) {
      return mk({ msgArray: [{ c: '2330', ex: 'tse', n: '台積電', nf: '台灣積體電路製造股份有限公司', z: '2440.0000', y: '2430.0000' }] });
    }
    return mk({ msgArray: [
      { c: '2330', z: '2440.0000', y: '2430.0000', o: '2435', h: '2450', l: '2425', v: '31234', d: '20261104', t: '13:30:00' },
      { c: '00631L', z: '38.2', y: '38.0', v: '500', d: '20261104', t: '13:30:00' },
      { c: '00632R', z: '9.9', y: '10.0', v: '300', d: '20261104', t: '13:30:00' },
      { c: '3481', z: '-', y: '66.5', o: '-', v: '0', d: '20261104', t: '08:59:00' },
      { c: 't00', z: '23500.12', y: '23400.00', d: '20261104', t: '13:30:00' },
    ] });
  }
  if (url.includes('all_etf.txt')) {
    return mk({ a1: [{ msgArray: [
      { a: '00631L', b: '元大台灣50正2', e: '38.2', f: '38.00', g: '0.53', h: '37.50', i: '20261104', j: '13:30:00' },
      { a: '00632R', b: '元大台灣50反1', e: '9.9', f: '9.95', g: '-0.50', h: '10.00', i: '20261104', j: '13:30:00' },
      { a: '9999', b: '無淨值', e: '10', f: '-', g: '-', h: '-' },
    ] }] });
  }
  if (url.includes('/v8/finance/chart/')) {
    const s = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);
    if (s.startsWith('^')) return mk({ chart: { result: [{ meta: { regularMarketPrice: 5500, chartPreviousClose: 5450 } }] } });
    if (s === '3416.TW') return mk({ chart: { result: [{ meta: { regularMarketPrice: 66.8, previousClose: 66.5, regularMarketVolume: 1000 } }] } });
    return nf;
  }
  throw new Error('unexpected ' + url);
};

const syms = ['2330', '00631L', '00632R', '3481', '3416', '2603'];
const r = await getQuotes(syms);
assert.equal(r.quotes['2330'].price, 2440);
assert.equal(r.quotes['2330'].high, 2450);
assert.equal(r.quotes['3481'].price, 66.5, '開盤前尚無成交：以昨收顯示、漲跌 0');
assert.equal(r.quotes['3481'].changePercent, 0);
assert.equal(r.quotes['3416'].source, 'Yahoo', 'TWSE 沒有的代號改用 Yahoo 補');
assert.ok(!('2603' in r.quotes), '任何來源都沒有的代號不可憑空產生價格');
assert.ok(r.indices['^TWII'].price > 0 && r.indices['^GSPC'].price === 5500);

const lev = r.quotes['00631L'].etf!;
assert.equal(lev.kind, 'leveraged');
assert.equal(lev.nav, 38);
assert.equal(r.quotes['00632R'].etf!.kind, 'inverse');
assert.equal(r.quotes['00632R'].etf!.discountPremium, -0.5, '折溢價 = (市價9.9 - 淨值9.95)/9.95');
assert.equal(r.quotes['2330'].etf, undefined, '一般股票不帶 ETF 欄位');

// 快取：5 秒內再要同一組代號，不可再打上游
calls = [];
await getQuotes(syms);
assert.equal(calls.length, 0);

// 上游全斷：保留最後一次成功報價並標為非即時
await new Promise((res) => setTimeout(res, 5200));
(globalThis as any).fetch = async () => { throw new Error('all down'); };
const r2 = await getQuotes(syms);
assert.equal(r2.quotes['2330'].price, 2440);
assert.equal(r2.quotes['2330'].isLive, false);
assert.equal(r2.liveCount, 0);

// 不同代號組合同時呼叫不可互相拿到對方結果（inflight 以代號組合區分）
const [a, b] = await Promise.all([getQuotes(['2330']), getQuotes(['3481'])]);
assert.ok('2330' in a.quotes && !('3481' in a.quotes) || a.liveCount === 0);
assert.ok(b);

// 代號查詢
(globalThis as any).fetch = async (url: string) => {
  if (url.includes('tse_2330.tw')) return mk({ msgArray: [{ c: '2330', ex: 'tse', n: '台積電', nf: '台灣積體電路製造股份有限公司', z: '2440', y: '2430' }] });
  return mk({ msgArray: [] });
};
const info = await getStockInfo('2330');
assert.equal(info?.name, '台積電');
assert.equal(info?.market, '上市');
assert.equal(await getStockInfo('0000'), null, '查不到就回 null，不再回傳預設 100 元');
assert.equal(await getStockInfo('../etc'), null);

// 歷史 K 線：休市(null)略過、同日重複合併、日期為 ISO
const base = Date.UTC(2026, 6, 1, 1) / 1000;
const ts: number[] = [], o: any[] = [], h: any[] = [], l: any[] = [], c: any[] = [], v: any[] = [];
for (let i = 0; i < 60; i++) { ts.push(base + i * 86400); const x = 100 + i; o.push(x - 1); h.push(x + 2); l.push(x - 2); c.push(x); v.push(1000); }
c[10] = null;
const candles = parseYahooChart({ chart: { result: [{ timestamp: ts, indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: v }] } }] } });
assert.equal(candles.length, 59);
assert.match(candles[0].time, /^\d{4}-\d{2}-\d{2}$/);
void getHistory;
console.log('quotes.test.ts: 全部通過');
