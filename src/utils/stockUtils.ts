/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stock, Candle, StockIndicator, EtfDetails, EtfConstituent, EtfDividend } from '../types';
import { isEtfId } from './riskEngine';

// Helper to generate mock historical candles for a stock
export function calculateMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(-period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return Number((sum / period).toFixed(2));
}

// Calculate Relative Strength Index (RSI)
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50; // default middle
  
  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Number(rsi.toFixed(2));
}

// Calculate Stochastic Oscillator (KD)
export function calculateKD(candles: Candle[], period: number = 9): { k: number; d: number } {
  if (candles.length < period) return { k: 50, d: 50 };

  let k = 50;
  let d = 50;

  // Calculate sequentially to simulate EMA smooth of RSV
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const closes = window.map(c => c.close);
    const highs = window.map(c => c.high);
    const lows = window.map(c => c.low);

    const currentClose = closes[closes.length - 1];
    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);

    const rsv = highestHigh === lowestLow ? 50 : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }

  return {
    k: Number(k.toFixed(2)),
    d: Number(d.toFixed(2)),
  };
}

// Calculate MACD (Moving Average Convergence Divergence)
export function calculateMACD(prices: number[]): { dif: number; dem: number; hist: number } {
  if (prices.length < 26) return { dif: 0, dem: 0, hist: 0 };

  const calculateEMA = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  };

  // EMA12 and EMA26 arrays
  const ema12s: number[] = [];
  const ema26s: number[] = [];
  const difs: number[] = [];

  // Simple seed to run EMA sequentially
  let currentEma12 = prices[0];
  let currentEma26 = prices[0];
  const k12 = 2 / (12 + 1);
  const k26 = 2 / (26 + 1);

  for (let i = 0; i < prices.length; i++) {
    currentEma12 = prices[i] * k12 + currentEma12 * (1 - k12);
    currentEma26 = prices[i] * k26 + currentEma26 * (1 - k26);
    ema12s.push(currentEma12);
    ema26s.push(currentEma26);
    difs.push(currentEma12 - currentEma26);
  }

  // Calculate DEM (EMA9 of DIF)
  let dem = difs[0];
  const k9 = 2 / (9 + 1);
  for (let i = 1; i < difs.length; i++) {
    dem = difs[i] * k9 + dem * (1 - k9);
  }

  const dif = difs[difs.length - 1];
  const hist = dif - dem;

  return {
    dif: Number(dif.toFixed(2)),
    dem: Number(dem.toFixed(2)),
    hist: Number(hist.toFixed(2)),
  };
}

// Compute all indicators for a stock
export function computeIndicators(candles: Candle[]): StockIndicator {
  const prices = candles.map(c => c.close);
  return {
    rsi: calculateRSI(prices),
    kd: calculateKD(candles),
    macd: calculateMACD(prices),
    ma: {
      ma5: calculateMA(prices, 5),
      ma10: calculateMA(prices, 10),
      ma20: calculateMA(prices, 20),
    },
  };
}

