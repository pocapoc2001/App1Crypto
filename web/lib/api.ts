"use client";

import { useQuery } from "@tanstack/react-query";
import { INDEXER_URL } from "./config";

export type Token = {
  id: string;
  chainId: number;
  address: `0x${string}`;
  poolId: `0x${string}`;
  creator: `0x${string}`;
  feeRecipient: `0x${string}`;
  name: string;
  symbol: string;
  metadataURI: string;
  feeBps: number;
  creatorShareBps: number;
  createdAt: string;
  createdBlock: string;
  txHash: `0x${string}`;
  sqrtPriceX96: string;
  priceEth: number;
  marketCapEth: number;
  athMarketCapEth: number;
  volumeEth: number;
  feesEth: number;
  buyCount: number;
  sellCount: number;
  holderCount: number;
  devBuyEth: number;
  devBuyTokens: string;
  lastTradeAt: string;
  volume24hEth?: number;
  trades24h?: number;
};

export type Trade = {
  id: string;
  chainId: number;
  token: `0x${string}`;
  trader: `0x${string}`;
  isBuy: boolean;
  ethAmount: string;
  tokenAmount: string;
  feeEth: string;
  priceEth: number;
  marketCapEth: number;
  timestamp: string;
  txHash: `0x${string}`;
  symbol?: string;
  name?: string;
  metadataURI?: string;
};

export type Candle = {
  bucket: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeEth: number;
  trades: number;
};

export type Holder = { account: `0x${string}`; balance: string };
export type Stats = { tokens: number; volumeEth: number; feesEth: number };
export type CreatorInfo = {
  created: Token[];
  claims: { amount: string; timestamp: string; txHash: string }[];
  earnedEth: number;
};
export type Holding = Token & { balance: string };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${INDEXER_URL}${path}`, { cache: "no-store" });
  if (res.status === 404) return null as T;
  if (!res.ok) throw new Error(`Indexer error ${res.status}`);
  return res.json() as Promise<T>;
}

const LIVE = 3_000;

export const useTokens = (chainId: number, sort: string, q: string) =>
  useQuery({
    queryKey: ["tokens", chainId, sort, q],
    queryFn: () => get<Token[]>(`/tokens?chainId=${chainId}&sort=${sort}&q=${encodeURIComponent(q)}&limit=60`),
    refetchInterval: 5_000,
  });

export const useToken = (chainId: number, address: string) =>
  useQuery({
    queryKey: ["token", chainId, address.toLowerCase()],
    queryFn: () => get<Token | null>(`/tokens/${chainId}/${address}`),
    refetchInterval: LIVE,
  });

export const useTrades = (chainId: number, address: string) =>
  useQuery({
    queryKey: ["trades", chainId, address.toLowerCase()],
    queryFn: () => get<Trade[]>(`/tokens/${chainId}/${address}/trades?limit=50`),
    refetchInterval: LIVE,
  });

export const useCandles = (chainId: number, address: string, interval: number) =>
  useQuery({
    queryKey: ["candles", chainId, address.toLowerCase(), interval],
    queryFn: () => get<Candle[]>(`/tokens/${chainId}/${address}/candles?interval=${interval}`),
    refetchInterval: LIVE,
  });

export const useHolders = (chainId: number, address: string) =>
  useQuery({
    queryKey: ["holders", chainId, address.toLowerCase()],
    queryFn: () => get<Holder[]>(`/tokens/${chainId}/${address}/holders?limit=20`),
    refetchInterval: 10_000,
  });

export const useRecentTrades = (chainId: number) =>
  useQuery({
    queryKey: ["recent", chainId],
    queryFn: () => get<Trade[]>(`/trades/recent?chainId=${chainId}&limit=20`),
    refetchInterval: LIVE,
  });

export const useStats = (chainId: number) =>
  useQuery({
    queryKey: ["stats", chainId],
    queryFn: () => get<Stats>(`/stats?chainId=${chainId}`),
    refetchInterval: 10_000,
  });

export const useCreator = (chainId: number, address?: string) =>
  useQuery({
    queryKey: ["creator", chainId, address?.toLowerCase()],
    queryFn: () => get<CreatorInfo>(`/creators/${address}?chainId=${chainId}`),
    enabled: Boolean(address),
    refetchInterval: 10_000,
  });

export const useHoldings = (chainId: number, address?: string) =>
  useQuery({
    queryKey: ["holdings", chainId, address?.toLowerCase()],
    queryFn: () => get<Holding[]>(`/holdings/${address}?chainId=${chainId}`),
    enabled: Boolean(address),
    refetchInterval: 10_000,
  });
