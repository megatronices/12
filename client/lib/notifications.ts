import { TokenPair } from "@shared/types";
import { formatPrice, formatPercentage, calculateBuyPressure } from "./api";

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  minPriceChange: number;
  minBuyPressure: number;
  maxNotificationsPerHour: number;
}

export class NotificationService {
  private settings: NotificationSettings;
  private notificationHistory: number[] = []; // Timestamps
  private knownTokens = new Set<string>(); // Track tokens we've already notified about
  private readonly STORAGE_KEY = "bullish-scanner-notifications";
  private readonly KNOWN_TOKENS_KEY = "bullish-scanner-known-tokens";

  constructor() {
    this.settings = this.loadSettings();
    this.loadKnownTokens();
  }

  private loadSettings(): NotificationSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return { ...this.getDefaultSettings(), ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn("Failed to load notification settings:", error);
    }
    return this.getDefaultSettings();
  }

  private loadKnownTokens(): void {
    try {
      const stored = localStorage.getItem(this.KNOWN_TOKENS_KEY);
      if (stored) {
        this.knownTokens = new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.warn("Failed to load known tokens:", error);
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn("Failed to save notification settings:", error);
    }
  }

  private saveKnownTokens(): void {
    try {
      localStorage.setItem(
        this.KNOWN_TOKENS_KEY,
        JSON.stringify(Array.from(this.knownTokens)),
      );
    } catch (error) {
      console.warn("Failed to save known tokens:", error);
    }
  }

  private getDefaultSettings(): NotificationSettings {
    return {
      enabled: false,
      sound: true,
      minPriceChange: 5, // 5% minimum price change for ultra-strong signals
      minBuyPressure: 70, // 70% minimum buy pressure for ultra-strong signals
      maxNotificationsPerHour: 5, // Fewer notifications since they'll be stronger
    };
  }

  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.warn("Browser does not support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    // For denied permissions, try to guide user through browser settings
    if (Notification.permission === "denied") {
      console.warn("Notifications are denied. User needs to manually enable in browser settings.");
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        console.log("✅ Notification permission granted!");
        return true;
      } else {
        console.warn("❌ Notification permission denied");
        return false;
      }
    } catch (error) {
      console.error("Failed to request notification permission:", error);
      return false;
    }
  }

  // Force reset notification permission status
  resetPermissions(): void {
    console.log("🔄 Resetting notification permissions...");
    // Clear any cached permission state
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.KNOWN_TOKENS_KEY);
    this.knownTokens.clear();
    this.notificationHistory = [];

    // Force browser to re-evaluate permission
    this.requestPermission().then(granted => {
      if (granted) {
        console.log("✅ Desktop notifications reset and working!");
      } else {
        console.log("❌ Desktop notifications still blocked - check browser settings");
      }
    });
  }

  getPermissionStatus(): NotificationPermission | "unsupported" {
    if (!("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  }

  updateSettings(newSettings: Partial<NotificationSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  private canSendNotification(): boolean {
    if (!this.settings.enabled) return false;
    if (Notification.permission !== "granted") return false;

    // Check rate limiting
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Clean old notifications from history
    this.notificationHistory = this.notificationHistory.filter(
      (timestamp) => timestamp > oneHourAgo,
    );

    return (
      this.notificationHistory.length < this.settings.maxNotificationsPerHour
    );
  }

  private playNotificationSound(): void {
    if (!this.settings.sound) return;

    try {
      // Create a simple beep sound using Web Audio API
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        0.3,
        audioContext.currentTime + 0.1,
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.5,
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn("Failed to play notification sound:", error);
    }
  }

  async notifyNewBullishSignal(token: TokenPair): Promise<boolean> {
    if (!this.canSendNotification()) return false;

    const priceChange5m = token.priceChange?.m5 || 0;
    const buyPressure = calculateBuyPressure(token);

    // Check if this signal meets our notification criteria
    if (
      priceChange5m < this.settings.minPriceChange ||
      buyPressure < this.settings.minBuyPressure
    ) {
      return false;
    }

    // Check if we've already notified about this token recently
    const tokenKey = `${token.baseToken.address}-${Math.floor(Date.now() / (5 * 60 * 1000))}`; // 5-minute windows
    if (this.knownTokens.has(tokenKey)) {
      return false;
    }

    try {
      const marketCap = token.marketCap
        ? `$${(token.marketCap / 1000).toFixed(0)}k`
        : "Unknown";

      const notification = new Notification("🔥 ULTRA-STRONG BULLISH SIGNAL!", {
        body: `${token.baseToken.symbol}: ${formatPercentage(priceChange5m)} (5m)\nEXPLOSIVE MOVEMENT DETECTED!\nBuy Pressure: ${buyPressure.toFixed(1)}%\nMarket Cap: ${marketCap}\nPrice: $${formatPrice(token.priceUsd)}`,
        icon: token.info?.imageUrl || "/placeholder.svg",
        tag: `bullish-${token.baseToken.address}`, // Prevents duplicate notifications
        requireInteraction: true,
        silent: !this.settings.sound,
      });

      notification.onclick = () => {
        window.focus();
        window.open(
          `https://jup.ag/tokens/${token.baseToken.address}`,
          "_blank",
        );
        notification.close();
      };

      // Track this notification
      this.notificationHistory.push(Date.now());
      this.knownTokens.add(tokenKey);
      this.saveKnownTokens();

      // Play sound if enabled
      if (this.settings.sound) {
        this.playNotificationSound();
      }

      console.log(`Notification sent for ${token.baseToken.symbol}`);
      return true;
    } catch (error) {
      console.error("Failed to send notification:", error);
      return false;
    }
  }

  async checkAndNotifyNewSignals(currentTokens: TokenPair[]): Promise<number> {
    if (!this.canSendNotification()) return 0;

    let notificationsSent = 0;

    for (const token of currentTokens) {
      const success = await this.notifyNewBullishSignal(token);
      if (success) {
        notificationsSent++;
        // Add a small delay between notifications to avoid spam
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return notificationsSent;
  }

  clearKnownTokens(): void {
    this.knownTokens.clear();
    this.saveKnownTokens();
  }

  getStats(): {
    notificationsThisHour: number;
    knownTokensCount: number;
    permissionStatus: string;
  } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const notificationsThisHour = this.notificationHistory.filter(
      (timestamp) => timestamp > oneHourAgo,
    ).length;

    return {
      notificationsThisHour,
      knownTokensCount: this.knownTokens.size,
      permissionStatus: this.getPermissionStatus(),
    };
  }
}

// Singleton instance
export const notificationService = new NotificationService();
