import { defineChain, type Chain } from "viem";
import { base, baseSepolia, mainnet } from "viem/chains";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" } },
  testnet: true,
});

export const local = defineChain({
  id: 1337,
  name: "Local (Anvil)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

/** URL-friendly slug used in routes like /token/base/0x... */
export const chainSlugs: Record<number, string> = {
  [local.id]: "local",
  [baseSepolia.id]: "base-sepolia",
  [base.id]: "base",
  [robinhood.id]: "robinhood",
  [robinhoodTestnet.id]: "robinhood-testnet",
  [mainnet.id]: "ethereum",
};

export const allChains: Record<number, Chain> = {
  [local.id]: local,
  [baseSepolia.id]: baseSepolia,
  [base.id]: base,
  [robinhood.id]: robinhood,
  [robinhoodTestnet.id]: robinhoodTestnet,
  [mainnet.id]: mainnet,
};

export function chainIdFromSlug(slug: string): number | undefined {
  const hit = Object.entries(chainSlugs).find(([, s]) => s === slug);
  return hit ? Number(hit[0]) : undefined;
}
