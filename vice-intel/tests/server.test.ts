import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { sniffImageType, validateImageUpload } from "@/lib/server/upload";
import { TTLCache } from "@/lib/server/cache";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3]);

describe("rate limiter", () => {
  it("allows up to the limit then blocks with retry-after", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl("a", 0).ok).toBe(true);
    expect(rl("a", 10).ok).toBe(true);
    const third = rl("a", 20);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBe(1);
    expect(rl("b", 20).ok).toBe(true);
    expect(rl("a", 1500).ok).toBe(true);
  });
});

describe("upload validation", () => {
  it("sniffs magic bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>....."))).toBeNull();
  });
  it("rejects missing, non-image and oversized files", async () => {
    expect((await validateImageUpload(null)).ok).toBe(false);
    const fake = new File([new TextEncoder().encode("#!/bin/sh echo hi there")], "x.png", { type: "image/png" });
    const r = await validateImageUpload(fake);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(415);
    const big = new File([new Uint8Array(9 * 1024 * 1024)], "big.png", { type: "image/png" });
    const r2 = await validateImageUpload(big);
    expect(!r2.ok && r2.status).toBe(413);
  });
  it("accepts a real PNG header", async () => {
    const r = await validateImageUpload(new File([PNG], "a.png", { type: "image/png" }));
    expect(r.ok).toBe(true);
  });
});

describe("ttl cache", () => {
  it("evicts least recently used", () => {
    const c = new TTLCache<number>(2, 1000);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
  });
});
