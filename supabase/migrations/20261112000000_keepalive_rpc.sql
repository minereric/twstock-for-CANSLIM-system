-- keep-alive 用 RPC：不讀任何資料表，只回傳 'ok'；供 GitHub Actions 以 anon／publishable key 呼叫
create or replace function public.keepalive()
returns text
language sql
security invoker
set search_path = ''
as $$ select 'ok'::text $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
