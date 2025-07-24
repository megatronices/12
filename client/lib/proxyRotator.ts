// Proxy rotation system for distributing API calls
export class ProxyRotator {
  private proxies: string[] = [
    '', // Direct connection (no proxy)
    'proxy1.example.com:8080',
    'proxy2.example.com:8080', 
    'proxy3.example.com:8080',
    'proxy4.example.com:8080',
    'proxy5.example.com:8080',
    // Add more proxies as needed
  ];
  
  private currentIndex = 0;
  private workerProxyMap = new Map<string, string>();

  // Assign a proxy to a worker for consistent routing
  assignProxyToWorker(workerId: string): string {
    if (this.workerProxyMap.has(workerId)) {
      return this.workerProxyMap.get(workerId)!;
    }

    const proxy = this.proxies[this.currentIndex % this.proxies.length];
    this.workerProxyMap.set(workerId, proxy);
    this.currentIndex++;
    
    console.log(`🔄 Assigned proxy ${proxy || 'direct'} to worker ${workerId}`);
    return proxy;
  }

  // Get proxy for a specific worker
  getProxyForWorker(workerId: string): string {
    return this.workerProxyMap.get(workerId) || '';
  }

  // Get proxy configuration for fetch requests
  getProxyConfig(workerId: string): RequestInit {
    const proxy = this.getProxyForWorker(workerId);
    
    if (!proxy) {
      return {}; // Direct connection
    }

    // For browser environment, we'll use different user agents instead of actual proxies
    // since browsers don't support HTTP proxies directly
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    ];

    const workerIndex = parseInt(workerId.split('-')[1] || '0');
    const userAgent = userAgents[workerIndex % userAgents.length];

    return {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    };
  }

  // Add delay based on worker ID to stagger requests
  getRequestDelay(workerId: string): number {
    const workerIndex = parseInt(workerId.split('-')[1] || '0');
    return workerIndex * 200; // 200ms delay per worker
  }

  // Get stats about proxy usage
  getStats() {
    return {
      totalProxies: this.proxies.length,
      assignedWorkers: this.workerProxyMap.size,
      assignments: Array.from(this.workerProxyMap.entries()).map(([worker, proxy]) => ({
        worker,
        proxy: proxy || 'direct'
      }))
    };
  }

  // Reset proxy assignments
  reset() {
    this.workerProxyMap.clear();
    this.currentIndex = 0;
  }
}

export const proxyRotator = new ProxyRotator();
