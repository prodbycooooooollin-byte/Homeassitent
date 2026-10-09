import { NextResponse } from "next/server";
import { getStore, saveStore } from "@/lib/store";
import { METRICS } from "@/lib/training";
import type { Goal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ goals: getStore().goals ?? [] });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Partial<Goal>;
  const metric = METRICS.find((m) => m.id === b.metric);
  const target = Number(b.target), needed = Math.round(Number(b.needed)), win = Math.round(Number(b.window));
  if (!metric || !Number.isFinite(target) || !(needed >= 1) || !(win >= needed) || win > 50) return NextResponse.json({ error: "Ungültiges Ziel" }, { status: 400 });
  const store = getStore();
  const goal: Goal = { id: `g${Date.now().toString(36)}`, metric: metric.id, lowerIsBetter: metric.lowerIsBetter, target, needed, window: win, createdAt: Math.floor(Date.now() / 1000) };
  store.goals = [...(store.goals ?? []).slice(-11), goal];
  saveStore();
  return NextResponse.json({ goals: store.goals });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const store = getStore();
  store.goals = (store.goals ?? []).filter((g) => g.id !== id);
  saveStore();
  return NextResponse.json({ goals: store.goals });
}
