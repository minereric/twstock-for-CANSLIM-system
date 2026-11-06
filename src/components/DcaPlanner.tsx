import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, AlertTriangle, RotateCcw, ShieldAlert, ListChecks, PiggyBank, Undo2 } from 'lucide-react';
import { Stock } from '../types';
import {
  DcaPlan, DEFAULT_PLAN, TrancheStatus, evaluatePlan, summarizePlan, triggerLevel,
  taipeiNow, checkStopLoss, loadPlan, savePlan, executedThisWeek,
} from '../utils/dcaPlan';
import { triggerBrowserNotification } from './NotificationCenter';

interface Props {
  stocks: Stock[];
  twiiIndex: number | null;       // 目前加權指數（^TWII）
  onNotify?: (message: string, type: 'buy' | 'sell' | 'neutral') => void;
}

const fmtMoney = (n: number) => `${(n / 10_000).toLocaleString('zh-TW', { maximumFractionDigits: 1 })} 萬`;
const fmtIdx = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;

function StatusBadge({ s }: { s: TrancheStatus }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap';
  switch (s.kind) {
    case 'executed': return <span className={`${base} bg-slate-100 text-slate-500`}>已執行</span>;
    case 'due': return <span className={`${base} bg-emerald-100 text-emerald-700`}>{s.reason === 'date' ? '今日可買（時間到）' : '今日可買（價格觸發）'}</span>;
    case 'warning': return <span className={`${base} bg-amber-100 text-amber-700`}>盤中達標，等收盤確認</span>;
    case 'blocked_weekly_limit': return <span className={`${base} bg-rose-50 text-rose-600`}>本週已達上限，下週再買</span>;
    default: return <span className={`${base} bg-white text-slate-400 border border-slate-200`}>等待中</span>;
  }
}

