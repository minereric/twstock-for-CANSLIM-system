// 行情代理：報價（TWSE → Yahoo）、ETF 官方淨值、歷史日 K、代號查詢
// 部署：verify_jwt = true（必須帶登入者的 access token 才能呼叫）
import { getQuotes, getStockInfo } from '../_shared/quotes.ts';
import { getHistory } from '../_shared/history.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*', // 已要求 JWT，跨來源可安全開放給 GitHub Pages
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });

const parseSymbols = (raw: string | null, max: number): string[] =>
  Array.from(
    new Set(
      (raw ?? '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9]{1,8}$/.test(s)),
    ),
  ).slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405);

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  try {
    if (type === 'quotes') {
      const symbols = parseSymbols(url.searchParams.get('symbols'), 80);
      if (symbols.length === 0) return json({ error: 'symbols required' }, 400);
      const r = await getQuotes(symbols);
      return json({ success: true, ...r }, 200, { 'Cache-Control': 'private, max-age=3' });
    }
    if (type === 'history') {
      const symbols = parseSymbols(url.searchParams.get('symbols'), 40);
      if (symbols.length === 0) return json({ error: 'symbols required' }, 400);
      const r = await getHistory(symbols);
      return json({ success: true, ...r }, 200, { 'Cache-Control': 'private, max-age=300' });
    }
    if (type === 'info') {
      const info = await getStockInfo(url.searchParams.get('symbol') ?? '');
      return json({ success: !!info, info }, info ? 200 : 404);
    }
    return json({ error: 'unknown type' }, 400);
  } catch (err) {
    console.error('[market-data]', err);
    return json({ error: 'internal error' }, 500);
  }
});
