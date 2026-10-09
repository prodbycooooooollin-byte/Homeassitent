"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/** Next-Link mit Exit-Animation (Seite blendet aus, Fortschrittsbalken läuft) – kein hartes Neuladen. */
export function NavLink({ href, onClick, children, ...rest }: ComponentProps<typeof Link>) {
  const router = useRouter();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        const h = typeof href === "string" ? href : String(href);
        const same = typeof window !== "undefined" && h === window.location.pathname + window.location.search;
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || same || rest.target === "_blank") return;
        e.preventDefault();
        document.documentElement.classList.add("leaving");
        window.dispatchEvent(new Event("nav-start"));
        setTimeout(() => router.push(h), 120);
      }}
    >
      {children}
    </Link>
  );
}
