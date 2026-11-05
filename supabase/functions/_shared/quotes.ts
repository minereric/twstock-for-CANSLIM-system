/**
 * 股價抓取層
 *   第 1 層：TWSE MIS 即時 API（上市 tse / 上櫃 otc，一次批次）
 *   第 2 層：Yahoo Finance v8 chart（逐檔，.TW → .TWO）— 只補第 1 層缺的
 *   （兩層皆免金鑰，已移除需要 API 金鑰的 Fugle 備援）
 *   皆失敗：回傳「最後一次成功的報價」並標示 isLive=false；從未成功過的標的直接省略。
 *   ※ 絕不再產生任何隨機／模擬價格。
 */

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
  volume: number;
  open?: number; // 當日開盤
  high?: number; // 當日最高
  low?: number; // 當日最低
  etf?: EtfIndicator; // ETF 才有：證交所官方即時預估淨值與折溢價
  isLive: boolean; // 本次更新週期內由上游取得
  source: string;
  asOf: string; // 報價時間 (ISO, 若上游未提供則為抓取時間)
}

/** 證交所「ETF 即時預估淨值與折溢價」揭示資料（官方 iNAV，不是自行估算） */
export interface EtfIndicator {
  kind: 'standard' | 'leveraged' | 'inverse' | 'active'; // 依代號尾碼判斷：L 槓桿 / R 反向 / A 主動式
  nav: number; // 預估淨值
  prevNav: number; // 前一日淨值
  navChange: number;
  navChangePercent: number;
  navSpread: number; // 市價 - 淨值
  discountPremium: number; // 折溢價 % （正=溢價）
  date: string;
  time: string;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
  volume: number;
  isLive: boolean;
}

export interface QuotesResult {
  quotes: Record<string, Quote>;
  indices: Record<string, IndexQuote>;
  source: string;
  liveCount: number;
  totalCount: number;
  fetchedAt: string;
}

export const INDEX_SYMBOLS = ['^TWII', '^GSPC', '^IXIC', '^SOX', '^DJI'];
const INDEX_NAMES: Record<string, string> = {
  '^TWII': '台灣加權指數',
  '^GSPC': '美股標普 500',
  '^IXIC': '美股那斯達克',
  '^SOX': '美股費城半導體',
  '^DJI': '美股道瓊工業',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 5000; // 同一時間多個瀏覽器分頁／使用者只會打一次上游

const lastGoodQuotes: Record<string, Quote> = {};
const lastGoodIndices: Record<string, IndexQuote> = {};
let cached: { at: number; key: string; result: QuotesResult } | null = null;
const inflight = new Map<string, Promise<QuotesResult>>();

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '-' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const validPrice = (p: number | null): p is number => p !== null && p > 0;

const round = (n: number, d = 2) => Number(n.toFixed(d));

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await globalThis.fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
  return res.json();
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R | null>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const part = await Promise.all(items.slice(i, i + size).map((x) => fn(x).catch(() => null)));
    part.forEach((p) => p && out.push(p));
  }
  return out;
}

