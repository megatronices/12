import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Send,
  MessageSquare,
  CheckCircle,
  XCircle,
  Settings,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  telegramService,
  TelegramSettings as TelegramSettingsType,
} from "../lib/telegramService";
import { cn } from "../lib/utils";

export function TelegramSettings() {
  const [settings, setSettings] = useState<TelegramSettingsType>(
    telegramService.getSettings(),
  );
  const [stats, setStats] = useState(telegramService.getStats());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
  const [showBotToken, setShowBotToken] = useState(false);
  const [showSetupInstructions, setShowSetupInstructions] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(telegramService.getStats());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const updateSetting = (key: keyof TelegramSettingsType, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    telegramService.updateSettings(newSettings);
    setStats(telegramService.getStats());
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);

    try {
      const result = await telegramService.testConnection();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const setupInstructions = `🤖 Telegram Bot Setup Instructions:

1. Message @BotFather on Telegram
2. Send /newbot
3. Choose a name: "YourName Signal Bot"
4. Choose a username: "yourname_signal_bot"
5. Copy the bot token from BotFather
6. Start a chat with your new bot
7. Send any message to your bot
8. Visit: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
9. Find your chat ID in the response
10. Paste both bot token and chat ID below`;

  const getStatusIcon = () => {
    if (!stats.configured) {
      return <Settings className="h-4 w-4 text-gray-600" />;
    }
    if (!settings.enabled) {
      return <XCircle className="h-4 w-4 text-red-600" />;
    }
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  };

  const getStatusText = () => {
    if (!stats.configured) return "Not configured";
    if (!settings.enabled) return "Disabled";
    return "Active";
  };

  const getStatusColor = () => {
    if (!stats.configured) return "text-gray-600 dark:text-gray-400";
    if (!settings.enabled) return "text-red-600 dark:text-red-400";
    return "text-green-600 dark:text-green-400";
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Telegram Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm font-medium">Status</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs", getStatusColor())}>
              {getStatusText()}
            </span>
            {stats.configured && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="text-xs h-7"
              >
                <Send className="h-3 w-3 mr-1" />
                {isTestingConnection ? "Testing..." : "Test"}
              </Button>
            )}
          </div>
        </div>

        {/* Setup Instructions */}
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSetupInstructions(!showSetupInstructions)}
            className="w-full justify-between text-xs"
          >
            <span>Setup Instructions</span>
            <ExternalLink className="h-3 w-3" />
          </Button>

          {showSetupInstructions && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <pre className="text-xs text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                {setupInstructions}
              </pre>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(setupInstructions)}
                className="mt-2 text-xs h-6"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Instructions
              </Button>
            </div>
          )}
        </div>

        {/* Configuration */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="bot-token" className="text-xs">
              Bot Token
            </Label>
            <div className="flex gap-2">
              <Input
                id="bot-token"
                type={showBotToken ? "text" : "password"}
                value={settings.botToken}
                onChange={(e) => updateSetting("botToken", e.target.value)}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBotToken(!showBotToken)}
                className="h-8 px-2"
              >
                {showBotToken ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chat-id" className="text-xs">
              Chat ID
            </Label>
            <Input
              id="chat-id"
              value={settings.chatId}
              onChange={(e) => updateSetting("chatId", e.target.value)}
              placeholder="123456789"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-600" />
            <Label htmlFor="telegram-enabled">Enable Alerts</Label>
          </div>
          <Switch
            id="telegram-enabled"
            checked={settings.enabled && stats.configured}
            onCheckedChange={(checked) => updateSetting("enabled", checked)}
            disabled={!stats.configured}
          />
        </div>

        {/* Options */}
        {settings.enabled && stats.configured && (
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Settings className="h-3 w-3" />
              <span>Alert Options</span>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="include-chart" className="text-xs">
                Include Price Chart Links
              </Label>
              <Switch
                id="include-chart"
                checked={settings.includePriceChart}
                onCheckedChange={(checked) =>
                  updateSetting("includePriceChart", checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="include-analysis" className="text-xs">
                Include Detailed Analysis
              </Label>
              <Switch
                id="include-analysis"
                checked={settings.includeDetailedAnalysis}
                onCheckedChange={(checked) =>
                  updateSetting("includeDetailedAnalysis", checked)
                }
              />
            </div>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <Alert
            className={cn(
              testResult.success
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
            )}
          >
            <AlertDescription
              className={cn(
                "text-xs",
                testResult.success
                  ? "text-green-700 dark:text-green-300"
                  : "text-red-700 dark:text-red-300",
              )}
            >
              {testResult.success
                ? "✅ Connection test successful! Check your Telegram for the test message."
                : `❌ Connection failed: ${testResult.error}`}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        {settings.enabled && stats.configured && (
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Recent Activity
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Tracked tokens: {stats.recentTokensCount}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => telegramService.clearRecentTokens()}
                className="h-6 px-2 text-xs"
              >
                Reset
              </Button>
            </div>
          </div>
        )}

        {/* Help */}
        {!stats.configured && (
          <div className="text-xs text-gray-600 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-900/20 rounded border border-gray-200 dark:border-gray-800">
            💡 Configure your Telegram bot to receive instant ultra-strong
            signal alerts with detailed analysis and trading links.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
