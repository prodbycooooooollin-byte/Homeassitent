import { describe, expect, it } from "vitest";
import { search } from "@/lib/search/engine";
import { detectIntent } from "@/lib/search/intent";
import { editDistance, tokenize } from "@/lib/search/text";

describe("text utils", () => {
  it("tokenizes, stems and drops stopwords", () => {
    expect(tokenize("Where can I find the hidden UFOs?")).toEqual(["hidden", "ufo"]);
  });
  it("computes edit distance with transpositions", () => {
    expect(editDistance("saucer", "suacer")).toBe(1);
    expect(editDistance("kitten", "sitting", 3)).toBe(3);
  });
});

describe("intent detection", () => {
  it.each([
    ["where is the crashed saucer", "locate"],
    ["how do I unlock the marksman rifle", "unlock"],
    ["how do I complete low tide without getting detected", "mission"],
    ["best way to earn money early", "money"],
    ["show me easter eggs in vice city", "secret"],
  ])("%s → %s", (q, intent) => {
    expect(detectIntent(q).intent).toBe(intent);
  });
});

describe("search", () => {
  it("finds exact titles first", () => {
    expect(search("Crashed Saucer").hits[0].id).toBe("easter-egg:demo-crashed-saucer");
  });
  it("tolerates typos and suggests a correction", () => {
    const r = search("crashd sacuer");
    expect(r.hits[0].id).toBe("easter-egg:demo-crashed-saucer");
    expect(r.didYouMean).toBeDefined();
  });
  it("uses synonyms (ufo → saucer)", () => {
    expect(search("ufo").hits.map((h) => h.id)).toContain("easter-egg:demo-crashed-saucer");
  });
  it("boosts kinds by intent", () => {
    expect(search("how to make money with boats").hits[0].id.startsWith("money:")).toBe(true);
  });
  it("supports prefix search-as-you-type", () => {
    expect(search("vort", { prefix: true }).hits[0].id).toBe("unlock:demo-vortex-gt");
  });
  it("filters by kind", () => {
    expect(search("boat", { kinds: ["unlock"] }).hits.every((h) => h.id.startsWith("unlock:"))).toBe(true);
  });
  it("returns nothing for gibberish", () => {
    expect(search("qqqzzzxx").hits).toEqual([]);
  });
});
