/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, Sunrise, Sun, Sunset, FileText, Check, Copy, 
  AlertTriangle, TrendingUp, TrendingDown, Info, Coins, 
  Briefcase, Shield, ArrowRight, Activity, Sparkles,
  Zap, Radar, Eye, Layers, Compass, BarChart3, AlertOctagon, Target, Sliders
} from 'lucide-react';
import { Stock, MarketState, GlobalIndex } from '../types';
import { 
  generateV32ReportMarkdown, 
  generateV32MasterPromptWithJson, 
  computePortfolioAllocation2M, 
  computeSectorRotationRadar, 
  computeCycleRadarItems,
  computeCanSlimScores,
  computeStockPriceMap,
  compute3PeriodStrategy,
  STOCK_META_DICTIONARY,
  RECENT_3DAY_NEWS
} from '../utils/aiDecisionEngine';

interface ReportGeneratorProps {
  stocks: Stock[];
  market: MarketState;
  globalIndices?: Record<string, GlobalIndex>;
}

// 1-12 Month Industry Cycles details
interface IndustryCycle {
  month: number;
  name: string;
  theme: string;
  peaks: string[]; // stock IDs that are in peak season
  slows: string[]; // stock IDs in slow season
  details: string;
  macroDesc: string;
}

const industryCycles: IndustryCycle[] = [
  {
    month: 1,
    name: '1月 (春節年貨高峰與紅包行情)',
    theme: '內需消費、春節旅遊、高股息卡位',
    peaks: ['2618', '2610', '1432', '0056', '00878', '00919'],
    slows: ['2330', '2317', '2382', '2356', '2313'],
    details: '進入春節消費與旅遊旺季，航空雙雄(長榮航、華航)迎來客運高峰，大魯閣等內需消費觀光轉強。電子業第一季為傳統淡季，進行庫存調整與新品籌備。',
    macroDesc: '春節消費與旅遊需求激增，航運航空雙雄、觀光內需股受惠；電子權值股進行第一季庫存與產能調度。'
  },
  {
    month: 2,
    name: '2月 (元宵與年後開工補庫存)',
    theme: '內需尾聲、電子零組件補庫存',
    peaks: ['1432', '2618', '2610', '2885', '2882'],
    slows: ['2330', '2317', '2382', '2356'],
    details: '春節年後，法人與大戶紅包資金回流股市。傳統金融股(元大金、國泰金)表現穩健。電子業下游如廣達、英業達進入第一季出貨低谷。',
    macroDesc: '春節紅包與開工資金回流，金融板塊穩健，電子代工與組裝廠出貨動能仍處於全年低水位。'
  },
  {
    month: 3,
    name: '3月 (財報宣告與除權息大會熱身)',
    theme: '高股息ETF建倉、殖利率行情',
    peaks: ['0056', '00878', '00919', '2885', '2882', '2501'],
    slows: ['2618', '2610'],
    details: '年報陸續公佈，董事會宣告股利。高殖利率股與元大高股息(0056)等高股息ETF開始受到建倉資金追捧，金融及營建股(國建)受置產除權息買盤支持。航空股步入年後客運淡季。',
    macroDesc: '年報陸續披露，除權息利息派發與高股息殖利率行情啟動，ETF買盤大舉敲進成分股。'
  },
  {
    month: 4,
    name: '4月 (電子五窮六絕前哨戰與繳稅避險)',
    theme: '成熟製程庫存去化、防守型高股息',
    peaks: ['2885', '2882', '0056', '00878'],
    slows: ['2303', '6770', '2344', '2481'],
    details: '電子業進入傳統「五窮六絕」第一個月，成熟製程(聯電、力積電)及分離式元件(強茂)面臨報價壓力。資金轉入防守型的金融股與高股息ETF。',
    macroDesc: '電子產業鏈步入傳統「五窮六絕」的第1個月，成熟晶圓代工與特殊IC進入庫存盤整期。'
  },
  {
    month: 5,
    name: '5月 (稅季賣壓與主動型ETF換股潮)',
    theme: '大戶繳稅申報、主動式ETF重組',
    peaks: ['00981A', '00991A', '3481'],
    slows: ['2330', '2317', '2382', '2356'],
    details: '報稅季來臨，大戶與散戶申報綜所稅，市場存在提現拋壓。主動型ETF(主動統一台股增長00981A、主動復華未來50 00991A)經理人進行季底換股調整。群創等面板股因下半年促銷節日(618)拉貨轉強。',
    macroDesc: '稅季申報引發部分棄息與賣股提現壓力。主動式ETF經理人積極針對下半年趨勢換股重組。'
  },
  {
    month: 6,
    name: '6月 (年中投信集團作帳與高股息建倉)',
    theme: '集團作帳、投信作帳、618檔期內需',
    peaks: ['1605', '2481', '00991A', '00981A', '3481', '2501'],
    slows: ['2603', '2609'],
    details: '年中作帳行情啟動，華新(1605)、強茂(2481)等集團股有拉抬跡象。618年中大促帶動群創等面板出貨。營建股國建迎來年中完工交屋潮。航運受Q2末運價震盪影響。',
    macroDesc: '季底兼年中投信與集團作帳行情高峰，華新、強茂等集團股逆勢活躍，營建完工交屋熱絡。'
  },
  {
    month: 7,
    name: '7月 (暑假客運高峰與電子出貨拉貨潮)',
    theme: '暑期航空客運、Apple及伺服器供应链啟動',
    peaks: ['2618', '2610', '2330', '2317', '2382', '2356', '2313', '3711'],
    slows: ['2885', '2882'],
    details: '暑假旅遊旺季，長榮航、華航客運量登頂。Apple 新機及全球 AI 伺服器(GB200)零組件進入密集出貨拉貨期，台積電、鴻海、廣達、英業達、華通、日月光投控營收強勢攀升。金融股除息，點位拉回。',
    macroDesc: '暑期航空客運黃金旺季。Apple新機與高階AI伺服器進入零組件備貨出貨高峰期，電子大廠動能點火。'
  },
  {
    month: 8,
    name: '8月 (除權息股利入帳與下半年旺季確認)',
    theme: '金融股利入帳高峰、電子出貨大增',
    peaks: ['2330', '2317', '2382', '2356', '2885', '2882', '3711'],
    slows: ['1432'],
    details: '金控巨頭(國泰金、元大金)迎來大筆轉投資股利現金入帳，推升單月獲利。電子代工三雄(鴻海、廣達、英業達)下半年備貨出貨明朗化。大魯閣等暑期尾聲消費放緩。',
    macroDesc: '金控股利發放與轉投資利益入帳高峰。電子代工巨頭下半年旺季訂單能見度極高。'
  },
  {
    month: 9,
    name: '9月 (返校潮與第三季季底作帳)',
    theme: '電子返校需求、投信季底作帳、PCB拉貨',
    peaks: ['2313', '2382', '2356', '00981A', '00991A', '2344'],
    slows: ['2618', '2610'],
    details: '全球電子消費迎來「返校季」筆電及手機出貨，華通(PCB)出貨達全年最高。華邦電(記憶體)良率提升迎來旺季需求。投信進行Q3季底作帳拉抬。航空股暑期結束，進入短期淡季。',
    macroDesc: '開學返校消費拉動電子、筆電出貨，PCB板塊營收迎高峰。法人與投信發動Q3季底作帳。'
  },
  {
    month: 10,
    name: '10月 (Q4旺季衝刺與貨櫃急拉貨)',
    theme: '歐美感恩聖誕節前拉貨、Q4工業電腦出貨',
    peaks: ['2603', '2609', '3416', '2330', '2317'],
    slows: ['2885', '2882'],
    details: '歐美感恩節及聖誕節前夕，海運貨櫃(長榮、陽明)迎來亞洲至美歐急拉貨潮。融程電(工業電腦)進入第四季交貨衝刺期。金融業表現平穩。',
    macroDesc: '歐美節慶長假前夕，貨櫃海運迎來最後一波備貨急拉貨需求。工業電腦拉貨動能增強。'
  },
  {
    month: 11,
    name: '11月 (雙十一促銷與集團集團股暖身)',
    theme: '雙十一、雙十二面板與電商拉貨、集團股',
    peaks: ['3481', '1605', '2481', '2356'],
    slows: ['2618', '2610'],
    details: '雙十一電商購物節刺激大尺寸電視、高階顯示器拉貨，群創受惠。傳統集團年底作帳暖身，華新、強茂買盤增溫。英業達因伺服器年底結案迎來入帳期。',
    macroDesc: '全球大型電商購物節登場，面板與組裝鏈短期出貨暢旺。傳統集團股作帳買盤開始進場布局。'
  },
  {
    month: 12,
    name: '12月 (年底投信集團大作帳與完工入帳)',
    theme: '年底大作帳、營建入帳高峰、結案行情',
    peaks: ['1605', '2481', '2501', '00981A', '00991A', '2356', '2885'],
    slows: ['0056', '00878', '00919'],
    details: '台股年底重頭戲「集團與投信大作帳」全開，華新集團、強茂集團發動大舉拉抬。營建股國建年底交屋入帳達到全年最高點。年底各大型專案結案，英業達、元大金結算全年佳績。',
    macroDesc: '台股年度大作帳行情啟動！集團股、營建完工交屋入帳與科技結案入帳達到全年最高峰。'
  }
];

