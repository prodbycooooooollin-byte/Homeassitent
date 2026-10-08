import { describe, expect, it } from "vitest";
import { effectiveAccount, resolvePrimary } from "./primary";

const P = (accountId: number, addedAt?: number) => ({ accountId, addedAt });

describe("resolvePrimary", () => {
  it("leer -> null", () => expect(resolvePrimary([], 5, 6)).toBeNull());
  it("Steam-Konto, wenn nichts gespeichert", () => expect(resolvePrimary([P(1, 1), P(2, 2)], null, 2)).toBe(2));
  it("explizite Markierung schlägt Steam", () => expect(resolvePrimary([P(1, 1), P(2, 2)], 1, 2)).toBe(1));
  it("gespeicherte Markierung, wenn getrackt", () => expect(resolvePrimary([P(1, 1), P(2, 2)], 2, null)).toBe(2));
  it("ungültige Markierung -> zuerst hinzugefügter", () => expect(resolvePrimary([P(2, 20), P(1, 10)], 99, 77)).toBe(1));
  it("ein später hinzugefügter Fremder wird nie primär", () => expect(resolvePrimary([P(1, 1), P(9, 99)], 1, null)).toBe(1));
});

describe("effectiveAccount", () => {
  it("fällt ohne Auswahl auf primär", () => expect(effectiveAccount([P(1), P(2)], 1, null)).toBe(1));
  it("temporäre Auswahl bleibt, solange getrackt", () => expect(effectiveAccount([P(1), P(2)], 1, 2)).toBe(2));
  it("entfernte Auswahl -> primär", () => expect(effectiveAccount([P(1)], 1, 2)).toBe(1));
});
