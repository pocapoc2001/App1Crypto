export function shortAddress(a?: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function formatUsd(x: number) {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "$0";
  if (x < 0.01) return `$${x.toPrecision(2)}`;
  if (x < 1000) return `$${x.toFixed(2)}`;
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(x)}`;
}

export function formatEth(x: number, digits = 4) {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0 ETH";
  if (Math.abs(x) < 0.0001) return `${x.toPrecision(2)} ETH`;
  return `${x.toLocaleString("en-US", { maximumFractionDigits: digits })} ETH`;
}

/** Shows USD when the ETH price is known, otherwise ETH. */
export function formatValue(eth: number, ethUsd: number | undefined) {
  return ethUsd ? formatUsd(eth * ethUsd) : formatEth(eth);
}

export function formatTokens(wei: bigint | string | number) {
  const n = Number(BigInt(wei)) / 1e18;
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

export function formatPrice(eth: number, ethUsd?: number) {
  const v = ethUsd ? eth * ethUsd : eth;
  const unit = ethUsd ? "$" : "";
  const suffix = ethUsd ? "" : " ETH";
  if (v === 0) return `${unit}0${suffix}`;
  if (v < 0.0001) {
    // 0.0₅1234 style: count zeros after the decimal point
    const s = v.toFixed(20);
    const m = s.match(/^0\.(0+)(\d{1,4})/);
    if (m) return `${unit}0.0${toSubscript(m[1]!.length)}${m[2]}${suffix}`;
  }
  return `${unit}${v.toPrecision(4)}${suffix}`;
}

function toSubscript(n: number) {
  return String(n)
    .split("")
    .map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])
    .join("");
}

export function timeAgo(unixSeconds: number | string | bigint) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - Number(unixSeconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function pct(part: bigint, whole: bigint) {
  if (whole === 0n) return 0;
  return Number((part * 1_000_000n) / whole) / 10_000;
}

/** Only allow plain http(s) links coming from user-provided metadata. */
export function safeExternalUrl(raw?: string) {
  if (!raw) return undefined;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
