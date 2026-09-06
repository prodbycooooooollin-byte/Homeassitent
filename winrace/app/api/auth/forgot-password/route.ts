import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation";
import { jsonOk, parseBody, withApiErrors, ApiError } from "@/lib/api";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/codes";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sendMail, isSmtpConfigured } from "@/lib/mailer";

export async function POST(req: Request) {
  return withApiErrors(async () => {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const rl = consumeRateLimit(`forgot:${ip}`, RATE_LIMITS.passwordReset.limit, RATE_LIMITS.passwordReset.windowMs);
    if (!rl.ok) throw new ApiError(429, "Zu viele Anfragen. Bitte später erneut versuchen.");

    const { email } = await parseBody(req, forgotPasswordSchema);
    const user = await prisma.user.findUnique({ where: { email } });

    // Immer dieselbe Antwort – unabhängig davon, ob die Adresse existiert,
    // damit sich daraus nicht ableiten lässt, welche E-Mails registriert sind.
    const genericResponse = {
      message: "Falls ein Konto mit dieser E-Mail existiert, wurde eine Anleitung zum Zurücksetzen verschickt.",
    };

    if (!user) return jsonOk(genericResponse);

    const { token, tokenHash } = generateOpaqueToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password/${token}`;
    const mailResult = await sendMail({
      to: user.email,
      subject: "WinRace – Passwort zurücksetzen",
      text: `Hallo ${user.displayName},\n\nüber folgenden Link kannst du dein Passwort zurücksetzen (gültig für 1 Stunde):\n${resetUrl}\n\nWenn du das nicht warst, kannst du diese E-Mail ignorieren.`,
      html: `<p>Hallo ${user.displayName},</p><p>Über folgenden Link kannst du dein Passwort zurücksetzen (gültig für 1 Stunde):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Wenn du das nicht warst, kannst du diese E-Mail ignorieren.</p>`,
    });

    // Im Entwicklungsmodus ohne SMTP wird der Link direkt zurückgegeben, damit
    // sich der Flow ohne Mailserver testen lässt.
    if (!mailResult.delivered && !isSmtpConfigured() && process.env.NODE_ENV !== "production") {
      return jsonOk({ ...genericResponse, devResetUrl: resetUrl });
    }

    return jsonOk(genericResponse);
  });
}
