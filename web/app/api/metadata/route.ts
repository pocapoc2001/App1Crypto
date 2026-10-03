import { NextResponse } from "next/server";
import { IPFS_GATEWAY, SITE_URL } from "@/lib/config";
import { readLocalFile } from "@/lib/server/storage";

export const runtime = "nodejs";

const MAX_BYTES = 32 * 1024;
const LOCAL_PREFIX = `${SITE_URL}/api/files/`;

function ipfsToHttp(uri: string) {
  return `${IPFS_GATEWAY.replace(/\/?$/, "/")}${uri.slice("ipfs://".length).replace(/^ipfs\//, "")}`;
}

/** Image URLs are rendered by the browser: allow only ipfs and https (plus our own local files). */
function resolveImage(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw.startsWith("ipfs://")) return ipfsToHttp(raw);
  if (raw.startsWith(LOCAL_PREFIX)) return raw;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/**
 * Resolves a token's metadataURI to sanitized JSON. To avoid SSRF this server only fetches from the
 * IPFS gateway or reads its own local uploads — never arbitrary URLs.
 */
export async function GET(req: Request) {
  const uri = new URL(req.url).searchParams.get("uri") ?? "";
  let text: string | undefined;

  try {
    if (uri.startsWith(LOCAL_PREFIX)) {
      text = (await readLocalFile(uri.slice(LOCAL_PREFIX.length)))?.toString("utf8");
    } else if (uri.startsWith("ipfs://")) {
      const res = await fetch(ipfsToHttp(uri), { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
      if (res.ok && Number(res.headers.get("content-length") ?? 0) <= MAX_BYTES) text = await res.text();
    } else if (uri.startsWith("data:application/json;base64,")) {
      text = Buffer.from(uri.slice("data:application/json;base64,".length), "base64").toString("utf8");
    }
  } catch {
    text = undefined;
  }

  if (!text || text.length > MAX_BYTES) return NextResponse.json({}, { status: 404 });
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({}, { status: 422 });
  }

  return NextResponse.json(
    {
      name: str(raw.name, 64),
      symbol: str(raw.symbol, 24),
      description: str(raw.description, 600),
      image: resolveImage(raw.image),
      website: str(raw.website, 200),
      twitter: str(raw.twitter, 200),
      telegram: str(raw.telegram, 200),
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
