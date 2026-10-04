import { allChains, chainSlugs, deployments, type Deployment } from "@app1/shared";
import type { Chain } from "viem";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "FlowPad";
export const INDEXER_URL = (process.env.NEXT_PUBLIC_INDEXER_URL || "http://127.0.0.1:42069").replace(/\/$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs/";
export const DEV_WALLET = process.env.NEXT_PUBLIC_DEV_WALLET === "1";
export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";

/** Deployments offered in the UI, in the order given by NEXT_PUBLIC_CHAINS. */
const wanted = (process.env.NEXT_PUBLIC_CHAINS || "local").split(",").map((s) => s.trim());
export const enabledDeployments: Deployment[] = wanted
  .map((name) => Object.values(deployments).find((d) => d.name === name))
  .filter((d): d is Deployment => Boolean(d));

if (enabledDeployments.length === 0) {
  // Fall back to everything that has been deployed so the app still renders.
  enabledDeployments.push(...Object.values(deployments));
}

export const enabledChains = enabledDeployments
  .map((d) => allChains[d.chainId])
  .filter((c): c is Chain => Boolean(c)) as unknown as readonly [Chain, ...Chain[]];

export const defaultChainId = enabledDeployments[0]?.chainId ?? 1337;

/** True when every offered chain is a testnet: the UI then shows a testnet banner and ETH (not USD) values. */
export const IS_TESTNET_ONLY = enabledChains.every((c) => c.testnet === true);

export function deploymentFor(chainId: number): Deployment | undefined {
  return enabledDeployments.find((d) => d.chainId === chainId);
}

// Next.js only inlines *static* process.env.NEXT_PUBLIC_* references into client bundles.
const RPC_OVERRIDES: Record<number, string | undefined> = {
  1337: process.env.NEXT_PUBLIC_RPC_1337,
  84532: process.env.NEXT_PUBLIC_RPC_84532,
  8453: process.env.NEXT_PUBLIC_RPC_8453,
  4663: process.env.NEXT_PUBLIC_RPC_4663,
  46630: process.env.NEXT_PUBLIC_RPC_46630,
  1: process.env.NEXT_PUBLIC_RPC_1,
};

export function rpcUrl(chainId: number): string | undefined {
  return RPC_OVERRIDES[chainId] || allChains[chainId]?.rpcUrls.default.http[0];
}

export function slugFor(chainId: number) {
  return chainSlugs[chainId] ?? String(chainId);
}

export function explorerUrl(chainId: number, kind: "tx" | "address" | "token", value: string) {
  const base = allChains[chainId]?.blockExplorers?.default.url;
  if (!base) return undefined;
  return `${base}/${kind}/${value}`;
}

export function chainName(chainId: number) {
  return allChains[chainId]?.name ?? `Chain ${chainId}`;
}