export default function DcaPlanner({ stocks, twiiIndex, onNotify }: Props) {
  const [plan, setPlan] = useState<DcaPlan>(() => loadPlan());
  const [clock, setClock] = useState(() => taipeiNow());
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => { savePlan(plan); }, [plan]);
  useEffect(() => {
    const t = setInterval(() => setClock(taipeiNow()), 60_000);
    return () => clearInterval(t);
  }, []);

  const statuses = useMemo(
    () => evaluatePlan(plan, twiiIndex, clock.date, clock.afterClose),
    [plan, twiiIndex, clock],
  );
  const summary = useMemo(() => summarizePlan(plan), [plan]);
  const weeklyUsed = executedThisWeek(plan, clock.date);
  const signalCount = plan.signals.filter(s => s.checked).length;
  const signalsStale = plan.signalsCheckedOn !== undefined && plan.signalsCheckedOn !== clock.date;
  const satelliteReady = !signalsStale && signalCount >= plan.satelliteSignalThreshold;
  const stopRows = useMemo(() => checkStopLoss(stocks, plan.stopLossPct), [stocks, plan.stopLossPct]);
  const breached = stopRows.filter(r => r.breached);
  const indexVsBase = twiiIndex ? twiiIndex / plan.baseIndex - 1 : null;

  // 每批每天只提醒一次
  useEffect(() => {
    for (const t of plan.tranches) {
      const s = statuses[t.id];
      if (s?.kind !== 'due' && s?.kind !== 'warning') continue;
      const key = `${clock.date}:${t.id}:${s.kind}`;
      if (notifiedRef.current.has(key)) continue;
      notifiedRef.current.add(key);
      const msg = s.kind === 'due'
        ? `${t.label}（${fmtMoney(t.amount)}）今日可執行`
        : `${t.label} 盤中已達觸發點，收盤後確認`;
      onNotify?.(msg, s.kind === 'due' ? 'buy' : 'neutral');
      triggerBrowserNotification('分批進場提醒', msg);
    }
    for (const r of breached) {
      const key = `${clock.date}:stop:${r.id}`;
      if (notifiedRef.current.has(key)) continue;
      notifiedRef.current.add(key);
      const msg = `${r.name}（${r.id}）跌破停損線 ${fmtPct(r.pnlPct)}`;
      onNotify?.(msg, 'sell');
      triggerBrowserNotification('停損提醒', msg);
    }
  }, [statuses, breached, clock.date, plan.tranches, onNotify]);

  const updateTranche = (id: string, patch: Partial<DcaPlan['tranches'][number]>) =>
    setPlan(p => ({ ...p, tranches: p.tranches.map(t => (t.id === id ? { ...t, ...patch } : t)) }));

  const markExecuted = (id: string) =>
    updateTranche(id, { executedAt: clock.date, executedIndex: twiiIndex ?? undefined });
  const undoExecuted = (id: string) => updateTranche(id, { executedAt: undefined, executedIndex: undefined });

  const toggleSignal = (id: string) =>
    setPlan(p => {
      // 跨日第一次勾選時，先清掉前一天的勾選
      const base = p.signalsCheckedOn === clock.date ? p.signals : p.signals.map(s => ({ ...s, checked: false }));
      return {
        ...p,
        signalsCheckedOn: clock.date,
        signals: base.map(s => (s.id === id ? { ...s, checked: !s.checked } : s)),
      };
    });

  const resetPlan = () => {
    if (window.confirm('確定要把分批計畫恢復成預設值嗎？已執行的紀錄會一併清除。')) {
      setPlan(structuredClone(DEFAULT_PLAN));
    }
  };

  const dueList = plan.tranches.filter(t => statuses[t.id]?.kind === 'due');

  return (
    <div className="space-y-6">
      {/* 摘要 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-indigo-600" />分批進場計畫
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              觸發點以 {plan.baseDate} 收盤 {fmtIdx(plan.baseIndex)} 點為基準；價格觸發一律看收盤價。台北時間 {clock.date}
              {clock.afterClose ? '（已收盤）' : '（盤中）'}
            </p>
          </div>
          <button onClick={resetPlan} className="self-start sm:self-auto text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" />恢復預設
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[11px] text-slate-500">目前加權指數</div>
            <div className="text-lg font-black text-slate-900">{twiiIndex ? fmtIdx(twiiIndex) : '—'}</div>
            <div className={`text-xs font-bold ${indexVsBase !== null && indexVsBase < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {indexVsBase !== null ? `相對基準 ${fmtPct(indexVsBase)}` : '尚未取得報價'}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[11px] text-slate-500">已投入／排定</div>
            <div className="text-lg font-black text-slate-900">{fmtMoney(summary.invested)}</div>
            <div className="text-xs text-slate-500">共 {fmtMoney(summary.trancheTotal)}，剩 {fmtMoney(summary.remaining)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[11px] text-slate-500">平均進場指數</div>
            <div className="text-lg font-black text-slate-900">{summary.avgEntryIndex ? fmtIdx(summary.avgEntryIndex) : '—'}</div>
            <div className="text-xs text-slate-500">已執行 {summary.executedCount}／{summary.totalTranches} 批</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[11px] text-slate-500">本週已執行</div>
            <div className="text-lg font-black text-slate-900">{weeklyUsed}／{plan.maxPerWeek} 批</div>
            <div className="text-xs text-slate-500">同一週最多 {plan.maxPerWeek} 批</div>
          </div>
        </div>

        {dueList.length > 0 && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex flex-col gap-2">
            {dueList.map(t => (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-sm font-bold text-emerald-800">
                  {t.label}：{fmtMoney(t.amount)}{t.group === 'core' ? '（市值型與防禦型 ETF 依 10：3 分配）' : '（加碼核心 ETF）'}
                </span>
                <button onClick={() => markExecuted(t.id)} className="self-start bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">
                  標記已買進
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 批次表 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-indigo-600" />批次時程
        </h3>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-bold">批次</th>
                <th className="py-2 pr-3 font-bold">預定日期</th>
                <th className="py-2 pr-3 font-bold">價格觸發（收盤）</th>
                <th className="py-2 pr-3 font-bold text-right">金額（元）</th>
                <th className="py-2 pr-3 font-bold">狀態</th>
                <th className="py-2 font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              {plan.tranches.map(t => {
                const s = statuses[t.id];
                const done = !!t.executedAt;
                return (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-bold text-slate-800">
                      {t.label}
                      {t.note && <div className="text-[10px] font-normal text-slate-400">{t.note}</div>}
                    </td>
                    <td className="py-2 pr-3">
                      {t.group === 'core' ? (
                        <input type="date" value={t.plannedDate ?? ''} disabled={done}
                          onChange={e => updateTranche(t.id, { plannedDate: e.target.value || undefined })}
                          className="border border-slate-200 rounded-md px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400" />
                      ) : <span className="text-slate-400">不排日期</span>}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {t.triggerPct !== undefined
                        ? <>≤ {fmtIdx(triggerLevel(plan.baseIndex, t.triggerPct))}<span className="text-slate-400">（{fmtPct(t.triggerPct)}）</span></>
                        : <span className="text-slate-400">無</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input type="number" min={0} step={10000} value={t.amount} disabled={done}
                        onChange={e => updateTranche(t.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-24 text-right border border-slate-200 rounded-md px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400" />
                    </td>
                    <td className="py-2 pr-3">
                      {s && <StatusBadge s={s} />}
                      {done && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {t.executedAt}{t.executedIndex ? ` @ ${fmtIdx(t.executedIndex)}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      {done ? (
                        <button onClick={() => undoExecuted(t.id)} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer">
                          <Undo2 className="w-3.5 h-3.5" />復原
                        </button>
                      ) : (
                        <button onClick={() => markExecuted(t.id)} className="text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer">
                          標記已買進
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          時間或價格哪個先到，就執行下一個尚未執行的批次；價格觸發提前後，其餘批次仍照原日期。指數站回 {fmtIdx(plan.baseIndex)} 以上也不追價，照時程繼續。
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 止跌訊號 */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-1">
            <ListChecks className="w-4 h-4 text-indigo-600" />止跌訊號檢查表
          </h3>
          <p className="text-[11px] text-slate-500 mb-3">每天收盤後勾選，達 {plan.satelliteSignalThreshold} 項才開始買衛星個股；核心 ETF 不受此限。</p>
          <ul className="space-y-2">
            {plan.signals.map(s => (
              <li key={s.id}>
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-indigo-600"
                    checked={!signalsStale && s.checked} onChange={() => toggleSignal(s.id)} />
                  <span>{s.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${satelliteReady ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>
            {signalsStale
              ? '今天還沒勾選，昨天的勾選已失效'
              : `今日 ${signalCount}／${plan.signals.length} 項成立 — ${satelliteReady ? '可以開始試單衛星個股（每檔先買 3 萬）' : '尚未止跌，個股先觀望'}`}
          </div>
        </section>

        {/* 停損監控 */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-indigo-600" />持股停損監控
          </h3>
          <p className="text-[11px] text-slate-500 mb-3">
            依庫存股的成本與現價計算，跌破成本 {Math.abs(plan.stopLossPct * 100)}% 即提醒；核心 ETF 長期持有，可不理會。
          </p>
          {stopRows.length === 0 ? (
            <p className="text-xs text-slate-400">庫存股中還沒有持股。到「庫存股分析工具」新增後會出現在這裡。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stopRows.map(r => (
                <li key={r.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{r.name} <span className="text-slate-400 font-normal">{r.id}</span></span>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-500">成本 {r.cost}／現價 {r.price}</span>
                    <span className={`font-black ${r.pnlPct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtPct(r.pnlPct)}</span>
                    {r.breached
                      ? <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold"><AlertTriangle className="w-3 h-3" />停損</span>
                      : <CheckCircle2 className="w-3.5 h-3.5 text-slate-300" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 資金配置 */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-sm font-black text-slate-900 mb-3">資金配置</h3>
        <ul className="divide-y divide-slate-100">
          {plan.allocations.map(a => (
            <li key={a.key} className="py-2 flex items-center justify-between text-xs">
              <span className="text-slate-700">{a.label}</span>
              <span className="font-bold text-slate-900">{fmtMoney(a.amount)}<span className="text-slate-400 font-normal ml-1">（{Math.round(a.amount / plan.totalCapital * 100)}%）</span></span>
            </li>
          ))}
        </ul>
        {summary.allocationTotal !== plan.totalCapital && (
          <p className="text-xs text-rose-600 mt-2">配置合計 {fmtMoney(summary.allocationTotal)}，與總資金 {fmtMoney(plan.totalCapital)} 不符。</p>
        )}
        <p className="text-[11px] text-slate-400 mt-3">本頁是依個人計畫產生的提醒工具，不構成投資建議。</p>
      </section>
    </div>
  );
}
