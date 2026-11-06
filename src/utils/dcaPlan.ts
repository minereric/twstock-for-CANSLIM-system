// 分批進場計畫：純邏輯（不碰 React / DOM），方便單獨測試。
// 規則與「100萬分批進場計畫（2026/11）」文件一致：
// - 核心批次：預定日期或價格觸發，哪個先到就執行「下一個尚未執行」的批次
// - 價格觸發一律以收盤價判斷；盤中達標只算「預警」
// - 極端備用：只看價格，不排日期
// - 同一週最多執行兩批

export type TrancheGroup = 'core' | 'reserve';

export interface Tranche {
  id: string;
  label: string;
  group: TrancheGroup;
  amount: number;          // 元
  plannedDate?: string;    // YYYY-MM-DD，極端備用不填
  triggerPct?: number;     // 相對基準點的跌幅，例如 -0.10；不填代表沒有價格觸發
  executedAt?: string;     // YYYY-MM-DD
  executedIndex?: number;  // 執行當下的加權指數
  note?: string;
}

export interface Allocation {
  key: string;
  label: string;
  amount: number;
}

export interface SignalItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface DcaPlan {
  version: 1;
  totalCapital: number;
  baseIndex: number;       // 觸發點基準（11/5 收盤）
  baseDate: string;
  allocations: Allocation[];
  tranches: Tranche[];
  signals: SignalItem[];
  signalsCheckedOn?: string; // 檢查表最後勾選的日期
  stopLossPct: number;       // 衛星個股停損，例如 -0.08
  satelliteSignalThreshold: number; // 止跌訊號達幾項才買個股
  maxPerWeek: number;
}

export type TrancheStatus =
  | { kind: 'executed' }
  | { kind: 'due'; reason: 'date' | 'price' }
  | { kind: 'warning'; reason: 'intraday_price' }   // 盤中達標、尚未收盤
  | { kind: 'blocked_weekly_limit' }
  | { kind: 'waiting' };

export const DEFAULT_PLAN: DcaPlan = {
  version: 1,
  totalCapital: 1_000_000,
  baseIndex: 41574.72,
  baseDate: '2026-11-05',
  allocations: [
    { key: 'core_mkt', label: '核心：市值型 ETF（0050／006208）', amount: 500_000 },
    { key: 'core_def', label: '核心：防禦型 ETF（高股息低波／金融）', amount: 150_000 },
    { key: 'satellite', label: '衛星：個股（3–5 檔，單檔上限 6 萬）', amount: 250_000 },
    { key: 'reserve', label: '極端備用', amount: 100_000 },
  ],
  tranches: [
    { id: 'c1', label: '第 1 批', group: 'core', amount: 130_000, plannedDate: '2026-11-06', note: '11/6–11/10 內分兩天買' },
    { id: 'c2', label: '第 2 批', group: 'core', amount: 130_000, plannedDate: '2026-11-20', triggerPct: -0.10 },
    { id: 'c3', label: '第 3 批', group: 'core', amount: 130_000, plannedDate: '2026-12-04', triggerPct: -0.15 },
    { id: 'c4', label: '第 4 批', group: 'core', amount: 130_000, plannedDate: '2026-12-18', triggerPct: -0.20 },
    { id: 'c5', label: '第 5 批', group: 'core', amount: 130_000, plannedDate: '2027-01-08', triggerPct: -0.25 },
    { id: 'rA', label: '極端備用 A', group: 'reserve', amount: 50_000, triggerPct: -0.15 },
    { id: 'rB', label: '極端備用 B', group: 'reserve', amount: 50_000, triggerPct: -0.20 },
  ],
  signals: [
    { id: 's1', label: '外資現貨賣超連 3 日縮小，或轉為買超', checked: false },
    { id: 's2', label: '新台幣止貶，回到 33 元以內', checked: false },
    { id: 's3', label: '融資餘額降幅趨緩，沒有單日大減百億以上', checked: false },
    { id: 's4', label: '費半與台積電 ADR 連 2 日收紅', checked: false },
    { id: 's5', label: '加權指數爆量長下影線，或站回 5 日均線', checked: false },
    { id: 's6', label: '美國 VIX 恐慌指數從高點回落', checked: false },
    { id: 's7', label: '大盤追蹤日成立（反彈第 4 天後單日漲 1.5% 以上且量增）', checked: false },
  ],
  stopLossPct: -0.08,
  satelliteSignalThreshold: 4,
  maxPerWeek: 2,
};

/** 觸發點的指數值，四捨五入到整數 */
export function triggerLevel(baseIndex: number, pct: number): number {
  return Math.round(baseIndex * (1 + pct));
}

/** 取得台北時間的日期字串與是否已收盤（13:30 後或週末） */
export function taipeiNow(now: Date = new Date()): { date: string; afterClose: boolean; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[get('weekday')] ?? 1;
  const weekend = weekday === 0 || weekday === 6;
  const afterClose = weekend || hour * 60 + minute >= 13 * 60 + 30;
  return { date, afterClose, weekday };
}

/** 回傳該日期所在週的週一（YYYY-MM-DD），用來計算「同一週最多兩批」 */
export function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function executedThisWeek(plan: DcaPlan, today: string): number {
  const ws = weekStart(today);
  return plan.tranches.filter(t => t.executedAt && weekStart(t.executedAt) === ws).length;
}

