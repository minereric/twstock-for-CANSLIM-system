/**
 * sync-official：把「官方開放資料」同步到 Postgres（TWSE/TPEx OpenAPI、集保 TDCC、TWSE T86）
 * ?job=fundamentals  公司基本面：產業別、月營收年增率、EPS、董監持股比例（每日）
 * ?job=chip          集保戶股權分散：千張大戶持股比例（每週，保存歷史快照以比較週變化）
 * ?job=inst          三大法人買賣超（每日，TWSE T86）
 * ?job=finmind_fin  FinMind：單季財報（EPS／營收／毛利／營業利益）與月營收歷史（每日；免 Token 可用，若設定 FINMIND_TOKEN 則帶入以提高額度）
 * ?job=finmind_inst 三大法人買賣超補上櫃股（TWSE T86 沒有上櫃）
 * 節流：同一 job 在 MIN_GAP 內重複呼叫會直接略過（避免被濫用）。
 * 寫入使用平台自動注入的 SUPABASE_SERVICE_ROLE_KEY（只存在於 Edge Function 環境，不在前端／repo）。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIN_GAP_MS: Record<string, number> = { fundamentals: 30 * 60e3, chip: 30 * 60e3, inst: 20 * 60e3, finmind_fin: 6 * 3600e3, finmind_inst: 20 * 60e3 };

const DEFAULT_SYMBOLS = [
  '2356', '2885', '3481', '1432', '2330', '2317', '2382', '2303', '6770', '2344', '2313', '1605', '2481',
  '3416', '3711', '2618', '2610', '2603', '2609', '2882', '2501',
];

const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' };

async function sbGet(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`DB read ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function sbUpsert(table: string, rows: unknown[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(`DB upsert ${table}: ${r.status} ${await r.text()}`);
  }
}
async function logRun(dataset: string, ok: boolean, rows: number, detail: string) {
  await fetch(`${SB_URL}/rest/v1/sync_log`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ dataset, ok, rows, detail: detail.slice(0, 500) }),
  }).catch(() => {});
}

async function getText(url: string, ms = 40000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}
async function getJson(url: string) {
  const t = await getText(url);
  const j = JSON.parse(t);
  if (!Array.isArray(j)) throw new Error(`${url} 回傳非陣列`);
  return j as Record<string, string>[];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null) return null;
  const n = Number(String(v).replace(/[,%\s]/g, ''));
  return Number.isFinite(n) && String(v).trim() !== '' && String(v).trim() !== '-' ? n : null;
};
const findKey = (obj: Record<string, unknown>, part: string) => Object.keys(obj).find((k) => k.includes(part));
const r2 = (n: number | null) => (n === null ? null : Number(n.toFixed(2)));

async function relevantSymbols(): Promise<string[]> {
  const set = new Set<string>(DEFAULT_SYMBOLS);
  for (const t of ['watchlist', 'holdings', 'risk_tags']) {
    try {
      for (const r of (await sbGet(`${t}?select=stock_id`)) as { stock_id: string }[]) if (r.stock_id) set.add(r.stock_id);
    } catch { /* 表不存在或無資料時略過 */ }
  }
  return [...set];
}

