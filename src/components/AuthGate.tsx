import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Zap, LogIn, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AUTH_NOTICE_KEY } from '../api/http';

interface AuthContextValue {
  email: string;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthGate>');
  return ctx;
};


/** 登出時清除瀏覽器上的本機暫存（若舊持股尚未搬進資料庫則保留，避免資料遺失） */
const purgeLocalCache = () => {
  try {
    ['tw_stock_obs_stocks', 'tw_stock_obs_slim', 'tw_stock_obs_rules', 'tw_stock_obs_logs', 'tw_stock_obs_dbsynced'].forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

const friendlyError = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return '帳號或密碼錯誤。';
  if (m.includes('email not confirmed')) return '此 Email 尚未完成驗證。';
  if (m.includes('rate limit') || m.includes('too many')) return '嘗試次數過多，請稍後再試。';
  if (m.includes('failed to fetch') || m.includes('network')) return '無法連線到登入服務，請檢查網路。';
  return `登入失敗：${msg}`;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans antialiased">
      <div className="w-full max-w-sm bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/10">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900">台股智慧觀察與即時警示系統</h1>
            <p className="text-[10px] text-slate-500">請先登入以檢視持股與報價</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function SetupNotice() {
  return (
    <Shell>
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-3 text-xs font-bold leading-relaxed">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          尚未設定 Supabase。請在專案根目錄的 <code className="font-mono">.env</code> 填入
          <code className="font-mono"> VITE_SUPABASE_URL</code> 與
          <code className="font-mono"> VITE_SUPABASE_ANON_KEY</code> 後重新啟動（參考 <code className="font-mono">.env.example</code>）。
        </div>
      </div>
    </Shell>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const n = sessionStorage.getItem(AUTH_NOTICE_KEY);
    sessionStorage.removeItem(AUTH_NOTICE_KEY);
    return n;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(friendlyError(err.message));
    setBusy(false);
  };

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-[11px] font-bold text-slate-600">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
          />
        </label>
        <label className="block text-[11px] font-bold text-slate-600">
          密碼
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
          />
        </label>
        {error && (
          <p role="alert" className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-500 disabled:bg-slate-300 cursor-pointer disabled:cursor-not-allowed"
        >
          <LogIn className="w-4 h-4" />
          {busy ? '登入中…' : '登入'}
        </button>
        <p className="text-[10px] text-slate-400 text-center">本系統不開放註冊，僅限已授權帳號使用。</p>
      </form>
    </Shell>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') purgeLocalCache();
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!supabase) return <SetupNotice />;
  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">載入中…</div>;
  }
  if (!session) return <LoginForm />;

  return (
    <AuthContext.Provider
      value={{ email: session.user.email ?? '', signOut: async () => void (await supabase!.auth.signOut()) }}
    >
      {children}
    </AuthContext.Provider>
  );
}