/**
 * 評估每一批的狀態。
 * currentIndex：目前加權指數；afterClose：是否已收盤（收盤後才算正式觸發）。
 */
export function evaluatePlan(
  plan: DcaPlan,
  currentIndex: number | null,
  today: string,
  afterClose: boolean,
): Record<string, TrancheStatus> {
  const result: Record<string, TrancheStatus> = {};
  let weeklyUsed = executedThisWeek(plan, today);
  const hasIndex = typeof currentIndex === 'number' && currentIndex > 0;

  const priceHit = (t: Tranche) =>
    hasIndex && t.triggerPct !== undefined &&
    (currentIndex as number) <= triggerLevel(plan.baseIndex, t.triggerPct);

  // 核心批次：只有「下一個尚未執行」的那一批能變成 due
  const core = plan.tranches.filter(t => t.group === 'core');
  const nextCore = core.find(t => !t.executedAt);
  // 價格階梯：指數跌到某個觸發點，代表「到這個位置應該已經投入幾批」。
  // 目標批數 = 沒有價格觸發的批次數 + 已達標的觸發點數。
  // 已執行批數少於目標時，下一批就因價格提前（每個觸發點只算一次，不會重複提前）。
  const hitCount = core.filter(t => priceHit(t)).length;
  const ladderTarget = hitCount > 0
    ? core.filter(t => t.triggerPct === undefined).length + hitCount
    : 0;
  const coreExecuted = core.filter(t => t.executedAt).length;
  const anyPendingCoreHit = hasIndex && coreExecuted < ladderTarget;

  for (const t of plan.tranches) {
    if (t.executedAt) { result[t.id] = { kind: 'executed' }; continue; }

    if (t.group === 'core') {
      if (t !== nextCore) { result[t.id] = { kind: 'waiting' }; continue; }
      const dateDue = !!t.plannedDate && t.plannedDate <= today;
      const priceDue = anyPendingCoreHit;
      if (!dateDue && !priceDue) { result[t.id] = { kind: 'waiting' }; continue; }
      if (!dateDue && priceDue && !afterClose) {
        result[t.id] = { kind: 'warning', reason: 'intraday_price' }; continue;
      }
      if (weeklyUsed >= plan.maxPerWeek) { result[t.id] = { kind: 'blocked_weekly_limit' }; continue; }
      result[t.id] = { kind: 'due', reason: dateDue ? 'date' : 'price' };
      weeklyUsed += 1;
      continue;
    }

    // 極端備用：只看價格
    if (!priceHit(t)) { result[t.id] = { kind: 'waiting' }; continue; }
    if (!afterClose) { result[t.id] = { kind: 'warning', reason: 'intraday_price' }; continue; }
    if (weeklyUsed >= plan.maxPerWeek) { result[t.id] = { kind: 'blocked_weekly_limit' }; continue; }
    result[t.id] = { kind: 'due', reason: 'price' };
    weeklyUsed += 1;
  }
  return result;
}

export interface PlanSummary {
  invested: number;
  remaining: number;
  executedCount: number;
  totalTranches: number;
  avgEntryIndex: number | null;   // 以金額加權的平均進場指數
  allocationTotal: number;
  trancheTotal: number;
}

export function summarizePlan(plan: DcaPlan): PlanSummary {
  const executed = plan.tranches.filter(t => t.executedAt);
  const invested = executed.reduce((s, t) => s + t.amount, 0);
  const withIdx = executed.filter(t => t.executedIndex && t.executedIndex > 0);
  const w = withIdx.reduce((s, t) => s + t.amount, 0);
  const avgEntryIndex = w > 0
    ? withIdx.reduce((s, t) => s + t.amount * (t.executedIndex as number), 0) / w
    : null;
  return {
    invested,
    remaining: plan.tranches.reduce((s, t) => s + t.amount, 0) - invested,
    executedCount: executed.length,
    totalTranches: plan.tranches.length,
    avgEntryIndex,
    allocationTotal: plan.allocations.reduce((s, a) => s + a.amount, 0),
    trancheTotal: plan.tranches.reduce((s, t) => s + t.amount, 0),
  };
}

export interface StopLossRow {
  id: string;
  name: string;
  cost: number;
  price: number;
  pnlPct: number;
  breached: boolean;
}

/** 持股中跌破停損線的檢查（cost / price 為每股） */
export function checkStopLoss(
  holdings: { id: string; name: string; shares: number; cost: number; price: number }[],
  stopLossPct: number,
): StopLossRow[] {
  return holdings
    .filter(h => h.shares > 0 && h.cost > 0 && h.price > 0)
    .map(h => {
      const pnlPct = h.price / h.cost - 1;
      return { id: h.id, name: h.name, cost: h.cost, price: h.price, pnlPct, breached: pnlPct <= stopLossPct };
    })
    .sort((a, b) => a.pnlPct - b.pnlPct);
}

const STORAGE_KEY = 'tw_stock_dca_plan';

export function loadPlan(): DcaPlan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_PLAN);
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.tranches)) return structuredClone(DEFAULT_PLAN);
    return parsed as DcaPlan;
  } catch {
    return structuredClone(DEFAULT_PLAN);
  }
}

export function savePlan(plan: DcaPlan): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); } catch { /* 無痕或儲存空間不足時略過 */ }
}
