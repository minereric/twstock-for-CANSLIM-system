/**
 * etf-list：TWSE 官方「ETF 即時預估淨值與折溢價揭示」全市場清單
 * 資料來源：https://mis.twse.com.tw/stock/data/all_etf.txt（證交所公開揭示）
 * 欄位：a=代號 b=名稱 e=市價 f=預估淨值 g=預估折溢價% h=前一營業日淨值 i=日期 j=時間
 * 折溢價 = (市價 − 預估淨值) ÷ 預估淨值；官方有揭示值時以官方為準。
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SRC = 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant';
let cache: { at: number; body: string } | null = null;

const clean = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return String(v ?? '').trim() === '' || String(v).trim() === '-' || !Number.isFinite(n) ? null : n;
};
const r2 = (n: number) => Number(n.toFixed(2));
const kind = (id: string) => (/L$/i.test(id) ? 'leveraged' : /R$/i.test(id) ? 'inverse' : /A$/i.test(id) ? 'active' : 'standard');

async function load() {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://mis.twse.com.tw/stock/data/all_etf.txt', {
        headers: { 'User-Agent': UA, Referer: SRC, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`TWSE ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const headers = { ...CORS, 'content-type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=5' };
  if (cache && Date.now() - cache.at < 10_000) return new Response(cache.body, { headers });
  try {
    const data = await load();
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const g of (data?.a1 ?? []) as any[]) {
      for (const it of (g?.msgArray ?? []) as any[]) {
        const id = String(it?.a ?? '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const price = clean(it.e), nav = clean(it.f), prev = clean(it.h), official = clean(it.g);
        if (!nav || nav <= 0) continue; // 官方未揭示淨值者不列入（不以 0 充數）
        out.push({
          id, name: String(it.b ?? '').trim(), kind: kind(id),
          price: price ?? 0, nav,
          navSpread: price ? r2(price - nav) : 0,
          discountPremium: official ?? (price ? r2(((price - nav) / nav) * 100) : 0),
          prevNav: prev ?? 0,
          navChange: prev ? r2(nav - prev) : 0,
          navChangePercent: prev ? r2(((nav - prev) / prev) * 100) : 0,
          date: String(it.i ?? ''), time: String(it.j ?? ''), sourceUrl: SRC,
        });
      }
    }
    const body = JSON.stringify({ success: true, count: out.length, source: 'TWSE ETF 即時預估淨值揭示', fetchedAt: new Date().toISOString(), data: out });
    cache = { at: Date.now(), body };
    return new Response(body, { headers });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String((e as Error).message ?? e) }), { status: 502, headers });
  }
});
