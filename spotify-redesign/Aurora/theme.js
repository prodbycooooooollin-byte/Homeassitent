// Aurora – Fullscreen-Lyrics (synchronisiert, via lrclib.net)
(function aurora() {
  if (!(window.Spicetify && Spicetify.Player && Spicetify.Player.data && Spicetify.React)) {
    return setTimeout(aurora, 300);
  }
  const P = Spicetify.Player;
  let lines = [], active = -1, trackUri = null, raf = 0;

  const el = document.createElement("div");
  el.id = "aurora-lyrics";
  el.innerHTML = `
    <div class="bg"></div><div class="shade"></div>
    <button class="close" title="Schließen">✕</button>
    <div class="content">
      <div class="left">
        <div class="cover"></div>
        <div><div class="title"></div></div><div class="artist"></div>
        <div class="bar"><i></i></div>
        <div class="ctrls">
          <button class="prev">⏮</button><button class="play">▶</button><button class="next">⏭</button>
        </div>
      </div>
      <div class="lines"></div>
    </div>`;
  document.body.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const linesEl = $(".lines");

  const open = () => { el.classList.add("open"); loop(); };
  const close = () => { el.classList.remove("open"); cancelAnimationFrame(raf); };
  $(".close").onclick = close;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  $(".prev").onclick = () => P.back();
  $(".next").onclick = () => P.next();
  $(".play").onclick = () => P.togglePlay();

  function coverUrl(d) {
    const u = d?.item?.metadata?.image_xlarge_url || d?.item?.metadata?.image_large_url || d?.item?.metadata?.image_url;
    if (!u) return "";
    return u.startsWith("spotify:image:") ? "https://i.scdn.co/image/" + u.slice(14) : u;
  }

  function parseLrc(text) {
    return text.split("\n").map((l) => {
      const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      return m ? { t: (+m[1] * 60 + +m[2]) * 1000, text: m[3].trim() } : null;
    }).filter((x) => x && x.text);
  }

  function render() {
    linesEl.innerHTML = "";
    if (!lines.length) {
      linesEl.innerHTML = '<div class="empty">Keine Lyrics gefunden ♪</div>';
      return;
    }
    lines.forEach((l, i) => {
      const d = document.createElement("div");
      d.className = "line"; d.textContent = l.text;
      d.onclick = () => P.seek(l.t);
      linesEl.appendChild(d);
    });
    active = -1;
  }

  async function load() {
    const d = P.data; if (!d?.item) return;
    if (d.item.uri === trackUri) return;
    trackUri = d.item.uri;
    const m = d.item.metadata || {};
    $(".title").textContent = m.title || d.item.name || "";
    $(".artist").textContent = m.artist_name || "";
    const c = coverUrl(d);
    $(".cover").style.backgroundImage = $(".bg").style.backgroundImage = c ? `url("${c}")` : "";
    lines = []; linesEl.innerHTML = '<div class="empty">Lade Lyrics…</div>';
    try {
      const q = new URLSearchParams({
        track_name: m.title || d.item.name, artist_name: m.artist_name || "",
        album_name: m.album_title || "", duration: Math.round((P.getDuration() || 0) / 1000),
      });
      let r = await fetch("https://lrclib.net/api/get?" + q);
      if (!r.ok) {
        r = await fetch("https://lrclib.net/api/search?" + new URLSearchParams({ q: `${m.title} ${m.artist_name}` }));
        const arr = r.ok ? await r.json() : [];
        const hit = arr.find((x) => x.syncedLyrics) || arr[0];
        lines = hit?.syncedLyrics ? parseLrc(hit.syncedLyrics)
          : (hit?.plainLyrics || "").split("\n").filter(Boolean).map((t) => ({ t: -1, text: t }));
      } else {
        const j = await r.json();
        lines = j.syncedLyrics ? parseLrc(j.syncedLyrics)
          : (j.plainLyrics || "").split("\n").filter(Boolean).map((t) => ({ t: -1, text: t }));
      }
    } catch (e) { lines = []; }
    render();
  }

  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      el.classList.toggle("paused", !P.isPlaying());
      $(".play").textContent = P.isPlaying() ? "⏸" : "▶";
      const prog = P.getProgress(), dur = P.getDuration() || 1;
      $(".bar i").style.width = (prog / dur) * 100 + "%";
      if (lines.length && lines[0].t >= 0) {
        let idx = -1;
        for (let i = 0; i < lines.length; i++) { if (lines[i].t <= prog + 150) idx = i; else break; }
        if (idx !== active) {
          active = idx;
          [...linesEl.children].forEach((n, i) => {
            n.classList.toggle("active", i === idx);
            n.classList.toggle("near", Math.abs(i - idx) === 1);
          });
          const a = linesEl.children[idx];
          if (a) linesEl.scrollTo({ top: a.offsetTop - linesEl.clientHeight / 2 + a.clientHeight / 2, behavior: "smooth" });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  P.addEventListener("songchange", () => { load(); });
  load();

  // Button in der Playbar (Spicetify.Playbar API)
  const icon = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.118l-2.619-2.62A303.68 303.68 0 0 0 4.629 8.95l-2.18 2.18a1 1 0 0 0 0 1.414l1.007 1.007a1 1 0 0 0 1.414 0l2.18-2.18c1.13-1.13 2.2-2.2 2.45-2.253z"/></svg>';
  const addBtn = () => {
    if (Spicetify.Playbar?.Button) {
      const b = new Spicetify.Playbar.Button("Aurora Lyrics", icon, () => { load(); open(); });
      b.element.id = "aurora-lyrics-btn";
    } else setTimeout(addBtn, 300);
  };
  addBtn();
  // Tastenkürzel: Strg+L
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "l") { e.preventDefault(); el.classList.contains("open") ? close() : (load(), open()); }
  });
})();