/* ---------------- fundamentals ---------------- */
async function jobFundamentals() {
  const settle = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  const [basicL, basicO, revL, revO, epsL, insL, insO] = await Promise.all([
    settle(getJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L')),
    settle(getJson('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O')),
    settle(getJson('https://openapi.twse.com.tw/v1/opendata/t187ap05_L')),
    settle(getJson('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O')),
    settle(getJson('https://openapi.twse.com.tw/v1/opendata/t187ap14_L')),
    settle(getJson('https://openapi.twse.com.tw/v1/opendata/t187ap11_L')),
    settle(getJson('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap11_O')),
  ]);

  type F = Record<string, any>;
  const map = new Map<string, F>();
  const get = (id: string, market: string) => {
    if (!map.has(id)) map.set(id, { stock_id: id, market, source: {} });
    return map.get(id)!;
  };
  const shares = new Map<string, number>();
  const used: string[] = [];

  for (const [rows, mk] of [[basicL, 'TWSE'], [basicO, 'TPEx']] as const) {
    if (!rows) continue;
    used.push(`basic_${mk}`);
    for (const r of rows) {
      const id = (r['公司代號'] ?? r['SecuritiesCompanyCode'])?.trim();
      if (!id) continue;
      const f = get(id, mk);
      f.name = r['公司簡稱'] || r['CompanyAbbreviation'] || r['公司名稱'] || f.name;
      const k = findKey(r, '已發行普通股數') ?? (r['IssueShares'] !== undefined ? 'IssueShares' : undefined);
      const s = k ? num(r[k]) : null;
      if (s) shares.set(id, s);
    }
  }
  for (const [rows, mk] of [[revL, 'TWSE'], [revO, 'TPEx']] as const) {
    if (!rows) continue;
    used.push(`revenue_${mk}`);
    for (const r of rows) {
      const id = r['公司代號']?.trim();
      if (!id) continue;
      const f = get(id, mk);
      f.industry = r['產業別'] || f.industry;
      f.revenue_yoy = r2(num(r['營業收入-去年同月增減(%)']));
      f.revenue_mom = r2(num(r['營業收入-上月比較增減(%)']));
      f.revenue_month = r['資料年月'] || null;
      f.name = f.name || r['公司名稱'];
    }
  }
  if (epsL) {
    used.push('eps_TWSE');
    for (const r of epsL) {
      const id = r['公司代號']?.trim();
      if (!id) continue;
      const f = get(id, 'TWSE');
      const k = findKey(r, '基本每股盈餘');
      f.eps_latest = k ? num(r[k]) : null;
      f.eps_period = r['年度'] && r['季別'] ? `${Number(r['年度']) + 1911}Q${r['季別']}` : null;
    }
  }
  // 董監持股：同一公司所有「目前持股」加總 ÷ 已發行普通股數
  const insider = new Map<string, number>();
  for (const [rows, mk] of [[insL, 'TWSE'], [insO, 'TPEx']] as const) {
    if (!rows) continue;
    used.push(`insider_${mk}`);
    for (const r of rows) {
      const id = r['公司代號']?.trim(); const v = num(r['目前持股']);
      if (id && v !== null) insider.set(id, (insider.get(id) ?? 0) + v);
    }
  }
  for (const [id, sum] of insider) {
    const s = shares.get(id);
    if (!s) continue;
    const f = get(id, map.get(id)?.market ?? 'TWSE');
    f.insider_hold_pct = r2(Math.min(100, (sum / s) * 100));
  }

  const now = new Date().toISOString();
  const rows = [...map.values()]
    .filter((f) => f.name)
    .map((f) => ({
      stock_id: f.stock_id, name: f.name, market: f.market, industry: f.industry ?? null,
      insider_hold_pct: f.insider_hold_pct ?? null, eps_latest: f.eps_latest ?? null, eps_period: f.eps_period ?? null,
      eps_yoy: null, revenue_yoy: f.revenue_yoy ?? null, revenue_mom: f.revenue_mom ?? null, revenue_month: f.revenue_month ?? null,
      source: { datasets: used, note: '董監持股=董監事個人「目前持股」加總÷已發行普通股數；EPS 為官方彙總表最新一期' },
      updated_at: now,
    }));
  if (rows.length === 0) throw new Error('所有來源皆失敗');
  await sbUpsert('company_fundamentals', rows, 'stock_id');
  return { rows: rows.length, detail: used.join(',') };
}

/* ---------------- chip (TDCC) ---------------- */
async function jobChip() {
  const symbols = new Set(await relevantSymbols());
  const text = await getText('https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5', 100000);
  const lines = text.split('\n');
  const agg = new Map<string, { date: string; big?: number; bigCnt?: number; total?: number }>();
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].replace(/\r$/, '').split(',');
    if (c.length < 6) continue;
    const id = c[1].trim(); // TDCC 代號以空白補滿 6 碼
    if (!symbols.has(id)) continue;
    const level = c[2].trim();
    const a = agg.get(id) ?? { date: c[0].trim() };
    if (level === '15') { a.big = num(c[5]) ?? undefined; a.bigCnt = num(c[3]) ?? undefined; }
    if (level === '17') a.total = num(c[3]) ?? undefined;
    agg.set(id, a);
  }
  const rows = [...agg.entries()]
    .filter(([, a]) => a.big !== undefined)
    .map(([id, a]) => ({
      stock_id: id,
      data_date: `${a.date.slice(0, 4)}-${a.date.slice(4, 6)}-${a.date.slice(6, 8)}`,
      big_holder_pct: a.big, big_holder_cnt: a.bigCnt ?? null, total_holders: a.total ?? null,
    }));
  if (rows.length === 0) throw new Error(`集保資料無符合標的 len=${text.length} lines=${lines.length} symbols=${symbols.size} agg=${agg.size} l1=${lines[1]?.slice(0, 60)}`);
  await sbUpsert('chip_weekly', rows, 'stock_id,data_date');
  return { rows: rows.length, detail: `date=${rows[0].data_date}` };
}

