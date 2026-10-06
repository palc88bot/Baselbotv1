/**
 * KeepAliveGuideModal.tsx
 * ====================================================================
 * 24/7 Continuous Autonomy & Zero-Downtime Deployment Guide
 * ====================================================================
 * Explains how Serverless Cloud Run container sleeping works and gives
 * the operator simple, actionable solutions (Free Webhook Keep-Alive,
 * Cloud Run Always-Allocated CPU, or VPS/Docker hosting) so trading and
 * Telegram 30-min alerts continue permanently without browser dependency.
 * ====================================================================
 */

import React, { useState } from 'react';
import {
  Server,
  Zap,
  Clock,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  Radio,
  X,
  Globe,
  WifiOff,
  Flame
} from 'lucide-react';

interface KeepAliveGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
  playTone?: (freq?: number, duration?: number) => void;
}

export const KeepAliveGuideModal: React.FC<KeepAliveGuideModalProps> = ({
  isOpen,
  onClose,
  lang,
  playTone
}) => {
  const isAr = lang === 'ar';
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  // Compute current public keep-alive URL
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-pre-4puajrfn5h2oruijtr2xe5-862942826820.europe-west2.run.app';
  const pingUrl = `${currentOrigin}/api/ping`;

  const handleCopy = () => {
    if (playTone) playTone(950, 0.08);
    navigator.clipboard.writeText(pingUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl rounded-2xl holo-panel border border-[rgba(0,243,255,0.4)] shadow-[0_0_50px_rgba(0,243,255,0.2)] bg-[#030712] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌟 Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-cyan-950/30 to-black">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.3)]">
              <Server className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-base font-bold text-white tracking-wide">
                  {isAr ? 'دليل استمرار عمل البوت 24/7 دون توقف' : '24/7 Continuous Autonomy Guide'}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                  ZERO-HALT
                </span>
              </div>
              <p className="text-[11px] font-mono text-[var(--muted)]">
                {isAr
                  ? 'حلول إبقاء البوت وسيرفر التداول يعمل باستمرار حتى مع إغلاق المتصفح أو انقطاع الإنترنت'
                  : 'How to keep your bot trading and sending alerts 24/7 independently of your browser'}
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
          {/* 🔍 Why does this happen? */}
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{isAr ? 'لماذا يتوقف البوت عند إغلاق صفحة المتصفح؟' : 'Why does the bot pause when the tab is closed?'}</span>
            </div>
            <p className="text-[11px] text-amber-100/90 leading-relaxed">
              {isAr ? (
                <>
                  التطبيق يعمل حالياً على بيئة سحابية خادمة بدون خادم (<strong>Google Cloud Run - Serverless</strong>). في هذا النظام، عندما تغلق نافذة العرض ولا توجد أي طلبات واردة من المستخدم، تقوم السحابة تلقائياً بعد فترة بـ <strong>تجميد موارد المعالج (CPU Throttling)</strong> لتوفير استهلاك الخوادم. بمجرد فتحك للمتصفح مجدداً، يتم إيقاظ السيرفر فوراً.
                </>
              ) : (
                <>
                  The app is hosted on a serverless container (<strong>Google Cloud Run</strong>). By default, when no HTTP traffic is detected from an active browser, the cloud platform scales the CPU to zero or idle mode to conserve energy.
                </>
              )}
            </p>
          </div>

          {/* 🚀 Solution 1: Free Uptime Ping (Easiest & Fastest - 1 Minute) */}
          <div className="p-4 rounded-xl border border-cyan-500/30 bg-black/60 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-white uppercase tracking-wider text-xs">
                  {isAr ? 'الحل الأول: تفعيل نبضات Ping مجانية كل دقيقة (موصى به - دقيقة واحدة)' : 'Solution 1: Free External Keep-Alive Ping (Recommended)'}
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                {isAr ? 'مجاني 100%' : '100% FREE'}
              </span>
            </div>

            <p className="text-[11px] text-gray-300 leading-relaxed">
              {isAr
                ? 'خدمات مراقبة المواقع العالمية (مثل UptimeRobot أو cron-job.org) تقدم خدمة مجانية لإرسال طلب فحص للسيرفر كل دقيقة من خوادم خارجية مستقلة 24/7. هذا يُجبر السحابة على إبقاء البوت نشطاً ويتداول دائماً دون الحاجة لفتح المتصفح إطلاقاً!'
                : 'Free uptime services (like UptimeRobot) ping your endpoint every minute from global data centers, forcing Cloud Run to stay 100% awake 24/7 even with your computer and phone turned off.'}
            </p>

            {/* Copy Ping URL Box */}
            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-[var(--muted)] uppercase block">
                {isAr ? 'رابط النبضات الدائمة (Keep-Alive Endpoint URL):' : 'Keep-Alive Endpoint URL:'}
              </span>
              <div className="flex items-center gap-2 bg-black/80 p-2 rounded-xl border border-cyan-500/40">
                <input
                  type="text"
                  readOnly
                  value={pingUrl}
                  className="bg-transparent text-cyan-300 text-[11px] font-mono outline-none w-full select-all"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {copiedUrl ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>{copiedUrl ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ الرابط' : 'Copy')}</span>
                </button>
              </div>
            </div>

            {/* Quick Steps */}
            <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-[11px] text-gray-300 space-y-1.5">
              <span className="font-bold text-white block">{isAr ? 'خطوات التفعيل في دقيقة واحدة:' : 'Setup Steps in 1 Minute:'}</span>
              <p>1. {isAr ? 'ادخل مجاناً على' : 'Sign up for free at'} <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-bold">uptimerobot.com</a> {isAr ? 'أو' : 'or'} <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-bold">cron-job.org</a>.</p>
              <p>2. {isAr ? 'اختر "Add New Monitor" ثم اختر نوعه: HTTP(s).' : 'Click "Add New Monitor" and select HTTP(s).'}</p>
              <p>3. {isAr ? 'الصق الرابط المنسوخ أعلاه في خانة الـ URL واختر الفحص كل: 1 Minute.' : 'Paste the copied URL above and set Monitoring Interval to 1 minute.'}</p>
              <p>4. {isAr ? 'اضغط حفظ (Create Monitor) — مبروك! البوت الآن سيعمل 24/7 دون توقف للأبد.' : 'Click Create Monitor. Your bot is now permanently awake 24/7.'}</p>
            </div>
          </div>

          {/* ⚙️ Solution 2: Cloud Run Always-Allocated CPU */}
          <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-xs uppercase">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>{isAr ? 'الحل الثاني: إعداد معالج Cloud Run الدائم (Google Cloud Console)' : 'Solution 2: Cloud Run "Always Allocated CPU" Setting'}</span>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              {isAr ? (
                <>
                  إذا كانت لديك صلاحية الدخول للوحة تحكم Google Cloud الخاصة بالتطبيق:
                  <br />
                  توجه إلى إعدادات خدمة <strong>Cloud Run</strong> الخاصة بالتطبيق، وغير إعداد <strong>CPU Allocation</strong> من (Request-based) إلى: <strong>"CPU is always allocated"</strong> مع وضع <strong>Minimum instances = 1</strong>. هذا يمنع المنصة السحابية من إيقاف المعالج نهائياً.
                </>
              ) : (
                <>
                  In Google Cloud Console under Cloud Run settings, switch CPU Allocation to "CPU is always allocated" and set Minimum instances to 1.
                </>
              )}
            </p>
          </div>

          {/* 🖥️ Solution 3: Dedicated VPS Deployment */}
          <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-xs uppercase">
              <Globe className="w-4 h-4 text-blue-400" />
              <span>{isAr ? 'الحل الثالث: النشر المستقل على سيرفر VPS خاص (المعيار الاحترافي)' : 'Solution 3: Dedicated VPS Hosting (Hetzner / DigitalOcean)'}</span>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              {isAr ? (
                <>
                  يمكنك تشغيل الكود مباشرة على خادم افتراضي خاص (VPS) بتكلفة ~4$ شهرياً عبر <code>pm2 start server.ts</code>. الخادم يكون مخصصاً لك 100%، متصلاً بألياف ضوئية عالمية، ويعمل 365 يوماً في السنة مستقلاً تماماً عن أي متصفح.
                </>
              ) : (
                <>
                  Deploy directly to a dedicated Linux VPS via <code>pm2 start server.ts</code> for enterprise-grade 365-day autonomy.
                </>
              )}
            </p>
          </div>
        </div>

        {/* 🚪 Footer Actions */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-black/60 gap-3">
          <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-mono">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'بيانات تداولك واستراتيجياتك محفوظة دائماً على القرص' : 'Your data & database persist safely on disk'}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold transition cursor-pointer shadow-[0_0_15px_rgba(0,243,255,0.3)] text-xs font-mono"
          >
            {isAr ? 'فهمت، إغلاق الدليل' : 'Understood, Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
