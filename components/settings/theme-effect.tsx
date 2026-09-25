"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/state/app-context";

/** Spiegelt settings.theme auf das <html data-theme> Attribut (siehe globals.css). */
export function ThemeEffect() {
  const { settings } = useApp();

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  return null;
}
