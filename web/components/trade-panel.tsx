"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatEther, formatUnits, hashDomain, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { launchRouterAbi, launchTokenAbi, poolKeyFor } from "@app1/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Token } from "@/lib/api";
import { deploymentFor } from "@/lib/config";
import { formatTokens } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { referrerFor } from "@/lib/referral";
import {
  SLIPPAGE_OPTIONS,
  deadlineIn,
  describeError,
  minOut,
  permit2DomainAbi,
  permit2DomainTypes,
  permit2Types,
  randomNonce,
  useQuote,
} from "@/lib/trade";
import { cn } from "@/lib/utils";

function safeParse(value: string, decimals: number): bigint | undefined {
  if (!value || Number(value) <= 0 || !/^\d*\.?\d*$/.test(value)) return undefined;
  try {
    return decimals === 18 ? parseEther(value) : parseUnits(value, decimals);
  } catch {
    return undefined;
  }
}

export function TradePanel({ token }: { token: Token }) {
  const { t } = useT();
  const chainId = token.chainId;
  const d = deploymentFor(chainId);
  const queryClient = useQueryClient();
  const { address, chainId: walletChainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<number>(3);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<"idle" | "signing" | "pending">("idle");

  const isBuy = side === "buy";
  const amountIn = safeParse(amount, 18);

  const ethBalance = useBalance({ address, chainId, query: { enabled: Boolean(address), refetchInterval: 5_000 } });
  const tokenBalance = useReadContract({
    address: token.address,
    abi: launchTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
  });

  const quote = useQuote(chainId, token.address, isBuy, amountIn, address);

  // Sells normally use a Permit2 signature (no approve tx). If Permit2's domain on this chain is not
  // the standard one, fall back to approve + sell so trading never breaks.
  const permit2Domain = useReadContract({
    address: d?.permit2,
    abi: permit2DomainAbi,
    functionName: "DOMAIN_SEPARATOR",
    chainId,
    query: { enabled: Boolean(d), staleTime: Infinity },
  });
  const permitUsable =
    Boolean(d) &&
    permit2Domain.data ===
      hashDomain({
        domain: { name: "Permit2", chainId: BigInt(chainId), verifyingContract: d!.permit2 },
        types: { EIP712Domain: permit2DomainTypes },
      });

  const priceImpact = useMemo(() => {
    if (!quote.data || !amountIn || token.priceEth <= 0) return undefined;
    const ethSide = Number(formatEther(isBuy ? amountIn : quote.data));
    const tokenSide = Number(formatUnits(isBuy ? quote.data : amountIn, 18));
    if (tokenSide === 0) return undefined;
    const exec = ethSide / tokenSide;
    return Math.abs(exec / token.priceEth - 1) * 100;
  }, [quote.data, amountIn, isBuy, token.priceEth]);

  const presets = isBuy
    ? ["0.01", "0.05", "0.1", "0.5"].map((v) => ({ label: `${v} ETH`, value: v }))
    : [25, 50, 75, 100].map((p) => ({
        label: `${p}%`,
        value: tokenBalance.data ? formatUnits((tokenBalance.data * BigInt(p)) / 100n, 18) : "",
      }));

  const insufficient =
    amountIn !== undefined &&
    (isBuy ? (ethBalance.data?.value ?? 0n) < amountIn : (tokenBalance.data ?? 0n) < amountIn);

  async function submit() {
    if (!d || !address || !amountIn || !quote.data || !publicClient) return;
    const key = poolKeyFor(token.address, d.hook);
    const min = minOut(quote.data, slippage);
    const referrer = referrerFor(address);
    try {
      if (walletChainId !== chainId) await switchChainAsync({ chainId });
      let hash: `0x${string}`;
      if (isBuy) {
        setStatus("signing");
        hash = await writeContractAsync({
          chainId,
          address: d.router,
          abi: launchRouterAbi,
          functionName: "buy",
          args: [key, min, address, deadlineIn(600), referrer],
          value: amountIn,
        });
      } else if (!permitUsable) {
        setStatus("signing");
        const allowance = await publicClient.readContract({
          address: token.address,
          abi: launchTokenAbi,
          functionName: "allowance",
          args: [address, d.router],
        });
        if (allowance < amountIn) {
          const approveHash = await writeContractAsync({
            chainId,
            address: token.address,
            abi: launchTokenAbi,
            functionName: "approve",
            args: [d.router, amountIn],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        hash = await writeContractAsync({
          chainId,
          address: d.router,
          abi: launchRouterAbi,
          functionName: "sell",
          args: [key, amountIn, min, address, deadlineIn(600), referrer],
        });
      } else {
        setStatus("signing");
        const nonce = randomNonce();
        const permitDeadline = deadlineIn(1800);
        const signature = await signTypedDataAsync({
          domain: { name: "Permit2", chainId, verifyingContract: d.permit2 },
          types: permit2Types,
          primaryType: "PermitTransferFrom",
          message: {
            permitted: { token: token.address, amount: amountIn },
            spender: d.router,
            nonce,
            deadline: permitDeadline,
          },
        });
        hash = await writeContractAsync({
          chainId,
          address: d.router,
          abi: launchRouterAbi,
          functionName: "sellWithPermit",
          args: [key, amountIn, min, address, deadlineIn(600), nonce, permitDeadline, signature, referrer],
        });
      }
      setStatus("pending");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      toast.success(t("trade.success"), {
        description: isBuy
          ? `+${formatTokens(quote.data)} ${token.symbol}`
          : `+${Number(formatEther(quote.data)).toFixed(5)} ETH`,
      });
      setAmount("");
      await Promise.all([
        ethBalance.refetch(),
        tokenBalance.refetch(),
        queryClient.invalidateQueries({ queryKey: ["token", chainId] }),
        queryClient.invalidateQueries({ queryKey: ["trades", chainId] }),
      ]);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setStatus("idle");
    }
  }

  const busy = status !== "idle";
  let cta: React.ReactNode = isBuy ? t("trade.placeBuy") : t("trade.placeSell");
  if (status === "signing") cta = t("trade.signing");
  if (status === "pending") cta = t("trade.pending");

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s);
              setAmount("");
            }}
            className={cn(
              "rounded-lg py-2 text-sm font-semibold transition-colors",
              side === s
                ? s === "buy"
                  ? "bg-buy text-white shadow"
                  : "bg-sell text-white shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "buy" ? t("trade.buy") : t("trade.sell")}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("trade.amount")}</span>
        <div className="flex items-center gap-2">
          {address && (
            <span>
              {t("trade.balance")}:{" "}
              {isBuy
                ? `${Number(formatEther(ethBalance.data?.value ?? 0n)).toFixed(4)} ETH`
                : `${formatTokens(tokenBalance.data ?? 0n)} ${token.symbol}`}
            </span>
          )}
          <button aria-label="Slippage settings" onClick={() => setShowSettings((v) => !v)}>
            <Settings2 className="size-3.5 hover:text-foreground" />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="mt-2 flex items-center gap-1 rounded-lg border p-2 text-xs">
          <span className="mr-auto text-muted-foreground">{t("trade.slippage")}</span>
          {SLIPPAGE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={cn(
                "rounded-md px-2 py-1 font-medium",
                slippage === s ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {s}%
            </button>
          ))}
        </div>
      )}

      <div className="relative mt-2">
        <Input
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(",", "."))}
          className="h-14 pr-20 text-2xl font-semibold tabular-nums"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
          {isBuy ? "ETH" : token.symbol}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            disabled={!p.value}
            onClick={() => setAmount(p.value)}
            className="rounded-lg border py-1.5 text-xs font-medium hover:border-primary/60 hover:bg-accent disabled:opacity-40"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("trade.youReceive")}</span>
          <span className="font-semibold tabular-nums">
            {quote.isFetching && !quote.data ? (
              <Loader2 className="size-4 animate-spin" />
            ) : quote.data ? (
              isBuy ? (
                `${formatTokens(quote.data)} ${token.symbol}`
              ) : (
                `${Number(formatEther(quote.data)).toFixed(6)} ETH`
              )
            ) : (
              "—"
            )}
          </span>
        </div>
        {priceImpact !== undefined && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Price impact</span>
            <span className={cn("tabular-nums", priceImpact > 10 ? "text-sell" : "text-muted-foreground")}>
              {priceImpact.toFixed(2)}%
            </span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t("trade.slippage")}</span>
          <span className="text-muted-foreground">{slippage}%</span>
        </div>
        <p className="pt-1 text-[11px] text-muted-foreground">{t("trade.fee")}</p>
      </div>

      {quote.error && amountIn && <p className="mt-2 text-xs text-sell">{(quote.error as Error).message}</p>}

      <div className="mt-4">
        {!isConnected ? (
          <Button className="h-12 w-full text-base" onClick={openConnectModal}>
            {t("trade.connect")}
          </Button>
        ) : walletChainId !== chainId ? (
          <Button className="h-12 w-full text-base" variant="secondary" onClick={() => switchChainAsync({ chainId })}>
            {t("trade.wrongChain")}
          </Button>
        ) : (
          <Button
            className={cn("h-12 w-full text-base text-white", isBuy ? "bg-buy hover:bg-buy/90" : "bg-sell hover:bg-sell/90")}
            disabled={busy || !amountIn || !quote.data || insufficient}
            onClick={submit}
          >
            {busy && <Loader2 className="animate-spin" />}
            {insufficient ? "Insufficient balance" : cta}
          </Button>
        )}
      </div>
    </div>
  );
}
