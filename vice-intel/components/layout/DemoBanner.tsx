import Link from "next/link";
import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="hide-standalone border-b border-status-demo/20 bg-status-demo/[0.07] text-status-demo">
      <p className="container-page flex items-center justify-center gap-2 py-1.5 text-center text-[12px] leading-snug">
        <FlaskConical aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span>
          Preview build: entries marked <strong className="font-semibold">Demo</strong> are sample data, not real GTA VI information.{" "}
          <Link href="/about#trust" className="underline underline-offset-2 hover:text-fg">How we label intel</Link>
        </span>
      </p>
    </div>
  );
}
