/** 台股交易時間（台北時間 UTC+8，無夏令時間）：週一~週五 09:00–13:30（含 13:30 收盤試搓結算，留到 13:35） */
export function isMarketOpen(now: number = Date.now()): boolean {
  const t = new Date(now + 8 * 3600e3);
  const dow = t.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const m = t.getUTCHours() * 60 + t.getUTCMinutes();
  return m >= 9 * 60 && m <= 13 * 60 + 35;
}
export const taipeiToday = (now: number = Date.now()) => new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
