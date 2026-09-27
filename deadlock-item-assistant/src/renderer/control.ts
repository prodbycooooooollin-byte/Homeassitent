import type { ControlSnapshot } from '../main/controller';
import type { OverlayVM } from '../present/viewModel';
import { bridge } from './bridge';
import { type Layout, esc, iconHtml, key, renderOverlay } from './overlayView';

// Einrichtung, Datenstatus, Schnelleingabe und Test des Overlays. Keine Gameplay-Logik.

type Msg = { snap: ControlSnapshot; vm: OverlayVM; layout: Layout };
const main = document.getElementById('main')!;
let tab = 'connect';
let last: Msg | null = null;
let structureKey = '';

const send = (a: unknown) => bridge.send(a);
const itemsBy = () => new Map(last!.snap.items.map((i) => [i.cls, i]));
const miniItem = (cls: string) => {
  const it = itemsBy().get(cls);
  return { cls, name: it?.name ?? cls, slot: (it?.slot ?? 'weapon') as 'weapon', tier: it?.tier ?? 1, active: false, image: null, initials: (it?.name ?? '?').split(/[\s-]+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() };
};
const ago = (t: number | null) => (t ? `vor ${Math.max(0, Math.round((Date.now() - t) / 1000))} s` : '–');
const STATE: Record<string, string> = { idle: 'inaktiv', connecting: 'verbinde', waiting: 'wartet', live: 'empfängt', error: 'Fehler', ended: 'beendet' };

document.getElementById('nav')!.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('button[data-tab]')?.getAttribute('data-tab');
  if (t) selectTab(t);
});
bridge.onSelectTab((t) => selectTab(t));

function selectTab(t: string) {
  tab = t;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === t));
  structureKey = '';
  render();
}

bridge.onControl((m) => { last = m as Msg; render(); });

function render() {
  if (!last) return;
  const { snap } = last;
  document.getElementById('navfoot')!.innerHTML = `${esc(snap.diag?.label ?? 'keine Quelle')}<br>Build ${snap.catalog.build}${snap.settings.source === 'demo' ? '<br><span class="pill demo">DEMO</span>' : ''}`;
  // Formulare nicht neu aufbauen, während der Nutzer tippt
  const active = document.activeElement;
  const typing = active && main.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT');
  const sk = `${tab}|${snap.settings.source}|${tab === 'manual' ? JSON.stringify(snap.manual) : ''}|${tab === 'connect' || tab === 'overlay' || tab === 'data' ? JSON.stringify(snap.settings) + JSON.stringify(snap.jobs) + snap.catalog.languageLoaded : ''}|${tab === 'connect' ? JSON.stringify(snap.auto) + (snap.diag?.state ?? '') + (snap.diag?.detail ?? '') + (snap.store.matchId ?? '') : ''}`;
  if (sk !== structureKey && !typing) { structureKey = sk; main.innerHTML = VIEWS[tab]?.() ?? ''; bind(); }
  updateLive();
}

function stateHtml(s: ControlSnapshot) {
  const d = s.diag;
  if (!d) return '<span class="state idle"><span class="dot"></span>keine Quelle</span>';
  return `<span class="state ${d.state}"><span class="dot"></span>${esc(STATE[d.state] ?? d.state)}</span> <span class="muted">${esc(d.detail)}</span>`;
}

