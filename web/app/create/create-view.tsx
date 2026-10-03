"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CheckCircle2, ImagePlus, Loader2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatEther, parseEther, parseEventLogs } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { TOTAL_SUPPLY, launchFactoryAbi } from "@app1/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActiveChain } from "@/lib/active-chain";
import { chainName, deploymentFor, slugFor } from "@/lib/config";
import { formatValue } from "@/lib/format";
import { useEthPrice } from "@/lib/metadata";
import { useT } from "@/lib/i18n";
import { describeError } from "@/lib/trade";
import { cn } from "@/lib/utils";

const MAX_IMAGE = 2 * 1024 * 1024;

export function CreateView() {
  const { t } = useT();
  const router = useRouter();
  const { chainId } = useActiveChain();
  const d = deploymentFor(chainId);
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId });
  const { data: ethUsd } = useEthPrice();
  const fileRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", symbol: "", description: "", website: "", twitter: "", telegram: "" });
  const [devBuy, setDevBuy] = useState("");
  const [step, setStep] = useState<"idle" | "upload" | "sign" | "mine">("idle");

  const config = useReadContract({
    address: d?.factory,
    abi: launchFactoryAbi,
    functionName: "getConfig",
    chainId,
    query: { enabled: Boolean(d) },
  });

  const cfg = config.data;
  const startMcapEth = cfg ? Number(formatEther(cfg.startingMarketCap)) : 1.5;
  const feeFrac = cfg ? cfg.feeBps / 10_000 : 0.01;
  const maxDevFrac = cfg ? cfg.maxDevBuyBps / 10_000 : 0.05;
  // Single-range curve: tokens bought with Δ (net of fee) = supply · Δ / (F + Δ)
  const maxDevBuyEth = ((startMcapEth * maxDevFrac) / (1 - maxDevFrac) / (1 - feeFrac)) * 0.97;
  const devBuyEth = Number(devBuy) > 0 ? Number(devBuy) : 0;
  const devFrac = useMemo(() => {
    const net = devBuyEth * (1 - feeFrac);
    return net > 0 ? net / (startMcapEth + net) : 0;
  }, [devBuyEth, feeFrac, startMcapEth]);
  const devTooBig = devBuyEth > maxDevBuyEth;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: k === "symbol" ? e.target.value.toUpperCase().replace(/\s/g, "") : e.target.value }));

  function pickImage(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) {
      toast.error("Use a PNG, JPG, GIF or WEBP image.");
      return;
    }
    if (file.size > MAX_IMAGE) {
      toast.error("Image must be 2 MB or smaller.");
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  const valid =
    form.name.trim().length > 0 &&
    new TextEncoder().encode(form.name.trim()).length <= 32 &&
    form.symbol.length > 0 &&
    new TextEncoder().encode(form.symbol).length <= 12 &&
    Boolean(image) &&
    !devTooBig;

  async function submit() {
    if (!d || !address || !publicClient || !cfg || !image) return;
    try {
      if (walletChainId !== chainId) await switchChainAsync({ chainId });

      setStep("upload");
      const body = new FormData();
      body.set("image", image);
      for (const [k, v] of Object.entries(form)) body.set(k, v.trim());
      const up = await fetch("/api/upload", { method: "POST", body });
      const upJson = (await up.json()) as { metadataURI?: string; error?: string };
      if (!up.ok || !upJson.metadataURI) throw new Error(upJson.error ?? "Upload failed");

      setStep("sign");
      const devWei = devBuyEth > 0 ? parseEther(devBuy) : 0n;
      const expectedTokens = BigInt(Math.floor(devFrac * 1e9)) * 10n ** 18n;
      const minDevBuyTokens = devWei > 0n ? (expectedTokens * 90n) / 100n : 0n; // 10% tolerance
      const hash = await writeContractAsync({
        chainId,
        address: d.factory,
        abi: launchFactoryAbi,
        functionName: "launch",
        args: [{ name: form.name.trim(), symbol: form.symbol, metadataURI: upJson.metadataURI, minDevBuyTokens }],
        value: cfg.creationFee + devWei,
      });

      setStep("mine");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Launch transaction reverted");
      const [launched] = parseEventLogs({ abi: launchFactoryAbi, logs: receipt.logs, eventName: "TokenLaunched" });
      toast.success(`${form.name} is live!`);
      if (launched) router.push(`/token/${slugFor(chainId)}/${launched.args.token}`);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setStep("idle");
    }
  }

  const busy = step !== "idle";
  const stepLabel =
    step === "upload" ? t("create.uploading") : step === "sign" ? t("create.confirming") : step === "mine" ? t("create.mining") : t("create.submit");

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t("create.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("create.subtitle")}</p>
        </div>

        <div className="space-y-5 rounded-2xl border bg-card p-5">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickImage(e.dataTransfer.files[0]);
              }}
              className={cn(
                "grid size-32 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary",
                preview && "border-solid",
              )}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="preview" className="size-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-xs">
                  <ImagePlus className="size-6" />
                  {t("create.image")}
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">{t("create.name")}</Label>
                <Input id="name" maxLength={32} value={form.name} onChange={set("name")} placeholder="Doge Rocket" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="symbol">{t("create.symbol")}</Label>
                <Input id="symbol" maxLength={12} value={form.symbol} onChange={set("symbol")} placeholder="DROCK" />
              </div>
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("create.imageHint")}</p>

          <div className="space-y-1.5">
            <Label htmlFor="description">
              {t("create.description")} <span className="text-muted-foreground">({t("create.optional")})</span>
            </Label>
            <Textarea id="description" rows={3} maxLength={500} value={form.description} onChange={set("description")} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(["website", "twitter", "telegram"] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={k}>{t(`create.${k}`)}</Label>
                <Input id={k} maxLength={200} value={form[k]} onChange={set(k)} placeholder="https://" />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="devBuy">{t("create.devBuy")}</Label>
            <div className="relative">
              <Input
                id="devBuy"
                inputMode="decimal"
                placeholder="0.0"
                value={devBuy}
                onChange={(e) => setDevBuy(e.target.value.replace(",", "."))}
                className="pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">ETH</span>
            </div>
            <p className={cn("text-xs", devTooBig ? "text-sell" : "text-muted-foreground")}>
              {t("create.devBuyHint")} {devBuyEth > 0 && `≈ ${(devFrac * 100).toFixed(2)}% of supply. `}
              Max ≈ {maxDevBuyEth.toFixed(4)} ETH.
            </p>
          </div>

          {!isConnected ? (
            <Button size="lg" className="w-full" onClick={openConnectModal}>
              {t("trade.connect")}
            </Button>
          ) : !d ? (
            <p className="text-sm text-sell">Not deployed on this network.</p>
          ) : (
            <Button size="lg" className="w-full" disabled={!valid || busy || !cfg} onClick={submit}>
              {busy ? <Loader2 className="animate-spin" /> : <Rocket />}
              {stepLabel}
            </Button>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border bg-card p-5">
          <p className="font-semibold">{t("create.summary")}</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            {[
              `Network: ${chainName(chainId)}`,
              `Supply: ${(Number(TOTAL_SUPPLY / 10n ** 18n) / 1e9).toFixed(0)} billion, fixed forever`,
              `Starting market cap ≈ ${formatValue(startMcapEth, ethUsd)}`,
              `You earn ${cfg ? cfg.creatorShareBps / 100 : 50}% of the ${cfg ? cfg.feeBps / 100 : 1}% fee on every trade, in ETH`,
              "Liquidity locked forever — no rug possible",
              `Launch cost: ${cfg ? (cfg.creationFee === 0n ? "free (gas only)" : `${formatEther(cfg.creationFee)} ETH + gas`) : "…"}`,
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-buy" />
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-5 text-xs text-muted-foreground">
          Example: if your coin trades {formatValue(100, ethUsd)} of volume, it generates{" "}
          {formatValue(1, ethUsd)} in fees and you earn {formatValue(0.5, ethUsd)}. Claim any time from your profile.
        </div>
      </aside>
    </div>
  );
}
