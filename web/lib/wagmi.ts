"use client";

import { connectorsForWallets, type Wallet, type WalletList } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, createConnector, http, type Transport } from "wagmi";
import { mock } from "wagmi/connectors";
import { APP_NAME, DEV_WALLET, WC_PROJECT_ID, enabledChains, rpcUrl } from "./config";

/** Anvil's default account #0 — a PUBLIC, well-known test key. Only ever usable on the local chain. */
const ANVIL_ACCOUNT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

const anvilDevWallet = (): Wallet => ({
  id: "anvil-dev",
  name: "Anvil test wallet (local)",
  iconUrl:
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%236366f1'/><text x='16' y='22' font-size='16' text-anchor='middle' fill='white' font-family='sans-serif'>A</text></svg>",
  iconBackground: "#6366f1",
  createConnector: (walletDetails) =>
    createConnector((config) => ({
      ...mock({ accounts: [ANVIL_ACCOUNT_0], features: { reconnect: true } })(config),
      ...walletDetails,
    })),
});

const hasLocal = enabledChains.some((c) => c.id === 1337);
const projectId = WC_PROJECT_ID || "00000000000000000000000000000000";

const groups: WalletList = [
  {
    groupName: "Popular",
    wallets: WC_PROJECT_ID
      ? [metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet, injectedWallet]
      : [injectedWallet, metaMaskWallet, coinbaseWallet],
  },
];
if (DEV_WALLET && hasLocal) groups.unshift({ groupName: "Development", wallets: [anvilDevWallet] });

const connectors = connectorsForWallets(groups, { appName: APP_NAME, projectId });

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors,
  transports: Object.fromEntries(enabledChains.map((c) => [c.id, http(rpcUrl(c.id))])) as Record<
    number,
    Transport
  >,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