export default function ReportGenerator({ stocks, market, globalIndices = {} }: ReportGeneratorProps) {
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // August
  const [activeReportType, setActiveReportType] = useState<'morning' | 'afternoon' | 'closing'>('morning');
  const [viewMode, setViewMode] = useState<'visual' | 'markdown'>('visual');
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'markdown' | 'system_prompt' | null>(null);

  // Initialize selected month
  useEffect(() => {
    const now = new Date();
    setSelectedMonth(now.getMonth() + 1);
  }, []);

  // Update markdown whenever inputs change
  useEffect(() => {
    const md = generateV32ReportMarkdown(activeReportType, stocks, market, globalIndices);
    setReportMarkdown(md);
  }, [activeReportType, stocks, market, globalIndices]);

  const allocation = computePortfolioAllocation2M(stocks, market);
  const sectors = computeSectorRotationRadar(stocks);
  const cycleRadars = computeCycleRadarItems(stocks);

  const enrichedStocks = stocks.map(s => ({
    ...s,
    canSlim: computeCanSlimScores(s, market),
    priceMap: computeStockPriceMap(s),
    strategy3P: compute3PeriodStrategy(s, computeStockPriceMap(s))
  }));

  const ownedStocks = enrichedStocks.filter(s => s.shares > 0);
  const top5Leaders = [...enrichedStocks]
    .filter(s => s.id !== '00632R')
    .sort((a, b) => b.canSlim.totalScore - a.canSlim.totalScore)
    .slice(0, 5);

  const currentMonthCycle = industryCycles.find(c => c.month === selectedMonth) || industryCycles[0];

  const handleCopyMarkdown = () => {
    const textarea = document.createElement('textarea');
    textarea.value = reportMarkdown;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      setCopiedType('markdown');
      setTimeout(() => setCopiedType(null), 2500);
    } catch (e) {
      console.error('Failed to copy', e);
    }
    document.body.removeChild(textarea);
  };

  const handleCopySystemPrompt = () => {
    const fullPrompt = generateV32MasterPromptWithJson(stocks, market, globalIndices);
    const textarea = document.createElement('textarea');
    textarea.value = fullPrompt;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      setCopiedType('system_prompt');
      setTimeout(() => setCopiedType(null), 2500);
    } catch (e) {
      console.error('Failed to copy system prompt', e);
    }
    document.body.removeChild(textarea);
  };

  return (
    <div id="ai-v32-report-generator" className="space-y-6">
      {/* Header & Report Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-black rounded-full uppercase tracking-wider shadow-sm">
                SYSTEM v3.2
              </span>
              <h2 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-400" />
                AI 投資決策系統報告引擎
              </h2>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              深度整合《笑傲股市》CAN SLIM 哲學、產業輪動雷達、景氣循環提前預警模型、健康回測買點判定與 200 萬元部位動態配置。
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              id="btn-copy-system-prompt"
              onClick={handleCopySystemPrompt}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-900/30"
              title="複製包含完整 System Prompt v3.2 與 today.json 的代碼包，可直接貼入 ChatGPT/Claude/Gemini"
            >
              {copiedType === 'system_prompt' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>已複製 AI System Prompt!</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>複製 AI v3.2 Prompt (today.json)</span>
                </>
              )}
            </button>

            <button
              id="btn-copy-markdown"
              onClick={handleCopyMarkdown}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
            >
              {copiedType === 'markdown' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>已複製 Markdown 報告</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>複製 Markdown 報告</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Report Type Tabs */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              id="tab-morning-report"
              onClick={() => setActiveReportType('morning')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeReportType === 'morning'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sunrise className="w-4 h-4" />
              <span>🌅 晨報 (08:30 盤前部署)</span>
            </button>

            <button
              id="tab-afternoon-report"
              onClick={() => setActiveReportType('afternoon')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeReportType === 'afternoon'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>☀️ 午報 (12:00 盤中追蹤)</span>
            </button>

            <button
              id="tab-closing-report"
              onClick={() => setActiveReportType('closing')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeReportType === 'closing'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sunset className="w-4 h-4" />
              <span>🌇 收盤報 (13:45 明日部署)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>月份淡旺季:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-slate-200 font-bold outline-none cursor-pointer"
              >
                {industryCycles.map((m) => (
                  <option key={m.month} value={m.month} className="bg-slate-900 text-slate-200">
                    {m.month} 月
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setViewMode('visual')}
                className={`px-3 py-1 rounded-lg font-bold transition ${
                  viewMode === 'visual' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                視覺儀表板
              </button>
              <button
                onClick={() => setViewMode('markdown')}
                className={`px-3 py-1 rounded-lg font-bold transition ${
                  viewMode === 'markdown' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Markdown 原文
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'visual' ? (
        <div className="space-y-6">
          {/* Top Banner: Core Strategy & 200M Allocation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Today One-Sentence Strategy */}
            <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-900/40 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Target className="w-4 h-4" /> 今日決策核心指引
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                    allocation.marketRegime === '多頭格局' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-amber-950/80 text-amber-400 border border-amber-800'
                  }`}>
                    {allocation.marketRegime}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-100 mt-2 leading-snug">
                  {activeReportType === 'morning' && "「順應多頭趨勢鎖定 AI 與海運 Leader，只在健康回測時分批上車，嚴禁向下攤平破線弱勢股。」"}
                  {activeReportType === 'afternoon' && "「盤中權值走穩，海運與 AI 伺服器動能強勁，嚴格守好 8% 停損防線，尾盤緊盯關鍵整數支撐。」"}
                  {activeReportType === 'closing' && "「多頭架構完好，強勢 Leader 續抱，逢回測 20MA 量縮即是加碼良機，明日依價格地圖紀律操作。」"}
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800/80">
                <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60">
                  <div className="text-[11px] text-slate-400">大盤加權指數</div>
                  <div className="text-sm font-black text-slate-200 mt-0.5">{market.index.toLocaleString()}</div>
                </div>
                <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60">
                  <div className="text-[11px] text-slate-400">今日預估成交量</div>
                  <div className="text-sm font-black text-slate-200 mt-0.5">NT$ {market.volume} 億</div>
                </div>
                <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60">
                  <div className="text-[11px] text-slate-400">台積電定海神針</div>
                  <div className="text-sm font-black text-emerald-400 mt-0.5">
                    ${enrichedStocks.find(s => s.id === '2330')?.price.toLocaleString() || '2,430'}
                  </div>
                </div>
              </div>
            </div>

            {/* 200M Allocation Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-400" /> 200萬資產配置動態調節
                  </span>
                  <span className="text-xs text-slate-500 font-medium">總本金 200 萬</span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-bold">股票 / ETF 部位: {allocation.investedPercent}%</span>
                    <span className="text-slate-400">現金: {allocation.cashPercent}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="bg-blue-500 h-full transition-all" style={{ width: `${allocation.investedPercent}%` }}></div>
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${allocation.cashPercent}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>持股市值: NT$ {(allocation.investedValue / 10000).toFixed(1)}萬</span>
                    <span>現金餘額: NT$ {(allocation.cashBalance / 10000).toFixed(1)}萬</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
                <div className="text-[11px] font-bold text-amber-400 mb-1">
                  目標配置: 股票 {allocation.targetStockPercentMin}%~{allocation.targetStockPercentMax}% ｜ 現金 {allocation.targetCashPercentMin}%~{allocation.targetCashPercentMax}%
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {allocation.rebalanceAction}
                </p>
              </div>
            </div>
          </div>

          {/* Early Warning Cycle Radar & Sector Rotation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cycle Early Warning Radar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                  <Radar className="w-4 h-4 text-rose-400" />
                  🚨 景氣循環啟動雷達 (提前預警機制)
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-rose-950 text-rose-400 border border-rose-900 rounded-full font-bold">
                  起漲 1~3% 內偵測
                </span>
              </div>

              <div className="space-y-3">
                {cycleRadars.map((c) => (
                  <div key={c.id} className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs">{c.sectorName}</span>
                      <span className="px-2 py-0.5 bg-amber-950 text-amber-400 text-[10px] font-black rounded-md border border-amber-900/60">
                        {c.cycleStage}
                      </span>
                    </div>
                    <div className="text-xs text-rose-300 font-bold">
                      {c.warningReason}
                    </div>
                    <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800/50">
                      💡 <span className="font-semibold text-slate-300">關鍵指標:</span> {c.keyMetric}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-medium pt-1">
                      {c.actionAdvice}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sector Rotation Radar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-400" />
                  🏭 產業輪動雷達 (Sector Rotation Radar)
                </h3>
                <span className="text-[11px] text-slate-400">依相對強度與催化劑評分</span>
              </div>

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {sectors.map((sec) => (
                  <div key={sec.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between gap-4">
                    <div className="min-w-[130px]">
                      <div className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                        {sec.name}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]">{sec.theme}</div>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-400">RS 5D:{sec.rs5d} / 20D:{sec.rs20d}</span>
                        <span className="font-black text-slate-200">{sec.score} 分</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${
                            sec.status === 'FIRE_START' ? 'bg-amber-400' :
                            sec.status === 'STRONG' ? 'bg-emerald-400' : 'bg-blue-500'
                          }`}
                          style={{ width: `${sec.score}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="text-right min-w-[70px]">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                        sec.status === 'FIRE_START' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        sec.status === 'STRONG' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {sec.status === 'FIRE_START' ? '🔥 啟動' : (sec.status === 'STRONG' ? '🟢 強勢' : '🟡 觀察')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Price Map & Health Pullback vs Knife Avoidance */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-400" />
                  🎯 核心標的買點價格地圖（健康回測買點 vs 轉弱接刀警戒）
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  嚴格遵守：回測量縮守月線為 🟢 健康買點；破線放量且 RS 惡化為 🔴 轉弱接刀（嚴禁買入）
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                    <th className="py-2.5 px-3 font-semibold">代碼 / 名稱</th>
                    <th className="py-2.5 px-3 font-semibold">現價 / 漲跌</th>
                    <th className="py-2.5 px-3 font-semibold">型態狀態判定</th>
                    <th className="py-2.5 px-3 font-semibold">突破買點 (Pivot)</th>
                    <th className="py-2.5 px-3 font-semibold">第一健康回測買區</th>
                    <th className="py-2.5 px-3 font-semibold text-rose-400">接刀失效防線</th>
                    <th className="py-2.5 px-3 font-semibold">停損線 (-8%)</th>
                    <th className="py-2.5 px-3 font-semibold text-emerald-400">第一目標價 (+15%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {enrichedStocks.slice(0, 10).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-200">{s.name}</div>
                        <div className="text-[10px] text-slate-400">{s.id} • {s.canSlim.modelType}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-black text-slate-100">${s.price.toFixed(2)}</div>
                        <div className={`text-[10px] font-bold ${s.change >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                          s.priceMap.pullbackState === 'HEALTHY_PULLBACK' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                          s.priceMap.pullbackState === 'KNIFE_AVOID' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                          s.priceMap.pullbackState === 'BREAKOUT' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {s.priceMap.pullbackState === 'HEALTHY_PULLBACK' ? '🟢 健康回測' :
                           s.priceMap.pullbackState === 'KNIFE_AVOID' ? '🔴 嚴禁接刀' :
                           s.priceMap.pullbackState === 'BREAKOUT' ? '🔥 突破買點' : '🟡 區間震盪'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-200">${s.priceMap.breakoutPrice}</td>
                      <td className="py-3 px-3 text-slate-300 font-medium">${s.priceMap.pullbackMin} ~ ${s.priceMap.pullbackMax}</td>
                      <td className="py-3 px-3 font-bold text-rose-400">${s.priceMap.knifeInvalidPrice}</td>
                      <td className="py-3 px-3 text-slate-400">${s.priceMap.stopLossPrice}</td>
                      <td className="py-3 px-3 font-bold text-emerald-400">${s.priceMap.targetPrice1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Focus 5 & Avoid list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <h3 className="text-sm font-black text-slate-100 flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                ⭐ 今日最值得注意 5 檔標的
              </h3>
              <div className="space-y-2.5">
                {top5Leaders.map((s, i) => (
                  <div key={s.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200 text-xs">
                        {i + 1}. {s.name} ({s.id})
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        回測買點: ${s.priceMap.pullbackMin} ~ ${s.priceMap.pullbackMax} ｜ 目標: ${s.priceMap.targetPrice1}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 bg-blue-950 text-blue-300 text-[10px] font-black rounded border border-blue-900">
                        CAN SLIM: {s.canSlim.totalScore}分
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <h3 className="text-sm font-black text-slate-100 flex items-center gap-2 mb-3">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                🚫 今日不要追的股票與風控警告
              </h3>
              <div className="space-y-2.5">
                {enrichedStocks.filter(s => s.priceMap.pullbackState === 'KNIFE_AVOID' || s.id === '00632R').slice(0, 3).map((s) => (
                  <div key={s.id} className="p-3 bg-rose-950/30 rounded-xl border border-rose-900/40">
                    <div className="flex items-center justify-between text-xs font-bold text-rose-300">
                      <span>{s.name} ({s.id})</span>
                      <span className="text-[10px] bg-rose-950 text-rose-400 px-2 py-0.5 rounded border border-rose-900">
                        風控警報
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-200/70 mt-1 leading-snug">
                      {s.priceMap.pullbackStateDesc}
                    </p>
                  </div>
                ))}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                  🛡️ <strong className="text-slate-300">停損鐵律:</strong> 任何個股一旦自進場成本跌破 8%，必須無條件執行停損，嚴禁向下加碼攤平。
                </div>
              </div>
            </div>
          </div>

          {/* Month Cycle Info Footer */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold text-slate-300">{currentMonthCycle.name}：</span>
              <span>{currentMonthCycle.details}</span>
            </div>
          </div>
        </div>
      ) : (
        /* Markdown Preview Mode */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              Markdown 完整專業分析報告原文
            </div>
            <button
              onClick={handleCopyMarkdown}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
            >
              {copiedType === 'markdown' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedType === 'markdown' ? '已複製' : '一鍵複製全文'}</span>
            </button>
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-950 p-5 rounded-xl border border-slate-800 leading-relaxed overflow-x-auto">
            {reportMarkdown}
          </pre>
        </div>
      )}
    </div>
  );
}
