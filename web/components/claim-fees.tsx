"use client";

import { Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatEther } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { feeHookAbi } from "@app1/shared";
import { Button } from "@/components/ui/button";
import { deploymentFor } from "@/lib/config";
import { formatValue } from "@/lib/format";
import { useEthPrice } from "@/lib/metadata";
import { useT } from "@/lib/i18n";
import { describeError } from "@/lib/trade";

/** Shows ETH fees owed to `account` and lets them pull it. Fees from all their coins are pooled. */
export function ClaimFeesCard({ chainId, account }: { chainId: number; account: `0x${string}` }) {
  const { t } = useT();
  const d = deploymentFor(chainId);
  const { address, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId });
  const { data: ethUsd } = useEthPrice();
  const [busy, setBusy] = useState(false);

  const claimable = useReadContract({
    address: d?.hook,
    abi: feeHookAbi,
    functionName: "claimable",
    args: [account],
    chainId,
    query: { enabled: Boolean(d), refetchInterval: 5_000 },
  });

  const amount = claimable.data ?? 0n;
  const isOwn = address?.toLowerCase() === account.toLowerCase();

  async function claim() {
    if (!d || !publicClient) return;
    setBusy(true);
    try {
      if (walletChainId !== chainId) await switchChainAsync({ chainId });
      const hash = await writeContractAsync({
        chainId,
        address: d.hook,
        abi: feeHookAbi,
        functionName: "claimFees",
        args: [account],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success(`Claimed ${Number(formatEther(amount)).toFixed(6)} ETH`);
      await claimable.refetch();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const eth = Number(formatEther(amount));
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wallet className="size-4 text-primary" /> {t("profile.claimable")}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{eth.toFixed(6)} ETH</p>
      {ethUsd && <p className="text-xs text-muted-foreground">≈ {formatValue(eth, ethUsd)}</p>}
      {isOwn && (
        <Button className="mt-3 w-full" disabled={busy || amount === 0n} onClick={claim}>
          {busy && <Loader2 className="animate-spin" />}
          {t("profile.claim")}
        </Button>
      )}
    </div>
  );
}
