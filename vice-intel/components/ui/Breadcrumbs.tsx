import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  const parent = [...items].reverse().find((i) => i.href);
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-fg-muted">
      {parent?.href ? (
        <Link href={parent.href} className="mr-1 rounded-lg p-1.5 hover:bg-white/5 hover:text-fg" aria-label={`Back to ${parent.label}`}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : null}
      <ol className="flex min-w-0 items-center gap-1 overflow-hidden">
        {items.map((it, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-faint" /> : null}
            {it.href ? (
              <Link href={it.href} className="truncate hover:text-fg">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-fg">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
