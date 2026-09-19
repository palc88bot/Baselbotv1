// src/services/TelegramService.ts

export interface TelegramConfig {
    chatId: string;
    isEnabled: boolean;
}

export class TelegramService {
    private botToken: string;
    private config: TelegramConfig = { chatId: '', isEnabled: false };
    private queue: string[] = [];
    private draining: boolean = false;
    private fails: number = 0;

    constructor() {
        // 🔒 The token is fetched only from server-side environment variables (never exposed to client)
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    }

    public static esc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    public updateConfig(chatId: string, isEnabled: boolean) {
        this.config.chatId = chatId;
        this.config.isEnabled = isEnabled;
        console.log(`📱 Telegram config updated. Enabled: ${isEnabled}`);
    }

    public getConfigStatus() {
        return {
            isEnabled: this.config.isEnabled,
            // 🔒 Obfuscate chatId for security (show only last 4 digits)
            maskedChatId: this.config.chatId ? `***${this.config.chatId.slice(-4)}` : 'Not configured'
        };
    }

    /**
     * Non-blocking notification dispatch into async queue
     */
    public notify(text: string): void {
        this.queue.push(text);
        void this.drain();
    }

    private async drain(): Promise<void> {
        if (this.draining) return;
        this.draining = true;

        while (this.queue.length > 0) {
            const msg = this.queue.shift()!;
            try {
                const ok = await this.sendMessage(msg);
                if (ok) {
                    this.fails = 0;
                } else {
                    this.fails++;
                    if (this.fails > 5) {
                        this.queue.length = 0; // Drop stale queue on repeated failures
                    }
                }
            } catch (err) {
                this.fails++;
                if (this.fails > 5) {
                    this.queue.length = 0;
                }
            }
        }
        this.draining = false;
    }

    public async sendMessage(text: string): Promise<boolean> {
        if (!this.config.isEnabled || !this.config.chatId || !this.botToken) {
            return false;
        }

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.config.chatId,
                    text: text,
                    parse_mode: 'HTML' // Support HTML formatting
                })
            });

            if (!response.ok) {
                console.error('❌ Telegram API Error:', await response.text());
                return false;
            }
            return true;
        } catch (error) {
            console.error('❌ Telegram Network Error:', error);
            return false;
        }
    }
}
