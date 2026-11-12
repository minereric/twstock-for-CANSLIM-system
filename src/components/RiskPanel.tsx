import React, { useMemo, useState } from 'react';
import { ShieldAlert, ShieldCheck, HelpCircle, Settings2 } from 'lucide-react';
import type { Stock } from '../types';
import { computeRisks, mergeTags, DEFAULT_RISK_SETTINGS, type RiskLevel, type RiskSettings, type RiskTagKind } from '../utils/riskEngine';
import { computeCanSlim } from '../utils/canslim';
import { getAllTags, getChipRows, getFundamental, getInstRows, getMarketCandles } from '../utils/officialStore';

const SETTINGS_KEY = 'tw_risk_settings';
export function loadRiskSettings(): RiskSettings {
  try {
    return { ...DEFAULT_RISK_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) };
  } catch {
    return DEFAULT_RISK_SETTINGS;
  }
}

const LEVEL_STYLE: Record<RiskLevel, { box: string; chip: string; label: string }> = {
  high: { box: 'border-rose-200 bg-rose-50/60', chip: 'bg-rose-600 text-white', label: '高風險' },
  medium: { box: 'border-amber-200 bg-amber-50/60', chip: 'bg-amber-500 text-white', label: '注意' },
  low: { box: 'border-yellow-200 bg-yellow-50/50', chip: 'bg-yellow-400 text-yellow-900', label: '留意' },
  ok: { box: 'border-slate-200 bg-white', chip: 'bg-emerald-100 text-emerald-700', label: '正常' },
  nodata: { box: 'border-dashed border-slate-300 bg-slate-50', chip: 'bg-slate-200 text-slate-500', label: '資料不足' },
};

const fmtSheets = (shares: number | null | undefined) => (shares == null ? '—' : Math.round(shares / 1000).toLocaleString());

interface Props {
  stock: Stock;
  version: number; // 官方資料／K 線更新時遞增
  onSetTag: (stockId: string, tag: RiskTagKind, enabled: boolean) => void | Promise<void>;
}

