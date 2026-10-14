import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Check, TrendingUp, Sparkles, X } from 'lucide-react';
import { searchTaiwanStocks, TAIWAN_STOCKS_DATABASE, StockSearchItem } from '../data/taiwanStocks';

interface StockSearchAutocompleteProps {
  onSelectStock: (id: string, name: string, category?: string) => void;
  observedIds: string[];
  placeholder?: string;
  className?: string;
}

export default function StockSearchAutocomplete({
  onSelectStock,
  observedIds,
  placeholder = "搜尋股票代號或名稱 (如 2330, 台積電, 00940, 高股息)...",
  className = ""
}: StockSearchAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [onlineInfo, setOnlineInfo] = useState<{ id: string; name: string; category?: string } | null>(null);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter search results
  const results = searchTaiwanStocks(query);
  const isExactMatchInDb = TAIWAN_STOCKS_DATABASE.some(s => s.id.toUpperCase() === query.trim().toUpperCase());
  const isCodeFormat = /^[A-Z0-9.]+$/i.test(query.trim()) && query.trim().length >= 3;

  // Auto-fetch Chinese corresponding name from backend/TWSE for any code
  useEffect(() => {
    const clean = query.trim().toUpperCase();
    if (!isCodeFormat) {
      setOnlineInfo(null);
      setIsSearchingOnline(false);
      return;
    }

    // If already in local DB, use it directly
    const localMatch = TAIWAN_STOCKS_DATABASE.find(s => s.id.toUpperCase() === clean);
    if (localMatch) {
      setOnlineInfo({
        id: localMatch.id,
        name: localMatch.name,
        category: localMatch.market === 'ETF' ? localMatch.category : undefined
      });
      setIsSearchingOnline(false);
      return;
    }

    let isMounted = true;
    setIsSearchingOnline(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock/${encodeURIComponent(clean)}/info`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.success && data.name && !data.name.startsWith('台股 ')) {
            setOnlineInfo({
              id: clean,
              name: data.name,
              category: data.isEtf ? 'ETF' : undefined
            });
          } else {
            setOnlineInfo(null);
          }
        }
      } catch (e) {
        // ignore
      } finally {
        if (isMounted) setIsSearchingOnline(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query, isCodeFormat]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: StockSearchItem) => {
    onSelectStock(item.id, item.name, item.market === 'ETF' ? item.category : undefined);
    setQuery('');
    setIsOpen(false);
  };

  const handleAddCustom = async () => {
    const clean = query.trim().toUpperCase();
    if (!clean) return;
    
    // Check if onlineInfo is available
    if (onlineInfo && onlineInfo.id === clean && onlineInfo.name) {
      onSelectStock(clean, onlineInfo.name, onlineInfo.category);
      setQuery('');
      setIsOpen(false);
      return;
    }

    const match = TAIWAN_STOCKS_DATABASE.find(s => s.id.toUpperCase() === clean);
    let name = match ? match.name : '';
    let category = match && match.market === 'ETF' ? match.category : (clean.startsWith('00') ? 'ETF' : undefined);

    if (!name) {
      try {
        const res = await fetch(`/api/stock/${encodeURIComponent(clean)}/info`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.name && !data.name.startsWith('台股 ')) {
            name = data.name;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (!name) {
      name = `台股 ${clean}`;
    }

    onSelectStock(clean, name, category);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-indigo-500 absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-indigo-500 text-slate-800 placeholder-slate-400 text-xs rounded-xl focus:outline-none transition-all font-bold shadow-2xs"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown Popup */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1 text-indigo-600">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              搜尋結果 ({results.length} 個匹配項目)
            </span>
            <span className="text-[10px] text-slate-400">點擊即加入觀察清單</span>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
            {results.length > 0 ? (
              results.map((item) => {
                const isObserved = observedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="px-3.5 py-2.5 hover:bg-indigo-50/60 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="bg-indigo-600 text-white font-mono font-black text-xs px-2 py-0.5 rounded-lg shadow-2xs shrink-0">
                        {item.id}
                      </span>
                      <div className="truncate">
                        <span className="text-xs font-black text-slate-800 group-hover:text-indigo-900 block truncate">
                          {item.name}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold mt-0.5">
                          <span className={`px-1 rounded text-[9px] font-bold ${
                            item.market === 'ETF' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.market}
                          </span>
                          <span>•</span>
                          <span>{item.category}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`ml-2 px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all shrink-0 ${
                        isObserved 
                          ? 'bg-slate-100 text-slate-500 border border-slate-200' 
                          : 'bg-indigo-600 group-hover:bg-indigo-700 text-white shadow-2xs'
                      }`}
                    >
                      {isObserved ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>已觀察</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>加入</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 font-bold">
                資料庫中無直接匹配項目
              </div>
            )}

            {/* Custom Code Entry Fallback */}
            {isCodeFormat && !isExactMatchInDb && (
              <div
                onClick={handleAddCustom}
                className="p-3 bg-indigo-50/70 hover:bg-indigo-100/80 border-t border-indigo-100 text-indigo-950 transition-all cursor-pointer flex items-center justify-between text-xs font-bold"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    {onlineInfo ? (
                      <div>
                        <span className="text-[10px] text-emerald-600 font-black block">✓ 已自動抓取官方中文名稱</span>
                        <span className="font-black text-slate-800">{onlineInfo.name}</span>
                        <span className="font-mono text-indigo-600 ml-1.5 font-black">({onlineInfo.id})</span>
                      </div>
                    ) : isSearchingOnline ? (
                      <span className="text-slate-500">
                        正在向臺灣證券交易所 (TWSE) 查詢官方中文名稱...
                      </span>
                    ) : (
                      <span>
                        新增代號: <span className="font-mono font-black text-indigo-700">{query.trim().toUpperCase()}</span>
                      </span>
                    )}
                  </div>
                </div>
                <span className="bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0">
                  ＋ 加入觀察
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
