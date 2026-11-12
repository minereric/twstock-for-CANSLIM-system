/**
 * 風險提醒引擎（純函式、可單元測試）
 * 六項提醒皆以「真實資料」計算，資料不足時回報「資料不足」而不是臆測：
 *  1 可能陷入大陸擴廠競爭的產業   → 使用者可編輯的產業標籤（risk_tags，預設值為主觀判斷）
 *  2 中長期均線向下              → MA60（季線）/ MA120（半年線）斜率與股價位置（需 ≥140 根日 K）
 *  3 董監持股偏低                → 官方「董監事持股餘額明細」加總 ÷ 已發行股數
 *  4 未來需求疑慮（少子化等）     → 使用者可編輯的產業標籤
 *  5 短線漲多追價風險            → 5/20 日漲幅、與 MA20 乖離、RSI
 *  6 籌碼：大戶出脫              → 集保千張大戶週變化 + 三大法人近 5 日合計賣超
 */
import type { Candle } from '../types';

export type RiskLevel = 'high' | 'medium' | 'low' | 'ok' | 'nodata';

export interface Fundamental {
  stock_id: string;
  name?: string | null;
  industry?: string | null;
  insider_hold_pct?: number | string | null;
  revenue_yoy?: number | string | null;
  revenue_mom?: number | string | null;
  revenue_month?: string | null;
  eps_latest?: number | string | null;
  eps_period?: string | null;
  updated_at?: string | null;
}
export interface ChipRow {
  stock_id: string;
  data_date: string;
  big_holder_pct: number | string | null;
  big_holder_cnt?: number | string | null;
  total_holders?: number | string | null;
}
export interface InstRow {
  stock_id: string;
  trade_date: string;
  foreign_net: number | string | null;
  trust_net: number | string | null;
  dealer_net: number | string | null;
}
export type RiskTagKind = 'china_expansion' | 'demographic';
export interface RiskTag {
  stock_id: string;
  tag: RiskTagKind;
  enabled: boolean;
  note?: string | null;
  user_id?: string | null;
}

export interface RiskSettings {
  insiderLowPct: number; // 董監持股低於此值提醒（預設 10%）
  insiderVeryLowPct: number; // 低於此值為高風險（預設 5%）
  chaseGain5: number; // 5 日漲幅 %
  chaseGain20: number; // 20 日漲幅 %
  chaseDeviationMa20: number; // 與 MA20 乖離 %
  chaseRsi: number; // RSI
  bigHolderDropPct: number; // 千張大戶週減幅（百分點）
}
export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  insiderLowPct: 10,
  insiderVeryLowPct: 5,
  chaseGain5: 12,
  chaseGain20: 25,
  chaseDeviationMa20: 15,
  chaseRsi: 80,
  bigHolderDropPct: 0.5,
};

export interface RiskAlert {
  key: 'china_expansion' | 'ma_trend' | 'insider_low' | 'demand' | 'chase' | 'big_holder';
  title: string;
  level: RiskLevel;
  summary: string;
  detail?: string;
  source: string;
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const sma = (arr: number[], period: number, endOffset = 0): number | null => {
  const end = arr.length - endOffset;
  if (end < period) return null;
  let s = 0;
  for (let i = end - period; i < end; i++) s += arr[i];
  return s / period;
};
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);
const f1 = (x: number) => x.toFixed(1);

export function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / 14 / (loss / 14);
  return 100 - 100 / (1 + rs);
}

/** 判斷是否為 ETF（ETF 沒有董監持股、營收等個股概念） */
export const isEtfId = (id: string) => /^00\d{2,4}[A-Z]?$/.test(id);

export interface RiskInput {
  stockId: string;
  candles: Candle[];
  fundamental?: Fundamental | null;
  chip?: ChipRow[]; // 該股所有週快照
  inst?: InstRow[]; // 該股近期三大法人
  tags?: RiskTag[]; // 該股的標籤（已合併預設與使用者設定）
  settings?: Partial<RiskSettings>;
}

/** 合併系統預設與使用者標籤：使用者同 (stock, tag) 的設定優先（可 enabled=false 關閉預設）。 */
export function mergeTags(all: RiskTag[]): RiskTag[] {
  const m = new Map<string, RiskTag>();
  for (const t of all.filter((x) => !x.user_id)) m.set(`${t.stock_id}|${t.tag}`, t);
  for (const t of all.filter((x) => x.user_id)) m.set(`${t.stock_id}|${t.tag}`, t);
  return [...m.values()].filter((t) => t.enabled);
}

