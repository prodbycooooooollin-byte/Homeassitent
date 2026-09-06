import { prisma } from "@/lib/prisma";
import { hashSecret } from "@/lib/codes";
import { registerSchema } from "@/lib/validation";
import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: Request) {
  return withApiErrors(async () => {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const rl = consumeRateLimit(`register:${ip}`, RATE_LIMITS.authAttempt.limit, RATE_LIMITS.authAttempt.windowMs);
    if (!rl.ok) throw new ApiError(429, "Zu viele Versuche. Bitte kurz warten.");

    const input = await parseBody(req, registerSchema);

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ApiError(409, "Für diese E-Mail-Adresse existiert bereits ein Konto.");

    const passwordHash = await hashSecret(input.password);
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash, displayName: input.displayName },
    });

    return jsonOk({ id: user.id, email: user.email, displayName: user.displayName });
  });
}
