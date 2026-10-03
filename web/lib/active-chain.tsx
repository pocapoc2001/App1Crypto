"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { defaultChainId, deploymentFor } from "./config";
import { useLocalPref } from "./local-pref";

/**
 * The chain whose coins the UI is showing: the connected wallet's chain when it is supported,
 * otherwise whatever the user picked last (remembered per browser).
 */
type Ctx = { chainId: number; setChainId: (id: number) => void };
const ActiveChainContext = createContext<Ctx | undefined>(undefined);

export function ActiveChainProvider({ children }: { children: ReactNode }) {
  const [saved, save] = useLocalPref("chainId", String(defaultChainId));
  const { chainId: walletChainId, isConnected } = useAccount();

  const savedId = deploymentFor(Number(saved)) ? Number(saved) : defaultChainId;
  const chainId = isConnected && walletChainId && deploymentFor(walletChainId) ? walletChainId : savedId;

  const setChainId = (id: number) => {
    if (deploymentFor(id)) save(String(id));
  };

  return <ActiveChainContext.Provider value={{ chainId, setChainId }}>{children}</ActiveChainContext.Provider>;
}

export function useActiveChain() {
  const ctx = useContext(ActiveChainContext);
  if (!ctx) throw new Error("useActiveChain must be used inside ActiveChainProvider");
  return ctx;
}
