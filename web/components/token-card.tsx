"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import type { Token } from "@/lib/api";
import { slugFor } from "@/lib/config";
import { formatValue, shortAddress, timeAgo } from "@/lib/format";
import { useEthPrice, useTokenMetadata } from "@/lib/metadata";
import { useT } from "@/lib/i18n";
import { TokenAvatar } from "./token-bits";

export function TokenCard({ token }: { token: Token }) {
  const { t } = useT();
  const { data: ethUsd } = useEthPrice();
  const { data: meta } = useTokenMetadata(token.metadataURI || undefined);
  const athRatio = token.athMarketCapEth > 0 ? token.marketCapEth / token.athMarketCapEth : 1;

  return (
    <Link
      href={`/token/${slugFor(token.chainId)}/${token.address}`}
      className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="flex gap-3">
        <TokenAvatar uri={token.metadataURI} symbol={token.symbol} address={token.address} className="size-16" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate font-semibold">{token.name}</p>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">${token.symbol}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {shortAddress(token.creator)} · {timeAgo(token.createdAt)} {t("common.ago")}
          </p>
          {meta?.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{meta.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("token.mcap")}</p>
          <p className="text-lg font-semibold tabular-nums text-buy">{formatValue(token.marketCapEth, ethUsd)}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {token.volume24hEth !== undefined ? (
            <p>
              {t("token.volume24h")}: <span className="text-foreground">{formatValue(token.volume24hEth, ethUsd)}</span>
            </p>
          ) : (
            <p>
              Vol: <span className="text-foreground">{formatValue(token.volumeEth, ethUsd)}</span>
            </p>
          )}
          <p className="inline-flex items-center gap-1">
            <Users className="size-3" /> {token.holderCount}
          </p>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted" title={`${Math.round(athRatio * 100)}% of all-time high`}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-buy" style={{ width: `${Math.max(4, athRatio * 100)}%` }} />
      </div>
    </Link>
  );
}
