/**
 * Basel AlgoCore Command Terminal Bar
 * Floating Command Input with Live Autonomous Mind Communication & Direct Bot Execution
 */

import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Send, HelpCircle, Sparkles } from 'lucide-react';

interface CommandTerminalBarProps {
  onExecuteCommand: (cmd: string) => void;
  lang: 'ar' | 'en';
}

export const CommandTerminalBar: React.FC<CommandTerminalBarProps> = ({
  onExecuteCommand,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [inputVal, setInputVal] = useState<string>('');
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Command palette shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    onExecuteCommand(inputVal.trim());
    setInputVal('');
    setShowHelp(false);
  };

  const handleQuickCommand = (cmd: string) => {
    onExecuteCommand(cmd);
    setShowHelp(false);
  };

  const quickCommands = isAr ? [
    { label: 'إعادة التوازن الكمي', cmd: 'rebalance' },
    { label: 'فحص الأسواق', cmd: 'scan' },
    { label: 'حالة النظام', cmd: 'status' },
    { label: 'تبديل الثيم', cmd: 'theme' },
    { label: 'الحركة', cmd: 'motion' },
  ] : [
    { label: 'QUBO Rebalance', cmd: 'rebalance' },
    { label: 'Scan Markets', cmd: 'scan' },
    { label: 'System Health', cmd: 'status' },
    { label: 'Cycle Theme', cmd: 'theme' },
    { label: 'Toggle Motion', cmd: 'motion' },
  ];

  return (
    <footer 
      className="sticky bottom-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-t from-[#04060c] via-[#04060c]/90 to-transparent backdrop-blur-xl border-t border-[var(--stroke)] shadow-2xl"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="max-w-[900px] mx-auto relative">
        
        {/* Quick Helper Popup */}
        {showHelp && (
          <div className="absolute bottom-full mb-2 inset-x-0 p-3 rounded-2xl border border-[var(--stroke-2)] bg-[rgba(6,10,18,0.96)] backdrop-blur-2xl shadow-2xl space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between text-xs font-mono text-[var(--cyan)]">
              <span className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {isAr ? 'الأوامر السريعة المتاحة للبوت' : 'Quick Autonomous Commands'}
              </span>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-[var(--text-3)] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {quickCommands.map((q) => (
                <button
                  key={q.cmd}
                  type="button"
                  onClick={() => handleQuickCommand(q.cmd)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono text-[var(--text-2)] hover:text-[var(--cyan)] bg-white/5 hover:bg-[rgba(var(--accent-rgb),0.15)] border border-[var(--stroke)] transition-all cursor-pointer"
                >
                  <span className="text-[var(--cyan)] mr-1">/</span>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <form 
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-[var(--stroke-2)] focus-within:border-[var(--cyan)] focus-within:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] bg-[var(--panel-bg)] transition-all"
        >
          <span className="font-mono text-sm sm:text-base text-[var(--cyan)] font-black select-none">
            ❯
          </span>

          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={isAr ? 'اسأل NEXUS أي شيء أو اكتب أمراً (مثال: rebalance, scan, status)...' : 'Ask NEXUS anything or run a command (e.g., rebalance, scan, status)...'}
            className="flex-1 bg-transparent border-0 outline-none text-xs sm:text-sm font-mono text-[var(--text)] placeholder-[var(--text-3)] min-w-0"
            autoComplete="off"
            spellCheck={false}
          />

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowHelp((prev) => !prev)}
              className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--cyan)] hover:bg-white/5 transition-colors"
              title={isAr ? 'الأوامر المتاحة' : 'Available Commands'}
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>

            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono text-[var(--text-3)] bg-white/5 border border-white/10">
              ⌘K
            </span>

            <button
              type="submit"
              disabled={!inputVal.trim()}
              className="p-1.5 rounded-lg text-[var(--cyan)] hover:bg-[rgba(var(--accent-rgb),0.15)] disabled:opacity-30 transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

      </div>
    </footer>
  );
};
