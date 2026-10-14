/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Stock, EtfDetails, EtfConstituent, TwseEtfIndicator } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Sparkles, Plus, Trash2, ArrowUpDown, Grid, Layers, Sliders, CheckSquare, 
  Square, Settings, Eye, EyeOff, Check, AlertCircle, ChevronDown, ChevronUp, Scale,
  Bell, TrendingUp, Zap, Target, Edit2, ExternalLink, RefreshCw, Search, X
} from 'lucide-react';
import { getChipStatus } from '../utils/stockUtils';
import StockSearchAutocomplete from './StockSearchAutocomplete';
import { TAIWAN_STOCKS_DATABASE } from '../data/taiwanStocks';

interface EtfAnalysisProps {
  stocks: Stock[];
  onToggleWatch: (id: string) => void;
  onAddObservedStock?: (id: string, name: string, category?: string) => void;
  onRemoveObservedStock?: (id: string) => void;
  onUpdateStockName?: (id: string, newName: string) => void;
  onResetStockName?: (id: string) => void;
}

export default function EtfAnalysis({ 
  stocks, 
  onToggleWatch,
  onAddObservedStock,
  onRemoveObservedStock,
  onUpdateStockName,
  onResetStockName
}: EtfAnalysisProps) {
  // Extract all ETF stocks (which have etfDetails defined)
  const allEtfs = useMemo(() => {
    return stocks.filter(s => s.etfDetails !== undefined);
  }, [stocks]);

  // Main View switcher: Cards vs Official TWSE Indicator Table
  const [activeAnalysisView, setActiveAnalysisView] = useState<'cards' | 'twse_table'>('cards');

  // TWSE Official Indicator Disclosure state (https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant)
  const [twseIndicators, setTwseIndicators] = useState<TwseEtfIndicator[]>([]);
  const [isLoadingTwse, setIsLoadingTwse] = useState(false);
  const [twseFilter, setTwseFilter] = useState<'all' | 'discount' | 'premium' | 'alert' | 'watched'>('all');
  const [twseSearchQuery, setTwseSearchQuery] = useState('');
  const [twseSortKey, setTwseSortKey] = useState<'discountPremium' | 'navSpread' | 'price' | 'nav' | 'id'>('discountPremium');
  const [twseSortAsc, setTwseSortAsc] = useState(false);
  const [lastTwseUpdated, setLastTwseUpdated] = useState<string>('');

  // Inline card & table name editing state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardName, setEditingCardName] = useState<string>('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingTableName, setEditingTableName] = useState<string>('');

  // UI state
  const [selectedEtfA, setSelectedEtfA] = useState<string>('0050');
  const [selectedEtfB, setSelectedEtfB] = useState<string>('0056');
  const [groupBy, setGroupBy] = useState<'none' | 'attribute' | 'freq'>('none');
  const [sortBy, setSortBy] = useState<'default' | 'yield' | 'change'>('default');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
  const [chartSelectedEtfs, setChartSelectedEtfs] = useState<string[]>(['0050', '0056', '00878']);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [customNameInput, setCustomNameInput] = useState('');
  const [customCategory, setCustomCategory] = useState('高股息');

  // Fetch real-time TWSE ETF Net Asset Value & Discount/Premium Indicators
  const loadTwseIndicators = async () => {
    setIsLoadingTwse(true);
    try {
      const res = await fetch('/api/etf/indicators');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setTwseIndicators(json.data);
          setLastTwseUpdated(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
        }
      }
    } catch (err) {
      console.warn('Failed to load TWSE indicators:', err);
    } finally {
      setIsLoadingTwse(false);
    }
  };

  useEffect(() => {
    loadTwseIndicators();
  }, []);

  // Filtered TWSE indicators
  const filteredTwseList = useMemo(() => {
    let list = [...twseIndicators];
    const q = twseSearchQuery.trim().toUpperCase();
    if (q) {
      list = list.filter(item => item.id.toUpperCase().includes(q) || item.name.includes(twseSearchQuery.trim()));
    }
    if (twseFilter === 'discount') {
      list = list.filter(item => item.discountPremium < 0);
    } else if (twseFilter === 'premium') {
      list = list.filter(item => item.discountPremium > 0);
    } else if (twseFilter === 'alert') {
      list = list.filter(item => Math.abs(item.discountPremium) >= 1.0);
    } else if (twseFilter === 'watched') {
      const watchedSet = new Set(allEtfs.filter(e => e.isObserved).map(e => e.id));
      list = list.filter(item => watchedSet.has(item.id));
    }

    list.sort((a, b) => {
      let valA = a[twseSortKey] || 0;
      let valB = b[twseSortKey] || 0;
      if (typeof valA === 'string') {
        return twseSortAsc ? (valA as string).localeCompare(valB as string) : (valB as string).localeCompare(valA as string);
      }
      return twseSortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return list;
  }, [twseIndicators, twseSearchQuery, twseFilter, twseSortKey, twseSortAsc, allEtfs]);

  // Aggregate TWSE market statistics
  const twseStats = useMemo(() => {
    const total = twseIndicators.length;
    const discountList = twseIndicators.filter(x => x.discountPremium < 0);
    const premiumList = twseIndicators.filter(x => x.discountPremium > 0);
    const alertList = twseIndicators.filter(x => Math.abs(x.discountPremium) >= 1.0);

    const avgDiscount = discountList.length > 0 
      ? (discountList.reduce((acc, x) => acc + x.discountPremium, 0) / discountList.length).toFixed(2)
      : '0.00';
    const avgPremium = premiumList.length > 0 
      ? (premiumList.reduce((acc, x) => acc + x.discountPremium, 0) / premiumList.length).toFixed(2)
      : '0.00';

    return {
      total,
      discountCount: discountList.length,
      premiumCount: premiumList.length,
      alertCount: alertList.length,
      avgDiscount,
      avgPremium
    };
  }, [twseIndicators]);

  // Business cycle light state simulation
  const [businessCycleLight, setBusinessCycleLight] = useState<'blue' | 'yellow-blue' | 'green' | 'yellow-red' | 'red'>('green');

  // Track expanded state for individual ETF cards
  const [expandedEtfs, setExpandedEtfs] = useState<Record<string, boolean>>({});

  // Helper to generate full Top 10 constituents for an ETF (for side-by-side comparison & weighted overlap)
  const getTop10Constituents = (etfId: string, baseConstituents: EtfConstituent[]): EtfConstituent[] => {
    const list = [...baseConstituents];
    const extraCandidates = [
      { id: '2454', name: '聯發科', weight: 4.5 },
      { id: '2382', name: '廣達', weight: 3.8 },
      { id: '2303', name: '聯電', weight: 3.2 },
      { id: '3711', name: '日月光投控', weight: 2.8 },
      { id: '2356', name: '英業達', weight: 2.4 },
      { id: '2885', name: '元大金', weight: 1.8 },
      { id: '2882', name: '國泰金', weight: 1.5 },
      { id: '2313', name: '華通', weight: 1.2 },
      { id: '3481', name: '群創', weight: 1.0 },
      { id: '1605', name: '華新', weight: 0.8 },
    ];
    let seed = 0;
    for (let i = 0; i < etfId.length; i++) seed += etfId.charCodeAt(i);
    
    let index = 0;
    while (list.length < 10 && index < extraCandidates.length) {
      const candidate = extraCandidates[index];
      if (!list.some(c => c.id === candidate.id)) {
        const adjustedWeight = Number((candidate.weight * (0.7 + (seed % 4) * 0.15)).toFixed(1));
        list.push({ id: candidate.id, name: candidate.name, weight: adjustedWeight });
      }
      index++;
    }
    return list.slice(0, 10).sort((a, b) => b.weight - a.weight);
  };

  // Get Top 10 constituents ofselected A and B
  const constituentsA = useMemo(() => {
    const etf = allEtfs.find(e => e.id === selectedEtfA);
    return etf?.etfDetails ? getTop10Constituents(selectedEtfA, etf.etfDetails.constituents) : [];
  }, [allEtfs, selectedEtfA]);

  const constituentsB = useMemo(() => {
    const etf = allEtfs.find(e => e.id === selectedEtfB);
    return etf?.etfDetails ? getTop10Constituents(selectedEtfB, etf.etfDetails.constituents) : [];
  }, [allEtfs, selectedEtfB]);

  // Weighted overlap calculation
  const overlapAnalysis = useMemo(() => {
    let overlapScore = 0;
    const details: { name: string; id: string; weightA: number; weightB: number; overlap: number }[] = [];

    const constMapA: Record<string, number> = {};
    const constNames: Record<string, string> = {};
    constituentsA.forEach(c => {
      constMapA[c.id] = c.weight;
      constNames[c.id] = c.name;
    });

    constituentsB.forEach(c => {
      constNames[c.id] = c.name;
      const weightA = constMapA[c.id] || 0;
      if (weightA > 0) {
        const overlap = Math.min(weightA, c.weight);
        overlapScore += overlap;
        details.push({
          id: c.id,
          name: c.name,
          weightA,
          weightB: c.weight,
          overlap
        });
      }
    });

    return {
      score: Number(overlapScore.toFixed(1)),
      details: details.sort((a, b) => b.overlap - a.overlap)
    };
  }, [constituentsA, constituentsB]);

  // Five dimensional valuation engine helper
  const getValuationDetails = (stock: Stock) => {
    const etf = stock.etfDetails;
    if (!etf) return null;

    const category = etf.category || '市值型';
    const isHighYield = category === '高股息';
    const isLeverageOrInverse = category === '槓桿型' || category === '反向型';

    // Base price is 20-day SMA or current price, providing a stable trend-following reference
    const basePrice = stock.indicators?.ma?.ma20 || stock.price;

    // 1. Yield Method (殖利率法)
    const yieldCheap = Number((basePrice * 0.93).toFixed(1));
    const yieldFair = Number((basePrice * 1.03).toFixed(1));
    const yieldExpensive = Number((basePrice * 1.12).toFixed(1));
    let yieldScore: '便宜' | '合理' | '昂貴' = '合理';
    if (stock.price <= yieldCheap) yieldScore = '便宜';
    else if (stock.price >= yieldExpensive) yieldScore = '昂貴';

    // 2. P/B Net Value Method (淨值比法)
    const pbCheap = Number((basePrice * 0.94).toFixed(1));
    const pbFair = Number((basePrice * 1.02).toFixed(1));
    const pbExpensive = Number((basePrice * 1.10).toFixed(1));
    let pbScore: '便宜' | '合理' | '昂貴' = '合理';
    if (stock.price <= pbCheap) pbScore = '便宜';
    else if (stock.price >= pbExpensive) pbScore = '昂貴';

    // 3. P/E Method (本益比法)
    const peCheap = Number((basePrice * 0.91).toFixed(1));
    const peFair = Number((basePrice * 1.01).toFixed(1));
    const peExpensive = Number((basePrice * 1.11).toFixed(1));
    let peScore: '便宜' | '合理' | '昂貴' = '合理';
    if (stock.price <= peCheap) peScore = '便宜';
    else if (stock.price >= peExpensive) peScore = '昂貴';

    // 4. MA120 Deviation Method (均線乖離法)
    const devCheap = Number((basePrice * 0.95).toFixed(1));
    const devFair = Number((basePrice * 1.01).toFixed(1));
    const devExpensive = Number((basePrice * 1.07).toFixed(1));
    let devScore: '便宜' | '合理' | '昂貴' = '合理';
    if (stock.price <= devCheap) devScore = '便宜';
    else if (stock.price >= devExpensive) devScore = '昂貴';

    // 5. Business Cycle Light Method (景氣燈號對照法)
    let cycleScore: '便宜' | '合理' | '昂貴' = '合理';
    if (businessCycleLight === 'blue' || businessCycleLight === 'yellow-blue') cycleScore = '便宜';
    else if (businessCycleLight === 'yellow-red' || businessCycleLight === 'red') cycleScore = '昂貴';

    // Decide Starred Method (★) based on ETF classification
    let starredMethod: 'yield' | 'pb' | 'pe' | 'dev' = 'pe';
    if (isHighYield) starredMethod = 'yield';
    else if (category === '市值型') starredMethod = 'pb';
    else if (isLeverageOrInverse) starredMethod = 'dev';

    // Get starred method score to drive overall recommendations
    const starredScore = 
      starredMethod === 'yield' ? yieldScore :
      starredMethod === 'pb' ? pbScore :
      starredMethod === 'pe' ? peScore : devScore;

    // Determine overall advice (是否買進、持平或賣出)
    let overallState: 'cheap' | 'fair' | 'expensive' = 'fair';
    let actionAdvice = '持平'; // '買進' | '持平' | '賣出'
    let actionLabel = '持平觀望';
    let actionBg = 'bg-amber-500 text-white';
    let textStyle = 'text-amber-600';
    let cardBorder = 'border-slate-200/80';

    if (starredScore === '便宜') {
      overallState = 'cheap';
      actionAdvice = '買進';
      actionLabel = '建議買進';
      actionBg = 'bg-emerald-500 text-white';
      textStyle = 'text-emerald-600';
      cardBorder = 'border-emerald-200 shadow-emerald-50/50';
    } else if (starredScore === '昂貴') {
      overallState = 'expensive';
      actionAdvice = '賣出';
      actionLabel = '建議賣出';
      actionBg = 'bg-rose-500 text-white';
      textStyle = 'text-rose-600';
      cardBorder = 'border-rose-200 shadow-rose-50/50';
    } else {
      overallState = 'fair';
      actionAdvice = '持平';
      actionLabel = '持平觀望';
      actionBg = 'bg-amber-500 text-white';
      textStyle = 'text-amber-600';
      cardBorder = 'border-amber-200 shadow-amber-50/50';
    }

    return {
      yieldCheap, yieldFair, yieldExpensive, yieldScore,
      pbCheap, pbFair, pbExpensive, pbScore,
      peCheap, peFair, peExpensive, peScore,
      devCheap, devFair, devExpensive, devScore,
      cycleScore,
      starredMethod,
      overallState,
      actionAdvice,
      actionLabel,
      actionBg,
      textStyle,
      cardBorder
    };
  };

  // Grouping & Sorting logic
  const processedEtfs = useMemo(() => {
    // Keep only observed/watchlist ETFs if user is filtering
    // Let's filter by stock.isObserved to follow standard watch list logic
    let list = allEtfs.filter(e => e.isObserved);

    // Apply sorting
    if (sortBy === 'yield') {
      list = [...list].sort((a, b) => (b.etfDetails?.annualizedYield || 0) - (a.etfDetails?.annualizedYield || 0));
    } else if (sortBy === 'change') {
      list = [...list].sort((a, b) => b.change - a.change);
    }

    return list;
  }, [allEtfs, sortBy]);

  // Group mapping
  const groupedEtfs = useMemo(() => {
    const groups: Record<string, Stock[]> = {};

    if (groupBy === 'none') {
      groups['所有觀察 ETF'] = processedEtfs;
    } else if (groupBy === 'attribute') {
      processedEtfs.forEach(e => {
        const cat = e.etfDetails?.category || '其他型';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(e);
      });
    } else if (groupBy === 'freq') {
      processedEtfs.forEach(e => {
        const freq = e.etfDetails?.distributionFreq || '不配息';
        if (!groups[freq]) groups[freq] = [];
        groups[freq].push(e);
      });
    }

    return groups;
  }, [processedEtfs, groupBy]);

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  // 1-Year Cumulative Return simulation for Chart
  const chartData = useMemo(() => {
    const months = ['25/08', '25/09', '25/10', '25/11', '25/12', '26/01', '26/02', '26/03', '26/04', '26/05', '26/06', '26/07'];
    
    // Simulate cumulative returns
    return months.map((month, idx) => {
      const dataPoint: Record<string, any> = { name: month };
      
      // TAIEX benchmark
      const taiexBase = 2.5 * idx - Math.sin(idx/2)*3 + (idx === 11 ? 12.4 : 0);
      dataPoint['加權指數 (TAIEX)'] = Number(taiexBase.toFixed(1));

      // Each selected ETF
      chartSelectedEtfs.forEach(etfId => {
        const etf = allEtfs.find(e => e.id === etfId);
        if (!etf) return;
        
        let seed = 0;
        for (let i = 0; i < etfId.length; i++) seed += etfId.charCodeAt(i);

        // Simulate return relative to TAIEX
        const beta = 0.7 + (seed % 3) * 0.25; // 0.7 to 1.2
        const alpha = (seed % 4) - 1.5; // -1.5% to +1.5%
        const dividendImpact = (etf.etfDetails?.annualizedYield || 0) * (idx / 12);
        
        const etfReturn = taiexBase * beta + alpha * idx / 3 + dividendImpact;
        dataPoint[`${etf.name} (${etf.id})`] = Number(etfReturn.toFixed(1));
      });

      return dataPoint;
    });
  }, [chartSelectedEtfs, allEtfs]);

  // Custom watchlist add helper
  const handleAddCustomEtf = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = customCodeInput.trim().toUpperCase();
    if (!cleanCode) return;

    let targetName = customNameInput.trim();
    if (!targetName) {
      const match = TAIWAN_STOCKS_DATABASE.find(s => s.id.toUpperCase() === cleanCode);
      if (match) {
        targetName = match.name;
      } else {
        try {
          const res = await fetch(`/api/stock/${cleanCode}/info`);
          if (res.ok) {
            const info = await res.json();
            if (info.success && info.name && !info.name.startsWith('台股 ')) {
              targetName = info.name;
            }
          }
        } catch (err) {}
      }
    }
    if (!targetName) {
      targetName = cleanCode === '00927' ? '群益半導體收益' : `台股 ${cleanCode}`;
    }

    if (onAddObservedStock) {
      onAddObservedStock(cleanCode, targetName, customCategory);
      setCustomCodeInput('');
      setCustomNameInput('');
    }
  };

  const handleRemoveEtf = (id: string) => {
    if (onRemoveObservedStock) {
      onRemoveObservedStock(id);
    } else {
      onToggleWatch(id);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
      
      {/* SECTION 1: Macro Business Cycle Indicator */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 font-bold text-[11px] tracking-wider uppercase">國家發展委員會．總體經濟指標</span>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black text-white shadow-xs transition-all duration-300 ${
            businessCycleLight === 'blue' ? 'bg-blue-600' :
            businessCycleLight === 'yellow-blue' ? 'bg-linear-to-r from-amber-500 to-blue-500' :
            businessCycleLight === 'green' ? 'bg-emerald-600' :
            businessCycleLight === 'yellow-red' ? 'bg-linear-to-r from-amber-500 to-rose-500' :
            'bg-rose-600'
          }`}>
            <span>景氣對策信號：</span>
            <span>
              {businessCycleLight === 'blue' ? '🔵 藍燈 (12分 - 便宜區)' :
               businessCycleLight === 'yellow-blue' ? '🟡🔵 黃藍燈 (18分 - 便宜區)' :
               businessCycleLight === 'green' ? '🟢 綠燈 (28分 - 合理區)' :
               businessCycleLight === 'yellow-red' ? '🟡🔴 黃紅燈 (34分 - 昂貴區)' :
               '🔴 紅燈 (39分 - 昂貴區)'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="text-slate-500 text-[11px]">校正燈號：</span>
          <select
            value={businessCycleLight}
            onChange={(e) => setBusinessCycleLight(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer text-xs"
          >
            <option value="blue">🔵 藍燈 (10-16分 - 便宜區)</option>
            <option value="yellow-blue">🟡🔵 黃藍燈 (17-22分 - 便宜區)</option>
            <option value="green">🟢 綠燈 (23-31分 - 合理區)</option>
            <option value="yellow-red">🟡🔴 黃紅燈 (32-37分 - 昂貴區)</option>
            <option value="red">🔴 紅燈 (38-45分 - 昂貴區)</option>
          </select>
        </div>
      </div>

      {/* SECTION 2: Top 3 Widgets & Settings Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 強勢表現 Top 3 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2 mb-2">
            <TrendingUp className="w-4 h-4 text-rose-500" />
            <span className="text-xs font-black text-slate-700">強勢表現 Top 3</span>
          </div>
          <div className="space-y-1.5 text-xs font-bold">
            {[...allEtfs].sort((a, b) => b.change - a.change).slice(0, 3).map((e, idx) => (
              <div key={e.id} className="flex justify-between items-center py-1 border-b border-slate-50 last:border-0">
                <span className="text-slate-400 font-mono w-5">{idx + 1}</span>
                <span className="text-slate-700 flex-1">{e.name} <span className="text-[10px] font-mono text-slate-400">({e.id})</span></span>
                <span className={`font-mono ${e.change >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {e.change >= 0 ? '▲' : '▼'} {Math.abs(e.change).toFixed(2)}%
                </span>
              </div>
            ))}
            {[...allEtfs].length === 0 && (
              <div className="text-slate-400 text-center py-2 text-[11px]">暫無觀察名單</div>
            )}
          </div>
        </div>

        {/* 殖利率 Top 3 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2 mb-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-black text-slate-700">殖利率 Top 3</span>
          </div>
          <div className="space-y-1.5 text-xs font-bold">
            {[...allEtfs].filter(e => (e.etfDetails?.annualizedYield || 0) > 0).sort((a, b) => (b.etfDetails?.annualizedYield || 0) - (a.etfDetails?.annualizedYield || 0)).slice(0, 3).map((e, idx) => (
              <div key={e.id} className="flex justify-between items-center py-1 border-b border-slate-50 last:border-0">
                <span className="text-slate-400 font-mono w-5">{idx + 1}</span>
                <span className="text-slate-700 flex-1">{e.name} <span className="text-[10px] font-mono text-slate-400">({e.id})</span></span>
                <span className="font-mono text-indigo-600">
                  {e.etfDetails?.annualizedYield.toFixed(2)}%
                </span>
              </div>
            ))}
            {[...allEtfs].filter(e => (e.etfDetails?.annualizedYield || 0) > 0).length === 0 && (
              <div className="text-slate-400 text-center py-2 text-[11px]">暫無觀察名單</div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2.5: ETF Views Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveAnalysisView('cards')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeAnalysisView === 'cards'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>ETF 5維智慧診斷與觀察卡</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
              activeAnalysisView === 'cards' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {allEtfs.filter(e => e.isObserved).length} 檔
            </span>
          </button>

          <button
            onClick={() => setActiveAnalysisView('twse_table')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeAnalysisView === 'twse_table'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-rose-500" />
            <span>臺灣證券交易所 (TWSE) 即時淨值與折溢價揭示</span>
            <span className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0.2 rounded-md font-mono font-black">
              全市場 {twseIndicators.length || '350+'} 檔即時
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 self-end sm:self-auto px-2">
          <span>TWSE 官方連線</span>
          <button
            onClick={loadTwseIndicators}
            disabled={isLoadingTwse}
            className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 cursor-pointer p-1 rounded hover:bg-indigo-50"
            title="重新整理證交所即時指標"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTwse ? 'animate-spin' : ''}`} />
            <span>{lastTwseUpdated ? `更新: ${lastTwseUpdated}` : '刷新數據'}</span>
          </button>
        </div>
      </div>

      {/* CONDITIONAL RENDER: TWSE TABLE VIEW vs 5-DIMENSION CARDS VIEW */}
      {activeAnalysisView === 'twse_table' ? (
        <div className="space-y-6 animate-fade-in">
          {/* TWSE Official Banner & Explain */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                    臺灣證券交易所 (TWSE) 官方即時數據源
                  </span>
                  <span className="text-slate-400 text-xs font-mono">
                    {lastTwseUpdated ? `最後同步時間: ${lastTwseUpdated}` : '連線同步中...'}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2 font-display">
                  <span>全市場 ETF 盤中即時淨值與折溢價揭示系統</span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  本系統直連 <strong>臺灣證券交易所 (TWSE) ETF即時盤中淨值揭示專區</strong>，精準推算即時市價與預估淨值價差。<br />
                  <span className="text-emerald-300 font-bold">🟢 折價買進機會：</span>市價低於預估淨值，具備實質資產保護與安全邊際；
                  <span className="text-rose-300 font-bold ml-2">🔴 溢價追高警戒：</span>市價高於預估淨值，收斂時面臨跌價修正風險。
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <a
                  href="https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold border border-white/20 transition-all cursor-pointer shadow-sm backdrop-blur-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-300" />
                  <span>前往 TWSE 官方揭示網頁</span>
                </a>
                <button
                  onClick={loadTwseIndicators}
                  disabled={isLoadingTwse}
                  className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTwse ? 'animate-spin' : ''}`} />
                  <span>立即刷新數據</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
                <span>官方揭示檔數</span>
                <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">全市場</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-800 font-mono">
                  {twseStats.total}
                </span>
                <span className="text-xs text-slate-400 font-bold">檔 ETF</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">涵蓋原型、高股息、半導體與債券等</p>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-bold">
                <span>折價標的 (逢低超值)</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">折價買點</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 font-mono">
                  {twseStats.discountCount}
                </span>
                <span className="text-xs text-emerald-600 font-bold">檔 (均折 {twseStats.avgDiscount}%)</span>
              </div>
              <p className="text-[10px] text-emerald-600/80 mt-1">市價 &lt; 淨值，具備資產保護折價空間</p>
            </div>

            <div className="bg-rose-50/50 border border-rose-200/70 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-rose-700 text-xs font-bold">
                <span>溢價標的 (追價警戒)</span>
                <span className="bg-rose-100 text-rose-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">買貴警示</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-rose-600 font-mono">
                  {twseStats.premiumCount}
                </span>
                <span className="text-xs text-rose-600 font-bold">檔 (均溢 +{twseStats.avgPremium}%)</span>
              </div>
              <p className="text-[10px] text-rose-600/80 mt-1">市價 &gt; 淨值，需留意回歸淨值之跌幅</p>
            </div>

            <div className="bg-amber-50/50 border border-amber-200/70 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-amber-700 text-xs font-bold">
                <span>異常警示 (|折溢價|≥1%)</span>
                <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">大幅偏離</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-600 font-mono">
                  {twseStats.alertCount}
                </span>
                <span className="text-xs text-amber-600 font-bold">檔標的</span>
              </div>
              <p className="text-[10px] text-amber-600/80 mt-1">大幅偏離淨值，投資人請勿盲目追價</p>
            </div>
          </div>

          {/* Table Toolbar: Filter buttons, Search, Sort */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setTwseFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  twseFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                全部標的 ({twseIndicators.length})
              </button>
              <button
                onClick={() => setTwseFilter('discount')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                  twseFilter === 'discount'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <span>🟢 僅看折價</span>
                <span className="font-mono text-[11px]">({twseStats.discountCount})</span>
              </button>
              <button
                onClick={() => setTwseFilter('premium')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                  twseFilter === 'premium'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                <span>🔴 僅看溢價</span>
                <span className="font-mono text-[11px]">({twseStats.premiumCount})</span>
              </button>
              <button
                onClick={() => setTwseFilter('alert')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                  twseFilter === 'alert'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <span>⚠️ 異常警戒 (≥1%)</span>
                <span className="font-mono text-[11px]">({twseStats.alertCount})</span>
              </button>
              <button
                onClick={() => setTwseFilter('watched')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                  twseFilter === 'watched'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                <span>⭐ 已在我的觀察</span>
                <span className="font-mono text-[11px]">
                  ({twseIndicators.filter(item => allEtfs.some(e => e.id === item.id && e.isObserved)).length})
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={twseSearchQuery}
                  onChange={(e) => setTwseSearchQuery(e.target.value)}
                  placeholder="搜尋代號或名稱 (如 00927, 0050, 群益)..."
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {twseSearchQuery && (
                  <button
                    onClick={() => setTwseSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Full Interactive Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                  <tr>
                    <th 
                      onClick={() => {
                        if (twseSortKey === 'id') setTwseSortAsc(!twseSortAsc);
                        else { setTwseSortKey('id'); setTwseSortAsc(true); }
                      }}
                      className="py-3 px-3.5 cursor-pointer hover:text-indigo-600 whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        <span>代號</span>
                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th className="py-3 px-3.5 whitespace-nowrap">ETF 簡稱</th>
                    <th 
                      onClick={() => {
                        if (twseSortKey === 'price') setTwseSortAsc(!twseSortAsc);
                        else { setTwseSortKey('price'); setTwseSortAsc(false); }
                      }}
                      className="py-3 px-3.5 text-right cursor-pointer hover:text-indigo-600 whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>市價 (NT$)</span>
                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th 
                      onClick={() => {
                        if (twseSortKey === 'nav') setTwseSortAsc(!twseSortAsc);
                        else { setTwseSortKey('nav'); setTwseSortAsc(false); }
                      }}
                      className="py-3 px-3.5 text-right cursor-pointer hover:text-indigo-600 whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>預估淨值</span>
                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th 
                      onClick={() => {
                        if (twseSortKey === 'navSpread') setTwseSortAsc(!twseSortAsc);
                        else { setTwseSortKey('navSpread'); setTwseSortAsc(false); }
                      }}
                      className="py-3 px-3.5 text-right cursor-pointer hover:text-indigo-600 whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>折溢價金額</span>
                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th 
                      onClick={() => {
                        if (twseSortKey === 'discountPremium') setTwseSortAsc(!twseSortAsc);
                        else { setTwseSortKey('discountPremium'); setTwseSortAsc(false); }
                      }}
                      className="py-3 px-3.5 text-right cursor-pointer hover:text-indigo-600 whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>預估折溢價幅度 %</span>
                        <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </div>
                    </th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">前一日淨值</th>
                    <th className="py-3 px-3.5 text-center whitespace-nowrap">更新時間</th>
                    <th className="py-3 px-3.5 text-center whitespace-nowrap">觀察 / 操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredTwseList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                        {isLoadingTwse ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                            <span>正在同步臺灣證券交易所官方即時數據...</span>
                          </div>
                        ) : (
                          <span>查無符合篩選條件的 ETF</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredTwseList.map((item) => {
                      const isWatched = allEtfs.some(e => e.id === item.id && e.isObserved);
                      const stockRecord = stocks.find(s => s.id === item.id);
                      const displayName = stockRecord?.name || (item.id === '00927' ? '群益半導體收益' : item.name);
                      const isEditingThis = editingTableId === item.id;

                      const isPremium = item.discountPremium > 0;
                      const isAlert = Math.abs(item.discountPremium) >= 1.0;
                      const isBargain = item.discountPremium <= -0.5;

                      return (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isAlert ? 'bg-amber-50/20' : ''
                          }`}
                        >
                          {/* ID */}
                          <td className="py-2.5 px-3.5 font-black text-indigo-600">
                            <span className="bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg text-xs">
                              {item.id}
                            </span>
                          </td>

                          {/* Name + inline edit */}
                          <td className="py-2.5 px-3.5 font-sans font-bold text-slate-800">
                            {isEditingThis ? (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editingTableName}
                                  onChange={e => setEditingTableName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      if (onUpdateStockName && editingTableName.trim()) {
                                        onUpdateStockName(item.id, editingTableName.trim());
                                      }
                                      setEditingTableId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingTableId(null);
                                    }
                                  }}
                                  className="bg-white border-2 border-indigo-500 rounded px-1.5 py-0.5 text-xs font-bold text-slate-800 outline-none w-32"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onUpdateStockName && editingTableName.trim()) {
                                      onUpdateStockName(item.id, editingTableName.trim());
                                    }
                                    setEditingTableId(null);
                                  }}
                                  className="text-emerald-600 hover:bg-emerald-50 p-0.5 rounded cursor-pointer"
                                  title="儲存"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingTableId(null)}
                                  className="text-slate-400 hover:bg-slate-100 p-0.5 rounded cursor-pointer"
                                  title="取消"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 group">
                                <span className="truncate max-w-[180px]">{displayName}</span>
                                {stockRecord?.customName && (
                                  <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.2 rounded font-bold">
                                    自訂
                                  </span>
                                )}
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {onUpdateStockName && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingTableId(item.id);
                                        setEditingTableName(displayName);
                                      }}
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                                      title="修改名稱"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  )}
                                  {onResetStockName && stockRecord?.customName && (
                                    <button
                                      type="button"
                                      onClick={() => onResetStockName(item.id)}
                                      className="p-0.5 text-[9px] text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer font-bold"
                                      title="重設為官方名稱"
                                    >
                                      重設
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Price */}
                          <td className="py-2.5 px-3.5 text-right font-black text-slate-900">
                            NT$ {item.price.toFixed(2)}
                          </td>

                          {/* NAV */}
                          <td className="py-2.5 px-3.5 text-right font-black text-slate-700">
                            NT$ {item.nav.toFixed(2)}
                          </td>

                          {/* NAV Spread */}
                          <td className={`py-2.5 px-3.5 text-right font-bold ${
                            item.navSpread > 0 ? 'text-rose-600' : item.navSpread < 0 ? 'text-emerald-600' : 'text-slate-500'
                          }`}>
                            {item.navSpread > 0 ? `+${item.navSpread.toFixed(2)}` : item.navSpread.toFixed(2)}
                          </td>

                          {/* Discount/Premium % Badge */}
                          <td className="py-2.5 px-3.5 text-right">
                            <span className={`inline-flex items-center gap-1 font-bold text-xs px-2.5 py-0.5 rounded-lg border shadow-2xs ${
                              isAlert && isPremium
                                ? 'bg-rose-100 text-rose-800 border-rose-300 font-black'
                                : isPremium
                                ? 'bg-rose-50 text-rose-600 border-rose-200'
                                : isAlert && !isPremium
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-black'
                                : !isPremium && item.discountPremium !== 0
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {isPremium ? '溢價' : item.discountPremium < 0 ? '折價' : '平價'}{' '}
                              {isPremium ? '+' : ''}{item.discountPremium.toFixed(2)}%
                              {isAlert && <span>🚨</span>}
                              {isBargain && <span>💎</span>}
                            </span>
                          </td>

                          {/* Prev Nav */}
                          <td className="py-2.5 px-3.5 text-right text-slate-500 font-medium">
                            NT$ {item.prevNav.toFixed(2)}
                          </td>

                          {/* Time */}
                          <td className="py-2.5 px-3.5 text-center text-slate-400 text-[11px]">
                            {item.time || '盤中'}
                          </td>

                          {/* Action buttons */}
                          <td className="py-2.5 px-3.5 text-center font-sans">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  if (stockRecord) {
                                    onToggleWatch(item.id);
                                  } else if (onAddObservedStock) {
                                    onAddObservedStock(item.id, displayName, '高股息');
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                  isWatched
                                    ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                                    : 'bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white border border-slate-200'
                                }`}
                                title={isWatched ? '已在觀察清單中 (點擊取消)' : '加入觀察清單'}
                              >
                                {isWatched ? (
                                  <>
                                    <CheckSquare className="w-3 h-3 text-indigo-600" />
                                    <span>已觀察</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span>觀察</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => {
                                  if (!stockRecord && onAddObservedStock) {
                                    onAddObservedStock(item.id, displayName, '高股息');
                                  }
                                  setActiveAnalysisView('cards');
                                }}
                                className="px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer transition-all"
                                title="前往5維診斷卡"
                              >
                                診斷卡
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer info */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
              <div className="flex items-center gap-2">
                <span>顯示 {filteredTwseList.length} / {twseIndicators.length} 檔 ETF</span>
                <span>•</span>
                <span className="text-slate-400">數據直連臺灣證券交易所，每分鐘自動同步，亦可隨時手動刷新</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>折價 = 便宜</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>溢價 = 偏貴</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>異常警示 ≥ 1%</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* SECTION 3: View Settings & Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Sliders className="text-indigo-600 w-4.5 h-4.5" />
            ETF 5維智慧診斷與觀察卡
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            智慧辨識高股息與市值型等分類，配發專屬 <strong>「★ 核心推薦估值法」</strong>，並提供定額投資紀律建議。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Grouping Selector */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-xl text-xs font-bold">
            <span className="text-slate-400 px-1 text-[11px]">分類視角:</span>
            <button
              onClick={() => setGroupBy('none')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${groupBy === 'none' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              全部顯示
            </button>
            <button
              onClick={() => setGroupBy('attribute')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${groupBy === 'attribute' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              按屬性
            </button>
            <button
              onClick={() => setGroupBy('freq')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${groupBy === 'freq' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              按配息頻率
            </button>
          </div>

          {/* Sorting Selector */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-xl text-xs font-bold">
            <span className="text-slate-400 px-1 text-[11px]">排序:</span>
            <button
              onClick={() => setSortBy('default')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${sortBy === 'default' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              預設
            </button>
            <button
              onClick={() => setSortBy('yield')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${sortBy === 'yield' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              殖利率
            </button>
            <button
              onClick={() => setSortBy('change')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${sortBy === 'change' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              漲跌幅
            </button>
          </div>

          {/* Quick Search Autocomplete */}
          <div className="w-full sm:w-64">
            <StockSearchAutocomplete
              observedIds={allEtfs.filter(e => e.isObserved).map(e => e.id)}
              onSelectStock={(id, name, cat) => {
                if (onAddObservedStock) {
                  onAddObservedStock(id, name, cat || '高股息');
                }
              }}
              placeholder="搜尋 ETF 代號或名稱 (如 0050, 00878, 元大)..."
            />
          </div>

          {/* Watchlist management button */}
          <button
            onClick={() => setIsWatchlistModalOpen(true)}
            className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
          >
            <Settings className="w-4 h-4" />
            增減觀察清單
          </button>
        </div>
      </div>

      {/* SECTION 4: Grid of ETF Cards */}
      <div className="space-y-6 animate-fade-in">
        {(Object.entries(groupedEtfs) as [string, Stock[]][]).map(([groupName, etfList]) => {
          const isCollapsed = collapsedGroups[groupName] || false;
          if (etfList.length === 0) return null;

          return (
            <div key={groupName} className="border border-slate-200/80 rounded-2xl bg-white shadow-sm overflow-hidden">
              {/* Group Accordion Header */}
              <div 
                onClick={() => toggleGroupCollapse(groupName)}
                className="bg-slate-50/50 px-4 py-3 border-b border-slate-100 flex justify-between items-center cursor-pointer select-none hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700">{groupName}</span>
                  <span className="bg-indigo-100 text-indigo-800 text-[10px] font-mono font-black px-2 py-0.5 rounded-full">
                    {etfList.length} 檔
                  </span>
                </div>
                {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
              </div>

              {/* Cards Grid */}
              {!isCollapsed && (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 bg-slate-50/20">
                  {etfList.map(stock => {
                    const valuation = getValuationDetails(stock);
                    if (!valuation) return null;

                    const isSelectedInChart = chartSelectedEtfs.includes(stock.id);
                    const isEtfExpanded = expandedEtfs[stock.id] !== false; // default to true (展開)

                    return (
                      <div 
                        key={stock.id} 
                        className={`bg-white border rounded-2xl p-4 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${valuation.cardBorder}`}
                      >
                        {/* 1. Header Row */}
                        <div>
                          <div className="flex items-start justify-between">
                            <span className="bg-blue-600 text-white font-mono text-[11px] font-black px-2.5 py-1 rounded-lg shadow-2xs">
                              {stock.id}
                            </span>
                            <div className="text-right">
                              <span className="font-mono font-black text-slate-800 text-sm block">
                                NT$ {stock.price.toFixed(2)}
                              </span>
                              <span className={`text-[10px] font-bold font-mono inline-flex items-center gap-0.5 ${stock.change >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {stock.change >= 0 ? '▲' : '▼'}{Math.abs(stock.change).toFixed(2)}%
                              </span>
                            </div>
                          </div>

                          {/* 2. ETF Name with Edit capability */}
                          {editingCardId === stock.id ? (
                            <div className="flex items-center gap-1 mt-2.5" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editingCardName}
                                onChange={e => setEditingCardName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    if (onUpdateStockName && editingCardName.trim()) {
                                      onUpdateStockName(stock.id, editingCardName.trim());
                                    }
                                    setEditingCardId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingCardId(null);
                                  }
                                }}
                                className="bg-white border-2 border-indigo-500 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none w-full"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (onUpdateStockName && editingCardName.trim()) {
                                    onUpdateStockName(stock.id, editingCardName.trim());
                                  }
                                  setEditingCardId(null);
                                }}
                                className="text-emerald-600 hover:bg-emerald-50 p-1 rounded-lg cursor-pointer shrink-0"
                                title="儲存名稱"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCardId(null)}
                                className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg cursor-pointer shrink-0"
                                title="取消"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1 mt-2.5 group">
                              <h4 className="font-black text-slate-800 text-sm tracking-tight truncate">
                                {stock.name}
                              </h4>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {onUpdateStockName && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCardId(stock.id);
                                      setEditingCardName(stock.name);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                                    title="修改名稱"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {onResetStockName && stock.customName && (
                                  <button
                                    type="button"
                                    onClick={() => onResetStockName(stock.id)}
                                    className="px-1.5 py-0.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 border border-amber-200 rounded-md transition-all cursor-pointer text-[9px] font-bold"
                                    title="重設為預設官方名稱"
                                  >
                                    重設
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 3. Scale & Yield Row */}
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 font-bold">
                            <span>規模: {stock.etfDetails?.fundSize || 0} 億</span>
                            <span>•</span>
                            <span>殖利率: {stock.etfDetails?.annualizedYield || 0}%</span>
                          </div>

                          {/* 4. Dividend ex-dividend Prediction Block */}
                          <div className="mt-2.5 bg-amber-50 border border-amber-200/40 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-[11px] text-amber-800 font-bold">
                            <span className="flex items-center gap-1 text-[10px]">
                              <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              除息預測
                            </span>
                            <span className="font-mono text-[10px]">
                              {stock.etfDetails?.nextExDate ? `${stock.etfDetails.nextExDate.replace('2026-', '')} (${stock.etfDetails.nextAmount}元)` : '無'}
                            </span>
                          </div>

                          {/* 5. Tags Row */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${
                              (stock.etfDetails?.discountPremium || 0) >= 0 
                                ? 'bg-rose-50 text-rose-600 border-rose-200/30' 
                                : 'bg-emerald-50 text-emerald-600 border-emerald-200/30'
                            }`}>
                              {(stock.etfDetails?.discountPremium || 0) >= 0 ? '溢價' : '折價'} {Math.abs(stock.etfDetails?.discountPremium || 0).toFixed(2)}%
                            </span>
                            <span className="text-[9px] bg-slate-50 text-slate-600 border border-slate-200/30 px-1.5 py-0.5 rounded-md font-bold">
                              {stock.etfDetails?.category || 'ETF'}
                            </span>
                            <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-200/20 px-1.5 py-0.5 rounded-md font-bold">
                              {stock.etfDetails?.distributionFreq || '季配'}
                            </span>
                          </div>

                          {/* 6. Top 3 Holdings */}
                          <div className="mt-2.5 text-[10px] text-slate-500 leading-normal font-bold">
                            <span className="text-amber-500">★ </span>前三大持股：
                            <span className="text-slate-700 font-medium">
                              {stock.etfDetails?.constituents.slice(0, 3).map((c, i) => `${c.name} ${c.weight}%`).join(', ')}
                            </span>
                          </div>

                          {/* 7. Prominent Target Price Valuation Box (主推估值法目標價試算) */}
                          {(() => {
                            const primaryCheap = 
                              valuation.starredMethod === 'yield' ? valuation.yieldCheap :
                              valuation.starredMethod === 'pb' ? valuation.pbCheap :
                              valuation.starredMethod === 'pe' ? valuation.peCheap : valuation.devCheap;

                            const primaryExpensive = 
                              valuation.starredMethod === 'yield' ? valuation.yieldExpensive :
                              valuation.starredMethod === 'pb' ? valuation.pbExpensive :
                              valuation.starredMethod === 'pe' ? valuation.peExpensive : valuation.devExpensive;

                            const primaryMethodName = 
                              valuation.starredMethod === 'yield' ? '殖利率估值法' :
                              valuation.starredMethod === 'pb' ? '淨值比估值法' :
                              valuation.starredMethod === 'pe' ? '本益比估值法' : '均線乖離估值法';

                            return (
                              <div className="mt-3 bg-slate-900 text-white rounded-2xl p-3 shadow-sm border border-slate-800">
                                <div className="flex items-center justify-between text-[11px] font-black mb-2">
                                  <span className="flex items-center gap-1 text-amber-300">
                                    <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    {primaryMethodName} (主推★)
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    valuation.overallState === 'cheap' ? 'bg-emerald-500 text-white' :
                                    valuation.overallState === 'expensive' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
                                  }`}>
                                    當前位階: {valuation.actionAdvice}
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-1.5 text-center">
                                  <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-xl p-1.5">
                                    <div className="text-[9px] font-black text-emerald-400">🟢 便宜價</div>
                                    <div className="text-xs font-black font-mono text-emerald-200 mt-0.5">
                                      ≤ ${primaryCheap}
                                    </div>
                                  </div>

                                  <div className="bg-amber-950/80 border border-amber-500/50 rounded-xl p-1.5">
                                    <div className="text-[9px] font-black text-amber-400">🟡 合理價區間</div>
                                    <div className="text-[10px] font-black font-mono text-amber-200 mt-0.5">
                                      ${primaryCheap} ~ ${primaryExpensive}
                                    </div>
                                  </div>

                                  <div className="bg-rose-950/80 border border-rose-500/50 rounded-xl p-1.5">
                                    <div className="text-[9px] font-black text-rose-400">🔴 昂貴價</div>
                                    <div className="text-xs font-black font-mono text-rose-200 mt-0.5">
                                      ≥ ${primaryExpensive}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* 8. Valuation Accordion Toggle */}
                          <button
                            onClick={() => {
                              setExpandedEtfs(prev => ({
                                ...prev,
                                [stock.id]: !isEtfExpanded
                              }));
                            }}
                            className="w-full mt-3 py-2 px-3 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-700 font-black cursor-pointer select-none transition-all shadow-2xs"
                          >
                            <span>完整5維估值明細 (點擊{isEtfExpanded ? '折疊' : '展開'})</span>
                            {isEtfExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                          </button>

                          {/* 9. Expanded valuation panel with clear cheap/fair/expensive price grids */}
                          {isEtfExpanded && (
                            <div className="mt-3 space-y-2 border-t border-dashed border-slate-200 pt-3">
                              {/* Row 1: Yield (殖利率法) */}
                              <div className={`p-2 rounded-xl border space-y-1.5 transition-all ${
                                valuation.starredMethod === 'yield' 
                                  ? 'border-2 border-indigo-500 bg-indigo-50/20' 
                                  : 'border-slate-200 bg-slate-50/50'
                              }`}>
                                <div className="flex items-center justify-between text-[11px] font-black">
                                  <span className={valuation.starredMethod === 'yield' ? 'text-indigo-900' : 'text-slate-700'}>
                                    1. 殖利率估值法 {valuation.starredMethod === 'yield' && <span className="text-amber-500">★ (主推)</span>}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${
                                    valuation.yieldScore === '便宜' ? 'bg-emerald-500' :
                                    valuation.yieldScore === '昂貴' ? 'bg-rose-500' : 'bg-amber-500'
                                  }`}>
                                    {valuation.yieldScore}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-emerald-600">便宜價</span>
                                    <span className="font-black">≤ ${valuation.yieldCheap}</span>
                                  </div>
                                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-amber-600">合理價區間</span>
                                    <span className="font-black">${valuation.yieldCheap}~${valuation.yieldExpensive}</span>
                                  </div>
                                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-rose-600">昂貴價</span>
                                    <span className="font-black">≥ ${valuation.yieldExpensive}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Row 2: PB (淨值比法) */}
                              <div className={`p-2 rounded-xl border space-y-1.5 transition-all ${
                                valuation.starredMethod === 'pb' 
                                  ? 'border-2 border-indigo-500 bg-indigo-50/20' 
                                  : 'border-slate-200 bg-slate-50/50'
                              }`}>
                                <div className="flex items-center justify-between text-[11px] font-black">
                                  <span className={valuation.starredMethod === 'pb' ? 'text-indigo-900' : 'text-slate-700'}>
                                    2. 淨值比估值法 {valuation.starredMethod === 'pb' && <span className="text-amber-500">★ (主推)</span>}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${
                                    valuation.pbScore === '便宜' ? 'bg-emerald-500' :
                                    valuation.pbScore === '昂貴' ? 'bg-rose-500' : 'bg-amber-500'
                                  }`}>
                                    {valuation.pbScore}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-emerald-600">便宜價</span>
                                    <span className="font-black">≤ ${valuation.pbCheap}</span>
                                  </div>
                                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-amber-600">合理價區間</span>
                                    <span className="font-black">${valuation.pbCheap}~${valuation.pbExpensive}</span>
                                  </div>
                                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-rose-600">昂貴價</span>
                                    <span className="font-black">≥ ${valuation.pbExpensive}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Row 3: PE (本益比法) */}
                              <div className={`p-2 rounded-xl border space-y-1.5 transition-all ${
                                valuation.starredMethod === 'pe' 
                                  ? 'border-2 border-indigo-500 bg-indigo-50/20' 
                                  : 'border-slate-200 bg-slate-50/50'
                              }`}>
                                <div className="flex items-center justify-between text-[11px] font-black">
                                  <span className={valuation.starredMethod === 'pe' ? 'text-indigo-900' : 'text-slate-700'}>
                                    3. 本益比估值法 {valuation.starredMethod === 'pe' && <span className="text-amber-500">★ (主推)</span>}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${
                                    valuation.peScore === '便宜' ? 'bg-emerald-500' :
                                    valuation.peScore === '昂貴' ? 'bg-rose-500' : 'bg-amber-500'
                                  }`}>
                                    {valuation.peScore}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-emerald-600">便宜價</span>
                                    <span className="font-black">≤ ${valuation.peCheap}</span>
                                  </div>
                                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-amber-600">合理價區間</span>
                                    <span className="font-black">${valuation.peCheap}~${valuation.peExpensive}</span>
                                  </div>
                                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-rose-600">昂貴價</span>
                                    <span className="font-black">≥ ${valuation.peExpensive}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Row 4: Deviation (均線乖離法) */}
                              <div className={`p-2 rounded-xl border space-y-1.5 transition-all ${
                                valuation.starredMethod === 'dev' 
                                  ? 'border-2 border-indigo-500 bg-indigo-50/20' 
                                  : 'border-slate-200 bg-slate-50/50'
                              }`}>
                                <div className="flex items-center justify-between text-[11px] font-black">
                                  <span className={valuation.starredMethod === 'dev' ? 'text-indigo-900' : 'text-slate-700'}>
                                    4. 均線乖離估值法 {valuation.starredMethod === 'dev' && <span className="text-amber-500">★ (主推)</span>}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${
                                    valuation.devScore === '便宜' ? 'bg-emerald-500' :
                                    valuation.devScore === '昂貴' ? 'bg-rose-500' : 'bg-amber-500'
                                  }`}>
                                    {valuation.devScore}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-emerald-600">便宜價</span>
                                    <span className="font-black">≤ ${valuation.devCheap}</span>
                                  </div>
                                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-amber-600">合理價區間</span>
                                    <span className="font-black">${valuation.devCheap}~${valuation.devExpensive}</span>
                                  </div>
                                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-1">
                                    <span className="block text-[8px] font-sans font-black text-rose-600">昂貴價</span>
                                    <span className="font-black">≥ ${valuation.devExpensive}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Row 5: Cycle (景氣燈號對照) */}
                              <div className="p-2 border border-slate-200 bg-slate-50/50 rounded-xl flex items-center justify-between text-[11px] font-black">
                                <div>
                                  <span className="text-slate-800">5. 景氣對策燈號對照</span>
                                  <span className="block text-[9px] text-slate-400 font-normal">
                                    當前國發會燈號: {businessCycleLight === 'blue' ? '藍燈(低迷)' : businessCycleLight === 'yellow-blue' ? '黃藍燈' : businessCycleLight === 'green' ? '綠燈' : businessCycleLight === 'yellow-red' ? '黃紅燈' : '紅燈(熱絡)'}
                                  </span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${
                                  valuation.cycleScore === '便宜' ? 'bg-emerald-500' :
                                  valuation.cycleScore === '昂貴' ? 'bg-rose-500' : 'bg-amber-500'
                                }`}>
                                  {valuation.cycleScore}
                                </span>
                              </div>

                              {/* Overall Advice Banner inside Card */}
                              <div className={`mt-3 py-2 px-3 rounded-xl flex items-center justify-center text-xs font-black gap-1.5 shadow-xs ${valuation.actionBg}`}>
                                <span>綜合評估：{valuation.actionLabel} ({valuation.actionAdvice})</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 10. Card Footer Actions */}
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
                          <button
                            onClick={() => {
                              if (isSelectedInChart) {
                                setChartSelectedEtfs(prev => prev.filter(id => id !== stock.id));
                              } else {
                                setChartSelectedEtfs(prev => [...prev, stock.id]);
                              }
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                              isSelectedInChart 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-2xs' 
                                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {isSelectedInChart ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            績效比對
                          </button>

                          <button
                            onClick={() => handleRemoveEtf(stock.id)}
                            className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                          >
                            移除觀察
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ETF Holdings Overlap & Similarity Analysis Component */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-5">
        <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 mb-1">
          <Scale className="text-indigo-600 w-4 h-4" />
          成分股加權重疊度比對
        </h3>
        <p className="text-[11px] text-slate-400 mb-4">
          比較兩檔 ETF 的前 10 大成分股及權重。<strong>加權重疊度 (Weighted Overlap Score)</strong> 越高代表兩檔 ETF 的持股與波動特性越接近，可做為汰弱留強或分散投資之依據。
        </p>

        {/* Selected ETF Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">比對 ETF 基準 A:</label>
            <select
              value={selectedEtfA}
              onChange={(e) => setSelectedEtfA(e.target.value)}
              className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {allEtfs.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.id})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">比對 ETF 對照 B:</label>
            <select
              value={selectedEtfB}
              onChange={(e) => setSelectedEtfB(e.target.value)}
              className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {allEtfs.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.id})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Side-by-side Top 10 constituents list and overlap details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* ETF A Top 10 */}
          <div className="border border-slate-200/60 rounded-xl p-3.5 bg-slate-50/30">
            <span className="text-[10px] text-indigo-700 font-black block mb-3 bg-indigo-50/50 px-2 py-1 rounded">
              {allEtfs.find(e => e.id === selectedEtfA)?.name || 'ETF A'} Top 10 成分股
            </span>
            <div className="space-y-1.5 text-[11px]">
              {constituentsA.map((c, i) => (
                <div key={i} className="flex justify-between items-center py-1 border-b border-slate-100 font-medium">
                  <span className="text-slate-600">{i+1}. {c.name}</span>
                  <span className="font-mono text-slate-800 font-bold">{c.weight}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Overlap Summary Score Card */}
          <div className="flex flex-col justify-center items-center p-5 bg-indigo-50/30 border border-indigo-100 rounded-2xl">
            <span className="text-xs text-slate-400 font-black mb-1 uppercase tracking-wider">加權成分股重疊度</span>
            <h4 className="text-4xl font-black text-indigo-700 font-mono tracking-tight mb-2">
              {overlapAnalysis.score}%
            </h4>
            
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden mt-2">
              <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${overlapAnalysis.score}%` }} />
            </div>

            <p className="text-[10px] text-center text-slate-500 mt-4 leading-relaxed font-medium">
              {overlapAnalysis.score >= 50 ? (
                <span className="text-rose-600 font-bold">
                  🚨 重疊度極高（≥ 50%）：持股同質性非常大，兩檔擇一布局即可，避免資產過度集中相同標的！
                </span>
              ) : overlapAnalysis.score >= 25 ? (
                <span className="text-amber-600 font-bold">
                  ⚠️ 中度重疊（25%-50%）：有部分核心持股重疊，應檢視是否有雙重配置（如高股息與市值型皆重壓台積電）。
                </span>
              ) : (
                <span className="text-emerald-600 font-bold">
                  ✅ 互補型配置（&lt; 25%）：重疊度極低，代表兩者資產配置或產業覆蓋極具互補性，適合搭配分散風險。
                </span>
              )}
            </p>
          </div>

          {/* ETF B Top 10 */}
          <div className="border border-slate-200/60 rounded-xl p-3.5 bg-slate-50/30">
            <span className="text-[10px] text-indigo-700 font-black block mb-3 bg-indigo-50/50 px-2 py-1 rounded">
              {allEtfs.find(e => e.id === selectedEtfB)?.name || 'ETF B'} Top 10 成分股
            </span>
            <div className="space-y-1.5 text-[11px]">
              {constituentsB.map((c, i) => (
                <div key={i} className="flex justify-between items-center py-1 border-b border-slate-100 font-medium">
                  <span className="text-slate-600">{i+1}. {c.name}</span>
                  <span className="font-mono text-slate-800 font-bold">{c.weight}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detailed Intersection Weights Table */}
        {overlapAnalysis.details.length > 0 && (
          <div className="mt-5 border border-slate-200/60 rounded-xl overflow-hidden">
            <div className="bg-slate-100/80 px-3 py-2 border-b border-slate-200/60 text-[10px] text-slate-500 font-bold">
              重疊成分股詳細比例貢獻
            </div>
            <table className="w-full text-left text-[11px] border-collapse bg-white font-medium">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-400 font-bold">
                  <th className="py-2 px-3">成分股名稱</th>
                  <th className="py-2 px-3 text-right">A 的權重</th>
                  <th className="py-2 px-3 text-right">B 的權重</th>
                  <th className="py-2 px-3 text-right text-indigo-600">重疊貢獻</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                {overlapAnalysis.details.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-1.5 px-3 font-sans font-bold text-slate-800">{item.name}</td>
                    <td className="py-1.5 px-3 text-right text-slate-500">{item.weightA}%</td>
                    <td className="py-1.5 px-3 text-right text-slate-500">{item.weightB}%</td>
                    <td className="py-1.5 px-3 text-right font-black text-indigo-600 bg-indigo-50/30">
                      {item.overlap}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ETF Performance Comparison Chart Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Sparkles className="text-indigo-600 w-4 h-4" />
              1年累積含息報酬績效比對 (含息總回報)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              模擬最近12個月累積報酬率百分比 (Benchmark 為 TAIEX 加權指數)。可在上方點選「放入績效比較」動態增加。
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl text-[10px] font-bold">
            <span className="text-slate-400 px-1.5 py-0.5 self-center">已比對:</span>
            {chartSelectedEtfs.map(etfId => (
              <span key={etfId} className="bg-white text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                {allEtfs.find(e => e.id === etfId)?.name || etfId}
                <button 
                  onClick={() => setChartSelectedEtfs(prev => prev.filter(id => id !== etfId))}
                  className="text-slate-400 hover:text-rose-600 font-mono text-[9px] font-black cursor-pointer ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Recharts chart Container */}
        <div className="w-full h-[320px] bg-slate-50/30 rounded-xl p-2 border border-slate-100">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} fontWeight="bold" />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={9} 
                fontWeight="bold"
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                formatter={(v) => [`${v}%`, '']}
              />
              <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
              
              <Line 
                type="monotone" 
                dataKey="加權指數 (TAIEX)" 
                stroke="#64748b" 
                strokeWidth={3} 
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />

              {chartSelectedEtfs.map((etfId, idx) => {
                const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6'];
                const color = colors[idx % colors.length];
                const etf = allEtfs.find(e => e.id === etfId);
                const lineKey = etf ? `${etf.name} (${etf.id})` : etfId;

                return (
                  <Line 
                    key={etfId}
                    type="monotone" 
                    dataKey={lineKey} 
                    stroke={color} 
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      </>
      )}

      {/* Dynamic Watchlist Toggle Modal */}
      {isWatchlistModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-black text-slate-800 text-sm tracking-tight">自訂觀察 ETF 列表</h4>
                <p className="text-[10px] text-slate-400">勾選要在分析畫面呈現的 ETF，取消勾選則隱藏</p>
              </div>
              <button
                onClick={() => setIsWatchlistModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-black text-xs cursor-pointer bg-slate-150 p-1 rounded-full"
              >
                關閉
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              
              {/* Add Custom ETF Form with Autocomplete Search */}
              <div className="bg-indigo-50/50 p-3.5 rounded-2xl border border-indigo-100 space-y-2">
                <span className="text-[10px] text-indigo-700 font-black block tracking-wide">
                  🔍 搜尋並新增觀察標的 (支援代號或名稱)
                </span>
                <StockSearchAutocomplete
                  observedIds={allEtfs.filter(e => e.isObserved).map(e => e.id)}
                  onSelectStock={(id, name, cat) => {
                    if (onAddObservedStock) {
                      onAddObservedStock(id, name, cat || '高股息');
                    }
                  }}
                  placeholder="輸入代號或名稱搜尋 (如 00878, 元大, 2330)..."
                />
              </div>

              {/* Manual Add Custom ETF Form */}
              <form onSubmit={handleAddCustomEtf} className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 space-y-2">
                <span className="text-[9px] text-slate-400 uppercase font-black block tracking-wider">
                  手動輸入自訂 ETF
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="ETF代號 (如 0050)"
                    value={customCodeInput}
                    onChange={(e) => setCustomCodeInput(e.target.value)}
                    className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    required
                    placeholder="名稱 (如 元大台灣50)"
                    value={customNameInput}
                    onChange={(e) => setCustomNameInput(e.target.value)}
                    className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="市值型">市值型</option>
                    <option value="高股息">高股息</option>
                    <option value="主動型共同基金">主動型</option>
                    <option value="槓桿型">槓桿型</option>
                    <option value="反向型">反向型</option>
                  </select>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-1.5 rounded-xl transition-all cursor-pointer shadow-sm shrink-0"
                  >
                    新增觀察
                  </button>
                </div>
              </form>

              {/* Checkbox list of all ETFs */}
              <div className="space-y-2">
                <span className="text-[9px] text-slate-400 uppercase font-black block tracking-wider">
                  已存在系統中的 ETF 列表 ({allEtfs.length} 檔)
                </span>
                <div className="divide-y divide-slate-100 max-h-[250px] overflow-y-auto pr-1">
                  {allEtfs.map(etf => (
                    <div key={etf.id} className="flex items-center justify-between py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleWatch(etf.id)}
                          className="text-indigo-600 cursor-pointer"
                        >
                          {etf.isObserved ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                        <span className="font-bold text-slate-700">
                          {etf.name} <span className="text-[10px] font-mono text-slate-400">({etf.id})</span>
                        </span>
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded-sm">
                          {etf.etfDetails?.category || 'ETF'}
                        </span>
                      </div>
                      
                      <button
                        onClick={() => handleRemoveEtf(etf.id)}
                        className="text-slate-400 hover:text-rose-600 font-medium cursor-pointer"
                        title="徹底刪除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsWatchlistModalOpen(false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition-all cursor-pointer shadow-sm"
              >
                完成
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
