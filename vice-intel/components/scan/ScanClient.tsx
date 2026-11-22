"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CircleHelp, ClipboardPaste, ImageUp, RotateCcw, ScanLine, Search, ShieldAlert, Sparkles } from "lucide-react";
import type { SourceCard } from "@/lib/ai/retrieval";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { artUrl, KIND_META } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";

type Detection = { label: string; category: string; confidence: number; evidence: string; match: SourceCard | null };
type ScanResponse =
  | { mode: "ai"; isGameScreenshot: boolean; sceneDescription: string; detections: Detection[]; visibleText: string[]; suggestedQueries: string[] }
  | { mode: "unavailable"; reason: string; message: string };

type Phase = { s: "idle" } | { s: "preparing" | "uploading" | "analysing"; preview: string } | { s: "done"; preview: string; res: ScanResponse } | { s: "error"; preview?: string; message: string };

const MAX_EDGE = 1600;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif";

/** Downscale on the device: faster uploads on mobile data, smaller AI cost, and converts HEIC where the browser can decode it. */
async function prepare(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && /image\/(jpeg|png|webp)/.test(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    return blob ?? file;
  } catch {
    return file;
  }
}

const CATEGORIES = [
  { kind: "unlock", label: "Vehicle / item" },
  { kind: "easter-egg", label: "Secret / oddity" },
  { kind: "mission", label: "Mission objective" },
  { kind: "location", label: "Place" },
];

export function ScanClient() {
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scan = useCallback(async (file: File) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const preview = URL.createObjectURL(file);
    setPhase({ s: "preparing", preview });
    try {
      const blob = await prepare(file);
      const form = new FormData();
      form.append("image", blob, "scan.jpg");
      setPhase({ s: "uploading", preview });
      const req = fetch("/api/scan", { method: "POST", body: form, signal: ctrl.signal });
      setTimeout(() => setPhase((p) => (p.s === "uploading" ? { s: "analysing", preview } : p)), 500);
      const res = await req;
      const body = await res.json().catch(() => ({ message: "Unexpected response from the server." }));
      if (!res.ok) throw new Error(body.message ?? "Scan failed.");
      setPhase({ s: "done", preview, res: body });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setPhase({ s: "error", preview, message: e instanceof Error ? e.message : "Scan failed." });
    }
  }, []);

  // Paste a screenshot from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) scan(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [scan]);

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) scan(f);
  };

  const reset = () => {
    abortRef.current?.abort();
    if ("preview" in phase && phase.preview) URL.revokeObjectURL(phase.preview);
    setPhase({ s: "idle" });
  };

  const busy = phase.s === "preparing" || phase.s === "uploading" || phase.s === "analysing";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      {/* Left: capture / preview */}
      <div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
        {phase.s === "idle" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFiles(e.dataTransfer.files);
            }}
            className={cn(
              "relative flex min-h-[440px] flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed px-6 py-10 text-center transition sm:aspect-[4/3] sm:min-h-0",
              dragging ? "border-violet-400 bg-violet-500/10" : "border-violet-500/30 bg-ink-900/60",
            )}
          >
            <Brackets />
            <div className="relative mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-violet-500/15 text-violet-300">
              <span className="absolute inset-0 animate-pulse-ring rounded-2xl border border-violet-400/50" />
              <ScanLine className="h-8 w-8" />
            </div>
            <p className="font-display text-xl font-semibold">Point, shoot, know.</p>
            <p className="mt-1 max-w-sm text-sm text-fg-muted">Photograph your TV or upload a screenshot. Vehicles, places, objectives and oddities — Intel tells you what it can see, and how sure it is.</p>
            <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => cameraRef.current?.click()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold text-white shadow-glow-sm hover:bg-violet-400">
                <Camera className="h-5 w-5" /> Take photo
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 font-semibold hover:border-violet-400/50">
                <ImageUp className="h-5 w-5" /> Upload
              </button>
            </div>
            <p className="mt-4 hidden items-center gap-1.5 text-xs text-fg-faint sm:flex">
              <ClipboardPaste className="h-3.5 w-3.5" /> Or drop an image here, or paste with ⌘/Ctrl + V
            </p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-black">
            {"preview" in phase && phase.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={phase.preview} alt="Your uploaded screenshot" className={cn("max-h-[70vh] w-full object-contain transition duration-500", busy && "scale-[1.01] opacity-80 saturate-50")} />
            ) : (
              <div className="aspect-[4/3]" />
            )}
            {busy ? (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgb(168_85_247/0.08)_1px,transparent_1px),linear-gradient(90deg,rgb(168_85_247/0.08)_1px,transparent_1px)] bg-[size:28px_28px]" />
                <div className="absolute inset-x-0 h-24 -translate-y-full animate-scanline bg-gradient-to-b from-transparent via-violet-500/25 to-violet-400/60 [box-shadow:0_8px_24px_rgb(168_85_247/0.6)]" style={{ top: 0 }} />
                <Brackets />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 text-sm font-medium">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                  {phase.s === "preparing" ? "Optimising image…" : phase.s === "uploading" ? "Uploading…" : "Analysing what's visible…"}
                </div>
              </div>
            ) : null}
            <button type="button" onClick={reset} className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 text-sm backdrop-blur hover:bg-black/80">
              <RotateCcw className="h-4 w-4" /> New scan
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-fg-faint">Images are analysed in memory and never stored. Max 8 MB · JPEG, PNG, WebP, GIF.</p>
      </div>

      {/* Right: results */}
      <div aria-live="polite">
        {phase.s === "idle" ? <Tips /> : null}
        {busy ? <ResultSkeleton /> : null}
        {phase.s === "error" ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-status-unverified/30 bg-status-unverified/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-unverified" />
              <div>
                <p className="font-medium text-fg">Scan didn&apos;t work</p>
                <p className="mt-0.5 text-fg-muted">{phase.message}</p>
              </div>
            </div>
            <ManualRefine />
          </div>
        ) : null}
        {phase.s === "done" ? <Results res={phase.res} /> : null}
      </div>
    </div>
  );
}

