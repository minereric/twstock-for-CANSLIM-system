import { supabase } from '../lib/supabase';

export const AUTH_NOTICE_KEY = 'tw_auth_notice';

/**
 * 呼叫後端 API：自動帶上目前登入者的 access token（過期會由 supabase-js 自動更新）。
 * 後端回 401（登入失效）或 403（不在白名單）時，自動登出並回到登入頁。
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!supabase) throw new Error('尚未設定 Supabase');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('尚未登入');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 || res.status === 403) {
    sessionStorage.setItem(
      AUTH_NOTICE_KEY,
      res.status === 403 ? '此帳號沒有使用權限。' : '登入已失效，請重新登入。',
    );
    await supabase.auth.signOut();
  }
  return res;
}
