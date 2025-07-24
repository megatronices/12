import { TokenPair } from "@shared/types";
import { WorkerMessage, WorkerResponse } from "../workers/tokenFetcher";
import { proxyRotator } from "./proxyRotator";

interface PoolWorker {
  worker: Worker;
  busy: boolean;
  id: string;
}

interface PendingTask {
  id: string;
  message: WorkerMessage;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface CachedData {
  data: any;
  timestamp: number;
  expiry: number;
}

export class WorkerPool {
  private workers: PoolWorker[] = [];
  private pendingTasks: PendingTask[] = [];
  private taskQueue: PendingTask[] = [];
  private initialized = false;
  private readonly WORKER_COUNT = 15; // Reduced to avoid rate limits
  private readonly TASK_TIMEOUT = 15000; // 15 second timeout for faster failures
  private readonly CACHE_DURATION = 2 * 60 * 1000; // 2 minutes cache for high-frequency scanning
  private readonly CACHE_KEY_PREFIX = "bullish-scanner-cache-";

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log(`Initializing worker pool with ${this.WORKER_COUNT} workers`);

    const initPromises = [];

    for (let i = 0; i < this.WORKER_COUNT; i++) {
      const workerId = `worker-${i}`;
      initPromises.push(this.createWorker(workerId));
    }

    await Promise.all(initPromises);
    this.initialized = true;
    console.log(`Worker pool initialized with ${this.workers.length} workers`);
  }

