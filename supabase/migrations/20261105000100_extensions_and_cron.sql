-- 啟用 pg_net / pg_cron 並排程官方資料同步（時間為 UTC；台北 = UTC+8）
-- 注意：Authorization 使用「公開的 anon/publishable JWT」即可，切勿放 service_role／secret key。
-- 請將 <PROJECT_REF> 與 <ANON_JWT> 換成自己的專案值後再執行。
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule('sync-fundamentals-daily', '30 10 * * *', $$select net.http_get(
  url:='https://<PROJECT_REF>.supabase.co/functions/v1/sync-official?job=fundamentals',
  headers:='{"Authorization":"Bearer <ANON_JWT>"}'::jsonb, timeout_milliseconds:=150000)$$);   -- 每日 18:30
select cron.schedule('sync-inst-daily', '0 10 * * 1-5', $$select net.http_get(
  url:='https://<PROJECT_REF>.supabase.co/functions/v1/sync-official?job=inst',
  headers:='{"Authorization":"Bearer <ANON_JWT>"}'::jsonb, timeout_milliseconds:=150000)$$);   -- 平日 18:00
select cron.schedule('sync-chip-weekly', '0 2 * * 6,0', $$select net.http_get(
  url:='https://<PROJECT_REF>.supabase.co/functions/v1/sync-official?job=chip',
  headers:='{"Authorization":"Bearer <ANON_JWT>"}'::jsonb, timeout_milliseconds:=150000)$$);   -- 週六、日 10:00（集保週資料）
