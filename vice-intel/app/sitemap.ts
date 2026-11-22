import type { MetadataRoute } from "next";
import { getAll, hrefFor } from "@/lib/content/repository";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/missions", "/unlocks", "/easter-eggs", "/money", "/map", "/scan", "/about"].map((p) => ({ url: `${SITE_URL}${p}` }));
  // Demo records are excluded from indexing.
  const records = getAll()
    .filter((e) => e.verification.status !== "demo")
    .map((e) => ({ url: `${SITE_URL}${hrefFor(e)}`, lastModified: e.updatedAt }));
  return [...staticRoutes, ...records];
}
