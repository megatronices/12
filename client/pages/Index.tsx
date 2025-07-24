import { useEffect, useState, useCallback } from "react";
import { TokenPair, TokenFilter } from "@shared/types";
import {
  fetchSolanaTokens,
  fetchMultipleDataSources,
  filterTokens,
  calculateBuyPressure,
  hasMAAlert,
  generateJupiterUrl,
  formatPrice,
  formatVolume,
  formatPercentage,
  getWorkerPoolStats,
} from "../lib/api";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  RefreshCw,
  TrendingUp,
  ExternalLink,
  AlertTriangle,
  Activity,
  Zap,
  Bell,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "../lib/utils";
import { WorkerStatus } from "../components/WorkerStatus";
import { NotificationSettings } from "../components/NotificationSettings";
import { TelegramSettings } from "../components/TelegramSettings";
import { notificationService } from "../lib/notifications";
import { telegramService } from "../lib/telegramService";
import { continuousScanner } from "../lib/continuousScanner";

export default function Index() {
  const [tokens, setTokens] = useState<TokenPair[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<TokenPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<string>("priceChange5m");
  const [workerStats, setWorkerStats] = useState({
    totalWorkers: 0,
    busyWorkers: 0,
    pendingTasks: 0,
    queuedTasks: 0,
  });
  const [fetchMode, setFetchMode] = useState<"standard" | "comprehensive">(
    "comprehensive",
  );
  const [notificationsSent, setNotificationsSent] = useState(0);
  const [activeTab, setActiveTab] = useState<"scanner" | "heatmap">("scanner");
  const [telegramStats, setTelegramStats] = useState(
    telegramService.getStats(),
  );
  const [scannerStats, setScannerStats] = useState(continuousScanner.getStats());
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(true);
  const [showCriteria, setShowCriteria] = useState(false);
  const [filters, setFilters] = useState<TokenFilter>({
    minVolume5m: 0, // Remove volume restriction
    minBuyPressure: 0, // Remove buy pressure restriction (handled by MA filter)
    maxAge: 0, // Remove age restriction
    minLiquidity: 0, // Remove liquidity restriction
    onlyWithMA: true, // Only show bullish crossover signals
  });

  const loadTokens = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Update stats
      setWorkerStats(getWorkerPoolStats());
      setScannerStats(continuousScanner.getStats());

      // If continuous scanner is running, get tokens from it
      let data: TokenPair[];
      if (isAutoScanEnabled && scannerStats.isRunning) {
        data = continuousScanner.getAllTokens();
        console.log(`Loaded ${data.length} tokens from continuous scanner`);
      } else {
        // Fallback to manual fetch
        data = fetchMode === "comprehensive"
          ? await fetchMultipleDataSources()
          : await fetchSolanaTokens();
        console.log(`Loaded ${data.length} tokens using ${fetchMode} mode`);
      }

      setTokens(data);
      setLastUpdate(new Date());

      // Update stats after fetch
      setWorkerStats(getWorkerPoolStats());
      setScannerStats(continuousScanner.getStats());
    } catch (err) {
      console.error("Error loading tokens:", err);
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, [fetchMode, isAutoScanEnabled, scannerStats.isRunning]);

  useEffect(() => {
    // Start continuous scanner on mount
    if (isAutoScanEnabled) {
      continuousScanner.start().then(() => {
        console.log('🚀 Continuous scanner started automatically');
      });
    }

    loadTokens();

    // More aggressive refresh - every 5 seconds when continuous scanner is active
    const refreshInterval = isAutoScanEnabled ? 5000 : 15000;
    const interval = setInterval(loadTokens, refreshInterval);

    // Update all stats every 2 seconds for real-time monitoring
    const statsInterval = setInterval(() => {
      setWorkerStats(getWorkerPoolStats());
      setTelegramStats(telegramService.getStats());
      setScannerStats(continuousScanner.getStats());
    }, 2000);

    return () => {
      clearInterval(interval);
      clearInterval(statsInterval);
    };
  }, [loadTokens, isAutoScanEnabled]);

  // Handle auto-scan toggle
  const toggleAutoScan = useCallback(async () => {
    if (isAutoScanEnabled) {
      continuousScanner.stop();
      setIsAutoScanEnabled(false);
      console.log('�� Continuous scanning stopped');
    } else {
      await continuousScanner.start();
      setIsAutoScanEnabled(true);
      console.log('🚀 Continuous scanning started');
    }
  }, [isAutoScanEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      continuousScanner.stop();
    };
  }, []);

  useEffect(() => {
    let filtered = filterTokens(tokens, filters);

    // Sort tokens
    filtered = filtered.sort((a, b) => {
      switch (sortBy) {
        case "buyPressure":
          return calculateBuyPressure(b) - calculateBuyPressure(a);
        case "volume5m":
          return (b.volume?.m5 || 0) - (a.volume?.m5 || 0);
        case "priceChange5m":
          return (b.priceChange?.m5 || 0) - (a.priceChange?.m5 || 0);
        case "liquidity":
          return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
        default:
          return 0;
      }
    });

    setFilteredTokens(filtered);
  }, [tokens, filters, sortBy]);

  const updateFilter = (key: keyof TokenFilter, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="border-b bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-green-600" />
                Practical Signal Scanner
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Actionable bullish signals - 2%+ momentum, 55%+ buy pressure,
                technical confirmation (6-month history)
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Activity className="h-4 w-4" />
                <span>{workerStats.totalWorkers} workers</span>
                <span className="text-blue-600 dark:text-blue-400">
                  {workerStats.busyWorkers} active
                </span>
                {scannerStats.isRunning && (
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    AUTO-SCAN #{scannerStats.scanCounter}
                  </span>
                )}
                {workerStats.queuedTasks > 0 && (
                  <span className="text-orange-600">
                    {workerStats.queuedTasks} queued
                  </span>
                )}
                {notificationsSent > 0 && (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Bell className="h-3 w-3" />
                    {notificationsSent} alerts
                  </span>
                )}
                {telegramStats.enabled && telegramStats.configured && (
                  <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Telegram
                  </span>
                )}
              </div>
              {lastUpdate && (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Last update: {lastUpdate.toLocaleTimeString()}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={toggleAutoScan}
                  variant={isAutoScanEnabled ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "gap-2",
                    isAutoScanEnabled && "bg-green-600 hover:bg-green-700 text-white"
                  )}
                >
                  <Activity className={cn(
                    "h-4 w-4",
                    isAutoScanEnabled && "animate-pulse"
                  )} />
                  {isAutoScanEnabled ? "AUTO-SCAN ON" : "START AUTO-SCAN"}
                </Button>
                <Button
                  onClick={() =>
                    setFetchMode(
                      fetchMode === "standard" ? "comprehensive" : "standard",
                    )
                  }
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Zap className="h-4 w-4" />
                  {fetchMode === "comprehensive" ? "Comprehensive" : "Standard"}
                </Button>
                <Button
                  onClick={loadTokens}
                  disabled={loading}
                  size="sm"
                  className="gap-2"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", loading && "animate-spin")}
                  />
                  Manual Refresh
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setShowCriteria(!showCriteria)}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-red-600" />
                        <span className="font-medium text-green-800 dark:text-green-200 text-sm">
                          PRACTICAL SIGNAL MODE
                        </span>
                      </div>
                      {showCriteria ? (
                        <ChevronUp className="h-4 w-4 text-red-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-red-600" />
                      )}
                    </div>

                    {showCriteria && (
                      <div className="mt-3">
                        <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                          PRACTICAL criteria - actionable trading signals:
                        </p>
                        <ul className="text-xs text-green-600 dark:text-green-400 space-y-1">
                          <li>✅ Core: Strong momentum (≥2% in 5m)</li>
                          <li>✅ Core: Good buy pressure (≥55%)</li>
                          <li>✅ Core: Positive trend direction</li>
                          <li>
                            • Supporting: Volume increase or decent volume
                          </li>
                          <li>• Supporting: No market cap limits</li>
                          <li>• Supporting: MACD crossover signal</li>
                          <li>• Supporting: Technical MA signals</li>
                          <li>• Need: 3+ supporting conditions</li>
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div>
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        MA Crossover Filter
                      </span>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Active - only bullish signals shown
                      </p>
                    </div>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                      ON
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label>Sort By</Label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priceChange5m">
                        5m Price Change (Best First)
                      </SelectItem>
                      <SelectItem value="buyPressure">Buy Pressure</SelectItem>
                      <SelectItem value="volume5m">5m Volume</SelectItem>
                      <SelectItem value="liquidity">Liquidity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <WorkerStatus />

            <NotificationSettings />

            <TelegramSettings />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {error && (
              <Card className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-5 w-5" />
                    {error}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    Token Results ({filteredTokens.length})
                    <Badge
                      variant={
                        fetchMode === "comprehensive" ? "default" : "secondary"
                      }
                      className="text-xs"
                    >
                      {fetchMode} mode
                    </Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {workerStats.busyWorkers > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs animate-pulse"
                      >
                        <Activity className="h-3 w-3 mr-1" />
                        Fetching...
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-sm">
                      {loading ? "Loading..." : "Live"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading && tokens.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>5m Change</TableHead>
                        <TableHead>Buy Pressure</TableHead>
                        <TableHead>Market Cap</TableHead>
                        <TableHead>5m Volume</TableHead>
                        <TableHead>Signals</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTokens.slice(0, 50).map((token) => {
                        const buyPressure = calculateBuyPressure(token);
                        const hasMA = hasMAAlert(token);
                        const priceChange5m = token.priceChange?.m5 || 0;

                        return (
                          <TableRow key={token.pairAddress}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {token.info?.imageUrl && (
                                  <img
                                    src={token.info.imageUrl}
                                    alt={token.baseToken.symbol}
                                    className="w-8 h-8 rounded-full"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                )}
                                <div>
                                  <div className="font-medium">
                                    {token.baseToken.symbol}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate max-w-[100px]">
                                    {token.baseToken.address.slice(0, 8)}...
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-mono text-sm">
                                ${formatPrice(token.priceUsd)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  priceChange5m >= 0 ? "default" : "destructive"
                                }
                                className={cn(
                                  priceChange5m >= 0
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
                                )}
                              >
                                {formatPercentage(priceChange5m)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "w-2 h-2 rounded-full",
                                    buyPressure >= 70
                                      ? "bg-green-500"
                                      : buyPressure >= 50
                                        ? "bg-yellow-500"
                                        : "bg-red-500",
                                  )}
                                />
                                <span className="font-mono text-sm">
                                  {buyPressure.toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-sm">
                                {formatVolume(token.marketCap || 0)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-sm">
                                {formatVolume(token.volume?.m5 || 0)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs">
                                  MA Conv
                                </Badge>
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 text-xs">
                                  Bullish
                                </Badge>
                                {buyPressure >= 70 && (
                                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 text-xs">
                                    Strong
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={() =>
                                  window.open(
                                    generateJupiterUrl(token.baseToken.address),
                                    "_blank",
                                  )
                                }
                              >
                                <ExternalLink className="h-3 w-3" />
                                Trade
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
