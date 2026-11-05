import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 只使用 anon/publishable 金鑰（設計上可公開，資料安全由登入 + RLS 保證）。絕不可放 service_role。 */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'));

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
