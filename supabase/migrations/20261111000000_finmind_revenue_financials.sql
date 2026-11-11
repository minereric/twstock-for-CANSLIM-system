-- 月營收歷史與單季財報（資料來源：FinMind TaiwanStockMonthRevenue / TaiwanStockFinancialStatements）
create table if not exists public.monthly_revenue (
  stock_id   text not null,
  ym         text not null,            -- 營收所屬年月 YYYY-MM
  revenue    numeric,                  -- 當月營收（元）
  fetched_at timestamptz not null default now(),
  primary key (stock_id, ym)
);
create table if not exists public.quarterly_financials (
  stock_id         text not null,
  period_end       date not null,      -- 財報期末日（單季數字，非累計）
  revenue          numeric,
  gross_profit     numeric,
  operating_income numeric,
  eps              numeric,
  fetched_at       timestamptz not null default now(),
  primary key (stock_id, period_end)
);
alter table public.monthly_revenue      enable row level security;
alter table public.quarterly_financials enable row level security;
create policy "read official data" on public.monthly_revenue      for select to authenticated using (true);
create policy "read official data" on public.quarterly_financials for select to authenticated using (true);
revoke all on public.monthly_revenue, public.quarterly_financials from anon;
grant select on public.monthly_revenue, public.quarterly_financials to authenticated;
