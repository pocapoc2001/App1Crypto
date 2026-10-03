import { readLocalFile } from "@/lib/server/storage";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  json: "application/json",
};

/** Serves locally stored uploads (dev fallback when Pinata is not configured). */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const data = await readLocalFile(name);
  if (!data) return new Response("Not found", { status: 404 });
  const ext = name.split(".").pop()!;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable", // content-addressed names
      "X-Content-Type-Options": "nosniff",
    },
  });
}
