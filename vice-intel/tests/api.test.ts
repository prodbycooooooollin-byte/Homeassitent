import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const aiState = { configured: false, fail: false };
vi.mock("@/lib/ai/claude", () => ({
  aiConfigured: () => aiState.configured,
  AIRefusalError: class extends Error {},
  streamAnswer: async function* () {
    if (aiState.fail) throw new Error("boom");
    yield "Grounded ";
    yield "answer [unlock:demo-vortex-gt]";
  },
  scanImage: async () => ({
    isGameScreenshot: true,
    sceneDescription: "A purple supercar on a neon street.",
    detections: [
      { label: "purple supercar", category: "vehicle", catalogId: "unlock:demo-vortex-gt", confidence: 0.82, evidence: "Low wide body, violet light strip" },
      { label: "invented", category: "vehicle", catalogId: "unlock:does-not-exist", confidence: 1.4, evidence: "x" },
    ],
    visibleText: ["VICE"],
    suggestedQueries: ["purple supercar"],
  }),
}));

import { POST as ask } from "@/app/api/ask/route";
import { POST as scan } from "@/app/api/scan/route";
import { GET as searchApi } from "@/app/api/search/route";

async function readNdjson(res: Response) {
  const text = await res.text();
  return text.trim().split("\n").map((l) => JSON.parse(l));
}
const askReq = (body: unknown) => new Request("http://x/api/ask", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  aiState.configured = false;
  aiState.fail = false;
});

describe("/api/ask", () => {
  it("validates input", async () => {
    expect((await ask(askReq({ query: "" }))).status).toBe(400);
  });
  it("answers from the knowledge base when AI is not configured", async () => {
    const ev = await readNdjson(await ask(askReq({ query: "how do I unlock the vortex gt" })));
    expect(ev[0]).toMatchObject({ type: "meta", mode: "retrieval", reason: "ai_not_configured" });
    expect(ev[0].sources[0].id).toBe("unlock:demo-vortex-gt");
    expect(ev.find((e) => e.type === "delta").text).toContain("luxury dealership");
  });
  it("streams AI answers grounded in sources", async () => {
    aiState.configured = true;
    const ev = await readNdjson(await ask(askReq({ query: "vortex gt price" })));
    expect(ev[0].mode).toBe("ai");
    expect(ev.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("Grounded answer [unlock:demo-vortex-gt]");
  });
  it("never asks the model when nothing matched", async () => {
    aiState.configured = true;
    const ev = await readNdjson(await ask(askReq({ query: "qqqzzzxx wwwvvv" })));
    expect(ev[0]).toMatchObject({ mode: "retrieval", reason: "no_records" });
  });
  it("degrades gracefully when the model fails", async () => {
    aiState.configured = true;
    aiState.fail = true;
    const ev = await readNdjson(await ask(askReq({ query: "crashed saucer location" })));
    expect(ev.some((e) => e.type === "error")).toBe(true);
    expect(ev.find((e) => e.type === "delta").text).toContain("Crashed Saucer");
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1]);
const scanReq = () => {
  const fd = new FormData();
  fd.append("image", new File([PNG], "a.png", { type: "image/png" }));
  return new Request("http://x/api/scan", { method: "POST", body: fd, headers: { "x-forwarded-for": `1.2.3.${Math.random()}` } });
};

describe("/api/scan", () => {
  it("reports unavailable instead of simulating recognition", async () => {
    const body = await (await scan(scanReq())).json();
    expect(body.mode).toBe("unavailable");
  });
  it("drops catalog ids the model invented and clamps confidence", async () => {
    aiState.configured = true;
    const body = await (await scan(scanReq())).json();
    expect(body.detections[0].match).toBeNull(); // invented id, confidence clamped to 1 → sorted first
    expect(body.detections[0].confidence).toBe(1);
    expect(body.detections[1].match.id).toBe("unlock:demo-vortex-gt");
  });
});

describe("/api/search", () => {
  it("returns typed results", async () => {
    const body = await (await searchApi(new Request("http://x/api/search?q=saucr&kinds=easter-egg"))).json();
    expect(body.results[0].id).toBe("easter-egg:demo-crashed-saucer");
    expect(body.didYouMean).toBe("saucer");
  });
});
