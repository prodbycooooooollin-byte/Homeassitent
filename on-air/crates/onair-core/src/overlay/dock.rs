//! OBS-Dock: kompakte Steuerseite für „Docks → Benutzerdefinierte Browser-Docks“.
//! Der Schlüssel kommt aus dem URL-Fragment (`#k=…`) und wird nur im Header gesendet.

pub const DOCK_HTML: &str = r##"<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ON AIR</title>
<style>
  :root { --bg:#141319; --card:#1d1b24; --card2:#24222d; --line:rgba(255,255,255,.08); --text:#f1eef8; --text2:#b4aec4; --text3:#857f96;
          --accent:#b9a7ff; --mint:#7dd9b4; --warn:#e9bc6b; --danger:#f08a8a; color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  html, body { background: var(--bg); color: var(--text); font: 13px/1.4 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif; }
  body { padding: 10px; display: flex; flex-direction: column; gap: 10px; min-height: 100vh; }
  button { font: inherit; color: inherit; background: var(--card2); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
  button:hover { border-color: rgba(255,255,255,.2); }
  button:disabled { opacity: .45; cursor: default; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text3); flex: none; }
  .bar.ok .dot { background: var(--mint); box-shadow: 0 0 8px var(--mint); }
  .bar.warn .dot { background: var(--warn); }
  .bar .lbl { font-weight: 650; }
  .bar .why { color: var(--text3); font-size: 12px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar button { padding: 4px 10px; font-weight: 600; font-size: 12px; margin-left: auto; }
  .bar.ok button { color: var(--mint); }
  .np { display: grid; grid-template-columns: 56px minmax(0,1fr); gap: 10px; align-items: center; padding: 10px; border-radius: 12px; background: var(--card); border: 1px solid var(--line); }
  .cover { width: 56px; height: 56px; border-radius: 8px; background: var(--card2) center/cover; }
  .t { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .a { color: var(--text2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .req { color: var(--accent); font-size: 11.5px; }
  .prog { height: 3px; border-radius: 2px; background: rgba(255,255,255,.1); margin-top: 6px; overflow: hidden; }
  .prog i { display: block; height: 100%; background: var(--accent); transform-origin: 0 50%; transform: scaleX(0); }
  .ctl { grid-column: 1 / -1; display: flex; gap: 6px; }
  .ctl button { flex: 1; padding: 6px 0; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; }
  button svg { width: 15px; height: 15px; flex: none; }
  .muted { color: var(--text3); }
  h3 { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--text3); font-weight: 650; display: flex; justify-content: space-between; align-items: center; }
  .list { display: flex; flex-direction: column; gap: 4px; }
  .item { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: center; padding: 7px 9px; border-radius: 9px; background: var(--card); border: 1px solid var(--line); }
  .item.review { border-color: rgba(233,188,107,.35); }
  .item .who { color: var(--text3); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item .acts { display: flex; gap: 4px; }
  .item .acts button { width: 28px; height: 26px; padding: 0; display: grid; place-items: center; }
  .ok-btn { color: var(--mint); } .no-btn { color: var(--danger); }
  .tag { font-size: 10.5px; padding: 1px 6px; border-radius: 99px; background: rgba(185,167,255,.12); color: var(--accent); margin-left: 4px; }
  .tag.warn { background: rgba(233,188,107,.12); color: var(--warn); }
  .plan { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); font-size: 12px; }
  .plan b { font-variant-numeric: tabular-nums; }
  .plan button { margin-left: auto; padding: 3px 9px; font-size: 12px; font-weight: 600; }
  .msg { padding: 12px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); color: var(--text2); }
  .msg.err { border-color: rgba(240,138,138,.35); color: var(--danger); }
  .foot { margin-top: auto; color: var(--text3); font-size: 11px; text-align: center; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
  <div id="need-key" class="msg" hidden>Schlüssel fehlt. Die vollständige Dock-URL steht in ON AIR unter <b>Widgets → OBS-Dock</b>.</div>
  <div id="offline" class="msg err" hidden>Keine Verbindung zu ON AIR – läuft die App?</div>
  <div id="ui" hidden>
    <div class="bar" id="req"><span class="dot"></span><span class="lbl" id="req-lbl">…</span><span class="why" id="req-why"></span><button id="req-btn">…</button></div>
    <div style="height:10px"></div>
    <div class="np">
      <div class="cover" id="cover"></div>
      <div style="min-width:0">
        <div class="t" id="title">–</div>
        <div class="a" id="artist"></div>
        <div class="req" id="requester"></div>
        <div class="prog"><i id="prog"></i></div>
      </div>
      <div class="ctl">
        <button id="pp" title="Wiedergabe/Pause"></button>
        <button id="skip" title="Überspringen"></button>
      </div>
    </div>
    <div style="height:10px"></div>
    <div class="plan" id="plan" hidden><span>Streamende <b id="plan-end"></b> · frei <b id="plan-free"></b></span><button id="plan-ext">+15</button></div>
    <div style="height:10px" id="plan-gap" hidden></div>
    <h3><span>Als Nächstes</span><span id="count"></span></h3>
    <div style="height:6px"></div>
    <div class="list" id="list"></div>
  </div>
  <div class="foot">ON AIR · OBS-Dock</div>
<script>
(() => {
  const key = new URLSearchParams(location.hash.slice(1)).get("k") || "";
  const $ = (id) => document.getElementById(id);
  const BLOCKS = { manual_pause: "manuell pausiert", source_disabled: "Weg aus", stream_ended: "Streamende erreicht", budget_exhausted: "Zeitbudget ausgeschöpft",
    plan_uncertain: "Prognose unsicher", update_pause: "Update", reconciling: "Abgleich läuft", technical: "Technik" };
  let st = null, busy = false;
  if (!key) { $("need-key").hidden = false; return; }

  async function call(path, body) {
    const r = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: { "X-OnAir-Dock": key, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    if (r.status === 401) throw new Error("key");
    if (!r.ok) throw new Error(await r.text());
    return body === undefined ? r.json() : null;
  }
  async function act(action, body = {}) {
    if (busy) return;
    busy = true;
    try { await call("/api/dock/" + action, body); } catch (e) { flash(String(e.message || e)); } finally { busy = false; refresh(); }
  }
  function flash(t) { $("req-why").textContent = t; }
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const span = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min"; };
  const I = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
    skip: '<svg viewBox="0 0 24 24"><path d="M5 5v14l9-7zM15 5h3v14h-3z" fill="currentColor"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    no: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  $("skip").innerHTML = I.skip + "<span>Skip</span>";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Fortschritt allein (jede Sekunde) – der Rest wird nur bei neuen Daten neu aufgebaut.
  function progress() {
    const n = st && st.now;
    if (!n) return;
    const since = Math.max(0, st.server_time_ms - n.fetched_at_ms) + Math.max(0, Date.now() - st._recv);
    const p = Math.min(n.duration_ms || 1, n.progress_ms + (n.is_playing ? since : 0));
    $("prog").style.transform = "scaleX(" + (n.duration_ms ? Math.min(1, p / n.duration_ms) : 0) + ")";
  }
  let lastKey = "";
  function render() {
    const s = st;
    const k = JSON.stringify(s, (key, v) => (key === "server_time_ms" || key === "_recv" || key === "progress_ms" || key === "fetched_at_ms" ? undefined : v));
    if (k === lastKey) { progress(); return; }
    lastKey = k;
    const r = s.requests;
    $("req").className = "bar " + (r.open ? "ok" : r.manual_open ? "warn" : "");
    $("req-lbl").textContent = r.open ? "Requests offen" : r.manual_open ? "Automatisch pausiert" : "Requests pausiert";
    $("req-why").textContent = r.open ? (r.via || "") : (r.blocks || []).map((b) => BLOCKS[b] || b).filter((x, i, a) => a.indexOf(x) === i).join(" · ");
    $("req-btn").textContent = r.manual_open ? "Pausieren" : "Öffnen";
    const n = s.now;
    if (n) {
      $("title").textContent = n.title; $("artist").textContent = (n.artists || []).join(", ");
      $("requester").textContent = n.requester ? "Wunsch von " + n.requester : "";
      $("cover").style.backgroundImage = n.image_url ? 'url("' + n.image_url + '")' : "none";
      // Fortschritt seit der letzten bestätigten Spotify-Antwort weiterzählen.
      progress();
      $("pp").innerHTML = n.is_playing ? I.pause + "<span>Pause</span>" : I.play + "<span>Weiter</span>";
    } else {
      $("title").textContent = s.playback_label || "Gerade läuft nichts"; $("artist").textContent = ""; $("requester").textContent = "";
      $("cover").style.backgroundImage = "none"; $("prog").style.transform = "scaleX(0)"; $("pp").innerHTML = I.play + "<span>Wiedergabe</span>";
    }
    $("pp").disabled = $("skip").disabled = !s.controls;
    const pl = s.plan;
    $("plan").hidden = $("plan-gap").hidden = !pl;
    if (pl) { $("plan-end").textContent = new Date(pl.end_at_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); $("plan-free").textContent = pl.free_ms < 0 ? "−" + span(-pl.free_ms) : span(pl.free_ms); }
    $("count").textContent = s.queue.length ? String(s.queue.length) : "";
    $("list").innerHTML = s.queue.length ? s.queue.map((q) => {
      const tag = q.review ? '<span class="tag warn">Prüfung</span>' : q.status === "handed_off" ? '<span class="tag">in Spotify</span>' : q.status === "uncertain" ? '<span class="tag warn">unklar</span>' : "";
      const src = q.source === "channel_points" ? "✦ " : "";
      const acts = q.review
        ? '<button class="ok-btn" data-a="approve" data-id="' + esc(q.id) + '" title="Freigeben">' + I.ok + '</button><button class="no-btn" data-a="reject" data-id="' + esc(q.id) + '" title="Ablehnen">' + I.no + '</button>'
        : q.removable ? '<button class="no-btn" data-a="remove" data-id="' + esc(q.id) + '" title="Entfernen">' + I.trash + '</button>' : "";
      return '<div class="item' + (q.review ? " review" : "") + '"><div style="min-width:0"><div class="t">' + esc(q.title) + tag + '</div><div class="who">' + esc((q.artists || []).join(", ")) + " · " + src + esc(q.requester) + '</div></div><div class="acts">' + acts + "</div></div>";
    }).join("") : '<div class="muted" style="padding:6px 2px">Noch keine Requests.</div>';
  }

  async function refresh() {
    try {
      const s = await call("/api/dock/state");
      s._recv = Date.now();
      st = s;
      $("offline").hidden = true; $("need-key").hidden = true; $("ui").hidden = false;
      render();
    } catch (e) {
      if (String(e.message) === "key") { $("ui").hidden = true; $("need-key").hidden = false; $("need-key").textContent = "Schlüssel ungültig – Dock-URL in ON AIR unter Widgets → OBS-Dock neu kopieren."; }
      else { $("offline").hidden = false; }
    }
  }
  $("req-btn").onclick = () => act(st && st.requests.manual_open ? "close_requests" : "open_requests");
  $("pp").onclick = () => act("play_pause");
  $("skip").onclick = () => act("skip");
  $("plan-ext").onclick = () => act("extend_plan", { minutes: 15 });
  $("list").onclick = (e) => { const b = e.target.closest("button[data-a]"); if (b) act(b.dataset.a, { id: b.dataset.id }); };
  refresh();
  // Sparsam: Daten alle 2,5 s, Fortschritt jede Sekunde; nichts, solange das Dock verborgen ist.
  setInterval(() => { if (!document.hidden) refresh(); }, 2500);
  setInterval(() => { if (st && !document.hidden) progress(); }, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
</script>
</body>
</html>
"##;