/* ---------------- institutional (T86) ---------------- */
async function jobInst() {
  const symbols = new Set(await relevantSymbols());
  const out: Record<string, unknown>[] = [];
  const dates: string[] = [];
  for (let d = 0; d < 16; d++) {
    const t = new Date(Date.now() + 8 * 3600e3 - d * 86400e3);
    if ([0, 6].includes(t.getUTCDay())) continue;
    dates.push(t.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  let got = 0;
  for (const date of dates) {
    if (got >= 10) break;
    try {
      const j = JSON.parse(await getText(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${date}&selectType=ALLBUT0999&response=json`, 15000));
      if (j.stat !== 'OK' || !Array.isArray(j.data)) continue;
      const f: string[] = j.fields;
      const iId = f.indexOf('證券代號');
      const iF = f.findIndex((x) => x.startsWith('外陸資買賣超股數(不含外資自營商)'));
      const iT = f.indexOf('投信買賣超股數');
      const iD = f.indexOf('自營商買賣超股數');
      if (iId < 0 || iF < 0 || iT < 0 || iD < 0) throw new Error(`T86 欄位異動: ${f.join('|')}`);
      for (const r of j.data as string[][]) {
        const id = String(r[iId]).trim();
        if (!symbols.has(id)) continue;
        out.push({
          stock_id: id, trade_date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
          foreign_net: num(r[iF]), trust_net: num(r[iT]), dealer_net: num(r[iD]),
        });
      }
      got++;
    } catch (e) {
      if (String((e as Error).message).includes('欄位異動')) throw e;
    }
  }
  if (out.length === 0) throw new Error('T86 無資料');
  await sbUpsert('institutional_daily', out, 'stock_id,trade_date');
  return { rows: out.length, detail: `days=${got}` };
}

/* ---------------- FinMind（補足官方彙總表沒有的歷史資料） ---------------- */
const FM = 'https://api.finmindtrade.com/api/v4/data';
const FM_TOKEN = Deno.env.get('FINMIND_TOKEN') ?? '';
const isEtfId = (id: string) => /^00\d{2,4}[A-Z]?$/.test(id);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function fmGet(dataset: string, id: string, start: string): Promise<Record<string, any>[]> {
  const url = `${FM}?dataset=${dataset}&data_id=${encodeURIComponent(id)}&start_date=${start}`;
  const r = await fetch(url, { headers: FM_TOKEN ? { Authorization: `Bearer ${FM_TOKEN}` } : {}, signal: AbortSignal.timeout(20000) });
  if (r.status === 402 || r.status === 429) throw new Error('FinMind 額度已用完（HTTP ' + r.status + '），稍後再試');
  if (!r.ok) throw new Error(`FinMind ${dataset} ${id} HTTP ${r.status}`);
  const j = await r.json();
  if (j.status !== 200) throw new Error(`FinMind ${dataset} ${id}: ${j.msg}`);
  return (j.data ?? []) as Record<string, any>[];
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function jobFinmindFin() {
  const ids = (await relevantSymbols()).filter((id) => !isEtfId(id));
  const now = new Date();
  const finStart = ymd(new Date(now.getTime() - 3 * 365 * 86400e3));
  const revStart = ymd(new Date(now.getTime() - 27 * 30 * 86400e3));
  const fin: Record<string, unknown>[] = [];
  const rev: Record<string, unknown>[] = [];
  const failed: string[] = [];
  let quota = '';
  await pool(ids, 4, async (id) => {
    if (quota) return;
    try {
      const rows = await fmGet('TaiwanStockFinancialStatements', id, finStart);
      const by = new Map<string, Record<string, number | null>>();
      for (const r of rows) {
        if (!['EPS', 'Revenue', 'GrossProfit', 'OperatingIncome'].includes(r.type)) continue;
        const o = by.get(r.date) ?? {};
        o[r.type] = typeof r.value === 'number' ? r.value : null;
        by.set(r.date, o);
      }
      for (const [d, o] of by) fin.push({ stock_id: id, period_end: d, revenue: o.Revenue ?? null, gross_profit: o.GrossProfit ?? null, operating_income: o.OperatingIncome ?? null, eps: o.EPS ?? null, fetched_at: now.toISOString() });
      for (const r of await fmGet('TaiwanStockMonthRevenue', id, revStart)) {
        if (!r.revenue_year || !r.revenue_month) continue;
        rev.push({ stock_id: id, ym: `${r.revenue_year}-${String(r.revenue_month).padStart(2, '0')}`, revenue: r.revenue ?? null, fetched_at: now.toISOString() });
      }
    } catch (e) {
      const m = String((e as Error).message);
      if (m.includes('額度')) quota = m; else failed.push(id);
    }
  });
  if (fin.length === 0 && rev.length === 0) throw new Error(quota || `FinMind 無資料（失敗 ${failed.join(',')}）`);
  if (fin.length) await sbUpsert('quarterly_financials', fin, 'stock_id,period_end');
  if (rev.length) await sbUpsert('monthly_revenue', rev, 'stock_id,ym');
  return { rows: fin.length + rev.length, detail: `fin=${fin.length} rev=${rev.length} symbols=${ids.length}${failed.length ? ` failed=${failed.join(',')}` : ''}${quota ? ` ${quota}` : ''}` };
}

/** 上櫃（及 T86 查不到）個股的三大法人：外資=外資+外資自營商、自營商=自營商(自行買賣)+避險；單位：股 */
async function jobFinmindInst() {
  const ids = (await relevantSymbols()).filter((id) => !isEtfId(id));
  const mk = new Map<string, string>();
  try { for (const r of (await sbGet('company_fundamentals?select=stock_id,market')) as { stock_id: string; market: string }[]) mk.set(r.stock_id, r.market); } catch { /* ignore */ }
  const targets = ids.filter((id) => mk.get(id) !== 'TWSE'); // TWSE 上市股已由 T86 官方資料涵蓋
  const start = ymd(new Date(Date.now() - 22 * 86400e3));
  const out: Record<string, unknown>[] = [];
  let quota = '';
  await pool(targets, 4, async (id) => {
    if (quota) return;
    try {
      const by = new Map<string, { f: number; t: number; d: number }>();
      for (const r of await fmGet('TaiwanStockInstitutionalInvestorsBuySell', id, start)) {
        const net = (Number(r.buy) || 0) - (Number(r.sell) || 0);
        const o = by.get(r.date) ?? { f: 0, t: 0, d: 0 };
        if (r.name === 'Foreign_Investor' || r.name === 'Foreign_Dealer_Self') o.f += net;
        else if (r.name === 'Investment_Trust') o.t += net;
        else if (r.name === 'Dealer_self' || r.name === 'Dealer_Hedging' || r.name === 'Dealer') o.d += net;
        by.set(r.date, o);
      }
      for (const [d, o] of by) out.push({ stock_id: id, trade_date: d, foreign_net: o.f, trust_net: o.t, dealer_net: o.d });
    } catch (e) {
      const m = String((e as Error).message);
      if (m.includes('額度')) quota = m;
    }
  });
  if (targets.length === 0) return { rows: 0, detail: '無上櫃標的，略過' };
  if (out.length === 0) throw new Error(quota || 'FinMind 法人無資料');
  await sbUpsert('institutional_daily', out, 'stock_id,trade_date');
  return { rows: out.length, detail: `symbols=${targets.length}${quota ? ` ${quota}` : ''}` };
}

const JOBS: Record<string, () => Promise<{ rows: number; detail: string }>> = {
  fundamentals: jobFundamentals, chip: jobChip, inst: jobInst, finmind_fin: jobFinmindFin, finmind_inst: jobFinmindInst,
};

Deno.serve(async (req: Request) => {
  const job = new URL(req.url).searchParams.get('job') ?? '';
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (!JOBS[job]) return new Response(JSON.stringify({ ok: false, error: 'job 必須為 fundamentals | chip | inst | finmind_fin | finmind_inst' }), { status: 400, headers });
  try {
    const last = (await sbGet(`sync_log?select=ran_at&dataset=eq.${job}&ok=eq.true&order=ran_at.desc&limit=1`))[0];
    if (last && Date.now() - new Date(last.ran_at).getTime() < MIN_GAP_MS[job]) {
      return new Response(JSON.stringify({ ok: true, skipped: true, lastRun: last.ran_at }), { headers });
    }
    const res = await JOBS[job]();
    await logRun(job, true, res.rows, res.detail);
    return new Response(JSON.stringify({ ok: true, job, ...res }), { headers });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    await logRun(job, false, 0, msg);
    return new Response(JSON.stringify({ ok: false, job, error: msg }), { status: 500, headers });
  }
});
