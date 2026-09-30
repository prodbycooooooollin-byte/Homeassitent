import { useMemo, useState } from 'react';
import { useApp } from '../state.tsx';
import { Icons, Notice, fmtDate } from '../components.tsx';
import { platform, isDesktop, errorMessage } from '../../platform/index.ts';
import { recommend, driverAdvice, type Goals, type Recommendation } from '../../core/recommendations.ts';
import { readValues } from '../../core/config.ts';
import { SETTINGS_BY_ID, findSetting } from '../../core/catalog.ts';
import type { HardwareSnapshot, GpuInfo } from '../../core/models.ts';

const COLLECTED = [
  'CPU-Modell, Kerne und Threads (Win32_Processor)',
  'Grafikadapter, Treiberversion/-datum (Win32_VideoController), VRAM (Registry qwMemorySize)',
  'RAM gesamt und aktuell belegt (Win32_OperatingSystem)',
  'Windows-Version und Build',
  'Monitore, aktuelle Auflösung, Bildwiederholrate und verfügbare Modi (EnumDisplaySettings)',
  'Notebook ja/nein (Gehäusetyp/Akku) und aktiver Energieplan (powercfg)',
];

export function Optimize() {
  const app = useApp();
  const [confirmScan, setConfirmScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const hw = app.hardware;
  const video = useMemo(() => {
    const m = new Map<string, string>();
    const f = app.files.find((x) => x.kind === 'video.txt');
    if (f?.exists) for (const [k, v] of readValues('video.txt', app.draft['video.txt'] ?? f.text)) {
      const def = findSetting('video.txt', k);
      if (def) m.set(def.id, v.value);
    }
    return m;
  }, [app.files, app.draft]);
  const recs = useMemo(() => recommend({ hw, video, goals: app.goals }), [hw, video, app.goals]);
  const gpu: GpuInfo | null = hw?.gpus.value?.[hw.activeGpuIndex ?? -1] ?? (hw?.gpus.value?.length === 1 ? hw.gpus.value[0] : null);
  const driver = driverAdvice(gpu, hw?.laptop.value ?? null);

  const scan = async () => {
    setScanning(true);
    try {
      const s = await platform.hardware();
      app.setHardware(s);
    } catch (e) {
      app.toast('error', errorMessage(e));
    } finally {
      setScanning(false);
      setConfirmScan(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Optimieren</h1>
          <p className="page-sub">Begründete Empfehlungen für deinen PC. Gemessen ist erst, was unter „Benchmarks“ getestet wurde.</p>
        </div>
        {isDesktop && (
          <button className="btn primary lg" onClick={() => setConfirmScan(true)} disabled={scanning}>
            {scanning ? 'Analysiere …' : 'Meinen PC analysieren'}
          </button>
        )}
      </div>

      {confirmScan && (
        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <h3 className="panel-title">Folgende Informationen werden lokal erfasst</h3>
          <ul className="small">
            {COLLECTED.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="small muted">Die Daten bleiben auf diesem PC. Es werden keine Programme beendet und keine Einstellungen geändert.</p>
          <div className="row">
            <button className="btn primary" onClick={scan}>
              Analyse starten
            </button>
            <button className="btn ghost" onClick={() => setConfirmScan(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="panel panel-pad">
          <h3 className="panel-title">System {hw && <span className="muted small">· {fmtDate(hw.capturedAt, true)} · {hw.method === 'manual' ? 'manuell eingetragen' : 'lokal erkannt'}</span>}</h3>
          {hw ? <HardwareView hw={hw} /> : isDesktop ? <div className="muted">Noch keine Analyse.</div> : <ManualHardware />}
        </div>
        <GoalsForm />
      </div>

      <div className="panel panel-pad" style={{ marginBottom: 16 }}>
        <h3 className="panel-title">Empfehlungen ({recs.length})</h3>
        {!video.size && <Notice kind="info">Ohne eingelesene video.txt können keine Spieleinstellungen empfohlen werden – nur System-Hinweise.</Notice>}
        {recs.length === 0 && <div className="muted">Keine Empfehlung für die aktuellen Daten und Ziele. Das ist ein gültiges Ergebnis.</div>}
        {recs.map((r) => (
          <RecCard key={r.ruleId} r={r} />
        ))}
      </div>

      <div className="grid g2">
        <div className="panel panel-pad">
          <h3 className="panel-title">Treiber</h3>
          {driver ? (
            <div className="col small">
              <div>
                Installiert: <b className="mono">{driver.installed ?? 'Nicht ermittelbar'}</b> {gpu?.driverDate && <span className="muted">({gpu.driverDate})</span>}
              </div>
              <div className="muted">{driver.statement}</div>
              {driver.oemNote && <Notice kind="info">{driver.oemNote}</Notice>}
              {driver.officialUrl && (
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void platform.openUrl(driver.officialUrl!)}>
                  {Icons.link} Offizielle Herstellerseite öffnen
                </button>
              )}
              <div className="muted">Installation erfolgt bewusst durch dich – CITADEL lädt und startet keine Treiber.</div>
            </div>
          ) : (
            <div className="muted small">Aktive GPU unbekannt{hw?.gpus.value && hw.gpus.value.length > 1 ? ' – bitte oben auswählen' : ''}.</div>
          )}
        </div>
        <div className="panel panel-pad">
          <h3 className="panel-title">Windows</h3>
          <div className="col small">
            {[
              ['ms-settings:display-advanced', 'Bildwiederholrate prüfen'],
              ['ms-settings:display-advancedgraphics', 'GPU-Zuordnung pro App'],
              ['ms-settings:gaming-gamemode', 'Spielmodus'],
              ['ms-settings:powersleep', 'Energie & Akku'],
            ].map(([uri, label]) => (
              <div key={uri} className="row">
                <span>{label}</span>
                <span className="spacer" />
                <button className="btn sm" disabled={!isDesktop} onClick={() => platform.openWindowsSettings(uri).catch((e) => app.toast('error', errorMessage(e)))}>
                  Öffnen
                </button>
              </div>
            ))}
            <div className="muted">Keine Registry-Pakete, keine „Booster“, keine Echtzeit-Priorität, kein Abschalten von Schutzfunktionen.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HardwareView({ hw }: { hw: HardwareSnapshot }) {
  const app = useApp();
  const na = (s: { note?: string }) => <span className="muted">Nicht ermittelbar{s.note ? ` (${s.note})` : ''}</span>;
  return (
    <dl className="kv">
      <dt>CPU</dt>
      <dd>{hw.cpu.value ? `${hw.cpu.value.name} · ${hw.cpu.value.cores ?? '?'} Kerne / ${hw.cpu.value.threads ?? '?'} Threads` : na(hw.cpu)}</dd>
      <dt>GPU</dt>
      <dd>
        {hw.gpus.value?.length ? (
          <div className="col" style={{ gap: 4 }}>
            {hw.gpus.value.map((g, i) => (
              <label key={i} className="row small">
                {hw.gpus.value!.length > 1 && <input type="radio" name="gpu" checked={hw.activeGpuIndex === i} onChange={() => app.setHardware({ ...hw, activeGpuIndex: i })} />}
                <span>
                  {g.name} · {g.vramMb ? `${Math.round(g.vramMb / 1024)} GB VRAM` : 'VRAM nicht ermittelbar'}
                  {g.vramNote && <span className="muted"> ({g.vramNote})</span>} · Treiber {g.driverVersion ?? '?'}
                </span>
              </label>
            ))}
            {hw.gpus.value.length > 1 && hw.activeGpuIndex === null && <span className="small" style={{ color: 'var(--warn)' }}>Welche GPU Deadlock nutzt, ist nicht eindeutig – bitte wählen.</span>}
          </div>
        ) : (
          na(hw.gpus)
        )}
      </dd>
      <dt>RAM</dt>
      <dd>{hw.ramTotalMb.value ? `${(hw.ramTotalMb.value / 1024).toFixed(1)} GB, belegt ${hw.ramUsedMb.value ? (hw.ramUsedMb.value / 1024).toFixed(1) + ' GB' : '?'}` : na(hw.ramTotalMb)}</dd>
      <dt>Windows</dt>
      <dd>{hw.os.value ? `${hw.os.value.name} (${hw.os.value.build ?? hw.os.value.version})` : na(hw.os)}</dd>
      <dt>Anzeigen</dt>
      <dd>
        {hw.displays.value?.length
          ? hw.displays.value.map((d) => (
              <div key={d.name}>
                {d.primary ? '★ ' : ''}
                {d.name}: {d.currentWidth}×{d.currentHeight} @ {d.currentHz ?? '?'} Hz (max. {d.maxHzAtCurrentRes ?? '?'} Hz)
              </div>
            ))
          : na(hw.displays)}
      </dd>
      <dt>Notebook</dt>
      <dd>{hw.laptop.value === null ? na(hw.laptop) : hw.laptop.value ? 'ja' : 'nein'}</dd>
      <dt>Energieplan</dt>
      <dd>{hw.powerPlan.value ?? na(hw.powerPlan)}</dd>
      <dt>Temperaturen</dt>
      <dd className="muted">Keine unterstützte Datenquelle – nicht angeboten.</dd>
    </dl>
  );
}

function ManualHardware() {
  const app = useApp();
  const [f, setF] = useState({ cpu: '', gpu: '', vram: '', ram: '', hz: '', w: '', h: '' });
  const vendor = (n: string): GpuInfo['vendor'] => (/nvidia|geforce|rtx|gtx/i.test(n) ? 'nvidia' : /amd|radeon/i.test(n) ? 'amd' : /intel|arc/i.test(n) ? 'intel' : 'other');
  const src = 'manuell eingetragen';
  return (
    <div className="col">
      <div className="grid g2">
        {(
          [
            ['cpu', 'CPU'],
            ['gpu', 'GPU'],
            ['vram', 'VRAM (GB)'],
            ['ram', 'RAM (GB)'],
            ['w', 'Breite (px)'],
            ['h', 'Höhe (px)'],
            ['hz', 'Bildwiederholrate (Hz)'],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="field">
            {l}
            <input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <button
        className="btn primary"
        style={{ alignSelf: 'flex-start' }}
        onClick={() =>
          app.setHardware({
            schema: 1,
            capturedAt: new Date().toISOString(),
            method: 'manual',
            cpu: f.cpu ? { value: { name: f.cpu, cores: null, threads: null }, source: src } : { value: null, source: src },
            gpus: f.gpu ? { value: [{ name: f.gpu, vendor: vendor(f.gpu), vramMb: f.vram ? Number(f.vram) * 1024 : null, driverVersion: null, driverDate: null }], source: src } : { value: null, source: src },
            activeGpuIndex: f.gpu ? 0 : null,
            ramTotalMb: { value: f.ram ? Number(f.ram) * 1024 : null, source: src },
            ramUsedMb: { value: null, source: src },
            os: { value: null, source: src },
            displays: f.hz ? { value: [{ name: 'Monitor', primary: true, currentWidth: Number(f.w) || null, currentHeight: Number(f.h) || null, currentHz: Number(f.hz), maxHzAtCurrentRes: null, modes: [] }], source: src } : { value: null, source: src },
            laptop: { value: null, source: src },
            powerPlan: { value: null, source: src },
          })
        }
      >
        Übernehmen
      </button>
    </div>
  );
}

function GoalsForm() {
  const app = useApp();
  const g = app.goals;
  const set = (p: Partial<Goals>) => app.setGoals({ ...g, ...p });
  return (
    <div className="panel panel-pad">
      <h3 className="panel-title">Deine Ziele</h3>
      <div className="col">
        <label className="field">
          Ziel-FPS (Ziel, keine Garantie)
          <input className="input" style={{ width: 120 }} inputMode="numeric" value={g.targetFps ?? ''} onChange={(e) => set({ targetFps: e.target.value ? Number(e.target.value) : null })} />
        </label>
        <div className="field">
          Bildqualität
          <div className="seg" role="radiogroup">
            {(
              [
                ['leistung', 'Leistung'],
                ['ausgewogen', 'Ausgewogen'],
                ['qualitaet', 'Bildqualität'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} role="radio" aria-checked={g.quality === v} className={g.quality === v ? 'on' : ''} onClick={() => set({ quality: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          Hauptproblem
          <select className="select" value={g.problem} onChange={(e) => set({ problem: e.target.value as Goals['problem'] })}>
            <option value="keins">Kein spezielles Problem</option>
            <option value="wenig-fps">Generell wenig FPS</option>
            <option value="ruckler">Ruckler / ungleichmäßig</option>
            <option value="einbrueche">Einbrüche in Kämpfen</option>
            <option value="netzwerk">Lag / Verzögerung (Netzwerk?)</option>
            <option value="andere">Anderes</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function RecCard({ r }: { r: Recommendation }) {
  const app = useApp();
  const def = r.action.type === 'setting' ? SETTINGS_BY_ID.get(r.action.settingId) : null;
  return (
    <div className="setting" style={{ gridTemplateColumns: '1fr 280px' }}>
      <div>
        <div className="setting-name">
          {r.title}
          <span className={`badge ${r.basis === 'gemessen' ? 'jade' : ''}`}>{r.basis === 'gemessen' ? 'Messdaten vorhanden' : 'begründete Empfehlung'}</span>
          <span className="badge">Sicherheit: {r.confidence}</span>
        </div>
        <div className="setting-desc">{r.why}</div>
        <div className="setting-desc">Kompromiss: {r.tradeoff}</div>
        <details className="tech">
          <summary>Quellen &amp; Rückgängig</summary>
          {r.sources.map((s) => (
            <div key={s.label}>
              {s.url ? (
                <button className="src-link" onClick={() => void platform.openUrl(s.url!)}>
                  {s.label}
                </button>
              ) : (
                s.label
              )}{' '}
              · geprüft {s.checked}
            </div>
          ))}
          <div>Rückgängig: {r.undo}</div>
        </details>
      </div>
      <div className="col">
        {r.current !== undefined && (
          <div className="setting-values">
            Aktuell <b className="mono">{r.current}</b> → Vorschlag <b className="mono" style={{ color: 'var(--brass)' }}>{r.proposed}</b>
          </div>
        )}
        <div className="row wrap">
          {r.action.type === 'setting' && r.verbs.includes('uebernehmen') && (
            <button
              className="btn sm primary"
              onClick={() => {
                if (r.action.type !== 'setting') return;
                app.setValues(def!.file, [{ settingId: r.action.settingId, value: r.action.value }], `Empfehlung: ${r.title}`);
                app.toast('ok', 'In den Entwurf übernommen – prüfen und anwenden im Config Studio.');
              }}
            >
              Übernehmen
            </button>
          )}
          {r.action.type === 'setting' && r.verbs.includes('testen') && (
            <button
              className="btn sm"
              onClick={() => {
                if (r.action.type !== 'setting') return;
                app.setValues(def!.file, [{ settingId: r.action.settingId, value: r.action.value }], `Test: ${r.title}`);
                app.go('benchmarks');
              }}
            >
              Testen
            </button>
          )}
          {r.action.type === 'windows' && (
            <button className="btn sm" disabled={!isDesktop} onClick={() => r.action.type === 'windows' && platform.openWindowsSettings(r.action.uri).catch((e) => app.toast('error', errorMessage(e)))}>
              Anleitung öffnen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
