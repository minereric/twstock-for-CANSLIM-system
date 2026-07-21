/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, Trash2, ShieldAlert, Sparkles, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { AlertRule, Stock, IndicatorType, AlertCondition } from '../types';

interface AlertManagerProps {
  stocks: Stock[];
  rules: AlertRule[];
  onAddRule: (rule: Omit<AlertRule, 'id' | 'createdAt'>) => void;
  onToggleRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
}

export default function AlertManager({
  stocks,
  rules,
  onAddRule,
  onToggleRule,
  onDeleteRule
}: AlertManagerProps) {
  const [selectedStockId, setSelectedStockId] = useState<string>(stocks[0]?.id || '');
  const [indicator, setIndicator] = useState<IndicatorType>('price');
  const [condition, setCondition] = useState<AlertCondition>('gt');
  const [value, setValue] = useState<string>('');

  // Auto-adjust condition suggestions based on indicator choice
  const handleIndicatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ind = e.target.value as IndicatorType;
    setIndicator(ind);
    
    if (ind === 'macd_cross' || ind === 'kd_cross' || ind === 'ma_cross') {
      setCondition('cross_up');
      setValue('0'); // Crossovers don't need threshold input, they are binary
    } else if (ind === 'rsi') {
      setCondition('gt');
      setValue('70'); // Common overbought threshold
    } else {
      setCondition('gt');
      // Default price threshold based on stock price
      const stock = stocks.find(s => s.id === selectedStockId);
      if (stock) {
        setValue(String(Math.round(stock.price * 1.05)));
      } else {
        setValue('');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockId) return;
    
    const stock = stocks.find(s => s.id === selectedStockId);
    if (!stock) return;

    const numericValue = parseFloat(value);
    if (isNaN(numericValue) && !['macd_cross', 'kd_cross', 'ma_cross'].includes(indicator)) return;

    onAddRule({
      stockId: selectedStockId,
      stockName: stock.name,
      indicator,
      condition,
      value: ['macd_cross', 'kd_cross', 'ma_cross'].includes(indicator) ? 0 : numericValue,
      isActive: true
    });

    // Reset value field based on current settings
    setValue('');
  };

  const getIndicatorName = (ind: IndicatorType) => {
    switch (ind) {
      case 'price': return '價格 (NT$)';
      case 'change_pct': return '單日漲跌幅 (%)';
      case 'rsi': return 'RSI 指標';
      case 'kd_k': return 'KD K值';
      case 'kd_d': return 'KD D值';
      case 'macd_hist': return 'MACD 柱狀值';
      case 'macd_cross': return 'MACD 多空交叉';
      case 'kd_cross': return 'KD 交叉';
      case 'ma_cross': return '均線(5MA/20MA) 交叉';
    }
  };

  const getConditionName = (cond: AlertCondition) => {
    switch (cond) {
      case 'gt': return '大於 (>)';
      case 'lt': return '小於 (<)';
      case 'cross_up': return '黃金交叉 (向上突破)';
      case 'cross_down': return '死亡交叉 (向下破線)';
    }
  };

  // Helper to suggest standard values based on selected indicator
  const setQuickValue = (val: number) => {
    setValue(String(val));
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <div className="bg-rose-50 p-2 rounded-xl text-rose-600 border border-rose-100">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">指標警示設定</h2>
          <p className="text-xs text-slate-500">當達到特定技術面指標時，盤中發送即時推播</p>
        </div>
      </div>

      {/* Alert Rule Builder Form */}
      <form onSubmit={handleSubmit} className="bg-slate-50/50 p-4 border border-slate-100 rounded-xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Stock Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-slate-500 font-bold font-display">追蹤標的</label>
            <select
              value={selectedStockId}
              onChange={(e) => {
                setSelectedStockId(e.target.value);
                const stock = stocks.find(s => s.id === e.target.value);
                if (stock && indicator === 'price') {
                  setValue(String(Math.round(stock.price * 1.05)));
                }
              }}
              className="px-3 py-2 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-sm"
            >
              {stocks.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>

          {/* Indicator Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-slate-500 font-bold font-display">指標類別</label>
            <select
              value={indicator}
              onChange={handleIndicatorChange}
              className="px-3 py-2 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-sm"
            >
              <option value="price">價格 (NT$)</option>
              <option value="change_pct">單日漲跌幅 (%)</option>
              <option value="rsi">RSI 指標 (14日)</option>
              <option value="kd_k">KD K值</option>
              <option value="kd_d">KD D值</option>
              <option value="macd_hist">MACD 柱狀值</option>
              <option value="macd_cross">MACD 雙線交叉</option>
              <option value="kd_cross">KD 黃金/死亡交叉</option>
              <option value="ma_cross">均線 (5MA/20MA) 交叉</option>
            </select>
          </div>

          {/* Condition Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-slate-500 font-bold font-display">觸發條件</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as AlertCondition)}
              className="px-3 py-2 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500 transition-all cursor-pointer shadow-sm"
            >
              {['macd_cross', 'kd_cross', 'ma_cross'].includes(indicator) ? (
                <>
                  <option value="cross_up">黃金交叉 (向上突破)</option>
                  <option value="cross_down">死亡交叉 (向下破線)</option>
                </>
              ) : (
                <>
                  <option value="gt">大於 (&gt;)</option>
                  <option value="lt">小於 (&lt;)</option>
                </>
              )}
            </select>
          </div>

          {/* Value Input */}
          {!['macd_cross', 'kd_cross', 'ma_cross'].includes(indicator) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-slate-500 font-bold font-display flex justify-between">
                <span>臨界數值</span>
                {indicator === 'rsi' && (
                  <span className="text-[10px] text-indigo-600 flex gap-2">
                    <button type="button" onClick={() => setQuickValue(70)} className="hover:underline">過熱(70)</button>
                    <button type="button" onClick={() => setQuickValue(30)} className="hover:underline">超賣(30)</button>
                  </span>
                )}
                {indicator === 'kd_k' && (
                  <span className="text-[10px] text-indigo-600 flex gap-2">
                    <button type="button" onClick={() => setQuickValue(80)} className="hover:underline">高檔(80)</button>
                    <button type="button" onClick={() => setQuickValue(20)} className="hover:underline">低檔(20)</button>
                  </span>
                )}
              </label>
              <input
                type="number"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="例如: 1050"
                className="px-3 py-2 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500 transition-all placeholder-slate-400 shadow-sm"
                required
              />
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
          <div className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-slate-300" />
            <span>自動定時與模擬掃描，偵測技術指標突破點</span>
          </div>
          <button
            type="submit"
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:opacity-95 text-white font-bold rounded-lg text-xs shadow-md shadow-rose-500/10 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>建立警示條件</span>
          </button>
        </div>
      </form>

      {/* Rules List */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-700 font-display">目前監控中的警示清單 ({rules.length})</h3>
        
        {rules.length === 0 ? (
          <div className="py-8 border border-dashed border-slate-200 bg-slate-50/50 rounded-xl flex flex-col items-center justify-center text-center text-slate-400">
            <AlertCircle className="w-6 h-6 text-slate-300 mb-1.5" />
            <p className="text-xs font-medium text-slate-600">尚無建立任何警示規則</p>
            <p className="text-[10px] text-slate-400 mt-0.5">在上方的欄位為您的個股建立技術指標監控條件</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                  rule.isActive 
                    ? 'bg-indigo-50/20 border-slate-200/80 text-slate-700 shadow-sm' 
                    : 'bg-slate-50/40 border-slate-100 text-slate-400'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-800">
                      {rule.stockName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {rule.stockId}
                    </span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-500">
                    <span className="text-indigo-600 font-bold">{getIndicatorName(rule.indicator)}</span>{' '}
                    <span>{getConditionName(rule.condition)}</span>{' '}
                    {!['macd_cross', 'kd_cross', 'ma_cross'].includes(rule.indicator) && (
                      <span className="font-mono text-amber-600 font-bold bg-amber-50 px-1 rounded">{rule.value}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Toggle Rule */}
                  <button
                    onClick={() => onToggleRule(rule.id)}
                    className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-all cursor-pointer"
                    title={rule.isActive ? '停用此警示' : '啟用此警示'}
                  >
                    {rule.isActive ? (
                      <ToggleRight className="w-6 h-6 text-indigo-600" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-slate-300" />
                    )}
                  </button>

                  {/* Delete Rule */}
                  <button
                    onClick={() => onDeleteRule(rule.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all cursor-pointer"
                    title="刪除規則"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