  private async createWorker(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(
          new URL("../workers/tokenFetcher.ts", import.meta.url),
          { type: "module" },
        );

        const poolWorker: PoolWorker = {
          worker,
          busy: false,
          id,
        };

        worker.addEventListener("message", (event) => {
          const response = event.data;

          if (response.type === "READY") {
            resolve();
            return;
          }

          this.handleWorkerResponse(poolWorker, response as WorkerResponse);
        });

        worker.addEventListener("error", (error) => {
          console.error(`Worker ${id} error:`, error);
          this.handleWorkerError(poolWorker, error);
        });

        this.workers.push(poolWorker);
      } catch (error) {
        console.error(`Failed to create worker ${id}:`, error);
        reject(error);
      }
    });
  }

  private handleWorkerResponse(worker: PoolWorker, response: WorkerResponse) {
    worker.busy = false;

    const taskIndex = this.pendingTasks.findIndex(
      (task) => task.id === response.id,
    );

    if (taskIndex === -1) {
      console.warn(`No pending task found for response ${response.id}`);
      this.processQueue();
      return;
    }

    const task = this.pendingTasks[taskIndex];
    this.pendingTasks.splice(taskIndex, 1);

    clearTimeout(task.timeout);

    if (response.type === "SUCCESS") {
      task.resolve(response.data);
    } else {
      task.reject(new Error(response.error || "Worker task failed"));
    }

    this.processQueue();
  }

  private handleWorkerError(worker: PoolWorker, error: ErrorEvent) {
    worker.busy = false;

    // Find and reject any pending tasks for this worker
    const failedTasks = this.pendingTasks.filter((task) =>
      task.message.id.startsWith(worker.id),
    );

    failedTasks.forEach((task) => {
      const index = this.pendingTasks.indexOf(task);
      if (index > -1) {
        this.pendingTasks.splice(index, 1);
        clearTimeout(task.timeout);
        task.reject(new Error(`Worker ${worker.id} error: ${error.message}`));
      }
    });

    this.processQueue();
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;

    const availableWorker = this.workers.find((w) => !w.busy);
    if (!availableWorker) return;

    const task = this.taskQueue.shift();
    if (!task) return;

    this.executeTask(availableWorker, task);
  }

  private executeTask(worker: PoolWorker, task: PendingTask) {
    worker.busy = true;
    this.pendingTasks.push(task);

    // Set up timeout
    task.timeout = setTimeout(() => {
      const index = this.pendingTasks.indexOf(task);
      if (index > -1) {
        this.pendingTasks.splice(index, 1);
        worker.busy = false;
        task.reject(new Error(`Task ${task.id} timed out`));
        this.processQueue();
      }
    }, this.TASK_TIMEOUT);

    worker.worker.postMessage(task.message);
  }

  async execute<T = any>(
    type: WorkerMessage["type"],
    payload: WorkerMessage["payload"] = {},
  ): Promise<T> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Clear expired cache entries periodically
    this.clearExpiredCache();

    // Check cache first
    const cacheKey = this.getCacheKey(type, payload);
    const cachedResult = this.getCachedData(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const message: WorkerMessage = {
      id: taskId,
      type,
      payload,
    };

    return new Promise<T>((resolve, reject) => {
      const task: PendingTask = {
        id: taskId,
        message,
        resolve: (data: T) => {
          // Cache the result before resolving
          this.setCachedData(cacheKey, data);
          resolve(data);
        },
        reject,
        timeout: null as any,
      };

      const availableWorker = this.workers.find((w) => !w.busy);

      if (availableWorker) {
        this.executeTask(availableWorker, task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  async fetchMultipleEndpoints(endpoints: string[]): Promise<TokenPair[]> {
    // Check cache for the combined endpoints query
    const cacheKey = this.getCacheKey("FETCH_MULTIPLE", { endpoints });
    const cachedResult = this.getCachedData(cacheKey);

    if (cachedResult) {
      console.log(`📦 Using cached data for ${endpoints.length} endpoints`);
      return cachedResult;
    }

    const promises = endpoints.map((endpoint) =>
      this.execute("FETCH_SPECIFIC", { endpoint }),
    );

    try {
      const results = await Promise.allSettled(promises);
      const allPairs: TokenPair[] = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const data = result.value;
          if (data.pairs) {
            allPairs.push(...data.pairs);
          }
        } else {
          console.warn(
            `Failed to fetch endpoint ${endpoints[index]}:`,
            result.reason,
          );
        }
      });

      // Remove duplicates based on pairAddress
      const uniquePairs = allPairs.reduce(
        (acc: TokenPair[], current: TokenPair) => {
          const isDuplicate = acc.some(
            (pair) => pair.pairAddress === current.pairAddress,
          );
          if (!isDuplicate) {
            acc.push(current);
          }
          return acc;
        },
        [],
      );

      // Cache the result
      this.setCachedData(cacheKey, uniquePairs);
      console.log(
        `💾 Cached ${uniquePairs.length} tokens from ${endpoints.length} endpoints`,
      );

      return uniquePairs;
    } catch (error) {
      console.error("Error fetching multiple endpoints:", error);
      throw error;
    }
  }

  async fetchComprehensiveData(): Promise<{
    tokens: TokenPair[];
    trending: TokenPair[];
    total: number;
  }> {
    // Check cache for comprehensive data
    const cacheKey = this.getCacheKey("FETCH_COMPREHENSIVE", {});
    const cachedResult = this.getCachedData(cacheKey);

    if (cachedResult) {
      console.log(
        `📦 Using cached comprehensive data (${cachedResult.total} tokens)`,
      );
      return cachedResult;
    }

    const [tokensResult, trendingResult] = await Promise.allSettled([
      this.execute("FETCH_TOKENS", { params: { limit: "200" } }),
      this.execute("FETCH_TRENDING"),
    ]);

    let tokens: TokenPair[] = [];
    let trending: TokenPair[] = [];

    if (tokensResult.status === "fulfilled") {
      tokens = tokensResult.value.pairs || [];
    }

    if (trendingResult.status === "fulfilled") {
      trending = trendingResult.value.pairs || [];
    }

    // Combine and deduplicate
    const allTokens = [...tokens, ...trending];
    const uniqueTokens = allTokens.reduce(
      (acc: TokenPair[], current: TokenPair) => {
        const isDuplicate = acc.some(
          (pair) => pair.pairAddress === current.pairAddress,
        );
        if (!isDuplicate) {
          acc.push(current);
        }
        return acc;
      },
      [],
    );

    const result = {
      tokens: uniqueTokens,
      trending,
      total: uniqueTokens.length,
    };

    // Cache the comprehensive result
    this.setCachedData(cacheKey, result);
    console.log(
      `💾 Cached comprehensive data (${result.total} tokens) for 35 minutes`,
    );

    return result;
  }

  terminate() {
    this.workers.forEach((worker) => {
      worker.worker.terminate();
    });
    this.workers = [];
    this.pendingTasks.forEach((task) => {
      clearTimeout(task.timeout);
      task.reject(new Error("Worker pool terminated"));
    });
    this.pendingTasks = [];
    this.taskQueue = [];
    this.initialized = false;
  }

  private getCacheKey(type: string, payload: any = {}): string {
    return `${this.CACHE_KEY_PREFIX}${type}-${JSON.stringify(payload)}`;
  }

  private getCachedData(key: string): any | null {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const parsedCache: CachedData = JSON.parse(cached);

      if (Date.now() > parsedCache.expiry) {
        localStorage.removeItem(key);
        return null;
      }

      console.log(
        `📦 Cache hit for ${key} (${Math.round((parsedCache.expiry - Date.now()) / (60 * 1000))}m remaining)`,
      );
      return parsedCache.data;
    } catch (error) {
      console.warn("Cache read error:", error);
      return null;
    }
  }

  private setCachedData(key: string, data: any): void {
    try {
      const cached: CachedData = {
        data,
        timestamp: Date.now(),
        expiry: Date.now() + this.CACHE_DURATION,
      };

      localStorage.setItem(key, JSON.stringify(cached));
      console.log(
        `💾 Data cached for ${key} (expires in ${this.CACHE_DURATION / (60 * 1000)}m)`,
      );
    } catch (error) {
      console.warn("Cache write error:", error);
    }
  }

  private clearExpiredCache(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_KEY_PREFIX)) {
          try {
            const cached = localStorage.getItem(key);
            if (cached) {
              const parsedCache: CachedData = JSON.parse(cached);
              if (Date.now() > parsedCache.expiry) {
                keysToRemove.push(key);
              }
            }
          } catch (error) {
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
      if (keysToRemove.length > 0) {
        console.log(`🧹 Cleared ${keysToRemove.length} expired cache entries`);
      }
    } catch (error) {
      console.warn("Cache cleanup error:", error);
    }
  }

  getStats() {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      pendingTasks: this.pendingTasks.length,
      queuedTasks: this.taskQueue.length,
    };
  }
}

// Singleton instance
export const workerPool = new WorkerPool();
