/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { getInitialStockData, tickStockPrice, computeIndicators, updateEtfDetails, generateHistoricalCandles } from './utils/stockUtils';
import { Stock, Candle, AlertRule, AlertLog, MarketState, IndicatorType, AlertCondition, GlobalIndex } from './types';
import PortfolioStats from './components/PortfolioStats';
import StockList from './components/StockList';
import StockDetailSidebar from './components/StockDetailSidebar';
import AlertManager from './components/AlertManager';
import ReportGenerator from './components/ReportGenerator';
import NotificationCenter, { playAlertSound, triggerBrowserNotification } from './components/NotificationCenter';
import { Sparkles, TrendingUp, TrendingDown, ArrowUpRight, Zap, Bell, Check, Info, Activity, LayoutDashboard, Briefcase, Trash2, Edit3, Save, Search, Plus, X, ChevronRight, CheckCircle2, RotateCcw } from 'lucide-react';
import EtfAnalysis from './components/EtfAnalysis';
import { TAIWAN_STOCKS_DATABASE, searchTaiwanStocks } from './data/taiwanStocks';

import { generateV32MasterPromptWithJson } from './utils/aiDecisionEngine';

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

  const syncStockPrices = async (currentStocksList?: Stock[]) => {
    setIsSyncing(true);
    try {
      const activeList = currentStocksList || stocks;
      const symbolsQuery = activeList.map(s => s.id).filter(Boolean).join(',');
      const res = await fetch(`/api/stocks${symbolsQuery ? `?symbols=${encodeURIComponent(symbolsQuery)}` : ''}`);
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
                } else {
                  updatedCandles = generateHistoricalCandles(newPrice, 30);
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
      const storedCustomNames = localStorage.getItem('tw_stock_custom_names');
      const customNamesMap: Record<string, string> = storedCustomNames ? JSON.parse(storedCustomNames) : {};

      let initialStocks: Stock[] = storedStocks ? JSON.parse(storedStocks) : getInitialStockData();

      // Ensure 00927 (群益半導體收益) is present
      const has00927 = initialStocks.some(s => s.id === '00927');
      if (!has00927) {
        const defaultList = getInitialStockData();
        const def00927 = defaultList.find(s => s.id === '00927');
        if (def00927) {
          initialStocks.push(def00927);
        }
      }

      // Auto-correct any "台股 00927" or "00927" without proper name to "群益半導體收益"
      // Also apply custom names overrides and lookup names in TAIWAN_STOCKS_DATABASE
      initialStocks = initialStocks.map(s => {
        let name = s.name;
        let customName = s.customName;

        if (customNamesMap[s.id]) {
          name = customNamesMap[s.id];
          customName = customNamesMap[s.id];
        } else if (s.id === '00927' && (!name || name === '台股 00927' || name === '00927')) {
          name = '群益半導體收益';
        } else if (name.startsWith('台股 ')) {
          const match = TAIWAN_STOCKS_DATABASE.find(item => item.id.toUpperCase() === s.id.toUpperCase());
          if (match) {
            name = match.name;
          }
        }

        return { ...s, name, customName };
      });

      setStocks(initialStocks);

      let initialRules: AlertRule[] = storedRules ? JSON.parse(storedRules) : defaultRules(initialStocks);
      initialRules = initialRules.map(r => {
        const matchedStock = initialStocks.find(s => s.id === r.stockId);
        if (matchedStock && matchedStock.name) {
          return { ...r, stockName: matchedStock.name };
        }
        return r;
      });
      setRules(initialRules);

      const initialLogs = storedLogs ? JSON.parse(storedLogs) : [];
      setLogs(initialLogs);

      if (storedMarket) {
        setMarket(JSON.parse(storedMarket));
      }

      // Sync live stock quotes on initial load
      syncStockPrices(initialStocks);
    } catch (e) {
      console.warn('Failed to parse local storage, loading defaults:', e);
      const initialStocks = getInitialStockData();
      setStocks(initialStocks);
      setRules(defaultRules(initialStocks));
      syncStockPrices(initialStocks);
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

  // Export JSON (today.json) to Clipboard with strict v3.2 prompts
  const handleCopyAIPrompt = () => {
    const promptBody = generateV32MasterPromptWithJson(stocks, market, globalIndices);

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

  const [currentView, setCurrentView] = useState<'dashboard' | 'inventory' | 'etf'>('dashboard');

  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editShares, setEditShares] = useState<number>(0);
  const [editCost, setEditCost] = useState<number>(0);

  // Enhanced Inventory Holding Input & Auto-matching state
  const [invInputMode, setInvInputMode] = useState<'input' | 'select'>('input');
  const [invInputQuery, setInvInputQuery] = useState('');
  const [invMatchedInfo, setInvMatchedInfo] = useState<{ id: string; name: string; price: number; category?: string; market?: string } | null>(null);
  const [isSearchingInvOnline, setIsSearchingInvOnline] = useState(false);
  const [invSelectId, setInvSelectId] = useState('');
  const [invShares, setInvShares] = useState('');
  const [invCost, setInvCost] = useState('');
  const [isSubmittingInventory, setIsSubmittingInventory] = useState(false);
  const [invDropdownOpen, setInvDropdownOpen] = useState(false);
  const [lastAddedHolding, setLastAddedHolding] = useState<{ id: string; name: string; shares: number; cost: number } | null>(null);

  // Auto-match stock code or name when typing in inventory holding adder
  useEffect(() => {
    const q = invInputQuery.trim();
    if (!q) {
      setInvMatchedInfo(null);
      setIsSearchingInvOnline(false);
      return;
    }

    // Support inputs like "3293鈊象", "3293 鈊象", "3293", "鈊象", or "00927"
    const codeMatch = q.match(/^([0-9A-Za-z.]+)\s*(.*)$/);
    const parsedCode = codeMatch ? codeMatch[1].toUpperCase() : '';
    const parsedName = codeMatch && codeMatch[2] ? codeMatch[2].trim() : '';

    // 1. Check if already in stocks
    const inStocks = stocks.find(s => 
      (parsedCode && s.id.toUpperCase() === parsedCode) ||
      s.id.toUpperCase() === q.toUpperCase() ||
      s.name === q ||
      (parsedName && s.name === parsedName)
    );
    if (inStocks) {
      setInvMatchedInfo({
        id: inStocks.id,
        name: inStocks.name,
        price: inStocks.price,
        category: inStocks.etfDetails?.category || '個股',
        market: inStocks.etfDetails ? 'ETF' : '台股'
      });
      if (!invCost || invCost === '0') {
        setInvCost(inStocks.cost > 0 ? inStocks.cost.toString() : inStocks.price.toString());
      }
      return;
    }

    // 2. Check in local TAIWAN_STOCKS_DATABASE
    const localMatch = TAIWAN_STOCKS_DATABASE.find(s => 
      (parsedCode && s.id.toUpperCase() === parsedCode) ||
      s.id.toUpperCase() === q.toUpperCase() ||
      s.name === q ||
      (parsedName && s.name === parsedName) ||
      s.name.includes(q)
    );
    if (localMatch) {
      const defPrice = localMatch.id === '3293' ? 801.0 : (localMatch.id === '2330' ? 2430.0 : 100.0);
      setInvMatchedInfo({
        id: localMatch.id,
        name: localMatch.name,
        price: defPrice,
        category: localMatch.category,
        market: localMatch.market
      });
      if (!invCost || invCost === '0') {
        setInvCost(defPrice.toString());
      }

      // Fetch live info to update exact price in background
      fetch(`/api/stock/${encodeURIComponent(localMatch.id)}/info`)
        .then(res => res.json())
        .then(data => {
          if (data && data.success && data.price > 0) {
            setInvMatchedInfo(prev => (prev && prev.id === localMatch.id ? { ...prev, price: data.price } : prev));
          }
        })
        .catch(() => {});
      return;
    }

    // 3. If code format (>= 3 chars), fetch from online API with debounce
    const targetLookup = parsedCode || q.toUpperCase();
    if (/^[A-Z0-9.]+$/i.test(targetLookup) && targetLookup.length >= 3) {
      let isMounted = true;
      setIsSearchingInvOnline(true);
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/stock/${encodeURIComponent(targetLookup)}/info`);
          if (res.ok && isMounted) {
            const data = await res.json();
            if (data.success && data.name && !data.name.startsWith('台股 ')) {
              setInvMatchedInfo({
                id: targetLookup,
                name: data.name,
                price: data.price || 100,
                category: data.isEtf ? 'ETF' : '個股',
                market: data.market
              });
              if (!invCost || invCost === '0') {
                setInvCost((data.price || 100).toString());
              }
            } else {
              setInvMatchedInfo(null);
            }
          }
        } catch (e) {
          // ignore
        } finally {
          if (isMounted) setIsSearchingInvOnline(false);
        }
      }, 250);

      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    } else {
      setInvMatchedInfo(null);
    }
  }, [invInputQuery, stocks]);

  // Handle adding new inventory holding position with auto-matching and real historical candles
  const handleAddNewInventoryHolding = async (idOrQuery: string, shares: number, cost: number, customName?: string) => {
    const rawTrimmed = idOrQuery.trim();
    if (!rawTrimmed || shares <= 0 || cost < 0) return;

    // Parse code prefix e.g. "3293鈊象" or "3293 鈊象" or "3293"
    const codeMatch = rawTrimmed.match(/^([0-9A-Za-z.]+)/);
    const parsedCode = codeMatch ? codeMatch[1].toUpperCase() : '';

    // Check match in database
    const localMatch = TAIWAN_STOCKS_DATABASE.find(s => 
      (parsedCode && s.id.toUpperCase() === parsedCode) ||
      s.id.toUpperCase() === rawTrimmed.toUpperCase() ||
      s.name === rawTrimmed
    );

    const stockId = localMatch ? localMatch.id : (parsedCode || rawTrimmed.toUpperCase());

    // 1. Check if stock already exists in stocks
    const existing = stocks.find(s => s.id === stockId || s.name === rawTrimmed);
    if (existing) {
      handleUpdatePortfolio(existing.id, shares, cost);
      const updated = stocks.map(s => s.id === existing.id ? { ...s, isObserved: true, shares, cost } : s);
      setStocks(updated);
      try {
        localStorage.setItem('tw_stock_obs_stocks', JSON.stringify(updated));
      } catch (e) {}
      setSelectedStockId(existing.id);
      setLastAddedHolding({
        id: existing.id,
        name: existing.name,
        shares,
        cost
      });
      setToast({
        id: `toast-${Date.now()}`,
        message: `🎉 成功更新持股：${existing.name} (${existing.id})，今餘股數: ${shares.toLocaleString()} 股，均價: NT$ ${cost}！儀表板已同步更新！`,
        type: 'buy'
      });
      syncStockPrices(updated);
      return;
    }

    // 2. New stock! Resolve real name, price and category
    let targetName = customName?.trim() || localMatch?.name || '';
    let category: string | undefined = localMatch ? (localMatch.market === 'ETF' ? localMatch.category : undefined) : undefined;
    let realPrice = localMatch?.id === '3293' ? 801.0 : (cost > 0 ? cost : 100);

    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(stockId)}/info`);
      if (res.ok) {
        const info = await res.json();
        if (info.success) {
          if (info.name && !info.name.startsWith('台股 ')) targetName = info.name;
          if (info.price && info.price > 0) realPrice = info.price;
          if (info.isEtf) category = 'ETF';
        }
      }
    } catch (e) {
      // ignore
    }

    if (!targetName) {
      targetName = stockId === '3293' ? '鈊象' : `台股 ${stockId}`;
    }

    // 3. Fetch real history / candles
    let realCandles: Candle[] = [];
    try {
      const histRes = await fetch(`/api/stock/${encodeURIComponent(stockId)}/history`);
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.success && histData.candles && histData.candles.length > 0) {
          realCandles = histData.candles;
        }
      }
    } catch (e) {
      console.warn('History API fetch error:', e);
    }

    let basePrice = realPrice > 0 ? realPrice : (cost > 0 ? cost : (stockId === '3293' ? 801 : 100));
    let candleHistory: Candle[] = [];

    if (realCandles.length > 0) {
      candleHistory = realCandles;
      basePrice = candleHistory[candleHistory.length - 1].close;
    } else {
      candleHistory = generateHistoricalCandles(basePrice, 35);
    }

    const prevClose = candleHistory.length > 1 ? candleHistory[candleHistory.length - 2].close : basePrice;
    const latestPrice = candleHistory[candleHistory.length - 1].close;
    const changePct = prevClose > 0 ? Number((((latestPrice - prevClose) / prevClose) * 100).toFixed(2)) : 0;

    const newStock: Stock = {
      id: stockId,
      name: targetName,
      price: latestPrice,
      change: changePct,
      prevClose,
      volume: candleHistory[candleHistory.length - 1].volume || 25000,
      shares,
      cost,
      isObserved: true,
      history: candleHistory.map(c => c.close),
      candleHistory,
      indicators: computeIndicators(candleHistory)
    };

    let finalStock = updateEtfDetails(newStock, [newStock, ...stocks]);
    const updatedStocks = [finalStock, ...stocks];
    setStocks(updatedStocks);
    try {
      localStorage.setItem('tw_stock_obs_stocks', JSON.stringify(updatedStocks));
    } catch (e) {}
    setSelectedStockId(stockId);
    setLastAddedHolding({
      id: stockId,
      name: targetName,
      shares,
      cost
    });

    setToast({
      id: `toast-${Date.now()}`,
      message: `🎉 成功新增持股「${targetName} (${stockId})」！儀表板已同步自動增加該股票的走勢圖、CAN SLIM 突破與各項指標診斷！`,
      type: 'buy'
    });

    syncStockPrices(updatedStocks);
  };

  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = invInputMode === 'select'
      ? invSelectId
      : (invMatchedInfo?.id || invInputQuery.trim());
    const targetName = invMatchedInfo?.name || '';
    const sharesNum = Number(invShares);
    const costNum = Number(invCost);

    if (!targetId || sharesNum <= 0 || costNum < 0) {
      setToast({
        id: `toast-${Date.now()}`,
        message: `請輸入有效之股票代號、股數與每股平均成本！`,
        type: 'neutral'
      });
      return;
    }

    setIsSubmittingInventory(true);
    try {
      await handleAddNewInventoryHolding(targetId, sharesNum, costNum, targetName);
      setInvInputQuery('');
      setInvMatchedInfo(null);
      setInvSelectId('');
      setInvShares('');
      setInvCost('');
      setInvDropdownOpen(false);
    } finally {
      setIsSubmittingInventory(false);
    }
  };

  const handleAddStock = async (id: string, name: string, category?: string) => {
    const cleanId = id.trim().toUpperCase();
    const cleanName = name.trim();

    // If the stock is already in our list, mark isObserved: true
    const existing = stocks.find(s => s.id === cleanId);
    if (existing) {
      const updatedStocks = stocks.map(s => {
        if (s.id === cleanId) {
          let updated = { ...s, isObserved: true };
          if (cleanName && !cleanName.startsWith('台股 ') && cleanName !== s.name) {
            updated.name = cleanName;
          }
          if (!updated.etfDetails) {
            updated = updateEtfDetails(updated, stocks);
          }
          if (category && updated.etfDetails) {
            updated.etfDetails.category = category;
          }
          return updated;
        }
        return s;
      });
      setStocks(updatedStocks);
      setToast({
        id: `toast-${Date.now()}`,
        message: `股票 ${cleanName} (${cleanId}) 已加入觀察清單！`,
        type: 'neutral'
      });
      syncStockPrices(updatedStocks);
      return;
    }

    // Try fetching real history from Yahoo Finance API via server
    let realCandles: Candle[] = [];
    try {
      const histRes = await fetch(`/api/stock/${cleanId}/history`);
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.success && histData.candles && histData.candles.length > 0) {
          realCandles = histData.candles;
        }
      }
    } catch (e) {
      console.warn('History API fetch error:', e);
    }

    let basePrice = 100;
    let candleHistory: Candle[] = [];

    if (realCandles.length > 0) {
      candleHistory = realCandles;
      basePrice = candleHistory[candleHistory.length - 1].close;
    } else {
      basePrice = 50 + Math.random() * 600;
      candleHistory = generateHistoricalCandles(basePrice, 30);
    }

    const prevClose = candleHistory.length > 1 ? candleHistory[candleHistory.length - 2].close : basePrice;
    const latestPrice = candleHistory[candleHistory.length - 1].close;
    const changePct = prevClose > 0 ? Number((((latestPrice - prevClose) / prevClose) * 100).toFixed(2)) : 0;

    const newStock: Stock = {
      id: cleanId,
      name: cleanName,
      price: latestPrice,
      change: changePct,
      prevClose,
      volume: candleHistory[candleHistory.length - 1].volume || 25000,
      shares: 0,
      cost: 0,
      isObserved: true,
      history: candleHistory.map(c => c.close),
      candleHistory,
      indicators: computeIndicators(candleHistory)
    };

    let finalStock = updateEtfDetails(newStock, [newStock, ...stocks]);
    if (!finalStock.etfDetails && (category || cleanId.startsWith('00'))) {
      const seed = cleanId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const isHighYield = category ? category === '高股息' : seed % 2 === 0;
      finalStock.etfDetails = {
        category: category || (isHighYield ? '高股息' : '市值型'),
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
        ],
        estimatedNav: latestPrice,
        discountPremium: 0
      };
    } else if (category && finalStock.etfDetails) {
      finalStock.etfDetails.category = category;
    }

    const updatedStocks = [finalStock, ...stocks];
    setStocks(updatedStocks);
    setSelectedStockId(cleanId);
    setToast({
      id: `toast-${Date.now()}`,
      message: `已新增股票/ETF ${cleanName} (${cleanId}) 至觀察清單！`,
      type: 'neutral'
    });

    syncStockPrices(updatedStocks);
  };

  const handleRemoveStock = (id: string) => {
    setStocks(prev => prev.map(s => s.id === id ? { ...s, isObserved: false } : s));
    setToast({
      id: `toast-${Date.now()}`,
      message: `股票已從觀察清單中移除。`,
      type: 'neutral'
    });
    if (selectedStockId === id) {
      const remaining = stocks.filter(s => s.id !== id && s.isObserved !== false);
      if (remaining.length > 0) {
        setSelectedStockId(remaining[0].id);
      }
    }
  };

  const handleToggleWatch = (id: string) => {
    setStocks(prev => prev.map(s => s.id === id ? { ...s, isObserved: s.isObserved !== false ? false : true } : s));
    setToast({
      id: `toast-${Date.now()}`,
      message: `已更新觀察狀態！`,
      type: 'neutral'
    });
  };

  const handleUpdateStockName = (id: string, newName: string) => {
    const cleanId = id.trim().toUpperCase();
    const cleanName = newName.trim();
    if (!cleanName) return;

    try {
      const stored = localStorage.getItem('tw_stock_custom_names');
      const customNamesMap: Record<string, string> = stored ? JSON.parse(stored) : {};
      customNamesMap[cleanId] = cleanName;
      localStorage.setItem('tw_stock_custom_names', JSON.stringify(customNamesMap));
    } catch (e) {
      console.warn('Failed to save custom name to localStorage:', e);
    }

    setStocks(prev => prev.map(s => {
      if (s.id === cleanId) {
        return { ...s, name: cleanName, customName: cleanName };
      }
      return s;
    }));

    setRules(prev => prev.map(r => {
      if (r.stockId === cleanId) {
        return { ...r, stockName: cleanName };
      }
      return r;
    }));

    setToast({
      id: `toast-${Date.now()}`,
      message: `已更新代號 ${cleanId} 名稱為「${cleanName}」`,
      type: 'neutral'
    });
  };

  const handleResetStockName = (id: string) => {
    const cleanId = id.trim().toUpperCase();

    try {
      const stored = localStorage.getItem('tw_stock_custom_names');
      if (stored) {
        const customNamesMap: Record<string, string> = JSON.parse(stored);
        delete customNamesMap[cleanId];
        localStorage.setItem('tw_stock_custom_names', JSON.stringify(customNamesMap));
      }
    } catch (e) {
      console.warn('Failed to reset custom name in localStorage:', e);
    }

    const match = TAIWAN_STOCKS_DATABASE.find(s => s.id.toUpperCase() === cleanId);
    const defaultName = match ? match.name : (cleanId === '00927' ? '群益半導體收益' : `台股 ${cleanId}`);

    setStocks(prev => prev.map(s => {
      if (s.id === cleanId) {
        const updated = { ...s, name: defaultName };
        delete updated.customName;
        return updated;
      }
      return s;
    }));

    setRules(prev => prev.map(r => {
      if (r.stockId === cleanId) {
        return { ...r, stockName: defaultName };
      }
      return r;
    }));

    setToast({
      id: `toast-${Date.now()}`,
      message: `已重設代號 ${cleanId} 名稱為預設「${defaultName}」`,
      type: 'neutral'
    });
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
            {/* TWSE / Yahoo Finance Status Indicator */}
            <div className="hidden md:flex flex-col items-end text-right">
              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                <span className={`h-1.5 w-1.5 rounded-full ${syncSource.includes('Yahoo') || syncSource.includes('TWSE') || syncSource.includes('API') ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-slate-500">數據來源: </span>
                <span className={syncSource.includes('Yahoo') || syncSource.includes('TWSE') || syncSource.includes('API') ? 'text-emerald-600 font-black' : 'text-amber-600 font-black'}>{syncSource}</span>
              </div>
              {lastSyncTime && (
                <span className="text-[9px] text-slate-400 font-mono mt-0.5">最後更新: {lastSyncTime}</span>
              )}
            </div>

            {/* Sync Button */}
            <button
              onClick={() => syncStockPrices()}
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

      {/* Navigation Tabs (切換儀表板、庫存股分析、ETF分析三個獨立頁面) */}
      <div className="bg-white border-b border-slate-200 sticky top-[73px] z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-6 sm:space-x-8">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`py-4 px-1 border-b-2 font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
              currentView === 'dashboard'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>1. 儀錶板</span>
          </button>
          <button
            onClick={() => setCurrentView('inventory')}
            className={`py-4 px-1 border-b-2 font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
              currentView === 'inventory'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>2. 庫存股分析工具</span>
          </button>
          <button
            onClick={() => setCurrentView('etf')}
            className={`py-4 px-1 border-b-2 font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
              currentView === 'etf'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>3. ETF 分析工具</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-col gap-6 w-full flex-1">
        
        {/* Floating Real-time Toast Overlay */}
        {toast && (
          <div className="fixed top-20 right-4 z-50 max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-xl flex items-start gap-3 animate-slide-in">
            <div className={`p-2 rounded-xl border ${
              toast.type === 'buy' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
            }`}>
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-slate-900">提示</h4>
              <p className="text-[11px] text-slate-600 mt-1">{toast.message}</p>
            </div>
          </div>
        )}

        {/* ======================================= */}
        {/* VIEW 1: DASHBOARD                      */}
        {/* ======================================= */}
        {currentView === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">
            {/* Global Market Indices Dashboard */}
            <section id="global-indices-sec" className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
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

            {/* Horizontal Row: Stock List (2/3 width) & Selected Stock Details (1/3 width) */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch w-full">
              {/* Left Column: Stock observation radar (2/3 -> col-span-2) */}
              <div className="lg:col-span-2 flex flex-col h-full">
                {stocks.length > 0 ? (
                  <StockList
                    stocks={stocks}
                    selectedStockId={selectedStockId}
                    onSelectStock={setSelectedStockId}
                    rulesCountMap={rulesCountMap}
                    onAddStock={handleAddStock}
                    onRemoveStock={handleRemoveStock}
                    onUpdateStockName={handleUpdateStockName}
                    onResetStockName={handleResetStockName}
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
                    onUpdateStockName={handleUpdateStockName}
                    onResetStockName={handleResetStockName}
                  />
                ) : (
                  <div className="h-full min-h-[300px] flex items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
                    <span className="text-slate-400 text-sm font-bold">請點選左側股票以檢視走勢與指標診斷</span>
                  </div>
                )}
              </div>
            </section>

            {/* Indicators Alert Configuration Section */}
            <section id="alert-settings-sec" className="w-full">
              <AlertManager
                stocks={stocks}
                rules={rules}
                onAddRule={handleAddRule}
                onToggleRule={handleToggleRule}
                onDeleteRule={handleDeleteRule}
              />
            </section>
          </div>
        )}

        {/* ======================================= */}
        {/* VIEW 2: PORTFOLIO INVENTORY             */}
        {/* ======================================= */}
        {currentView === 'inventory' && (
          <div className="space-y-6 animate-fade-in">
            {/* Newly Added Holding Success Banner with Direct Jump to Dashboard */}
            {lastAddedHolding && (
              <div className="bg-gradient-to-r from-indigo-500/10 via-emerald-500/10 to-transparent border border-indigo-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Sparkles className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 flex items-center gap-2">
                      <span>持股新增成功：{lastAddedHolding.name} ({lastAddedHolding.id})</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-mono font-bold">
                        已同步登錄 {lastAddedHolding.shares.toLocaleString()} 股 · 成本 NT$ {lastAddedHolding.cost}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      儀表板已同步自動增加該標的之即時行情、走勢圖、均線/KD/RSI 技術指標與 CAN SLIM 報告！
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setSelectedStockId(lastAddedHolding.id);
                      setCurrentView('dashboard');
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    <span>前往儀表板檢視資訊</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setLastAddedHolding(null)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                    title="關閉提示"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

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
                onNavigateToDashboard={(id) => {
                  setSelectedStockId(id);
                  setCurrentView('dashboard');
                }}
                onSelectStock={(id) => {
                  setSelectedStockId(id);
                  setCurrentView('dashboard');
                }}
              />
            </section>

            {/* 新增庫存持股功能 (可自行輸入股票代碼，如新增3293鈊象，並予以對應) */}
            <section className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-slate-900 text-sm font-display flex items-center gap-2">
                    <Plus className="w-4 h-4 text-indigo-600" />
                    <span>新增庫存持股 / 快速自選登錄</span>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                      支援任意台股代碼與即時自動對應
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    可自行輸入股票代碼 (例如輸入 <span className="font-bold text-indigo-600">3293</span> 或 <span className="font-bold text-indigo-600">3293鈊象</span>)，系統即時自動對應股名、市場與參考市價；確認新增後儀表板將自動增加走勢與技術診斷！
                  </p>
                </div>
                
                {/* 模式切換按鈕 */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setInvInputMode('input');
                      setInvSelectId('');
                    }}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      invInputMode === 'input' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ✏️ 自行輸入代碼
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInvInputMode('select');
                      setInvInputQuery('');
                      setInvMatchedInfo(null);
                    }}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      invInputMode === 'select' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    📋 從現有清單選擇
                  </button>
                </div>
              </div>

              {/* 快捷常用標的標籤 (特別強調 3293 鈊象) */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400 font-bold text-[11px]">快捷填入範例:</span>
                {[
                  { id: '3293', name: '鈊象', price: 801.0, desc: '商用遊戲機/線上博弈 (上櫃)' },
                  { id: '2330', name: '台積電', price: 2430.0, desc: '晶圓代工龍頭' },
                  { id: '2454', name: '聯發科', price: 1450.0, desc: 'IC設計龍頭' },
                  { id: '00927', name: '群益半導體收益', price: 19.5, desc: '半導體高息ETF' },
                  { id: '00919', name: '群益台灣精選高息', price: 25.0, desc: '高股息ETF' },
                  { id: '00878', name: '國泰永續高股息', price: 22.0, desc: '高股息ETF' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setInvInputMode('input');
                      setInvInputQuery(`${item.id} ${item.name}`);
                      setInvCost(item.price.toString());
                      if (!invShares || invShares === '0') setInvShares('1000');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-300 transition-all cursor-pointer font-bold text-slate-700 hover:text-indigo-700 text-[11px]"
                    title={item.desc}
                  >
                    <Plus className="w-3 h-3 text-indigo-600" />
                    <span>{item.id} {item.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">${item.price}</span>
                  </button>
                ))}
              </div>

              {/* Add holding form */}
              <form onSubmit={handleAddInventory} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  
                  {/* Field 1: Stock identifier input or select */}
                  <div className="md:col-span-4 relative">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
                      {invInputMode === 'input' ? '1. 股票代碼或名稱 (如 3293、鈊象)' : '1. 選擇觀察清單中之標的'}
                    </label>

                    {invInputMode === 'input' ? (
                      <div className="relative">
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="輸入代碼或名稱，如 3293 或 3293鈊象..."
                            value={invInputQuery}
                            onChange={(e) => {
                              setInvInputQuery(e.target.value);
                              setInvDropdownOpen(true);
                            }}
                            onFocus={() => setInvDropdownOpen(true)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 pl-9 font-bold text-slate-800 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white shadow-2xs transition-all"
                          />
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                          {invInputQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setInvInputQuery('');
                                setInvMatchedInfo(null);
                                setInvDropdownOpen(false);
                              }}
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Autocomplete Candidate Dropdown */}
                        {invDropdownOpen && invInputQuery.trim().length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                            {searchTaiwanStocks(invInputQuery).slice(0, 8).map(stockItem => (
                              <button
                                key={stockItem.id}
                                type="button"
                                onClick={() => {
                                  setInvInputQuery(`${stockItem.id} ${stockItem.name}`);
                                  setInvDropdownOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2 hover:bg-indigo-50 flex items-center justify-between cursor-pointer transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-indigo-700">{stockItem.id}</span>
                                  <span className="font-bold text-slate-800">{stockItem.name}</span>
                                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {stockItem.market} · {stockItem.category}
                                  </span>
                                </div>
                                <span className="text-[10px] text-indigo-600 font-bold">點擊選取</span>
                              </button>
                            ))}
                            {searchTaiwanStocks(invInputQuery).length === 0 && (
                              <div className="px-3.5 py-3 text-slate-400 text-center text-xs">
                                亦可直接輸入代號「{invInputQuery}」，系統將自動線索配對並抓取報價！
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <select
                        required
                        value={invSelectId}
                        onChange={(e) => {
                          const sid = e.target.value;
                          setInvSelectId(sid);
                          const matched = stocks.find(s => s.id === sid);
                          if (matched) {
                            setInvCost(matched.cost > 0 ? matched.cost.toString() : matched.price.toString());
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 text-xs cursor-pointer focus:outline-none focus:border-indigo-500 focus:bg-white shadow-2xs"
                      >
                        <option value="">選擇現有標的...</option>
                        {stocks.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.id}) · 現價 NT$ {s.price.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Field 2: Shares input */}
                  <div className="md:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                        2. 今餘股數
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {invShares ? `${(Number(invShares) / 1000).toFixed(1)} 張` : '1張 = 1,000股'}
                      </span>
                    </div>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="股數 (如: 1000)"
                      value={invShares}
                      onChange={(e) => setInvShares(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 font-bold font-mono text-slate-800 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white shadow-2xs"
                    />
                  </div>

                  {/* Field 3: Average cost input */}
                  <div className="md:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                        3. 每股平均成本 (NT$)
                      </label>
                      {invMatchedInfo?.price && (
                        <button
                          type="button"
                          onClick={() => setInvCost(invMatchedInfo.price.toString())}
                          className="text-[10px] text-indigo-600 hover:underline cursor-pointer font-bold"
                        >
                          填入參考價 ${invMatchedInfo.price}
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0"
                      placeholder="買進均價"
                      value={invCost}
                      onChange={(e) => setInvCost(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 font-bold font-mono text-slate-800 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white shadow-2xs"
                    />
                  </div>

                  {/* Field 4: Submit button */}
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={isSubmittingInventory}
                      className={`w-full py-2 px-3.5 rounded-xl font-black text-xs transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5 ${
                        isSubmittingInventory
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-98 shadow-indigo-600/10'
                      }`}
                    >
                      {isSubmittingInventory ? (
                        <>
                          <Activity className="w-3.5 h-3.5 animate-spin" />
                          <span>新增中...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>新增持股</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick share buttons row */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold text-slate-500">
                  <span className="text-slate-400">快速股數:</span>
                  {[
                    { label: '1,000股 (1張)', val: '1000' },
                    { label: '2,000股 (2張)', val: '2000' },
                    { label: '5,000股 (5張)', val: '5000' },
                    { label: '10,000股 (10張)', val: '10000' },
                  ].map(btn => (
                    <button
                      key={btn.val}
                      type="button"
                      onClick={() => setInvShares(btn.val)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* Auto-matching Feedback Card (並予以對應) */}
                {invMatchedInfo && (
                  <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-fade-in text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-900">
                            已成功對應標的：
                          </span>
                          <span className="font-mono font-black text-emerald-800 bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                            {invMatchedInfo.id}
                          </span>
                          <span className="font-black text-slate-900 text-sm">
                            {invMatchedInfo.name}
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                            {invMatchedInfo.market || '台股'} · {invMatchedInfo.category || '個股'}
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          即時參考市價: <span className="font-mono font-black">NT$ {invMatchedInfo.price.toFixed(2)}</span>
                          {invShares && invCost && Number(invShares) > 0 && Number(invCost) > 0 && (
                            <span className="ml-2 font-medium">
                              · 預估投入本金: <span className="font-mono font-black text-slate-900">NT$ {(Number(invShares) * Number(invCost)).toLocaleString()}</span> ({(Number(invShares) / 1000).toFixed(1)}張)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="text-[11px] text-emerald-700 font-bold bg-white/70 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>確認後自動連動儀表板即時分析</span>
                    </div>
                  </div>
                )}
              </form>
            </section>

            {/* Portfolio detail list card */}
            <section className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div>
                  <h3 className="font-black text-slate-900 text-sm font-display flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-indigo-600" />
                    <span>庫存持股明細</span>
                  </h3>
                  <p className="text-xs text-slate-500">管理目前持股與平均成本，表頭依序為：今餘股數、現價、平均成本、未實現損益與損益率。</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-4">股名與代號</th>
                      <th className="py-3 px-4">今餘股數</th>
                      <th className="py-3 px-4">現價</th>
                      <th className="py-3 px-4">平均成本</th>
                      <th className="py-3 px-4">未實現損益</th>
                      <th className="py-3 px-4">未實現損益率</th>
                      <th className="py-3 px-4 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocks.filter(s => s.shares > 0).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-medium text-xs">
                          目前無任何庫存持股。請在上方「新增庫存持股」輸入股票代碼 (如 3293 鈊象) 進行新增，或在儀表板點選個股設定持股部位。
                        </td>
                      </tr>
                    ) : (
                      stocks.filter(s => s.shares > 0).map(stock => {
                        const isEditing = editingStockId === stock.id;
                        const pnl = (stock.price - stock.cost) * stock.shares;
                        const pnlPct = stock.cost > 0 ? ((stock.price - stock.cost) / stock.cost) * 100 : 0;

                        return (
                          <tr key={stock.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors text-xs">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{stock.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{stock.id}</div>
                            </td>
                            <td className="py-3 px-4">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editShares}
                                  onChange={(e) => setEditShares(Number(e.target.value))}
                                  className="w-24 px-2 py-1 border border-slate-200 rounded-lg font-bold text-slate-700 font-mono text-xs focus:outline-none focus:border-indigo-500"
                                />
                              ) : (
                                <span className="font-mono font-bold text-slate-800">{stock.shares.toLocaleString()} 股</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-800">
                              NT$ {stock.price.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.1"
                                  value={editCost}
                                  onChange={(e) => setEditCost(Number(e.target.value))}
                                  className="w-24 px-2 py-1 border border-slate-200 rounded-lg font-bold text-slate-700 font-mono text-xs focus:outline-none focus:border-indigo-500"
                                />
                              ) : (
                                <span className="font-bold text-slate-600">NT$ {stock.cost.toFixed(2)}</span>
                              )}
                            </td>
                            <td className={`py-3 px-4 font-mono font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {pnl >= 0 ? '+' : ''}{Math.round(pnl).toLocaleString()}
                            </td>
                            <td className={`py-3 px-4 font-mono font-bold ${pnlPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isEditing ? (
                                <div className="flex justify-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      handleUpdatePortfolio(stock.id, editShares, editCost);
                                      setEditingStockId(null);
                                      setToast({
                                        id: `toast-${Date.now()}`,
                                        message: `已更新 ${stock.name} 庫存持股明細`,
                                        type: 'neutral'
                                      });
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                                  >
                                    <Save className="w-3 h-3" /> 儲存
                                  </button>
                                  <button
                                    onClick={() => setEditingStockId(null)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-center items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setSelectedStockId(stock.id);
                                      setCurrentView('dashboard');
                                    }}
                                    className="text-emerald-700 hover:text-emerald-850 hover:bg-emerald-50 font-bold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 border border-emerald-200"
                                    title="前往儀表板查看即時走勢圖與CAN SLIM指標診斷"
                                  >
                                    <LayoutDashboard className="w-3 h-3" /> 儀表板
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingStockId(stock.id);
                                      setEditShares(stock.shares);
                                      setEditCost(stock.cost);
                                    }}
                                    className="text-indigo-600 hover:text-indigo-850 hover:bg-indigo-50 font-bold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 border border-indigo-100"
                                  >
                                    <Edit3 className="w-3 h-3" /> 編輯
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`確定清空 ${stock.name} 庫存？`)) {
                                        handleUpdatePortfolio(stock.id, 0, 0);
                                      }
                                    }}
                                    className="text-rose-600 hover:text-rose-850 hover:bg-rose-50 font-bold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 border border-rose-100"
                                  >
                                    清空
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Dynamic CAN SLIM Multi-Period Report Generator (移至庫存股分析畫面下方) */}
            <section id="report-generator-sec">
              <ReportGenerator
                stocks={stocks}
                market={market}
                globalIndices={globalIndices}
              />
            </section>
          </div>
        )}

        {/* ======================================= */}
        {/* VIEW 3: ETF ANALYSIS                   */}
        {/* ======================================= */}
        {currentView === 'etf' && (
          <div className="animate-fade-in">
            <EtfAnalysis 
              stocks={stocks} 
              onToggleWatch={handleToggleWatch}
              onAddObservedStock={handleAddStock}
              onRemoveObservedStock={handleRemoveStock}
              onUpdateStockName={handleUpdateStockName}
              onResetStockName={handleResetStockName}
            />
          </div>
        )}

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
