import { RequestHandler } from "express";

const DEXSCREENER_BASE_URL = "https://api.dexscreener.com";

export const getDexScreenerData: RequestHandler = async (req, res) => {
  try {
    const { endpoint } = req.params;
    const queryString = req.url.split("?")[1] || "";

    const url = `${DEXSCREENER_BASE_URL}/${endpoint}${queryString ? `?${queryString}` : ""}`;

    console.log(`Fetching from DexScreener: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TokenScreener/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `DexScreener API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Add CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    res.json(data);
  } catch (error) {
    console.error("Error fetching from DexScreener:", error);
    res.status(500).json({
      error: "Failed to fetch data from DexScreener",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getSolanaTokens: RequestHandler = async (req, res) => {
  try {
    const { page = "1", limit = "200" } = req.query;

    // Use the search endpoint which is more reliable
    const url = `${DEXSCREENER_BASE_URL}/latest/dex/search?q=SOL`;
    console.log(`Fetching Solana tokens from: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TokenScreener/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `DexScreener API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Filter for Solana chain only
    const solanaPairs = (data.pairs || []).filter(
      (pair: any) => pair.chainId === "solana",
    );

    // Sort by volume and limit results
    const sortedPairs = solanaPairs
      .sort((a: any, b: any) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, parseInt(limit as string));

    console.log(`Found ${sortedPairs.length} Solana pairs`);

    res.json({
      pairs: sortedPairs,
      total: solanaPairs.length,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error) {
    console.error("Error fetching Solana tokens:", error);
    res.status(500).json({
      error: "Failed to fetch Solana tokens",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getTrendingTokens: RequestHandler = async (req, res) => {
  try {
    // Use search endpoints for different popular tokens to get diverse data
    const searchQueries = ["SOL", "USDC", "pump", "raydium"];

    const promises = searchQueries.map(async (query) => {
      const url = `${DEXSCREENER_BASE_URL}/latest/dex/search?q=${query}`;
      console.log(`Fetching trending data for: ${query}`);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TokenScreener/1.0)",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch ${query}: ${response.status}`);
        return { pairs: [] };
      }

      return await response.json();
    });

    const results = await Promise.allSettled(promises);
    const allPairs = results
      .filter(
        (result): result is PromiseFulfilledResult<any> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => result.value.pairs || [])
      .filter((pair: any) => pair.chainId === "solana");

    // Remove duplicates and filter for tokens with high buying pressure
    const uniquePairs = allPairs.reduce((acc: any[], current: any) => {
      const isDuplicate = acc.some(
        (pair) => pair.pairAddress === current.pairAddress,
      );
      if (!isDuplicate) {
        acc.push(current);
      }
      return acc;
    }, []);

    // Filter for tokens with high buying pressure in last 5 minutes
    const trendingPairs = uniquePairs.filter((pair: any) => {
      const buys5m = pair.txns?.m5?.buys || 0;
      const sells5m = pair.txns?.m5?.sells || 0;
      const total = buys5m + sells5m;
      const buyPressure = total > 0 ? (buys5m / total) * 100 : 0;

      return buyPressure >= 60 && pair.volume?.m5 > 500;
    });

    console.log(
      `Found ${trendingPairs.length} trending pairs with high buy pressure`,
    );

    res.json({
      pairs: trendingPairs.slice(0, 100),
      total: trendingPairs.length,
    });
  } catch (error) {
    console.error("Error fetching trending tokens:", error);
    res.status(500).json({
      error: "Failed to fetch trending tokens",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
