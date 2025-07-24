import { DexScreenerResponse, TokenPair, TokenFilter } from "@shared/types";
import { workerPool } from "./workerPool";

export async function fetchSolanaTokens(): Promise<TokenPair[]> {
  try {
    console.log("Starting comprehensive token data fetch with worker pool...");
    const stats = workerPool.getStats();
    console.log("Worker pool stats:", stats);

    const result = await workerPool.fetchComprehensiveData();
    console.log(
      `Fetched ${result.tokens.length} total tokens, ${result.trending.length} trending`,
    );

    // Sort by 24h volume for better initial display
    return result.tokens
      .filter((pair) => pair.chainId === "solana")
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
  } catch (error) {
    console.error("Error fetching tokens with worker pool:", error);
    // Fallback to direct API call if workers fail
    return await fetchSolanaTokensFallback();
  }
}

async function fetchSolanaTokensFallback(): Promise<TokenPair[]> {
  try {
    console.log("Using fallback API call...");
    const response = await fetch("/api/solana/tokens");
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.pairs || [];
  } catch (error) {
    console.error("Fallback API call failed:", error);
    throw error;
  }
}

export async function fetchTrendingTokens(): Promise<TokenPair[]> {
  try {
    const result = await workerPool.execute("FETCH_TRENDING");
    return result.pairs || [];
  } catch (error) {
    console.error("Error fetching trending tokens:", error);
    // Fallback
    const response = await fetch("/api/solana/trending");
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();
    return data.pairs || [];
  }
}

export async function fetchMultipleDataSources(): Promise<TokenPair[]> {
  try {
    // Use multiple workers to fetch different data sources in parallel
    const endpoints = [
      "latest/dex/search?q=SOL",
      "latest/dex/search?q=USDC",
      "latest/dex/search?q=pump",
      "latest/dex/search?q=raydium",
      "latest/dex/search?q=bonk",
    ];

    console.log(
      `Fetching from ${endpoints.length} different sources using worker pool...`,
    );

    const result = await workerPool.fetchMultipleEndpoints(endpoints);

    console.log(`Combined ${result.length} unique pairs from all sources`);

    // Filter and sort specifically for bullish signals
    return result
      .filter((pair) => {
        if (pair.chainId !== "solana") return false;

        // Pre-filter for ultra-strong signals ONLY
        const buys5m = pair.txns?.m5?.buys || 0;
        const sells5m = pair.txns?.m5?.sells || 0;
        const total = buys5m + sells5m;
        const buyPressure = total > 0 ? (buys5m / total) * 100 : 0;
        const priceChange5m = pair.priceChange?.m5 || 0;

        // Much more selective pre-filtering for ultra-strong signals
        return (
          total > 10 && // Meaningful transaction volume
          buyPressure >= 60 && // Strong buy pressure
          priceChange5m >= 3
        ); // Significant price movement
      })
      .sort((a, b) => {
        // Sort by 5m price change first (best momentum first)
        const aChange = a.priceChange?.m5 || 0;
        const bChange = b.priceChange?.m5 || 0;
        return bChange - aChange;
      });
  } catch (error) {
    console.error("Error fetching from multiple sources:", error);
    throw error;
  }
}

export function calculateBuyPressure(pair: TokenPair): number {
  const buys5m = pair.txns?.m5?.buys || 0;
  const sells5m = pair.txns?.m5?.sells || 0;
  const total = buys5m + sells5m;

  if (total === 0) return 0;
  return (buys5m / total) * 100;
}

