/**
 * 歷史日 K 線（Yahoo Finance v8 chart，免金鑰）
 * - range=1y / interval=1d（約 245 個交易日，足夠計算 MA60 季線、MA120 半年線、MACD、KD、RSI）
 * - 上市 .TW → 上櫃 .TWO 依序嘗試
 * - 快取 30 分鐘；抓取失敗時沿用「最後一次成功」的資料，不產生任何假資料
 * 注意：Yahoo 為非官方公開端點，可能變動；價格為還原分割、未還原股利的原始 OHLC。
 */
export interface Candle {
  time: string; // YYYY-MM-DD（台北時間交易日）
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // 股
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TTL_MS = 30 * 60 * 1000;
const MAX_CANDLES = 260; // 約 1 年交易日：足以計算 MA120（半年線）與 MA240
const MIN_CANDLES = 35; // 不足以計算 MACD 時視為資料不足

const cache = new Map<string, { at: number; candles: Candle[] }>();
const inflight = new Map<string, Promise<HistoryResult>>();

export interface HistoryResult {
  data: Record<string, Candle[]>;
  failed: string[];
  fetchedAt: string;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r2 = (n: number) => Number(n.toFixed(2));

// 台灣沒有日光節約時間，固定 UTC+8
const taipeiDate = (unixSec: number) => new Date((unixSec + 8 * 3600) * 1000).toISOString().slice(0, 10);

export function parseYahooChart(json: any): Candle[] {
  const r = json?.chart?.result?.[0];
  const ts: number[] | undefined = r?.timestamp;
  const q = r?.indicators?.quote?.[0];
  if (!Array.isArray(ts) || !q) return [];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (!finite(close) || close <= 0) continue; // 休市／缺值
    const open = finite(q.open?.[i]) ? q.open[i] : close;
    const high = finite(q.high?.[i]) ? q.high[i] : Math.max(open, close);
    const low = finite(q.low?.[i]) ? q.low[i] : Math.min(open, close);
    const date = taipeiDate(ts[i]);
    const candle: Candle = {
      time: date,
      open: r2(open),
      high: r2(Math.max(high, open, close)),
      low: r2(Math.min(low, open, close)),
      close: r2(close),
      volume: finite(q.volume?.[i]) ? q.volume[i] : 0,
    };
    // 同一天若出現重複（盤中 partial + 結算），以後者為準
    if (out.length > 0 && out[out.length - 1].time === date) out[out.length - 1] = candle;
    else out.push(candle);
  }
  return out.slice(-MAX_CANDLES);
}

async function fetchOne(symbol: string): Promise<Candle[] | null> {
  for (const suffix of ['.TW', '.TWO']) {
    try {
      const res = await globalThis.fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol + suffix)}?range=1y&interval=1d&includePrePost=false`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) continue;
      const candles = parseYahooChart(await res.json());
      if (candles.length >= MIN_CANDLES) return candles;
    } catch {
      /* try next suffix */
    }
  }
  return null;
}

async function fetchAll(symbols: string[]): Promise<HistoryResult> {
  const data: Record<string, Candle[]> = {};
  const failed: string[] = [];
  const todo: string[] = [];

  for (const s of symbols) {
    const c = cache.get(s);
    if (c && Date.now() - c.at < TTL_MS) data[s] = c.candles;
    else todo.push(s);
  }

  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(
      todo.slice(i, i + 6).map(async (s) => {
        const candles = await fetchOne(s);
        if (candles) {
          cache.set(s, { at: Date.now(), candles });
          data[s] = candles;
        } else if (cache.has(s)) {
          data[s] = cache.get(s)!.candles; // 沿用最後一次成功
        } else {
          failed.push(s);
        }
      }),
    );
  }
  return { data, failed, fetchedAt: new Date().toISOString() };
}

export function getHistory(symbols: string[]): Promise<HistoryResult> {
  const key = [...symbols].sort().join(',');
  const running = inflight.get(key);
  if (running) return running;
  const p = fetchAll(symbols).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
