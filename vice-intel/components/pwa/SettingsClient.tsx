"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, KeyRound, RefreshCw } from "lucide-react";
import { SpoilerToggle } from "@/components/detail/Spoiler";
import { Panel } from "@/components/ui/Section";

interface DesktopApi {
  info: () => Promise<{ version: string; hasApiKey: boolean }>;
  setApiKey: (key: string) => Promise<{ ok: boolean }>;
  checkForUpdates: () => Promise<{ status: string; latest?: string; message?: string }>;
}

export function SettingsClient() {
  const [desktop, setDesktop] = useState<DesktopApi | null>(null);
  const [info, setInfo] = useState<{ version: string; hasApiKey: boolean } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<string | null>(null);
  const saved = useSearchParams().get("saved") === "1";

  useEffect(() => {
    const api = (window as unknown as { viceIntelDesktop?: DesktopApi }).viceIntelDesktop;
    if (api) {
      setDesktop(api);
      api.info().then(setInfo);
    }
  }, []);

  return (
    <div className="mt-6 space-y-5">
      <Panel title="Preferences">
        <p className="mb-3 text-sm text-fg-muted">Stored on this device only.</p>
        <SpoilerToggle />
      </Panel>

      {desktop ? (
        <>
          <Panel title="AI features" icon={<KeyRound className="h-4 w-4" />}>
            <p className="text-sm text-fg-muted">
              Add an Anthropic API key to enable AI answers and Intel Scan. The key stays on this PC (in your user profile) and is only sent to Anthropic.
              Without a key, answers come straight from the knowledge base.
            </p>
            {saved ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-status-verified">
                <Check className="h-4 w-4" /> Saved — the app restarted its engine.
              </p>
            ) : null}
            <p className="mt-3 text-sm">
              Status: {info?.hasApiKey ? <span className="text-status-verified">key configured</span> : <span className="text-fg-faint">no key</span>}
            </p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                await desktop.setApiKey(key);
                setBusy(false);
              }}
            >
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-ant-…"
                aria-label="Anthropic API key"
                autoComplete="off"
                className="h-11 flex-1 rounded-xl border border-white/10 bg-ink-900 px-3 text-[15px] placeholder:text-fg-faint focus:border-violet-500/50 focus:outline-none"
              />
              <button type="submit" disabled={busy} className="rounded-xl bg-violet-500 px-4 font-semibold text-white hover:bg-violet-400 disabled:opacity-50">
                {busy ? "Saving…" : key ? "Save" : "Remove"}
              </button>
            </form>
          </Panel>

          <Panel title="Updates" icon={<RefreshCw className="h-4 w-4" />}>
            <p className="text-sm text-fg-muted">
              Version <span className="text-fg">{info?.version ?? "…"}</span>. VICE INTEL checks for updates on start and every few hours, downloads them in the background and asks you
              to restart.
            </p>
            <button
              type="button"
              onClick={async () => {
                setUpdate("Checking…");
                const r = await desktop.checkForUpdates();
                setUpdate(
                  r.status === "current"
                    ? "You're on the latest version."
                    : r.status === "downloading"
                      ? `Version ${r.latest} is downloading — you'll be asked to restart.`
                      : r.status === "dev"
                        ? "Updates are disabled in development builds."
                        : `Couldn't check: ${r.message}`,
                );
              }}
              className="chip mt-3"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Check now
            </button>
            {update ? <p className="mt-2 text-sm text-fg-muted">{update}</p> : null}
          </Panel>
        </>
      ) : (
        <Panel title="Get the app">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
            <li>
              <span className="text-fg">Windows:</span> download <code>VICE-INTEL-Setup.exe</code> from the project&apos;s GitHub Releases. It updates itself.
            </li>
            <li>
              <span className="text-fg">Phone:</span> open this site and choose &ldquo;Add to Home Screen&rdquo;.
            </li>
          </ul>
        </Panel>
      )}
    </div>
  );
}
