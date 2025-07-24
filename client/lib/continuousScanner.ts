import { workerPool } from './workerPool';
import { notificationService } from './notifications';
import { telegramService } from './telegramService';
import { getFallbackTokens } from './fallbackData';
import { TokenPair } from '@shared/types';

class ContinuousScanner {
  private isRunning = false;
  private scanIntervals: NodeJS.Timeout[] = [];
  private readonly SCAN_INTERVALS = [
    15000,  // 15 seconds
    20000,  // 20 seconds
    25000,  // 25 seconds
    30000,  // 30 seconds
    35000,  // 35 seconds
  ];
  
  private readonly ENDPOINTS = [
    'tokens/sol',
    'tokens/trending',
    'pairs/sol',
    'tokens/new',
    'tokens/gainers',
    'tokens/losers',
    'search/hotpairs',
    'pairs/trending',
    'tokens/volume',
    'pairs/volume',
    'tokens/marketcap/new',
    'tokens/marketcap/trending',
    'pairs/marketcap',
    'tokens/age/new',
    'tokens/liquidity/high',
    'pairs/liquidity',
    'tokens/pricechange/5m',
    'tokens/pricechange/1h',
    'pairs/pricechange',
    'tokens/volume/5m',
    'tokens/buys/trending',
    'pairs/buys',
    'tokens/sells/trending',
    'pairs/sells'
  ];