// ---------- 第 1 層：TWSE ----------
function twseAsOf(d?: string, t?: string): string | null {
  if (!d || !t || d.length !== 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t}+08:00`;
}

async function fetchTwse(symbols: string[]) {
  const channels = symbols.flatMap((s) => [`tse_${s}.tw`, `otc_${s}.tw`]);
  channels.push('tse_t00.tw');
  const data = await getJson(
    `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${channels.join('|')}&json=1&delay=0&_=${Date.now()}`,
    { Referer: 'https://mis.twse.com.tw/stock/index.jsp' },
  );
  const quotes: Record<string, Quote> = {};
  let twii: IndexQuote | null = null;
  const nowIso = new Date().toISOString();

  for (const item of (data?.msgArray ?? []) as any[]) {
    const y = num(item.y);
    const z = num(item.z);
    const asOf = twseAsOf(item.d, item.t) ?? nowIso;

    if (item.c === 't00') {
      const price = z ?? y;
      if (!validPrice(price)) continue;
      const prev = y ?? price;
      twii = {
        symbol: '^TWII',
        name: INDEX_NAMES['^TWII'],
        price,
        change: round(price - prev),
        changePercent: prev > 0 ? round(((price - prev) / prev) * 100) : 0,
        prevClose: prev,
        volume: 0,
        isLive: true,
      };
      continue;
    }
    if (!item.c || !symbols.includes(item.c)) continue;

    // z（最新成交價）在「尚無成交」時會是 "-"；此時沿用上一次成功價，再不行才用開盤／昨收
    const prevGood = lastGoodQuotes[item.c];
    const price =
      z ?? (prevGood && y !== null && prevGood.prevClose === y ? prevGood.price : null) ?? num(item.o) ?? y;
    if (!validPrice(price)) continue;
    const prev = y ?? price;
    const vol = (num(item.v) ?? 0) * 1000; // MIS 的 v 為「張」
    const existing = quotes[item.c];
    if (existing && existing.volume >= vol) continue; // tse/otc 兩個頻道只會有一個有資料

    quotes[item.c] = {
      symbol: item.c,
      price,
      change: round(price - prev),
      changePercent: prev > 0 ? round(((price - prev) / prev) * 100) : 0,
      prevClose: prev,
      volume: vol,
      open: num(item.o) ?? undefined,
      high: num(item.h) ?? undefined,
      low: num(item.l) ?? undefined,
      isLive: true,
      source: 'TWSE',
      asOf,
    };
  }
  return { quotes, twii };
}

// ---------- ETF 官方預估淨值 ----------
export const etfKind = (id: string): EtfIndicator['kind'] =>
  /L$/i.test(id) ? 'leveraged' : /R$/i.test(id) ? 'inverse' : /A$/i.test(id) ? 'active' : 'standard';

let etfCache: { at: number; map: Record<string, EtfIndicator> } | null = null;
const ETF_TTL_MS = 15_000;

async function fetchEtfIndicators(): Promise<Record<string, EtfIndicator>> {
  if (etfCache && Date.now() - etfCache.at < ETF_TTL_MS) return etfCache.map;
  const data = await getJson('https://mis.twse.com.tw/stock/data/all_etf.txt', {
    Referer: 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant',
  });
  const map: Record<string, EtfIndicator> = {};
  for (const group of (data?.a1 ?? []) as any[]) {
    for (const it of (group?.msgArray ?? []) as any[]) {
      const id = String(it?.a ?? '').trim();
      if (!id || map[id]) continue;
      const clean = (v: unknown) => num(String(v ?? '').replace(/,/g, ''));
      const price = clean(it.e);
      const nav = clean(it.f);
      const prevNav = clean(it.h);
      if (!validPrice(nav)) continue; // 無淨值就不給（不用 0 充數）
      const official = clean(it.g);
      map[id] = {
        kind: etfKind(id),
        nav,
        prevNav: prevNav ?? 0,
        navChange: prevNav ? round(nav - prevNav) : 0,
        navChangePercent: prevNav ? round(((nav - prevNav) / prevNav) * 100) : 0,
        navSpread: price ? round(price - nav) : 0,
        // 以官方揭示的折溢價為準；缺漏時才用「市價/淨值」自行換算
        discountPremium: official ?? (price ? round(((price - nav) / nav) * 100) : 0),
        date: String(it.i ?? ''),
        time: String(it.j ?? ''),
      };
    }
  }
  etfCache = { at: Date.now(), map };
  return map;
}

// ---------- 第 2 層：Yahoo v8 chart ----------
async function yahooChart(ySymbol: string) {
  const j = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=1d`,
  );
  const meta = j?.chart?.result?.[0]?.meta;
  const price = num(meta?.regularMarketPrice);
  if (!meta || !validPrice(price)) return null;
  const prev = num(meta.previousClose) ?? num(meta.chartPreviousClose) ?? price;
  return {
    price,
    prev,
    volume: num(meta.regularMarketVolume) ?? 0,
    high: num(meta.regularMarketDayHigh) ?? undefined,
    low: num(meta.regularMarketDayLow) ?? undefined,
    asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
  };
}

async function fetchYahooStock(symbol: string): Promise<Quote | null> {
  for (const suffix of ['.TW', '.TWO']) {
    const r = await yahooChart(`${symbol}${suffix}`).catch(() => null);
    if (r) {
      return {
        symbol,
        price: r.price,
        change: round(r.price - r.prev),
        changePercent: r.prev > 0 ? round(((r.price - r.prev) / r.prev) * 100) : 0,
        prevClose: r.prev,
        volume: r.volume,
        high: r.high,
        low: r.low,
        isLive: true,
        source: 'Yahoo',
        asOf: r.asOf,
      };
    }
  }
  return null;
}

async function fetchYahooIndex(symbol: string): Promise<IndexQuote | null> {
  const r = await yahooChart(symbol).catch(() => null);
  if (!r) return null;
  return {
    symbol,
    name: INDEX_NAMES[symbol] ?? symbol,
    price: r.price,
    change: round(r.price - r.prev),
    changePercent: r.prev > 0 ? round(((r.price - r.prev) / r.prev) * 100) : 0,
    prevClose: r.prev,
    volume: r.volume,
    isLive: true,
  };
}

