import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { chainIdFromSlug } from "@app1/shared";
import { APP_NAME, INDEXER_URL } from "@/lib/config";
import { TokenView } from "./token-view";

type Params = { chain: string; address: string };

async function fetchToken(chainId: number, address: string) {
  try {
    const res = await fetch(`${INDEXER_URL}/tokens/${chainId}/${address}`, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    return (await res.json()) as { name: string; symbol: string; marketCapEth: number };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { chain, address } = await params;
  const chainId = chainIdFromSlug(chain);
  const token = chainId ? await fetchToken(chainId, address) : null;
  if (!token) return { title: "Coin" };
  const title = `${token.name} ($${token.symbol})`;
  const description = `Trade ${token.name} on ${APP_NAME}. Liquidity locked forever, fixed supply, creator earns 50% of fees.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { chain, address } = await params;
  const chainId = chainIdFromSlug(chain);
  if (!chainId || !/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();
  return <TokenView chainId={chainId} address={address as `0x${string}`} />;
}
