import React, { useEffect, useState } from 'react';

interface BreadthSnapshot {
  schemaVersion: number;
  status: 'ready' | 'partial';
  market: string;
  tradeDate: string;
  generatedAt: string;
  universeCount: number;
  eligibleCount: number;
  above200Count: number;
  coverage: number;
  breadthAbove200: number | null;
  source: string;
  warnings: string[];
}

export default function MarketBreadthPanel() {
  const [data, setData] = useState<BreadthSnapshot | null>(null);
  const [error, setError] = useState<string>('');
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}market-breadth/latest.json`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('尚未發布正式市場寬度資料');
        const payload = await response.json() as BreadthSnapshot;
        if (payload.schemaVersion !== 1 || payload.market !== 'TWSE') throw new Error('資料格式不符');
        if (alive) setData(payload);
      })
      .catch((err: Error) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);

  const latest = data?.tradeDate && /^\d{4}-\d{2}-\d{2}$/.test(data.tradeDate) ? data.tradeDate : '未知';
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 my-5">
      <h3 className="font-bold text-lg mb-2">台股市場寬度 · 200 日均線</h3>
      {!data ? <p className="text-sm text-amber-300">{error || '讀取市場寬度資料中…'}</p> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-4">
            <div><p className="text-xs text-slate-400">上市普通股站上 200 日均線</p>
              <p className="text-2xl font-bold">{data.status === 'ready' && data.breadthAbove200 !== null
                ? `${(data.breadthAbove200 * 100).toFixed(1)}%` : '資料不足'}</p></div>
            <div className="text-sm text-slate-300">有效樣本 {data.eligibleCount} / {data.universeCount} 檔</div>
          </div>
          <p className="text-xs text-slate-400">資料日：{latest} ｜樣本覆蓋率 {(data.coverage * 100).toFixed(1)}%｜來源：{data.source}</p>
          {data.status !== 'ready' && <p className="text-amber-300 text-sm">資料仍在建置中，不作市場健康度結論。</p>}
          <p className="text-xs text-slate-400">本指標觀察市場參與程度，並非 CAN SLIM 通過判定或買賣訊號。</p>
          {(data.warnings || []).map((w, index) => <p key={index} className="text-xs text-amber-200/80">注意：{w}</p>)}
        </div>
      )}
    </section>
  );
}
