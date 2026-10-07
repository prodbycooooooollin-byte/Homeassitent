import crypto from "crypto";
import fs from "fs";
import path from "path";
import { dataDir } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Bild-Proxy mit Platten-Cache: nur bekannte Asset-/Steam-Hosts, übersteht Offline-Phasen. */
const ALLOWED = [/(^|\.)deadlock-api\.com$/i, /(^|\.)steamstatic\.com$/i, /(^|\.)akamaihd\.net$/i, /(^|\.)steamcdn-a\.akamaihd\.net$/i];
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" };

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED.some((re) => re.test(target.hostname))) {
    return new Response("host not allowed", { status: 403 });
  }
  const key = crypto.createHash("sha1").update(target.href).digest("hex");
  const ext = (path.extname(target.pathname).slice(1) || "png").toLowerCase();
  const dir = path.join(dataDir(), "img-cache");
  const file = path.join(dir, `${key}.${ext}`);
  const headers = { "content-type": TYPES[ext] ?? "image/png", "cache-control": "public, max-age=604800, immutable" };
  try {
    return new Response(new Uint8Array(fs.readFileSync(file)), { headers });
  } catch {}
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return new Response("upstream", { status: 404 });
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, buf);
    } catch {}
    return new Response(new Uint8Array(buf), { headers: { ...headers, "content-type": res.headers.get("content-type") ?? headers["content-type"] } });
  } catch {
    return new Response("unreachable", { status: 404 });
  }
}
