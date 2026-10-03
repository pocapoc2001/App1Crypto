"use client";

import Link from "next/link";
import { useRecentTrades } from "@/lib/api";
import { useActiveChain } from "@/lib/active-chain";
import { slugFor } from "@/lib/config";
import { formatValue, shortAddress } from "@/lib/format";
import { useEthPrice } from "@/lib/metadata";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LiveTicker() {
  const { chainId } = useActiveChain();
  const { data } = useRecentTrades(chainId);
  const { data: ethUsd } = useEthPrice();
  const { t } = useT();
  if (!data || data.length === 0) return null;

  const items = [...data, ...data]; // duplicated for a seamless loop
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card/60">
      <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-2 bg-card pl-3 pr-3 text-xs font-semibold after:absolute after:inset-y-0 after:left-full after:w-8 after:bg-gradient-to-r after:from-card after:to-transparent">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-buy opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-buy" />
        </span>
        {t("home.live")}
      </div>
      <div className="flex w-max animate-ticker gap-6 py-2.5 pl-32 hover:[animation-play-state:paused]">
        {items.map((tr, i) => (
          <Link
            key={`${tr.id}-${i}`}
            href={`/token/${slugFor(tr.chainId)}/${tr.token}`}
            className="flex items-center gap-1.5 whitespace-nowrap text-xs"
          >
            <span className="font-mono text-muted-foreground">{shortAddress(tr.trader)}</span>
            <span className={cn("font-semibold", tr.isBuy ? "text-buy" : "text-sell")}>
              {tr.isBuy ? t("ticker.bought") : t("ticker.sold")}
            </span>
            <span className="tabular-nums">{formatValue(Number(tr.ethAmount) / 1e18, ethUsd)}</span>
            {t("ticker.of") && <span className="text-muted-foreground">{t("ticker.of")}</span>}
            <span className="font-semibold">${tr.symbol}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
