"use client";

import { useQuery } from "@tanstack/react-query";

export type TokenMetadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string; // already resolved to an http(s) URL by /api/metadata
  website?: string;
  twitter?: string;
  telegram?: string;
};

export function useTokenMetadata(uri?: string) {
  return useQuery({
    queryKey: ["metadata", uri],
    queryFn: async () => {
      const res = await fetch(`/api/metadata?uri=${encodeURIComponent(uri!)}`);
      if (!res.ok) return {} as TokenMetadata;
      return (await res.json()) as TokenMetadata;
    },
    enabled: Boolean(uri),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  });
}

export function useEthPrice() {
  return useQuery({
    queryKey: ["eth-price"],
    queryFn: async () => {
      const res = await fetch("/api/eth-price");
      if (!res.ok) return undefined;
      const { usd } = (await res.json()) as { usd?: number };
      return usd;
    },
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
}
