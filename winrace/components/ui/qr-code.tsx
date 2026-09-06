"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 160 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#050509", light: "#ffffff" } })
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return <div className="animate-pulse rounded-lg bg-white/10" style={{ width: size, height: size }} />;
  }

  // eslint-disable-next-line @next/next/no-img-element -- lokal generierte Daten-URL
  return <img src={dataUrl} width={size} height={size} alt="QR-Code für den Einladungslink" className="rounded-lg" />;
}
