/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Settings, RefreshCcw, Copy, Check, Play, Pause, ChevronRight } from 'lucide-react';
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
}

export default function PortfolioStats({
  stocks,
  market,
  onToggleSimulation,
  onSetSpeed,
  onSetMarketBias,
  marketBias,
  onCopyAIPrompt,
  isCopied
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
            一鍵打包當前 26 檔個股報價與損益，貼給 ChatGPT/Claude 進行資產配置與 CAN SLIM 深度診斷！
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
  );
}
