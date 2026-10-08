import { describe, expect, it } from "vitest";
import { steamLoginUrl, verifySteamAssertion } from "./steam-openid";

const ORIGIN = "http://127.0.0.1:4321";
const good = () => new URLSearchParams({
  "openid.mode": "id_res", "openid.return_to": `${ORIGIN}/api/steam/callback`,
  "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000", "openid.sig": "x", "openid.signed": "a,b",
});
const steam = (text: string): typeof fetch => (async () => new Response(text)) as never;

describe("steam openid", () => {
  it("builds the login url with realm and return_to", () => {
    const u = new URL(steamLoginUrl(ORIGIN));
    expect(u.hostname).toBe("steamcommunity.com");
    expect(u.searchParams.get("openid.return_to")).toBe(`${ORIGIN}/api/steam/callback`);
    expect(u.searchParams.get("openid.realm")).toBe(ORIGIN);
  });
  it("accepts a confirmed assertion and returns the account id", async () => {
    const r = await verifySteamAssertion(good(), ORIGIN, steam("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"));
    expect(r).toEqual({ ok: true, steamId: "76561198000000000", accountId: 39734272 });
  });
  it("rejects when steam does not confirm, wrong return_to, spoofed identity or cancelled login", async () => {
    expect((await verifySteamAssertion(good(), ORIGIN, steam("is_valid:false"))).ok).toBe(false);
    const wrong = good(); wrong.set("openid.return_to", "http://evil.example/api/steam/callback");
    expect((await verifySteamAssertion(wrong, ORIGIN, steam("is_valid:true"))).ok).toBe(false);
    const fake = good(); fake.set("openid.claimed_id", "https://evil.example/openid/id/76561198000000000");
    expect((await verifySteamAssertion(fake, ORIGIN, steam("is_valid:true"))).ok).toBe(false);
    const cancel = new URLSearchParams({ "openid.mode": "cancel" });
    expect((await verifySteamAssertion(cancel, ORIGIN, steam("is_valid:true"))).error).toContain("abgebrochen");
  });
  it("reports unreachable steam", async () => {
    const boom = (async () => { throw new Error("offline"); }) as never;
    expect((await verifySteamAssertion(good(), ORIGIN, boom)).error).toContain("nicht erreichbar");
  });
});
