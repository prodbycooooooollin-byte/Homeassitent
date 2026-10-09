import { NextResponse } from "next/server";
import { getItems } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: await getItems() });
}
