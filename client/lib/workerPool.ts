import { TokenPair } from "@shared/types";
import { WorkerMessage, WorkerResponse } from "../workers/tokenFetcher";

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

export class WorkerPool {
  private workers: PoolWorker[] = [];
  private pendingTasks: PendingTask[] = [];
  private taskQueue: PendingTask[] = [];
  private initialized = false;
  private readonly WORKER_COUNT = 20; // Use 20 workers for optimal performance
  private readonly TASK_TIMEOUT = 30000; // 30 second timeout

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
        resolve,
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

    return {
      tokens: uniqueTokens,
      trending,
      total: uniqueTokens.length,
    };
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