  private lastResults: Map<string, TokenPair[]> = new Map();
  private scanCounter = 0;
  private rateLimitHits = 0;
  private lastRateLimitTime: number | null = null;
  
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('🔄 Continuous scanner already running');
      return;
    }

    console.log('🚀 Starting continuous scanner with 120 workers');
    this.isRunning = true;
    
    // Initialize worker pool
    await workerPool.initialize();
    
    // Start multiple scanning loops with different intervals
    this.SCAN_INTERVALS.forEach((interval, index) => {
      const scanInterval = setInterval(() => {
        this.performScan(index);
      }, interval);
      
      this.scanIntervals.push(scanInterval);
      
      // Immediate first scan with staggered start times
      setTimeout(() => this.performScan(index), index * 1000);
    });

    // Additional continuous endpoint scanning
    this.startEndpointRotation();
    
    // High-frequency comprehensive scans
    this.startHighFrequencyScans();

    console.log(`🔥 Continuous scanner active: ${this.SCAN_INTERVALS.length} scan loops + endpoint rotation + high-frequency scans`);
  }

  private async performScan(scanIndex: number): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.scanCounter++;
      const workerStats = workerPool.getStats();
      
      console.log(`🔍 Scan #${this.scanCounter} (Loop ${scanIndex}): ${workerStats.busyWorkers}/${workerStats.totalWorkers} workers busy`);

      // Rotate between different scan types
      const scanType = this.scanCounter % 4;
      let tokens: TokenPair[] = [];

      switch (scanType) {
        case 0:
          // Comprehensive scan
          const comprehensiveData = await workerPool.fetchComprehensiveData();
          tokens = comprehensiveData.tokens;
          break;
          
        case 1:
          // Multiple endpoint scan
          const randomEndpoints = this.getRandomEndpoints(8);
          tokens = await workerPool.fetchMultipleEndpoints(randomEndpoints);
          break;
          
        case 2:
          // High-volume token scan
          const tokenData = await workerPool.execute('FETCH_TOKENS', { params: { limit: '500' } });
          tokens = tokenData.pairs || [];
          break;
          
        case 3:
          // Trending scan
          const trendingData = await workerPool.execute('FETCH_TRENDING');
          tokens = trendingData.pairs || [];
          break;
      }

      // Store results, use fallback if empty due to rate limits
      if (tokens.length === 0) {
        console.log('📋 Using fallback data due to API limits');
        tokens = getFallbackTokens();
      }

      this.lastResults.set(`scan-${scanIndex}`, tokens);

      // Process notifications for new signals
      await this.processNotifications(tokens);
      
    } catch (error) {
      console.warn(`⚠️ Scan #${this.scanCounter} (Loop ${scanIndex}) failed:`, error);
    }
  }

  private startEndpointRotation(): void {
    // Continuously rotate through all endpoints
    let endpointIndex = 0;
    
    const rotationInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      const endpoint = this.ENDPOINTS[endpointIndex];
      endpointIndex = (endpointIndex + 1) % this.ENDPOINTS.length;
      
      try {
        const data = await workerPool.execute('FETCH_SPECIFIC', { endpoint });
        if (data?.pairs && data.pairs.length > 0) {
          this.lastResults.set(`endpoint-${endpoint}`, data.pairs);
        } else {
          // Use fallback for this endpoint
          const fallbackData = getFallbackTokens();
          this.lastResults.set(`endpoint-${endpoint}`, fallbackData);
        }
      } catch (error) {
        console.warn(`⚠️ Endpoint ${endpoint} failed, using fallback:`, error);
        const fallbackData = getFallbackTokens();
        this.lastResults.set(`endpoint-${endpoint}`, fallbackData);
      }
    }, 10000); // Every 10 seconds to avoid rate limits
    
    this.scanIntervals.push(rotationInterval);
  }

  private startHighFrequencyScans(): void {
    // Regular trending scans every 30 seconds
    const trendingInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        // Quick trending check
        const trending = await workerPool.execute('FETCH_TRENDING');
        if (trending?.pairs) {
          await this.processNotifications(trending.pairs);
        }
      } catch (error) {
        console.warn('⚠️ Trending scan failed:', error);
      }
    }, 30000);
    
    this.scanIntervals.push(trendingInterval);

    // Batch endpoint scanning every 45 seconds
    const batchInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const batchEndpoints = this.getRandomEndpoints(6); // Reduced batch size
        const batchData = await workerPool.fetchMultipleEndpoints(batchEndpoints);
        await this.processNotifications(batchData);
      } catch (error) {
        console.warn('⚠️ Batch scan failed:', error);
      }
    }, 45000);
    
    this.scanIntervals.push(batchInterval);
  }

  private getRandomEndpoints(count: number): string[] {
    const shuffled = [...this.ENDPOINTS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private async processNotifications(tokens: TokenPair[]): Promise<void> {
    try {
      // Desktop notifications
      const newNotifications = await notificationService.checkAndNotifyNewSignals(tokens);
      
      // Telegram alerts for ultra-strong signals
      let telegramAlerts = 0;
      for (const token of tokens) {
        try {
          const sent = await telegramService.sendUltraStrongSignalAlert(token);
          if (sent) telegramAlerts++;
        } catch (error) {
          // Silent fail for telegram errors
        }
      }
      
      if (newNotifications > 0 || telegramAlerts > 0) {
        console.log(`📢 Sent ${newNotifications} desktop + ${telegramAlerts} Telegram alerts`);
      }
    } catch (error) {
      console.warn('⚠️ Notification processing failed:', error);
    }
  }

  stop(): void {
    if (!this.isRunning) return;
    
    console.log('🛑 Stopping continuous scanner');
    this.isRunning = false;
    
    this.scanIntervals.forEach(interval => clearInterval(interval));
    this.scanIntervals = [];
    this.lastResults.clear();
    
    console.log('✅ Continuous scanner stopped');
  }

  getStats() {
    const workerStats = workerPool.getStats();
    return {
      isRunning: this.isRunning,
      scanCounter: this.scanCounter,
      activeScans: this.scanIntervals.length,
      cachedResults: this.lastResults.size,
      workerStats,
    };
  }

  getAllTokens(): TokenPair[] {
    const allTokens: TokenPair[] = [];
    for (const tokens of this.lastResults.values()) {
      allTokens.push(...tokens);
    }
    
    // Deduplicate by pairAddress
    const uniqueTokens = allTokens.reduce((acc: TokenPair[], current: TokenPair) => {
      const isDuplicate = acc.some(token => token.pairAddress === current.pairAddress);
      if (!isDuplicate) {
        acc.push(current);
      }
      return acc;
    }, []);
    
    return uniqueTokens;
  }
}

export const continuousScanner = new ContinuousScanner();
