import nodemailer from "nodemailer";

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/**
 * Verschickt eine E-Mail, falls SMTP konfiguriert ist. Andernfalls wird der
 * Inhalt in die Server-Konsole geschrieben – praktisch für lokale
 * Entwicklung/Demo, ohne dass ein Mailserver nötig ist. Aufrufer (z.B.
 * Passwort-Reset) müssen so oder so mit "es kam eine Mail" antworten, damit
 * sich aus der Antwort keine Existenz von E-Mail-Adressen ableiten lässt.
 */
export async function sendMail(input: SendMailInput): Promise<{ delivered: boolean; devLink?: string }> {
  const t = getTransporter();
  if (!t) {
    console.log("\n──────── ✉️  WinRace Mail (Dev-Modus, kein SMTP konfiguriert) ────────");
    console.log("An:", input.to);
    console.log("Betreff:", input.subject);
    console.log(input.text);
    console.log("───────────────────────────────────────────────────────────────────\n");
    return { delivered: false };
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || "WinRace <no-reply@winrace.app>",
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  return { delivered: true };
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}
