/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { computeIndicators, applyQuote, makeSkeletonStock, DEFAULT_PORTFOLIO } from './utils/stockUtils';
import type { RiskTagKind } from './utils/riskEngine';
import { fetchQuotes, fetchHistory, fetchInfo, loadPortfolio, saveWatch, removeWatch, saveHoldings, removeHolding, loadOfficial, loadSyncStatus, setUserTag, deleteUserTag } from './services/data';
import { setOfficialData, setMarketCandles } from './utils/officialStore';
import { isMarketOpen } from './utils/marketHours';
import { exportPortfolioXlsx } from './utils/exportPortfolio';
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

/** 兩段式確認按鈕：第一次點擊進入「確定？」狀態，3 秒內再點一次才執行（避免誤觸；不使用會被瀏覽器阻擋的 confirm()） */
function ConfirmButton({ label, confirmLabel, onConfirm, danger, title }: { label: string; confirmLabel: string; onConfirm: () => void; danger?: boolean; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      title={title}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      className={`font-bold text-[10px] px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
        armed
          ? 'bg-rose-600 text-white border-rose-600'
          : danger
            ? 'text-rose-700 hover:bg-rose-50 border-rose-200'
            : 'text-amber-700 hover:bg-amber-50 border-amber-200'
      }`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export default function App() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string>('2330'); // Default to TSMC
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  // 大盤資訊一律來自 TWSE/Yahoo 即時指數（^TWII），不再有任何模擬值
  const [market, setMarket] = useState<MarketState>({
    index: 0,
    change: 0,
    changePercent: 0,
    volume: 0,
    status: 'OPEN',
    simulationSpeed: 'paused'
  });
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [toast, setToast] = useState<{ id: string; message: string; type: 'buy' | 'sell' | 'neutral' } | null>(null);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncSource, setSyncSource] = useState<string>("尚未連線");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [globalIndices, setGlobalIndices] = useState<Record<string, GlobalIndex>>({});
  const [quoteMeta, setQuoteMeta] = useState({ liveCount: 0, totalCount: 0, stale: false });
  const [syncError, setSyncError] = useState<string | null>(null);
  const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState<string>('');
  const [officialStatus, setOfficialStatus] = useState<{ dataset: string; ran_at: string }[]>([]);
  const [officialVersion, setOfficialVersion] = useState(0); // 官方資料或歷史 K 線更新時遞增，觸發風險／CAN SLIM 重算

  const stocksRef = useRef<Stock[]>([]);
  stocksRef.current = stocks;
  const rulesRef = useRef<AlertRule[]>([]);
  rulesRef.current = rules;
  const syncInFlight = useRef(false);
  const prevStocksRef = useRef<Stock[]>([]);

  const notify = (message: string, type: 'buy' | 'sell' | 'neutral' = 'neutral') =>
    setToast({ id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, message, type });

  /** 取得最新報價並合併進各股（同一天更新最後一根 K，新交易日新增一根）。自動輪詢與「更新報價」按鈕共用。 */
  const syncStockPrices = async () => {
    if (syncInFlight.current) return;
    const ids = stocksRef.current.map(s => s.id).filter(Boolean);
    if (ids.length === 0) return;
    syncInFlight.current = true;
    setIsSyncing(true);
    try {
      const r = await fetchQuotes(ids);
      setSyncSource(r.source || 'TWSE');
      setLastSyncTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
      setQuoteMeta({ liveCount: r.liveCount, totalCount: r.totalCount, stale: r.liveCount < r.totalCount });
      setSyncError(null);

      const idx = r.indices as Record<string, GlobalIndex & { isLive?: boolean }>;
      setGlobalIndices(idx);
      const twii = idx['^TWII'];
      if (twii && twii.price > 0) {
        setMarket(prev => ({ ...prev, index: twii.price, change: twii.change, changePercent: twii.changePercent }));
      }
      setStocks(cur => cur.map(s => {
        const q = r.quotes[s.id];
        return q ? applyQuote(s, q) : s;
      }));
    } catch (err) {
      console.error('Failed to sync quotes:', err);
      setSyncError(err instanceof Error ? err.message : '報價更新失敗');
      setQuoteMeta(m => ({ ...m, stale: true }));
    } finally {
      syncInFlight.current = false;
      setIsSyncing(false);
    }
  };

  /** 載入 1 年日 K（Yahoo），並套用到各股。可針對部分代號（例如剛新增的標的）。 */
  const loadHistoryFor = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data } = await fetchHistory(ids);
    if (data['0050']) setMarketCandles(data['0050']);
    setStocks(cur => cur.map(s => {
      const candles = data[s.id];
      if (!candles || candles.length === 0) return s.quoteStatus === 'loading' ? { ...s, quoteStatus: 'error' } : s;
      const base: Stock = { ...s, candleHistory: candles, history: candles.map(c => c.close), indicators: computeIndicators(candles) };
      if (s.price > 0) {
        return applyQuote(base, { price: s.price, changePercent: s.change, prevClose: s.prevClose, volume: s.volume, isLive: s.quoteStatus === 'live', asOf: s.quoteAsOf });
      }
      const last = candles[candles.length - 1];
      const prev = candles.length > 1 ? candles[candles.length - 2].close : last.close;
      return { ...base, price: last.close, prevClose: prev, change: prev > 0 ? Number((((last.close - prev) / prev) * 100).toFixed(2)) : 0, volume: last.volume, quoteStatus: 'stale' };
    }));
    setOfficialVersion(v => v + 1);
  };

  /** 載入官方基本面／集保／三大法人／風險標籤（Supabase 資料表） */
  const refreshOfficial = async (ids: string[]) => {
    try {
      const [o, st] = await Promise.all([loadOfficial(ids), loadSyncStatus().catch(() => [])]);
      setOfficialData({ fundamentals: o.fundamentals, chip: o.chip, inst: o.inst, tags: o.tags });
      setOfficialStatus(st);
      setOfficialVersion(v => v + 1);
    } catch (e) {
      console.warn('官方資料載入失敗：', e);
    }
  };

  /** 首次登入且資料庫完全沒有資料時，匯入本機舊資料或內建預設清單（只做一次） */
  const seedPortfolio = async () => {
    let watch: { stock_id: string; custom_name: string | null; note: string | null }[] = [];
    let holdings: { stock_id: string; shares: number; cost: number }[] = [];
    try {
      const raw = localStorage.getItem('tw_stock_obs_stocks');
      const names: Record<string, string> = JSON.parse(localStorage.getItem('tw_stock_custom_names') || '{}');
      if (raw) {
        const old: Stock[] = JSON.parse(raw);
        watch = old.filter(o => o.isObserved !== false || o.shares > 0).map(o => ({ stock_id: o.id, custom_name: names[o.id] ?? o.customName ?? null, note: null }));
        holdings = old.filter(o => o.shares > 0).map(o => ({ stock_id: o.id, shares: o.shares, cost: o.cost }));
      }
    } catch { /* 無舊資料 */ }
    if (watch.length === 0) {
      watch = DEFAULT_PORTFOLIO.map(d => ({ stock_id: d.id, custom_name: null, note: null }));
      holdings = DEFAULT_PORTFOLIO.filter(d => d.shares > 0).map(d => ({ stock_id: d.id, shares: d.shares, cost: d.cost }));
    }
    await saveWatch(watch);
    await saveHoldings(holdings);
    return { watch, holdings };
  };

  // 啟動：先用瀏覽器暫存的「精簡清單」立刻畫出畫面，再向 Supabase 取得正式資料 → 報價 → 歷史 K 線（平行載入）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rawRules = localStorage.getItem('tw_stock_obs_rules');
        const rawLogs = localStorage.getItem('tw_stock_obs_logs');
        let nameMap: Record<string, string> = {};
        try {
          const slim = localStorage.getItem('tw_stock_obs_slim');
          if (slim) {
            const arr = JSON.parse(slim) as { id: string; name: string; shares: number; cost: number; isHolding: boolean; isObserved: boolean; customName?: string }[];
            if (arr.length) setStocks(arr.map(a => makeSkeletonStock(a)));
          }
        } catch { /* ignore */ }

        let { watch, holdings } = await loadPortfolio();
        if (watch.length === 0 && holdings.length === 0) {
          ({ watch, holdings } = await seedPortfolio());
          notify('已將你的觀察清單與庫存匯入資料庫（之後以資料庫為準，可跨裝置使用）。', 'buy');
        }
        localStorage.setItem('tw_stock_obs_dbsynced', '1');
        localStorage.removeItem('tw_stock_obs_stocks');
        if (cancelled) return;

        const ids = Array.from(new Set([...watch.map(w => w.stock_id), ...holdings.map(h => h.stock_id)]));
        nameMap = Object.fromEntries(DEFAULT_PORTFOLIO.map(d => [d.id, d.name]));
        const initial = ids.map(id => {
          const w = watch.find(x => x.stock_id === id);
          const h = holdings.find(x => x.stock_id === id);
          const prevName = stocksRef.current.find(x => x.id === id)?.name;
          return makeSkeletonStock({
            id,
            name: prevName || TAIWAN_STOCKS_DATABASE.find(t => t.id === id)?.name || nameMap[id] || id,
            customName: w?.custom_name,
            shares: h?.shares ?? 0,
            cost: h?.cost ?? 0,
            isHolding: !!h,
            isObserved: !!w,
          });
        });
        setStocks(initial);
        setRules(rawRules ? JSON.parse(rawRules) : defaultRules(initial));
        setLogs(rawLogs ? JSON.parse(rawLogs) : []);

        const histIds = Array.from(new Set([...ids, '0050']));
        const histPromise = loadHistoryFor(histIds).catch(e => console.warn('歷史 K 線載入失敗：', e));
        refreshOfficial(ids);
        // 報價最快：先出價格，歷史 K 線稍後補上
        await new Promise(r => setTimeout(r, 0));
        await syncStockPrices();
        if (cancelled) return;
        setBootState('ready');
        await histPromise;
      } catch (e) {
        console.error('啟動失敗：', e);
        if (!cancelled) {
          setBootError(e instanceof Error ? e.message : String(e));
          setBootState('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 精簡清單快取（只存代號／股數／成本，不存 K 線，避免 localStorage 過大造成載入緩慢）
  useEffect(() => {
    if (stocks.length === 0) return;
    try {
      localStorage.setItem('tw_stock_obs_slim', JSON.stringify(stocks.map(s => ({
        id: s.id, name: s.name, shares: s.shares, cost: s.cost, isHolding: !!s.isHolding, isObserved: s.isObserved !== false, customName: s.customName,
      }))));
    } catch { /* ignore */ }
  }, [stocks]);

  useEffect(() => { if (bootState === 'ready') localStorage.setItem('tw_stock_obs_rules', JSON.stringify(rules)); }, [rules, bootState]);
  useEffect(() => { if (bootState === 'ready') localStorage.setItem('tw_stock_obs_logs', JSON.stringify(logs)); }, [logs, bootState]);

  // 自動更新：盤中每 10 秒、休市每 5 分鐘；分頁隱藏時暫停，回到分頁立即更新一次
  useEffect(() => {
    if (bootState !== 'ready') return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (!document.hidden) await syncStockPrices();
        schedule();
      }, isMarketOpen() ? 10_000 : 300_000);
    };
    schedule();
    const onVisible = () => { if (!document.hidden) syncStockPrices(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [bootState]);

  // 價格警示：以「真實報價更新前後」比較觸發（取代舊版模擬跳動時的檢查）
  useEffect(() => {
    const prev = prevStocksRef.current;
    prevStocksRef.current = stocks;
    if (prev.length === 0) return;
    const triggered: AlertLog[] = [];
    stocks.forEach(ns => {
      const os = prev.find(p => p.id === ns.id);
      if (!os || os.price <= 0 || ns.price <= 0 || os.price === ns.price) return;
      rulesRef.current.filter(r => r.stockId === ns.id && r.isActive).forEach(rule => {
        if (evaluateRule(rule, os, ns)) {
          triggered.push({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            stockId: ns.id, stockName: ns.name, indicator: rule.indicator, condition: rule.condition,
            triggerValue: rule.value, currentValue: Number(getIndicatorValue(ns, rule.indicator).toFixed(2)),
            timestamp: new Date().toLocaleTimeString('zh-TW', { hour12: false }), isRead: false,
          });
        }
      });
    });
    if (triggered.length > 0) {
      const t = triggered[0];
      setLogs(l => [...triggered, ...l]);
      const up = t.condition === 'gt' || t.condition === 'cross_up';
      playAlertSound(up ? 'buy' : 'sell');
      triggerBrowserNotification('台灣股市觀察警示', `台股警報: ${t.stockName}(${t.stockId}) 已${up ? '向上突破' : '跌破'}設定值！當前數值: ${t.currentValue}`);
      notify(`${t.stockName} (${t.stockId}) 觸發指標警示！`, up ? 'buy' : 'sell');
    }
  }, [stocks]);

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

  // Portfolio Updates（寫入 Supabase；失敗時提示並還原）
  const handleUpdatePortfolio = async (id: string, shares: number, cost: number) => {
    const before = stocksRef.current.find(s => s.id === id);
    setStocks(prev => prev.map(s => s.id === id ? { ...s, shares, cost, isHolding: true } : s));
    try {
      await saveHoldings([{ stock_id: id, shares, cost }]);
    } catch (e) {
      console.error(e);
      if (before) setStocks(prev => prev.map(s => s.id === id ? { ...s, shares: before.shares, cost: before.cost, isHolding: before.isHolding } : s));
      notify(`儲存失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell');
    }
  };

  /** 清空：股數與成本歸 0，但這一列保留在庫存明細 */
  const handleClearHolding = (id: string) => handleUpdatePortfolio(id, 0, 0);

  /** 移除：整列從庫存明細刪除（觀察清單不受影響） */
  const handleRemoveHolding = async (id: string) => {
    try {
      await removeHolding(id);
      setStocks(prev => prev
        .map(s => s.id === id ? { ...s, shares: 0, cost: 0, isHolding: false } : s)
        .filter(s => s.isHolding || s.isObserved !== false));
      notify('已從庫存明細移除。', 'neutral');
    } catch (e) {
      notify(`移除失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell');
    }
  };

  const handleExportHoldings = async () => {
    const r = await exportPortfolioXlsx(stocks);
    notify(r ? `已匯出 ${r.count} 檔持股（不含股數為 0）：${r.fileName}` : '目前沒有股數大於 0 的持股可匯出。', r ? 'buy' : 'neutral');
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

  // 輸入代號或名稱時自動比對（名稱與現價皆來自 TWSE 即時查詢，不使用任何預設價）
  useEffect(() => {
    const q = invInputQuery.trim();
    if (!q) {
      setInvMatchedInfo(null);
      setIsSearchingInvOnline(false);
      return;
    }
    const codeMatch = q.match(/^([0-9A-Za-z.]+)\s*(.*)$/);
    const parsedCode = codeMatch ? codeMatch[1].toUpperCase() : '';
    const parsedName = codeMatch && codeMatch[2] ? codeMatch[2].trim() : '';

    const inStocks = stocks.find(s =>
      (parsedCode && s.id.toUpperCase() === parsedCode) || s.id.toUpperCase() === q.toUpperCase() ||
      s.name === q || (parsedName && s.name === parsedName)
    );
    if (inStocks) {
      setInvMatchedInfo({
        id: inStocks.id, name: inStocks.name, price: inStocks.price,
        category: inStocks.etfDetails?.category || '個股', market: inStocks.etfDetails ? 'ETF' : '台股'
      });
      if ((!invCost || invCost === '0') && (inStocks.cost > 0 || inStocks.price > 0)) {
        setInvCost((inStocks.cost > 0 ? inStocks.cost : inStocks.price).toString());
      }
      return;
    }

    const localMatch = TAIWAN_STOCKS_DATABASE.find(s =>
      (parsedCode && s.id.toUpperCase() === parsedCode) || s.id.toUpperCase() === q.toUpperCase() ||
      s.name === q || (parsedName && s.name === parsedName) || s.name.includes(q)
    );
    const targetLookup = localMatch ? localMatch.id : (parsedCode || q.toUpperCase());
    if (localMatch) {
      setInvMatchedInfo({ id: localMatch.id, name: localMatch.name, price: 0, category: localMatch.category, market: localMatch.market });
    }
    if (/^[A-Z0-9.]+$/i.test(targetLookup) && targetLookup.length >= 3) {
      let alive = true;
      setIsSearchingInvOnline(true);
      const timer = setTimeout(async () => {
        try {
          const info = await fetchInfo(targetLookup);
          if (!alive) return;
          if (info) {
            setInvMatchedInfo({ id: info.id, name: info.name, price: info.price || 0, category: info.isEtf ? 'ETF' : '個股', market: info.market });
            if ((!invCost || invCost === '0') && info.price > 0) setInvCost(info.price.toString());
          } else if (!localMatch) {
            setInvMatchedInfo(null);
          }
        } catch { /* ignore */ }
        finally { if (alive) setIsSearchingInvOnline(false); }
      }, 250);
      return () => { alive = false; clearTimeout(timer); };
    }
    if (!localMatch) setInvMatchedInfo(null);
  }, [invInputQuery, stocks]);

  /** 建立一檔新標的：同時查名稱、1 年日 K、即時報價；查無代號時回傳 null（不再用隨機價格充數） */
  const buildStock = async (id: string, nameHint: string, extra: { shares?: number; cost?: number; isHolding?: boolean; isObserved?: boolean; customName?: string | null }): Promise<Stock | null> => {
    const [info, hist, qs] = await Promise.all([
      fetchInfo(id).catch(() => null),
      fetchHistory([id]).catch(() => ({ data: {} as Record<string, import('./types').Candle[]>, failed: [id] })),
      fetchQuotes([id]).catch(() => null),
    ]);
    const candles = hist.data[id] ?? [];
    const quote = qs?.quotes[id];
    if (!info && candles.length === 0 && !(quote && quote.price > 0)) return null;
    let st = makeSkeletonStock({ id, name: info?.name || nameHint || id, ...extra });
    if (candles.length > 0) st = { ...st, candleHistory: candles, history: candles.map(c => c.close), indicators: computeIndicators(candles) };
    if (quote && quote.price > 0) st = applyQuote(st, quote);
    else if (candles.length > 0) {
      const last = candles[candles.length - 1];
      const prev = candles.length > 1 ? candles[candles.length - 2].close : last.close;
      st = { ...st, price: last.close, prevClose: prev, change: prev > 0 ? Number((((last.close - prev) / prev) * 100).toFixed(2)) : 0, volume: last.volume, quoteStatus: 'stale' };
    } else if (info && info.price > 0) {
      st = { ...st, price: info.price, prevClose: info.prevClose, quoteStatus: 'stale' };
    }
    return st;
  };

  const parseCodeFromQuery = (raw: string) => {
    const t = raw.trim();
    const m = t.match(/^([0-9A-Za-z.]+)/);
    const code = m ? m[1].toUpperCase() : '';
    const local = TAIWAN_STOCKS_DATABASE.find(s => (code && s.id.toUpperCase() === code) || s.id.toUpperCase() === t.toUpperCase() || s.name === t);
    return { id: local ? local.id : (code || t.toUpperCase()), local };
  };

  // 新增／更新庫存持股（同時加入觀察清單）
  const handleAddNewInventoryHolding = async (idOrQuery: string, shares: number, cost: number, customName?: string) => {
    if (!idOrQuery.trim() || shares <= 0 || cost < 0) return;
    const { id: stockId, local } = parseCodeFromQuery(idOrQuery);

    const existing = stocksRef.current.find(s => s.id === stockId || s.name === idOrQuery.trim());
    if (existing) {
      setStocks(prev => prev.map(s => s.id === existing.id ? { ...s, isObserved: true, isHolding: true, shares, cost } : s));
      try {
        await Promise.all([saveWatch([{ stock_id: existing.id, custom_name: existing.customName ?? null, note: null }]), saveHoldings([{ stock_id: existing.id, shares, cost }])]);
      } catch (e) { notify(`儲存失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell'); return; }
      setSelectedStockId(existing.id);
      setLastAddedHolding({ id: existing.id, name: existing.name, shares, cost });
      notify(`已更新持股：${existing.name} (${existing.id})，股數 ${shares.toLocaleString()}，均價 NT$ ${cost}`, 'buy');
      return;
    }

    const built = await buildStock(stockId, customName?.trim() || local?.name || '', { shares, cost, isHolding: true, isObserved: true, customName: customName?.trim() || null });
    if (!built) {
      notify(`查無代號「${stockId}」，請確認是否為上市／上櫃股票或 ETF。`, 'sell');
      return;
    }
    try {
      await Promise.all([saveWatch([{ stock_id: stockId, custom_name: customName?.trim() || null, note: null }]), saveHoldings([{ stock_id: stockId, shares, cost }])]);
    } catch (e) { notify(`儲存失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell'); return; }
    setStocks(prev => [built, ...prev.filter(s => s.id !== stockId)]);
    setSelectedStockId(stockId);
    setLastAddedHolding({ id: stockId, name: built.name, shares, cost });
    notify(`已新增持股「${built.name} (${stockId})」，並自動加入觀察清單。`, 'buy');
    refreshOfficial([...stocksRef.current.map(s => s.id), stockId]);
    loadHistoryFor([stockId]).catch(() => {});
  };

  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = invInputMode === 'select' ? invSelectId : (invMatchedInfo?.id || invInputQuery.trim());
    const targetName = invMatchedInfo?.name || '';
    const sharesNum = Number(invShares);
    const costNum = Number(invCost);
    if (!targetId || sharesNum <= 0 || costNum < 0) {
      notify('請輸入有效之股票代號、股數與每股平均成本！');
      return;
    }
    setIsSubmittingInventory(true);
    try {
      await handleAddNewInventoryHolding(targetId, sharesNum, costNum, targetName);
      setInvInputQuery(''); setInvMatchedInfo(null); setInvSelectId(''); setInvShares(''); setInvCost(''); setInvDropdownOpen(false);
    } finally {
      setIsSubmittingInventory(false);
    }
  };

  // 加入觀察清單
  const handleAddStock = async (id: string, name: string, category?: string) => {
    const cleanId = id.trim().toUpperCase();
    const cleanName = name.trim();
    const existing = stocksRef.current.find(s => s.id === cleanId);
    try {
      if (existing) {
        setStocks(prev => prev.map(s => s.id === cleanId ? { ...s, isObserved: true } : s));
        await saveWatch([{ stock_id: cleanId, custom_name: existing.customName ?? null, note: null }]);
        notify(`${existing.name} (${cleanId}) 已加入觀察清單！`);
        return;
      }
      const built = await buildStock(cleanId, cleanName.startsWith('台股 ') ? '' : cleanName, { isObserved: true });
      if (!built) { notify(`查無代號「${cleanId}」，請確認是否為上市／上櫃股票或 ETF。`, 'sell'); return; }
      if (category && built.etfDetails) built.etfDetails = { ...built.etfDetails, category };
      await saveWatch([{ stock_id: cleanId, custom_name: null, note: null }]);
      setStocks(prev => [built, ...prev.filter(s => s.id !== cleanId)]);
      setSelectedStockId(cleanId);
      notify(`已新增 ${built.name} (${cleanId}) 至觀察清單！`);
      refreshOfficial([...stocksRef.current.map(s => s.id), cleanId]);
      loadHistoryFor([cleanId]).catch(() => {});
    } catch (e) {
      notify(`儲存失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell');
    }
  };

  /** 批次加入觀察清單：以空白、逗號或換行分隔多個代號（例如 "2330 2317, 00878"） */
  const handleBulkAddWatch = async (raw: string) => {
    const ids = Array.from(new Set(raw.split(/[\s,，、;；]+/).map(x => x.trim().toUpperCase()).filter(Boolean)));
    if (ids.length === 0) return;
    let ok = 0; const bad: string[] = [];
    for (const id of ids) {
      if (stocksRef.current.some(s => s.id === id && s.isObserved !== false)) continue;
      const before = stocksRef.current.length;
      await handleAddStock(id, '');
      if (stocksRef.current.length > before || stocksRef.current.some(s => s.id === id)) ok++; else bad.push(id);
    }
    notify(`批次加入完成：成功 ${ok} 檔${bad.length ? `，查無 ${bad.join('、')}` : ''}。`);
  };

  const handleSetTag = async (stockId: string, tag: RiskTagKind, enabled: boolean) => {
    try {
      if (enabled) await setUserTag(stockId, tag, true);
      else await setUserTag(stockId, tag, false); // 以 enabled=false 覆寫系統預設，亦可關閉預設標籤
      await refreshOfficial(stocksRef.current.map(x => x.id));
    } catch (e) { notify(`標籤更新失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell'); }
  };

  const handleRemoveStock = async (id: string) => {
    try {
      await removeWatch(id);
      setStocks(prev => prev
        .map(s => s.id === id ? { ...s, isObserved: false } : s)
        .filter(s => s.isHolding || s.isObserved !== false));
      notify('股票已從觀察清單中移除。');
      if (selectedStockId === id) {
        const remaining = stocksRef.current.filter(s => s.id !== id && s.isObserved !== false);
        if (remaining.length > 0) setSelectedStockId(remaining[0].id);
      }
    } catch (e) { notify(`移除失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell'); }
  };

  const handleToggleWatch = async (id: string) => {
    const cur = stocksRef.current.find(s => s.id === id);
    if (!cur) return;
    const next = cur.isObserved === false;
    try {
      if (next) await saveWatch([{ stock_id: id, custom_name: cur.customName ?? null, note: null }]);
      else await removeWatch(id);
      setStocks(prev => prev.map(s => s.id === id ? { ...s, isObserved: next } : s));
      notify('已更新觀察狀態！');
    } catch (e) { notify(`儲存失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell'); }
  };

  const handleUpdateStockName = async (id: string, newName: string) => {
    const cleanId = id.trim().toUpperCase();
    const cleanName = newName.trim();
    if (!cleanName) return;
    const cur = stocksRef.current.find(s => s.id === cleanId);
    try {
      if (cur && cur.isObserved !== false) await saveWatch([{ stock_id: cleanId, custom_name: cleanName, note: null }]);
    } catch (e) { notify(`儲存失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell'); return; }
    setStocks(prev => prev.map(s => s.id === cleanId ? { ...s, name: cleanName, customName: cleanName } : s));
    setRules(prev => prev.map(r => r.stockId === cleanId ? { ...r, stockName: cleanName } : r));
    notify(`已更新代號 ${cleanId} 名稱為「${cleanName}」`);
  };

  const handleResetStockName = async (id: string) => {
    const cleanId = id.trim().toUpperCase();
    const info = await fetchInfo(cleanId).catch(() => null);
    const defaultName = info?.name || TAIWAN_STOCKS_DATABASE.find(s => s.id.toUpperCase() === cleanId)?.name || cleanId;
    const cur = stocksRef.current.find(s => s.id === cleanId);
    try {
      if (cur && cur.isObserved !== false) await saveWatch([{ stock_id: cleanId, custom_name: null, note: null }]);
    } catch (e) { notify(`儲存失敗：${e instanceof Error ? e.message : '資料庫錯誤'}`, 'sell'); return; }
    setStocks(prev => prev.map(s => { if (s.id !== cleanId) return s; const u = { ...s, name: defaultName }; delete u.customName; return u; }));
    setRules(prev => prev.map(r => r.stockId === cleanId ? { ...r, stockName: defaultName } : r));
    notify(`已重設代號 ${cleanId} 名稱為預設「${defaultName}」`);
  };

  // Map active rules count per stock ID to show on the stock list table
  const rulesCountMap = rules.reduce((acc, rule) => {
    if (rule.isActive) {
      acc[rule.stockId] = (acc[rule.stockId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const selectedStock = stocks.find(s => s.id === selectedStockId);

  if (bootState !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
        {bootState === 'loading' ? (
          <span className="text-sm text-slate-400">正在載入您的觀察清單與庫存…</span>
        ) : (
          <div className="max-w-sm space-y-3">
            <p className="text-sm font-bold text-rose-600">資料載入失敗</p>
            <p className="text-xs text-slate-500 break-words">{bootError}</p>
            <p className="text-[11px] text-slate-400">免費版 Supabase 專案閒置會自動暫停，請至 Supabase 後台 Restore 後重試。</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl cursor-pointer">重新載入</button>
          </div>
        )}
      </div>
    );
  }

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
                  
                  const hasData = !!indexData && indexData.price > 0;
                  const price = hasData ? indexData!.price : 0;
                  const change = hasData ? indexData!.change : 0;
                  const changePercent = hasData ? indexData!.changePercent : 0;

                  const isUp = changePercent >= 0;
                  
                  return (
                    <div key={symbol} className="bg-slate-50 border border-slate-150 rounded-xl p-3 hover:bg-white hover:border-slate-300 transition-all shadow-sm group">
                      <div className="flex items-center justify-between text-[10px] font-black text-slate-400 font-display">
                        <span>{displayName}</span>
                        <span className="font-mono text-[9px] opacity-60">{symbol}</span>
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between">
                        <span className="text-sm font-black text-slate-900 font-mono tracking-tight">
                          {hasData ? price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '—'}
                        </span>
                        <span className={`text-[10px] font-mono font-black flex items-center ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {hasData ? `${isUp ? '▲' : '▼'} ${Math.abs(changePercent).toFixed(2)}%` : ''}
                        </span>
                      </div>
                      <div className={`text-[9px] font-mono mt-0.5 flex justify-end ${isUp ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                        {hasData ? `${isUp ? '+' : ''}${change.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : ''}
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
                    onBulkAdd={handleBulkAddWatch}
                    onRemoveStock={handleRemoveStock}
                    onUpdateStockName={handleUpdateStockName}
                    onResetStockName={handleResetStockName}
                    officialVersion={officialVersion}
                    onSetTag={handleSetTag}
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
                dataStatus={{
                  source: syncSource, liveCount: quoteMeta.liveCount, totalCount: quoteMeta.totalCount,
                  lastSync: lastSyncTime, stale: quoteMeta.stale || !!syncError, marketOpen: isMarketOpen(), official: officialStatus,
                }}
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
                    <button
                      onClick={handleExportHoldings}
                      className="ml-2 text-[10px] font-black px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                      title="匯出為 Excel (.xlsx)，不含股數為 0 的股票"
                    >
                      匯出 .xlsx
                    </button>
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
                    {stocks.filter(s => s.isHolding).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-medium text-xs">
                          目前無任何庫存持股。請在上方「新增庫存持股」輸入股票代碼 (如 3293 鈊象) 進行新增，或在儀表板點選個股設定持股部位。
                        </td>
                      </tr>
                    ) : (
                      stocks.filter(s => s.isHolding).map(stock => {
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
                                  <ConfirmButton
                                    label="清空"
                                    confirmLabel="確定清空？"
                                    title="股數與成本歸 0，但保留這一列"
                                    onConfirm={() => { handleClearHolding(stock.id); notify(`已清空 ${stock.name} 股數（保留於明細）`); }}
                                  />
                                  <ConfirmButton
                                    label="移除"
                                    confirmLabel="確定移除？"
                                    title="從庫存明細刪除這一列"
                                    danger
                                    onConfirm={() => handleRemoveHolding(stock.id)}
                                  />
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
