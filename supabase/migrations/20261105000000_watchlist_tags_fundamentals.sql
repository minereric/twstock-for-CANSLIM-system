-- ============================================================
-- 觀察清單、風險標籤、官方基本面／籌碼資料表
-- 前置：已執行 supabase-setup.sql（holdings / portfolio_settings）
-- ============================================================

-- 1) 觀察清單（使用者個人）
create table if not exists public.watchlist (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  stock_id    text        not null check (length(stock_id) between 1 and 12),
  custom_name text,
  note        text,
  created_at  timestamptz not null default now(),
  primary key (user_id, stock_id)
);

-- 2) 風險標籤：產業判斷沒有官方資料欄位，由使用者可編輯的標籤表提供
--    user_id 為 null 的列 = 系統預設（主觀判斷，唯讀）；使用者可新增自己的列，
--    或以 enabled=false 的同代號同標籤列「關閉」某筆預設。
create table if not exists public.risk_tags (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete cascade default auth.uid(),
  stock_id   text    not null check (length(stock_id) between 1 and 12),
  tag        text    not null check (tag in ('china_expansion', 'demographic')),
  enabled    boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);
create unique index if not exists risk_tags_unique
  on public.risk_tags (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), stock_id, tag);

-- 3) 官方公開資料（由 Edge Function 以 service role 寫入；使用者只能讀）
create table if not exists public.company_fundamentals (
  stock_id          text primary key,
  name              text,
  market            text,
  industry          text,
  insider_hold_pct  numeric,   -- 董監事合計持股比例 %
  eps_latest        numeric,   -- 最近一期（單季）每股盈餘
  eps_period        text,
  eps_yoy           numeric,   -- 與去年同期比較 %
  revenue_yoy       numeric,   -- 最近月營收年增率 %
  revenue_mom       numeric,
  revenue_month     text,
  source            jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);

create table if not exists public.chip_weekly (      -- 集保戶股權分散（每週）
  stock_id        text    not null,
  data_date       date    not null,
  big_holder_pct  numeric,   -- 持股 1,000 張以上占集保庫存比例 %
  big_holder_cnt  integer,
  total_holders   integer,
  primary key (stock_id, data_date)
);

create table if not exists public.institutional_daily (  -- 三大法人買賣超（每日，單位：股）
  stock_id    text    not null,
  trade_date  date    not null,
  foreign_net bigint,
  trust_net   bigint,
  dealer_net  bigint,
  primary key (stock_id, trade_date)
);

create table if not exists public.sync_log (
  id        bigint generated always as identity primary key,
  ran_at    timestamptz not null default now(),
  dataset   text not null,
  ok        boolean not null,
  rows      integer,
  detail    text
);

-- 4) RLS
alter table public.watchlist            enable row level security;
alter table public.risk_tags            enable row level security;
alter table public.company_fundamentals enable row level security;
alter table public.chip_weekly          enable row level security;
alter table public.institutional_daily  enable row level security;
alter table public.sync_log             enable row level security;

drop policy if exists "watchlist: owner only" on public.watchlist;
create policy "watchlist: owner only" on public.watchlist
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "risk_tags: read defaults and own" on public.risk_tags;
drop policy if exists "risk_tags: write own"             on public.risk_tags;
create policy "risk_tags: read defaults and own" on public.risk_tags
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy "risk_tags: write own" on public.risk_tags
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "read official data" on public.company_fundamentals;
drop policy if exists "read official data" on public.chip_weekly;
drop policy if exists "read official data" on public.institutional_daily;
drop policy if exists "read sync log"      on public.sync_log;
create policy "read official data" on public.company_fundamentals for select to authenticated using (true);
create policy "read official data" on public.chip_weekly          for select to authenticated using (true);
create policy "read official data" on public.institutional_daily  for select to authenticated using (true);
create policy "read sync log"      on public.sync_log             for select to authenticated using (true);

-- 5) 權限：anon 一律不給；authenticated 只給必要操作
revoke all on public.watchlist, public.risk_tags, public.company_fundamentals,
              public.chip_weekly, public.institutional_daily, public.sync_log from anon;
grant select, insert, update, delete on public.watchlist, public.risk_tags to authenticated;
grant select on public.company_fundamentals, public.chip_weekly, public.institutional_daily, public.sync_log to authenticated;
grant usage, select on sequence public.risk_tags_id_seq to authenticated;

-- 6) 預設風險標籤（⚠ 主觀產業判斷，僅供提醒，請依自己的研究在畫面中調整）
insert into public.risk_tags (user_id, stock_id, tag, note)
select null, v.stock_id, v.tag, v.note
from (values
  ('3481', 'china_expansion', '預設判斷：面板——大陸面板廠持續擴產，價格競爭壓力大'),
  ('2313', 'china_expansion', '預設判斷：PCB——大陸 PCB 廠擴產，中低階產品競爭加劇'),
  ('1605', 'china_expansion', '預設判斷：電線電纜／不銹鋼——大陸產能過剩外溢'),
  ('2481', 'china_expansion', '預設判斷：功率半導體——大陸廠擴產搶單'),
  ('6770', 'china_expansion', '預設判斷：成熟製程晶圓代工——大陸成熟製程大幅擴產'),
  ('2303', 'china_expansion', '預設判斷：成熟製程晶圓代工——大陸成熟製程大幅擴產'),
  ('2344', 'china_expansion', '預設判斷：利基型記憶體——大陸記憶體廠擴產'),
  ('2501', 'demographic',     '預設判斷：營建——人口減少與少子化，長期壓抑住宅剛性需求')
) as v(stock_id, tag, note)
where not exists (
  select 1 from public.risk_tags r where r.user_id is null and r.stock_id = v.stock_id and r.tag = v.tag
);
