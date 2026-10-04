import { NextResponse } from "next/server";
import { StorageNotConfiguredError, sniffImageType, storeImage, storeJson } from "@/lib/server/storage";
import { SITE_URL } from "@/lib/config";

export const runtime = "nodejs";

const MAX_IMAGE = 2 * 1024 * 1024;
const LIMITS = { name: 32, symbol: 12, description: 500, website: 200, twitter: 200, telegram: 200 } as const;

/** Accepts the create-coin form, stores image + metadata JSON, returns the metadata URI. */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "Image is required" }, { status: 400 });
  if (file.size > MAX_IMAGE) return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageType(buf);
  if (!mime) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });

  const fields: Record<string, string> = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const v = String(form.get(key) ?? "").trim();
    if (new TextEncoder().encode(v).length > max) {
      return NextResponse.json({ error: `${key} is too long` }, { status: 400 });
    }
    fields[key] = v;
  }
  if (!fields.name || !fields.symbol) {
    return NextResponse.json({ error: "Name and ticker are required" }, { status: 400 });
  }

  try {
    const image = await storeImage(buf, mime, SITE_URL);
    const metadataURI = await storeJson(
      {
        name: fields.name,
        symbol: fields.symbol,
        description: fields.description || undefined,
        image,
        website: fields.website || undefined,
        twitter: fields.twitter || undefined,
        telegram: fields.telegram || undefined,
      },
      SITE_URL,
    );
    return NextResponse.json({ metadataURI, image });
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) {
      console.error("upload rejected: PINATA_JWT is not set");
      return NextResponse.json({ error: "Image storage is not configured" }, { status: 503 });
    }
    console.error("upload failed", e);
    return NextResponse.json({ error: "Storage failed, try again" }, { status: 502 });
  }
}