export default function RiskPanel({ stock, version, onSetTag }: Props) {
  const [settings, setSettings] = useState<RiskSettings>(loadRiskSettings);
  const [showSettings, setShowSettings] = useState(false);

  const fundamental = getFundamental(stock.id);
  const chip = getChipRows(stock.id);
  const inst = getInstRows(stock.id);
  const tags = useMemo(() => mergeTags(getAllTags()).filter((t) => t.stock_id === stock.id), [stock.id, version]);

  const alerts = useMemo(
    () => computeRisks({ stockId: stock.id, candles: stock.candleHistory, fundamental, chip, inst, tags, settings }),
    [stock.id, stock.candleHistory, version, settings, tags],
  );
  const cs = useMemo(
    () => computeCanSlim({ stockId: stock.id, candles: stock.candleHistory, fundamental, chip, inst, marketCandles: getMarketCandles() }),
    [stock.id, stock.candleHistory, version],
  );

  const setNum = (k: keyof RiskSettings, v: string) => {
    const next = { ...settings, [k]: Number(v) };
    setSettings(next);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const hasTag = (k: RiskTagKind) => tags.some((t) => t.tag === k);
  const instSorted = [...inst].sort((a, b) => a.trade_date.localeCompare(b.trade_date)).slice(-5);
  const sum = (key: 'foreign_net' | 'trust_net' | 'dealer_net') => (instSorted.length ? instSorted.reduce((a, r) => a + (Number(r[key]) || 0), 0) : null);
  const chipSorted = [...chip].sort((a, b) => a.data_date.localeCompare(b.data_date));
  const lastChip = chipSorted[chipSorted.length - 1];

  const letters: [keyof typeof cs.notes & string, string, number | null][] = [
    ['c', 'C 當季盈餘', cs.c], ['a', 'A 年度盈餘', cs.a], ['n', 'N 創新高', cs.n], ['s', 'S 供需', cs.s],
    ['l', 'L 領導股', cs.l], ['i', 'I 法人認同', cs.i], ['m', 'M 大盤方向', cs.m],
  ];

  return (
    <div className="space-y-4 text-slate-700">
      {/* 六大風險提醒 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> 風險提醒（六項）
          </h4>
          <button onClick={() => setShowSettings((v) => !v)} className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer">
            <Settings2 className="w-3 h-3" /> 門檻設定
          </button>
        </div>

        {showSettings && (
          <div className="grid grid-cols-2 gap-2 p-2.5 mb-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px]">
            {([
              ['insiderLowPct', '董監持股低於 (%)'], ['insiderVeryLowPct', '董監持股極低 (%)'],
              ['chaseGain5', '5日漲幅 ≥ (%)'], ['chaseGain20', '20日漲幅 ≥ (%)'],
              ['chaseDeviationMa20', '乖離月線 ≥ (%)'], ['chaseRsi', 'RSI ≥'], ['bigHolderDropPct', '千張大戶週減 ≥ (點)'],
            ] as [keyof RiskSettings, string][]).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between gap-2">
                <span className="text-slate-600">{label}</span>
                <input type="number" step="0.1" value={settings[k]} onChange={(e) => setNum(k, e.target.value)}
                  className="w-16 px-1.5 py-0.5 border border-slate-200 rounded font-mono text-right" />
              </label>
            ))}
            <button onClick={() => { setSettings(DEFAULT_RISK_SETTINGS); localStorage.removeItem(SETTINGS_KEY); }}
              className="col-span-2 text-[10px] text-indigo-600 hover:underline cursor-pointer text-left">還原預設門檻</button>
          </div>
        )}

        <div className="space-y-1.5">
          {alerts.map((a) => {
            const st = LEVEL_STYLE[a.level];
            return (
              <div key={a.key} className={`border rounded-xl p-2 ${st.box}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-800">{a.title}</span>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${st.chip}`}>{st.label}</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{a.summary}</p>
                {a.detail && <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{a.detail}</p>}
                <p className="text-[9px] text-slate-300 mt-0.5">來源：{a.source}</p>
              </div>
            );
          })}
        </div>

        {/* 產業標籤（主觀判斷，可自行開關） */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="text-slate-400">產業標籤（主觀判斷，可自行調整）：</span>
          {([['china_expansion', '陸廠擴產競爭'], ['demographic', '少子化／人口結構']] as [RiskTagKind, string][]).map(([k, label]) => (
            <button key={k} onClick={() => onSetTag(stock.id, k, !hasTag(k))}
              className={`px-2 py-0.5 rounded-full border font-bold cursor-pointer ${hasTag(k) ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {hasTag(k) ? '✓ ' : '+ '}{label}
            </button>
          ))}
        </div>
      </div>

      {/* CAN SLIM */}
      <div>
        <h4 className="text-[11px] font-black text-slate-800 flex items-center gap-1.5 mb-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> CAN SLIM® 七項（笑傲股市）
          <span className="ml-auto text-[10px] font-mono text-slate-500">總分 {cs.coverage > 0 ? cs.total : '—'}（{cs.coverage}/7 項有資料）</span>
        </h4>
        <div className="grid grid-cols-2 gap-1.5">
          {letters.map(([k, label, v]) => (
            <div key={k} className="bg-slate-50 border border-slate-200/70 rounded-lg p-2" title={cs.notes[k as 'c']}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-600">{label}</span>
                <span className={`text-sm font-black font-mono ${v == null ? 'text-slate-300' : v >= 70 ? 'text-emerald-600' : v >= 45 ? 'text-slate-700' : 'text-rose-600'}`}>{v ?? '—'}</span>
              </div>
              <div className="h-1 bg-slate-200 rounded mt-1"><div className="h-1 rounded bg-indigo-500" style={{ width: `${v ?? 0}%` }} /></div>
              <p className="text-[9px] text-slate-400 mt-1 leading-snug line-clamp-3">{cs.notes[k as 'c'] ?? ''}</p>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-slate-400 mt-1.5 leading-snug flex gap-1">
          <HelpCircle className="w-3 h-3 shrink-0" />
          計分只使用真實資料，缺資料的項目不計分（不猜測）。C 以最新月營收年增率作為代理（官方開放資料沒有單季 EPS 年增率）；A 因缺歷年 EPS 暫無資料。分數為輔助判讀，非投資建議。
        </p>
      </div>

      {/* 官方籌碼與基本面 */}
      <div>
        <h4 className="text-[11px] font-black text-slate-800 mb-1.5">官方籌碼與基本面</h4>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <Cell label="產業別" value={fundamental?.industry ?? '—'} />
          <Cell label="董監持股合計" value={fundamental?.insider_hold_pct != null ? `${Number(fundamental.insider_hold_pct)}%` : '—'} />
          <Cell label={`月營收年增（${fundamental?.revenue_month ?? '—'}）`} value={fundamental?.revenue_yoy != null ? `${Number(fundamental.revenue_yoy)}%` : '—'} />
          <Cell label="月營收月增" value={fundamental?.revenue_mom != null ? `${Number(fundamental.revenue_mom)}%` : '—'} />
          <Cell label={`千張大戶持股${lastChip ? `（${lastChip.data_date}）` : ''}`} value={lastChip ? `${Number(lastChip.big_holder_pct)}%` : '—'} />
          <Cell label="集保股東人數" value={lastChip?.total_holders != null ? Number(lastChip.total_holders).toLocaleString() : '—'} />
          <Cell label={`外資近${instSorted.length || 5}日(張)`} value={fmtSheets(sum('foreign_net'))} />
          <Cell label={`投信近${instSorted.length || 5}日(張)`} value={fmtSheets(sum('trust_net'))} />
        </div>
        <p className="text-[9px] text-slate-300 mt-1">資料：TWSE/TPEx 開放資料、公開資訊觀測站、集保結算所；僅在官方公布後更新。</p>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200/70 rounded-lg px-2 py-1.5 flex items-center justify-between gap-2">
      <span className="text-slate-500 truncate">{label}</span>
      <span className="font-mono font-bold text-slate-800 shrink-0">{value}</span>
    </div>
  );
}
