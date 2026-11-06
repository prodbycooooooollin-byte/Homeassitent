// ON AIR Setup – immersive Oberfläche. In der Desktop-App über window.__TAURI__, im Browser
// mit einer klar markierten Vorschau (?state=update|running|error|nopayload&step=…) für
// Screenshots und Tests.
(() => {
  "use strict";
  const T = window.__TAURI__;
  const preview = !T;
  const qs = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PHASES = {
    prepare: "Wird vorbereitet",
    extract: "Dateien werden entpackt",
    install: "ON AIR wird eingerichtet",
    finish: "Verknüpfungen werden angelegt",
    done: "Fertig",
  };
  const TOUR = [
    ["Songwünsche aus dem Chat", "Zuschauer wünschen sich Songs mit !sr – ON AIR prüft, sortiert und übergibt an Spotify."],
    ["Kanalpunkte", "Eine eigene Belohnung für Songwünsche. Abgelehnte Wünsche bekommen ihre Punkte zurück."],
    ["Die Live-Seite", "Jetzt läuft, als Nächstes und alles Wichtige – in den Farben des laufenden Songs."],
    ["OBS-Overlays", "Widgets und Dock laufen lokal auf deinem PC und sehen nie deine Zugangsdaten."],
    ["Streamplanung", "Sag, wann du aufhörst – ON AIR nimmt nur noch Wünsche an, die bis dahin passen."],
    ["Immer aktuell", "Updates laden im Hintergrund und installieren sich nie, während du live bist."],
  ];

  // ---------- Backend (echt oder Vorschau) ----------
  const backend = preview
    ? {
        async info() {
          const s = qs.get("state");
          return {
            version: "0.2.9",
            payload_ok: s !== "nopayload",
            payload_mb: 9.4,
            installed: s === "update" ? { version: "0.2.8", location: "C:\\Users\\du\\AppData\\Local\\ON AIR" } : null,
            app_running: s === "running",
            platform_ok: true,
          };
        },
        async install(_opts, onProgress) {
          const steps = [["prepare", 4], ["extract", 14], ["extract", 27], ["install", 41], ["install", 56], ["install", 68], ["finish", 81], ["finish", 92]];
          for (const [phase, pct] of steps) {
            onProgress({ phase, percent: pct });
            await new Promise((r) => setTimeout(r, 700));
          }
          if (qs.get("state") === "error") throw "Der Installer meldet einen Fehler (Code 2).";
          onProgress({ phase: "done", percent: 100 });
          return "0.2.9";
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

  // ---------- Klangwellen ----------
  // Seidige Bänder aus vielen dünnen Linien (wie ein Stoff im Licht). `energy` (0…1) steuert
  // Amplitude und Tempo – ruhig im Intro, lebendig während der Installation, still am Ende.
  const canvas = $("waves");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  let energy = 0.18, energyTarget = 0.18, t0 = performance.now();
  const BANDS = [
    { y: 0.56, amp: 0.10, freq: 1.35, speed: 0.07, lines: 16, spread: 34, tilt: -0.16, alpha: 0.075, hue: "201,215,245" },
    { y: 0.63, amp: 0.13, freq: 0.95, speed: -0.05, lines: 12, spread: 46, tilt: -0.10, alpha: 0.06, hue: "150,178,240" },
    { y: 0.48, amp: 0.07, freq: 1.8, speed: 0.1, lines: 10, spread: 22, tilt: -0.22, alpha: 0.07, hue: "220,230,252" },
  ];
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function draw(now) {
    const t = (now - t0) / 1000;
    energy += (energyTarget - energy) * 0.03;
    document.documentElement.style.setProperty("--energy", energy.toFixed(3));
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const steps = Math.max(40, Math.round(W / 14));
    for (const b of BANDS) {
      const amp = H * b.amp * (0.55 + energy * 1.3);
      const sp = b.speed * (0.6 + energy * 2.4);
      for (let l = 0; l < b.lines; l++) {
        const k = l / (b.lines - 1) - 0.5;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const x = (i / steps) * W;
          const u = i / steps;
          const phase = u * Math.PI * 2 * b.freq + t * sp * Math.PI * 2 + k * 1.3;
          const y = H * b.y + (u - 0.5) * H * b.tilt * 2
            + Math.sin(phase) * amp * (0.6 + 0.4 * Math.sin(t * 0.3 + k * 2))
            + Math.sin(phase * 0.47 + t * 0.4) * amp * 0.45
            + k * b.spread * (1 + 0.5 * Math.sin(u * 3 + t * 0.2));
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        const a = b.alpha * (1 - Math.abs(k) * 1.2) * (0.7 + energy * 0.9);
        ctx.strokeStyle = `rgba(${b.hue},${Math.max(0, a).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }
  let last = 0, raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || now - last < 33) return; // ~30 fps genügen und schonen die CPU
    last = now;
    draw(now);
  }
  resize();
  window.addEventListener("resize", resize);
  if (reduced) draw(performance.now());
  else raf = requestAnimationFrame(loop);

  // ---------- Zustand ----------
  let info = null;
  let busy = false;
  let tourTimer = 0, tourIndex = 0, shown = 0, target = 0, countTimer = 0;
  const setStep = (s) => {
    document.body.dataset.step = s;
    energyTarget = { intro: 0.18, welcome: 0.28, installing: 0.45, done: 0.08, error: 0.05 }[s] ?? 0.2;
  };

  function renderPct() {
    // Weich hochzählen statt springen.
    shown += Math.max(0.2, (target - shown) * 0.12);
    if (shown > target) shown = target;
    $("pct").textContent = String(Math.round(shown));
    $("pct-wrap").setAttribute("aria-valuenow", String(Math.round(shown)));
    if (shown < target) countTimer = requestAnimationFrame(renderPct);
  }
  function progress({ phase, percent }) {
    const p = Math.max(0, Math.min(100, percent));
    target = p;
    cancelAnimationFrame(countTimer);
    countTimer = requestAnimationFrame(renderPct);
    $("bar-fill").style.transform = `scaleX(${p / 100})`;
    $("phase-title").textContent = PHASES[phase] ?? PHASES.install;
    energyTarget = 0.35 + (p / 100) * 0.65;
  }
  function startTour() {
    const card = $("tour-card");
    const show = () => {
      const [title, text] = TOUR[tourIndex % TOUR.length];
      card.classList.add("swap");
      setTimeout(() => {
        $("tour-title").textContent = title;
        $("tour-text").textContent = text;
        card.classList.remove("swap");
      }, 350);
      tourIndex++;
    };
    show();
    tourTimer = setInterval(show, 3600);
  }

  function cmpVersion(a, b) {
    const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    return 0;
  }

  function renderWelcome() {
    $("tb-version").textContent = `Setup · Version ${info.version}${preview ? " · Vorschau" : ""}`;
    const inst = info.installed;
    if (inst?.version) {
      const c = cmpVersion(info.version, inst.version);
      if (c > 0) {
        $("kicker").textContent = "Update";
        $("welcome-title").innerHTML = "Neue Version.<br /><em>Gleicher Stream.</em>";
        $("welcome-sub").textContent = `Von ${inst.version} auf ${info.version}. Einstellungen, Warteschlange und Anmeldungen bleiben erhalten.`;
        $("install-label").textContent = "Jetzt aktualisieren";
      } else {
        $("kicker").textContent = c === 0 ? "Bereits installiert" : "Ältere Version";
        $("welcome-title").innerHTML = c === 0 ? "Alles da.<br /><em>Neu einrichten?</em>" : "Zurück zu<br /><em>" + info.version + "?</em>";
        $("welcome-sub").textContent =
          c === 0 ? "Du kannst die Installation reparieren – deine Daten bleiben erhalten." : `Installiert ist bereits ${inst.version}. Eine ältere Version kann neuere Daten nicht öffnen.`;
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
    document.body.dataset.busy = "1";
    const opts = { desktop: $("opt-desktop").checked, launch: $("opt-launch").checked };
    shown = 0;
    progress({ phase: "prepare", percent: 0 });
    setStep("installing");
    energyTarget = 0.35;
    startTour();
    try {
      await backend.install(opts, progress);
      progress({ phase: "done", percent: 100 });
      await new Promise((r) => setTimeout(r, 900));
      clearInterval(tourTimer);
      setStep("done");
      if (opts.launch) {
        $("done-sub").textContent = "ON AIR startet gleich …";
        $("btn-launch").hidden = true;
        try {
          await backend.launch();
          setTimeout(() => backend.close(), 3600);
        } catch (e) {
          $("done-sub").textContent = String(e);
          $("btn-launch").hidden = false;
        }
      }
    } catch (e) {
      clearInterval(tourTimer);
      $("error-text").textContent = typeof e === "string" ? e : e?.message ?? "Unbekannter Fehler.";
      setStep("error");
    } finally {
      busy = false;
      delete document.body.dataset.busy;
    }
  }

  // ---------- Intro ----------
  let introDone = false;
  function endIntro() {
    if (introDone) return;
    introDone = true;
    setStep("welcome");
    setTimeout(() => $("btn-install").focus({ preventScroll: true }), 700);
  }

  // ---------- Bedienung ----------
  $("btn-install").addEventListener("click", runInstall);
  $("btn-options").addEventListener("click", () => {
    const o = $("options");
    o.hidden = !o.hidden;
    $("btn-options").setAttribute("aria-expanded", String(!o.hidden));
  });
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
  $("btn-skip").addEventListener("click", endIntro);
  document.addEventListener("pointerdown", (e) => {
    if (document.body.dataset.step === "intro" && !e.target.closest(".titlebar")) endIntro();
  });
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.step === "intro") return endIntro();
    if (e.key === "Enter" && document.body.dataset.step === "welcome" && !$("btn-install").disabled && document.activeElement?.id !== "btn-options") runInstall();
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
      introDone = true;
      setStep("error");
    })
    .finally(() => {
      // Fenster erst zeigen, wenn alles gezeichnet ist (kein weißes Aufblitzen).
      requestAnimationFrame(() => backend.show());
      // Vorschau: direkt zu einem Schritt springen (Screenshots).
      const jump = qs.get("step");
      if (jump) {
        introDone = true;
        setStep(jump);
        if (jump === "installing") { progress({ phase: "install", percent: Number(qs.get("pct") || 56) }); startTour(); }
      } else if (!introDone) {
        setTimeout(endIntro, reduced ? 200 : 3300);
      }
    });
})();
