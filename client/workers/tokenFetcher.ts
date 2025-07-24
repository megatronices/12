// Web Worker for fetching token data in parallel
import { TokenPair } from "@shared/types";

export interface WorkerMessage {
  id: string;
  type: "FETCH_TOKENS" | "FETCH_TRENDING" | "FETCH_SPECIFIC";
  payload: {
    endpoint?: string;
    params?: Record<string, any>;
    retryCount?: number;
  };
}

export interface WorkerResponse {
  id: string;
  type: "SUCCESS" | "ERROR";
  data?: {
    pairs: TokenPair[];
    total?: number;
    source?: string;
  };
  error?: string;
}

const API_BASE = "/api";

class TokenFetcher {
  private async fetchWithRetry(
    url: string,
    maxRetries: number = 3,
  ): Promise<Response> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          return response;
        }

        // If it's a server error (5xx), retry
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        // If it's a client error (4xx), don't retry
        throw new Error(`Client error: ${response.status}`);
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${attempt} failed:`, error);

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    throw lastError;
  }

  async fetchSolanaTokens(params: Record<string, any> = {}): Promise<any> {
    const queryParams = new URLSearchParams(params).toString();
    const url = `${API_BASE}/solana/tokens${queryParams ? `?${queryParams}` : ""}`;

    const response = await this.fetchWithRetry(url);
    return await response.json();
  }

  async fetchTrendingTokens(): Promise<any> {
    const url = `${API_BASE}/solana/trending`;
    const response = await this.fetchWithRetry(url);
    return await response.json();
  }

  async fetchSpecificEndpoint(endpoint: string): Promise<any> {
    const url = `${API_BASE}/dexscreener/${endpoint}`;
    const response = await this.fetchWithRetry(url);
    return await response.json();
  }
}

const fetcher = new TokenFetcher();

// Handle messages from main thread
self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    let data;
    let source = "";

    switch (type) {
      case "FETCH_TOKENS":
        data = await fetcher.fetchSolanaTokens(payload.params);
        source = "solana_tokens";
        break;

      case "FETCH_TRENDING":
        data = await fetcher.fetchTrendingTokens();
        source = "trending";
        break;

      case "FETCH_SPECIFIC":
        if (!payload.endpoint) {
          throw new Error("Endpoint is required for FETCH_SPECIFIC");
        }
        data = await fetcher.fetchSpecificEndpoint(payload.endpoint);
        source = payload.endpoint;
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    const response: WorkerResponse = {
      id,
      type: "SUCCESS",
      data: {
        ...data,
        source,
      },
    };

    self.postMessage(response);
  } catch (error) {
    console.error(`Worker ${id} error:`, error);

    const response: WorkerResponse = {
      id,
      type: "ERROR",
      error: error instanceof Error ? error.message : "Unknown error",
    };

    self.postMessage(response);
  }
});

// Signal that the worker is ready
self.postMessage({ type: "READY" });
