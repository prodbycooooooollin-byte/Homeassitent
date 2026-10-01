import { expect, type Page } from "@playwright/test";

export const FAKE = "http://127.0.0.1:18124";

export async function fake(path: string, body?: unknown) {
  const r = await fetch(`${FAKE}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json();
}

export async function apiProject(page: Page) {
  const r = await page.request.get("/api/project");
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as { project: { updatedAt: string; rooms: { id: string; name: string; vertices: { x: number; y: number }[] }[]; items: { id: string; name: string; width: number }[]; bindings: unknown[]; meters: unknown[] }; revision: number };
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
}

export async function tab(page: Page, name: "Zuhause" | "Gestalten" | "Energie" | "Geräte") {
  await page.getByRole("navigation", { name: "Hauptbereiche" }).getByRole("button", { name }).click();
}

export async function screenOf(page: Page, kind: "item" | "opening" | "room", id: string) {
  await page.waitForFunction(() => !!(window as unknown as { __lh?: unknown }).__lh);
  return page.evaluate(([k, i]) => (window as unknown as { __lh: { screenOf: (k: string, i: string) => { x: number; y: number } | null } }).__lh.screenOf(k, i), [kind, id] as const);
}
