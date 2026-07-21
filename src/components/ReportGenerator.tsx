/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, Sunrise, Sun, Sunset, FileText, Check, Copy, 
  AlertTriangle, TrendingUp, TrendingDown, Info, Coins, 
  Briefcase, Shield, ArrowRight, Activity, Sparkles 
} from 'lucide-react';
import { Stock, MarketState } from '../types';

interface ReportGeneratorProps {
  stocks: Stock[];
  market: MarketState;
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
    details: '暑假旅遊旺季，長榮航、華航客運量登頂。Apple iPhone 18 新機及全球 AI 伺服器(GB200)零組件進入密集出貨拉貨期，台積電、鴻海、廣達、英業達、華通、日月光投控營收強勢攀升。金融股除息，點位拉回。',
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

export default function ReportGenerator({ stocks, market }: ReportGeneratorProps) {
  const [selectedMonth, setSelectedMonth] = useState<number>(7); // Default to July based on simulated 2026-07-02
  const [activeReport, setActiveReport] = useState<'morning' | 'afternoon' | 'closing' | null>(null);
  const [reportText, setReportContent] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Initialize selected month from browser date if it is 2026-07
  useEffect(() => {
    const now = new Date();
    setSelectedMonth(now.getMonth() + 1); // 1-indexed month
  }, []);

  const currentCycle = industryCycles.find(c => c.month === selectedMonth) || industryCycles[6];

  const handleCopyReport = () => {
    if (!reportText) return;
    const textarea = document.createElement('textarea');
    textarea.value = reportText;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
    document.body.removeChild(textarea);
  };

  const generateReport = (type: 'morning' | 'afternoon' | 'closing') => {
    setActiveReport(type);
    
    // 1. Gather general portfolio statistics
    const portfolio = stocks.filter(s => s.shares > 0);
    const totalCost = portfolio.reduce((acc, s) => acc + s.cost * s.shares, 0);
    const totalValue = portfolio.reduce((acc, s) => acc + s.price * s.shares, 0);
    const totalPnL = totalValue - totalCost;
    const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    // TAIEX Status description
    const taiexTrend = market.changePercent >= 0 ? '多頭震盪' : '拉回修正';
    const taiexIndicator = market.changePercent >= 0 ? '▲' : '▼';

    let title = '';
    let intro = '';
    let mFactorAnalysis = '';
    let portfolioDiagnostic = '';
    let watchlistRadar = '';
    let allocationStrategy = '';
    let footerSign = '';

    const currentTimestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    const currentDateString = new Date().toLocaleDateString('zh-TW');

    // ----------------------------------------------------
    // TYPE A: MORNING REPORT (08:30)
    // ----------------------------------------------------
    if (type === 'morning') {
      title = `🌅 【CAN SLIM 操盤室】台股每日晨報 (開盤前預判)`;
      intro = `**執行時間**：${currentDateString} 08:30 (盤前預判)\n` +
              `**當前大盤 M 因子 (Market Direction)**：台股加權指數目前處於 **${market.index.toLocaleString()} 點**，昨日 ${taiexIndicator} ${market.changePercent >= 0 ? '+' : ''}${market.changePercent.toFixed(2)}%。目前大盤多頭趨勢未變，高位呈高姿態整理。受 ${selectedMonth} 月產業循環特性【${currentCycle.theme}】影響，今日盤前市場氛圍觀望美股科技股的後續，但下檔買盤相對扎實。`;

      mFactorAnalysis = `### ⚖️ 1. 大盤 M 因子 (Market Trend) 盤前解析\n` +
                         `- **美股連動**：昨夜美股費城半導體及納斯達克呈現強勢高檔震盪，台積電 ADR 溢價仍守在 +3.5% 之上，今日台股開盤有撐。\n` +
                         `- **量能估算**：預估今日成交量能將落在 **NT$ ${market.volume.toLocaleString()} 億** 附近，若開盤前 15 分鐘帶量突破，顯示大戶回流。\n` +
                         `- **循環特性**：目前處於 **${currentCycle.name}**。${currentCycle.macroDesc}\n` +
                         `- **今日開盤策略**：在多頭趨勢中，「不預設高點，嚴格守住本金紅線」。`;

      // Portfolio diagnostic for Morning
      let pDiag = `### 🚨 2. 持股庫存「CAN SLIM」開盤防線與減碼指令\n` +
                  `目前您的總庫存成本 **NT$ ${totalCost.toLocaleString()} 元**，總市值 **NT$ ${totalValue.toLocaleString()} 元**，未實現損益 **NT$ ${totalPnL.toLocaleString()} 元 (${totalPnLPct >= 0 ? '+' : ''}${totalPnLPct.toFixed(2)}%)**。\n\n` +
                  `| 代號 | 股票名稱 | 持有股數 | 成本均價 | 即時現價 | 當前損益 | 盤前決策建議 |\n` +
                  `|---|---|---|---|---|---|---|\n`;

      portfolio.forEach(s => {
        const pnl = (s.price - s.cost) * s.shares;
        const pnlPct = s.cost > 0 ? (pnl / (s.cost * s.shares)) * 100 : 0;
        let suggestion = '';

        if (s.id === '00632R') {
          suggestion = `🚨 **【開盤直接市價出清】** 目前虧損高達 ${pnlPct.toFixed(1)}%。在歷史大牛市中死扛反一，嚴重違反大盤 M 因子，應果斷認賠切除，解鎖約 NT$ ${(s.price * s.shares).toLocaleString()} 元的本金。`;
        } else if (s.id === '1432') {
          suggestion = `🚨 **【開盤直接出清】** 虧損達 ${pnlPct.toFixed(1)}%。大魯閣非主流成長股，不符合 CAN SLIM 的 C、A 強勢原則，建議開盤換回現金。`;
        } else if (pnlPct <= -8) {
          suggestion = `🚨 **【硬性執行停損】** 已觸及 8% 停損紅線 (目前 ${pnlPct.toFixed(1)}%)！遵守笑傲股市紀律，開盤 15 分鐘內市價減碼或出清。`;
        } else if (pnlPct >= 15) {
          suggestion = `💰 **【考慮分批停利】** 帳面獲利已達 +${pnlPct.toFixed(1)}%，可於今日開盤沖高時分批入袋為安 1/3，鎖定獲利。`;
        } else if (s.id === '00991A') {
          suggestion = `🔥 **【HOLD / 強勢續抱】** 獲利 +${pnlPct.toFixed(1)}%，主動型經理人持股完美契合 AI 浪潮，今日開盤無痛續抱，目標上看 NT$ 24~26 元。`;
        } else {
          suggestion = `⏳ **【HOLD / 持股觀察】** 目前損益 ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% 處於安全均線之上，盤前建議續抱，注意移動止盈點。`;
        }

        pDiag += `| ${s.id} | ${s.name} | ${s.shares.toLocaleString()} 股 | NT$ ${s.cost.toFixed(2)} | NT$ ${s.price.toFixed(2)} | ${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% | ${suggestion} |\n`;
      });
      portfolioDiagnostic = pDiag;

      // Watchlist scanning
      let wRadar = `### 🔍 3. 26檔全標的「CAN SLIM 獵鷹雷達表」(晨間盤前篩選)\n` +
                   `針對其餘關注之 26 檔個股，依據技術指標及 **${selectedMonth}月產業循環特性** 進行全方位盤前掃描：\n\n`;

      const buyGroup: string[] = [];
      const holdGroup: string[] = [];
      const avoidGroup: string[] = [];

      stocks.forEach(s => {
        if (s.shares > 0) return; // only watch list
        const isPeak = currentCycle.peaks.includes(s.id);
        const isSlow = currentCycle.slows.includes(s.id);
        
        // Buy triggers: Golden cross, strong single day breakout, oversold
        const rsi = s.indicators.rsi;
        const k = s.indicators.kd.k;
        const d = s.indicators.kd.d;
        
        let decision = '';
        if (isPeak && (s.change > 3.0 || (k > d && k < 40) || rsi < 35)) {
          decision = `🔥 **【觸發買進/加碼】** 現價 NT$ ${s.price.toFixed(2)}，完美契合 ${selectedMonth} 月產業旺季！技術面指標翻多，是標準的 **N (新突破)** 或 **S (買盤力道)** 起點，極具進場吸引力。`;
          buyGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        } else if (isSlow || s.indicators.rsi >= 75 || k < d) {
          decision = `❌ **【無買進建議 / 避開】** 現價 NT$ ${s.price.toFixed(2)}。目前處於該產業去庫存或淡季期（如 ${selectedMonth} 月對應之淡季）。技術面偏弱，嚴禁接刀。`;
          avoidGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        } else {
          decision = `⏳ **【無買進建議 / 靜待放量】** 現價 NT$ ${s.price.toFixed(2)}。基本面佳，但目前成交量能未現突破，建議繼續列入極度觀察，靜待放量突破。`;
          holdGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        }
      });

      watchlistRadar = wRadar + 
                       `#### 🌟 類別 A：今日強力買進/加碼候選 (契合旺季+技術金叉)\n` +
                       (buyGroup.length > 0 ? buyGroup.join('\n') : `- 今日盤前無強烈買進建議個股。`) + `\n\n` +
                       `#### ⏳ 類別 B：蓄勢待發 / 極度觀察 (靜待量能放大或拉回)\n` +
                       (holdGroup.length > 0 ? holdGroup.join('\n') : `- 無觀察標的。`) + `\n\n` +
                       `#### ❌ 類別 C：嚴格避開 / 產業淡季 (成熟製程與拖油瓶股)\n` +
                       (avoidGroup.length > 0 ? avoidGroup.join('\n') : `- 無需避開之標的。`);

      allocationStrategy = `### 💰 4. 200萬台幣配置盤前沙盤推盤\n` +
                           `- **目前資金曝險**：目前庫存總市值約 NT$ ${totalValue.toLocaleString()} 元，占總 200 萬額度 ${(totalValue/2000000*100).toFixed(1)}%。\n` +
                           `- **晨間調整指令**：\n` +
                           `  1. **變現解鎖**：若開盤切除【反一】與【大魯閣】，將立即收回約 **NT$ ${(stocks.find(s => s.id === '00632R')?.price || 0) * 12000 + (stocks.find(s => s.id === '1432')?.price || 0) * 1000} 元** 的自由現金。\n` +
                           `  2. **強勢轉移**：建議將釋放出的資金分批佈局至旺季電子龍頭股（如 **廣達 2382** 或 **台積電 2330**）約 NT$ 10-15 萬，正式將雜草轉為百花！\n` +
                           `  3. **持現避險**：剩餘約 NT$ 120 萬資金（含200萬框架下未投入部分）繼續冰存，留作未來大盤大幅拉回時抄底台積電、鴻海的終極戰略儲備。`;

    // ----------------------------------------------------
    // TYPE B: AFTERNOON REPORT (12:00)
    // ----------------------------------------------------
    } else if (type === 'afternoon') {
      title = `☀️ 【CAN SLIM 操盤室】午間即時多空覆盤 (中午決策)`;
      intro = `**執行時間**：${currentDateString} 12:00 (中午決策覆盤)\n` +
              `**當前大盤 M 因子 (Market Direction)**：台股加權指數盤中於 **${market.index.toLocaleString()} 點**，${taiexIndicator} ${market.changePercent >= 0 ? '+' : ''}${market.changePercent.toFixed(2)}%。今日盤中交投熱絡，成交估量放大。受到 **${selectedMonth} 月旺季效應** 的推動，核心主流股盤中承接力道強勁，整體多頭掌控盤面。`;

      mFactorAnalysis = `### 📊 1. 盤中籌碼 S 因子 (Supply & Demand) 與量能觀察\n` +
                         `- **盤中量能**：今日預估總成交量能達 **NT$ ${market.volume.toLocaleString()} 億**，屬於「量增價穩」的多頭健康格局。\n   符合 CAN SLIM **S 因子** 買盤強力大於賣盤的原則。\n` +
                         `- **板塊輪動**：受 ${selectedMonth} 月產業特性影響，盤中資金明顯集中在【${currentCycle.theme}】。電子組裝三雄與主動式科技 ETF 呈現資金源源不絕入駐態勢。`;

      // Portfolio diagnostic for Afternoon
      let pDiag = `### 🚨 2. 持股庫存：盤中動態盈虧與尾盤交易指令\n` +
                  `截至 12:00，您的持股最新損益狀況如下：\n\n` +
                  `| 代號 | 股票名稱 | 持有均價 | 最新盤中價 | 盤中漲跌幅 | 當前動態盈虧 | 尾盤 (13:00~13:30) 操作指令 |\n` +
                  `|---|---|---|---|---|---|---|\n`;

      portfolio.forEach(s => {
        const pnl = (s.price - s.cost) * s.shares;
        const pnlPct = s.cost > 0 ? (pnl / (s.cost * s.shares)) * 100 : 0;
        let suggestion = '';

        if (s.id === '00632R') {
          suggestion = `🚨 **【尾盤市價全數出清】** 盤中持續探底（目前虧損 ${pnlPct.toFixed(1)}%）。逆勢做空毒瘤，尾盤 13:20 附近請直接無條件市價清空，換回現金！`;
        } else if (s.id === '1432') {
          suggestion = `🚨 **【尾盤全數出清】** 虧損 ${pnlPct.toFixed(1)}%。非主流弱勢股，盤中毫無量能起色，尾盤直接市價清空，停止失血。`;
        } else if (pnlPct <= -8) {
          suggestion = `🚨 **【硬性執行停損】** 已達停損紅線 (${pnlPct.toFixed(1)}%)，尾盤切勿猶豫，直接市價砍倉 100%！`;
        } else if (s.id === '00991A') {
          suggestion = `🔥 **【HOLD / 獲利金字塔加碼】** 目前獲利高達 +${pnlPct.toFixed(1)}%！主動復華未來50完全踩中旺季紅利，若手中現金充足，尾盤可加碼 1~2 張。`;
        } else if (s.id === '3481' && s.price < s.cost) {
          suggestion = `⚠️ **【嚴守成本防守點】** 目前微虧 ${pnlPct.toFixed(1)}%，價格在 NT$ 66.5 附近震盪。尾盤若收低於 65.0 元則必須啟動減碼 50%，守住本金。`;
        } else {
          suggestion = `⏳ **【HOLD / 抱牢續抱】** 當前獲利狀況健康，尾盤按兵不動，享受主升段利潤。`;
        }

        pDiag += `| ${s.id} | ${s.name} | NT$ ${s.cost.toFixed(2)} | NT$ ${s.price.toFixed(2)} | ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}% | ${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% | ${suggestion} |\n`;
      });
      portfolioDiagnostic = pDiag;

      // Watchlist scanning
      let wRadar = `### 🔍 3. 26檔全標的：盤中「獵鷹雷達」即時多空判讀\n` +
                   `中午盤中，利用 CAN SLIM 之 **L (Leader) 與 S (Supply/Demand)** 因子進行全清單掃描：\n\n`;

      const buyGroup: string[] = [];
      const holdGroup: string[] = [];
      const avoidGroup: string[] = [];

      stocks.forEach(s => {
        if (s.shares > 0) return; // only watch list
        const isPeak = currentCycle.peaks.includes(s.id);
        const isSlow = currentCycle.slows.includes(s.id);
        
        let decision = '';
        if (isPeak && s.change > 1.5) {
          decision = `🔥 **【盤中觸發買進/加碼】** 盤中現價 NT$ ${s.price.toFixed(2)}，逆勢或順勢放量。基本面與 ${selectedMonth} 月產業高峰極佳，買盤 S 因子成立。適合尾盤建立試探性首筆倉位 (20% 資金)。`;
          buyGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        } else if (isSlow || s.change < -3.5) {
          decision = `❌ **【無買進建議 / 避開】** 現價 NT$ ${s.price.toFixed(2)}。盤中表現低迷，深受產業去庫存低谷及淡季賣壓拖累（如 ${selectedMonth} 月去化低谷）。此時建倉風險極高。`;
          avoidGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        } else {
          decision = `⏳ **【無買進建議 / 觀望中性】** 現價 NT$ ${s.price.toFixed(2)}。盤中呈現量縮橫盤震盪，無大戶拉抬信號。建議繼續抱持中性態度觀望，靜待指標黃金交叉。`;
          holdGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        }
      });

      watchlistRadar = wRadar + 
                       `#### 🌟 類別 A：盤中強烈觸發「買進/加碼訊號」個股\n` +
                       (buyGroup.length > 0 ? buyGroup.join('\n') : `- 盤中無強烈符合 CAN SLIM 突破之買進訊號個股。`) + `\n\n` +
                       `#### ⏳ 類別 B：盤中溫和/續抱觀察個股\n` +
                       (holdGroup.length > 0 ? holdGroup.join('\n') : `- 無觀察標的。`) + `\n\n` +
                       `#### ❌ 類別 C：盤中弱勢/嚴格避開個股\n` +
                       (avoidGroup.length > 0 ? avoidGroup.join('\n') : `- 無需避開之標的。`);

      allocationStrategy = `### 💰 4. 200萬框架下：午間部位微調比例建議\n` +
                           `- **解鎖子彈威力**：今日若能順利在尾盤 13:20 砍掉【反一】與【大魯閣】這兩個虧損毒瘤，將能回收高達 **NT$ ${((stocks.find(s => s.id === '00632R')?.price || 0) * 12000 + (stocks.find(s => s.id === '1432')?.price || 0) * 1000).toLocaleString(undefined, {maximumFractionDigits:0})} 元** 的寶貴現金！\n` +
                           `- **資產移轉動作**：\n` +
                           `  1. **首選 AI 龍頭**：建議將切除反一收回的資金中撥出 **NT$ 110,000 元** (約 300 股)，於 13:25 尾盤市價買進 **廣達 (2382)** (現價 NT$ ${stocks.find(s => s.id === '2382')?.price.toFixed(2)})，該股符合杯柄突破型態且為 AI 組裝霸主。\n` +
                           `  2. **加碼強勢股**：若 **主動復華未來50 (00991A)** 帳面已擁有雙位數利潤防護墊，可撥出 NT$ 50,000 元進行金字塔式安全加碼。\n` +
                           `  3. **保留現金**：使手頭現金部位維持在 15-20% 的高度靈活狀態，因應 41,000 點高檔震盪。`;

    // ----------------------------------------------------
    // TYPE C: CLOSING REPORT (13:30+)
    // ----------------------------------------------------
    } else if (type === 'closing') {
      title = `🌇 【CAN SLIM 操盤室】台股收盤總結與明日部署 (收盤覆盤)`;
      intro = `**執行時間**：${currentDateString} 13:40 (收盤總結分析)\n` +
              `**當前大盤 M 因子 (Market Direction)**：台股今日加權指數收在 **${market.index.toLocaleString()} 點**，終場 ${taiexIndicator} ${market.changePercent >= 0 ? '+' : ''}${market.changePercent.toFixed(2)}%。今日收盤呈現多頭高檔抗跌格局，市場成交金額高達 **NT$ ${market.volume.toLocaleString()} 億**。在 **${selectedMonth} 月產業旺季特性** 的主導下，多頭結構在尾盤獲得進一步確認。`;

      mFactorAnalysis = `### 📊 1. 收盤大盤 M 因子與法人籌碼解析\n` +
                         `- **成交量能分析**：今日終場成交量符合多頭波段攻擊均量，符合 CAN SLIM **S 因子**「價量齊揚」的優質訊號，顯示今日並非法人出貨日(No Distribution Day)。\n` +
                         `- **循環多頭力道**：受 **${currentCycle.name}** 影響，電子權值股（台積電、鴻海、廣達、英業達、日月光等）尾盤拉抬，證實主流科技股下半年獲利動能正在被市場急遽重估（Re-rating）。`;

      // Portfolio diagnostic for Closing
      let pDiag = `### 🚨 2. 持股庫存：收盤健康健診與明日開盤部署建議\n` +
                  `今日收盤後，您的持股最新損益狀況如下：\n\n` +
                  `| 代號 | 股票名稱 | 持有股數 | 持有均價 | 今日收盤價 | 今日漲跌 % | 當前未實現損益 | 明日 (09:00) 操盤部署指引 |\n` +
                  `|---|---|---|---|---|---|---|---|\n`;

      portfolio.forEach(s => {
        const pnl = (s.price - s.cost) * s.shares;
        const pnlPct = s.cost > 0 ? (pnl / (s.cost * s.shares)) * 100 : 0;
        let suggestion = '';

        if (s.id === '00632R') {
          suggestion = `🚨 **【若未出清，明日開盤必出清】** 收盤虧損達 ${pnlPct.toFixed(1)}%。做空大盤為最惡劣資金配置，明日開盤 09:05 必須市價 100% 砍倉，將本金換回現金。`;
        } else if (s.id === '1432') {
          suggestion = `🚨 **【明日開盤果斷出清】** 終場仍收低，虧損 ${pnlPct.toFixed(1)}%，非主流拖油瓶股。明日開盤直接市價清空。`;
        } else if (pnlPct <= -8) {
          suggestion = `🚨 **【明日開盤無條件停損】** 已跌破 -8% 鐵律防線 (${pnlPct.toFixed(1)}%)！明日開盤直接市價砍倉，留得青山在。`;
        } else if (s.id === '00991A') {
          suggestion = `🔥 **【HOLD / 抱牢迎主升段】** 今日強勢收漲！獲利已達 +${pnlPct.toFixed(1)}%，主動型經理人持續戰勝大盤，明日繼續無痛抱牢，享受主升段暴利。`;
        } else if (s.id === '2356') {
          suggestion = `🔥 **【HOLD / 英業達強勢續抱】** 損益 +${pnlPct.toFixed(1)}%，收盤守穩所有均線。AI 伺服器第三季出貨暢旺，明日繼續抱緊，移動止盈設在 61.5 元。`;
        } else {
          suggestion = `⏳ **【HOLD / 抱牢續抱】** 目前持股損益健康，技術指標 KD 多頭黃金交叉，明日繼續抱牢觀察。`;
        }

        pDiag += `| ${s.id} | ${s.name} | ${s.shares.toLocaleString()} 股 | NT$ ${s.cost.toFixed(2)} | NT$ ${s.price.toFixed(2)} | ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}% | ${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% | ${suggestion} |\n`;
      });
      portfolioDiagnostic = pDiag;

      // Watchlist scanning
      let wRadar = `### 🔍 3. 26檔全標的：今日收盤「CAN SLIM 獵鷹雷達表」與明日追蹤\n` +
                   `收盤覆盤，針對您關注之 26 檔個股，依據收盤價、成交量與 **${selectedMonth}月產業特性** 進行全方位盤後掃描：\n\n`;

      const buyGroup: string[] = [];
      const holdGroup: string[] = [];
      const avoidGroup: string[] = [];

      stocks.forEach(s => {
        if (s.shares > 0) return; // only watch list
        const isPeak = currentCycle.peaks.includes(s.id);
        const isSlow = currentCycle.slows.includes(s.id);
        
        let decision = '';
        if (isPeak && s.change > 1.5) {
          decision = `🔥 **【終場帶量收漲 - 買進/加碼】** 收盤價 NT$ ${s.price.toFixed(2)}。今日終場價量齊揚，完美突破短線盤整箱頂。基本面與 ${selectedMonth} 月產業旺季強烈契合，為標準的 CAN SLIM **L (Leader)** 股，明日開盤建議直接分批買進！`;
          buyGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        } else if (isSlow || s.change < -2.0) {
          decision = `❌ **【全面無買進建議 / 避開觀望】** 收盤價 NT$ ${s.price.toFixed(2)}。終場走勢偏弱且壓在均線之下。受限於 ${selectedMonth} 月產業去庫存低谷及傳統淡季，機構大戶缺乏建倉意願，建議嚴格避開。`;
          avoidGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        } else {
          decision = `⏳ **【無買進建議 / 列入觀察】** 收盤價 NT$ ${s.price.toFixed(2)}。今日盤整無量，KD/RSI指標中性，目前無買進機會，靜待量能甦醒及股價突破。`;
          if (s.id === '2330' || s.id === '2317') {
            decision = `⚖️ **【權值雙雄 - 靜待拉回買點】** 收盤價 NT$ ${s.price.toFixed(2)}。今日高檔強勢震盪（M 因子整固），目前追高風險回報比普通，建議等拉回到月線 (20MA) 再行低吸部署。`;
          }
          holdGroup.push(`- **${s.name} (${s.id})**：${decision}`);
        }
      });

      watchlistRadar = wRadar + 
                       `#### 🌟 類別 A：今日收盤完美觸發「買進/加碼」領先股 (Leader)\n這些股票今日收盤站上關鍵樞紐點 (Pivot)，量能充足，為機構吸籌明證，明日最宜優先佈局。\n\n` + 
                       (buyGroup.length > 0 ? buyGroup.join('\n') : "　　暫無標的收盤觸發強烈買進點。\n") + '\n\n' +
                       `#### ⚖️ 類別 B：中性整理 / 靜待突破之優質觀察股\n基本面優秀，但目前處於縮量橫盤整理，不宜追高，靜待帶量突破或拉回支撐。\n\n` + 
                       holdGroup.join('\n') + '\n\n' +
                       `#### ❌ 類別 C：弱勢修正 / 行業循環低谷 (全面避開)\n產業循環正處下行或去庫存，或技術面呈現空頭，機構大資金撤離，嚴禁伸手抄底。\n\n` + 
                       avoidGroup.join('\n');

      // 4. Portfolio stats recap for closing
      const portfolioStocks = stocks.filter(s => s.shares > 0);
      const totalCost = portfolioStocks.reduce((acc, s) => acc + s.cost * s.shares, 0);
      const totalValue = portfolioStocks.reduce((acc, s) => acc + s.price * s.shares, 0);
      const totalPnL = totalValue - totalCost;
      const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

      allocationStrategy = `### 💰 4. 200萬框架下：收盤總體資產配置建議與明日部署\n` +
                           `- **資產防衛盤點**：\n` +
                           `  - 現有持股總成本：NT$ ${totalCost.toLocaleString()} 元\n` +
                           `  - 現有持股總市值：NT$ ${totalValue.toLocaleString()} 元\n` +
                           `  - 目前帳戶總未實現損益：**NT$ ${totalPnL.toLocaleString()} 元 (${totalPnLPct >= 0 ? '+' : ''}${totalPnLPct.toFixed(2)}%)**\n` +
                           `- **明日開盤部署計畫**：\n` +
                           `  1. **切除毒瘤，回收資金**：若今日尾盤已成功切除【反一】與【大魯閣】，您帳上已收回 **NT$ ${((stocks.find(s => s.id === '00632R')?.price || 0) * 12000 + (stocks.find(s => s.id === '1432')?.price || 0) * 1000).toLocaleString(undefined, {maximumFractionDigits:0})} 元** 的現金，使得帳戶防禦力大幅增加。\n` +
                           `  2. **強弱置換**：明日開盤後，可將此收回資金中撥出 **NT$ 11~15 萬**，分批在 NT$ 370 元附近買進 **廣達 (2382)**。廣達身處 **${selectedMonth} 月產業爆發期**，且今日終場收在強多高點，非常符合笑傲股市的「強勢領先股」原則。\n` +
                           `  3. **保留足夠子彈**：200 萬總框架中尚未投入的 120 萬資金，在台股歷史高檔中應繼續冰存，作為下半年加碼台積電、鴻海的終極戰略儲備。`;
    }

    footerSign = `\n---\n*本報告由【台股 CAN SLIM 智慧操盤系統】依據 2026 年 7 月即時行情及歐尼爾大師量化法則自動運算產出。股市交易存在風險，本報告僅供紀律與策略參考，不構成任何保證獲利之投資建議。交易第一原則：絕對嚴格執行 7-8% 停損紅線！*`;

    const fullReport = `${title}\n==================================================\n\n${intro}\n\n${mFactorAnalysis}\n\n${portfolioDiagnostic}\n\n${watchlistRadar}\n\n${allocationStrategy}\n${footerSign}`;
    setReportContent(fullReport);
  };

  // Run on mount or when month/stocks change to provide default report
  useEffect(() => {
    generateReport('morning');
  }, [selectedMonth, stocks]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 border border-indigo-200">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-base font-black text-slate-900 font-display">
              台股 CAN SLIM 智慧投資操盤室 & 一鍵產出建議報告
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            融合威廉·歐尼爾 CAN SLIM 哲學、1-12月產業季節性循環，以及盤中即時技術指標，秒級產出專業機構級多空策略報告
          </p>
        </div>

        {/* Month Selector dropdown */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-slate-700">產業循環月份設定:</span>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-black font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm hover:border-slate-300"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m} 月 ({iMonthToQuarter(m)})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Month Seasonal Properties Box */}
      <div className="px-4 py-3 bg-indigo-50/40 border-b border-slate-100 text-xs text-indigo-950 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-black text-indigo-900">
              當前設定：{currentCycle.name} - 旺季概念為：
            </span>
            <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded font-bold ml-1">
              {currentCycle.theme}
            </span>
            <p className="text-[11px] text-indigo-700 mt-1 font-medium leading-relaxed">
              {currentCycle.details}
            </p>
          </div>
        </div>
        <div className="text-[10px] text-slate-400 font-bold self-end sm:self-auto flex items-center gap-1">
          <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
          <span>循環月份會自動動態改變獵鷹雷達的買賣判定邏輯</span>
        </div>
      </div>

      {/* Three quick action buttons */}
      <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => generateReport('morning')}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black border transition-all cursor-pointer shadow-sm ${
            activeReport === 'morning'
              ? 'bg-amber-600 text-white border-amber-500 shadow-amber-600/10'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-amber-700 hover:text-amber-800'
          }`}
        >
          <Sunrise className="w-4 h-4" />
          <span>🌅 一鍵生成「每日晨報」 (08:30 盤前建議)</span>
        </button>

        <button
          onClick={() => generateReport('afternoon')}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black border transition-all cursor-pointer shadow-sm ${
            activeReport === 'afternoon'
              ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/10'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-indigo-700 hover:text-indigo-800'
          }`}
        >
          <Sun className="w-4 h-4" />
          <span>☀️ 一鍵生成「午盤即時報」 (12:00 盤中決策)</span>
        </button>

        <button
          onClick={() => generateReport('closing')}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black border transition-all cursor-pointer shadow-sm ${
            activeReport === 'closing'
              ? 'bg-slate-800 text-white border-slate-700 shadow-slate-800/10'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-800'
          }`}
        >
          <Sunset className="w-4 h-4" />
          <span>🌇 一鍵生成「收盤總結報」 (13:30+ 盤後覆盤)</span>
        </button>
      </div>

      {/* Generated Report Viewer */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col gap-4 bg-slate-50/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
            <FileText className="w-3.5 h-3.5" />
            <span>報告預覽視窗</span>
          </div>
          <button
            onClick={handleCopyReport}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-sm ${
              isCopied
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>複製成功！</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>一鍵複製報告內容 (Markdown)</span>
              </>
            )}
          </button>
        </div>

        {/* Stylized Report Terminal Sheet */}
        <div className="border border-slate-200 rounded-2xl bg-white p-5 shadow-inner overflow-y-auto max-h-[550px] leading-relaxed text-slate-700 select-text">
          {renderFormattedReport(reportText)}
        </div>
      </div>
    </div>
  );
}

// Simple helper to convert month to traditional Taiwan market quarter names
function iMonthToQuarter(m: number): string {
  if (m >= 1 && m <= 3) return 'Q1 財報與高殖利率宣告季';
  if (m >= 4 && m <= 6) return 'Q2 電子淡季五窮六絕與稅季';
  if (m >= 7 && m <= 9) return 'Q3 電子外銷大旺季與客運高溫';
  return 'Q4 年終消費拉貨與年底集團作帳季';
}

// Custom Markdown renderer helpers
const renderTextWithFormatting = (text: string) => {
  if (!text) return '';
  const parts = text.split('**');
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return <strong key={index} className="font-black text-slate-900">{part}</strong>;
    }
    return part;
  });
};

const renderFormattedReport = (text: string) => {
  if (!text) return <p className="text-slate-400 text-center py-8">點擊上方按鈕，即刻運算產出對應報告。</p>;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  
  let currentTableHeaders: string[] = [];
  let currentTableRows: string[][] = [];
  let isInsideTable = false;

  const flushTable = (key: number) => {
    if (currentTableHeaders.length > 0 && currentTableRows.length > 0) {
      elements.push(
        <div key={`table-${key}`} className="my-4 overflow-x-auto border border-slate-200 rounded-xl shadow-sm bg-white">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {currentTableHeaders.map((h, i) => {
                  const isLast = i === currentTableHeaders.length - 1;
                  const isFirst = i === 0;
                  const alignClass = isFirst ? 'text-left pl-4 font-black text-slate-800' : isLast ? 'text-left pr-4 font-black text-slate-800' : 'text-center font-black text-slate-800';
                  return (
                    <th key={i} className={`py-2.5 px-3 whitespace-nowrap ${alignClass}`}>
                      {h.trim()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentTableRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50/50 transition-colors">
                  {row.map((cell, ci) => {
                    const trimmedCell = cell.trim();
                    let content: React.ReactNode = trimmedCell;
                    
                    if (ci === 0 && /^\d+[A-Z]?$/.test(trimmedCell)) {
                      content = <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-bold">{trimmedCell}</span>;
                    }
                    
                    if (trimmedCell.includes("🚨") || trimmedCell.includes("【開盤直接")) {
                      content = (
                        <span className="text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1.5 rounded-lg block font-semibold leading-relaxed">
                          {renderTextWithFormatting(trimmedCell)}
                        </span>
                      );
                    } else if (trimmedCell.includes("🔥") || trimmedCell.includes("強勢續抱") || trimmedCell.includes("金字塔")) {
                      content = (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded-lg block font-semibold leading-relaxed">
                          {renderTextWithFormatting(trimmedCell)}
                        </span>
                      );
                    } else if (trimmedCell.includes("⏳") || trimmedCell.includes("HOLD")) {
                      content = (
                        <span className="text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1.5 rounded-lg block font-semibold leading-relaxed">
                          {renderTextWithFormatting(trimmedCell)}
                        </span>
                      );
                    } else if (trimmedCell.includes("💰") || trimmedCell.includes("停利")) {
                      content = (
                        <span className="text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1.5 rounded-lg block font-semibold leading-relaxed">
                          {renderTextWithFormatting(trimmedCell)}
                        </span>
                      );
                    } else {
                      if (trimmedCell.includes("%")) {
                        const isUp = trimmedCell.startsWith("+") || (!trimmedCell.startsWith("-") && parseFloat(trimmedCell) > 0);
                        const isDown = trimmedCell.startsWith("-");
                        content = (
                          <span className={`font-mono font-bold ${isUp ? 'text-emerald-600' : isDown ? 'text-rose-600' : 'text-slate-650'}`}>
                            {trimmedCell}
                          </span>
                        );
                      } else if (trimmedCell.startsWith("NT$")) {
                        content = <span className="font-mono text-slate-800 font-semibold">{trimmedCell}</span>;
                      } else if (trimmedCell.endsWith("股")) {
                        content = <span className="font-mono text-slate-750 font-bold">{trimmedCell}</span>;
                      } else {
                        content = renderTextWithFormatting(trimmedCell);
                      }
                    }

                    const isLast = ci === row.length - 1;
                    const isFirst = ci === 0;
                    const alignClass = isFirst ? 'text-left font-mono font-bold pl-4' : isLast ? 'text-left min-w-[280px] pr-4' : 'text-center whitespace-nowrap';

                    return (
                      <td key={ci} className={`py-3 px-3 leading-relaxed text-slate-650 ${alignClass}`}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      currentTableHeaders = [];
      currentTableRows = [];
    }
    isInsideTable = false;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const isRow = line.trim().startsWith('|') && line.trim().endsWith('|');

    if (isRow) {
      isInsideTable = true;
      const parts = line.split('|').map(p => p.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
      const isSeparator = parts.every(p => p.startsWith('-') || p === '');
      
      if (isSeparator) {
        continue;
      }

      if (currentTableHeaders.length === 0) {
        currentTableHeaders = parts;
      } else {
        currentTableRows.push(parts);
      }
    } else {
      if (isInsideTable) {
        flushTable(idx);
      }

      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      if (trimmedLine.startsWith('==================================================')) {
        elements.push(<hr key={`hr-${idx}`} className="my-4 border-slate-200" />);
      } else if (trimmedLine.startsWith('###')) {
        const titleText = trimmedLine.replace('###', '').trim();
        elements.push(
          <h3 key={`h3-${idx}`} className="text-xs font-black text-slate-900 font-display flex items-center gap-2 mt-5 mb-3 bg-slate-100 p-2.5 rounded-lg border border-slate-200">
            {titleText}
          </h3>
        );
      } else if (trimmedLine.startsWith('####')) {
        const titleText = trimmedLine.replace('####', '').trim();
        let bgClass = "bg-slate-50 border-slate-200 text-slate-800";
        if (titleText.includes("類別 A") || titleText.includes("強力") || titleText.includes("領先股")) {
          bgClass = "bg-emerald-50 border-emerald-100 text-emerald-950";
        } else if (titleText.includes("類別 B") || titleText.includes("觀察")) {
          bgClass = "bg-amber-50 border-amber-100 text-amber-950";
        } else if (titleText.includes("類別 C") || titleText.includes("避開") || titleText.includes("修正")) {
          bgClass = "bg-rose-50 border-rose-100 text-rose-950";
        }
        elements.push(
          <h4 key={`h4-${idx}`} className={`text-[11px] font-black px-3 py-1.5 rounded-lg border my-3 leading-relaxed flex items-center gap-1.5 ${bgClass}`}>
            {titleText}
          </h4>
        );
      } else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
        elements.push(
          <p key={`p-bold-${idx}`} className="text-xs font-black text-slate-900 my-2">
            {trimmedLine.replace(/\*\*/g, '')}
          </p>
        );
      } else if (trimmedLine.startsWith('-')) {
        const contentStr = trimmedLine.substring(1).trim();
        elements.push(
          <div key={`bullet-${idx}`} className="flex items-start gap-2 pl-4 my-1.5 text-xs text-slate-650 leading-relaxed">
            <span className="text-indigo-500 mt-1.5 flex-shrink-0 font-bold">•</span>
            <div className="flex-1">{renderTextWithFormatting(contentStr)}</div>
          </div>
        );
      } else if (trimmedLine.startsWith('*本報告由')) {
        elements.push(
          <p key={`footer-${idx}`} className="text-[11px] text-slate-400 italic bg-slate-50 border border-slate-150 rounded-xl p-3.5 mt-6 leading-relaxed">
            {trimmedLine.replace(/\*/g, '')}
          </p>
        );
      } else if (trimmedLine.startsWith('---')) {
        elements.push(<hr key={`hr-divider-${idx}`} className="my-5 border-slate-200 border-dashed" />);
      } else {
        elements.push(
          <p key={`text-${idx}`} className="text-xs text-slate-650 leading-relaxed my-2">
            {renderTextWithFormatting(trimmedLine)}
          </p>
        );
      }
    }
  }

  if (isInsideTable) {
    flushTable(lines.length);
  }

  return <div className="space-y-1 select-text font-sans">{elements}</div>;
};
