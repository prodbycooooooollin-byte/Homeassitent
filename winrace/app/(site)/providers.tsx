"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
