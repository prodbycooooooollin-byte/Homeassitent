import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";
import { getStore, saveStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ settings: getSettings(), steam: getStore().steam ?? null });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { settings?: Record<string, unknown>; disconnectSteam?: boolean };
  if (body.disconnectSteam) { delete getStore().steam; saveStore(); }
  const settings = body.settings ? updateSettings(body.settings) : getSettings();
  return NextResponse.json({ settings, steam: getStore().steam ?? null });
}
