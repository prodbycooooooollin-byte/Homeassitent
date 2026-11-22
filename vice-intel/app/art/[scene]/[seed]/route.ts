import { renderScene } from "@/lib/art/scene";
import { ART_SCENES, type ArtScene } from "@/lib/content/schema";

export const runtime = "nodejs";

export function GET(_req: Request, { params }: { params: { scene: string; seed: string } }) {
  const scene = params.scene as ArtScene;
  const seed = Number.parseInt(params.seed.replace(/\.svg$/, ""), 10);
  if (!ART_SCENES.includes(scene) || !Number.isFinite(seed) || seed < 0 || seed > 1_000_000) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(renderScene(scene, seed), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