export const ETF_METADATA: Record<string, {
  category: string;
  fundSize: number;
  shareholders: number;
  distributionFreq: string;
  annualizedYield: number;
  nextExDate?: string;
  nextAmount?: number;
  constituents: EtfConstituent[];
  dividends: EtfDividend[];
}> = {
  '0050': {
    category: '市值型',
    fundSize: 3852,
    shareholders: 648512,
    distributionFreq: '半年配',
    annualizedYield: 4.8,
    nextExDate: '2026-07-16',
    nextAmount: 2.6,
    constituents: [
      { id: '2330', name: '台積電', weight: 53.4 },
      { id: '2317', name: '鴻海', weight: 9.2 },
      { id: '2454', name: '聯發科', weight: 4.3 },
      { id: '2382', name: '廣達', weight: 3.1 },
      { id: '2303', name: '聯電', weight: 2.2 }
    ],
    dividends: [
      { exDate: '2026-07-16', amount: 2.6, yield: 2.4 },
      { exDate: '2026-01-17', amount: 3.0, yield: 2.1 },
      { exDate: '2025-07-18', amount: 1.9, yield: 1.5 },
      { exDate: '2025-01-15', amount: 2.5, yield: 1.8 }
    ]
  },
  '0056': {
    category: '高股息',
    fundSize: 2980,
    shareholders: 1062310,
    distributionFreq: '季配',
    annualizedYield: 8.5,
    nextExDate: '2026-07-18',
    nextAmount: 0.79,
    constituents: [
      { id: '2382', name: '廣達', weight: 4.2 },
      { id: '2356', name: '英業達', weight: 3.8 },
      { id: '2303', name: '聯電', weight: 3.5 },
      { id: '3711', name: '日月光投控', weight: 3.2 },
      { id: '2313', name: '華通', weight: 2.8 }
    ],
    dividends: [
      { exDate: '2026-07-18', amount: 0.79, yield: 2.1 },
      { exDate: '2026-04-18', amount: 0.73, yield: 1.9 },
      { exDate: '2026-01-17', amount: 0.70, yield: 1.8 },
      { exDate: '2025-10-19', amount: 1.20, yield: 3.1 }
    ]
  },
  '00878': {
    category: '高股息',
    fundSize: 2845,
    shareholders: 1285420,
    distributionFreq: '季配',
    annualizedYield: 9.1,
    nextExDate: '2026-08-14',
    nextAmount: 0.51,
    constituents: [
      { id: '2317', name: '鴻海', weight: 4.8 },
      { id: '2303', name: '聯電', weight: 4.5 },
      { id: '2382', name: '廣達', weight: 4.1 },
      { id: '3711', name: '日月光投控', weight: 3.6 },
      { id: '2356', name: '英業達', weight: 3.2 }
    ],
    dividends: [
      { exDate: '2026-08-14', amount: 0.51, yield: 2.3 },
      { exDate: '2026-05-17', amount: 0.51, yield: 2.3 },
      { exDate: '2026-02-22', amount: 0.40, yield: 1.8 },
      { exDate: '2025-11-16', amount: 0.35, yield: 1.6 }
    ]
  },
  '00919': {
    category: '高股息',
    fundSize: 2120,
    shareholders: 742150,
    distributionFreq: '季配',
    annualizedYield: 10.3,
    nextExDate: '2026-06-15',
    nextAmount: 0.72,
    constituents: [
      { id: '2303', name: '聯電', weight: 7.1 },
      { id: '2317', name: '鴻海', weight: 6.8 },
      { id: '3711', name: '日月光投控', weight: 4.5 },
      { id: '2356', name: '英業達', weight: 4.1 },
      { id: '2382', name: '廣達', weight: 3.8 }
    ],
    dividends: [
      { exDate: '2026-06-15', amount: 0.72, yield: 2.8 },
      { exDate: '2026-03-18', amount: 0.66, yield: 2.6 },
      { exDate: '2025-12-18', amount: 0.55, yield: 2.2 },
      { exDate: '2025-09-18', amount: 0.54, yield: 2.1 }
    ]
  },
  '00927': {
    category: '半導體收益',
    fundSize: 133,
    shareholders: 85200,
    distributionFreq: '季配',
    annualizedYield: 7.45,
    nextExDate: '2026-10-18',
    nextAmount: 0.64,
    constituents: [
      { id: '2330', name: '台積電', weight: 15.2 },
      { id: '2454', name: '聯發科', weight: 13.8 },
      { id: '2379', name: '瑞昱', weight: 8.5 },
      { id: '3034', name: '聯詠', weight: 7.6 },
      { id: '3711', name: '日月光投控', weight: 6.9 }
    ],
    dividends: [
      { exDate: '2026-10-18', amount: 0.64, yield: 1.6 },
      { exDate: '2026-07-16', amount: 0.64, yield: 1.6 },
      { exDate: '2026-04-18', amount: 0.58, yield: 1.5 },
      { exDate: '2026-01-17', amount: 0.54, yield: 1.4 }
    ]
  },
  '00631L': {
    category: '槓桿型',
    fundSize: 165,
    shareholders: 32410,
    distributionFreq: '不配息',
    annualizedYield: 0,
    constituents: [
      { id: '2330', name: '台積電 (槓桿曝險)', weight: 106.8 },
      { id: '2317', name: '鴻海 (槓桿曝險)', weight: 18.4 },
      { id: '2382', name: '廣達 (槓桿曝險)', weight: 6.2 }
    ],
    dividends: []
  },
  '00632R': {
    category: '反向型',
    fundSize: 310,
    shareholders: 218450,
    distributionFreq: '不配息',
    annualizedYield: 0,
    constituents: [
      { id: '2330', name: '台積電 (反向放空)', weight: -53.4 },
      { id: '2317', name: '鴻海 (反向放空)', weight: -9.2 }
    ],
    dividends: []
  },
  '00981A': {
    category: '主動型共同基金',
    fundSize: 58,
    shareholders: 18520,
    distributionFreq: '不配息',
    annualizedYield: 0,
    constituents: [
      { id: '2330', name: '台積電', weight: 35.2 },
      { id: '2317', name: '鴻海', weight: 11.0 },
      { id: '2382', name: '廣達', weight: 6.5 }
    ],
    dividends: []
  },
  '00991A': {
    category: '主動型共同基金',
    fundSize: 42,
    shareholders: 12110,
    distributionFreq: '不配息',
    annualizedYield: 0,
    constituents: [
      { id: '2330', name: '台積電', weight: 38.0 },
      { id: '2317', name: '鴻海', weight: 10.5 },
      { id: '2382', name: '廣達', weight: 7.0 }
    ],
    dividends: []
  }
};

