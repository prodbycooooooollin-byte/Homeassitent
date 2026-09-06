"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast-context";
import { ReduceMotionSync } from "@/components/layout/reduce-motion-sync";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <ReduceMotionSync />
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
