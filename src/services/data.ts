/**
 * 資料服務層：
 *  - 報價／歷史 K 線／標的查詢 → Supabase Edge Function `market-data`（伺服端代理 TWSE、Yahoo，解決瀏覽器 CORS）
 *  - 觀察清單、庫存、風險標籤、官方基本面／籌碼 → Supabase Postgres（RLS：只能讀寫自己的資料）
 */
import { supabase } from '../lib/supabase';
import { apiFetch } from '../api/http';
import type { Candle } from '../types';
import type { ChipRow, Fundamental, InstRow, RiskTag, RiskTagKind } from '../utils/riskEngine';
import type { MonthlyRev, QuarterFin } from '../utils/fundamentals';

const baseUrl = () => (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
const fn = (qs: string) => `${baseUrl()}/functions/v1/market-data?${qs}`;
const db = () => {
  if (!supabase) throw new Error('尚未設定 Supabase');
  return supabase;
};

/* ---------------- 市場資料 ---------------- */
export interface EtfIndicator {
  kind: 'standard' | 'leveraged' | 'inverse' | 'active';
  nav: number; prevNav: number; navChange: number; navChangePercent: number;
  navSpread: number; discountPremium: number; date: string; time: string;
}
export interface LiveQuote {
  symbol: string; price: number; change: number; changePercent: number; prevClose: number;
  volume: number; open?: number; high?: number; low?: number;
  isLive: boolean; source: string; asOf?: string; etf?: EtfIndicator;
}
export interface IndexQuote {
  symbol: string; name: string; price: number; change: number; changePercent: number; prevClose: number; volume: number; isLive: boolean;
}
export interface QuotesResponse {
  quotes: Record<string, LiveQuote>;
  indices: Record<string, IndexQuote>;
  source: string; liveCount: number; totalCount: number; fetchedAt: string;
}

export async function fetchQuotes(symbols: string[]): Promise<QuotesResponse> {
  const uniq = [...new Set(symbols.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 80) chunks.push(uniq.slice(i, i + 80));
  const parts = await Promise.all(
    chunks.map(async (c) => {
      const res = await apiFetch(fn(`type=quotes&symbols=${encodeURIComponent(c.join(','))}`));
      if (!res.ok) throw new Error(`報價服務回應 ${res.status}`);
      return (await res.json()) as QuotesResponse & { success: boolean };
    }),
  );
  return parts.reduce((acc, p) => ({
    quotes: { ...acc.quotes, ...p.quotes },
    indices: { ...acc.indices, ...p.indices },
    source: p.source, liveCount: acc.liveCount + p.liveCount, totalCount: acc.totalCount + p.totalCount, fetchedAt: p.fetchedAt,
  }), { quotes: {}, indices: {}, source: '', liveCount: 0, totalCount: 0, fetchedAt: '' } as QuotesResponse);
}

export async function fetchHistory(symbols: string[]): Promise<{ data: Record<string, Candle[]>; failed: string[] }> {
  const uniq = [...new Set(symbols.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 20) chunks.push(uniq.slice(i, i + 20)); // 小批次平行，縮短首次載入時間
  const parts = await Promise.all(
    chunks.map(async (c) => {
      const res = await apiFetch(fn(`type=history&symbols=${encodeURIComponent(c.join(','))}`));
      if (!res.ok) return { data: {} as Record<string, Candle[]>, failed: c };
      const j = await res.json();
      return { data: (j.data ?? {}) as Record<string, Candle[]>, failed: (j.failed ?? []) as string[] };
    }),
  );
  return { data: Object.assign({}, ...parts.map((p) => p.data)), failed: parts.flatMap((p) => p.failed) };
}

export interface StockInfo { id: string; name: string; fullName: string; market: string; isEtf: boolean; price: number; prevClose: number }
export async function fetchInfo(symbol: string): Promise<StockInfo | null> {
  const res = await apiFetch(fn(`type=info&symbol=${encodeURIComponent(symbol)}`));
  if (!res.ok) return null;
  const j = await res.json();
  return j.success ? (j.info as StockInfo) : null;
}

export interface EtfListItem {
  id: string; name: string; kind: EtfIndicator['kind']; price: number; nav: number; navSpread: number; discountPremium: number;
  prevNav: number; navChange: number; navChangePercent: number; date: string; time: string; sourceUrl: string;
}
/** 全市場 ETF 官方即時預估淨值與折溢價（TWSE 揭示，約 360 檔） */
export async function fetchEtfList(): Promise<EtfListItem[]> {
  const res = await apiFetch(`${baseUrl()}/functions/v1/etf-list`);
  if (!res.ok) throw new Error(`ETF 淨值服務回應 ${res.status}`);
  const j = await res.json();
  if (!j.success) throw new Error(j.error || 'ETF 淨值取得失敗');
  return j.data as EtfListItem[];
}

/* ---------------- 觀察清單／庫存 ---------------- */
export interface WatchRow { stock_id: string; custom_name: string | null; note: string | null }
export interface HoldingRow { stock_id: string; shares: number; cost: number }

export async function loadPortfolio(): Promise<{ watch: WatchRow[]; holdings: HoldingRow[] }> {
  const [w, h] = await Promise.all([
    db().from('watchlist').select('stock_id,custom_name,note').order('created_at'),
    db().from('holdings').select('stock_id,shares,cost'),
  ]);
  if (w.error) throw w.error;
  if (h.error) throw h.error;
  return {
    watch: (w.data ?? []) as WatchRow[],
    holdings: (h.data ?? []).map((r: any) => ({ stock_id: r.stock_id, shares: Number(r.shares), cost: Number(r.cost) })),
  };
}
export async function saveWatch(rows: WatchRow[]) {
  if (!rows.length) return;
  const { error } = await db().from('watchlist').upsert(rows, { onConflict: 'user_id,stock_id' });
  if (error) throw error;
}
export async function removeWatch(stockId: string) {
  const { error } = await db().from('watchlist').delete().eq('stock_id', stockId);
  if (error) throw error;
}
export async function saveHoldings(rows: HoldingRow[]) {
  if (!rows.length) return;
  const { error } = await db().from('holdings').upsert(
    rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
    { onConflict: 'user_id,stock_id' },
  );
  if (error) throw error;
}
export async function removeHolding(stockId: string) {
  const { error } = await db().from('holdings').delete().eq('stock_id', stockId);
  if (error) throw error;
}

/* ---------------- 官方資料與風險標籤 ---------------- */
export async function loadOfficial(ids: string[]) {
  const list = [...new Set(ids)];
  const [f, c, i, t, mr, qf] = await Promise.all([
    db().from('company_fundamentals').select('*').in('stock_id', list),
    db().from('chip_weekly').select('*').in('stock_id', list).order('data_date', { ascending: false }).limit(list.length * 8),
    db().from('institutional_daily').select('*').in('stock_id', list).order('trade_date', { ascending: false }).limit(list.length * 12),
    db().from('risk_tags').select('stock_id,tag,enabled,note,user_id'),
    db().from('monthly_revenue').select('stock_id,ym,revenue').in('stock_id', list).order('ym', { ascending: false }).limit(list.length * 30),
    db().from('quarterly_financials').select('*').in('stock_id', list).order('period_end', { ascending: false }).limit(list.length * 14),
  ]);
  for (const r of [f, c, i, t, mr, qf]) if (r.error) throw r.error;
  return {
    fundamentals: (f.data ?? []) as Fundamental[],
    chip: (c.data ?? []) as ChipRow[],
    inst: (i.data ?? []) as InstRow[],
    tags: (t.data ?? []) as RiskTag[],
    monthly: (mr.data ?? []) as MonthlyRev[],
    quarterly: (qf.data ?? []) as QuarterFin[],
  };
}
export async function loadSyncStatus(): Promise<{ dataset: string; ran_at: string; ok: boolean }[]> {
  const { data, error } = await db().from('sync_log').select('dataset,ran_at,ok').eq('ok', true).order('ran_at', { ascending: false }).limit(30);
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? []).filter((r: any) => (seen.has(r.dataset) ? false : (seen.add(r.dataset), true)));
}
/** 使用者自己的標籤：新增／修改／關閉預設（enabled=false） */
export async function setUserTag(stockId: string, tag: RiskTagKind, enabled: boolean, note?: string) {
  const { data: u } = await db().auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('尚未登入');
  const { data: ex } = await db().from('risk_tags').select('id').eq('user_id', uid).eq('stock_id', stockId).eq('tag', tag).maybeSingle();
  const row = { stock_id: stockId, tag, enabled, note: note ?? null };
  const res = ex
    ? await db().from('risk_tags').update(row).eq('id', ex.id)
    : await db().from('risk_tags').insert({ ...row, user_id: uid });
  if (res.error) throw res.error;
}
export async function deleteUserTag(stockId: string, tag: RiskTagKind) {
  const { error } = await db().from('risk_tags').delete().eq('stock_id', stockId).eq('tag', tag).not('user_id', 'is', null);
  if (error) throw error;
}
