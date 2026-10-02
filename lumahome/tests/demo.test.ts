import { describe, expect, it } from "vitest";
import { demoProject } from "@/demo/house";
import { parseProject } from "@/model/schema";
import { validateProject } from "@/geometry/validate";

describe("Demo-Projekt", () => {
  it("ist ein gültiges Projekt", () => {
    const r = parseProject(demoProject());
    if (!r.ok) console.log(r.errors);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });
  it("enthält keine Plan-Fehler oder Platzierungsprobleme", () => {
    const issues = validateProject(demoProject());
    if (issues.length) console.log(issues.map((i) => i.message));
    expect(issues).toEqual([]);
  });
});