export function hasMAAlert(pair: TokenPair): boolean {
  // Enhanced bullish crossover detection with MA 9 and MA 14 convergence
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const priceChange6h = pair.priceChange?.h6 || 0;

  // Calculate simulated MA convergence based on available price data
  // Using price changes as proxy for MA behavior on 5-minute timeframe
  const hasMAConvergence = checkUltraStrongMAConvergence(pair);

  // Strong bullish crossover conditions:
  // 1. 5m change is significantly positive (>2%)
  // 2. 5m change outperforms 1h and 6h trends
  // 3. Volume is increasing (5m volume vs 1h average)
  // 4. Strong buy pressure (>60%)
  // 5. Market cap under $500k for early opportunities
  // 6. MA 9 and MA 14 convergence indicating bullish momentum

  const volumeIncrease = (pair.volume?.m5 || 0) > (pair.volume?.h1 || 0) / 12;
  const buyPressure = calculateBuyPressure(pair);
  const marketCap = pair.marketCap || 0;

  // ULTRA-STRONG BULLISH SIGNAL DETECTION ONLY
  const priceChange24h = pair.priceChange?.h24 || 0;

  // EXTREMELY SELECTIVE CRITERIA FOR STRONGEST BULLISH SIGNALS ONLY:

  // 1. STRONG 5-minute momentum (reduced to 2% for more results)
  const strongMomentum = priceChange5m >= 2;

  // 2. GOOD buy pressure (reduced to 55% for more opportunities)
  const goodBuyPressure = buyPressure >= 55;

  // 3. CONSISTENT trend across ALL timeframes (all positive)
  const consistentBullTrend =
    priceChange5m > 0 && priceChange1h > 0 && priceChange6h > 0;

  // 4. ACCELERATING momentum (5m >> 1h >> 6h)
  const acceleratingMomentum =
    priceChange5m > priceChange1h * 2 && priceChange1h > priceChange6h * 1.5;

  // 5. VOLUME support (more lenient volume requirement)
  const volumeSupport =
    (pair.volume?.m5 || 0) > (pair.volume?.h1 || 0) / 15 || // 4x normal (more lenient)
    (pair.volume?.m5 || 0) > 2000; // OR just decent volume

  // 6. MARKET conditions (more flexible)
  const ageInDays = (Date.now() / 1000 - pair.pairCreatedAt) / (24 * 60 * 60);
  const marketConditions =
    marketCap < 1000000 && // Increased to $1M cap
    (pair.volume?.m5 || 0) > 1000 && // Reduced volume requirement
    ageInDays <= 180;

  // 7. ULTRA-STRONG MA convergence
  const ultraStrongMA = checkUltraStrongMAConvergence(pair);

  // 8. MACD BULLISH CROSSOVER on 5-minute timeframe
  const macdData = calculateMACDCrossover(pair);
  const macdBullishCrossover = macdData.hasBullishCrossover;

  // 9. BREAKOUT confirmation - outperforming significantly
  const breakoutConfirmation =
    priceChange5m > Math.max(priceChange1h, priceChange6h) + 3;

  // PRACTICAL APPROACH: Core conditions + supporting conditions
  const coreConditions = strongMomentum && goodBuyPressure && priceChange5m > 0;

  // Count supporting conditions (need at least 3 of 6)
  const supportingConditions = [
    consistentBullTrend,
    acceleratingMomentum,
    volumeSupport,
    marketConditions,
    ultraStrongMA,
    macdBullishCrossover,
  ].filter(Boolean).length;

  const result = coreConditions && supportingConditions >= 3;

  // Enhanced logging for debugging
  if (strongMomentum && buyPressure >= 50) {
    console.log(`📊 PRACTICAL SIGNAL Analysis for ${pair.baseToken.symbol}:`, {
      priceChange5m: priceChange5m.toFixed(2) + "%",
      buyPressure: buyPressure.toFixed(1) + "%",
      marketCap,
      volume5m: pair.volume?.m5,
      tokenAge: `${ageInDays.toFixed(1)} days old`,
      coreConditions: `${coreConditions} (needs: momentum + buy pressure + positive)`,
      supportingScore: `${supportingConditions}/6 (needs ≥3)`,
      checks: {
        strongMomentum: `${strongMomentum} (${priceChange5m.toFixed(2)}% ≥ 2%)`,
        goodBuyPressure: `${goodBuyPressure} (${buyPressure.toFixed(1)}% ≥ 55%)`,
        consistentBullTrend: `${consistentBullTrend}`,
        acceleratingMomentum: `${acceleratingMomentum}`,
        volumeSupport: `${volumeSupport}`,
        marketConditions: `${marketConditions} (MCap: ${marketCap})`,
        ultraStrongMA: `${ultraStrongMA}`,
        macdBullishCrossover: `${macdBullishCrossover}`,
      },
      FINAL_RESULT: result
        ? "✅ SIGNAL FOUND!"
        : "❌ Need more supporting conditions",
    });
  }

  return result;
}

function calculateMACDCrossover(pair: TokenPair): {
  hasBullishCrossover: boolean;
  macdLine: number;
  signalLine: number;
  histogram: number;
} {
  // Simulate MACD calculation using available price change data
  // MACD = 12-period EMA - 26-period EMA
  // Signal = 9-period EMA of MACD
  // We'll approximate using different timeframes as periods

  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const priceChange6h = pair.priceChange?.h6 || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;

  // Simulate 12-period EMA (fast line) using 5m and 1h data
  const fastEMA = priceChange5m * 0.8 + priceChange1h * 0.2;

  // Simulate 26-period EMA (slow line) using 1h, 6h, and 24h data
  const slowEMA =
    priceChange1h * 0.5 + priceChange6h * 0.3 + priceChange24h * 0.2;

  // MACD Line = Fast EMA - Slow EMA
  const macdLine = fastEMA - slowEMA;

  // Signal Line (9-period EMA of MACD) - approximate using weighted average
  const signalLine = macdLine * 0.6 + (priceChange1h - priceChange6h) * 0.4;

  // Histogram = MACD - Signal
  const histogram = macdLine - signalLine;

  // Bullish crossover conditions:
  // 1. MACD line is above signal line (positive histogram)
  // 2. MACD line is positive (above zero line)
  // 3. Recent momentum supports the crossover (5m change positive)
  // 4. Histogram is increasing (approximated by checking if MACD > Signal significantly)

  const hasBullishCrossover =
    histogram > 0 && // MACD above signal
    macdLine > 0 && // MACD above zero line
    priceChange5m > 0.5 && // Recent bullish momentum
    histogram > 0.2; // Strong separation between MACD and signal

  return {
    hasBullishCrossover,
    macdLine,
    signalLine,
    histogram,
  };
}

