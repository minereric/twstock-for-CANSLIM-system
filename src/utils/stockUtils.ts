/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stock, Candle, StockIndicator, EtfDetails, EtfConstituent, EtfDividend, ChipStatus } from '../types';

// Helper to generate mock historical candles for a stock
export function generateHistoricalCandles(basePrice: number, count: number = 30): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = basePrice * 0.9; // Start slightly lower to trend up
  const now = new Date();

  for (let i = count; i >= 1; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateString = date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
    
    const volatility = 0.02; // 2% daily volatility
    const change = (Math.random() - 0.48) * volatility; // slight upward bias
    const open = currentPrice;
    const close = currentPrice * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.round((Math.random() * 5000 + 1000) * (basePrice > 500 ? 5 : 20));

    candles.push({
      time: dateString,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    currentPrice = close;
  }
  return candles;
}

// Calculate simple moving average
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

export function updateEtfDetails(stock: Stock, allStocks: { id: string; price: number; change: number }[]): Stock {
  let meta = ETF_METADATA[stock.id];
  
  if (!meta) {
    const isEtfPattern = stock.id.startsWith('00') || stock.id.includes('A') || stock.id.includes('L') || stock.id.includes('R');
    if (isEtfPattern) {
      let seed = 0;
      for (let i = 0; i < stock.id.length; i++) seed += stock.id.charCodeAt(i);
      
      const isHighYield = seed % 2 === 0;
      meta = {
        category: isHighYield ? '高股息' : '市值型',
        fundSize: 50 + (seed % 800),
        shareholders: 15000 + (seed % 60000) * 8,
        distributionFreq: isHighYield ? '季配' : '半年配',
        annualizedYield: isHighYield ? Number((6.5 + (seed % 4) * 0.8).toFixed(2)) : Number((2.8 + (seed % 3) * 0.7).toFixed(2)),
        nextExDate: '2026-08-15',
        nextAmount: Number((0.25 + (seed % 5) * 0.15).toFixed(2)),
        constituents: [
          { id: '2330', name: '台積電', weight: isHighYield ? 4.2 : 46.5 },
          { id: '2317', name: '鴻海', weight: isHighYield ? 3.9 : 8.8 },
          { id: '2382', name: '廣達', weight: isHighYield ? 3.6 : 4.5 },
          { id: '2303', name: '聯電', weight: isHighYield ? 3.4 : 3.8 },
          { id: '2356', name: '英業達', weight: isHighYield ? 3.1 : 2.5 }
        ],
        dividends: [
          { exDate: '2026-08-15', amount: Number((0.25 + (seed % 5) * 0.15).toFixed(2)), yield: 2.1 }
        ]
      };
    } else {
      return stock;
    }
  }

  let totalWeight = 0;
  let weightedChangeSum = 0;

  meta.constituents.forEach(c => {
    const matchingStock = allStocks.find(s => s.id === c.id);
    const constituentChange = matchingStock ? matchingStock.change : stock.change;
    weightedChangeSum += constituentChange * Math.abs(c.weight);
    totalWeight += Math.abs(c.weight);
  });

  const avgConstituentsChange = totalWeight > 0 ? (weightedChangeSum / totalWeight) : stock.change;
  const estimatedNav = Number((stock.prevClose * (1 + avgConstituentsChange / 100)).toFixed(2));
  const discountPremium = Number((((stock.price - estimatedNav) / estimatedNav) * 100).toFixed(2));

  return {
    ...stock,
    etfDetails: {
      ...meta,
      estimatedNav,
      discountPremium
    }
  };
}

// 26 Initial stocks matching Taiwan market favourites and portfolio
export const getInitialStockData = (): Stock[] => {
  const defaultStocks = [
    // --- Portfolio stocks (真實持股) ---
    { id: '00631L', name: '元大台灣50正二', price: 38.16, shares: 0, cost: 0 },
    { id: '00632R', name: '元大台灣50反一', price: 9.85, shares: 12000, cost: 12.77 },
    { id: '00981A', name: '主動統一台股增長', price: 31.50, shares: 6000, cost: 30.21 },
    { id: '00991A', name: '主動復華未來50', price: 21.06, shares: 6000, cost: 18.82 },
    { id: '2356', name: '英業達', price: 67.50, shares: 3000, cost: 64.40 },
    { id: '2885', name: '元大金', price: 66.70, shares: 144, cost: 60.00 },
    { id: '3481', name: '群創', price: 66.50, shares: 2000, cost: 68.15 },
    { id: '1432', name: '大魯閣', price: 15.65, shares: 1000, cost: 18.06 },

    // --- Watches (熱門觀察標的, 股數 0 / 成本 0) ---
    { id: '2330', name: '台積電', price: 2430.00, shares: 0, cost: 0 },
    { id: '2317', name: '鴻海', price: 238.50, shares: 0, cost: 0 },
    { id: '2382', name: '廣達', price: 372.50, shares: 0, cost: 0 },
    { id: '2303', name: '聯電', price: 168.50, shares: 0, cost: 0 },
    { id: '6770', name: '力積電', price: 75.10, shares: 0, cost: 0 },
    { id: '2344', name: '華邦電', price: 192.00, shares: 0, cost: 0 },
    { id: '2313', name: '華通', price: 226.00, shares: 0, cost: 0 },
    { id: '1605', name: '華新', price: 35.00, shares: 0, cost: 0 },
    { id: '2481', name: '強茂', price: 60.00, shares: 0, cost: 0 },
    { id: '3416', name: '融程電', price: 130.00, shares: 0, cost: 0 },
    { id: '3711', name: '日月光投控', price: 150.00, shares: 0, cost: 0 },
    { id: '2618', name: '長榮航', price: 35.00, shares: 0, cost: 0 },
    { id: '2610', name: '華航', price: 22.00, shares: 0, cost: 0 },
    { id: '2603', name: '長榮', price: 200.00, shares: 0, cost: 0 },
    { id: '2609', name: '陽明', price: 70.00, shares: 0, cost: 0 },
    { id: '2882', name: '國泰金', price: 55.00, shares: 0, cost: 0 },
    { id: '2501', name: '國建', price: 30.00, shares: 0, cost: 0 },
    { id: '0050', name: '元大台灣50', price: 109.50, shares: 0, cost: 0 },
    { id: '0056', name: '元大高股息', price: 38.00, shares: 0, cost: 0 },
    { id: '00919', name: '群益台灣精選高息', price: 25.00, shares: 0, cost: 0 },
    { id: '00878', name: '國泰永續高股息', price: 22.00, shares: 0, cost: 0 },
    { id: '00927', name: '群益半導體收益', price: 19.50, shares: 0, cost: 0 },
  ];

  const basicStocks = defaultStocks.map(s => {
    const candleHistory = generateHistoricalCandles(s.price, 35);
    const history = candleHistory.map(c => c.close);
    const indicators = computeIndicators(candleHistory);
    return {
      ...s,
      candleHistory,
      history,
      indicators,
      change: Number(((Math.random() * 6 - 3)).toFixed(2)), // Random daily change
      prevClose: Number((s.price / (1 + (Math.random() * 0.04 - 0.02))).toFixed(2)),
      volume: Math.round(Math.random() * 80000 + 20000),
      isObserved: true,
    };
  });

  return basicStocks.map(s => updateEtfDetails(s, basicStocks));
};

// Tick function to update price of a stock dynamically with a micro-trend
export function tickStockPrice(stock: Stock, marketTrend: number = 0): Stock {
  const currentPrice = stock.price;
  
  // High price stocks move in wider absolute tick values but same percent relative tick sizes
  // Volatility is custom based on stock type:
  // Leveraged/Inversed ETFs and penny/highly active stocks (e.g. 1432, 3481) are more volatile
  let stockVolatility = 0.0015; // default 0.15% per tick
  if (stock.id === '00632R' || stock.id === '1432' || stock.id === '3481') {
    stockVolatility = 0.003;
  } else if (stock.id.startsWith('00')) {
    stockVolatility = 0.0006; // ETFs are more stable
  }

  // Taiwan stock pricing tick sizes rule:
  // < 10: 0.01
  // 10 ~ 50: 0.05
  // 50 ~ 100: 0.1
  // 100 ~ 500: 0.5
  // 500 ~ 1000: 1.0
  // >= 1000: 5.0
  const getTaiwanTickSize = (price: number) => {
    if (price < 10) return 0.01;
    if (price < 50) return 0.05;
    if (price < 100) return 0.1;
    if (price < 500) return 0.5;
    if (price < 1000) return 1.0;
    return 5.0;
  };

  const tickSize = getTaiwanTickSize(currentPrice);
  
  // Determine move direction with a slight bias from the market trend and volatility
  const bias = marketTrend * 0.2 + (Math.random() - 0.5);
  const percentChange = bias * stockVolatility;
  
  let priceDelta = currentPrice * percentChange;
  
  // Snap priceDelta to the closest tick size multiple, keeping it at least 1 tick if randomized bias is strong
  const ticks = Math.round(priceDelta / tickSize);
  let nextPrice = currentPrice + (ticks !== 0 ? ticks * tickSize : (Math.random() > 0.5 ? tickSize : -tickSize));

  // Make sure price is never 0 or negative
  nextPrice = Math.max(tickSize, Number(nextPrice.toFixed(2)));

  // Calculate new daily change percentage from original prevClose
  const newChangePct = ((nextPrice - stock.prevClose) / stock.prevClose) * 100;
  
  // Update the latest candle (the current trading day)
  const updatedCandles = [...stock.candleHistory];
  if (updatedCandles.length > 0) {
    const lastIndex = updatedCandles.length - 1;
    const lastCandle = updatedCandles[lastIndex];
    
    updatedCandles[lastIndex] = {
      ...lastCandle,
      close: nextPrice,
      high: Math.max(lastCandle.high, nextPrice),
      low: Math.min(lastCandle.low, nextPrice),
      volume: lastCandle.volume + Math.round(Math.random() * 150),
    };
  }

  const updatedHistory = updatedCandles.map(c => c.close);
  const updatedIndicators = computeIndicators(updatedCandles);

  return {
    ...stock,
    price: nextPrice,
    change: Number(newChangePct.toFixed(2)),
    candleHistory: updatedCandles,
    history: updatedHistory,
    indicators: updatedIndicators,
    volume: stock.volume + Math.round(Math.random() * 5),
  };
}

export function getChipStatus(stockId: string, price: number): ChipStatus {
  // Seed-based random generator to keep it relatively stable for the same stockId
  let seed = 0;
  for (let i = 0; i < stockId.length; i++) {
    seed += stockId.charCodeAt(i);
  }
  const pseudoRandom = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  // Generate realistic values based on stockId
  const isEtf = stockId.startsWith('00');
  
  // Custom branches based on stockId
  let branches: string[] = ['元大總公司', '凱基台北', '美商高盛', '摩根大通', '富邦建國'];
  if (seed % 3 === 1) {
    branches = ['凱基台北', '元大大同', '美商高盛', '台灣摩根士丹利', '永豐金證券'];
  } else if (seed % 3 === 2) {
    branches = ['群益金鼎', '國泰敦南', '美商美林', '凱基板橋', '元富證券'];
  }

  const branchTransactions = branches.map((branch, idx) => {
    const r1 = pseudoRandom(idx * 10);
    const r2 = pseudoRandom(idx * 10 + 5);
    const buyVol = Math.round(r1 * (isEtf ? 2000 : 5000) + 100);
    const sellVol = Math.round(r2 * (isEtf ? 2000 : 5000) + 100);
    return {
      branch,
      buyVol,
      sellVol,
      net: buyVol - sellVol
    };
  }).sort((a, b) => b.net - a.net);

  // Financials
  let revenueYoY = Number((pseudoRandom(20) * 40 - 10).toFixed(1)); // -10% to +30%
  let grossMargin = Number((pseudoRandom(30) * 45 + 5).toFixed(1)); // 5% to 50%
  let operatingMargin = Number((grossMargin * (0.3 + pseudoRandom(40) * 0.5)).toFixed(1));
  let eps = Number((pseudoRandom(50) * 12 - 2).toFixed(2)); // -2 to +10
  
  if (stockId === '2330') { // TSMC
    revenueYoY = 24.5;
    grossMargin = 53.2;
    operatingMargin = 42.1;
    eps = 38.45;
  } else if (stockId === '3293') { // 鈊象 (IGS)
    revenueYoY = 28.6;
    grossMargin = 96.2;
    operatingMargin = 55.4;
    eps = 58.20;
  } else if (stockId === '2317') { // Foxconn
    revenueYoY = 15.8;
    grossMargin = 6.4;
    operatingMargin = 2.8;
    eps = 10.25;
  } else if (stockId === '2382') { // Quanta
    revenueYoY = 18.2;
    grossMargin = 8.1;
    operatingMargin = 4.0;
    eps = 12.40;
  } else if (isEtf) {
    grossMargin = 0;
    operatingMargin = 0;
    eps = 0;
  }

  const peRatio = eps > 0 ? Number((price / eps).toFixed(1)) : 0;
  const pbRatio = Number((1.2 + pseudoRandom(60) * 2.8).toFixed(2));

  const mainForceBuy = Math.round((pseudoRandom(70) * 20000 - 8000) * (isEtf ? 0.3 : 1));
  const foreignNetBuy = Math.round((pseudoRandom(80) * 15000 - 6000) * (isEtf ? 0.2 : 1));
  const trustNetBuy = Math.round((pseudoRandom(90) * 10000 - 3000) * (isEtf ? 0.5 : 1));
  const dealerNetBuy = Math.round(pseudoRandom(100) * 4000 - 2000);
  
  const concentration1d = Number((pseudoRandom(110) * 30 - 10).toFixed(2));
  const concentration5d = Number((pseudoRandom(120) * 20 - 5).toFixed(2));
  const concentration10d = Number((pseudoRandom(130) * 15 - 2).toFixed(2));

  const marginBalanceChange = Math.round(pseudoRandom(140) * 4000 - 1800);
  const shortBalanceChange = Math.round(pseudoRandom(150) * 800 - 350);
  const bigPlayersRatio = Number((40 + pseudoRandom(160) * 45).toFixed(1)); // 40% to 85%

  return {
    concentration1d,
    concentration5d,
    concentration10d,
    mainForceBuy,
    marginBalanceChange,
    shortBalanceChange,
    foreignNetBuy,
    trustNetBuy,
    dealerNetBuy,
    bigPlayersRatio,
    branchTransactions,
    financialSummary: {
      revenueYoY,
      grossMargin,
      operatingMargin,
      eps,
      peRatio,
      pbRatio
    }
  };
}

