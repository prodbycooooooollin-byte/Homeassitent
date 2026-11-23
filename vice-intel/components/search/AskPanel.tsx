"use client";
import { Thumb } from "@/components/ui/Thumb";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RotateCcw, Send } from "lucide-react";
import type { SourceCard } from "@/lib/ai/retrieval";
import { RichText } from "@/components/ui/RichText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { KIND_META } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";

type Meta = { mode: "ai" | "retrieval"; reason?: string; intent: string; sources: SourceCard[]; cached?: boolean };

const REASON_TEXT: Record<string, string> = {
  ai_not_configured: "AI is not configured on this server — this answer is assembled directly from the knowledge base.",
  rate_limited: "You've hit the AI limit for a minute — this answer comes straight from the knowledge base.",
  no_records: "Nothing in the knowledge base matched, so the AI was not asked (it never answers from guesswork).",
};

export function AskPanel({
  query,
  context,
  compact = false,
  allowFollowUp = true,
  className,
}: {
  query: string;
  context?: { entityId?: string; objectiveId?: string };
  compact?: boolean;
  allowFollowUp?: boolean;
  className?: string;
}) {
  const [current, setCurrent] = useState(query);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "streaming" | "done" | "failed">("idle");
  const [followUp, setFollowUp] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (q: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setCurrent(q);
      setMeta(null);
      setText("");
      setError(null);
      setStatus("loading");
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, context }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? "Request failed");
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === "meta") {
              setMeta(ev);
              setStatus("streaming");
            } else if (ev.type === "delta") setText((t) => t + ev.text);
            else if (ev.type === "error") setError(ev.message);
            else if (ev.type === "done") setStatus("done");
          }
        }
        setStatus((s) => (s === "streaming" || s === "loading" ? "done" : s));
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setStatus("failed");
      }
    },
    [context],
  );

  useEffect(() => {
    if (query.trim().length >= 2) run(query);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, context?.entityId, context?.objectiveId]);

  const cite = (id: string) => {
    const s = meta?.sources.find((x) => x.id === id);
    return s ? { href: s.href, title: s.title } : undefined;
  };
  const usesDemo = meta?.sources.some((s) => s.status === "demo");

  return (
    <section aria-live="polite" aria-busy={status === "loading" || status === "streaming"} className={cn("surface-raised relative overflow-hidden", className)}>
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
      <div className={cn("relative", compact ? "p-4" : "p-5 sm:p-6")}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            {meta ? (meta.mode === "ai" ? "Intel answer" : "Knowledge-base answer") : "Intel answer"}
          </span>
          {meta ? <span className="text-xs text-fg-faint">{meta.intent} · grounded in {meta.sources.length} record{meta.sources.length === 1 ? "" : "s"}</span> : null}
          {status === "done" || status === "failed" ? (
            <button type="button" onClick={() => run(current)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-fg-faint hover:bg-white/5 hover:text-fg">
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </button>
          ) : null}
        </div>

        {current !== query ? <p className="mb-2 text-sm text-fg-muted">“{current}”</p> : null}

        {status === "loading" ? (
          <div className="space-y-2.5" aria-label="Loading answer">
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-9/12" />
            <div className="skeleton h-4 w-10/12" />
          </div>
        ) : null}

        {text ? (
          <div className={cn(status === "streaming" && "after:ml-0.5 after:inline-block after:h-4 after:w-1.5 after:animate-pulse after:bg-violet-400 after:align-middle")}>
            <RichText text={text} cite={cite} />
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-status-unverified/30 bg-status-unverified/10 p-3 text-sm text-status-unverified">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        ) : null}

        {meta?.reason && REASON_TEXT[meta.reason] ? <p className="mt-3 text-xs text-fg-faint">{REASON_TEXT[meta.reason]}</p> : null}
        {usesDemo && status === "done" ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-status-demo">
            <StatusBadge status="demo" size="sm" short /> Based on demo records — not real GTA VI information.
          </p>
        ) : null}

        {meta && meta.sources.length > 0 && !compact ? (
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <p className="eyebrow mb-2">Sources in the knowledge base</p>
            <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {meta.sources.map((s) => (
                <li key={s.id}>
                  <Link href={s.href} className="flex w-52 items-center gap-2.5 rounded-xl border border-white/[0.07] bg-ink-900/70 p-2 hover:border-violet-500/30">
                    <span className="h-10 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-700">
                      <Thumb src={s.src} art={s.art} className="h-full w-full" contain={s.kind === "unlock"} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="block truncate text-[11px] text-fg-faint">
                        {KIND_META[s.kind].label} · <span className="capitalize">{s.status}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {allowFollowUp && (status === "done" || status === "failed") ? (
          <form
            className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900/70 pl-3 pr-1.5 focus-within:border-violet-500/50"
            onSubmit={(e) => {
              e.preventDefault();
              if (followUp.trim().length >= 2) {
                run(followUp.trim());
                setFollowUp("");
              }
            }}
          >
            <input
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={compact ? "Describe where you're stuck…" : "Ask a follow-up…"}
              aria-label="Ask a follow-up question"
              className="h-11 flex-1 bg-transparent text-[15px] placeholder:text-fg-faint focus:outline-none"
            />
            <button type="submit" aria-label="Send" className="grid h-9 w-9 place-items-center rounded-lg bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40" disabled={followUp.trim().length < 2}>
              <Send className="h-4 w-4" />
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
