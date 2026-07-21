/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { getInitialStockData, tickStockPrice, computeIndicators, updateEtfDetails } from './utils/stockUtils';
import { Stock, Candle, AlertRule, AlertLog, MarketState, IndicatorType, AlertCondition, GlobalIndex } from './types';
import PortfolioStats from './components/PortfolioStats';
import StockList from './components/StockList';
import StockDetailSidebar from './components/StockDetailSidebar';
import AlertManager from './components/AlertManager';
import ReportGenerator from './components/ReportGenerator';
import NotificationCenter, { playAlertSound, triggerBrowserNotification } from './components/NotificationCenter';
import { Sparkles, TrendingUp, TrendingDown, ArrowUpRight, Zap, Bell, Check, Info, Activity } from 'lucide-react';

// Pre-populate some standard Taiwan stock monitoring rules
const defaultRules = (stocks: Stock[]): AlertRule[] => {
  const tsmc = stocks.find(s => s.id === '2330');
  const qunchuang = stocks.find(s => s.id === '3481');
  const foxconn = stocks.find(s => s.id === '2317');
  
  return [
    {
      id: 'rule-1',
      stockId: '3481',
      stockName: '群創',
      indicator: 'price',
      condition: 'lt',
      value: 65.0,
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'rule-2',
      stockId: '2330',
      stockName: '台積電',
      indicator: 'price',
      condition: 'gt',
      value: 2450,
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'rule-3',
      stockId: '2317',
      stockName: '鴻海',
      indicator: 'rsi',
      condition: 'gt',
      value: 70,
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'rule-4',
      stockId: '0050',
      stockName: '元大台灣50',
      indicator: 'ma_cross',
      condition: 'cross_up',
      value: 0,
      isActive: true,
      createdAt: new Date().toISOString()
    }
  ];
};

