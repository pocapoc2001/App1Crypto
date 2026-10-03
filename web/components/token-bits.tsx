"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTokenMetadata } from "@/lib/metadata";
import { explorerUrl } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

const palette = ["#6366f1", "#22c55e", "#f59e0b", "#06b6d4", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];

/** Token image from metadata, with a deterministic colored fallback. */
export function TokenAvatar({
  uri,
  symbol,
  address,
  className,
}: {
  uri?: string;
  symbol: string;
  address: string;
  className?: string;
}) {
  const { data } = useTokenMetadata(uri || undefined);
  const [broken, setBroken] = useState(false);
  const color = palette[parseInt(address.slice(-2), 16) % palette.length];
  if (data?.image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.image}
        alt={symbol}
        onError={() => setBroken(true)}
        className={cn("size-12 shrink-0 rounded-xl object-cover bg-muted", className)}
      />
    );
  }
  return (
    <div
      className={cn("grid size-12 shrink-0 place-items-center rounded-xl font-bold text-white", className)}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      className={cn("inline-flex items-center text-muted-foreground hover:text-foreground", className)}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="size-3.5 text-buy" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function AddressLink({ address, className }: { address: string; className?: string }) {
  return (
    <Link href={`/profile/${address}`} className={cn("font-mono hover:text-primary hover:underline", className)}>
      {shortAddress(address)}
    </Link>
  );
}

export function ExplorerLink({
  chainId,
  kind,
  value,
  children,
}: {
  chainId: number;
  kind: "tx" | "address" | "token";
  value: string;
  children?: React.ReactNode;
}) {
  const url = explorerUrl(chainId, kind, value);
  if (!url) return <span className="font-mono text-muted-foreground">{children ?? shortAddress(value)}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono hover:text-primary hover:underline"
    >
      {children ?? shortAddress(value)}
      <ExternalLink className="size-3" />
    </a>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