const VIEWS: Record<string, () => string> = {
  status: () => `
    <h1>Übersicht</h1><p class="lead">Datenstatus, aktuelle Empfehlung und eine Vorschau des Overlays vor hellen und dunklen Spielszenen.</p>
    <div class="grid">
      <div class="card"><h2>Datenquelle</h2><div class="kv" data-live="source"></div></div>
      <div class="card"><h2>Matchzustand</h2><div class="kv" data-live="store"></div></div>
      <div class="card wide"><h2>Overlay-Vorschau (echte Darstellung)</h2>
        <div class="preview"><div class="stage dark"><div class="ov" data-live="pv1"></div><span class="cap">dunkle Szene</span></div>
        <div class="stage light"><div class="ov" data-live="pv2"></div><span class="cap">helle Szene</span></div></div>
        <div class="row" style="margin-top:10px">
          <button class="b" data-a="toggle-details">Details ein/aus</button>
          <button class="b" data-a="toggle-edit">Position bearbeiten</button>
          <button class="b" data-a="test-alert">Test-Hinweis</button>
          <span data-live="demobuy"></span>
        </div></div>
      <div class="card"><h2>Hinweise zur Datenlage</h2><div data-live="warnings"></div></div>
      <div class="card"><h2>Letzte Item-Ereignisse</h2><div data-live="events" class="small"></div></div>
    </div>`,

  connect: () => {
    const s = last!.snap.settings;
    const au = last!.snap.auto;
    const d = last!.snap.diag;
    const live = d?.state === 'live';
    const bannerCls = s.source !== 'auto' ? 'wait' : live ? 'ok' : d?.state === 'error' ? 'no' : 'wait';
    const title = s.source !== 'auto' ? 'Automatik aus' : live ? 'Match wird verfolgt' : au.gameRunning === false ? 'Warte auf Deadlock' : 'Bereit';
    const row = (cls: string, k: string, v: string) => `<div class="chk-row ${cls}"><span class="ic"></span><span class="k">${k}</span><span class="v">${v}</span></div>`;
    const opt = (id: string, t: string, dsc: string, q: string) => `<button class="opt${s.source === id ? ' on' : ''}" data-source="${id}"><div class="t">${t}</div><div class="d">${dsc}</div><div class="q">${q}</div></button>`;
    const sem = au.soulsSemantics === 'spendable' ? 'gemessen (Overwolf)' : au.soulsSemantics === 'networth' ? 'berechnet aus Gesamt-Souls' : au.mode === 'spectator' ? 'berechnet aus Gesamt-Souls (verzögert)' : 'wird beim ersten eigenen Kauf erkannt';
    return `<h1>Verbindung</h1><p class="lead">Einmal einrichten – danach verfolgt die App jedes Match automatisch: dein Hero, deine Souls, deine Items und die Builds der Gegner. Du musst pro Match nichts eintragen.</p>
    <div class="hero-banner ${bannerCls}"><span class="dia"></span><div><div class="big">${esc(title)}</div><div class="sub">${esc(d?.detail ?? '')}</div></div></div>
    <div class="grid">
      <div class="card"><h2>Automatik</h2><div class="checks">
        ${row(au.account ? 'ok' : 'no', 'Steam-Konto', au.account ? `${esc(au.account.name ?? 'erkannt')} <span class="muted mono">#${au.account.id}</span>` : 'nicht gefunden – unten Account-ID eintragen')}
        ${row(au.gameRunning ? 'ok' : 'wait', 'Deadlock', au.gameRunning ? 'läuft' : au.gameRunning === false ? 'nicht gestartet' : 'wird über Spielevents erkannt')}
        ${row(au.gepReady ? 'ok' : 'wait', 'Live-Spielevents', esc(au.gepStatus))}
        ${row(live ? 'ok' : 'wait', 'Match', live ? `wird verfolgt <span class="muted mono">${esc(last!.snap.store.matchId ?? '')}</span>` : 'noch keins')}
        ${row(au.soulsSemantics === 'spendable' ? 'ok' : 'wait', 'Budget', esc(sem))}
      </div></div>
      <div class="card"><h2>Live-Spielevents einrichten</h2>
        <p class="small">Die volle Automatik (eigene Souls in Echtzeit, alle Items sofort, Schaden gegen dich) nutzt Overwolfs Spielevents im Entwicklermodus. Dafür brauchst du einmalig einen <b>eigenen, kostenlosen</b> Overwolf-Entwicklerzugang – die App legt nichts für dich an.</p>
        <ol class="steps small">
          <li>Auf <span class="mono">console.overwolf.com</span> mit deinem Konto anmelden.</li>
          <li>Unter <i>Profile → API Keys</i> einen Schlüssel bzw. Dev-Token erzeugen.</li>
          <li>Hier einfügen und speichern – die App startet einmal neu.</li>
        </ol>
        <label class="f">Overwolf-Entwicklerschlüssel (OW_DEV_KEY)</label>
        <input type="password" id="ow-key" value="${esc(s.overwolf.devKey)}" placeholder="Dev-Token einfügen">
        <div class="row" style="margin-top:12px"><button class="b primary" data-a="ow-save">Speichern &amp; neu starten</button></div>
        <p class="small muted">Funktioniert nur in der Variante „Auto“ (mit Overwolf-Laufzeit). Ohne Schlüssel arbeitet die Automatik mit dem verzögerten Zuschauer-Stream weiter.</p></div>
    </div>
    <details style="margin-top:18px"><summary>Andere Quellen &amp; Erweitert</summary>
      <div class="choice" style="margin-top:12px">
        ${opt('auto', 'Automatisch', 'Bestes verfügbares Live-Signal, jedes Match automatisch.', 'Empfohlen')}
        ${opt('spectator', 'Zuschauer-Stream', 'Feste Match-ID per Hand.', 'Verzögert')}
        ${opt('manual', 'Schnelleingabe', 'Alles selbst eintragen.', 'Notlösung')}
        ${opt('demo', 'Demo', 'Beispielmatch zum Ausprobieren.', 'Keine echten Daten')}
      </div>
      <div class="grid" style="margin-top:14px">
        <div class="card"><h2>Konto &amp; Dienst</h2>
          <label class="f">Steam-Account-ID überschreiben (leer = automatisch)</label><input type="text" id="acc-ov" value="${esc(s.accountOverride)}">
          <label class="f">Zuschauer-Stream-Dienst</label><input type="text" id="sp-base" value="${esc(s.spectator.baseUrl)}">
          ${s.source === 'spectator' ? `<label class="f">Match-ID</label><input type="text" id="sp-match" value="${esc(s.spectator.matchId)}">
          <label class="f">Account-ID für diese Quelle</label><input type="text" id="sp-acc" value="${esc(s.spectator.accountId)}">` : ''}
          <div class="row" style="margin-top:12px"><button class="b primary" data-a="adv-save">Übernehmen</button><button class="b" data-a="restart-source">Neu verbinden</button></div>
          ${last!.snap.jobs.source ? `<div class="note bad">${esc(last!.snap.jobs.source)}</div>` : ''}</div>
        ${s.source === 'demo' ? `<div class="card"><h2>Demo-Szenario</h2>
          <select id="demo-sc">${last!.snap.scenarios.map((x) => `<option value="${x.id}"${x.id === s.demoScenario ? ' selected' : ''}>${esc(x.title)} – ${esc(x.description)}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" id="demo-auto"${s.demoAutoBuy ? ' checked' : ''}> Empfohlene Käufe automatisch ausführen</label></div>` : ''}
      </div></details>`;
  },

  manual: () => {
    const m = last!.snap.manual;
    const heroes = last!.snap.heroes;
    const heroSel = (id: string, v: string | null) => `<select id="${id}"><option value="">– Hero wählen –</option>${heroes.map((h) => `<option value="${h.cls}"${h.cls === v ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select>`;
    const chips = (list: string[], who: string) => list.map((c) => `<span class="chip" data-rm="${who}|${c}" title="entfernen">${iconHtml(miniItem(c), true)}${esc(miniItem(c).name)} ×</span>`).join('');
    const picker = (who: string) => `<div class="picker" data-pick="${who}"><input type="text" placeholder="Item suchen …"><div class="list"></div></div>`;
    const active = last!.snap.settings.source === 'manual';
    return `<h1>Schnelleingabe</h1><p class="lead">Eingeschränkte Alternative ohne Live-Anbindung: Übertrage die für dich sichtbaren Informationen (Scoreboard/Shop). Nichts wird geraten – leere Felder gelten als unbekannt.</p>
    ${active ? '' : '<div class="note">Die Schnelleingabe wird genutzt, wenn unter „Verbindung → Andere Quellen“ „Schnelleingabe“ gewählt ist.</div>'}
    <div class="mgrid">
      <div class="card"><h2>Du</h2>${heroSel('me-hero', m.myHero)}
        <label class="f">Ausgebbare Souls (aktueller Stand im Shop)</label>
        <div class="row"><input type="number" id="me-souls" value="${m.mySouls ?? ''}" style="width:140px"><span class="small muted" data-live="soulsage"></span></div>
        <label class="f">Gesamt-Souls / Net Worth (optional)</label><input type="number" id="me-nw" value="${m.myNetWorth ?? ''}" style="width:140px">
        <label class="f">Freigeschaltete Zusatzslots (0–3, leer = unbekannt)</label><input type="number" id="me-extra" min="0" max="3" value="${m.extraSlots ?? ''}" style="width:80px">
        <label class="f">Deine Items</label>${picker('me')}<div class="chips">${chips(m.myItems, 'me')}</div>
        <div class="row" style="margin-top:12px"><button class="b danger" data-a="manual-new-match">Neues Match (alles leeren)</button></div></div>
      <div class="card"><h2>Gegner</h2>
        ${m.enemies.map((e, i) => `<div class="enemy"><div>${heroSel(`en-hero-${i}`, e.heroClass)}
          <input type="number" id="en-nw-${i}" value="${e.netWorth ?? ''}" placeholder="Souls (optional)" style="margin-top:6px"></div>
          <div>${picker(`e${i}`)}<div class="chips">${chips(e.items, `e${i}`)}</div></div>
          <div class="rep" title="Melde ein beobachtetes Problem – erhöht die Priorität passender Counter">
            <button class="b" data-rep="${e.key}|cc">CC</button><button class="b" data-rep="${e.key}|burst">Burst</button><button class="b" data-rep="${e.key}|sustain">Heilung</button></div></div>`).join('')}
      </div>
    </div>`;
  },

  overlay: () => {
    const o = last!.snap.settings.overlay;
    const h = last!.snap.settings.hotkeys;
    return `<h1>Overlay &amp; Hotkeys</h1><p class="lead">Im Spielmodus werden alle Mausaktionen an das Spiel durchgereicht. Nur der bewusst geöffnete Bearbeitungsmodus nimmt Eingaben an. Spiel im randlosen Fenstermodus nutzen – exklusiver Vollbildmodus ist nicht verifiziert.</p>
    <div class="grid">
      <div class="card"><h2>Darstellung</h2>
        <label class="f">Größe (${Math.round(o.scale * 100)} %)</label><input type="range" id="ov-scale" min="0.75" max="1.6" step="0.05" value="${o.scale}">
        <label class="f">Deckkraft (${Math.round(o.opacity * 100)} %)</label><input type="range" id="ov-op" min="0.5" max="1" step="0.02" value="${o.opacity}">
        <label class="f">Hinweise sichtbar (Sekunden)</label><input type="number" id="ov-alert" min="3" max="30" value="${o.alertSeconds}" style="width:80px">
        <label class="f">Animationen</label><select id="ov-motion"><option value="system"${o.reducedMotion === 'system' ? ' selected' : ''}>Systemeinstellung</option><option value="on"${o.reducedMotion === 'on' ? ' selected' : ''}>reduziert</option><option value="off"${o.reducedMotion === 'off' ? ' selected' : ''}>normal</option></select>
        <label class="f"><input type="checkbox" id="ov-acr"${o.acrylic ? ' checked' : ''}> Windows-11-Hintergrundunschärfe (Acrylic, standardmäßig aus; Wirkung über Spielen ungeprüft)</label>
        <div class="row" style="margin-top:12px"><button class="b" data-a="toggle-edit">Position bearbeiten</button><button class="b" data-a="reset-position">Position zurücksetzen</button><button class="b" data-a="toggle-visible">Ein-/Ausblenden</button><button class="b" data-a="test-alert">Test-Hinweis</button></div></div>
      <div class="card"><h2>Hotkeys</h2>
        <p class="small muted">Format wie <span class="mono">CommandOrControl+Shift+D</span>. Vermeide Tasten, die du im Spiel nutzt.</p>
        ${(['details', 'edit', 'toggle', 'control'] as const).map((k) => `<label class="f">${({ details: 'Details öffnen/schließen (zeigt auch letzte Hinweise)', edit: 'Bearbeitungsmodus an/aus', toggle: 'Overlay ein-/ausblenden', control: 'Dieses Fenster öffnen' })[k]}</label><input type="text" id="hk-${k}" value="${esc(h[k])}">`).join('')}
        <div class="row" style="margin-top:12px"><button class="b primary" data-a="hk-save">Hotkeys speichern</button></div>
        ${last!.snap.jobs.hotkeys ? `<div class="note bad">${esc(last!.snap.jobs.hotkeys)}</div>` : ''}</div>
    </div>`;
  },

  data: () => {
    const c = last!.snap.catalog;
    const lang = last!.snap.settings.language;
    return `<h1>Spieldaten</h1><p class="lead">Items, Preise, Komponenten und Hero-Fähigkeiten stammen aus den Spieldateien. Mechaniken sind an den Build gebunden; bei Abweichungen werden Empfehlungen eingeschränkt.</p>
    <div class="grid">
      <div class="card"><h2>Datensatz</h2><div class="kv">
        <span class="k">Build</span><span>${c.build} (${esc(c.versionDate)})</span>
        <span class="k">Quelle</span><span>${esc(c.source)}</span>
        <span class="k">Extrahiert</span><span>${esc(c.extractedAt.slice(0, 16).replace('T', ' '))}</span>
        <span class="k">Umfang</span><span>${c.items} Shop-Items · ${c.heroes} Heroes</span>
        <span class="k">Installiertes Spiel</span><span>${c.installed ? `Build ${c.installed.build} – ${c.buildMatch === 'match' ? 'passt' : '<span class="bad">abweichend: Empfehlungen eingeschränkt, bitte aktualisieren</span>'}` : '<span class="muted">nicht gefunden (nur Windows/Steam-Standardpfade)</span>'}</span>
        <span class="k">Unbestätigte Mechaniken</span><span>${c.unverified.length ? `<span class="warn">${c.unverified.map(esc).join(', ')}</span>` : 'keine'}</span></div>
        <div class="row" style="margin-top:12px"><button class="b primary" data-a="update-gamedata">Spieldaten aktualisieren</button></div>
        ${last!.snap.jobs.gamedata ? `<p class="small">${esc(last!.snap.jobs.gamedata)}</p>` : ''}</div>
      <div class="card"><h2>Sprache der Itemnamen</h2>
        <p class="small">Offizielle Namen werden nie selbst übersetzt. Ohne Abgleich erscheinen die englischen Originalnamen aus den Spieldateien.</p>
        <select id="lang"><option value="english"${lang === 'english' ? ' selected' : ''}>Englisch (mitgeliefert)</option><option value="german"${lang === 'german' ? ' selected' : ''}>Deutsch (per Abgleich)</option></select>
        <div class="row" style="margin-top:10px"><button class="b" data-a="lang-sync">Namen/Icons abgleichen</button></div>
        <p class="small muted">Abgleich über <span class="mono">api.deadlock-api.com/v1/assets</span>. Geladen: ${esc(c.languageLoaded ?? 'keine')}</p>
        ${last!.snap.jobs.language ? `<p class="small">${esc(last!.snap.jobs.language)}</p>` : ''}</div>
    </div>`;
  },

  perf: () => `<h1>Leistung</h1><p class="lead">Summe aller Prozesse der App (Electron <span class="mono">app.getAppMetrics</span>), alle 2 s. Ein FPS-Einfluss lässt sich nur mit laufendem Spiel messen.</p>
    <div class="grid"><div class="card"><h2>Mittelwerte</h2><div class="kv" data-live="perfavg"></div></div>
    <div class="card wide"><h2>Verlauf</h2><div data-live="perf"></div></div></div>`,

  about: () => `<h1>Datenweg</h1><p class="lead">Woher die Daten kommen – und was die App ausdrücklich nicht tut.</p>
    <div class="grid">
      <div class="card"><h2>1 · Overwolf-Spielevents</h2><p class="small">Über die gebündelte Overwolf-Laufzeit (ow-electron) im Entwicklermodus mit deinem eigenen Schlüssel: eigener Spieler, Souls, Items aller Spieler, Match-ID, Schadensfenster. Kein Overwolf-Client, keine Anmeldung durch die App, keine Veröffentlichung.</p></div>
      <div class="card"><h2>2 · Zuschauer-Stream</h2><p class="small">Fallback ohne Schlüssel: Steam-Konto wird aus der lokalen Steam-Konfiguration erkannt, das laufende Match über die Community-API gesucht (nur meistgesehene Matches) und über Valves Broadcast verfolgt. Verzögert; Budget wird berechnet.</p></div>
      <div class="card"><h2>Spieldaten</h2><p class="small">Items/Heroes aus den Spieldateien (SteamDB-Spiegel). Lokal gelesen werden nur <span class="mono">steam.inf</span>, <span class="mono">loginusers.vdf</span> und die Prozessliste.</p></div>
      <div class="card"><h2>Nie</h2><p class="small">Kein Speicherzugriff, keine Injektion durch die App selbst, keine Eingaben ans Spiel, keine automatischen Käufe.</p></div>
    </div>`,
};

function bind() {
  main.querySelectorAll<HTMLElement>('[data-a]').forEach((el) => el.addEventListener('click', () => {
    const a = el.dataset.a!;
    const v = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
    if (a === 'adv-save') send({ type: 'settings', patch: { accountOverride: v('acc-ov').trim(), spectator: { baseUrl: v('sp-base').trim(), ...(document.getElementById('sp-match') ? { matchId: v('sp-match').trim(), accountId: v('sp-acc').trim() } : {}) } } });
    else if (a === 'ow-save') send({ type: 'settings', patch: { overwolf: { devKey: v('ow-key').trim() } } });
    else if (a === 'hk-save') send({ type: 'settings', patch: { hotkeys: { details: v('hk-details'), edit: v('hk-edit'), toggle: v('hk-toggle'), control: v('hk-control') } } });
    else if (a === 'lang-sync') send({ type: 'sync-language', language: v('lang') === 'english' ? 'german' : v('lang') });
    else if (a === 'demo-buy') { const vm = last!.vm; const it = vm.buy?.item.cls; if (it) send({ type: 'demo-buy', item: it, sell: vm.swap && vm.swap.buy.cls === it ? vm.swap.sell.cls : undefined }); }
    else send({ type: a });
  }));
  main.querySelectorAll<HTMLElement>('[data-source]').forEach((el) => el.addEventListener('click', () => send({ type: 'settings', patch: { source: el.dataset.source } })));
  const on = (id: string, ev: string, fn: (el: HTMLInputElement) => void) => { const el = document.getElementById(id) as HTMLInputElement | null; el?.addEventListener(ev, () => fn(el)); };
  on('demo-sc', 'change', (el) => send({ type: 'settings', patch: { demoScenario: el.value } }));
  on('demo-auto', 'change', (el) => send({ type: 'settings', patch: { demoAutoBuy: el.checked } }));
  on('ov-scale', 'change', (el) => send({ type: 'settings', patch: { overlay: { scale: Number(el.value) } } }));
  on('ov-op', 'change', (el) => send({ type: 'settings', patch: { overlay: { opacity: Number(el.value) } } }));
  on('ov-alert', 'change', (el) => send({ type: 'settings', patch: { overlay: { alertSeconds: Number(el.value) } } }));
  on('ov-motion', 'change', (el) => send({ type: 'settings', patch: { overlay: { reducedMotion: el.value } } }));
  on('ov-acr', 'change', (el) => send({ type: 'settings', patch: { overlay: { acrylic: el.checked } } }));
  on('lang', 'change', (el) => send({ type: 'set-language', language: el.value }));
  // Schnelleingabe
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  on('me-hero', 'change', (el) => send({ type: 'manual', patch: { myHero: el.value || null } }));
  on('me-souls', 'change', (el) => send({ type: 'manual', patch: { mySouls: num(el.value) } }));
  on('me-nw', 'change', (el) => send({ type: 'manual', patch: { myNetWorth: num(el.value) } }));
  on('me-extra', 'change', (el) => send({ type: 'manual', patch: { extraSlots: num(el.value) } }));
  const m = last!.snap.manual;
  m.enemies.forEach((e, i) => {
    on(`en-hero-${i}`, 'change', (el) => send({ type: 'manual', patch: { enemies: m.enemies.map((x, j) => (j === i ? { ...x, heroClass: el.value || null, items: el.value ? x.items : [] } : x)) } }));
    on(`en-nw-${i}`, 'change', (el) => send({ type: 'manual', patch: { enemies: m.enemies.map((x, j) => (j === i ? { ...x, netWorth: num(el.value) } : x)) } }));
  });
  main.querySelectorAll<HTMLElement>('[data-rm]').forEach((el) => el.addEventListener('click', () => {
    const [who, cls] = el.dataset.rm!.split('|');
    setItems(who, (list) => list.filter((x) => x !== cls));
  }));
  main.querySelectorAll<HTMLElement>('[data-rep]').forEach((el) => el.addEventListener('click', () => {
    const [enemyKey, kind] = el.dataset.rep!.split('|');
    send({ type: 'report', enemyKey, kind });
  }));
  main.querySelectorAll<HTMLElement>('.picker').forEach(bindPicker);
}

function setItems(who: string, f: (l: string[]) => string[]) {
  const m = last!.snap.manual;
  if (who === 'me') send({ type: 'manual', patch: { myItems: f(m.myItems) } });
  else { const i = Number(who.slice(1)); send({ type: 'manual', patch: { enemies: m.enemies.map((x, j) => (j === i ? { ...x, items: f(x.items) } : x)) } }); }
}

function bindPicker(p: HTMLElement) {
  const input = p.querySelector('input')!;
  const list = p.querySelector('.list') as HTMLElement;
  const who = p.dataset.pick!;
  let hl = 0;
  const matches = () => {
    const q = input.value.trim().toLowerCase();
    return last!.snap.items.filter((i) => !q || i.name.toLowerCase().includes(q)).slice(0, 30);
  };
  const draw = () => {
    const ms = matches();
    list.innerHTML = ms.map((i, k) => `<div class="it${k === hl ? ' hl' : ''}" data-cls="${i.cls}">${iconHtml(miniItem(i.cls), true)}<span>${esc(i.name)}</span><span class="c souls">${i.cost}</span></div>`).join('');
  };
  const pick = (cls: string) => { setItems(who, (l) => (l.includes(cls) ? l : [...l, cls])); input.value = ''; p.classList.remove('open'); input.blur(); };
  input.addEventListener('focus', () => { p.classList.add('open'); hl = 0; draw(); });
  input.addEventListener('input', () => { hl = 0; draw(); });
  input.addEventListener('blur', () => setTimeout(() => p.classList.remove('open'), 150));
  input.addEventListener('keydown', (e) => {
    const ms = matches();
    if (e.key === 'ArrowDown') { hl = Math.min(ms.length - 1, hl + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && ms[hl]) pick(ms[hl].cls);
    if (e.key === 'Escape') input.blur();
  });
  list.addEventListener('mousedown', (e) => { const cls = (e.target as HTMLElement).closest('[data-cls]')?.getAttribute('data-cls'); if (cls) pick(cls); });
}

function updateLive() {
  const { snap, vm, layout } = last!;
  const set = (k: string, html: string) => main.querySelectorAll(`[data-live="${k}"]`).forEach((el) => { if (el.innerHTML !== html) el.innerHTML = html; });
  const d = snap.diag;
  set('source', `<span class="k">Quelle</span><span>${esc(d?.label ?? '–')}</span>
    <span class="k">Status</span><span>${stateHtml(snap)}</span>
    <span class="k">Letzte Daten</span><span>${ago(d?.lastDataAt ?? null)}</span>
    <span class="k">Takt</span><span>${d?.intervalMsAvg ? `${Math.round(d.intervalMsAvg)} ms` : '–'}</span>
    <span class="k">Ereignisse / Snapshots</span><span>${d?.rawEvents ?? 0} / ${d?.snapshots ?? 0}</span>
    ${d?.unknownItemIds.length ? `<span class="k">Unbekannte Item-IDs</span><span class="warn mono">${d.unknownItemIds.slice(0, 8).join(', ')}</span>` : ''}
    ${d?.errors.length ? `<span class="k">Fehler</span><span class="bad small">${esc(d.errors.slice(-2).join(' | '))}</span>` : ''}
    ${d?.notes.length ? `<span class="k">Hinweise</span><span class="small muted">${esc(d.notes.join(' · '))}</span>` : ''}`);
  const o = snap.output;
  set('store', `<span class="k">Match-ID</span><span class="mono">${esc(snap.store.matchId ?? '–')}</span>
    <span class="k">Snapshots</span><span>${snap.store.snapshots}</span>
    <span class="k">Verworfen (veraltet)</span><span>${snap.store.rejectedOutOfOrder}</span>
    <span class="k">Duplikate</span><span>${snap.store.duplicates}</span>
    <span class="k">Match-Wechsel</span><span>${snap.store.matchResets}</span>
    <span class="k">Budget</span><span>${esc(vm.budgetText)}</span>
    <span class="k">Slots</span><span>${esc(vm.slotsText)}</span>
    <span class="k">Status Empfehlung</span><span>${esc(o?.statusText ?? '–')}</span>`);
  const pv = renderOverlay(vm, { ...layout, edit: false });
  set('pv1', pv); set('pv2', pv);
  set('warnings', (o?.warnings.length ? `<ul class="plain small">${o.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<span class="small muted">keine</span>')
    + (snap.catalog.buildMatch === 'mismatch' ? '<div class="note bad">Installierter Spiel-Build weicht von den Spieldaten ab.</div>' : ''));
  set('events', snap.store.events.length ? snap.store.events.map((e) => `<div>${esc(e)}</div>`).join('') : '<span class="muted">keine (Basislinie wird nicht als Kauf gemeldet)</span>');
  set('demobuy', snap.settings.source === 'demo' && vm.buy ? `<button class="b" data-a2="demo-buy">Demo: „${esc(vm.buy.item.name)}“ kaufen</button>` : '');
  main.querySelector('[data-a2="demo-buy"]')?.addEventListener('click', () => { const it = vm.buy?.item.cls; if (it) send({ type: 'demo-buy', item: it, sell: vm.swap && vm.swap.buy.cls === it ? vm.swap.sell.cls : undefined }); }, { once: true });
  set('soulsage', snap.manual.mySoulsAt ? `eingegeben ${ago(snap.manual.mySoulsAt)}${Date.now() - snap.manual.mySoulsAt > 90_000 ? ' – veraltet' : ''}` : '');
  const p = snap.perf;
  if (p.length) {
    const avg = (f: (x: (typeof p)[number]) => number) => (p.reduce((s, x) => s + f(x), 0) / p.length).toFixed(1);
    set('perfavg', `<span class="k">CPU (alle Prozesse)</span><span>${avg((x) => x.cpuPct)} %</span><span class="k">Arbeitsspeicher</span><span>${avg((x) => x.memMB)} MB</span><span class="k">GPU-Prozess (CPU)</span><span>${avg((x) => x.gpuCpuPct ?? 0)} %</span><span class="k">Stichproben</span><span>${p.length}</span>`);
    set('perf', `<table class="t"><tr><th>Zeit</th><th>CPU %</th><th>RAM MB</th><th>GPU-Proz. %</th><th>Modus</th></tr>${p.slice(-12).reverse().map((x) => `<tr><td>${new Date(x.at).toLocaleTimeString('de-DE')}</td><td>${x.cpuPct}</td><td>${x.memMB}</td><td>${x.gpuCpuPct ?? '–'}</td><td>${x.label}</td></tr>`).join('')}</table>`);
  }
  void key;
}
