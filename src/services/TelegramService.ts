// src/services/TelegramService.ts

export interface TelegramConfig {
    chatId: string;
    isEnabled: boolean;
}

export class TelegramService {
    private botToken: string;
    private config: TelegramConfig = { chatId: '', isEnabled: false };

    constructor() {
        // 🔒 The token is fetched only from server-side environment variables (never exposed to client)
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
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