export function computeRisks(input: RiskInput): RiskAlert[] {
  const s = { ...DEFAULT_RISK_SETTINGS, ...(input.settings ?? {}) };
  const closes = input.candles.map((c) => c.close);
  const etf = isEtfId(input.stockId);
  const out: RiskAlert[] = [];
  const tags = input.tags ?? [];

  // ① 大陸擴廠競爭
  const cn = tags.find((t) => t.tag === 'china_expansion');
  out.push(
    cn
      ? { key: 'china_expansion', title: '陸廠擴產競爭', level: 'medium', summary: `已標記：${cn.note || '可能陷入大陸擴廠競爭的產業'}`, detail: '此標籤為主觀產業判斷（預設值由系統建立，可在設定中新增／關閉）。', source: '使用者／預設產業標籤' }
      : { key: 'china_expansion', title: '陸廠擴產競爭', level: 'ok', summary: etf ? 'ETF 不適用' : '未標記為受陸廠擴產競爭影響的產業', source: '使用者／預設產業標籤' },
  );

  // ② 中長期均線向下
  if (closes.length < 140) {
    out.push({ key: 'ma_trend', title: '中長期均線', level: 'nodata', summary: `日 K 僅 ${closes.length} 根，需 ≥140 根才能判斷半年線趨勢`, source: 'Yahoo 日線' });
  } else {
    const ma60 = sma(closes, 60)!, ma60p = sma(closes, 60, 20)!;
    const ma120 = sma(closes, 120)!, ma120p = sma(closes, 120, 20)!;
    const px = closes[closes.length - 1];
    const down60 = ma60 < ma60p, down120 = ma120 < ma120p;
    const below60 = px < ma60, below120 = px < ma120;
    const d60 = pct(ma60, ma60p), d120 = pct(ma120, ma120p);
    let level: RiskLevel = 'ok';
    if (down60 && down120) level = below60 && below120 ? 'high' : 'medium';
    else if (down60 || down120) level = 'low';
    out.push({
      key: 'ma_trend', title: '中長期均線', level,
      summary: level === 'ok' ? '季線、半年線皆未向下' : `季線${down60 ? '向下' : '向上'}（20日 ${f1(d60)}%）、半年線${down120 ? '向下' : '向上'}（20日 ${f1(d120)}%）${below60 && below120 ? '，股價位於兩線之下' : ''}`,
      detail: `股價 ${px}｜MA60 ${ma60.toFixed(2)}｜MA120 ${ma120.toFixed(2)}`,
      source: 'Yahoo 日線',
    });
  }

  // ③ 董監持股偏低
  if (etf) {
    out.push({ key: 'insider_low', title: '董監持股', level: 'ok', summary: 'ETF 不適用', source: '公開資訊觀測站' });
  } else {
    const v = n(input.fundamental?.insider_hold_pct);
    if (v === null) out.push({ key: 'insider_low', title: '董監持股', level: 'nodata', summary: '官方資料尚無此檔董監持股', source: '公開資訊觀測站（TWSE/TPEx OpenAPI）' });
    else {
      const level: RiskLevel = v < s.insiderVeryLowPct ? 'high' : v < s.insiderLowPct ? 'medium' : 'ok';
      out.push({
        key: 'insider_low', title: '董監持股', level,
        summary: level === 'ok' ? `董監持股合計 ${v}%（高於門檻 ${s.insiderLowPct}%）` : `董監持股合計僅 ${v}%（低於門檻 ${level === 'high' ? s.insiderVeryLowPct : s.insiderLowPct}%）`,
        detail: '以董監事「目前持股」加總 ÷ 已發行普通股數；不含經理人與大股東。大型權值股因股本大，比例天生偏低，請搭配其他指標判讀。',
        source: '公開資訊觀測站（TWSE/TPEx OpenAPI）',
      });
    }
  }

  // ④ 未來需求疑慮
  const dm = tags.find((t) => t.tag === 'demographic');
  out.push(
    dm
      ? { key: 'demand', title: '未來需求疑慮', level: 'medium', summary: `已標記：${dm.note || '長期需求可能受人口結構（如少子化）影響'}`, detail: '此標籤為主觀判斷，可在設定中調整。', source: '使用者／預設產業標籤' }
      : { key: 'demand', title: '未來需求疑慮', level: 'ok', summary: etf ? 'ETF 不適用' : '未標記長期需求疑慮', source: '使用者／預設產業標籤' },
  );

  // ⑤ 短線漲多追價
  if (closes.length < 21) {
    out.push({ key: 'chase', title: '短線追價風險', level: 'nodata', summary: '日 K 不足 21 根', source: 'Yahoo 日線' });
  } else {
    const px = closes[closes.length - 1];
    const g5 = pct(px, closes[closes.length - 6]);
    const g20 = pct(px, closes[closes.length - 21]);
    const ma20 = sma(closes, 20)!;
    const dev = pct(px, ma20);
    const r = rsi14(closes);
    const hits: string[] = [];
    if (g5 >= s.chaseGain5) hits.push(`5日漲 ${f1(g5)}%`);
    if (g20 >= s.chaseGain20) hits.push(`20日漲 ${f1(g20)}%`);
    if (dev >= s.chaseDeviationMa20) hits.push(`乖離月線 ${f1(dev)}%`);
    if (r !== null && r >= s.chaseRsi) hits.push(`RSI ${f1(r)}`);
    const level: RiskLevel = hits.length >= 3 ? 'high' : hits.length >= 1 ? 'medium' : 'ok';
    out.push({
      key: 'chase', title: '短線追價風險', level,
      summary: hits.length ? `漲多警示：${hits.join('、')}` : '短線漲幅與乖離在正常範圍',
      detail: `5日 ${f1(g5)}%｜20日 ${f1(g20)}%｜乖離MA20 ${f1(dev)}%｜RSI ${r === null ? '—' : f1(r)}`,
      source: 'Yahoo 日線',
    });
  }

  // ⑥ 大戶出脫
  if (etf) {
    out.push({ key: 'big_holder', title: '大戶／法人籌碼', level: 'ok', summary: 'ETF 不適用（申贖機制使籌碼意義不同）', source: '集保 TDCC／TWSE' });
  } else {
    const chip = [...(input.chip ?? [])].sort((a, b) => a.data_date.localeCompare(b.data_date));
    const inst = [...(input.inst ?? [])].sort((a, b) => a.trade_date.localeCompare(b.trade_date)).slice(-5);
    const notes: string[] = [];
    let hits = 0;
    let have = false;
    if (chip.length >= 2) {
      have = true;
      const last = n(chip[chip.length - 1].big_holder_pct), prev = n(chip[chip.length - 2].big_holder_pct);
      if (last !== null && prev !== null) {
        const d = last - prev;
        notes.push(`千張大戶 ${last}%（較上週 ${d >= 0 ? '+' : ''}${d.toFixed(2)} 點）`);
        if (d <= -s.bigHolderDropPct) hits++;
      }
    } else if (chip.length === 1) {
      notes.push(`千張大戶 ${n(chip[0].big_holder_pct)}%（週變化需累積 2 週資料）`);
    }
    if (inst.length >= 3) {
      have = true;
      const fi = inst.reduce((a, r) => a + (n(r.foreign_net) ?? 0), 0);
      const tr = inst.reduce((a, r) => a + (n(r.trust_net) ?? 0), 0);
      const sheets = (x: number) => Math.round(x / 1000).toLocaleString();
      notes.push(`近${inst.length}日 外資 ${sheets(fi)} 張、投信 ${sheets(tr)} 張`);
      if (fi + tr < 0 && fi < 0) hits++;
    }
    if (!have && chip.length === 0 && inst.length === 0) {
      out.push({ key: 'big_holder', title: '大戶／法人籌碼', level: 'nodata', summary: '尚無集保或三大法人資料', source: '集保 TDCC／TWSE T86' });
    } else {
      const level: RiskLevel = hits >= 2 ? 'high' : hits === 1 ? 'medium' : have ? 'ok' : 'nodata';
      out.push({
        key: 'big_holder', title: '大戶／法人籌碼', level,
        summary: level === 'high' ? '大戶減碼且法人同步賣超' : level === 'medium' ? '出現單一籌碼轉弱訊號' : level === 'ok' ? '未見大戶出脫' : '資料累積中',
        detail: notes.join('｜'),
        source: '集保 TDCC（週）／TWSE T86（日）',
      });
    }
  }
  return out;
}

export const LEVEL_ORDER: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1, ok: 0, nodata: -1 };
export function worstLevel(alerts: RiskAlert[]): RiskLevel {
  return alerts.reduce<RiskLevel>((w, a) => (LEVEL_ORDER[a.level] > LEVEL_ORDER[w] ? a.level : w), 'ok');
}
export const riskCount = (alerts: RiskAlert[]) => alerts.filter((a) => LEVEL_ORDER[a.level] >= 1).length;
