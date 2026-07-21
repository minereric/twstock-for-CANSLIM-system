/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Sparkles, Edit2, Plus, Check, TrendingUp, TrendingDown, DollarSign, Activity, Info, BarChart2 } from 'lucide-react';
import { Stock } from '../types';
import { motion } from 'motion/react';

interface StockDetailSidebarProps {
  stock: Stock;
  stocks?: Stock[];
  onUpdatePortfolio: (id: string, shares: number, cost: number) => void;
}

export default function StockDetailSidebar({
  stock,
  stocks = [],
  onUpdatePortfolio
}: StockDetailSidebarProps) {
  const [activeTab, setActiveTab] = useState<'ma' | 'kd_rsi' | 'macd' | 'etf'>('ma');
  const [isEditingHolding, setIsEditingHolding] = useState(false);
  const [sharesInput, setSharesInput] = useState(String(stock.shares));
  const [costInput, setCostInput] = useState(String(stock.cost));

  // Reset inputs when stock changes
  useEffect(() => {
    setSharesInput(String(stock.shares));
    setCostInput(String(stock.cost || stock.price.toFixed(2)));
    setIsEditingHolding(false);
  }, [stock.id]);

  const handleSaveHoldings = (e: React.FormEvent) => {
    e.preventDefault();
    const sharesNum = parseInt(sharesInput) || 0;
    const costNum = parseFloat(costInput) || 0;
    onUpdatePortfolio(stock.id, sharesNum, costNum);
    setIsEditingHolding(false);
  };

  // 1. CAN SLIM breakouts & indicators rules-based diagnostics
  const generateAnalysisReport = () => {
    const { price, indicators, change } = stock;
    const { rsi, kd, macd, ma } = indicators;
    
    const bulletPoints: string[] = [];
    let signal: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let signalColor = 'text-slate-600 bg-slate-100 border-slate-200';

    // CAN SLIM breakouts & volume check
    if (change > 3.5) {
      bulletPoints.push("🔥 符合 CAN SLIM 'M' 盤勢：股價帶量突破盤整區，單日漲幅強勁，為強烈突破進場訊號。");
      signal = 'STRONG BUY';
      signalColor = 'text-emerald-700 bg-emerald-50 border-emerald-100 shadow-sm font-black';
    } else if (price > ma.ma5 && ma.ma5 > ma.ma20) {
      bulletPoints.push("📈 均線多頭排列：5MA 位於 20MA 之上，短線走勢偏多，適合順勢操作。");
      signal = 'BUY';
      signalColor = 'text-teal-700 bg-teal-50 border-teal-100 shadow-sm';
    }

    if (stock.id === '3481' && price <= 65.0) {
      bulletPoints.push("🛡️ 關鍵群創防線：價格已逼近或低於設定的 65.0 元長期支撐防守區，需密切注意不破底。");
      if (signal !== 'STRONG BUY') {
        signal = 'HOLD';
        signalColor = 'text-amber-700 bg-amber-50 border-amber-100 shadow-sm';
      }
    }

    if (rsi > 70) {
      bulletPoints.push("⚠️ RSI 指標超買：RSI 達到 " + rsi.toFixed(1) + "，短線進入高檔過熱區，注意回檔修正風險。");
      if (signal === 'STRONG BUY' || signal === 'BUY') {
        signal = 'HOLD';
        signalColor = 'text-amber-700 bg-amber-50 border-amber-100 shadow-sm';
      }
    } else if (rsi < 30) {
      bulletPoints.push("🛒 RSI 指標超賣：RSI 低於 " + rsi.toFixed(1) + "，短線進入超跌區，具備跌深反彈契機。");
      signal = 'BUY';
      signalColor = 'text-teal-700 bg-teal-50 border-teal-100 shadow-sm';
    }

    if (kd.k > kd.d && (kd.k < 30)) {
      bulletPoints.push("🎯 KD 低檔黃金交叉：K值 (" + kd.k.toFixed(1) + ") 向上突破 D值 (" + kd.d.toFixed(1) + ")，短線反彈動能充足。");
      if (signal === 'NEUTRAL') {
        signal = 'BUY';
        signalColor = 'text-teal-700 bg-teal-50 border-teal-100 shadow-sm';
      }
    } else if (kd.k < kd.d && (kd.k > 70)) {
      bulletPoints.push("📉 KD 高檔死亡交叉：K值跌破 D值，短線獲利回吐壓力浮現，注意拉回。");
      signal = 'SELL';
      signalColor = 'text-rose-700 bg-rose-50 border-rose-100 shadow-sm font-black';
    }

    if (stock.shares > 0 && stock.cost > 0) {
      const pnlPct = ((price - stock.cost) / stock.cost) * 100;
      if (pnlPct <= -8) {
        bulletPoints.push(`🚨 紀律防守停損：帳面損益已跌破 ${pnlPct.toFixed(1)}% (超過 -8% 停損線)，建議嚴格遵守紀律。`);
        signal = 'SELL';
        signalColor = 'text-rose-700 bg-rose-50 border-rose-100 shadow-sm font-black';
      } else if (pnlPct >= 15) {
        bulletPoints.push(`💰 獲利滿足提醒：帳面獲利已達到 +${pnlPct.toFixed(1)}%，可考慮分批停利入袋為安。`);
      }
    }

    if (bulletPoints.length === 0) {
      bulletPoints.push("⚖️ 指標中性盤整：多空指標處於均衡狀態，建議觀望，靜待指標黃金交叉或帶量突破。");
    }

    return { bulletPoints, signal, signalColor };
  };

  const { bulletPoints, signal, signalColor } = generateAnalysisReport();

  // Price chart data (Recharts)
  const chartData = stock.candleHistory.map(c => ({
    time: c.time.substring(5), // Short date (e.g., 07-01)
    close: Number(c.close.toFixed(2)),
    open: Number(c.open.toFixed(2)),
    high: Number(c.high.toFixed(2)),
    low: Number(c.low.toFixed(2)),
  }));

  const isPriceUp = stock.change >= 0;

  // Real-time interactive diagnostic text for each indicator tab (NO graph/chart as requested)
  const renderIndicatorDiagnosisText = () => {
    const { rsi, kd, macd, ma } = stock.indicators;
    const price = stock.price;

    if (activeTab === 'ma') {
      const hasBullishAlignment = price > ma.ma5 && ma.ma5 > ma.ma20;
      const hasBearishAlignment = price < ma.ma5 && ma.ma5 < ma.ma20;
      const hasMa5Drop = price < ma.ma5 && price > ma.ma20;
      const hasMa5Rebound = price > ma.ma5 && price < ma.ma20;

      let diagnosis = "";
      if (hasBullishAlignment) {
        diagnosis = `目前股價（NT$ ${price.toFixed(2)}）與均線呈現「多頭排列」（股價 > 5MA > 20MA）。股價穩守在短期均線之上，且均線趨勢向上，短線多頭力道極為強勁。`;
      } else if (hasBearishAlignment) {
        diagnosis = `目前股價（NT$ ${price.toFixed(2)}）與均線呈現「空頭排列」（股價 < 5MA < 20MA）。短期波段偏弱，上方均線形成反壓，操作上建議保守觀望。`;
      } else if (hasMa5Drop) {
        diagnosis = `目前股價跌破 5MA（NT$ ${ma.ma5.toFixed(2)}），但仍受到 20MA 月線（NT$ ${ma.ma20.toFixed(2)}）支撐。短線陷入整理，需關注月線生命線是否守穩。`;
      } else if (hasMa5Rebound) {
        diagnosis = `目前股價站上 5MA（NT$ ${ma.ma5.toFixed(2)}），但上方仍面臨 20MA（NT$ ${ma.ma20.toFixed(2)}）之壓力。此為跌深反彈訊號，需帶量突破月線方可確立回升格局。`;
      } else {
        diagnosis = `目前股價在 5MA（NT$ ${ma.ma5.toFixed(2)}）與 20MA（NT$ ${ma.ma20.toFixed(2)}）附近交織盤整，多空拉鋸，等待進一步帶量突破方向。`;
      }

      return (
        <div className="space-y-2">
          <p className="text-slate-500 leading-normal">
            <span className="font-bold text-indigo-600 block mb-1">📊 解讀方法與門檻值：</span>
            5MA (週線) 反映短線強弱，20MA (月線/生命線) 則決定中期多空趨勢。
            短期均線向上突破長期均線為「黃金交叉」（偏多）；向下跌破為「死亡交叉」（偏空）。
          </p>
          <div className="p-2.5 bg-indigo-50/40 border border-indigo-100 rounded-lg text-slate-700 font-medium">
            <strong className="text-slate-900 block mb-1">🔍 目前個股即時均線診斷：</strong>
            {diagnosis}
          </div>
        </div>
      );
    }

    if (activeTab === 'kd_rsi') {
      const isRsiOverbought = rsi >= 70;
      const isRsiOversold = rsi <= 30;
      const isKdGoldenCross = kd.k > kd.d && kd.k < 30;
      const isKdDeathCross = kd.k < kd.d && kd.k > 70;

      let rsiAnalysis = "";
      if (isRsiOverbought) {
        rsiAnalysis = `RSI 值為 ${rsi.toFixed(1)}，已進入「超買區」（≥ 70），市場熱度高，需預防高檔拉回獲利回吐。`;
      } else if (isRsiOversold) {
        rsiAnalysis = `RSI 值為 ${rsi.toFixed(1)}，已進入「超賣區」（≤ 30），短線跌深、賣壓已宣洩，隨時可能技術性反彈。`;
      } else {
        rsiAnalysis = `RSI 值為 ${rsi.toFixed(1)}，處於 30 ~ 70 中性震盪區，多空勢均力敵。`;
      }

      let kdAnalysis = "";
      if (isKdGoldenCross) {
        kdAnalysis = `KD指標（K: ${kd.k.toFixed(1)}, D: ${kd.d.toFixed(1)}）於低檔區呈現「黃金交叉」（K值大於D值），買盤湧現，是築底止跌的積極訊號。`;
      } else if (isKdDeathCross) {
        kdAnalysis = `KD指標（K: ${kd.k.toFixed(1)}, D: ${kd.d.toFixed(1)}）高檔「死亡交叉」（K值小於D值），獲利了結盤湧現，需嚴防短線回檔。`;
      } else if (kd.k > kd.d) {
        kdAnalysis = `K值（${kd.k.toFixed(1)}）大於 D值（${kd.d.toFixed(1)}），短線維持偏多發散趨勢，動能未退。`;
      } else {
        kdAnalysis = `K值（${kd.k.toFixed(1)}）小於 D值（${kd.d.toFixed(1)}），短線動能偏弱，盤勢處於整理或修正波中。`;
      }

      return (
        <div className="space-y-2">
          <p className="text-slate-500 leading-normal">
            <span className="font-bold text-indigo-600 block mb-1">📊 解讀方法與門檻值：</span>
            RSI &gt; 70 為超買，&lt; 30 為超賣。KD 指標：K 線由下而上穿過 D 值且小於 30 為黃金交叉（偏多）；K 線由上而下穿過 D 值且大於 70 為死亡交叉（偏空）。
          </p>
          <div className="p-2.5 bg-indigo-50/40 border border-indigo-100 rounded-lg text-slate-700 font-medium space-y-1">
            <strong className="text-slate-900 block mb-1">🔍 目前個股強弱指標診斷：</strong>
            <p>• {rsiAnalysis}</p>
            <p>• {kdAnalysis}</p>
          </div>
        </div>
      );
    }

    if (activeTab === 'macd') {
      const isHistPositive = macd.hist >= 0;

      let macdAnalysis = "";
      if (isHistPositive) {
        macdAnalysis = `目前柱狀體（Hist）為紅柱且值為 +${macd.hist.toFixed(2)}。多頭控制市場主導權，短中期多頭動能處於推升軌道，波段強勢。`;
      } else {
        macdAnalysis = `目前柱狀體（Hist）為綠柱且值為 ${macd.hist.toFixed(2)}。市場由空方掌控，短中期處於弱勢調整或修正波段，建議觀望。`;
      }

      const isDIFaboveDEM = macd.dif > macd.dem;
      let crossAnalysis = "";
      if (isDIFaboveDEM) {
        crossAnalysis = `快線 DIF（${macd.dif.toFixed(2)}）大於慢線 DEM（${macd.dem.toFixed(2)}），雙線呈現偏多排列。`;
      } else {
        crossAnalysis = `快線 DIF（${macd.dif.toFixed(2)}）小於慢線 DEM（${macd.dem.toFixed(2)}），呈現死亡交叉狀態，修正期尚未明朗。`;
      }

      return (
        <div className="space-y-2">
          <p className="text-slate-500 leading-normal">
            <span className="font-bold text-indigo-600 block mb-1">📊 解讀方法與門檻值：</span>
            MACD 著重中長期波段。柱狀體 (Hist) 代表多空加速度：由負翻正為紅柱拉長（多頭力道增強），由正翻負為綠柱拉長（空頭力道增強）。
          </p>
          <div className="p-2.5 bg-indigo-50/40 border border-indigo-100 rounded-lg text-slate-700 font-medium space-y-1">
            <strong className="text-slate-900 block mb-1">🔍 目前個股 MACD 量能診斷：</strong>
            <p>• {macdAnalysis}</p>
            <p>• {crossAnalysis}</p>
          </div>
        </div>
      );
    }

    if (activeTab === 'etf' && stock.etfDetails) {
      const etf = stock.etfDetails;
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-center text-[11px] mb-2">
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="text-slate-400 block">預估淨值 (NAV)</span>
              <strong className="text-slate-800 font-mono text-xs">NT$ {etf.estimatedNav.toFixed(2)}</strong>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="text-slate-400 block">即時折溢價率</span>
              <strong className={`font-mono text-xs ${etf.discountPremium >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {etf.discountPremium >= 0 ? '溢價' : '折價'} {Math.abs(etf.discountPremium).toFixed(2)}%
              </strong>
            </div>
          </div>
          <div className="p-2.5 bg-indigo-50/40 border border-indigo-100 rounded-lg text-slate-700 leading-relaxed text-xs">
            {etf.discountPremium >= 0.5 ? (
              <span className="text-rose-700 font-bold">
                🚨 警告：溢價偏高（≥ 0.5%），市價顯著高於真實淨值，需嚴防溢價收斂回檔。
              </span>
            ) : etf.discountPremium <= -0.5 ? (
              <span className="text-emerald-750 font-bold">
                🔥 提示：折價顯著（≤ -0.5%），市價低於基金淨值，屬於相對超值便宜的布局點！
              </span>
            ) : (
              <span className="text-slate-650 font-medium">
                ⚖️ 盤勢平穩：折溢價處於合理區間（±0.5%），市價與淨值大致同步。
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-100/50 mt-1">
            <p>• <strong>配息頻率：</strong>{etf.distributionFreq} (年化配息率: {etf.annualizedYield.toFixed(2)}%)</p>
            <p>• <strong>成分股前三大：</strong>{etf.constituents.slice(0, 3).map(c => `${c.name} (${c.weight.toFixed(1)}%)`).join('、')}</p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col gap-5 h-full animate-fade-in">
      
      {/* Header section */}
      <div className="flex items-start justify-between border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-slate-950 font-display">{stock.name}</span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200/55 px-1.5 py-0.2 rounded font-bold">
              {stock.id}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">即時技術診斷與大勢盤面</p>
        </div>

        <div className="text-right">
          <p className="text-lg font-black text-slate-950 font-mono tracking-tight">
            NT$ {stock.price.toFixed(2)}
          </p>
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-xs font-black font-mono flex items-center justify-end gap-0.5 ${
              isPriceUp ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {isPriceUp ? '▲' : '▼'} {Math.abs(stock.change).toFixed(2)}%
            </span>
            {stock.volume > 0 && (
              <span className="text-[9.5px] text-slate-400 font-mono font-bold">
                成交量: {Math.round(stock.volume / 1000).toLocaleString()} 張
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3-Month Price Trend Chart */}
      <div className="flex flex-col gap-1">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-display flex items-center gap-1">
          <Activity className="w-3.5 h-3.5 text-indigo-500" />
          <span>股價走勢圖 (近3個月)</span>
        </h4>
        
        <div className="h-32 w-full mt-1.5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '10px' }}
                labelClassName="font-bold text-slate-800"
              />
              <Area type="monotone" dataKey="close" stroke="#4f46e5" strokeWidth={1.8} fillOpacity={1} fill="url(#colorClose)" name="收盤價" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* K線均線、KD/RSI、MACD 診斷 (不用放圖) - Tabbed text interface */}
      <div className="flex flex-col gap-2.5 pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-display">
            技術指標文字深度診斷
          </h4>
          <span className="text-[9px] text-indigo-600 bg-indigo-50 font-black px-1.5 py-0.5 rounded border border-indigo-100">
            不用放圖
          </span>
        </div>

        {/* Tab buttons */}
        <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10px] font-bold overflow-x-auto gap-0.5">
          <button
            onClick={() => setActiveTab('ma')}
            className={`flex-1 py-1 px-1.5 rounded-lg whitespace-nowrap text-center transition-all cursor-pointer ${
              activeTab === 'ma' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            5/20MA 均線
          </button>
          <button
            onClick={() => setActiveTab('kd_rsi')}
            className={`flex-1 py-1 px-1.5 rounded-lg whitespace-nowrap text-center transition-all cursor-pointer ${
              activeTab === 'kd_rsi' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            KD & RSI
          </button>
          <button
            onClick={() => setActiveTab('macd')}
            className={`flex-1 py-1 px-1.5 rounded-lg whitespace-nowrap text-center transition-all cursor-pointer ${
              activeTab === 'macd' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            MACD 量能
          </button>
          {stock.etfDetails && (
            <button
              onClick={() => setActiveTab('etf')}
              className={`flex-1 py-1 px-1.5 rounded-lg whitespace-nowrap text-center transition-all cursor-pointer ${
                activeTab === 'etf' ? 'bg-indigo-600 text-white shadow-sm animate-pulse' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ETF 折溢
            </button>
          )}
        </div>

        {/* Interactive Diagnosis Output */}
        <div className="text-[11px] leading-relaxed">
          {renderIndicatorDiagnosisText()}
        </div>
      </div>

      {/* CAN SLIM 與指標診斷 */}
      <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-display">
            CAN SLIM 與即時指標綜合診斷
          </h4>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border font-mono ${signalColor}`}>
            {signal}
          </span>
        </div>

        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-0.5">
          {bulletPoints.map((point, idx) => {
            const isDanger = point.includes("🚨") || point.includes("⚠️") || point.includes("跌破") || point.includes("死亡交叉");
            const isPositive = point.includes("🔥") || point.includes("📈") || point.includes("黃金交叉") || point.includes("突破");
            
            let borderClass = "border-slate-100 bg-slate-50/40 text-slate-600";
            if (isDanger) borderClass = "border-rose-100 bg-rose-50/40 text-rose-700";
            if (isPositive) borderClass = "border-emerald-100 bg-emerald-50/40 text-emerald-700";

            return (
              <div key={idx} className={`p-2 rounded-lg border text-[10.5px] leading-relaxed font-semibold ${borderClass}`}>
                {point}
              </div>
            );
          })}
        </div>
      </div>

      {/* 個人資產配置狀況 (Cost adjuster widget inside) */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 flex flex-col gap-2 mt-auto">
        <div className="flex items-center justify-between">
          <h5 className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider">個人資產與損益配置</h5>
          
          <button
            onClick={() => {
              if (!isEditingHolding) {
                setSharesInput(String(stock.shares));
                setCostInput(String(stock.cost || stock.price.toFixed(2)));
              }
              setIsEditingHolding(!isEditingHolding);
            }}
            className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer"
          >
            {isEditingHolding ? "取消" : "調整持有"}
          </button>
        </div>

        {isEditingHolding ? (
          <form onSubmit={handleSaveHoldings} className="space-y-2 text-[10px]">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-400">持股張/股數</span>
                <input
                  type="number"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded font-mono font-bold text-xs"
                  required
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-400">平均成本 (NT$)</span>
                <input
                  type="number"
                  step="any"
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 text-slate-800 rounded font-mono font-bold text-xs"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1 py-1 bg-indigo-600 text-white text-xs font-black rounded hover:bg-indigo-500 cursor-pointer shadow-sm"
            >
              <Check className="w-3 h-3" />
              <span>儲存設定</span>
            </button>
          </form>
        ) : (
          <div className="text-[11px]">
            {stock.shares > 0 ? (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">庫存持股:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {stock.shares.toLocaleString()} 股 ({(stock.shares / 1000).toFixed(1)}張)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">平均成本:</span>
                  <span className="font-mono font-bold text-slate-800">NT$ {stock.cost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-slate-200 pt-1.5">
                  <span className="text-slate-400 font-medium">未實現損益:</span>
                  {(() => {
                    const pnl = (stock.price - stock.cost) * stock.shares;
                    const pnlPct = ((stock.price - stock.cost) / stock.cost) * 100;
                    return (
                      <strong className={`font-mono font-black ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {pnl >= 0 ? '+' : ''}{Math.round(pnl).toLocaleString()} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                      </strong>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 text-center py-1 font-medium leading-relaxed">
                無持有部位。點右上角「調整持有」可鍵入您的股數與均價。
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
