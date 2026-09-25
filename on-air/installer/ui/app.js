// ON AIR Setup – Oberfläche. In der Desktop-App über window.__TAURI__, im Browser mit einer
// klar markierten Vorschau (?state=update|running|error|nopayload) für Screenshots und Tests.
(() => {
  "use strict";
  const T = window.__TAURI__;
  const preview = !T;
  const qs = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);

  const PHASES = {
    prepare: "Wird vorbereitet …",
    extract: "Dateien werden entpackt …",
    install: "ON AIR wird eingerichtet …",
    finish: "Verknüpfungen werden angelegt …",
    done: "Fertig",
  };

  // ---------- Backend (echt oder Vorschau) ----------
  const backend = preview
    ? {
        async info() {
          const s = qs.get("state");
          return {
            version: "0.2.7",
            payload_ok: s !== "nopayload",
            payload_mb: 9.4,
            installed: s === "update" ? { version: "0.2.0", location: "C:\\Users\\du\\AppData\\Local\\ON AIR" } : null,
            app_running: s === "running",
            platform_ok: true,
          };
        },
        async install(_opts, onProgress) {
          const steps = [["prepare", 5], ["extract", 22], ["extract", 38], ["install", 55], ["install", 71], ["finish", 86], ["finish", 93]];
          for (const [phase, pct] of steps) {
            onProgress({ phase, percent: pct });
            await new Promise((r) => setTimeout(r, 380));
          }
          if (qs.get("state") === "error") throw "Der Installer meldet einen Fehler (Code 2).";
          onProgress({ phase: "done", percent: 100 });
          return "0.2.7";
        },
        async launch() {},
        async classic() {},
        minimize() {},
        close() { document.body.style.opacity = "0.4"; },
        show() {},
      }
    : {
        info: () => T.core.invoke("setup_info"),
        async install(opts, onProgress) {
          const un = await T.event.listen("setup://progress", (e) => onProgress(e.payload));
          try {
            return await T.core.invoke("install", { desktopShortcut: opts.desktop });
          } finally {
            un();
          }
        },
        launch: () => T.core.invoke("launch"),
        classic: () => T.core.invoke("classic"),
        minimize: () => T.window.getCurrentWindow().minimize(),
        close: () => T.window.getCurrentWindow().close(),
        show: () => T.window.getCurrentWindow().show(),
      };

  // ---------- Zustand ----------
  let info = null;
  let busy = false;
  const setStep = (s) => (document.body.dataset.step = s);
  const setLevel = (pct) => $("lamp").style.setProperty("--level", String(0.18 + (pct / 100) * 0.62));
  const CIRC = 2 * Math.PI * 52;

  function progress({ phase, percent }) {
    const p = Math.max(0, Math.min(100, percent));
    $("ring-fg").style.strokeDashoffset = String(CIRC * (1 - p / 100));
    $("ring-pct").textContent = `${Math.round(p)} %`;
    $("ring").setAttribute("aria-valuenow", String(Math.round(p)));
    $("phase-title").textContent = PHASES[phase] ?? PHASES.install;
    setLevel(p);
  }

  function cmpVersion(a, b) {
    const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    return 0;
  }

  function renderWelcome() {
    $("version-chip").textContent = `Version ${info.version}${preview ? " · Vorschau" : ""}`;
    const inst = info.installed;
    if (inst?.version) {
      const c = cmpVersion(info.version, inst.version);
      if (c > 0) {
        $("welcome-title").textContent = "Update bereit";
        $("welcome-sub").textContent = `Von Version ${inst.version} auf ${info.version}. Einstellungen, Warteschlange und Anmeldungen bleiben erhalten.`;
        $("install-label").textContent = "Jetzt aktualisieren";
      } else {
        $("welcome-title").textContent = c === 0 ? "ON AIR ist schon installiert" : "Ältere Version installieren?";
        $("welcome-sub").textContent =
          c === 0 ? "Du kannst die Installation reparieren – deine Daten bleiben erhalten." : `Installiert ist bereits Version ${inst.version}. Eine ältere Version kann neuere Daten nicht öffnen.`;
        $("install-label").textContent = c === 0 ? "Reparieren" : "Trotzdem installieren";
      }
    }
    $("running-note").hidden = !info.app_running;
    $("payload-note").hidden = info.payload_ok;
    $("btn-install").disabled = !info.payload_ok || !info.platform_ok;
    if (!info.platform_ok) {
      $("payload-note").hidden = false;
      $("payload-note").textContent = "Die Installation ist nur unter Windows möglich.";
    }
  }

  async function runInstall() {
    if (busy) return;
    busy = true;
    const opts = { desktop: $("opt-desktop").checked, launch: $("opt-launch").checked };
    progress({ phase: "prepare", percent: 0 });
    setStep("installing");
    try {
      await backend.install(opts, progress);
      progress({ phase: "done", percent: 100 });
      await new Promise((r) => setTimeout(r, 450));
      setStep("done");
      if (opts.launch) {
        $("done-sub").textContent = "ON AIR startet …";
        $("btn-launch").hidden = true;
        try {
          await backend.launch();
          setTimeout(() => backend.close(), 2200);
        } catch (e) {
          $("done-sub").textContent = String(e);
          $("btn-launch").hidden = false;
        }
      }
    } catch (e) {
      $("error-text").textContent = typeof e === "string" ? e : e?.message ?? "Unbekannter Fehler.";
      setLevel(0);
      setStep("error");
    } finally {
      busy = false;
    }
  }

  // ---------- Bedienung ----------
  $("btn-install").addEventListener("click", runInstall);
  $("btn-retry").addEventListener("click", () => setStep("welcome"));
  $("btn-classic").addEventListener("click", async () => {
    try {
      await backend.classic();
      backend.close();
    } catch (e) {
      $("error-text").textContent = String(e);
    }
  });
  $("btn-launch").addEventListener("click", async () => {
    try {
      await backend.launch();
      backend.close();
    } catch (e) {
      $("done-sub").textContent = String(e);
    }
  });
  $("btn-finish").addEventListener("click", () => backend.close());
  $("btn-min").addEventListener("click", () => backend.minimize());
  $("btn-close").addEventListener("click", () => {
    if (busy) return; // Während der Installation nicht schließen.
    backend.close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.body.dataset.step === "welcome" && !$("btn-install").disabled) runInstall();
    if (e.key === "Escape" && !busy) backend.close();
  });
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------- Start ----------
  backend
    .info()
    .then((i) => {
      info = i;
      renderWelcome();
    })
    .catch((e) => {
      $("error-text").textContent = String(e);
      setStep("error");
    })
    .finally(() => {
      // Fenster erst zeigen, wenn alles gezeichnet ist (kein weißes Aufblitzen).
      requestAnimationFrame(() => backend.show());
      $("btn-install").focus();
    });
})();
