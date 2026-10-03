import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Token image + metadata storage.
 *  - With PINATA_JWT set: pinned to IPFS, returns ipfs:// URIs (production).
 *  - Otherwise: written to web/.uploads and served by /api/files/[name] (local development).
 */
const UPLOAD_DIR = join(process.cwd(), ".uploads");
export const FILE_NAME_RE = /^[a-f0-9]{32}\.(png|jpg|gif|webp|json)$/;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Validate by magic bytes, not by the client-supplied MIME type. */
export function sniffImageType(buf: Buffer): keyof typeof EXT | undefined {
  if (buf.length < 12) return undefined;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  return undefined;
}

const hash = (data: Buffer | string) => createHash("sha256").update(data).digest("hex").slice(0, 32);

async function pinata(path: string, body: BodyInit, json: boolean) {
  const res = await fetch(`https://api.pinata.cloud/pinning/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PINATA_JWT}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });
  if (!res.ok) throw new Error(`Pinata error ${res.status}`);
  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return `ipfs://${IpfsHash}`;
}

export async function storeImage(buf: Buffer, mime: keyof typeof EXT, siteUrl: string): Promise<string> {
  if (process.env.PINATA_JWT) {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(buf)], { type: mime }), `image.${EXT[mime]}`);
    return pinata("pinFileToIPFS", form, false);
  }
  const name = `${hash(buf)}.${EXT[mime]}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, name), buf);
  return `${siteUrl}/api/files/${name}`;
}

export async function storeJson(obj: unknown, siteUrl: string): Promise<string> {
  const text = JSON.stringify(obj);
  if (process.env.PINATA_JWT) {
    return pinata("pinJSONToIPFS", JSON.stringify({ pinataContent: obj }), true);
  }
  const name = `${hash(text)}.json`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, name), text);
  return `${siteUrl}/api/files/${name}`;
}

export async function readLocalFile(name: string): Promise<Buffer | undefined> {
  if (!FILE_NAME_RE.test(name)) return undefined;
  try {
    return await readFile(join(UPLOAD_DIR, name));
  } catch {
    return undefined;
  }
}
