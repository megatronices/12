import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Shield,
  ShieldCheck,
  ShieldX,
  Trash2,
  Settings,
  RefreshCw,
} from "lucide-react";
import {
  notificationService,
  NotificationSettings as NotificationSettingsType,
} from "../lib/notifications";
import { cn } from "../lib/utils";

export function NotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettingsType>(
    notificationService.getSettings(),
  );
  const [permissionStatus, setPermissionStatus] = useState<string>(
    notificationService.getPermissionStatus(),
  );
  const [stats, setStats] = useState(notificationService.getStats());
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(notificationService.getStats());
      setPermissionStatus(notificationService.getPermissionStatus());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      const granted = await notificationService.requestPermission();
      if (granted) {
        setPermissionStatus("granted");
      }
    } catch (error) {
      console.error("Failed to request permission:", error);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSendTestNotification = async () => {
    setIsSendingTest(true);
    try {
      // Create a test token for notification
      const testToken = {
        baseToken: { symbol: "TEST", address: "test-address" },
        priceUsd: "0.123456",
        priceChange: { m5: 7.5 },
        marketCap: 250000,
        volume: { m5: 15000 },
        pairAddress: "test-pair",
      };

      // Send test notification
      new Notification("🔥 TEST: Desktop Notifications Working!", {
        body: "TEST TOKEN: +7.50% (5m)\nBuy Pressure: 85.0%\nMarket Cap: $250k\nPrice: $0.123456\n\n✅ Your alerts are working perfectly!",
        icon: "/placeholder.svg",
        requireInteraction: true,
      });
    } catch (error) {
      console.error("Failed to send test notification:", error);
      alert("Failed to send test notification. Check your browser settings.");
    } finally {
      setIsSendingTest(false);
    }
  };

  const updateSetting = (key: keyof NotificationSettingsType, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    notificationService.updateSettings(newSettings);
  };

  const handleClearKnownTokens = () => {
    notificationService.clearKnownTokens();
    setStats(notificationService.getStats());
  };

  const getPermissionIcon = () => {
    switch (permissionStatus) {
      case "granted":
        return <ShieldCheck className="h-4 w-4 text-green-600" />;
      case "denied":
        return <ShieldX className="h-4 w-4 text-red-600" />;
      case "unsupported":
        return <Shield className="h-4 w-4 text-gray-600" />;
      default:
        return <Shield className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getPermissionText = () => {
    switch (permissionStatus) {
      case "granted":
        return "Granted";
      case "denied":
        return "Denied";
      case "unsupported":
        return "Unsupported";
      default:
        return "Not Asked";
    }
  };

  const getPermissionColor = () => {
    switch (permissionStatus) {
      case "granted":
        return "text-green-600 dark:text-green-400";
      case "denied":
        return "text-red-600 dark:text-red-400";
      case "unsupported":
        return "text-gray-600 dark:text-gray-400";
      default:
        return "text-yellow-600 dark:text-yellow-400";
    }
  };

  const canEnable = permissionStatus === "granted";
  const hourlyUsagePercent =
    (stats.notificationsThisHour / settings.maxNotificationsPerHour) * 100;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Desktop Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Permission Status */}
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="flex items-center gap-2">
            {getPermissionIcon()}
            <span className="text-sm font-medium">Permission</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs", getPermissionColor())}>
              {getPermissionText()}
            </span>
            {permissionStatus === "default" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRequestPermission}
                disabled={isRequesting}
                className="text-xs h-7"
              >
                {isRequesting ? "Requesting..." : "Allow"}
              </Button>
            )}
            {permissionStatus === "granted" && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendTestNotification}
                  disabled={isSendingTest}
                  className="text-xs h-7"
                >
                  <Bell className="h-3 w-3 mr-1" />
                  {isSendingTest ? "Sending..." : "Test"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    notificationService.resetPermissions();
                    setTimeout(() => {
                      setPermissionStatus(
                        notificationService.getPermissionStatus(),
                      );
                    }, 1000);
                  }}
                  className="text-xs h-7"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            )}
            {(permissionStatus === "denied" ||
              permissionStatus === "default") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  notificationService.resetPermissions();
                  setTimeout(() => {
                    setPermissionStatus(
                      notificationService.getPermissionStatus(),
                    );
                  }, 1000);
                }}
                className="text-xs h-7"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Enable/Disable Notifications */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {settings.enabled ? (
              <Bell className="h-4 w-4 text-blue-600" />
            ) : (
              <BellOff className="h-4 w-4 text-gray-400" />
            )}
            <Label htmlFor="notifications-enabled">Enable Alerts</Label>
          </div>
          <Switch
            id="notifications-enabled"
            checked={settings.enabled && canEnable}
            onCheckedChange={(checked) => updateSetting("enabled", checked)}
            disabled={!canEnable}
          />
        </div>

        {/* Sound Setting */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {settings.sound ? (
              <Volume2 className="h-4 w-4 text-blue-600" />
            ) : (
              <VolumeX className="h-4 w-4 text-gray-400" />
            )}
            <Label htmlFor="notifications-sound">Sound</Label>
          </div>
          <Switch
            id="notifications-sound"
            checked={settings.sound}
            onCheckedChange={(checked) => updateSetting("sound", checked)}
            disabled={!settings.enabled || !canEnable}
          />
        </div>

        {/* Settings */}
        {settings.enabled && canEnable && (
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Settings className="h-3 w-3" />
              <span>Alert Criteria</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="min-price-change" className="text-xs">
                Min Price Change (%)
              </Label>
              <Input
                id="min-price-change"
                type="number"
                value={settings.minPriceChange}
                onChange={(e) =>
                  updateSetting("minPriceChange", Number(e.target.value))
                }
                className="h-8 text-xs"
                min="1"
                max="20"
                step="0.5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="min-buy-pressure" className="text-xs">
                Min Buy Pressure (%)
              </Label>
              <Input
                id="min-buy-pressure"
                type="number"
                value={settings.minBuyPressure}
                onChange={(e) =>
                  updateSetting("minBuyPressure", Number(e.target.value))
                }
                className="h-8 text-xs"
                min="5"
                max="90"
                step="1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-notifications" className="text-xs">
                Max Alerts/Hour
              </Label>
              <Input
                id="max-notifications"
                type="number"
                value={settings.maxNotificationsPerHour}
                onChange={(e) =>
                  updateSetting(
                    "maxNotificationsPerHour",
                    Number(e.target.value),
                  )
                }
                className="h-8 text-xs"
                min="1"
                max="50"
                step="1"
              />
            </div>
          </div>
        )}

        {/* Usage Stats */}
        {settings.enabled && canEnable && (
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Usage This Hour
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>
                  {stats.notificationsThisHour} /{" "}
                  {settings.maxNotificationsPerHour}
                </span>
                <span>{hourlyUsagePercent.toFixed(0)}%</span>
              </div>
              <Progress value={hourlyUsagePercent} className="h-2" />
            </div>

            {stats.knownTokensCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Tracking {stats.knownTokensCount} tokens
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClearKnownTokens}
                  className="h-6 px-2 text-xs"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Permission Help */}
        {permissionStatus === "denied" && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 space-y-2">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <ShieldX className="h-4 w-4" />
              <span className="font-medium text-sm">Notifications Blocked</span>
            </div>

            <div className="text-xs text-red-600 dark:text-red-400 space-y-2">
              <p>
                <strong>To fix this:</strong>
              </p>

              <div className="bg-white dark:bg-red-900/40 p-2 rounded border">
                <p className="font-medium mb-1">Chrome/Edge:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Click the 🔒 (lock) icon in the address bar</li>
                  <li>Find "Notifications" and change to "Allow"</li>
                  <li>Refresh this page</li>
                </ol>
              </div>

              <div className="bg-white dark:bg-red-900/40 p-2 rounded border">
                <p className="font-medium mb-1">Firefox:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Click the shield icon in the address bar</li>
                  <li>Click "Turn off Blocking for this site"</li>
                  <li>
                    Or go to Settings → Privacy → Permissions → Notifications
                  </li>
                </ol>
              </div>

              <div className="bg-white dark:bg-red-900/40 p-2 rounded border">
                <p className="font-medium mb-1">Safari:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Go to Safari → Preferences → Websites</li>
                  <li>Click "Notifications" in the left sidebar</li>
                  <li>Find this site and change to "Allow"</li>
                </ol>
              </div>

              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="text-xs h-7 flex-1"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh Page
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Try to open browser settings (works in some browsers)
                    if ("chrome" in window) {
                      window.open("chrome://settings/content/notifications");
                    } else {
                      alert(
                        "Please manually open your browser settings and enable notifications for this site.",
                      );
                    }
                  }}
                  className="text-xs h-7 flex-1"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  Browser Settings
                </Button>
              </div>

              <p className="text-center italic mt-2">
                After enabling, refresh the page and try again!
              </p>
            </div>
          </div>
        )}

        {permissionStatus === "unsupported" && (
          <div className="text-xs text-gray-600 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-900/20 rounded border border-gray-200 dark:border-gray-800">
            Your browser doesn't support desktop notifications.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