// ---------- 整合 ----------
async function fetchAll(symbols: string[]): Promise<QuotesResult> {
  const quotes: Record<string, Quote> = {};
  const indices: Record<string, IndexQuote> = {};
  const used = new Set<string>();
  const wantEtf = symbols.some((s) => /^00/.test(s));

  // 三路並行（原本是依序等待，總延遲 = 三者相加；現在 = 最慢那一路）
  const [twse, yahooIdx, etf] = await Promise.all([
    fetchTwse(symbols).catch((err) => {
      console.error('[quotes] TWSE failed:', (err as Error).message);
      return null;
    }),
    inBatches(INDEX_SYMBOLS.filter((s) => s !== '^TWII'), 5, fetchYahooIndex),
    wantEtf
      ? fetchEtfIndicators().catch((err) => {
          console.error('[quotes] ETF indicators failed:', (err as Error).message);
          return {} as Record<string, EtfIndicator>;
        })
      : Promise.resolve({} as Record<string, EtfIndicator>),
  ]);

  if (twse) {
    Object.assign(quotes, twse.quotes);
    if (twse.twii) indices['^TWII'] = twse.twii;
    if (Object.keys(twse.quotes).length > 0) used.add('TWSE');
  }
  yahooIdx.forEach((q) => {
    indices[q.symbol] = q;
    used.add('Yahoo');
  });

  // 第 2 層：只替 TWSE 沒回的個股、以及 TWSE 沒給的加權指數補抓
  const missing = symbols.filter((s) => !quotes[s]);
  const [yahooStocks, twiiFallback] = await Promise.all([
    inBatches(missing, 6, fetchYahooStock),
    indices['^TWII'] ? Promise.resolve([]) : inBatches(['^TWII'], 1, fetchYahooIndex),
  ]);
  yahooStocks.forEach((q) => {
    quotes[q.symbol] = q;
    used.add('Yahoo');
  });
  twiiFallback.forEach((q) => {
    indices[q.symbol] = q;
    used.add('Yahoo');
  });

  // ETF：附上官方淨值（不論報價來自 TWSE 或 Yahoo）
  for (const [id, q] of Object.entries(quotes)) {
    if (etf[id]) {
      const e = etf[id];
      const spread = round(q.price - e.nav);
      q.etf = { ...e, navSpread: spread, discountPremium: round(((q.price - e.nav) / e.nav) * 100) };
      // 現價與官方揭示時間可能略有落差，用「目前採用的現價」重算折溢價，避免兩邊價格不同步
    }
  }

  // 記住成功的；失敗的用「最後一次成功」補上並標為非即時
  for (const [s, q] of Object.entries(quotes)) lastGoodQuotes[s] = q;
  for (const [s, q] of Object.entries(indices)) lastGoodIndices[s] = q;
  const liveCount = Object.keys(quotes).length;

  for (const s of symbols) {
    if (!quotes[s] && lastGoodQuotes[s]) quotes[s] = { ...lastGoodQuotes[s], isLive: false };
  }
  for (const s of INDEX_SYMBOLS) {
    if (!indices[s] && lastGoodIndices[s]) indices[s] = { ...lastGoodIndices[s], isLive: false };
  }

  return {
    quotes,
    indices,
    source: used.size > 0 ? [...used].join(' + ') : '無法連線（顯示最後一次成功報價）',
    liveCount,
    totalCount: symbols.length,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getQuotes(symbols: string[]): Promise<QuotesResult> {
  const key = [...symbols].sort().join(',');
  if (cached && cached.key === key && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;
  const running = inflight.get(key);
  if (running) return running;
  const p = fetchAll(symbols)
    .then((result) => {
      cached = { at: Date.now(), key, result };
      return result;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export interface StockInfo {
  id: string;
  name: string;
  fullName: string;
  market: '上市' | '上櫃' | 'ETF';
  isEtf: boolean;
  price: number;
  prevClose: number;
  source: string;
}

/** 查單一代號的名稱與市場；查不到回傳 null（不再回傳「預設 100 元」的假資料） */
export async function getStockInfo(symbol: string): Promise<StockInfo | null> {
  const id = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(id)) return null;
  const data = await getJson(
    `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${id}.tw|otc_${id}.tw&json=1&delay=0&_=${Date.now()}`,
    { Referer: 'https://mis.twse.com.tw/stock/index.jsp' },
  ).catch(() => null);
  const hit = ((data?.msgArray ?? []) as any[]).find((m) => m.c === id && (m.n || m.nf));
  if (hit) {
    const y = num(hit.y);
    const z = num(hit.z) ?? num(hit.o) ?? y ?? 0;
    return {
      id,
      name: String(hit.n ?? hit.nf).trim(),
      fullName: String(hit.nf ?? hit.n).trim(),
      market: /^00/.test(id) ? 'ETF' : hit.ex === 'otc' ? '上櫃' : '上市',
      isEtf: /^00/.test(id),
      price: z,
      prevClose: y ?? z,
      source: 'TWSE',
    };
  }
  return null;
}
