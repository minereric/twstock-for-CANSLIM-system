/**
 * 官方資料的記憶體快取（由 App 在載入後寫入；純函式如 CAN SLIM 評分、報告產生器由此讀取）。
 * 這裡的資料全部來自 Supabase 資料表（官方開放資料同步而來），不含任何模擬值。
 */
import type { ChipRow, Fundamental, InstRow, RiskTag } from './riskEngine';

interface Store {
  fundamentals: Map<string, Fundamental>;
  chip: Map<string, ChipRow[]>;
  inst: Map<string, InstRow[]>;
  tags: RiskTag[];
  marketCandles: { time: string; close: number; volume: number; open: number; high: number; low: number }[]; // 0050 作為大盤代理
}
const store: Store = { fundamentals: new Map(), chip: new Map(), inst: new Map(), tags: [], marketCandles: [] };

export function setOfficialData(d: { fundamentals?: Fundamental[]; chip?: ChipRow[]; inst?: InstRow[]; tags?: RiskTag[] }) {
  if (d.fundamentals) store.fundamentals = new Map(d.fundamentals.map((f) => [f.stock_id, f]));
  if (d.chip) {
    store.chip = new Map();
    for (const r of d.chip) store.chip.set(r.stock_id, [...(store.chip.get(r.stock_id) ?? []), r]);
  }
  if (d.inst) {
    store.inst = new Map();
    for (const r of d.inst) store.inst.set(r.stock_id, [...(store.inst.get(r.stock_id) ?? []), r]);
  }
  if (d.tags) store.tags = d.tags;
}
export function setMarketCandles(c: Store['marketCandles']) {
  store.marketCandles = c;
}
export const getFundamental = (id: string) => store.fundamentals.get(id) ?? null;
export const getChipRows = (id: string) => store.chip.get(id) ?? [];
export const getInstRows = (id: string) => store.inst.get(id) ?? [];
export const getTags = (id: string) => store.tags.filter((t) => t.stock_id === id);
export const getAllTags = () => store.tags;
export const getMarketCandles = () => store.marketCandles;
