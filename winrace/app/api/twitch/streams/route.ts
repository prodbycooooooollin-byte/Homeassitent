import { jsonOk, withApiErrors } from "@/lib/api";
import { getLiveStreams, isTwitchConfigured } from "@/lib/twitch";

export async function GET(req: Request) {
  return withApiErrors(async () => {
    const { searchParams } = new URL(req.url);
    const logins = (searchParams.get("logins") ?? "").split(",").map((l) => l.trim()).filter(Boolean).slice(0, 100);

    if (!isTwitchConfigured() || logins.length === 0) {
      return jsonOk({ streams: Object.fromEntries(logins.map((l) => [l, { login: l, isLive: false }])), configured: isTwitchConfigured() });
    }

    const streams = await getLiveStreams(logins);
    return jsonOk({ streams: Object.fromEntries(streams), configured: true });
  });
}
