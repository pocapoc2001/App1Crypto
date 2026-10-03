import { createConfig, factory } from "ponder";
import { getAbiItem } from "viem";
import { deployments, feeHookAbi, launchFactoryAbi, launchTokenAbi } from "@app1/shared";

/**
 * Which chains to index: comma-separated deployment names from contracts/deployments/*.json
 * (e.g. "local", "baseSepolia,robinhood"). RPC per chain: PONDER_RPC_URL_<chainId>, falling back
 * to the public endpoints below (rate-limited; use a provider such as Alchemy in production).
 */
const enabled = (process.env.PONDER_CHAINS ?? "local").split(",").map((s) => s.trim());

const defaultRpc: Record<number, string> = {
  1337: "http://127.0.0.1:8545",
  84532: "https://sepolia.base.org",
  8453: "https://mainnet.base.org",
  4663: "https://rpc.mainnet.chain.robinhood.com",
  46630: "https://rpc.testnet.chain.robinhood.com",
  1: "https://eth.llamarpc.com",
};

const active = Object.values(deployments).filter((d) => enabled.includes(d.name));
if (active.length === 0) {
  throw new Error(
    `No deployments match PONDER_CHAINS=${enabled.join(",")}. Deploy first (npm run dev:deploy) and run npm run gen.`,
  );
}

const chains = Object.fromEntries(
  active.map((d) => [
    d.name,
    {
      id: d.chainId,
      rpc: process.env[`PONDER_RPC_URL_${d.chainId}`] ?? defaultRpc[d.chainId]!,
      // Anvil restarts from scratch, so never reuse cached RPC data for it.
      disableCache: d.chainId === 1337,
      pollingInterval: d.chainId === 1337 ? 500 : 1_000,
    },
  ]),
);

const perChain = <T>(fn: (d: (typeof active)[number]) => T) =>
  Object.fromEntries(active.map((d) => [d.name, fn(d)])) as Record<string, T>;

const tokenLaunchedEvent = getAbiItem({ abi: launchFactoryAbi, name: "TokenLaunched" });

export default createConfig({
  ordering: "multichain",
  database: process.env.DATABASE_URL ? { kind: "postgres" } : { kind: "pglite" },
  chains,
  contracts: {
    LaunchFactory: {
      abi: launchFactoryAbi,
      chain: perChain((d) => ({ address: d.factory, startBlock: d.startBlock })),
    },
    FeeHook: {
      abi: feeHookAbi,
      chain: perChain((d) => ({ address: d.hook, startBlock: d.startBlock })),
    },
    LaunchToken: {
      abi: launchTokenAbi,
      chain: perChain((d) => ({
        address: factory({ address: d.factory, event: tokenLaunchedEvent, parameter: "token" }),
        startBlock: d.startBlock,
      })),
    },
  },
});
