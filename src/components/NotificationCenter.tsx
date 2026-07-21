/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellOff, X, Volume2, VolumeX, CheckCheck, Sparkles, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { AlertLog } from '../types';

// Global audio playback function using Web Audio API
export const playAlertSound = (type: 'buy' | 'sell' | 'neutral') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'buy') {
      // Golden chime (golden cross, buy indicator)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'sell') {
      // Warning double chime (death cross, sell indicator)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440.00, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.12); // F4
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      // Neutral crisp notify
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    console.warn('Web Audio Playback blocked or unsupported:', e);
  }
};

// HTML5 Desktop Notification Helper
export const triggerBrowserNotification = (title: string, body: string) => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
};

interface NotificationCenterProps {
  logs: AlertLog[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearLogs: () => void;
}

export default function NotificationCenter({
  logs,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearLogs
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const requestBrowserPermission = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
  };

  const unreadCount = logs.filter(l => !l.isRead).length;

  // Custom visual label for indicator alerts
  const getIndicatorLabel = (type: string) => {
    switch (type) {
      case 'price': return '價格';
      case 'change_pct': return '單日漲跌幅';
      case 'rsi': return 'RSI指標';
      case 'kd_k': return 'KD K值';
      case 'kd_d': return 'KD D值';
      case 'macd_hist': return 'MACD柱狀體';
      case 'macd_cross': return 'MACD多空交叉';
      case 'kd_cross': return 'KD黃金/死亡交叉';
      case 'ma_cross': return '均線多空交叉';
      default: return type;
    }
  };

  const getConditionLabel = (condition: string, val: number) => {
    switch (condition) {
      case 'gt': return `大於 ${val}`;
      case 'lt': return `小於 ${val}`;
      case 'cross_up': return `黃金交叉 (向上突破)`;
      case 'cross_down': return `死亡交叉 (跌破)`;
      default: return '';
    }
  };

  // Helper to trigger dummy notifications for quick testing/onboarding
  const triggerTestSound = () => {
    playAlertSound('buy');
  };

  return (
    <div className="relative">
      {/* Indicator Button */}
      <button
        id="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'animate-bounce text-indigo-600' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none shadow-sm">
            {unreadCount}
          </span>
        )}
        <span className="hidden md:inline text-xs font-bold">警報日誌</span>
      </button>

      {/* Slide-out Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black z-40"
            />

            {/* Sidebar drawer panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-amber-50 p-2 rounded-lg text-amber-600 border border-amber-100">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-display">智慧警示推播中心</h3>
                    <p className="text-xs text-slate-500">盤中自動技術面與即時價量警報</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Controls Toolbar */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-150 flex flex-wrap gap-2 items-center justify-between text-xs text-slate-500 font-medium">
                {/* Sound & Web Notification Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSoundEnabled(!soundEnabled);
                      if (!soundEnabled) triggerTestSound();
                    }}
                    title={soundEnabled ? "靜音警示音效" : "開啟警示音效"}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-white border border-slate-250 text-slate-650 hover:text-slate-800 shadow-sm cursor-pointer"
                  >
                    {soundEnabled ? (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>音效: 開</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-3.5 h-3.5 text-rose-600" />
                        <span>音效: 關</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={requestBrowserPermission}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded bg-white border shadow-sm cursor-pointer ${
                      browserPermission === 'granted'
                        ? 'border-emerald-200 text-emerald-600 bg-emerald-50/20'
                        : 'border-slate-250 text-slate-650 hover:text-slate-805'
                    }`}
                  >
                    {browserPermission === 'granted' ? (
                      <>
                        <Bell className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                        <span>桌面推播: 已開</span>
                      </>
                    ) : (
                      <>
                        <BellOff className="w-3.5 h-3.5 text-amber-600" />
                        <span>啟動桌面推播</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Operations */}
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllAsRead}
                      className="flex items-center gap-1 text-slate-600 hover:text-emerald-600 cursor-pointer font-bold"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>全部已讀</span>
                    </button>
                  )}
                  {logs.length > 0 && (
                    <button
                      onClick={onClearLogs}
                      className="text-rose-600 hover:text-rose-700 cursor-pointer font-bold"
                    >
                      清空日誌
                    </button>
                  )}
                </div>
              </div>

              {/* Logs Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <div className="p-4 bg-slate-100 rounded-full mb-3 text-slate-300 border border-slate-200">
                      <BellOff className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">尚無觸發警報記錄</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                      您可以點擊「即時模擬」盤中跳動，或在觀察個股中設定更敏感的技術指標警示規則。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log) => {
                      const isBullish = 
                        log.condition === 'gt' || 
                        log.condition === 'cross_up';

                      return (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`relative p-3.5 rounded-xl border transition-all ${
                            log.isRead 
                              ? 'bg-slate-100/40 border-slate-150 text-slate-450' 
                              : 'bg-white border-slate-200 shadow-sm text-slate-750'
                          }`}
                        >
                          {/* Unread indicator dot */}
                          {!log.isRead && (
                            <span className="absolute top-4 left-3 flex h-2 w-2 rounded-full bg-indigo-600 shadow-[0_0_6px_rgba(79,70,229,0.4)]" />
                          )}

                          <div className={`flex flex-col gap-1.5 ${!log.isRead ? 'pl-4' : ''}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 text-sm">
                                  {stockNameWithCode(log.stockId, log.stockName)}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-black ${
                                  isBullish 
                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                    : 'bg-rose-50 text-rose-600 border border-rose-100'
                                }`}>
                                  {isBullish ? '多方警報' : '空方警報'}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {log.timestamp}
                              </span>
                            </div>

                            <div className="text-xs text-slate-600 leading-relaxed font-medium">
                              指標 <span className="text-amber-600 font-bold bg-amber-50 px-1 rounded">{getIndicatorLabel(log.indicator)}</span> 達到{' '}
                              <span className="font-mono text-slate-800 font-bold">{getConditionLabel(log.condition, log.triggerValue)}</span> 條件。
                            </div>

                            <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100 mt-1">
                              <span className="text-slate-450 flex items-center gap-1">
                                觸發時現價: <strong className="font-mono text-slate-750">${log.currentValue}</strong>
                              </span>
                              {!log.isRead && (
                                <button
                                  onClick={() => onMarkAsRead(log.id)}
                                  className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer font-bold"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>標示已讀</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Utility to display stock label cleanly
function stockNameWithCode(id: string, name: string): string {
  return `${name} (${id})`;
}
