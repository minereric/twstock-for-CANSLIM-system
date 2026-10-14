/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Settings, RefreshCcw, Copy, Check, Play, Pause, ChevronRight, PieChart, ArrowUpRight, Sparkles } from 'lucide-react';
import { Stock, MarketState } from '../types';

interface PortfolioStatsProps {
  stocks: Stock[];
  market: MarketState;
  onToggleSimulation: () => void;
  onSetSpeed: (speed: 'realtime' | 'fast' | 'paused') => void;
  onSetMarketBias: (bias: number) => void;
  marketBias: number; // -1 to 1 representing bearish to bullish
  onCopyAIPrompt: () => void;
  isCopied: boolean;
  onSelectStock?: (id: string) => void;
  onNavigateToDashboard?: (id: string) => void;
}

export default function PortfolioStats({
  stocks,
  market,
  onToggleSimulation,
  onSetSpeed,
  onSetMarketBias,
  marketBias,
  onCopyAIPrompt,
  isCopied,
  onSelectStock,
  onNavigateToDashboard
}: PortfolioStatsProps) {
  
  // Compute portfolio values
  const portfolioStocks = stocks.filter(s => s.shares > 0);
  
  const totalCost = portfolioStocks.reduce((acc, s) => acc + (s.cost * s.shares), 0);
  const totalValue = portfolioStocks.reduce((acc, s) => acc + (s.price * s.shares), 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // Render TAIEX status color
  const taiexIsUp = market.change >= 0;

  return (
    <div className="space-y-4">
      {/* Top 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Portfolio Total Wealth */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 text-slate-100 opacity-60">
            <DollarSign className="w-16 h-16" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider font-display">我的庫存總市值</p>
            <h2 className="text-2xl font-black text-slate-900 font-mono mt-1">
              NT$ {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </h2>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">投入本金: NT$ {totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span className={`font-mono font-black flex items-center gap-0.5 ${
              totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {totalPnL >= 0 ? '+' : ''}{totalPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Simulator Bias & Control Controls */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider font-display">盤勢趨勢模擬器</p>
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={() => onSetMarketBias(1.0)}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                  marketBias > 0.3 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm' 
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800'
                }`}
              >
                🐂 多頭
              </button>
              <button
                onClick={() => onSetMarketBias(0)}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                  marketBias === 0 
                    ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm' 
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800'
                }`}
              >
                ⚖️ 震盪
              </button>
              <button
                onClick={() => onSetMarketBias(-1.0)}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                  marketBias < -0.3 
                    ? 'bg-rose-50 text-rose-600 border-rose-200 shadow-sm' 
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800'
                }`}
              >
                🐻 空頭
              </button>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 font-medium">跳動速度:</span>
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
              <button
                onClick={() => onSetSpeed('paused')}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
                  market.simulationSpeed === 'paused' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                暫停
              </button>
              <button
                onClick={() => onSetSpeed('realtime')}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
                  market.simulationSpeed === 'realtime' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                1.5s
              </button>
              <button
                onClick={() => onSetSpeed('fast')}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
                  market.simulationSpeed === 'fast' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                0.3s
              </button>
            </div>
          </div>
        </div>

        {/* AI Joint Prompt Exporter */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider font-display">AI 專家決策協同</p>
            <p className="text-[11px] text-slate-600 leading-normal mt-1.5 font-medium">
              一鍵打包當前持股與觀察標的報價損益，貼給 AI 進行資產配置與 CAN SLIM 深度診斷！
            </p>
          </div>

          <button
            onClick={onCopyAIPrompt}
            className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-sm ${
              isCopied
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/10'
            }`}
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>已複製 JSON 數據！</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>一鍵複製給 AI 綜合分析</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Portfolio Holdings Allocation & Live Quotes Radar Dashboard */}
      {portfolioStocks.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-black text-slate-900 text-sm font-display flex items-center gap-2">
                <PieChart className="w-4 h-4 text-indigo-600" />
                <span>庫存持股儀表板與即時資產分佈</span>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                  共 {portfolioStocks.length} 檔持股
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                即時呈現各持股佔比、盤中最新行情與未實現損益，點擊任一標的立即於儀表板展開 K 線圖與 CAN SLIM 報告。
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 font-medium">總持股市值:</span>
              <span className="font-mono font-black text-indigo-700 text-sm">
                NT$ {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Allocation Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-bold text-slate-400">
              <span>持股佔比權重分佈 (Portfolio Allocation)</span>
              <span>100% 總持股</span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
              {portfolioStocks.map((stock, idx) => {
                const weight = totalValue > 0 ? ((stock.price * stock.shares) / totalValue) * 100 : 0;
                const colors = [
                  'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 
                  'bg-rose-500', 'bg-purple-500', 'bg-cyan-500', 'bg-blue-500', 'bg-teal-500'
                ];
                const color = colors[idx % colors.length];
                return (
                  <div
                    key={stock.id}
                    style={{ width: `${weight}%` }}
                    className={`${color} h-full transition-all hover:opacity-85 relative group`}
                    title={`${stock.name} (${stock.id}): ${weight.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            
            {/* Weight legend labels */}
            <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-bold">
              {portfolioStocks.map((stock, idx) => {
                const weight = totalValue > 0 ? ((stock.price * stock.shares) / totalValue) * 100 : 0;
                const colors = [
                  'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 
                  'bg-rose-500', 'bg-purple-500', 'bg-cyan-500', 'bg-blue-500', 'bg-teal-500'
                ];
                const color = colors[idx % colors.length];
                return (
                  <button
                    key={stock.id}
                    type="button"
                    onClick={() => {
                      if (onNavigateToDashboard) onNavigateToDashboard(stock.id);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 hover:bg-indigo-50 hover:border-indigo-300 transition-all cursor-pointer text-slate-700 group"
                  >
                    <span className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="group-hover:text-indigo-600 transition-colors">{stock.name}</span>
                    <span className="font-mono text-slate-400">({stock.id})</span>
                    <span className="font-mono font-black text-indigo-700">{weight.toFixed(1)}%</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid of Holding Cards with Real-time Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-2">
            {portfolioStocks.map((stock) => {
              const stockValue = stock.price * stock.shares;
              const stockCost = stock.cost * stock.shares;
              const pnl = stockValue - stockCost;
              const pnlPct = stockCost > 0 ? (pnl / stockCost) * 100 : 0;
              const isProfit = pnl >= 0;
              const weight = totalValue > 0 ? (stockValue / totalValue) * 100 : 0;

              return (
                <div
                  key={stock.id}
                  onClick={() => {
                    if (onNavigateToDashboard) onNavigateToDashboard(stock.id);
                  }}
                  className="bg-slate-50/70 hover:bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-3.5 shadow-2xs hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                          {stock.name}
                        </span>
                        <span className="bg-slate-200/80 text-slate-600 font-mono text-[9px] font-black px-1.5 py-0.2 rounded">
                          {stock.id}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                        佔比: {weight.toFixed(1)}% · 持有 {stock.shares.toLocaleString()} 股
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-black text-slate-900 text-xs block">
                        NT$ {stock.price.toFixed(2)}
                      </span>
                      <span className={`text-[10px] font-bold font-mono inline-flex items-center ${
                        stock.change >= 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {stock.change >= 0 ? '▲' : '▼'}{Math.abs(stock.change).toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">市值 / 成本</span>
                      <span className="font-mono font-bold text-slate-800 text-[11px]">
                        ${(stockValue / 10000).toFixed(1)}萬 / ${(stockCost / 10000).toFixed(1)}萬
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-medium">未實現損益</span>
                      <span className={`font-mono font-black text-[11px] ${
                        isProfit ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {isProfit ? '+' : ''}{pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                        ({isProfit ? '+' : ''}{pnlPct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-indigo-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-0.5">
                    <span>前往主儀表板查看走勢與指標</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
