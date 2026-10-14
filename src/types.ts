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
  navSpread?: number; // 折溢價差額 (市價 - 淨值)
  prevNav?: number; // 前一日淨值
  navChange?: number; // 淨值漲跌
  navChangePercent?: number; // 淨值漲跌幅 %
  navUpdateTime?: string; // 淨值計算/更新時間
}

export interface TwseEtfIndicator {
  id: string; // 代號
  name: string; // 簡稱
  price: number; // 當前市價
  nav: number; // 預估淨值
  navSpread: number; // 預估折溢價金額 (市價 - 淨值)
  discountPremium: number; // 預估折溢價幅度 %
  prevNav: number; // 前一日淨值
  navChange: number; // 淨值漲跌
  navChangePercent: number; // 淨值漲跌幅 %
  date: string; // 淨值計算日期
  time: string; // 淨值計算時間
  sourceUrl: string; // TWSE 官方揭示網址
}

export interface Stock {
  id: string; // e.g., "2330"
  name: string; // e.g., "台積電"
  customName?: string; // 使用者自訂名稱
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
  isObserved?: boolean;
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

export type SectorStatus = 'FIRE_START' | 'STRONG' | 'OBSERVE' | 'RECEDING' | 'WEAK';

export interface SectorRotationItem {
  id: string;
  name: string;
  theme: string;
  score: number; // 0 ~ 100
  status: SectorStatus; // 🔥 啟動, 🟢 強勢, 🟡 觀察, 🟠 退潮, 🔴 弱勢
  rs5d: number;
  rs20d: number;
  topLeaders: string[]; // Stock names/ids
  catalysts: string;
  trend: 'UP' | 'FLAT' | 'DOWN';
}

export interface CycleRadarItem {
  id: string;
  sectorName: string;
  cycleStage: '啟動起漲' | '主升擴張' | '高檔過熱' | '反轉退潮' | '築底沉澱';
  isEarlyWarning: boolean; // 是否提前偵測啟動
  warningReason: string;
  keyMetric: string; // e.g. "SCFI 運價連2週反彈 +5.8%"
  groupSyncScore: number; // 族群同步性 0 ~ 100
  representativeStocks: { id: string; name: string; rs20d: number; price: number; change: number; ma20Status: string }[];
  actionAdvice: string;
}

export interface RecentNewsItem {
  id: string;
  date: string; // YYYY-MM-DD within 3 days
  title: string;
  source: string; // e.g. "工商時報", "Reuters", "經濟日報"
  impact: string; // 對市場影響
  favoredSectors: string[];
  unfavoredSectors: string[];
  affectedStocks: string[];
  isMidterm: boolean; // 短期事件 vs 中期基本面
}

export interface StockPriceMap {
  breakoutPrice: number; // 突破買點 (Pivot)
  pullbackMin: number; // 第一健康回測買點 (下緣)
  pullbackMax: number; // 第一健康回測買點 (上緣)
  knifeInvalidPrice: number; // 接刀失效區 (跌破此價格嚴禁接刀)
  stopLossPrice: number; // 停損價 (-8% 或重要支撐)
  targetPrice1: number; // 第一目標價 (+15%~20%)
  targetPrice2: number; // 第二目標價 (+30%)
  targetMidterm: number; // 中期目標價 (+50%+)
  pullbackState: 'HEALTHY_PULLBACK' | 'KNIFE_AVOID' | 'BREAKOUT' | 'CONSOLIDATION';
  pullbackStateDesc: string;
}

export interface StockStrategy3Period {
  shortTerm: { period: '1~5日'; action: string; buyRange: string; stopLoss: string; target: string };
  swing: { period: '2~8週'; action: string; buyRange: string; stopLoss: string; target: string };
  midterm: { period: '2~6個月'; action: string; buyRange: string; stopLoss: string; target: string };
}

export type ValuationModelType = 'CAN_SLIM' | 'CYCLE' | 'FINANCIAL' | 'ETF_ALLOCATION';

export interface CanSlimDetails {
  cScore: number; // Current quarterly earnings
  aScore: number; // Annual earnings
  nScore: number; // New product/management/high
  sScore: number; // Supply & Demand / volume
  lScore: number; // Leader or Laggard
  iScore: number; // Institutional sponsorship
  mScore: number; // Market direction
  totalScore: number; // 0 ~ 100
  leaderStatus: 'LEADER' | 'LAGGARD' | 'EMERGING';
  rs5d: number;
  rs20d: number;
  rs60d: number;
  modelType: ValuationModelType;
}

export interface ChipStatus {
  concentration1d: number; // 1日籌碼集中度 %
  concentration5d: number; // 5日籌碼集中度 %
  concentration10d: number; // 10日籌碼集中度 %
  mainForceBuy: number; // 主力買賣超 (張)
  marginBalanceChange: number; // 融資變化 (張)
  shortBalanceChange: number; // 融券變化 (張)
  foreignNetBuy: number; // 外資買賣超 (張)
  trustNetBuy: number; // 投信買賣超 (張)
  dealerNetBuy: number; // 自營商買賣超 (張)
  bigPlayersRatio: number; // 千張大戶持股比 %
  branchTransactions: { branch: string; buyVol: number; sellVol: number; net: number }[]; // 主力分點進出
  financialSummary: {
    revenueYoY: number; // 營收年增率 %
    grossMargin: number; // 毛利率 %
    operatingMargin: number; // 營業利益率 %
    eps: number; // 每股盈餘 (NT$)
    peRatio: number; // 本益比
    pbRatio: number; // 股價淨值比
  }
}


