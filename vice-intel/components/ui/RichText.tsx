import { Fragment, type ReactNode } from "react";
import Link from "next/link";

/**
 * Minimal, safe renderer for AI / composed answers: **bold**, _italic_,
 * "- " bullet lists, "1. " numbered lists and [kind:id] citations rendered as
 * links. No HTML is ever injected.
 */
export function RichText({ text, cite }: { text: string; cite?: (id: string) => { href: string; title: string } | undefined }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={list.ordered ? "my-2 list-decimal space-y-1.5 pl-5" : "my-2 list-disc space-y-1.5 pl-5 marker:text-violet-400"}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, cite)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    blocks.push(
      <p key={blocks.length} className="my-2 first:mt-0">
        {inline(line, cite)}
      </p>,
    );
  }
  flush();
  return <div className="text-[15px] leading-relaxed text-fg/90">{blocks}</div>;
}

function inline(s: string, cite?: (id: string) => { href: string; title: string } | undefined): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_|\[[a-z-]+:[a-z0-9-]+\])/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i} className="text-fg-muted">{p.slice(1, -1)}</em>;
    const c = /^\[([a-z-]+:[a-z0-9-]+)\]$/.exec(p);
    if (c) {
      const target = cite?.(c[1]);
      if (!target) return null;
      return (
        <Link key={i} href={target.href} title={target.title} className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded border border-violet-500/30 bg-violet-500/10 px-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20">
          {target.title}
        </Link>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}
