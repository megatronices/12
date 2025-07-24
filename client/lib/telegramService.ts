import { TokenPair } from "@shared/types";
import { formatPrice, formatPercentage, calculateBuyPressure } from "./api";

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
  includePriceChart: boolean;
  includeDetailedAnalysis: boolean;
}

export class TelegramService {
  private settings: TelegramSettings;
  private readonly STORAGE_KEY = "telegram-bot-settings";
  private lastSentTokens = new Set<string>(); // Prevent duplicate alerts

  constructor() {
    this.settings = this.loadSettings();
  }

  private loadSettings(): TelegramSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return { ...this.getDefaultSettings(), ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn("Failed to load Telegram settings:", error);
    }
    return this.getDefaultSettings();
  }

  private getDefaultSettings(): TelegramSettings {
    return {
      enabled: false,
      botToken: "",
      chatId: "",
      includePriceChart: true,
      includeDetailedAnalysis: true,
    };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn("Failed to save Telegram settings:", error);
    }
  }

  updateSettings(newSettings: Partial<TelegramSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  getSettings(): TelegramSettings {
    return { ...this.settings };
  }

  private async sendTelegramMessage(message: string): Promise<boolean> {
    if (
      !this.settings.enabled ||
      !this.settings.botToken ||
      !this.settings.chatId
    ) {
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.settings.botToken}/sendMessage`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: this.settings.chatId,
          text: message,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Telegram API error:", error);
        return false;
      }

      console.log("Telegram message sent successfully");
      return true;
    } catch (error) {
      console.error("Failed to send Telegram message:", error);
      return false;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.settings.botToken || !this.settings.chatId) {
      return { success: false, error: "Bot token and chat ID are required" };
    }

    try {
      const testMessage =
        "🤖 *ULTRA-STRONG Signal Scanner*\n\n✅ Connection test successful!\n\nYou will now receive ultra-strong bullish signal alerts here.";
      const success = await this.sendTelegramMessage(testMessage);

      if (success) {
        return { success: true };
      } else {
        return { success: false, error: "Failed to send test message" };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendUltraStrongSignalAlert(token: TokenPair): Promise<boolean> {
    if (!this.settings.enabled) return false;

    // Prevent duplicate alerts for the same token within 10 minutes
    const tokenKey = `${token.baseToken.address}-${Math.floor(Date.now() / (10 * 60 * 1000))}`;
    if (this.lastSentTokens.has(tokenKey)) {
      return false;
    }

    const priceChange5m = token.priceChange?.m5 || 0;
    const buyPressure = calculateBuyPressure(token);
    const marketCap = token.marketCap
      ? `$${(token.marketCap / 1000).toFixed(0)}k`
      : "Unknown";
    const volume5m = token.volume?.m5 || 0;
    const jupiterUrl = `https://jup.ag/tokens/${token.baseToken.address}`;

    let message = `🔥 *ULTRA-STRONG BULLISH SIGNAL DETECTED!*\n\n`;
    message += `🚀 **${token.baseToken.symbol}**\n`;
    message += `💰 Price: $${formatPrice(token.priceUsd)}\n`;
    message += `📈 5m Change: *${formatPercentage(priceChange5m)}*\n`;
    message += `💪 Buy Pressure: *${buyPressure.toFixed(1)}%*\n`;
    message += `💎 Market Cap: ${marketCap}\n`;
    message += `📊 5m Volume: $${(volume5m / 1000).toFixed(1)}k\n\n`;

    if (this.settings.includeDetailedAnalysis) {
      message += `🎯 *Signal Analysis:*\n`;
      message += `• ✅ Explosive momentum (≥5%)\n`;
      message += `• ✅ Massive buy pressure (≥70%)\n`;
      message += `• ✅ Volume spike detected\n`;
      message += `• ✅ MA convergence confirmed\n`;
      message += `• ✅ All timeframes bullish\n\n`;
    }

    message += `🎯 [Trade on Jupiter](${jupiterUrl})\n`;
    message += `📱 [View on DexScreener](https://dexscreener.com/solana/${token.pairAddress})\n\n`;
    message += `⚡ *Time: ${new Date().toLocaleTimeString()}*`;

    const success = await this.sendTelegramMessage(message);

    if (success) {
      this.lastSentTokens.add(tokenKey);
      console.log(`Telegram alert sent for ${token.baseToken.symbol}`);
    }

    return success;
  }

  async sendDailySummary(alertCount: number): Promise<boolean> {
    if (!this.settings.enabled) return false;

    const message =
      `📊 *Daily Ultra-Strong Signals Summary*\n\n` +
      `🔥 Alerts sent today: *${alertCount}*\n` +
      `⚡ Scanner status: Active\n` +
      `🎯 Criteria: 5%+ momentum, 70%+ buy pressure\n\n` +
      `*Keep watching for explosive opportunities!*`;

    return await this.sendTelegramMessage(message);
  }

  clearRecentTokens(): void {
    this.lastSentTokens.clear();
  }

  getStats(): {
    enabled: boolean;
    configured: boolean;
    recentTokensCount: number;
  } {
    return {
      enabled: this.settings.enabled,
      configured: !!(this.settings.botToken && this.settings.chatId),
      recentTokensCount: this.lastSentTokens.size,
    };
  }
}

// Singleton instance
export const telegramService = new TelegramService();
