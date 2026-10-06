/**
 * TelegramNotificationModal.tsx
 * ====================================================================
 * Cyberpunk Holographic Telegram Alerts & 30-Minute Periodic Heartbeat
 * ====================================================================
 * Allows the operator to configure Telegram credentials, monitor the
 * automated 30-minute status alert loop (reporting whether bot is
 * RUNNING or STOPPED), and dispatch immediate on-demand test heartbeats.
 * ====================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Send,
  ShieldCheck,
  Bell,
  BellOff,
  Clock,
  Radio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Zap,
  Activity,
  Sliders,
  X,
  Info
} from 'lucide-react';

interface TelegramNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
  playTone?: (freq?: number, duration?: number) => void;
}

export const TelegramNotificationModal: React.FC<TelegramNotificationModalProps> = ({
  isOpen,
  onClose,
  lang,
  playTone
}) => {
  const isAr = lang === 'ar';

  const [chatId, setChatId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(30);

  const [status, setStatus] = useState<any>({
    isEnabled: false,
    isConfigured: false,
    hasToken: false,
    maskedChatId: 'Not configured',
    heartbeat: {
      enabled: true,
      intervalMinutes: 30,
      lastSent: 0,
      nextDue: 0,
      isRunning: false
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setIsEnabled(data.isEnabled || false);
        setHeartbeatEnabled(data.heartbeat?.enabled ?? true);
        setIntervalMinutes(data.heartbeat?.intervalMinutes || 30);
      }
    } catch (err) {
      console.warn('Failed to fetch Telegram status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveConfig = async () => {
    if (playTone) playTone(880, 0.08);
    setIsLoading(true);
    setActionFeedback(null);

    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatId ? chatId.trim() : undefined,
          botToken: botToken ? botToken.trim() : undefined,
          isEnabled,
          heartbeatEnabled,
          intervalMinutes: Number(intervalMinutes) || 30
        })
      });

      const data = await res.json();
      if (data.success) {
        setStatus({
          ...data.status,
          heartbeat: data.heartbeat
        });
        setChatId('');
        setBotToken('');
        setActionFeedback({
          type: 'success',
          message: isAr ? 'تم حفظ وتفعيل إعدادات تليجرام والإشعار النصف ساعوي بنجاح!' : 'Telegram settings & 30-min heartbeat saved successfully!'
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: data.error || (isAr ? 'فشل حفظ الإعدادات' : 'Failed to save configuration')
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || (isAr ? 'خطأ في الاتصال بالخادم' : 'Server connection error')
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendHeartbeatTest = async () => {
    if (playTone) playTone(1200, 0.1);
    setIsSendingTest(true);
    setActionFeedback(null);

    try {
      const res = await fetch('/api/telegram/heartbeat/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();
      if (data.success) {
        setActionFeedback({
          type: 'success',
          message: isAr
            ? (data.isRunning ? '✅ تم إرسال إشعار فحص لتليجرام: البوت قيد التشغيل والعمل!' : '🛑 تم إرسال إشعار فحص لتليجرام: البوت متوقف حالياً!')
            : data.message
        });
        await fetchStatus();
      } else {
        setActionFeedback({
          type: 'error',
          message: data.message || (isAr ? 'تعذر الإرسال. تأكد من تفعيل البوت وإدخال التوكن ومعرف المحادثة.' : 'Delivery failed. Check token & chat ID.')
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || (isAr ? 'فشل إرسال الإشعار' : 'Failed to dispatch heartbeat')
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const isBotActive = status.heartbeat?.isRunning ?? false;
  const lastSentTime = status.heartbeat?.lastSent > 0 ? new Date(status.heartbeat.lastSent).toLocaleTimeString() : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl rounded-2xl holo-panel border border-[rgba(0,243,255,0.4)] shadow-[0_0_50px_rgba(0,243,255,0.2)] bg-[#030712] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌟 Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-950/40 via-cyan-950/30 to-black">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-400/40 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <Send className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-base font-bold text-white tracking-wide">
                  {isAr ? 'إشعارات تليجرام ونبضات الحالة (كل 30 دقيقة)' : 'Telegram 30-Min Heartbeat Alerts'}
                </h2>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                  status.isEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {status.isEnabled ? (isAr ? 'مفعّل' : 'ACTIVE') : (isAr ? 'معطل' : 'INACTIVE')}
                </span>
              </div>
              <p className="text-[11px] font-mono text-[var(--muted)]">
                {isAr
                  ? 'إرسال إشعار تلقائي دوري كل نصف ساعة بحالة البوت (يعمل أو متوقف) والمحفظة'
                  : 'Periodic 30-minute status broadcast notifying if the bot is running or stopped'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 📜 Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs font-mono">
          {/* Feedback banner */}
          {actionFeedback && (
            <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            }`}>
              {actionFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
              <span>{actionFeedback.message}</span>
            </div>
          )}

          {/* ⏱️ 30-Minute Status Heartbeat Panel */}
          <div className="p-4 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-black/60 via-blue-950/20 to-black/60 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-white uppercase tracking-wider text-xs">
                  {isAr ? 'حلقة النبضات النصف ساعوية (Heartbeat Loop)' : '30-Minute Heartbeat Loop'}
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                isBotActive 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isBotActive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                {isBotActive ? (isAr ? 'البوت يعمل (RUNNING)' : 'RUNNING') : (isAr ? 'البوت متوقف (STOPPED)' : 'STOPPED')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
              <div className="bg-black/50 p-2.5 rounded-lg border border-white/5">
                <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'معدل التكرار:' : 'Interval:'}</span>
                <span className="font-bold text-cyan-300">{isAr ? 'كل 30 دقيقة' : 'Every 30 Minutes'}</span>
              </div>
              <div className="bg-black/50 p-2.5 rounded-lg border border-white/5">
                <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'آخر إرسال:' : 'Last Sent:'}</span>
                <span className="font-bold text-white">{lastSentTime || (isAr ? 'بانتظار الإرسال' : 'Pending')}</span>
              </div>
              <div className="bg-black/50 p-2.5 rounded-lg border border-white/5">
                <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'المعرف الوجهة:' : 'Target Chat:'}</span>
                <span className="font-bold text-slate-300">{status.maskedChatId}</span>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 leading-relaxed">
              {isAr
                ? '💡 يقوم البوت تلقائياً وبشكل دوري كل نصف ساعة بإرسال إشارة لحساب تليجرام توضح هل البوت يعمل 24/7 أو متوقف، مع ملخص للأرباح المحققة، رصيد المحفظة الثانوية ($25)، وأسعار العملات.'
                : '💡 The bot automatically sends a status beacon every half hour verifying whether it is actively trading or halted, with realized PnL and sub-wallet balances.'}
            </p>

            {/* Test Send Button */}
            <button
              type="button"
              disabled={isSendingTest}
              onClick={handleSendHeartbeatTest}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600/30 via-cyan-500/20 to-blue-600/30 hover:from-blue-600/40 hover:to-cyan-500/30 border border-cyan-400/50 text-cyan-200 font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,243,255,0.2)] disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 text-cyan-400 ${isSendingTest ? 'animate-spin' : ''}`} />
              <span>
                {isSendingTest 
                  ? (isAr ? 'جاري إرسال إشعار الفحص النصف ساعوي...' : 'Dispatching Heartbeat Test...') 
                  : (isAr ? '📡 إرسال إشعار فحص فوري لتليجرام الآن' : 'Send Test Heartbeat to Telegram Now')}
              </span>
            </button>
          </div>

          {/* 🛠️ Configuration Form */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <h3 className="font-bold text-white uppercase text-xs flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isAr ? 'إعدادات الاتصال وحساب تليجرام' : 'Telegram Credentials & Configuration'}</span>
            </h3>

            {/* Bot Token */}
            <div className="space-y-1">
              <label className="text-[11px] text-[var(--muted)] flex items-center justify-between">
                <span>{isAr ? 'رمز توكن البوت (Bot Token من @BotFather):' : 'Telegram Bot Token:'}</span>
                {status.hasToken && <span className="text-[10px] text-emerald-400 font-bold">{isAr ? '✓ التوكن محفوظ في الخادم' : '✓ Token Saved'}</span>}
              </label>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={status.hasToken ? '••••••••••••••••••••••••••••••••' : '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ'}
                className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 focus:border-cyan-400 text-white placeholder-gray-500 outline-none text-xs font-mono"
              />
            </div>

            {/* Chat ID */}
            <div className="space-y-1">
              <label className="text-[11px] text-[var(--muted)] flex items-center justify-between">
                <span>{isAr ? 'معرف المحادثة أو القناة (Chat ID / Channel ID):' : 'Chat ID or Channel ID:'}</span>
                <span className="text-[10px] text-gray-400">{status.maskedChatId}</span>
              </label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder={status.maskedChatId !== 'Not configured' ? (isAr ? 'أدخل معرفاً جديداً للتغيير...' : 'Enter new ID to change...') : 'e.g. -100123456789 or @channel'}
                className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 focus:border-cyan-400 text-white placeholder-gray-500 outline-none text-xs font-mono"
              />
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-black/40 border border-white/10 cursor-pointer hover:border-white/20 transition">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="rounded border-gray-600 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <span className="text-white font-bold">{isAr ? 'تفعيل تنبيهات تليجرام' : 'Enable Telegram Alerts'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-black/40 border border-white/10 cursor-pointer hover:border-white/20 transition">
                <input
                  type="checkbox"
                  checked={heartbeatEnabled}
                  onChange={(e) => setHeartbeatEnabled(e.target.checked)}
                  className="rounded border-gray-600 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <span className="text-white font-bold">{isAr ? 'إشعار النصف ساعة الدوري' : '30-Min Heartbeat Loop'}</span>
              </label>
            </div>
          </div>

          {/* ℹ️ Guide & How-To */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[10px] text-gray-400 space-y-1">
            <span className="font-bold text-white flex items-center gap-1">
              <Info className="w-3 h-3 text-cyan-400" />
              {isAr ? 'كيفية الحصول على بيانات تليجرام:' : 'How to obtain Telegram Bot & Chat ID:'}
            </span>
            <p>1. {isAr ? 'قم بإنشاء بوت جديد عبر مراسلة @BotFather على تليجرام وانسخ رمز الـ API Token.' : 'Create a bot on Telegram via @BotFather and copy the API Token.'}</p>
            <p>2. {isAr ? 'احصل على Chat ID الخاص بك عبر بدء محادثة مع @userinfobot أو أضف البوت لقناتك.' : 'Get your Chat ID via @userinfobot or invite your bot as admin to your channel.'}</p>
          </div>
        </div>

        {/* 🚪 Footer Actions */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-black/60 gap-3">
          <button
            type="button"
            onClick={fetchStatus}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer flex items-center gap-1.5"
            title={isAr ? 'تحديث الحالة' : 'Refresh'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition font-bold cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleSaveConfig}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold transition cursor-pointer shadow-[0_0_15px_rgba(0,243,255,0.3)] disabled:opacity-50"
            >
              {isLoading ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ وتفعيل' : 'Save & Activate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
