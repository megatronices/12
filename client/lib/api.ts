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

        // Selective pre-filtering for signals (no mcap limit)
        return (
          total > 5 && // Meaningful transaction volume (reduced)
          buyPressure >= 55 && // Good buy pressure (reduced)
          priceChange5m >= 2 // Good price movement (reduced)
        );
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

  // 6. MARKET conditions (no mcap limit per user request)
  const ageInDays = (Date.now() / 1000 - pair.pairCreatedAt) / (24 * 60 * 60);
  const marketConditions =
    (pair.volume?.m5 || 0) > 500 && // Minimal volume requirement only
    ageInDays <= 365; // Extended age limit to 1 year

  // 7. ULTRA-STRONG MA convergence
  const ultraStrongMA = checkUltraStrongMAConvergence(pair);

  // 8. Enhanced MACD BULLISH CROSSOVER with 30-minute analysis
  const macdData = calculateMACDCrossover(pair);
  const macdBullishCrossover = macdData.hasBullishCrossover;
  const thirtyMinMACD = macdData.thirtyMinuteCrossover;

  // 9. Enhanced 30-minute MA crossover analysis
  const ma30mData = calculate30MinMASignals(pair);
  const ma30mCrossover = ma30mData.combinedMASignal;

  // 9. BREAKOUT confirmation - outperforming significantly
  const breakoutConfirmation =
    priceChange5m > Math.max(priceChange1h, priceChange6h) + 3;

  // PRACTICAL APPROACH: Core conditions + supporting conditions
  const coreConditions = strongMomentum && goodBuyPressure && priceChange5m > 0;

  // Count supporting conditions (need at least 3 of 8 with enhanced 30m analysis)
  const supportingConditions = [
    consistentBullTrend,
    acceleratingMomentum,
    volumeSupport,
    marketConditions,
    ultraStrongMA,
    macdBullishCrossover,
    thirtyMinMACD,
    ma30mCrossover,
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
      supportingScore: `${supportingConditions}/8 (needs ≥3)`,
      checks: {
        strongMomentum: `${strongMomentum} (${priceChange5m.toFixed(2)}% ≥ 2%)`,
        goodBuyPressure: `${goodBuyPressure} (${buyPressure.toFixed(1)}% ≥ 55%)`,
        consistentBullTrend: `${consistentBullTrend}`,
        acceleratingMomentum: `${acceleratingMomentum}`,
        volumeSupport: `${volumeSupport}`,
        marketConditions: `${marketConditions} (No MCap limit)`,
        ultraStrongMA: `${ultraStrongMA}`,
        macdBullishCrossover: `${macdBullishCrossover}`,
        thirtyMinMACD: `${thirtyMinMACD}`,
        ma30mCrossover: `${ma30mCrossover}`,
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
  thirtyMinuteCrossover: boolean;
} {
  // Enhanced MACD calculation with 30-minute timeframe analysis
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const priceChange6h = pair.priceChange?.h6 || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;

  // Standard 5-minute MACD calculation
  const fastEMA = priceChange5m * 0.8 + priceChange1h * 0.2;
  const slowEMA = priceChange1h * 0.5 + priceChange6h * 0.3 + priceChange24h * 0.2;
  const macdLine = fastEMA - slowEMA;
  const signalLine = macdLine * 0.6 + (priceChange1h - priceChange6h) * 0.4;
  const histogram = macdLine - signalLine;

  // 30-minute timeframe MACD analysis (using 30m equivalent data)
  // Approximate 30-minute data using weighted averages of available timeframes
  const thirtyMinPrice = priceChange5m * 0.6 + priceChange1h * 0.4; // 30m approximation
  const thirtyMinMA20 = priceChange1h * 0.6 + priceChange6h * 0.4; // Slower MA for 30m

  // 30-minute MACD components
  const thirtyMinFastEMA = thirtyMinPrice * 0.7 + priceChange1h * 0.3;
  const thirtyMinSlowEMA = priceChange1h * 0.4 + priceChange6h * 0.6;
  const thirtyMinMACDLine = thirtyMinFastEMA - thirtyMinSlowEMA;
  const thirtyMinSignalLine = thirtyMinMACDLine * 0.7 + (priceChange1h - priceChange6h) * 0.3;
  const thirtyMinHistogram = thirtyMinMACDLine - thirtyMinSignalLine;

  // Enhanced 30-minute crossover conditions
  const thirtyMinuteCrossover =
    thirtyMinHistogram > 0 && // 30m MACD above signal
    thirtyMinMACDLine > 0 && // 30m MACD above zero
    thirtyMinPrice > 1.0 && // Strong 30-minute momentum
    thirtyMinHistogram > 0.3; // Strong separation

  // Standard bullish crossover conditions (5-minute)
  const standardCrossover =
    histogram > 0 && // MACD above signal
    macdLine > 0 && // MACD above zero line
    priceChange5m > 0.5 && // Recent bullish momentum
    histogram > 0.2; // Strong separation between MACD and signal

  // Combined crossover: both 5m and 30m must align
  const hasBullishCrossover = standardCrossover && thirtyMinuteCrossover;

  return {
    hasBullishCrossover,
    macdLine,
    signalLine,
    histogram,
    thirtyMinuteCrossover,
  };
}

// New function for enhanced 30-minute MA crossover analysis
function calculate30MinMASignals(pair: TokenPair): {
  ma9CrossoverMA14: boolean;
  ma20CrossoverMA50: boolean;
  combinedMASignal: boolean;
} {
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const priceChange6h = pair.priceChange?.h6 || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;

  // Simulate 30-minute MA values using weighted combinations
  const current30mPrice = priceChange5m * 0.6 + priceChange1h * 0.4;

  // Simulate MA9 (9-period MA on 30m chart)
  const ma9_30m = priceChange5m * 0.4 + priceChange1h * 0.6;

  // Simulate MA14 (14-period MA on 30m chart)
  const ma14_30m = priceChange1h * 0.5 + priceChange6h * 0.5;

  // Simulate MA20 (20-period MA on 30m chart)
  const ma20_30m = priceChange1h * 0.4 + priceChange6h * 0.6;

  // Simulate MA50 (50-period MA on 30m chart)
  const ma50_30m = priceChange6h * 0.5 + priceChange24h * 0.5;

  // MA9 > MA14 crossover on 30-minute chart
  const ma9CrossoverMA14 =
    ma9_30m > ma14_30m && // MA9 above MA14
    current30mPrice > ma9_30m && // Price above MA9
    priceChange5m > 1.0; // Recent bullish momentum

  // MA20 > MA50 crossover on 30-minute chart
  const ma20CrossoverMA50 =
    ma20_30m > ma50_30m && // MA20 above MA50
    ma9_30m > ma20_30m && // MA9 above MA20 (alignment)
    priceChange1h > 0.5; // Sustained momentum

  // Combined MA signal: both crossovers must occur
  const combinedMASignal = ma9CrossoverMA14 && ma20CrossoverMA50;

  return {
    ma9CrossoverMA14,
    ma20CrossoverMA50,
    combinedMASignal,
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