function checkBasicMASignal(pair: TokenPair): boolean {
  // Simple MA signal - just needs positive momentum trend
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;

  // Basic bullish signal: 5m positive and outperforming 1h
  return priceChange5m > 0.5 && priceChange5m > priceChange1h * 0.2;
}

function checkUltraStrongMAConvergence(pair: TokenPair): boolean {
  // ULTRA-STRONG MA CONVERGENCE - ONLY THE STRONGEST SIGNALS
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const priceChange6h = pair.priceChange?.h6 || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;

  // Ultra-strong momentum calculations
  const shortTermMomentum = priceChange5m * 0.8 + priceChange1h * 0.2;
  const mediumTermMomentum = priceChange1h * 0.7 + priceChange6h * 0.3;

  // EXTREME CONDITIONS FOR ULTRA-STRONG MA CONVERGENCE:

  // 1. BOTH momentum indicators must be STRONGLY positive
  const strongPositiveMomentum =
    shortTermMomentum > 3 && mediumTermMomentum > 1;

  // 2. SHORT-TERM momentum SIGNIFICANTLY outperforms medium-term (acceleration)
  const strongAcceleration = shortTermMomentum > mediumTermMomentum * 2;

  // 3. RECENT explosive movement
  const explosiveRecent = priceChange5m > 4;

  // 4. VOLUME explosion - massive spike
  const volume5m = pair.volume?.m5 || 0;
  const volume1h = pair.volume?.h1 || 0;
  const volumeExplosion = volume5m > volume1h / 4; // 15x normal 5-minute volume

  // 5. SUSTAINED momentum across timeframes
  const sustainedMomentum = priceChange1h > 1 && priceChange6h > 0.5;

  // 6. BREAKOUT momentum - outperforming all previous periods
  const breakoutMomentum =
    priceChange5m >
    Math.max(
      priceChange1h * 12, // 5m should be 12x the 1h rate
      priceChange6h * 72, // 5m should be 72x the 6h rate
      2, // Minimum 2% regardless
    );

  // ALL CONDITIONS MUST BE MET
  const result =
    strongPositiveMomentum &&
    strongAcceleration &&
    explosiveRecent &&
    volumeExplosion &&
    sustainedMomentum &&
    breakoutMomentum;

  // Debug logging for strong MA candidates
  if (explosiveRecent && volumeExplosion) {
    console.log(`🎯 ULTRA-STRONG MA Analysis for ${pair.baseToken.symbol}:`, {
      shortTermMomentum: shortTermMomentum.toFixed(2),
      mediumTermMomentum: mediumTermMomentum.toFixed(2),
      volume5m,
      volume1h,
      maChecks: {
        strongPositiveMomentum,
        strongAcceleration,
        explosiveRecent,
        volumeExplosion,
        sustainedMomentum,
        breakoutMomentum,
      },
      MA_RESULT: result ? "✅ ULTRA-STRONG MA!" : "❌ MA not strong enough",
    });
  }

  return result;
}

export function filterTokens(
  tokens: TokenPair[],
  filters: TokenFilter,
): TokenPair[] {
  console.log(
    `🔍 Filtering ${tokens.length} tokens with MA filter: ${filters.onlyWithMA}`,
  );

  const filtered = tokens.filter((token) => {
    // Since we're in bullish crossover mode, ONLY apply the MA filter
    // All other restrictions are removed per user request

    // The main filter: only show bullish crossover signals
    if (filters.onlyWithMA && !hasMAAlert(token)) {
      return false;
    }

    // All other filters are ignored - no volume, buy pressure, age, or liquidity restrictions
    return true;
  });

  console.log(`✅ Found ${filtered.length} tokens after filtering`);
  return filtered;
}

export function generateJupiterUrl(tokenAddress: string): string {
  return `https://jup.ag/tokens/${tokenAddress}`;
}

export function formatPrice(price: string | number): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(num)) return "0";

  if (num < 0.000001) {
    return num.toExponential(2);
  }
  if (num < 0.01) {
    return num.toFixed(6);
  }
  if (num < 1) {
    return num.toFixed(4);
  }
  return num.toFixed(2);
}

export function formatVolume(volume: number): string {
  if (isNaN(volume) || volume === 0) return "$0";

  if (volume >= 1000000) {
    return `$${(volume / 1000000).toFixed(1)}M`;
  }
  if (volume >= 1000) {
    return `$${(volume / 1000).toFixed(1)}K`;
  }
  return `$${volume.toFixed(0)}`;
}

export function formatPercentage(percentage: number): string {
  if (isNaN(percentage)) return "0%";
  return `${percentage > 0 ? "+" : ""}${percentage.toFixed(2)}%`;
}

export function getWorkerPoolStats() {
  return workerPool.getStats();
}

// Initialize worker pool when module loads
workerPool.initialize().catch(console.error);
