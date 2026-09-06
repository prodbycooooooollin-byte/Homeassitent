import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validation";
import { jsonOk, parseBody, withApiErrors, ApiError } from "@/lib/api";
import { hashOpaqueToken, hashSecret } from "@/lib/codes";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: Request) {
  return withApiErrors(async () => {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const rl = consumeRateLimit(`reset:${ip}`, RATE_LIMITS.passwordReset.limit, RATE_LIMITS.passwordReset.windowMs);
    if (!rl.ok) throw new ApiError(429, "Zu viele Versuche. Bitte später erneut versuchen.");

    const { token, password } = await parseBody(req, resetPasswordSchema);
    const tokenHash = hashOpaqueToken(token);
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new ApiError(400, "Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
    }

    const passwordHash = await hashSecret(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    return jsonOk({ message: "Passwort wurde geändert. Du kannst dich jetzt anmelden." });
  });
}
