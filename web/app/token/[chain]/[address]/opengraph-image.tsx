import { ImageResponse } from "next/og";
import { chainIdFromSlug } from "@app1/shared";
import { APP_NAME, INDEXER_URL, chainName } from "@/lib/config";

export const alt = "Coin preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Token = { name: string; symbol: string; marketCapEth: number; holderCount: number; volumeEth: number };

export default async function Image({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  const chainId = chainIdFromSlug(chain);
  let token: Token | null = null;
  try {
    const res = await fetch(`${INDEXER_URL}/tokens/${chainId}/${address}`, { next: { revalidate: 60 } });
    if (res.ok) token = (await res.json()) as Token;
  } catch {}

  const fmt = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 3 })} ETH`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "white",
          background: "linear-gradient(135deg, #0f1220 0%, #1d1b4b 55%, #0f3d2e 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, opacity: 0.85 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#6366f1", display: "flex" }} />
          {`${APP_NAME} · ${chainId ? chainName(chainId) : ""}`}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{token?.name ?? "New coin"}</div>
          <div style={{ fontSize: 48, marginTop: 12, color: "#a5b4fc" }}>{`$${token?.symbol ?? ""}`}</div>
        </div>
        <div style={{ display: "flex", gap: 64, fontSize: 32 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ opacity: 0.6, fontSize: 24 }}>Market cap</span>
            <span style={{ color: "#4ade80", fontWeight: 700 }}>{token ? fmt(token.marketCapEth) : "—"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ opacity: 0.6, fontSize: 24 }}>Holders</span>
            <span style={{ fontWeight: 700 }}>{token?.holderCount ?? "—"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ opacity: 0.6, fontSize: 24 }}>Liquidity</span>
            <span style={{ fontWeight: 700 }}>Locked forever</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
