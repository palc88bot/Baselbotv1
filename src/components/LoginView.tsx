import React from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { LogIn, ShieldCheck, Cpu, Database } from 'lucide-react';

export const LoginView: React.FC<{ lang: 'ar' | 'en' }> = ({ lang }) => {
  const { signIn } = useAuth();
  const isAr = lang === 'ar';

  return (
    <div className="min-h-screen bg-[#02040a] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-700/10 rounded-full blur-[140px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-4">
            <Cpu className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {isAr ? 'Basel AlgoCore' : 'Basel AlgoCore'}
          </h1>
          <p className="text-slate-400 text-sm">
            {isAr ? 'نظام التداول الكمي المتقدم' : 'Advanced Quantum Trading System'}
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
            <ShieldCheck className="w-5 h-5 text-green-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-200">{isAr ? 'دخول آمن' : 'Secure Access'}</p>
              <p className="text-xs text-slate-400">{isAr ? 'تشفير كامل لبياناتك الشخصية' : 'End-to-end encryption for your data'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
            <Database className="w-5 h-5 text-blue-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-200">{isAr ? 'حفظ البيانات سحابياً' : 'Cloud Persistence'}</p>
              <p className="text-xs text-slate-400">{isAr ? 'مزامنة صفقاتك وإعداداتك عبر Cloud SQL' : 'Sync trades and settings via Cloud SQL'}</p>
            </div>
          </div>
        </div>

        <button
          onClick={signIn}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-white text-black hover:bg-slate-200 font-bold rounded-xl transition-all active:scale-95"
        >
          <LogIn className="w-5 h-5" />
          {isAr ? 'تسجيل الدخول عبر Google' : 'Sign in with Google'}
        </button>

        <p className="mt-6 text-center text-xs text-slate-500">
          {isAr 
            ? 'بالتسجيل فإنك توافق على شروط الاستخدام المتقدمة' 
            : 'By signing in you agree to advanced terms of use'}
        </p>
      </motion.div>
    </div>
  );
};
