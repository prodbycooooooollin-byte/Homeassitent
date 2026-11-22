import { describe, expect, it } from "vitest";
import { getAll, getById, getIssues, getRelated, hrefFor } from "@/lib/content/repository";

describe("content repository", () => {
  it("loads all records without integrity errors", () => {
    const errors = getIssues().filter((i) => i.level === "error");
    expect(errors).toEqual([]);
    expect(getAll().length).toBeGreaterThan(30);
  });

  it("never marks generated illustrations as authentic gameplay", () => {
    for (const e of getAll()) for (const m of e.media) if (m.art) expect(m.authenticGameplay).toBe(false);
  });

  it("only uses official status for records backed by official sources", () => {
    for (const e of getAll().filter((x) => x.verification.status === "official")) {
      expect(e.sources.length).toBeGreaterThan(0);
      expect(e.sources.every((s) => s.startsWith("rockstar-"))).toBe(true);
    }
  });

  it("keeps fictional records labelled as demo", () => {
    for (const e of getAll().filter((x) => x.kind !== "location" && x.kind !== "character")) {
      expect(e.verification.status).toBe("demo");
    }
  });

  it("resolves relations and backlinks", () => {
    const egg = getById("easter-egg:demo-crashed-saucer")!;
    const related = getRelated(egg).map((r) => r.id);
    expect(related).toContain("unlock:demo-alien-cap");
    expect(hrefFor(egg)).toBe("/easter-eggs/demo-crashed-saucer");
  });
});
