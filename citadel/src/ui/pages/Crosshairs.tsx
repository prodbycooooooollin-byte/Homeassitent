import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state.tsx';
import { Copy, Icons, Modal, Notice, fmtDate } from '../components.tsx';
import {
  CROSSHAIR_DEFAULTS,
  OWN_PRESETS,
  consoleCommand,
  decodeShareCode,
  encodeShareCode,
  fromConvars,
  parseCrosshairCommands,
  renderSvg,
  toConvars,
  toSettingValues,
  validateCrosshair,
  type CrosshairParams,
  type CrosshairPreset,
} from '../../core/crosshair.ts';
import { platform, downloadText } from '../../platform/index.ts';
import { api, DEFAULT_API } from '../api.ts';
import { CATALOG_VERSION } from '../../core/catalog.ts';

const BACKGROUNDS: { id: string; label: string; css: string }[] = [
  { id: 'dusk', label: 'Dämmerung', css: 'linear-gradient(160deg,#2a3441 0%,#4b3b2e 55%,#1d2024 100%)' },
  { id: 'sky', label: 'Heller Himmel', css: 'linear-gradient(180deg,#b9d3ea 0%,#e9eef2 60%,#c7b89c 100%)' },
  { id: 'stone', label: 'Stein', css: 'repeating-linear-gradient(45deg,#6f6a62 0 14px,#7c766d 14px 28px)' },
  { id: 'foliage', label: 'Grün', css: 'radial-gradient(circle at 30% 40%,#4f7a3a,#2b4a24 60%,#1b2a18)' },
  { id: 'fire', label: 'Effekte', css: 'radial-gradient(circle at 50% 50%,#ffcf6a,#e0532f 45%,#3a1410 80%)' },
  { id: 'night', label: 'Dunkel', css: '#0b0c0e' },
];

function Thumb({ p, size = 96, spread = 0, scale = 1 }: { p: CrosshairParams; size?: number; spread?: number; scale?: number }) {
  return <span aria-hidden dangerouslySetInnerHTML={{ __html: renderSvg(p, { size, spread, scale }) }} />;
}

interface MyCrosshair {
  id: string;
  name: string;
  params: CrosshairParams;
  createdAt: string;
}