export default function App() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string>('2330'); // Default to TSMC
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [market, setMarket] = useState<MarketState>({
    index: 22841.5,
    change: 142.3,
    changePercent: 0.62,
    volume: 3824, // NT$ billions
    status: 'OPEN',
    simulationSpeed: 'paused'
  });
  const [marketBias, setMarketBias] = useState<number>(0); // -1 (bearish), 0 (sideways), 1 (bullish)
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [toast, setToast] = useState<{ id: string; message: string; type: 'buy' | 'sell' | 'neutral' } | null>(null);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncSource, setSyncSource] = useState<string>("Simulated Local Data");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [globalIndices, setGlobalIndices] = useState<Record<string, GlobalIndex>>({});

  const syncFuglePrices = async (currentStocksList?: Stock[]) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/stocks');
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const result = await res.json();
      if (result.success) {
        setSyncSource(result.source);
        setLastSyncTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }));

        if (result.indices) {
          setGlobalIndices(result.indices);
          
          // Also update the local TAIEX index if ^TWII exists
          const twii = result.indices['^TWII'];
          if (twii) {
            setMarket(prev => ({
              ...prev,
              index: twii.price,
              change: twii.change,
              changePercent: twii.changePercent
            }));
          }
        }

        if (result.data) {
          setStocks(prevStocks => {
            const listToUse = prevStocks.length > 0 ? prevStocks : (currentStocksList || []);
            if (listToUse.length === 0) return listToUse;

            const updatedList = listToUse.map(s => {
              const apiData = result.data[s.id];
              if (apiData) {
                const newPrice = apiData.price;
                const newChange = apiData.changePercent;
                const newPrevClose = apiData.prevClose;
                const newVolume = apiData.volume;

                let updatedCandles = s.candleHistory ? [...s.candleHistory] : [];
                if (updatedCandles.length > 0) {
                  const lastCandle = updatedCandles[updatedCandles.length - 1];
                  const updatedLastCandle = {
                    ...lastCandle,
                    close: newPrice,
                    high: Math.max(lastCandle.high, newPrice),
                    low: Math.min(lastCandle.low, newPrice),
                    volume: newVolume
                  };
                  updatedCandles[updatedCandles.length - 1] = updatedLastCandle;
                }

                const newIndicators = computeIndicators(updatedCandles);

                return {
                  ...s,
                  price: newPrice,
                  change: newChange,
                  prevClose: newPrevClose,
                  volume: newVolume,
                  candleHistory: updatedCandles,
                  history: updatedCandles.map(c => c.close),
                  indicators: newIndicators
                };
              }
              return s;
            });

            return updatedList.map(s => updateEtfDetails(s, updatedList));
          });
        }
      }
    } catch (err) {
      console.error('Failed to sync stock and index quotes:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Initialize data from LocalStorage or default generators
  useEffect(() => {
    try {
      const storedStocks = localStorage.getItem('tw_stock_obs_stocks');
      const storedRules = localStorage.getItem('tw_stock_obs_rules');
      const storedLogs = localStorage.getItem('tw_stock_obs_logs');
      const storedMarket = localStorage.getItem('tw_stock_obs_market');

      const initialStocks = storedStocks ? JSON.parse(storedStocks) : getInitialStockData();
      setStocks(initialStocks);

      const initialRules = storedRules ? JSON.parse(storedRules) : defaultRules(initialStocks);
      setRules(initialRules);

      const initialLogs = storedLogs ? JSON.parse(storedLogs) : [];
      setLogs(initialLogs);

      if (storedMarket) {
        setMarket(JSON.parse(storedMarket));
      }

      // Sync with Fugle API on initial load
      syncFuglePrices(initialStocks);
    } catch (e) {
      console.warn('Failed to parse local storage, loading defaults:', e);
      const initialStocks = getInitialStockData();
      setStocks(initialStocks);
      setRules(defaultRules(initialStocks));
      syncFuglePrices(initialStocks);
    }
  }, []);

  // Sync state changes to localStorage
  useEffect(() => {
    if (stocks.length > 0) {
      localStorage.setItem('tw_stock_obs_stocks', JSON.stringify(stocks));
    }
  }, [stocks]);

  useEffect(() => {
    localStorage.setItem('tw_stock_obs_rules', JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    localStorage.setItem('tw_stock_obs_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('tw_stock_obs_market', JSON.stringify(market));
  }, [market]);

  // Simulation loop
  useEffect(() => {
    if (market.simulationSpeed === 'paused' || stocks.length === 0) return;

    const intervalTime = market.simulationSpeed === 'fast' ? 300 : 1500;

    const interval = setInterval(() => {
      // 1. Select 2-5 random stocks to fluctuate this tick
      const stocksToTickCount = Math.floor(Math.random() * 4) + 2;
      const shuffledIndices = Array.from({ length: stocks.length }, (_, i) => i)
        .sort(() => Math.random() - 0.5);
      
      const indicesToTick = shuffledIndices.slice(0, stocksToTickCount);

      setStocks(prevStocks => {
        const nextStocks = [...prevStocks];
        const triggeredAlertsThisTick: AlertLog[] = [];

        indicesToTick.forEach(idx => {
          const oldStock = prevStocks[idx];
          const newStock = tickStockPrice(oldStock, marketBias);
          nextStocks[idx] = newStock;

          // 2. Scan Alert Rules for this modified stock
          const stockRules = rules.filter(r => r.stockId === newStock.id && r.isActive);
          stockRules.forEach(rule => {
            const isTriggered = evaluateRule(rule, oldStock, newStock);
            if (isTriggered) {
              const currentValue = getIndicatorValue(newStock, rule.indicator);
              const logEntry: AlertLog = {
                id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                stockId: newStock.id,
                stockName: newStock.name,
                indicator: rule.indicator,
                condition: rule.condition,
                triggerValue: rule.value,
                currentValue: Number(currentValue.toFixed(2)),
                timestamp: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
                isRead: false
              };
              triggeredAlertsThisTick.push(logEntry);
            }
          });
        });

        // Handle alerts triggered in this tick sequentially (avoid overlapping audio)
        if (triggeredAlertsThisTick.length > 0) {
          setLogs(prevLogs => [triggeredAlertsThisTick[0], ...prevLogs]);
          
          const alertType = triggeredAlertsThisTick[0].condition === 'gt' || triggeredAlertsThisTick[0].condition === 'cross_up' ? 'buy' : 'sell';
          
          // Sound chime
          playAlertSound(alertType);

          // Browser Push Notification
          const triggerLabel = triggeredAlertsThisTick[0].condition === 'gt' || triggeredAlertsThisTick[0].condition === 'cross_up' ? '向上突破' : '跌破';
          const notificationBody = `台股警報: ${triggeredAlertsThisTick[0].stockName}(${triggeredAlertsThisTick[0].stockId}) 已${triggerLabel}設定值！當前數值: ${triggeredAlertsThisTick[0].currentValue}`;
          triggerBrowserNotification(`台灣股市觀察警示`, notificationBody);

          // On screen flash toast
          setToast({
            id: triggeredAlertsThisTick[0].id,
            message: `${triggeredAlertsThisTick[0].stockName} (${triggeredAlertsThisTick[0].stockId}) 觸發指標警示！`,
            type: alertType
          });
        }

        const stocksForCalculation = nextStocks.map(s => ({ id: s.id, price: s.price, change: s.change }));
        return nextStocks.map(s => updateEtfDetails(s, stocksForCalculation));
      });

      // 3. Correlate TAIEX index points to general stock movements (especially heavy weights)
      setMarket(prevMarket => {
        // Simple weighted calculation mimicking actual indices
        // TSMC (2330) weight: 30%, Foxconn (2317) weight: 12%, other average percent change: 58%
        const tsmcStock = stocks.find(s => s.id === '2330');
        const foxconnStock = stocks.find(s => s.id === '2317');
        
        let tsmcChange = tsmcStock ? tsmcStock.change : 0;
        let foxconnChange = foxconnStock ? foxconnStock.change : 0;
        
        // Sum up rest of percent change
        const restStocks = stocks.filter(s => s.id !== '2330' && s.id !== '2317');
        const restAvgChange = restStocks.reduce((acc, s) => acc + s.change, 0) / (restStocks.length || 1);

        const compositeChangePercent = (tsmcChange * 0.3) + (foxconnChange * 0.12) + (restAvgChange * 0.58) + (marketBias * 0.05);
        const changePoints = prevMarket.index * (compositeChangePercent / 100);
        const nextIndex = prevMarket.index + changePoints;

        return {
          ...prevMarket,
          index: Number(nextIndex.toFixed(1)),
          change: Number(changePoints.toFixed(1)),
          changePercent: Number(compositeChangePercent.toFixed(2)),
          volume: prevMarket.volume + Math.round((Math.random() * 40 - 20))
        };
      });

    }, intervalTime);

    return () => clearInterval(interval);
  }, [stocks, rules, market.simulationSpeed, marketBias]);

  // Clean toast after timeout
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Helper to evaluate indicators thresholds
  const evaluateRule = (rule: AlertRule, oldStock: Stock, newStock: Stock): boolean => {
    const oldValue = getIndicatorValue(oldStock, rule.indicator);
    const newValue = getIndicatorValue(newStock, rule.indicator);

    switch (rule.condition) {
      case 'gt':
        return oldValue <= rule.value && newValue > rule.value;
      case 'lt':
        return oldValue >= rule.value && newValue < rule.value;
      case 'cross_up':
        // Crossovers evaluate binary indicators or golden cross formulas
        if (rule.indicator === 'macd_cross') {
          // DIF crossovers DEM from below
          const oldDif = oldStock.indicators.macd.dif;
          const oldDem = oldStock.indicators.macd.dem;
          const newDif = newStock.indicators.macd.dif;
          const newDem = newStock.indicators.macd.dem;
          return oldDif <= oldDem && newDif > newDem;
        }
        if (rule.indicator === 'kd_cross') {
          // K crossovers D from below
          const oldK = oldStock.indicators.kd.k;
          const oldD = oldStock.indicators.kd.d;
          const newK = newStock.indicators.kd.k;
          const newD = newStock.indicators.kd.d;
          return oldK <= oldD && newK > newD;
        }
        if (rule.indicator === 'ma_cross') {
          // 5MA crossovers 20MA from below
          const old5 = oldStock.indicators.ma.ma5;
          const old20 = oldStock.indicators.ma.ma20;
          const new5 = newStock.indicators.ma.ma5;
          const new20 = newStock.indicators.ma.ma20;
          return old5 <= old20 && new5 > new20;
        }
        return false;

      case 'cross_down':
        if (rule.indicator === 'macd_cross') {
          // DIF crosses below DEM
          const oldDif = oldStock.indicators.macd.dif;
          const oldDem = oldStock.indicators.macd.dem;
          const newDif = newStock.indicators.macd.dif;
          const newDem = newStock.indicators.macd.dem;
          return oldDif >= oldDem && newDif < newDem;
        }
        if (rule.indicator === 'kd_cross') {
          // K crosses below D
          const oldK = oldStock.indicators.kd.k;
          const oldD = oldStock.indicators.kd.d;
          const newK = newStock.indicators.kd.k;
          const newD = newStock.indicators.kd.d;
          return oldK >= oldD && newK < newD;
        }
        if (rule.indicator === 'ma_cross') {
          // 5MA crosses below 20MA
          const old5 = oldStock.indicators.ma.ma5;
          const old20 = oldStock.indicators.ma.ma20;
          const new5 = newStock.indicators.ma.ma5;
          const new20 = newStock.indicators.ma.ma20;
          return old5 >= old20 && new5 < new20;
        }
        return false;
    }
  };

  const getIndicatorValue = (stock: Stock, type: IndicatorType): number => {
    switch (type) {
      case 'price': return stock.price;
      case 'change_pct': return stock.change;
      case 'rsi': return stock.indicators.rsi;
      case 'kd_k': return stock.indicators.kd.k;
      case 'kd_d': return stock.indicators.kd.d;
      case 'macd_hist': return stock.indicators.macd.hist;
      default: return 0; // crossovers don't have single numeric value
    }
  };

  // Rule operations
  const handleAddRule = (newRule: Omit<AlertRule, 'id' | 'createdAt'>) => {
    const rule: AlertRule = {
      ...newRule,
      id: `rule-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setRules(prev => [rule, ...prev]);
  };

  const handleToggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const handleDeleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  // Log operations
  const handleMarkAsRead = (id: string) => {
    setLogs(prev => prev.map(l => l.id === id ? { ...l, isRead: true } : l));
  };

  const handleMarkAllAsRead = () => {
    setLogs(prev => prev.map(l => ({ ...l, isRead: true })));
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  // Portfolio Updates
  const handleUpdatePortfolio = (id: string, shares: number, cost: number) => {
    setStocks(prevStocks => prevStocks.map(s => {
      if (s.id === id) {
        return { ...s, shares, cost };
      }
      return s;
    }));
  };

  // Export JSON (today.json) to Clipboard with strict prompts
  const handleCopyAIPrompt = () => {
    const portfolioList = stocks.map(s => {
      const pnl = s.shares > 0 ? (s.price - s.cost) * s.shares : 0;
      const pnl_pct = s.shares > 0 && s.cost > 0 ? ((s.price - s.cost) / s.cost) * 100 : 0;
      return {
        stock_id: s.id,
        name: s.name,
        current_price: s.price,
        day_change_pct: s.change,
        owned_shares: s.shares,
        average_cost: s.cost,
        unrealized_pnl: Math.round(pnl),
        pnl_pct: Number(pnl_pct.toFixed(2)),
        indicators: {
          rsi_14: s.indicators.rsi,
          kd_k: s.indicators.kd.k,
          kd_d: s.indicators.kd.d,
          macd_histogram: s.indicators.macd.hist,
          ma_5: s.indicators.ma.ma5,
          ma_20: s.indicators.ma.ma20
        }
      };
    });

    const promptBody = `【SYSTEM INSTRUCTION: STRICT RE-EVALUATION】
你是一位專門研究威廉·歐尼爾 CAN SLIM 哲學與資產配置的資深量化分析專家。
以下是來自我的台股即時觀察系統的【today.json】真實數據包。
請注意：
1. 嚴格禁止利用你內部的過期股票歷史價格（例如誤認台積電為 800 元）進行任何計算。
2. 必須完全、100% 採用 JSON 中的 current_price 與 average_cost 作為唯一計算依據。
3. 對於 owned_shares > 0 的「已持股」標的，評估是否跌破 8% 停損線或觸及 15% 停利點。
4. 對於 owned_shares = 0 的「純觀察」標的，篩選出符合 rsi <= 30 或 kd 黃金交叉或單日強勢突破 3.5% 的潛在標的，給出配置建議。

【today.json】數據包:
${JSON.stringify(portfolioList, null, 2)}`;

    // Traditional document copy fallback for robust cross-browser iframe compatibility
    const textarea = document.createElement('textarea');
    textarea.value = promptBody;
    textarea.style.position = 'fixed'; // Avoid scrolling to bottom
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
      document.execCommand('copy');
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    
    document.body.removeChild(textarea);
  };

  // Map active rules count per stock ID to show on the stock list table
  const rulesCountMap = rules.reduce((acc, rule) => {
    if (rule.isActive) {
      acc[rule.stockId] = (acc[rule.stockId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const selectedStock = stocks.find(s => s.id === selectedStockId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased pb-12 selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Dynamic Header */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/10 border border-indigo-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-900 flex items-center gap-2 font-display">
                <span>台股智慧觀察與即時警示系統</span>
                <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded font-black font-mono">
                  PRO v2.0
                </span>
              </h1>
              <p className="text-[10px] text-slate-500 mt-0.5">整合 KD, RSI, MACD 量能與 CAN SLIM 多空突破雷達</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Yahoo Finance Status Indicator */}
            <div className="hidden md:flex flex-col items-end text-right">
              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                <span className={`h-1.5 w-1.5 rounded-full ${syncSource.includes('Yahoo') || syncSource.includes('Fugle') ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-slate-500">數據來源: </span>
                <span className={syncSource.includes('Yahoo') || syncSource.includes('Fugle') ? 'text-emerald-600 font-black' : 'text-amber-600 font-black'}>{syncSource}</span>
              </div>
              {lastSyncTime && (
                <span className="text-[9px] text-slate-400 font-mono mt-0.5">最後更新: {lastSyncTime}</span>
              )}
            </div>

            {/* Sync Button */}
            <button
              onClick={() => syncFuglePrices()}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer shadow-sm ${
                isSyncing 
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-150 active:scale-95'
              }`}
              title="與 Yahoo Finance 同步全球指數與即時股價"
            >
              <Activity className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-500' : 'text-indigo-600'}`} />
              <span>{isSyncing ? '同步中...' : '更新報價'}</span>
            </button>

            {/* Notification Drawer */}
            <NotificationCenter
              logs={logs}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
              onClearLogs={handleClearLogs}
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-col gap-6 w-full">
        
        {/* Floating Real-time Toast Overlay */}
        {toast && (
          <div className="fixed top-20 right-4 z-50 max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-xl flex items-start gap-3 animate-slide-in">
            <div className={`p-2 rounded-xl border ${
              toast.type === 'buy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
            }`}>
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-slate-900">指標警報觸發！</h4>
              <p className="text-[11px] text-slate-600 mt-1">{toast.message}</p>
              <p className="text-[9px] text-slate-400 mt-1">音效已響起，已紀錄至警報日誌。</p>
            </div>
          </div>
        )}

        {/* Global Market Indices Dashboard */}
        <section id="global-indices-sec" className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider font-display flex items-center gap-1.5">
                <span>全球核心市場指數觀察站</span>
                <span className="text-[10px] text-slate-400 font-normal normal-case font-mono">Global Market Indices</span>
              </h2>
            </div>
            <div className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg font-black font-mono">
              Yahoo Finance 實時連線
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {['^TWII', '^GSPC', '^IXIC', '^SOX', '^DJI'].map((symbol) => {
              const indexData = globalIndices[symbol];
              
              const displayName = symbol === '^TWII' ? '台灣加權指數' :
                                  symbol === '^GSPC' ? '美股標普 500' :
                                  symbol === '^IXIC' ? '美股那斯達克' :
                                  symbol === '^SOX' ? '美股費城半導體' : '美股道瓊工業';
              
              const price = indexData ? indexData.price : (
                symbol === '^TWII' ? market.index : 
                symbol === '^GSPC' ? 5430.2 : 
                symbol === '^IXIC' ? 17520.1 : 
                symbol === '^SOX' ? 5210.8 : 39850.4
              );
              
              const change = indexData ? indexData.change : (
                symbol === '^TWII' ? market.change : 0
              );
              
              const changePercent = indexData ? indexData.changePercent : (
                symbol === '^TWII' ? market.changePercent : 0
              );
              
              const isUp = changePercent >= 0;
              
              return (
                <div key={symbol} className="bg-slate-50 border border-slate-150 rounded-xl p-3 hover:bg-white hover:border-slate-300 transition-all shadow-sm group">
                  <div className="flex items-center justify-between text-[10px] font-black text-slate-400 font-display">
                    <span>{displayName}</span>
                    <span className="font-mono text-[9px] opacity-60">{symbol}</span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-sm font-black text-slate-900 font-mono tracking-tight">
                      {price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-[10px] font-mono font-black flex items-center ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isUp ? '▲' : '▼'} {Math.abs(changePercent).toFixed(2)}%
                    </span>
                  </div>
                  <div className={`text-[9px] font-mono mt-0.5 flex justify-end ${isUp ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                    {isUp ? '+' : ''}{change.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Portfolio Stats Section */}
        <section id="portfolio-stats-sec">
          <PortfolioStats
            stocks={stocks}
            market={market}
            onToggleSimulation={() => {}}
            onSetSpeed={(speed) => setMarket(m => ({ ...m, simulationSpeed: speed }))}
            onSetMarketBias={setMarketBias}
            marketBias={marketBias}
            onCopyAIPrompt={handleCopyAIPrompt}
            isCopied={isCopied}
          />
        </section>

        {/* Dynamic CAN SLIM Multi-Period Report Generator */}
        <section id="report-generator-sec">
          <ReportGenerator
            stocks={stocks}
            market={market}
          />
        </section>

        {/* Horizontal Row: Stock List (2/3 width) & Selected Stock Details (1/3 width) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch w-full animate-fade-in">
          {/* Left Column: Stock observation radar (2/3 -> col-span-2) */}
          <div className="lg:col-span-2 flex flex-col h-full">
            {stocks.length > 0 ? (
              <StockList
                stocks={stocks}
                selectedStockId={selectedStockId}
                onSelectStock={setSelectedStockId}
                rulesCountMap={rulesCountMap}
              />
            ) : (
              <div className="h-64 flex items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-slate-400 text-sm">數據初始化中，請稍候...</span>
              </div>
            )}
          </div>
          
          {/* Right Column: Selected Stock Detailed Mini-View (1/3 -> col-span-1) */}
          <div className="lg:col-span-1 flex flex-col h-full">
            {selectedStock ? (
              <StockDetailSidebar
                stock={selectedStock}
                stocks={stocks}
                onUpdatePortfolio={handleUpdatePortfolio}
              />
            ) : (
              <div className="h-full min-h-[300px] flex items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
                <span className="text-slate-400 text-sm font-bold">請點選左側股票以檢視走勢與指標診斷</span>
              </div>
            )}
          </div>
        </section>

        {/* Indicators Alert Configuration Section (Moved to bottom) */}
        <section id="alert-settings-sec" className="w-full">
          <AlertManager
            stocks={stocks}
            rules={rules}
            onAddRule={handleAddRule}
            onToggleRule={handleToggleRule}
            onDeleteRule={handleDeleteRule}
          />
        </section>

        {/* Informative Disclaimer Banner */}
        <footer className="text-center py-6 text-[10px] text-slate-500 border-t border-slate-200 mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 台灣股票即時觀察警報系統. 所有數值與計算皆為技術指標模擬推演，非投資建議。</p>
          <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            <Info className="w-3 h-3 text-indigo-500" />
            <span>內建 Web Audio API 音效與 HTML5 桌面推播引擎，高相容免安裝</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
