import { NextResponse } from "next/server";
import { getAssets } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getAssets());
}
