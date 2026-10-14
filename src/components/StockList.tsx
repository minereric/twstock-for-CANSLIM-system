/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, TrendingUp, TrendingDown, Eye, Filter, Bell, AlertCircle, ShoppingCart, Trash2, Plus, X, Edit2, Check } from 'lucide-react';
import { Stock } from '../types';
import StockSearchAutocomplete from './StockSearchAutocomplete';

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
  onRemove,
  onUpdateStockName,
  onResetStockName
}: {
  stock: Stock;
  isSelected: boolean;
  onSelect: () => void;
  activeAlertsCount: number;
  onRemove: () => void;
  onUpdateStockName?: (id: string, newName: string) => void;
  onResetStockName?: (id: string) => void;
  key?: React.Key;
}) => {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(stock.name);
  const prevPrice = useRef(stock.price);

  useEffect(() => {
    setTempName(stock.name);
    setIsEditingName(false);
  }, [stock.name, stock.id]);

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
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stock.shares > 0 ? 'bg-indigo-600 shadow-[0_0_6px_rgba(79,70,229,0.4)]' : 'bg-slate-300'}`} />
          <div className="min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (onUpdateStockName && tempName.trim()) {
                        onUpdateStockName(stock.id, tempName.trim());
                      }
                      setIsEditingName(false);
                    } else if (e.key === 'Escape') {
                      setTempName(stock.name);
                      setIsEditingName(false);
                    }
                  }}
                  className="bg-white border-2 border-indigo-500 rounded px-1.5 py-0.5 text-xs font-bold text-slate-800 outline-none w-28"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    if (onUpdateStockName && tempName.trim()) {
                      onUpdateStockName(stock.id, tempName.trim());
                    }
                    setIsEditingName(false);
                  }}
                  className="text-emerald-600 hover:bg-emerald-50 p-0.5 rounded cursor-pointer"
                  title="儲存"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTempName(stock.name);
                    setIsEditingName(false);
                  }}
                  className="text-slate-400 hover:bg-slate-100 p-0.5 rounded cursor-pointer"
                  title="取消"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="font-bold text-slate-900 flex items-center gap-1.5 group">
                <span className="truncate">{stock.name}</span>
                {stock.shares > 0 && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded font-black shrink-0 font-mono" title={`庫存持股: ${stock.shares.toLocaleString()}股, 成本 NT$ ${stock.cost}`}>
                    持股 {stock.shares >= 1000 ? `${(stock.shares / 1000).toFixed(0)}張` : `${stock.shares}股`}
                  </span>
                )}
                {onUpdateStockName && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTempName(stock.name);
                      setIsEditingName(true);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity p-0.5 rounded cursor-pointer"
                    title="修改股票名稱"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
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

      {/* Delete Action */}
      <td className="py-3 px-4 text-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-slate-350 hover:text-rose-600 transition-colors p-1 rounded hover:bg-rose-50 cursor-pointer"
          title="移除此觀察個股"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
};

// Compact card version of stocks for responsive views
const StockCard = ({
  stock,
  isSelected,
  onSelect,
  activeAlertsCount,
  onUpdateStockName
}: {
  stock: Stock;
  isSelected: boolean;
  onSelect: () => void;
  activeAlertsCount: number;
  onUpdateStockName?: (id: string, newName: string) => void;
  key?: React.Key;
}) => {
  const isUp = stock.change >= 0;
  const [isEditing, setIsEditing] = useState(false);
  const [cardNameInput, setCardNameInput] = useState(stock.name);

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
            {isEditing ? (
              <div className="flex items-center gap-1 my-1" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  value={cardNameInput}
                  onChange={e => setCardNameInput(e.target.value)}
                  className="bg-white border-2 border-indigo-500 rounded px-1.5 py-0.5 text-xs font-bold w-24 outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    if (onUpdateStockName && cardNameInput.trim()) {
                      onUpdateStockName(stock.id, cardNameInput.trim());
                    }
                    setIsEditing(false);
                  }}
                  className="text-emerald-600 p-0.5"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5 group">
                <span>{stock.name}</span>
                {stock.shares > 0 && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 rounded font-bold">
                    已持
                  </span>
                )}
                {onUpdateStockName && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCardNameInput(stock.name);
                      setIsEditing(true);
                    }}
                    className="text-slate-400 hover:text-indigo-600 p-0.5 rounded cursor-pointer"
                    title="修改名稱"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </h3>
            )}
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
  onAddStock: (id: string, name: string) => void;
  onRemoveStock: (id: string) => void;
  onUpdateStockName?: (id: string, newName: string) => void;
  onResetStockName?: (id: string) => void;
}

export default function StockList({
  stocks,
  selectedStockId,
  onSelectStock,
  rulesCountMap,
  onAddStock,
  onRemoveStock,
  onUpdateStockName,
  onResetStockName
}: StockListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'watch_only' | 'etf_only' | 'owned_only'>('all');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [isAddingOpen, setIsAddingOpen] = useState(false);

  // Filter stocks based on search and tab selections
  const filteredStocks = stocks.filter((stock) => {
    const isObs = stock.isObserved !== false;
    const matchesSearch = 
      stock.name.includes(searchQuery) || 
      stock.id.includes(searchQuery);

    if (!matchesSearch) return false;

    if (activeTab === 'owned_only') {
      return stock.shares > 0;
    }
    if (activeTab === 'etf_only') {
      return stock.etfDetails !== undefined && isObs;
    }
    if (activeTab === 'watch_only') {
      return stock.shares === 0 && stock.etfDetails === undefined && isObs;
    }
    return isObs || stock.shares > 0;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    onAddStock(newCode.trim(), newName.trim());
    setNewCode('');
    setNewName('');
    setIsAddingOpen(false);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm flex flex-col overflow-hidden">
      {/* Top action toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 font-display">台股雷達板 ({stocks.filter(s => s.isObserved !== false).length}檔觀察)</h2>
          <p className="text-xs text-slate-500">檢視技術指標診斷、CAN SLIM 綜合診斷與籌碼狀況概述</p>
        </div>

        {/* Search & Add Stock Autocomplete */}
        <div className="flex gap-2 w-full md:w-80 shrink-0">
          <StockSearchAutocomplete
            observedIds={stocks.filter(s => s.isObserved !== false).map(s => s.id)}
            onSelectStock={(id, name) => {
              onAddStock(id, name);
              onSelectStock(id);
            }}
            placeholder="搜尋代號或名稱 (如 2330, 台積電, 00940)..."
          />

          <button
            onClick={() => setIsAddingOpen(!isAddingOpen)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-sm shrink-0"
          >
            {isAddingOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            手動新增
          </button>
        </div>
      </div>

      {/* Slide-out or Dropdown Stock Addition Form */}
      {isAddingOpen && (
        <form onSubmit={handleAddSubmit} className="bg-slate-50 p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">代號 (例如：2454):</label>
            <input
              type="text"
              required
              placeholder="輸入股票代號..."
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="w-full bg-white border border-slate-200 px-3 py-1.5 text-xs rounded-xl focus:outline-none focus:border-indigo-500 font-bold text-slate-700"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">名稱 (例如：聯發科):</label>
            <input
              type="text"
              required
              placeholder="輸入股票名稱..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-white border border-slate-200 px-3 py-1.5 text-xs rounded-xl focus:outline-none focus:border-indigo-500 font-bold text-slate-700"
            />
          </div>
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer shrink-0"
          >
            確定新增
          </button>
        </form>
      )}

      {/* Filters (過濾器功能) */}
      <div className="px-4 border-b border-slate-100 bg-slate-50 flex overflow-x-auto gap-2 py-2 text-xs font-bold">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          (1) 全部顯示 ({stocks.filter(s => s.isObserved !== false || s.shares > 0).length})
        </button>
        <button
          onClick={() => setActiveTab('watch_only')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'watch_only' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          (2) 僅看觀察個股 ({stocks.filter(s => s.shares === 0 && s.etfDetails === undefined && s.isObserved !== false).length})
        </button>
        <button
          onClick={() => setActiveTab('etf_only')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'etf_only' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          (3) 僅看 ETF ({stocks.filter(s => s.etfDetails !== undefined && s.isObserved !== false).length})
        </button>
        <button
          onClick={() => setActiveTab('owned_only')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'owned_only' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          (4) 僅看持有股 ({stocks.filter(s => s.shares > 0).length})
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
                  <th className="py-3 px-4 text-right">即時股價</th>
                  <th className="py-3 px-4 text-right">單日漲幅</th>
                  <th className="py-3 px-4 text-center">10日趨勢縮圖</th>
                  <th className="py-3 px-4 text-center">操作</th>
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
                    onRemove={() => onRemoveStock(stock.id)}
                    onUpdateStockName={onUpdateStockName}
                    onResetStockName={onResetStockName}
                  />
                ))}
              </tbody>
            </table>

            {/* Mobile Card Grid View */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 md:hidden">
              {filteredStocks.map((stock) => (
                <div key={stock.id} className="relative group">
                  <StockCard
                    stock={stock}
                    isSelected={stock.id === selectedStockId}
                    onSelect={() => onSelectStock(stock.id)}
                    activeAlertsCount={rulesCountMap[stock.id] || 0}
                    onUpdateStockName={onUpdateStockName}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveStock(stock.id);
                    }}
                    className="absolute top-2 right-2 text-slate-300 hover:text-rose-600 bg-white/80 p-1.5 rounded-full border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
                    title="移除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