function Brackets() {
  const c = "absolute h-8 w-8 border-violet-400/80";
  return (
    <>
      <span className={cn(c, "left-4 top-4 rounded-tl-xl border-l-2 border-t-2")} />
      <span className={cn(c, "right-4 top-4 rounded-tr-xl border-r-2 border-t-2")} />
      <span className={cn(c, "bottom-4 left-4 rounded-bl-xl border-b-2 border-l-2")} />
      <span className={cn(c, "bottom-4 right-4 rounded-br-xl border-b-2 border-r-2")} />
    </>
  );
}

function Tips() {
  return (
    <div className="surface p-5">
      <p className="eyebrow mb-3">For the best results</p>
      <ul className="space-y-3 text-sm text-fg/90">
        {[
          ["Fill the frame", "Get the vehicle, sign or objective text as large as possible."],
          ["Avoid glare", "Tilt your phone slightly to dodge TV reflections."],
          ["Include HUD text", "Mission objectives and prompts help identification the most."],
          ["Screenshots beat photos", "Share a console screenshot to your phone when you can."],
        ].map(([t, d]) => (
          <li key={t} className="flex gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
            <span>
              <span className="font-medium">{t}.</span> <span className="text-fg-muted">{d}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="surface space-y-3 p-5" aria-label="Analysing">
      <div className="skeleton h-5 w-1/3" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-10/12" />
      <div className="skeleton mt-5 h-20 w-full rounded-xl" />
      <div className="skeleton h-20 w-full rounded-xl" />
    </div>
  );
}

function confidenceLabel(c: number) {
  if (c >= 0.8) return { label: "High confidence", tone: "bg-status-verified" };
  if (c >= 0.5) return { label: "Possible match", tone: "bg-status-estimate" };
  return { label: "Low confidence", tone: "bg-status-unverified" };
}

function Results({ res }: { res: ScanResponse }) {
  if (res.mode === "unavailable") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-ink-850 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-status-estimate" />
          <div>
            <p className="font-medium text-fg">Recognition is offline on this server</p>
            <p className="mt-0.5 text-fg-muted">{res.message} Nothing was guessed.</p>
          </div>
        </div>
        <ManualRefine />
      </div>
    );
  }
  const matched = res.detections.filter((d) => d.match);
  const unmatched = res.detections.filter((d) => !d.match);
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="surface p-5">
        <p className="eyebrow mb-1">What Intel sees</p>
        <p className="text-[15px] text-fg/90">{res.sceneDescription}</p>
        {!res.isGameScreenshot ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-status-estimate">
            <CircleHelp className="h-4 w-4" /> This doesn&apos;t look like a GTA VI screenshot.
          </p>
        ) : null}
      </div>

      {matched.length ? (
        <div>
          <p className="eyebrow mb-2">Matches in the knowledge base</p>
          <ul className="space-y-2">
            {matched.map((d, i) => (
              <DetectionRow key={i} d={d} />
            ))}
          </ul>
        </div>
      ) : null}

      {unmatched.length ? (
        <div>
          <p className="eyebrow mb-2">{matched.length ? "Also spotted" : "Spotted — no matching record yet"}</p>
          <ul className="space-y-2">
            {unmatched.map((d, i) => (
              <DetectionRow key={i} d={d} />
            ))}
          </ul>
        </div>
      ) : null}

      {res.detections.length === 0 ? <p className="surface p-4 text-sm text-fg-muted">Nothing recognisable was found. Try a sharper image, or search manually below.</p> : null}

      {res.visibleText.length ? (
        <div className="surface p-4">
          <p className="eyebrow mb-2">Text on screen</p>
          <div className="flex flex-wrap gap-2">
            {res.visibleText.map((t) => (
              <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="chip font-mono text-xs">
                “{t}”
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {res.suggestedQueries.length ? (
        <div className="flex flex-wrap gap-2">
          {res.suggestedQueries.map((q) => (
            <Link key={q} href={`/search?q=${encodeURIComponent(q)}`} className="chip">
              <Search className="h-3.5 w-3.5 text-violet-400" /> {q}
            </Link>
          ))}
        </div>
      ) : null}
      <ManualRefine compact />
    </div>
  );
}

function DetectionRow({ d }: { d: Detection }) {
  const c = confidenceLabel(d.confidence);
  const inner = (
    <>
      {d.match?.art ? (
        <span className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-ink-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artUrl(d.match.art.scene, d.match.art.seed)} alt="" className="h-full w-full object-cover" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{d.match ? d.match.title : d.label}</span>
          {d.match ? <StatusBadge status={d.match.status} size="sm" short /> : <span className="text-[11px] capitalize text-fg-faint">{d.category.replace("-", " ")}</span>}
        </span>
        {d.match ? <span className="block text-xs text-fg-faint">Seen as “{d.label}” · {KIND_META[d.match.kind].label}</span> : null}
        <span className="mt-1 block text-xs text-fg-muted">{d.evidence}</span>
        <span className="mt-2 flex items-center gap-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
            <span className={cn("block h-full rounded-full", c.tone)} style={{ width: `${Math.round(d.confidence * 100)}%` }} />
          </span>
          <span className="text-[11px] text-fg-faint">
            {c.label} · {Math.round(d.confidence * 100)}%
          </span>
        </span>
      </span>
    </>
  );
  return (
    <li>
      {d.match ? (
        <Link href={d.match.href} className="surface flex items-start gap-3 p-3 transition hover:border-violet-500/30">
          {inner}
        </Link>
      ) : (
        <Link href={`/search?q=${encodeURIComponent(d.label)}`} className="surface flex items-start gap-3 p-3 transition hover:border-violet-500/30">
          {inner}
        </Link>
      )}
    </li>
  );
}

function ManualRefine({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  return (
    <form
      className="surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}${kind ? `&kind=${kind}` : ""}`);
      }}
    >
      <p className="font-medium">{compact ? "Not quite right? Refine manually" : "Describe what you see"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button key={c.kind} type="button" aria-pressed={kind === c.kind} onClick={() => setKind((k) => (k === c.kind ? "" : c.kind))} className={cn("chip py-1 text-[13px]", kind === c.kind && "chip-active")}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. purple supercar outside a club"
          aria-label="Describe what you see"
          className="h-11 flex-1 rounded-xl border border-white/10 bg-ink-900 px-3 text-[15px] placeholder:text-fg-faint focus:border-violet-500/50 focus:outline-none"
        />
        <button type="submit" className="rounded-xl bg-violet-500 px-4 font-semibold text-white hover:bg-violet-400 disabled:opacity-40" disabled={!q.trim()}>
          Search
        </button>
      </div>
    </form>
  );
}
