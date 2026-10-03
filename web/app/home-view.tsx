"use client";

import { ArrowRight, Flame, Search, Sparkles, Trophy, Zap } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveTicker } from "@/components/live-ticker";
import { TokenCard } from "@/components/token-card";
import { StatTile } from "@/components/token-bits";
import { useStats, useTokens } from "@/lib/api";
import { useActiveChain } from "@/lib/active-chain";
import { chainName } from "@/lib/config";
import { formatValue } from "@/lib/format";
import { useEthPrice } from "@/lib/metadata";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SORTS = [
  { id: "trending", icon: Flame, key: "home.trending" },
  { id: "new", icon: Sparkles, key: "home.new" },
  { id: "mcap", icon: Trophy, key: "home.top" },
  { id: "active", icon: Zap, key: "home.active" },
] as const;

export function HomeView() {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("new");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const tokens = useTokens(chainId, sort, q);
  const stats = useStats(chainId);
  const { data: ethUsd } = useEthPrice();

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-buy/15 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-buy" /> {t("home.liveOn")} {chainName(chainId)}
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">{t("home.title")}</h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">{t("home.subtitle")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/create">
                {t("home.cta")} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/how-it-works">{t("home.learn")}</Link>
            </Button>
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label={t("stats.tokens")} value={stats.data?.tokens ?? "—"} />
          <StatTile label={t("stats.volume")} value={stats.data ? formatValue(stats.data.volumeEth, ethUsd) : "—"} />
          <StatTile
            label={t("stats.creatorFees")}
            value={stats.data ? formatValue(stats.data.feesEth / 2, ethUsd) : "—"}
          />
        </div>
      </section>

      <LiveTicker />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  sort === s.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <s.icon className="size-3.5" />
                {t(s.key)}
              </button>
            ))}
          </div>
          <div className="relative sm:w-80">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("home.search")}
              className="pl-9"
            />
          </div>
        </div>

        {tokens.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : tokens.isError ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Can&apos;t reach the indexer. Is it running? (<code>npm run dev:indexer</code>)
          </div>
        ) : tokens.data && tokens.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tokens.data.map((tk) => (
              <TokenCard key={tk.id} token={tk} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <p className="text-muted-foreground">{sort === "trending" && !q ? "No trades in the last 24h." : t("home.empty")}</p>
            <Button asChild className="mt-4">
              <Link href="/create">{t("home.cta")}</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
