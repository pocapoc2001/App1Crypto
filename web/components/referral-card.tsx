"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useReadContract } from "wagmi";
import { launchFactoryAbi } from "@app1/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatTile } from "@/components/token-bits";
import { useReferrals } from "@/lib/api";
import { deploymentFor } from "@/lib/config";
import { formatValue } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useEthPrice } from "@/lib/metadata";
import { referralLink } from "@/lib/referral";

const pct = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 3 });

/**
 * Referral stats of `account`. On your own profile it also shows your referral link (always), and on other
 * profiles it only appears once the account has referred someone.
 */
export function ReferralCard({ chainId, account, isOwn }: { chainId: number; account: `0x${string}`; isOwn: boolean }) {
  const { t } = useT();
  const d = deploymentFor(chainId);
  const { data: stats } = useReferrals(chainId, account);
  const { data: ethUsd } = useEthPrice();
  const [copied, setCopied] = useState(false);

  // Rates for new launches; each pool keeps the referral share it was launched with.
  const { data: cfg } = useReadContract({
    address: d?.factory,
    abi: launchFactoryAbi,
    functionName: "getConfig",
    chainId,
    query: { enabled: Boolean(d) && isOwn },
  });
  const feeBps = cfg?.feeBps ?? 100;
  const creatorShareBps = cfg?.creatorShareBps ?? 5000;
  const referralShareBps = cfg?.referralShareBps ?? 2000;
  const hint = t("referral.hint")
    .replace("{share}", pct(referralShareBps / 100))
    .replace("{volume}", pct((feeBps * (10_000 - creatorShareBps) * referralShareBps) / 1e10));

  const link = referralLink(account);
  const referredTraders = stats?.referredTraders ?? 0;
  const earnedEth = stats?.earnedEth ?? 0;
  if (!isOwn && referredTraders === 0 && earnedEth === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      toast.success(t("referral.copied"));
    } catch {
      toast.error(t("referral.copyFailed"));
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4 text-primary" /> {isOwn ? t("referral.yourLink") : t("referral.title")}
      </div>
      {isOwn && (
        <>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{hint}</p>
          <div className="mt-3 flex gap-2">
            <Input
              readOnly
              value={link}
              aria-label={t("referral.yourLink")}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="text-buy" /> : <Copy />} {copied ? t("common.copied") : t("common.copy")}
            </Button>
          </div>
        </>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatTile label={t("referral.traders")} value={referredTraders} />
        <StatTile label={t("referral.earned")} value={formatValue(earnedEth, ethUsd)} sub={t("referral.earnedHint")} />
      </div>
    </section>
  );
}
