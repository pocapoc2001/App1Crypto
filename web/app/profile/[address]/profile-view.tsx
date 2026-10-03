"use client";

import { ArrowRightLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { isAddress } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { feeHookAbi } from "@app1/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ClaimFeesCard } from "@/components/claim-fees";
import { ReferralCard } from "@/components/referral-card";
import { CopyButton, StatTile, TokenAvatar } from "@/components/token-bits";
import { useCreator, useHoldings, type Token } from "@/lib/api";
import { useActiveChain } from "@/lib/active-chain";
import { deploymentFor, slugFor } from "@/lib/config";
import { formatTokens, formatValue, shortAddress } from "@/lib/format";
import { useEthPrice } from "@/lib/metadata";
import { useT } from "@/lib/i18n";
import { describeError } from "@/lib/trade";

function TransferDialog({ token, onClose }: { token: Token | null; onClose: () => void }) {
  const { t } = useT();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: token?.chainId });

  async function submit() {
    if (!token || !publicClient) return;
    const d = deploymentFor(token.chainId);
    if (!d) return;
    setBusy(true);
    try {
      if (walletChainId !== token.chainId) await switchChainAsync({ chainId: token.chainId });
      const hash = await writeContractAsync({
        chainId: token.chainId,
        address: d.hook,
        abi: feeHookAbi,
        functionName: "transferFeeRecipient",
        args: [token.poolId, to as `0x${string}`],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success(`Fee rights for $${token.symbol} sent to ${shortAddress(to)}`);
      onClose();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(token)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("profile.transfer")} — ${token?.symbol}
          </DialogTitle>
          <DialogDescription>{t("profile.transferHint")}</DialogDescription>
        </DialogHeader>
        <Input placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!isAddress(to) || busy} onClick={submit}>
            {busy && <Loader2 className="animate-spin" />}
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProfileView({ address }: { address: `0x${string}` }) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { address: me } = useAccount();
  const { data: creator } = useCreator(chainId, address);
  const { data: holdings } = useHoldings(chainId, address);
  const { data: ethUsd } = useEthPrice();
  const [transferToken, setTransferToken] = useState<Token | null>(null);
  const isMe = me?.toLowerCase() === address.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-buy text-lg font-bold text-white">
          {address.slice(2, 4).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{isMe ? t("nav.profile") : t("profile.title")}</h1>
          <p className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
            {shortAddress(address)} <CopyButton value={address} />
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ClaimFeesCard chainId={chainId} account={address} />
        <StatTile label={t("profile.earned")} value={formatValue(creator?.earnedEth ?? 0, ethUsd)} />
        <StatTile label={t("profile.created")} value={creator?.created.length ?? 0} />
      </div>

      <ReferralCard chainId={chainId} account={address} isOwn={isMe} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("profile.created")}</h2>
        {creator && creator.created.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {creator.created.map((tk) => (
              <div key={tk.id} className="flex items-center gap-3 border-b p-3 last:border-b-0">
                <TokenAvatar uri={tk.metadataURI} symbol={tk.symbol} address={tk.address} className="size-10" />
                <Link href={`/token/${slugFor(tk.chainId)}/${tk.address}`} className="min-w-0 flex-1 hover:underline">
                  <p className="truncate font-medium">
                    {tk.name} <span className="text-muted-foreground">${tk.symbol}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("token.mcap")} {formatValue(tk.marketCapEth, ethUsd)} · Vol {formatValue(tk.volumeEth, ethUsd)}
                  </p>
                </Link>
                <div className="text-right text-sm">
                  <p className="font-semibold text-buy">
                    +{formatValue((tk.feesEth * tk.creatorShareBps) / 10_000, ethUsd)}
                  </p>
                  <p className="text-xs text-muted-foreground">earned</p>
                </div>
                {isMe && tk.feeRecipient.toLowerCase() === address.toLowerCase() && (
                  <Button variant="ghost" size="icon" aria-label={t("profile.transfer")} onClick={() => setTransferToken(tk)}>
                    <ArrowRightLeft />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("profile.nothing")}{" "}
            {isMe && (
              <Link href="/create" className="text-primary underline">
                {t("home.cta")}
              </Link>
            )}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("profile.holdings")}</h2>
        {holdings && holdings.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {holdings.map((h) => {
              const valueEth = (Number(h.balance) / 1e18) * h.priceEth;
              return (
                <Link
                  key={h.id}
                  href={`/token/${slugFor(h.chainId)}/${h.address}`}
                  className="flex items-center gap-3 border-b p-3 last:border-b-0 hover:bg-muted/40"
                >
                  <TokenAvatar uri={h.metadataURI} symbol={h.symbol} address={h.address} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTokens(h.balance)} {h.symbol}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">{formatValue(valueEth, ethUsd)}</p>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("profile.nothing")}</p>
        )}
      </section>

      <TransferDialog token={transferToken} onClose={() => setTransferToken(null)} />
    </div>
  );
}
