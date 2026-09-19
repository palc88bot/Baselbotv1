// src/components/TelegramSettings.tsx

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, ShieldCheck, Bell, BellOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { fetchWithAuth } from '../lib/api.ts';

export default function TelegramSettings({ lang }: { lang: 'ar' | 'en' }) {
    const [chatId, setChatId] = useState('');
    const [isEnabled, setIsEnabled] = useState(false);
    const [maskedId, setMaskedId] = useState('Not configured');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const isAr = lang === 'ar';

    useEffect(() => {
        // Fetch current configuration status on mount
        fetchWithAuth('/api/telegram/status')
            .then(data => {
                setIsEnabled(data.isEnabled);
                setMaskedId(data.maskedChatId);
            })
            .catch(err => console.error("Error fetching Telegram status:", err));
    }, []);

    const handleSave = async () => {
        setStatus('loading');
        setMessage('');
        try {
            const data = await fetchWithAuth('/api/telegram/config', {
                method: 'POST',
                body: JSON.stringify({ chatId, isEnabled })
            });
            if (data.success) {
                setMaskedId(data.status?.maskedChatId || data.maskedChatId);
                setChatId(''); // Clear input for security
                setStatus('success');
                setMessage(isAr ? 'تم الحفظ بنجاح!' : 'Saved successfully!');
            } else {
                setStatus('error');
                setMessage(isAr ? 'فشل الحفظ' : 'Failed to save');
            }
        } catch (err) {
            setStatus('error');
            setMessage(isAr ? 'فشل الحفظ' : 'Failed to save');
        }
        setTimeout(() => setStatus('idle'), 3000);
    };

    const handleTest = async () => {
        setStatus('loading');
        setMessage('');
        try {
            const data = await fetchWithAuth('/api/protected/telegram/test', { method: 'POST' });
            setStatus(data.success ? 'success' : 'error');
            setMessage(data.message || (data.success ? 'Test message sent!' : 'Failed to send'));
        } catch (err) {
            setStatus('error');
            setMessage('Connection failed');
        }
        setTimeout(() => setStatus('idle'), 3000);
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#0f1523] border border-slate-800 rounded-xl p-6 shadow-2xl"
        >
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <Send className="w-5 h-5 text-cyan-400" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">
                    {isAr ? 'إعدادات تنبيهات تليجرام' : 'Telegram Alerts Settings'}
                </h2>
            </div>

            {/* Current status */}
            <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg mb-6 border border-slate-800">
                <div className="flex items-center gap-2">
                    {isEnabled ? <Bell className="w-4 h-4 text-green-400" /> : <BellOff className="w-4 h-4 text-slate-500" />}
                    <span className="text-sm text-slate-300">
                        {isAr ? 'الحالة:' : 'Status:'} 
                        <span className={isEnabled ? 'text-green-400 ml-2 font-semibold' : 'text-slate-500 ml-2 font-semibold'}>
                            {isEnabled ? (isAr ? 'مفعّل' : 'Enabled') : (isAr ? 'متوقف' : 'Disabled')}
                        </span>
                    </span>
                </div>
                <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded">
                    ID: {maskedId}
                </span>
            </div>

            {/* Chat ID input */}
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">
                        {isAr ? 'معرف القناة أو الحساب (Chat ID)' : 'Channel or Account ID (Chat ID)'}
                    </label>
                    <input
                        type="text"
                        value={chatId}
                        onChange={(e) => setChatId(e.target.value)}
                        placeholder={isAr ? 'أدخل معرف تليجرام...' : 'Enter Telegram Chat ID...'}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                    />
                </div>

                {/* Switch button */}
                <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                    <span className="text-sm text-slate-300 font-medium">
                        {isAr ? 'تفعيل التنبيهات التلقائية' : 'Enable Auto Alerts'}
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsEnabled(!isEnabled)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 cursor-pointer ${
                            isEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                    >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${
                            isEnabled ? 'translate-x-7' : 'translate-x-1'
                        }`} />
                    </button>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={status === 'loading'}
                        className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        {isAr ? 'حفظ الإعدادات' : 'Save Settings'}
                    </button>

                    <button
                        type="button"
                        onClick={handleTest}
                        disabled={status === 'loading'}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-200 text-sm font-medium py-2.5 rounded-lg border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {isAr ? 'اختبار الاتصال' : 'Test Connection'}
                    </button>
                </div>

                {/* Status alerts */}
                {message && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }}
                        className={`flex items-center gap-2 text-xs p-2.5 rounded-lg ${
                            status === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                    >
                        {status === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                        <span>{message}</span>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}
