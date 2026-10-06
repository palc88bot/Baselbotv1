// src/services/TelegramService.ts

import fs from 'fs';
import path from 'path';

export interface TelegramConfig {
    chatId: string;
    isEnabled: boolean;
    botToken?: string;
    heartbeatEnabled: boolean;
    heartbeatIntervalMinutes: number;
    lastHeartbeatSent?: number;
}

interface QueueItem {
    id: string;
    text: string;
    retries: number;
    resolve?: (value: boolean) => void;
    timestamp: number;
}

const CONFIG_FILE = path.join(process.cwd(), 'data', 'telegram_config.json');

export class TelegramService {
    private botToken: string;
    private config: TelegramConfig = {
        chatId: '',
        isEnabled: false,
        heartbeatEnabled: true,
        heartbeatIntervalMinutes: 30,
        lastHeartbeatSent: 0
    };
    private queue: QueueItem[] = [];
    private isDraining: boolean = false;
    private backoffUntil: number = 0;
    private lastSendTime: number = 0;
    private recentMessageHashes = new Map<string, number>();
    private readonly MIN_INTERVAL_MS = 1250; // Respect Telegram's 1 msg/sec limit
    private readonly MAX_QUEUE_SIZE = 35;

    constructor() {
        this.loadPersistedConfig();
        // Priority: env var overrides persisted config if set
        if (process.env.TELEGRAM_BOT_TOKEN) {
            this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        } else {
            this.botToken = this.config.botToken || '';
        }

        const envChatId = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID;
        if (envChatId) {
            this.config.chatId = envChatId;
            this.config.isEnabled = true;
        }
    }

