import { expect, it } from "vitest";
import { parseAccountId } from "./steamid";

it("parses steam32, steam64 and profile urls", () => {
  expect(parseAccountId("123456")).toBe(123456);
  expect(parseAccountId("76561197960265728")).toBeNull();
  expect(parseAccountId("76561198000000000")).toBe(39734272);
  expect(parseAccountId("https://steamcommunity.com/profiles/76561198000000000/")).toBe(39734272);
  expect(parseAccountId("vanityname")).toBeNull();
});