/** ETF 靜態參考資料（規模、配息、成分股為人工整理，非即時；淨值與折溢價一律使用官方即時揭示） */
const EMPTY_ETF_META = {
  category: 'ETF',
  fundSize: 0,
  shareholders: 0,
  distributionFreq: '—',
  annualizedYield: 0,
  constituents: [] as EtfConstituent[],
  dividends: [] as EtfDividend[],
};

/**
 * 套用 TWSE 官方 ETF「預估淨值」與「折溢價」：
 *  折溢價(%) = (市價 − 預估淨值) ÷ 預估淨值 × 100；官方有揭示值時以官方為準。
 * 沒有官方即時淨值時（例如休市前尚未揭示）estimatedNav = 0，畫面應顯示「—」而不是推算值。
 */
export function updateEtfDetails(stock: Stock, live?: EtfLive | null): Stock {
  if (!isEtfId(stock.id)) return stock;
  const meta = ETF_METADATA[stock.id] ?? EMPTY_ETF_META;
  const prev = stock.etfDetails;
  return {
    ...stock,
    etfDetails: {
      ...meta,
      ...(prev ? { navUpdateTime: prev.navUpdateTime, kind: prev.kind } : {}),
      estimatedNav: live ? live.nav : prev?.estimatedNav ?? 0,
      discountPremium: live ? live.discountPremium : prev?.discountPremium ?? 0,
      navSpread: live ? live.navSpread : prev?.navSpread,
      prevNav: live ? live.prevNav : prev?.prevNav,
      navChange: live ? live.navChange : prev?.navChange,
      navChangePercent: live ? live.navChangePercent : prev?.navChangePercent,
      navUpdateTime: live ? `${live.date} ${live.time}` : prev?.navUpdateTime,
      kind: live ? live.kind : prev?.kind,
    },
  };
}

export interface EtfLive {
  kind: 'standard' | 'leveraged' | 'inverse' | 'active';
  nav: number; prevNav: number; navChange: number; navChangePercent: number; navSpread: number; discountPremium: number; date: string; time: string;
}

