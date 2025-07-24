import { TokenPair } from "@shared/types";

// Fallback token data when APIs are rate limited
export const fallbackTokens: TokenPair[] = [
  {
    chainId: "solana",
    dexId: "raydium",
    url: "https://dexscreener.com/solana/example1",
    pairAddress: "fallback-1",
    labels: ["new"],
    baseToken: {
      address: "So11111111111111111111111111111111111111112",
      name: "Wrapped SOL",
      symbol: "SOL",
    },
    quoteToken: {
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      name: "USD Coin",
      symbol: "USDC",
    },
    priceNative: "1.0",
    priceUsd: "95.42",
    txns: {
      m5: { buys: 45, sells: 20 },
      h1: { buys: 350, sells: 180 },
      h6: { buys: 1200, sells: 800 },
      h24: { buys: 4800, sells: 3200 },
    },
    volume: {
      m5: 125000,
      h1: 850000,
      h6: 3200000,
      h24: 12800000,
    },
    priceChange: {
      m5: 3.2,
      h1: 1.8,
      h6: -2.1,
      h24: 5.4,
    },
    liquidity: {
      usd: 450000,
      base: 4716,
      quote: 450000,
    },
    fdv: 89600000000,
    marketCap: 44800000000,
    pairCreatedAt: Date.now() - 86400000,
    info: {
      imageUrl:
        "https://dd.dexscreener.com/ds-data/tokens/solana/So11111111111111111111111111111111111111112.png",
      websites: [{ url: "https://solana.com" }],
      socials: [
        { type: "twitter", url: "https://twitter.com/solana" },
        { type: "telegram", url: "https://t.me/solana" },
      ],
    },
  },
  {
    chainId: "solana",
    dexId: "orca",
    url: "https://dexscreener.com/solana/example2",
    pairAddress: "fallback-2",
    labels: ["trending"],
    baseToken: {
      address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      name: "Jupiter",
      symbol: "JUP",
    },
    quoteToken: {
      address: "So11111111111111111111111111111111111111112",
      name: "Wrapped SOL",
      symbol: "SOL",
    },
    priceNative: "0.0084",
    priceUsd: "0.802",
    txns: {
      m5: { buys: 78, sells: 32 },
      h1: { buys: 520, sells: 280 },
      h6: { buys: 1800, sells: 1200 },
      h24: { buys: 7200, sells: 4800 },
    },
    volume: {
      m5: 89000,
      h1: 675000,
      h6: 2400000,
      h24: 9600000,
    },
    priceChange: {
      m5: 4.8,
      h1: 2.1,
      h6: 8.3,
      h24: 12.7,
    },
    liquidity: {
      usd: 320000,
      base: 399002,
      quote: 3353,
    },
    fdv: 8020000000,
    marketCap: 802000000,
    pairCreatedAt: Date.now() - 172800000,
    info: {
      imageUrl:
        "https://dd.dexscreener.com/ds-data/tokens/solana/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN.png",
      websites: [{ url: "https://jup.ag" }],
      socials: [
        { type: "twitter", url: "https://twitter.com/JupiterExchange" },
        { type: "discord", url: "https://discord.gg/jup" },
      ],
    },
  },
  {
    chainId: "solana",
    dexId: "meteora",
    url: "https://dexscreener.com/solana/example3",
    pairAddress: "fallback-3",
    labels: ["hot"],
    baseToken: {
      address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
      name: "Popcat",
      symbol: "POPCAT",
    },
    quoteToken: {
      address: "So11111111111111111111111111111111111111112",
      name: "Wrapped SOL",
      symbol: "SOL",
    },
    priceNative: "0.0125",
    priceUsd: "1.192",
    txns: {
      m5: { buys: 95, sells: 25 },
      h1: { buys: 680, sells: 220 },
      h6: { buys: 2400, sells: 960 },
      h24: { buys: 9600, sells: 3840 },
    },
    volume: {
      m5: 156000,
      h1: 980000,
      h6: 3900000,
      h24: 15600000,
    },
    priceChange: {
      m5: 6.7,
      h1: 4.2,
      h6: 11.8,
      h24: 18.9,
    },
    liquidity: {
      usd: 580000,
      base: 486655,
      quote: 6075,
    },
    fdv: 1192000000,
    marketCap: 596000000,
    pairCreatedAt: Date.now() - 259200000,
    info: {
      imageUrl:
        "https://dd.dexscreener.com/ds-data/tokens/solana/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr.png",
      websites: [{ url: "https://popcat.click" }],
      socials: [
        { type: "twitter", url: "https://twitter.com/popcatsolana" },
        { type: "telegram", url: "https://t.me/popcatsolana" },
      ],
    },
  },
];

export function getFallbackTokens(): TokenPair[] {
  // Add some randomization to make it look more live
  return fallbackTokens.map((token) => ({
    ...token,
    priceChange: {
      ...token.priceChange,
      m5: (token.priceChange?.m5 || 0) + (Math.random() - 0.5) * 2, // ±1% variation
    },
    volume: {
      ...token.volume,
      m5: (token.volume?.m5 || 0) * (0.9 + Math.random() * 0.2), // ±10% variation
    },
    txns: {
      ...token.txns,
      m5: {
        buys: Math.floor(
          (token.txns?.m5?.buys || 0) * (0.8 + Math.random() * 0.4),
        ),
        sells: Math.floor(
          (token.txns?.m5?.sells || 0) * (0.8 + Math.random() * 0.4),
        ),
      },
    },
  }));
}
