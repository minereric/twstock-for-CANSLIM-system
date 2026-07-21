/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StockIndicator {
  rsi: number;
  kd: {
    k: number;
    d: number;
  };
  macd: {
    dif: number;
    dem: number;
    hist: number;
  };
  ma: {
    ma5: number;
    ma10: number;
    ma20: number;
  };
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EtfConstituent {
  id: string;
  name: string;
  weight: number;
}

export interface EtfDividend {
  exDate: string;
  amount: number;
  yield: number;
}

export interface EtfDetails {
  category: string;
  fundSize: number; // 基金規模 (NT$億)
  shareholders: number; // 受益人數 (人)
  distributionFreq: string; // 配息頻率
  annualizedYield: number; // 年化配息率 %
  nextExDate?: string; // 下次除息日
  nextAmount?: number; // 下次配息金額
  constituents: EtfConstituent[];
  dividends: EtfDividend[];
  estimatedNav: number; // 預估淨值
  discountPremium: number; // 折溢價率 %
}

export interface Stock {
  id: string; // e.g., "2330"
  name: string; // e.g., "台積電"
  price: number;
  change: number; // percentage
  prevClose: number;
  volume: number;
  history: number[]; // rolling price history
  candleHistory: Candle[]; // candlestick history
  shares: number; // user owned shares (0 if not owned)
  cost: number; // user cost per share (0 if not owned)
  indicators: StockIndicator;
  etfDetails?: EtfDetails;
}

export type IndicatorType = 
  | 'price' 
  | 'change_pct' 
  | 'rsi' 
  | 'kd_k' 
  | 'kd_d' 
  | 'macd_hist' 
  | 'macd_cross' 
  | 'kd_cross' 
  | 'ma_cross';

export type AlertCondition = 
  | 'gt' 
  | 'lt' 
  | 'cross_up' 
  | 'cross_down';

export interface AlertRule {
  id: string;
  stockId: string;
  stockName: string;
  indicator: IndicatorType;
  condition: AlertCondition;
  value: number; // Target threshold
  isActive: boolean;
  createdAt: string;
}

export interface AlertLog {
  id: string;
  stockId: string;
  stockName: string;
  indicator: IndicatorType;
  condition: AlertCondition;
  triggerValue: number;
  currentValue: number;
  timestamp: string;
  isRead: boolean;
}

export interface MarketState {
  index: number; // TAIEX index
  change: number; // index change
  changePercent: number;
  volume: number; // TAIEX volume in NT$ billions
  status: 'OPEN' | 'CLOSED';
  simulationSpeed: 'realtime' | 'fast' | 'paused';
}

export interface GlobalIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
}