/** 預設清單：僅在「資料庫完全沒有資料的新帳號」首次登入時匯入（之後一律以資料庫為準） */
export const DEFAULT_PORTFOLIO: { id: string; name: string; shares: number; cost: number }[] = [
  { id: '00631L', name: '元大台灣50正2', shares: 0, cost: 0 },
  { id: '00632R', name: '元大台灣50反1', shares: 12000, cost: 12.77 },
  { id: '00981A', name: '主動統一台股增長', shares: 6000, cost: 30.21 },
  { id: '00991A', name: '主動復華未來50', shares: 6000, cost: 18.82 },
  { id: '2356', name: '英業達', shares: 3000, cost: 64.4 },
  { id: '2885', name: '元大金', shares: 144, cost: 60 },
  { id: '3481', name: '群創', shares: 2000, cost: 68.15 },
  { id: '1432', name: '大魯閣', shares: 1000, cost: 18.06 },
  { id: '2330', name: '台積電', shares: 0, cost: 0 },
  { id: '2317', name: '鴻海', shares: 0, cost: 0 },
  { id: '2382', name: '廣達', shares: 0, cost: 0 },
  { id: '2303', name: '聯電', shares: 0, cost: 0 },
  { id: '6770', name: '力積電', shares: 0, cost: 0 },
  { id: '2344', name: '華邦電', shares: 0, cost: 0 },
  { id: '2313', name: '華通', shares: 0, cost: 0 },
  { id: '1605', name: '華新', shares: 0, cost: 0 },
  { id: '2481', name: '強茂', shares: 0, cost: 0 },
  { id: '3416', name: '融程電', shares: 0, cost: 0 },
  { id: '3711', name: '日月光投控', shares: 0, cost: 0 },
  { id: '2618', name: '長榮航', shares: 0, cost: 0 },
  { id: '2610', name: '華航', shares: 0, cost: 0 },
  { id: '2603', name: '長榮', shares: 0, cost: 0 },
  { id: '2609', name: '陽明', shares: 0, cost: 0 },
  { id: '2882', name: '國泰金', shares: 0, cost: 0 },
  { id: '2501', name: '國建', shares: 0, cost: 0 },
  { id: '0050', name: '元大台灣50', shares: 0, cost: 0 },
  { id: '0056', name: '元大高股息', shares: 0, cost: 0 },
  { id: '00919', name: '群益台灣精選高息', shares: 0, cost: 0 },
  { id: '00878', name: '國泰永續高股息', shares: 0, cost: 0 },
  { id: '00927', name: '群益半導體收益', shares: 0, cost: 0 },
];

const ZERO_IND: StockIndicator = {
  rsi: 0, kd: { k: 0, d: 0 }, macd: { dif: 0, dem: 0, hist: 0 }, ma: { ma5: 0, ma10: 0, ma20: 0 },
};

/** 尚未取得報價／歷史資料時的空殼（價格為 0 代表「尚無資料」，畫面會顯示載入中而非假價格） */
export function makeSkeletonStock(p: { id: string; name: string; shares?: number; cost?: number; isHolding?: boolean; isObserved?: boolean; customName?: string | null }): Stock {
  return {
    id: p.id,
    name: p.customName || p.name,
    customName: p.customName || undefined,
    price: 0,
    change: 0,
    prevClose: 0,
    volume: 0,
    history: [],
    candleHistory: [],
    shares: p.shares ?? 0,
    cost: p.cost ?? 0,
    indicators: ZERO_IND,
    isObserved: p.isObserved ?? true,
    isHolding: p.isHolding ?? false,
    quoteStatus: 'loading',
  };
}

/** 把即時報價合併進最新一根日 K（同一天更新，新的一天則新增），並重算指標；不產生任何隨機值 */
export function applyQuote(s: Stock, q: { price: number; changePercent: number; prevClose: number; volume: number; open?: number; high?: number; low?: number; isLive: boolean; asOf?: string; etf?: EtfLive }): Stock {
  if (!(q.price > 0)) return { ...s, quoteStatus: s.price > 0 ? 'stale' : 'error' };
  let candles = s.candleHistory;
  if (candles.length > 0) {
    const day = (q.asOf ?? '').slice(0, 10);
    const last = candles[candles.length - 1];
    candles = candles.slice();
    if (day && day === last.time) {
      candles[candles.length - 1] = {
        ...last, close: q.price,
        high: Math.max(last.high, q.high ?? q.price, q.price),
        low: Math.min(last.low, q.low ?? q.price, q.price),
        volume: q.volume > 0 ? q.volume : last.volume,
      };
    } else if (day && day > last.time) {
      candles.push({ time: day, open: q.open ?? q.price, high: Math.max(q.high ?? q.price, q.price), low: Math.min(q.low ?? q.price, q.price), close: q.price, volume: q.volume });
    }
  }
  const next: Stock = {
    ...s,
    price: q.price,
    change: q.changePercent,
    prevClose: q.prevClose,
    volume: q.volume,
    candleHistory: candles,
    history: candles.map((c) => c.close),
    indicators: candles.length > 0 ? computeIndicators(candles) : s.indicators,
    quoteStatus: q.isLive ? 'live' : 'stale',
    quoteAsOf: q.asOf,
  };
  return updateEtfDetails(next, q.etf ?? null);
}
