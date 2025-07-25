export interface TokenPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: {
      buys: number;
      sells: number;
    };
    h1: {
      buys: number;
      sells: number;
    };
    h6: {
      buys: number;
      sells: number;
    };
    h24: {
      buys: number;
      sells: number;
    };
  };
  volume: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{
      url: string;
    }>;
    socials?: Array<{
      platform: string;
      handle: string;
    }>;
  };
  boosts?: {
    active: number;
  };
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: TokenPair[];
}

export interface TokenFilter {
  minVolume5m?: number;
  minBuyPressure?: number;
  maxAge?: number; // in hours
  minLiquidity?: number;
  onlyWithMA?: boolean;
  maxMarketCap?: number;
}
