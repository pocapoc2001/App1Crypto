"use client";

import { Globe, Send, Share2, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { TOTAL_SUPPLY } from "@app1/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClaimFeesCard } from "@/components/claim-fees";
import { PriceChart } from "@/components/price-chart";
import { SafetyBadges } from "@/components/safety-badges";
import { AddressLink, CopyButton, ExplorerLink, StatTile, TokenAvatar } from "@/components/token-bits";
import { TradePanel } from "@/components/trade-panel";
import { useHolders, useToken, useTrades } from "@/lib/api";
import { chainName } from "@/lib/config";
import { formatEth, formatPrice, formatTokens, formatValue, pct, safeExternalUrl, shortAddress, timeAgo } from "@/lib/format";
import { useEthPrice, useTokenMetadata } from "@/lib/metadata";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function AntiSnipeNotice({ createdAt }: { createdAt: string }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Number(createdAt) + 60 - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  if (left <= 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
      <Timer className="size-4 text-amber-500" />
      Launch protection: max 1% of supply per wallet for {left}s more.
    </div>
  );
}

export function TokenView({ chainId, address }: { chainId: number; address: `0x${string}` }) {
  const { t } = useT();
  const { address: account } = useAccount();
  const { data: token, isLoading } = useToken(chainId, address);
  const { data: trades } = useTrades(chainId, address);
  const { data: holders } = useHolders(chainId, address);
  const { data: meta } = useTokenMetadata(token?.metadataURI || undefined);
  const { data: ethUsd } = useEthPrice();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }
  if (!token) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">{t("token.notFound")}</div>;
  }

  const website = safeExternalUrl(meta?.website);
  const twitter = safeExternalUrl(meta?.twitter);
  const telegram = safeExternalUrl(meta?.telegram);
  const devPct = pct(BigInt(token.devBuyTokens), TOTAL_SUPPLY);
  const isRecipient = account && account.toLowerCase() === token.feeRecipient.toLowerCase();

  function share() {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: `${token!.name} ($${token!.symbol})`, url }).catch(() => {});
    else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
        <TokenAvatar uri={token.metadataURI} symbol={token.symbol} address={token.address} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="truncate text-2xl font-bold">{token.name}</h1>
            <span className="text-lg font-semibold text-muted-foreground">${token.symbol}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{chainName(chainId)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {t("token.contract")}: <span className="font-mono">{shortAddress(token.address)}</span>
              <CopyButton value={token.address} />
            </span>
            <span>
              {t("token.creator")}: <AddressLink address={token.creator} />
            </span>
            <span>
              {t("token.created")} {timeAgo(token.createdAt)} {t("common.ago")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {website && (
            <Button asChild variant="outline" size="icon" aria-label="Website">
              <a href={website} target="_blank" rel="noreferrer nofollow">
                <Globe />
              </a>
            </Button>
          )}
          {twitter && (
            <Button asChild variant="outline" size="icon" aria-label="X">
              <a href={twitter} target="_blank" rel="noreferrer nofollow">
                <XIcon className="size-4" />
              </a>
            </Button>
          )}
          {telegram && (
            <Button asChild variant="outline" size="icon" aria-label="Telegram">
              <a href={telegram} target="_blank" rel="noreferrer nofollow">
                <Send />
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={share}>
            <Share2 /> {t("token.share")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t("token.mcap")} value={formatValue(token.marketCapEth, ethUsd)} sub={formatPrice(token.priceEth, ethUsd)} />
        <StatTile label={t("token.volume24h")} value={formatValue(token.volume24hEth ?? 0, ethUsd)} sub={`${token.trades24h ?? 0} ${t("token.trades").toLowerCase()}`} />
        <StatTile label={t("token.holders")} value={token.holderCount} sub={`${token.buyCount} buys · ${token.sellCount} sells`} />
        <StatTile label={t("token.ath")} value={formatValue(token.athMarketCapEth, ethUsd)} sub={`${t("token.fees")}: ${formatEth(token.feesEth, 5)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <AntiSnipeNotice createdAt={token.createdAt} />
          <PriceChart chainId={chainId} address={address} />

          <div className="rounded-2xl border bg-card">
            <p className="border-b px-4 py-3 text-sm font-semibold">{t("token.trades")}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">ETH</TableHead>
                  <TableHead className="text-right">{token.symbol}</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead className="text-right">Tx</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(trades ?? []).map((tr) => (
                  <TableRow key={tr.id}>
                    <TableCell>
                      <AddressLink address={tr.trader} />
                      {tr.trader.toLowerCase() === token.creator.toLowerCase() && (
                        <span className="ml-1.5 rounded bg-primary/15 px-1 py-0.5 text-[10px] font-semibold text-primary">DEV</span>
                      )}
                    </TableCell>
                    <TableCell className={cn("font-semibold", tr.isBuy ? "text-buy" : "text-sell")}>
                      {tr.isBuy ? "Buy" : "Sell"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{(Number(tr.ethAmount) / 1e18).toFixed(5)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTokens(tr.tokenAmount)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{timeAgo(tr.timestamp)}</TableCell>
                    <TableCell className="text-right">
                      <ExplorerLink chainId={chainId} kind="tx" value={tr.txHash}>
                        {tr.txHash.slice(0, 6)}
                      </ExplorerLink>
                    </TableCell>
                  </TableRow>
                ))}
                {trades && trades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No trades yet — be the first.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-4">
          <TradePanel token={token} />
          {isRecipient && <ClaimFeesCard chainId={chainId} account={account!} />}

          {(meta?.description || devPct > 0) && (
            <div className="rounded-2xl border bg-card p-4 text-sm">
              {meta?.description && <p className="whitespace-pre-line text-muted-foreground">{meta.description}</p>}
              {devPct > 0 && (
                <p className={cn("text-xs text-muted-foreground", meta?.description && "mt-3")}>
                  {t("token.devBuy")}: <span className="font-semibold text-foreground">{devPct.toFixed(2)}%</span> (
                  {formatEth(token.devBuyEth)})
                </p>
              )}
            </div>
          )}

          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-3 text-sm font-semibold">{t("token.topHolders")}</p>
            <ol className="space-y-1.5 text-sm">
              <li className="flex justify-between text-muted-foreground">
                <span>Liquidity pool (locked)</span>
              </li>
              {(holders ?? []).map((h, i) => (
                <li key={h.account} className="flex justify-between gap-2">
                  <span className="truncate">
                    {i + 1}. <AddressLink address={h.account} />
                    {h.account.toLowerCase() === token.creator.toLowerCase() && (
                      <span className="ml-1 text-[10px] font-semibold text-primary">DEV</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{pct(BigInt(h.balance), TOTAL_SUPPLY).toFixed(2)}%</span>
                </li>
              ))}
            </ol>
          </div>

          <SafetyBadges feeBps={token.feeBps} />
          <p className="px-1 text-xs text-muted-foreground">
            <Link href="/how-it-works" className="underline">
              How fees & safety work
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
