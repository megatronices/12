import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Activity, Zap, Clock, AlertCircle } from "lucide-react";
import { getWorkerPoolStats } from "../lib/api";

interface WorkerStats {
  totalWorkers: number;
  busyWorkers: number;
  pendingTasks: number;
  queuedTasks: number;
}

export function WorkerStatus() {
  const [stats, setStats] = useState<WorkerStats>({
    totalWorkers: 0,
    busyWorkers: 0,
    pendingTasks: 0,
    queuedTasks: 0,
  });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateStats = () => {
      const newStats = getWorkerPoolStats();
      setStats(newStats);
      setIsVisible(newStats.totalWorkers > 0);
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  const utilizationPercent =
    stats.totalWorkers > 0 ? (stats.busyWorkers / stats.totalWorkers) * 100 : 0;

  const getUtilizationColor = () => {
    if (utilizationPercent > 80) return "text-red-600 dark:text-red-400";
    if (utilizationPercent > 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  const getUtilizationStatus = () => {
    if (utilizationPercent > 80) return "High Load";
    if (utilizationPercent > 60) return "Medium Load";
    if (utilizationPercent > 0) return "Active";
    return "Idle";
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Worker Pool Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600" />
            <span className="text-sm">Workers: {stats.totalWorkers}</span>
          </div>
          <Badge variant="outline" className={getUtilizationColor()}>
            {getUtilizationStatus()}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Utilization</span>
            <span>{utilizationPercent.toFixed(0)}%</span>
          </div>
          <Progress value={utilizationPercent} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span>Active: {stats.busyWorkers}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full" />
            <span>Idle: {stats.totalWorkers - stats.busyWorkers}</span>
          </div>
          {stats.pendingTasks > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-orange-500" />
              <span>Pending: {stats.pendingTasks}</span>
            </div>
          )}
          {stats.queuedTasks > 0 && (
            <div className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-red-500" />
              <span>Queued: {stats.queuedTasks}</span>
            </div>
          )}
        </div>

        {(stats.queuedTasks > 10 || utilizationPercent > 90) && (
          <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-2">
            <AlertCircle className="h-3 w-3" />
            High load detected - consider refreshing less frequently
          </div>
        )}
      </CardContent>
    </Card>
  );
}
