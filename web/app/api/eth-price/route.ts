import { NextResponse } from "next/server";

/** ETH/USD for display only (cached for 60 s). Same CoinGecko source CoinFlow used. */
export async function GET() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { ethereum?: { usd?: number } };
    return NextResponse.json({ usd: data.ethereum?.usd ?? null });
  } catch {
    return NextResponse.json({ usd: null });
  }
}
