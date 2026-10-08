import { NextResponse } from "next/server";
import { steamLoginUrl } from "@/lib/steam-openid";

export const dynamic = "force-dynamic";

/** Leitet zur Steam-Anmeldung (OpenID) weiter – Steam sendet den Nutzer danach zu /api/steam/callback zurück. */
export async function GET(req: Request) {
  return NextResponse.redirect(steamLoginUrl(new URL(req.url).origin));
}