export function Crosshairs() {
  const app = useApp();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [origin, setOrigin] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [mine, setMine] = useState<MyCrosshair[]>([]);
  const [players, setPlayers] = useState<CrosshairPreset[]>([]);
  const [playerErr, setPlayerErr] = useState<string | null>(null);
  const [sel, setSel] = useState<CrosshairPreset>(OWN_PRESETS[0]);
  const [edit, setEdit] = useState<CrosshairParams>(structuredClone(OWN_PRESETS[0].params));
  const [name, setName] = useState(OWN_PRESETS[0].name);
  const [compare, setCompare] = useState<CrosshairPreset | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  useEffect(() => {
    void platform.store.list<MyCrosshair>('crosshairs').then(setMine);
    void api
      .players(app.prefs.apiUrl || DEFAULT_API)
      .then((r) => {
        const list: CrosshairPreset[] = [];
        for (const pl of r.data.players) {
          const f = pl.fields.find((x) => x.field === 'crosshair');
          if (!f) continue;
          const conv = fromConvars(JSON.parse(f.value));
          list.push({
            id: `player-${pl.id}`,
            name: pl.displayName,
            kind: 'kreuz+punkt',
            colorName: `RGB ${conv.params.color.join(',')}`,
            size: 'mittel',
            author: pl.displayName,
            origin: 'player',
            createdAt: f.publishedAt ?? f.retrievedAt,
            catalogVersion: CATALOG_VERSION,
            params: conv.params,
            description: `Belegt: ${f.origin === 'auto-primary' ? 'Primärquelle' : 'Drittanbieterangabe'} · ${conv.missing.length ? `${conv.missing.length} Werte nicht veröffentlicht (Standard angezeigt)` : 'vollständig'}`,
            sourceUrl: f.sourceUrl,
          });
        }
        setPlayers(list);
        if (r.offline) setPlayerErr(`Spieler-Crosshairs: lokaler Stand vom ${fmtDate(r.fetchedAt, true)}`);
      })
      .catch((e) => setPlayerErr(`Spieler-Crosshairs nicht verfügbar: ${(e as Error).message}`));
  }, [app.prefs.apiUrl]);

  const all: CrosshairPreset[] = useMemo(
    () => [
      ...mine.map((m) => ({ id: m.id, name: m.name, kind: 'kreuz' as const, colorName: 'eigen', size: 'mittel' as const, author: 'Du', origin: 'community' as const, createdAt: m.createdAt, catalogVersion: CATALOG_VERSION, params: m.params, description: 'Eigenes Crosshair (lokal gespeichert)' })),
      ...OWN_PRESETS,
      ...players,
    ],
    [mine, players],
  );
  const recent = app.prefs.recentCrosshairs;
  const filtered = all.filter(
    (p) =>
      (!q || `${p.name} ${p.author} ${p.description}`.toLowerCase().includes(q.toLowerCase())) &&
      (!kind || p.kind === kind) &&
      (!color || p.colorName === color) &&
      (!size || p.size === size) &&
      (!origin || (origin === 'mine' ? p.author === 'Du' : p.origin === origin && p.author !== 'Du')) &&
      (!favOnly || app.prefs.favoriteCrosshairs.includes(p.id)),
  );
  const colors = [...new Set(OWN_PRESETS.map((p) => p.colorName))];

  const pick = (p: CrosshairPreset) => {
    setSel(p);
    setEdit(structuredClone(p.params));
    setName(p.name);
    app.updatePrefs({ recentCrosshairs: [p.id, ...recent.filter((r) => r !== p.id)].slice(0, 8) });
  };
  const errors = validateCrosshair(edit);
  const fav = app.prefs.favoriteCrosshairs.includes(sel.id);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Crosshairs</h1>
          <p className="page-sub">{OWN_PRESETS.length} eigene CITADEL-Presets, deine Crosshairs und belegte Spieler-Crosshairs.</p>
        </div>
        <button className="btn" onClick={() => setCodeOpen(true)}>
          Code importieren
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 440px', alignItems: 'start' }}>
        <div className="col">
          <div className="panel panel-pad row wrap">
            <input className="input" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Crosshairs suchen" style={{ width: 180 }} />
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Typ">
              <option value="">Alle Typen</option>
              <option value="punkt">Punkt</option>
              <option value="kreuz">Kreuz</option>
              <option value="kreuz+punkt">Kreuz + Punkt</option>
              <option value="minimal">Minimal</option>
              <option value="gross">Groß</option>
            </select>
            <select className="select" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Farbe">
              <option value="">Alle Farben</option>
              {colors.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className="select" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Größe">
              <option value="">Alle Größen</option>
              <option value="klein">klein</option>
              <option value="mittel">mittel</option>
              <option value="gross">groß</option>
            </select>
            <select className="select" value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Herkunft">
              <option value="">Alle Herkünfte</option>
              <option value="own">CITADEL-Presets</option>
              <option value="mine">Meine</option>
              <option value="player">Belegte Spieler</option>
            </select>
            <label className="row small">
              <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} /> nur Favoriten
            </label>
          </div>
          {playerErr && <Notice kind="info">{playerErr}</Notice>}
          {recent.length > 0 && (
            <div className="row small wrap">
              <span className="muted">Zuletzt:</span>
              {recent
                .map((id) => all.find((p) => p.id === id))
                .filter(Boolean)
                .map((p) => (
                  <button key={p!.id} className="btn ghost sm" onClick={() => pick(p!)}>
                    <Thumb p={p!.params} size={22} scale={0.5} /> {p!.name}
                  </button>
                ))}
            </div>
          )}
          <div className="xh-grid" role="list">
            {filtered.map((p) => (
              <button key={p.id} role="listitem" className={`xh-card ${sel.id === p.id ? 'sel' : ''}`} onClick={() => pick(p)} aria-pressed={sel.id === p.id}>
                <div className="xh-thumb">
                  <Thumb p={p.params} />
                </div>
                <div className="xh-name">{p.name}</div>
                <div className="row small muted" style={{ gap: 6 }}>
                  <span className={`badge ${p.origin === 'player' ? 'brass' : p.author === 'Du' ? 'info' : 'jade'}`}>{p.origin === 'player' ? 'Spieler (belegt)' : p.author === 'Du' ? 'Meins' : 'CITADEL'}</span>
                  {app.prefs.favoriteCrosshairs.includes(p.id) && <span style={{ color: 'var(--brass)' }}>★</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel panel-pad col" style={{ position: 'sticky', top: 16 }}>
          <div className="row">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" style={{ flex: 1 }} />
            <button
              className="btn ghost sm"
              aria-label={fav ? 'Favorit entfernen' : 'Als Favorit merken'}
              onClick={() => app.updatePrefs({ favoriteCrosshairs: fav ? app.prefs.favoriteCrosshairs.filter((x) => x !== sel.id) : [...app.prefs.favoriteCrosshairs, sel.id] })}
            >
              {fav ? Icons.starFill : Icons.star}
            </button>
          </div>
          <div className="small muted">
            {sel.origin === 'player' ? (
              <>
                {sel.description} ·{' '}
                <button className="src-link" onClick={() => sel.sourceUrl && platform.openUrl(sel.sourceUrl)}>
                  Quelle
                </button>{' '}
                · {fmtDate(sel.createdAt)}
              </>
            ) : (
              sel.description
            )}
          </div>
          <Preview p={edit} />
          <Editor p={edit} onChange={setEdit} />
          {errors.length > 0 && <Notice kind="danger">{errors.join(' · ')}</Notice>}
          <hr className="sep" />
          <div className="row wrap">
            <Copy text={consoleCommand(edit)} label="Konsolenbefehl" />
            <Copy text={encodeShareCode(edit, name)} label="CITADEL-Code" />
            <button className="btn sm" onClick={() => downloadText(`crosshair-${name.replace(/[^\w-]+/g, '_')}.cfg`, `// ${name} – exportiert von CITADEL\n${toConvars(edit).map((c) => `${c.name} "${c.value}"`).join('\n')}\n`)}>
              .cfg exportieren
            </button>
            <button
              className="btn sm"
              onClick={async () => {
                const m: MyCrosshair = { id: `xh_${Date.now().toString(36)}`, name, params: edit, createdAt: new Date().toISOString() };
                await platform.store.put('crosshairs', m.id, m);
                setMine([...mine, m]);
                app.toast('ok', 'Gespeichert unter „Meine“.');
              }}
            >
              Speichern
            </button>
            <button className="btn sm" onClick={() => setCompare(sel)}>
              Vergleichen
            </button>
          </div>
          <button
            className="btn primary"
            disabled={errors.length > 0 || app.workspaceMode === 'none'}
            onClick={() => {
              app.setValues(
                'autoexec.cfg',
                Object.entries(toSettingValues(edit)).map(([settingId, value]) => ({ settingId, value })),
                `Crosshair „${name}“`,
              );
              app.toast('ok', 'Nur Crosshair-Werte in den Entwurf übernommen. Prüfen & anwenden im Config Studio.');
              app.go('studio');
              app.setReviewOpen(true);
            }}
          >
            Nur Crosshair lokal anwenden …
          </button>
          <div className="small muted">
            Der CITADEL-Code ist ein appinterner Code – kein offizieller Deadlock-Importcode. Angewendet wird über einen markierten Abschnitt in autoexec.cfg; ob Deadlock diese Datei im aktuellen Build automatisch ausführt, ist
            ungeprüft. Alternativ den Konsolenbefehl in der Spielkonsole einfügen.
          </div>
        </div>
      </div>
      {compare && <CompareModal a={compare} b={{ ...sel, name: `${name} (Editor)`, params: edit }} all={all} onClose={() => setCompare(null)} />}
      {codeOpen && (
        <CodeImport
          onClose={() => setCodeOpen(false)}
          onImport={(p, n) => {
            setEdit(p);
            setName(n || 'Importiertes Crosshair');
            setCodeOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Preview({ p }: { p: CrosshairParams }) {
  const [bg, setBg] = useState<string>('dusk');
  const [shot, setShot] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [spread, setSpread] = useState(0);
  const bgCss = bg === 'shot' && shot ? `url(${shot}) center/cover` : BACKGROUNDS.find((b) => b.id === bg)?.css;
  return (
    <div className="col">
      <div className="xh-bg xh-big" style={{ background: bgCss }}>
        <Thumb p={p} size={280} scale={scale} spread={spread} />
        <span className="lbl">Annäherung · {scale}× · nicht mit dem Spiel abgeglichen</span>
      </div>
      <div className="row wrap small">
        {BACKGROUNDS.map((b) => (
          <button key={b.id} className={`btn sm ${bg === b.id ? '' : 'ghost'}`} onClick={() => setBg(b.id)}>
            {b.label}
          </button>
        ))}
        <label className="btn sm ghost">
          Eigener Screenshot
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (shot) URL.revokeObjectURL(shot);
              setShot(URL.createObjectURL(f));
              setBg('shot');
            }}
          />
        </label>
      </div>
      <div className="row small">
        <span>Zoom</span>
        <div className="seg">
          {[1, 2, 4].map((s) => (
            <button key={s} className={scale === s ? 'on' : ''} onClick={() => setScale(s)}>
              {s}×
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 10 }}>Streuung</span>
        <input type="range" min={0} max={20} value={spread} onChange={(e) => setSpread(Number(e.target.value))} aria-label="Streuung simulieren" style={{ width: 120 }} />
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="row small" style={{ gap: 8 }}>
      <span style={{ width: 128 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono" style={{ width: 40, textAlign: 'right' }}>
        {value}
      </span>
    </label>
  );
}

function hex(c: [number, number, number]) {
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}
function unhex(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function Editor({ p, onChange }: { p: CrosshairParams; onChange: (p: CrosshairParams) => void }) {
  const s = (k: keyof CrosshairParams) => (v: number) => onChange({ ...p, [k]: v });
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row small">
        <span style={{ width: 128 }}>Farbe</span>
        <input type="color" value={hex(p.color)} onChange={(e) => onChange({ ...p, color: unhex(e.target.value) })} aria-label="Farbe" />
        <span style={{ width: 60 }}>Kontur</span>
        <input type="color" value={hex(p.outlineColor)} onChange={(e) => onChange({ ...p, outlineColor: unhex(e.target.value) })} aria-label="Konturfarbe" />
      </div>
      <Slider label="Linien-Abstand" value={p.pipGap} min={-10} max={50} step={0.5} onChange={s('pipGap')} />
      <Slider label="Linien-Länge" value={p.pipHeight} min={0} max={60} step={0.5} onChange={s('pipHeight')} />
      <Slider label="Linien-Breite" value={p.pipWidth} min={0} max={20} step={0.5} onChange={s('pipWidth')} />
      <Slider label="Linien-Deckkraft" value={p.pipOpacity} min={0} max={1} step={0.05} onChange={s('pipOpacity')} />
      <Slider label="Linien-Kontur" value={p.pipOutlineBorder} min={0} max={6} step={0.5} onChange={s('pipOutlineBorder')} />
      <Slider label="Kontur-Deckkraft" value={p.pipOutlineOpacity} min={0} max={1} step={0.05} onChange={s('pipOutlineOpacity')} />
      <Slider label="Punkt-Größe" value={p.dotSize} min={0} max={30} step={0.5} onChange={s('dotSize')} />
      <Slider label="Punkt-Deckkraft" value={p.dotOpacity} min={0} max={1} step={0.05} onChange={s('dotOpacity')} />
      <Slider label="Punkt-Kontur" value={p.dotOutlineBorder} min={0} max={6} step={0.5} onChange={s('dotOutlineBorder')} />
      <Slider label="Trefferanzeige (s)" value={p.hitMarkerDuration} min={0} max={2} step={0.01} onChange={s('hitMarkerDuration')} />
      <label className="row small">
        <input type="checkbox" checked={p.pipGapStatic} onChange={(e) => onChange({ ...p, pipGapStatic: e.target.checked })} /> Statischer Abstand
      </label>
      <label className="row small">
        <input type="checkbox" checked={p.disableHeroSpecific} onChange={(e) => onChange({ ...p, disableHeroSpecific: e.target.checked })} /> Heldenspezifische Reticles aus (Wirkung ungeprüft)
      </label>
      <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange(structuredClone(CROSSHAIR_DEFAULTS))}>
        Auf Spielstandard (laut ConVar-Liste)
      </button>
    </div>
  );
}

function CompareModal({ a, b, all, onClose }: { a: CrosshairPreset; b: CrosshairPreset; all: CrosshairPreset[]; onClose: () => void }) {
  const [left, setLeft] = useState(a.id);
  const L = all.find((x) => x.id === left) || a;
  const rows = toConvars(L.params).map((c, i) => ({ name: c.name.replace('citadel_crosshair_', ''), a: c.value, b: toConvars(b.params)[i].value }));
  return (
    <Modal title="Crosshairs vergleichen" onClose={onClose} wide>
      <div className="grid g2">
        {[L, b].map((p, i) => (
          <div key={i} className="col">
            {i === 0 ? (
              <select className="select" value={left} onChange={(e) => setLeft(e.target.value)}>
                {all.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            ) : (
              <b>{p.name}</b>
            )}
            <div className="xh-preview">
              {BACKGROUNDS.slice(0, 3).map((bg) => (
                <div key={bg.id} className="xh-bg" style={{ background: bg.css }}>
                  <Thumb p={p.params} size={150} scale={2} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <table className="table" style={{ marginTop: 14 }}>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>{L.name}</th>
            <th>{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={r.a !== r.b ? 'row-diff' : ''}>
              <td className="mono">{r.name}</td>
              <td className="mono">{r.a}</td>
              <td className="mono">{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function CodeImport({ onClose, onImport }: { onClose: () => void; onImport: (p: CrosshairParams, name?: string) => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal
      title="Crosshair importieren"
      onClose={onClose}
      footer={
        <button
          className="btn primary"
          onClick={() => {
            try {
              if (text.trim().startsWith('CTDL1-')) {
                const r = decodeShareCode(text);
                onImport(r.params, r.name);
              } else {
                const m = parseCrosshairCommands(text);
                if (!m.size) throw new Error('Keine citadel_crosshair_*-Befehle gefunden');
                const r = fromConvars(m);
                if (r.invalid.length) throw new Error(`Ungültig: ${r.invalid.join(', ')}`);
                onImport(r.params);
              }
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Importieren
        </button>
      }
    >
      <p className="small muted">CITADEL-Code (CTDL1-…) oder Konsolenbefehle einfügen. Es werden nur citadel_crosshair_*-Werte gelesen und wie selbst erstellte geprüft; andere Befehle werden ignoriert.</p>
      <textarea className="input mono" rows={6} style={{ width: '100%' }} value={text} onChange={(e) => setText(e.target.value)} aria-label="Code" />
      {err && <Notice kind="danger">{err}</Notice>}
    </Modal>
  );
}
