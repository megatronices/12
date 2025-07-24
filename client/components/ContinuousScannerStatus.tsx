import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Activity, Zap, Database, Clock, AlertTriangle } from "lucide-react";

interface ContinuousScannerStatusProps {
  stats: {
    isRunning: boolean;
    scanCounter: number;
    activeScans: number;
    cachedResults: number;
    rateLimitHits?: number;
    lastRateLimitTime?: number | null;
    workerStats: {
      totalWorkers: number;
      busyWorkers: number;
      pendingTasks: number;
      queuedTasks: number;
    };
  };
}

export function ContinuousScannerStatus({ stats }: ContinuousScannerStatusProps) {
  const utilizationPercentage = Math.round((stats.workerStats.busyWorkers / stats.workerStats.totalWorkers) * 100);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Continuous Scanner Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600 dark:text-slate-400">Status</span>
          <Badge 
            variant={stats.isRunning ? "default" : "secondary"}
            className={stats.isRunning ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : ""}
          >
            {stats.isRunning ? "ACTIVE" : "STOPPED"}
          </Badge>
        </div>

        {stats.isRunning && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Scans Completed
              </span>
              <span className="text-sm font-mono">{stats.scanCounter.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Active Scan Loops</span>
              <span className="text-sm font-mono">{stats.activeScans}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Database className="h-3 w-3" />
                Cached Results
              </span>
              <span className="text-sm font-mono">{stats.cachedResults}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Worker Utilization</span>
                <span className="text-sm font-mono">{utilizationPercentage}%</span>
              </div>
              
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${utilizationPercentage}%` }}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Busy:</span>
                  <span className="font-mono">{stats.workerStats.busyWorkers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total:</span>
                  <span className="font-mono">{stats.workerStats.totalWorkers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pending:</span>
                  <span className="font-mono">{stats.workerStats.pendingTasks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Queued:</span>
                  <span className="font-mono">{stats.workerStats.queuedTasks}</span>
                </div>
              </div>
            </div>

            {utilizationPercentage >= 80 && (
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <Zap className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-700 dark:text-green-300 font-medium">
                    High Performance: {utilizationPercentage}% worker utilization
                  </span>
                </div>
              </div>
            )}

            {utilizationPercentage < 50 && (
              <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-yellow-600" />
                  <span className="text-xs text-yellow-700 dark:text-yellow-300">
                    Workers available for more tasks
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