    private loadPersistedConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    this.config = {
                        chatId: parsed.chatId || '',
                        isEnabled: parsed.isEnabled ?? false,
                        botToken: parsed.botToken || '',
                        heartbeatEnabled: parsed.heartbeatEnabled ?? true,
                        heartbeatIntervalMinutes: parsed.heartbeatIntervalMinutes || 30,
                        lastHeartbeatSent: parsed.lastHeartbeatSent || 0
                    };
                    if (parsed.botToken) {
                        this.botToken = parsed.botToken;
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ [TELEGRAM] Could not load persisted config:', e);
        }
    }

    private savePersistedConfig() {
        try {
            const dir = path.dirname(CONFIG_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (e) {
            console.error('❌ [TELEGRAM] Failed to persist config to disk:', e);
        }
    }

    public static esc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    public updateConfig(chatId: string, isEnabled: boolean, botToken?: string, heartbeatEnabled?: boolean, intervalMinutes?: number) {
        if (chatId !== undefined) this.config.chatId = chatId.trim();
        if (isEnabled !== undefined) this.config.isEnabled = isEnabled;
        if (botToken) {
            this.botToken = botToken.trim();
            this.config.botToken = botToken.trim();
        }
        if (heartbeatEnabled !== undefined) {
            this.config.heartbeatEnabled = heartbeatEnabled;
        }
        if (intervalMinutes !== undefined && intervalMinutes > 0) {
            this.config.heartbeatIntervalMinutes = intervalMinutes;
        }

        this.savePersistedConfig();
        console.log(`📱 Telegram config updated. Enabled: ${this.config.isEnabled}, Heartbeat: ${this.config.heartbeatEnabled} (${this.config.heartbeatIntervalMinutes}m)`);
    }

    public getConfigStatus() {
        return {
            isEnabled: this.config.isEnabled && !!this.config.chatId && !!this.botToken,
            isConfigured: !!this.botToken && !!this.config.chatId,
            hasToken: !!this.botToken,
            maskedChatId: this.config.chatId ? `***${this.config.chatId.slice(-4)}` : 'Not configured',
            chatId: this.config.chatId || '',
            heartbeatEnabled: this.config.heartbeatEnabled,
            heartbeatIntervalMinutes: this.config.heartbeatIntervalMinutes,
            lastHeartbeatSent: this.config.lastHeartbeatSent || 0
        };
    }

    public recordHeartbeatSent() {
        this.config.lastHeartbeatSent = Date.now();
        this.savePersistedConfig();
    }

    public getHeartbeatConfig() {
        return {
            enabled: this.config.heartbeatEnabled,
            intervalMinutes: this.config.heartbeatIntervalMinutes,
            lastSent: this.config.lastHeartbeatSent || 0,
            chatId: this.config.chatId,
            isEnabled: this.config.isEnabled
        };
    }

    /**
     * Non-blocking fire-and-forget notification dispatch into rate-limited queue
     */
    public notify(text: string): void {
        void this.enqueueMessage(text);
    }

    /**
     * Async sendMessage that enters the queue and returns true when processed
     */
    public async sendMessage(text: string): Promise<boolean> {
        if (!this.config.isEnabled || !this.config.chatId || !this.botToken) {
            return false;
        }
        return new Promise<boolean>((resolve) => {
            this.enqueueMessage(text, resolve);
        });
    }

    /**
     * Safely enqueues a message with deduplication and size cap
     */
    private enqueueMessage(text: string, resolve?: (val: boolean) => void): void {
        const trimmed = text.trim();
        if (!trimmed) {
            if (resolve) resolve(false);
            return;
        }

        // Anti-spam deduplication (avoid sending identical alerts within 15s)
        const hash = `${trimmed.slice(0, 80)}-${trimmed.length}`;
        const now = Date.now();
        const lastSent = this.recentMessageHashes.get(hash);
        if (lastSent && now - lastSent < 15000) {
            if (resolve) resolve(true);
            return;
        }
        this.recentMessageHashes.set(hash, now);

        // Clean up old deduplication cache
        if (this.recentMessageHashes.size > 100) {
            for (const [k, ts] of this.recentMessageHashes.entries()) {
                if (now - ts > 60000) this.recentMessageHashes.delete(k);
            }
        }

        // Limit queue size to avoid stale backlog
        if (this.queue.length >= this.MAX_QUEUE_SIZE) {
            const dropped = this.queue.shift();
            if (dropped?.resolve) dropped.resolve(false);
        }

        this.queue.push({
            id: `tg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            text: trimmed,
            retries: 0,
            resolve,
            timestamp: now
        });

        void this.processQueue();
    }

    /**
     * Rate-limited sequential worker with backoff and automatic retries
     */
    private async processQueue(): Promise<void> {
        if (this.isDraining) return;
        this.isDraining = true;

        try {
            while (this.queue.length > 0) {
                // Check if we are in a rate-limit (429) backoff window
                const now = Date.now();
                if (this.backoffUntil > now) {
                    const waitTime = this.backoffUntil - now;
                    await new Promise(r => setTimeout(r, waitTime));
                }

                // Ensure minimum spacing between Telegram API requests
                const elapsedSinceLast = Date.now() - this.lastSendTime;
                if (elapsedSinceLast < this.MIN_INTERVAL_MS) {
                    await new Promise(r => setTimeout(r, this.MIN_INTERVAL_MS - elapsedSinceLast));
                }

                const item = this.queue.shift();
                if (!item) break;

                const result = await this.executeHttpRequest(item.text);
                this.lastSendTime = Date.now();

                if (result.success) {
                    if (item.resolve) item.resolve(true);
                } else if (result.rateLimited) {
                    // Encountered 429: Apply backoff and put message back at front of queue
                    const retrySeconds = Math.max(2, result.retryAfter || 5);
                    this.backoffUntil = Date.now() + (retrySeconds * 1000) + 500;
                    console.warn(`⏳ [TELEGRAM] Rate-limited (429). Pausing for ${retrySeconds}s before retrying...`);
                    
                    if (item.retries < 3) {
                        item.retries++;
                        this.queue.unshift(item);
                    } else if (item.resolve) {
                        item.resolve(false);
                    }
                } else if (result.isNetworkError && item.retries < 2) {
                    // Transient network/ETIMEDOUT error: brief pause and retry
                    item.retries++;
                    this.queue.unshift(item);
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    // Unrecoverable error or exceeded retries
                    if (item.resolve) item.resolve(false);
                }
            }
        } finally {
            this.isDraining = false;
        }
    }

    /**
     * Sends HTTP POST request to Telegram Bot API with timeout & fallback
     */
    private async executeHttpRequest(text: string, useHtml = true): Promise<{ success: boolean; rateLimited?: boolean; retryAfter?: number; isNetworkError?: boolean }> {
        if (!this.config.isEnabled || !this.config.chatId || !this.botToken) {
            return { success: false };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 9000); // 9-second timeout

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const payload: Record<string, any> = {
                chat_id: this.config.chatId,
                text: text,
                disable_web_page_preview: true
            };
            if (useHtml) {
                payload.parse_mode = 'HTML';
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (response.ok) {
                return { success: true };
            }

            const errorBody = await response.json().catch(() => ({}));
            
            // Handle HTTP 429 Too Many Requests
            if (response.status === 429) {
                const retryAfter = errorBody?.parameters?.retry_after || 5;
                return { success: false, rateLimited: true, retryAfter };
            }

            // Handle bad HTML tags (400) -> Retry once without HTML parse mode
            if (response.status === 400 && useHtml && errorBody?.description?.includes('can\'t parse entities')) {
                const plainText = text.replace(/<[^>]+>/g, '');
                return this.executeHttpRequest(plainText, false);
            }

            console.warn(`⚠️ [TELEGRAM] API Warning (${response.status}): ${errorBody?.description || 'Request failed'}`);
            return { success: false };

        } catch (error: any) {
            clearTimeout(timeout);
            const isTimeout = error.name === 'AbortError' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout') || error.message?.includes('fetch failed');
            
            if (isTimeout) {
                console.warn('⚠️ [TELEGRAM] Network timeout or transient socket glitch (recovering automatically)...');
            } else {
                console.warn(`⚠️ [TELEGRAM] Connection note: ${error.message || error}`);
            }
            return { success: false, isNetworkError: true };
        }
    }
}
