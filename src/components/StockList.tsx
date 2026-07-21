/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, TrendingUp, TrendingDown, Eye, Filter, Bell, AlertCircle, ShoppingCart } from 'lucide-react';
import { Stock } from '../types';

// Sparkline SVG Helper
const Sparkline = ({ data }: { data: number[] }) => {
  if (data.length === 0) return null;
  const lastTen = data.slice(-12);
  const min = Math.min(...lastTen);
  const max = Math.max(...lastTen);
  const range = max - min === 0 ? 1 : max - min;
  const width = 70;
  const height = 20;
  const points = lastTen.map((val, idx) => {
    const x = (idx / (lastTen.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const isUp = lastTen[lastTen.length - 1] >= lastTen[0];
  const strokeColor = isUp ? '#10b981' : '#f43f5e';

  return (
    <svg width={width} height={height} className="opacity-90">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

// Row Subcomponent with Flash Effect
const StockRow = ({
  stock,
  isSelected,
  onSelect,
  activeAlertsCount,
}: {
  stock: Stock;
  isSelected: boolean;
  onSelect: () => void;
  activeAlertsCount: number;
  key?: React.Key;
}) => {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPrice = useRef(stock.price);

  useEffect(() => {
    if (stock.price > prevPrice.current) {
      setFlash('up');
      const timer = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(timer);
    } else if (stock.price < prevPrice.current) {
      setFlash('down');
      const timer = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(timer);
    }
    prevPrice.current = stock.price;
  }, [stock.price]);

  const pnl = stock.shares > 0 ? (stock.price - stock.cost) * stock.shares : 0;
  const pnlPct = stock.shares > 0 && stock.cost > 0 ? ((stock.price - stock.cost) / stock.cost) * 100 : 0;

  // Technical Indicators status labels
  const rsi = stock.indicators.rsi;
  const rsiClass = rsi >= 70 
    ? 'text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100' 
    : rsi <= 30 
      ? 'text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100' 
      : 'text-slate-600';

  const k = stock.indicators.kd.k;
  const d = stock.indicators.kd.d;
  const kdCrossLabel = k > d ? 'K > D 多' : 'K < D 空';
  const kdCrossClass = k > d ? 'text-emerald-600 bg-emerald-50 border border-emerald-100' : 'text-rose-600 bg-rose-50 border border-rose-100';

  const macdHist = stock.indicators.macd.hist;
  const macdClass = macdHist >= 0 ? 'text-emerald-600' : 'text-rose-600';

  let flashBg = '';
  if (flash === 'up') flashBg = 'bg-emerald-500/10';
  if (flash === 'down') flashBg = 'bg-rose-500/10';

  return (
    <tr
      onClick={onSelect}
      className={`border-b border-slate-100 hover:bg-slate-50 transition-all cursor-pointer text-xs ${
        isSelected ? 'bg-indigo-50/40 border-l-2 border-l-indigo-600 font-medium' : ''
      } ${flashBg}`}
    >
      {/* Code and Name with custom status dots */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${stock.shares > 0 ? 'bg-indigo-600 shadow-[0_0_6px_rgba(79,70,229,0.4)]' : 'bg-slate-300'}`} />
          <div>
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <span>{stock.name}</span>
              {stock.shares > 0 && (
                <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.2 rounded font-black">
                  已持
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{stock.id}</div>
          </div>
        </div>
      </td>

      {/* Price & Change */}
      <td className="py-3 px-4 font-mono font-bold text-right text-slate-900">
        NT$ {stock.price.toFixed(2)}
      </td>
      <td className={`py-3 px-4 font-mono font-bold text-right ${stock.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
        {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
      </td>

      {/* Real-time Sparkline */}
      <td className="py-3 px-4 text-center">
        <div className="flex justify-center">
          <Sparkline data={stock.history} />
        </div>
      </td>
    </tr>
  );
};

// Compact card version of stocks for responsive views
const StockCard = ({
  stock,
  isSelected,
  onSelect,
  activeAlertsCount
}: {
  stock: Stock;
  isSelected: boolean;
  onSelect: () => void;
  activeAlertsCount: number;
  key?: React.Key;
}) => {
  const isUp = stock.change >= 0;

  return (
    <div
      onClick={onSelect}
      className={`p-4 bg-white border rounded-2xl cursor-pointer transition-all flex flex-col gap-3 ${
        isSelected 
          ? 'border-indigo-500 shadow-md bg-indigo-50/10' 
          : 'border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/40'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stock.shares > 0 ? 'bg-indigo-600 shadow-[0_0_6px_rgba(79,70,229,0.4)]' : 'bg-slate-300'}`} />
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              {stock.name}
              {stock.shares > 0 && (
                <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 rounded font-bold">
                  已持
                </span>
              )}
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">{stock.id}</span>
          </div>
        </div>

        <div className="text-right">
          <p className="font-mono font-bold text-sm text-slate-900">NT$ {stock.price.toFixed(2)}</p>
          <p className={`text-xs font-mono font-bold mt-0.5 flex items-center justify-end gap-0.5 ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isUp ? '+' : ''}{stock.change.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-100 text-center">
        <div>
          <p className="text-[9px] text-slate-400 font-medium">RSI指標</p>
          <p className={`font-mono font-bold text-xs mt-0.5 ${
            stock.indicators.rsi >= 70 ? 'text-rose-600' : stock.indicators.rsi <= 30 ? 'text-emerald-600' : 'text-slate-700'
          }`}>
            {stock.indicators.rsi.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-400 font-medium">KD趨勢</p>
          <p className={`text-[10px] font-bold mt-0.5 ${stock.indicators.kd.k > stock.indicators.kd.d ? 'text-emerald-600' : 'text-rose-600'}`}>
            {stock.indicators.kd.k > stock.indicators.kd.d ? '多頭 ↗' : '空頭 ↘'}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-400 font-medium">MACD能量</p>
          <p className={`font-mono text-xs mt-0.5 ${stock.indicators.macd.hist >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {stock.indicators.macd.hist.toFixed(1)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
        <Sparkline data={stock.history} />
        {activeAlertsCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-lg font-bold">
            <Bell className="w-3 h-3 text-rose-500" />
            <span>{activeAlertsCount}個警示</span>
          </span>
        )}
      </div>
    </div>
  );
};

interface StockListProps {
  stocks: Stock[];
  selectedStockId: string;
  onSelectStock: (id: string) => void;
  rulesCountMap: Record<string, number>;
}

export default function StockList({
  stocks,
  selectedStockId,
  onSelectStock,
  rulesCountMap
}: StockListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'owned' | 'watchlist' | 'overheat'>('all');

  // Filter stocks based on search and tab selections
  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch = 
      stock.name.includes(searchQuery) || 
      stock.id.includes(searchQuery);

    if (!matchesSearch) return false;

    if (activeTab === 'owned') {
      return stock.shares > 0;
    }
    if (activeTab === 'watchlist') {
      return stock.shares === 0;
    }
    if (activeTab === 'overheat') {
      // Return stocks that are technically overbought, oversold, or have triggered alert configurations
      return stock.indicators.rsi >= 70 || stock.indicators.rsi <= 30 || rulesCountMap[stock.id] > 0;
    }
    return true;
  });

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm flex flex-col overflow-hidden">
      {/* Top action toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 font-display">台股觀察雷達板 (26檔熱門)</h2>
          <p className="text-xs text-slate-500">點擊個股可檢視 KD、RSI、MACD 趨勢圖與 CAN SLIM 操作建議</p>
        </div>

        {/* Search */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋代號或名稱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 text-xs rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-slate-100 bg-slate-50 flex overflow-x-auto gap-2 py-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'all' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/10' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          全部標的 ({stocks.length})
        </button>
        <button
          onClick={() => setActiveTab('owned')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'owned' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/10' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          庫存持股 ({stocks.filter(s => s.shares > 0).length})
        </button>
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'watchlist' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/10' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          潛在觀察 ({stocks.filter(s => s.shares === 0).length})
        </button>
        <button
          onClick={() => setActiveTab('overheat')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'overheat' ? 'bg-indigo-600 text-white font-black shadow-sm shadow-indigo-600/10' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          過熱/警示 ({stocks.filter(s => s.indicators.rsi >= 70 || s.indicators.rsi <= 30 || rulesCountMap[s.id] > 0).length})
        </button>
      </div>

      {/* Table view for Desktop, Grid view for Mobile */}
      <div className="flex-1 overflow-x-auto">
        {filteredStocks.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <AlertCircle className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">查無對應的股票標的</p>
            <p className="text-xs text-slate-400 mt-1">請調整您的篩選條件或搜尋關鍵字</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <table className="w-full text-left border-collapse hidden md:table">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">股名與代號</th>
                  <th className="py-3 px-4 text-right">即時現價</th>
                  <th className="py-3 px-4 text-right">單日漲跌 %</th>
                  <th className="py-3 px-4 text-center">10日趨勢</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((stock) => (
                  <StockRow
                    key={stock.id}
                    stock={stock}
                    isSelected={stock.id === selectedStockId}
                    onSelect={() => onSelectStock(stock.id)}
                    activeAlertsCount={rulesCountMap[stock.id] || 0}
                  />
                ))}
              </tbody>
            </table>

            {/* Mobile Card Grid View */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 md:hidden">
              {filteredStocks.map((stock) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  isSelected={stock.id === selectedStockId}
                  onSelect={() => onSelectStock(stock.id)}
                  activeAlertsCount={rulesCountMap[stock.id] || 0}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
