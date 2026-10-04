"use client";

import { FlaskConical } from "lucide-react";
import { useActiveChain } from "@/lib/active-chain";
import { IS_TESTNET_ONLY, chainName } from "@/lib/config";
import { useT } from "@/lib/i18n";

const FAUCETS: Record<number, string> = {
  84532: "https://portal.cdp.coinbase.com/products/faucet",
  46630: "https://faucet.testnet.chain.robinhood.com",
};

/** Shown on testnet-only deployments so visitors never mistake test coins for real money. */
export function TestnetBanner() {
  const { t } = useT();
  const { chainId } = useActiveChain();
  if (!IS_TESTNET_ONLY) return null;
  const faucet = FAUCETS[chainId];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical className="size-3.5" />
        {t("testnet.banner").replace("{chain}", chainName(chainId))}
      </span>
      {faucet && (
        <a href={faucet} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:no-underline">
          {t("testnet.faucet")} →
        </a>
      )}
    </div>
  );
}
