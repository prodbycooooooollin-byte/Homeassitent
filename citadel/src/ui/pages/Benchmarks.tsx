import { useEffect, useState } from 'react';
import { useApp } from '../state.tsx';
import { Notice, fmtDate, Empty } from '../components.tsx';
import { platform, isDesktop, errorMessage } from '../../platform/index.ts';
import { compareRuns, computeStats, downsample, parseFrameCsv, CaptureParseError, type BenchmarkRun, type Comparison } from '../../core/benchmark.ts';
import { bottleneckHint, gpuBusyShare } from '../../core/recommendations.ts';

interface BenchTest {
  id: string;
  name: string;
  change: string;
  conditions: string;
  createdAt: string;
  runs: BenchmarkRun[];
  gpuBusy?: Record<string, number | null>;
  decision?: { at: string; kept: boolean };
}

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

export function Benchmarks() {
  const app = useApp();
  const [tests, setTests] = useState<BenchTest[]>([]);
  const [cur, setCur] = useState<BenchTest | null>(null);
  const [warmup, setWarmup] = useState(10);
  const [seconds, setSeconds] = useState(60);
  const [err, setErr] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    void platform.store.list<BenchTest>('benchmarks').then((l) => {
      l.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setTests(l);
      setCur(l[0] ?? null);
    });
  }, []);

  const save = async (t: BenchTest) => {
    await platform.store.put('benchmarks', t.id, t);
    setTests((l) => [t, ...l.filter((x) => x.id !== t.id)]);
    setCur(t);
  };

  const addRun = async (label: 'baseline' | 'variante', csv: string, source: string, method: 'presentmon' | 'import') => {
    if (!cur) return;
    try {
      const s = parseFrameCsv(csv, source, { processName: 'deadlock.exe', warmupSeconds: warmup });
      const run: BenchmarkRun = {
        id: `r_${Date.now().toString(36)}`,
        label,
        profileName: label === 'baseline' ? 'Aktuelles Profil' : cur.change || 'Variante',
        change: cur.change,
        capturedAt: new Date().toISOString(),
        method,
        source,
        conditions: cur.conditions,
        stats: computeStats(s.frametimesMs),
        column: s.column,
        warmupDropped: s.warmupDropped,
        preview: downsample(s.frametimesMs, 300),
      };
      await save({ ...cur, runs: [...cur.runs, run], gpuBusy: { ...(cur.gpuBusy || {}), [run.id]: gpuBusyShare(s.frametimesMs, s.gpuBusyMs) } });
      setErr(null);
    } catch (e) {
      setErr(e instanceof CaptureParseError ? `Messdatei nicht auswertbar: ${e.message}` : errorMessage(e));
    }
  };

  const capture = async (label: 'baseline' | 'variante') => {
    let exe = app.prefs.presentMonPath;
    if (!exe) {
      exe = await platform.pickExe();
      if (!exe) return;
      app.updatePrefs({ presentMonPath: exe });
    }
    setCapturing(true);
    setErr(null);
    try {
      const csv = await platform.runPresentMon(exe, seconds);
      await addRun(label, csv, `PresentMon ${fmtDate(new Date().toISOString(), true)}`, 'presentmon');
    } catch (e) {
      setErr(`Aufnahme fehlgeschlagen: ${errorMessage(e)} – Alternativ eine CSV-Datei importieren.`);
    } finally {
      setCapturing(false);
    }
  };

  const base = cur?.runs.filter((r) => r.label === 'baseline') ?? [];
  const vari = cur?.runs.filter((r) => r.label === 'variante') ?? [];
  const cmp: Comparison[] = cur ? [compareRuns(base.map((r) => r.stats), vari.map((r) => r.stats), 'avgFps'), compareRuns(base.map((r) => r.stats), vari.map((r) => r.stats), 'low1PercentileFps')] : [];
  const gb = cur?.gpuBusy ? Object.values(cur.gpuBusy).filter((x): x is number => typeof x === 'number') : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Benchmarks</h1>
          <p className="page-sub">Vorher-nachher-Tests mit echten Frametime-Daten. Unterschiede zwischen beliebigen Matches beweisen keinen Effekt.</p>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            save({ id: `t_${Date.now().toString(36)}`, name: `Test ${new Date().toLocaleDateString('de-DE')}`, change: '', conditions: 'Gleiche Szene (z. B. Sandbox/Hideout, gleiche Route), gleiche Auflösung, nach Aufwärmen', createdAt: new Date().toISOString(), runs: [] })
          }
        >
          Neuer Test
        </button>
      </div>

      {tests.length > 1 && (
        <div className="row wrap" style={{ marginBottom: 12 }}>
          {tests.map((t) => (
            <button key={t.id} className={`btn sm ${cur?.id === t.id ? '' : 'ghost'}`} onClick={() => setCur(t)}>
              {t.name}
            </button>
          ))}
        </div>
      )}

      {!cur && <Empty title="Noch kein Test">Lege einen Test an: Baseline messen, eine klar abgegrenzte Änderung anwenden, erneut messen, vergleichen.</Empty>}
      {cur && (
        <div className="col" style={{ gap: 16 }}>
          <div className="panel panel-pad grid g3">
            <label className="field">
              Name
              <input className="input" value={cur.name} onChange={(e) => setCur({ ...cur, name: e.target.value })} onBlur={() => save(cur)} />
            </label>
            <label className="field">
              Geänderte Einstellung / Preset
              <input className="input" value={cur.change} placeholder="z. B. Schattenqualität 2 → 1" onChange={(e) => setCur({ ...cur, change: e.target.value })} onBlur={() => save(cur)} />
            </label>
            <label className="field">
              Bedingungen
              <input className="input" value={cur.conditions} onChange={(e) => setCur({ ...cur, conditions: e.target.value })} onBlur={() => save(cur)} />
            </label>
            <label className="field">
              Aufwärmphase verwerfen (s)
              <input className="input" style={{ width: 90 }} value={warmup} onChange={(e) => setWarmup(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              Messdauer PresentMon (s)
              <input className="input" style={{ width: 90 }} value={seconds} onChange={(e) => setSeconds(Math.max(5, Math.min(600, Number(e.target.value) || 60)))} />
            </label>
            <div className="small muted">
              Messung über eine externe PresentMon-Konsolenanwendung (vom Nutzer bereitgestellt, benötigt ggf. Administratorrechte oder Mitgliedschaft in „Leistungsprotokollbenutzer“) oder Import einer CSV (PresentMon, OCAT, CapFrameX-Export mit
              MsBetweenPresents). Keine Eingriffe in das Spiel, keine simulierten Werte.
            </div>
          </div>
          {err && <Notice kind="danger">{err}</Notice>}

          <div className="grid g2">
            {(['baseline', 'variante'] as const).map((label, idx) => (
              <div key={label} className="panel panel-pad col">
                <h3 className="panel-title">
                  {idx + 1 === 1 ? '1 · Baseline (aktuelles Profil)' : '3 · Variante (nach der Änderung)'}
                </h3>
                <div className="row wrap">
                  {isDesktop && (
                    <button className="btn sm" disabled={capturing} onClick={() => capture(label)}>
                      {capturing ? 'Messe …' : `Mit PresentMon messen (${seconds} s)`}
                    </button>
                  )}
                  <label className="btn sm">
                    CSV importieren
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      hidden
                      multiple
                      onChange={async (e) => {
                        for (const f of [...(e.target.files || [])]) await addRun(label, await f.text(), f.name, 'import');
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <RunsTable runs={label === 'baseline' ? base : vari} onDelete={(id) => save({ ...cur, runs: cur.runs.filter((r) => r.id !== id) })} />
                {label === 'baseline' && (
                  <div className="small muted">
                    2 · Danach genau eine Änderung im Config Studio anwenden ({app.pendingCount} ausstehend){app.lastApply ? `, zuletzt angewendet ${fmtDate(app.lastApply.at, true)}` : ''}. Spiel neu starten, gleiche Szene erneut messen.
                    <button className="btn ghost sm" onClick={() => app.go('studio')}>
                      Zum Config Studio
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="panel panel-pad col">
            <h3 className="panel-title">4 · Vergleich</h3>
            <div className="grid g2">
              {cmp.map((c) => (
                <div key={c.metric} className="col">
                  <div className="row">
                    <b>{c.metric === 'avgFps' ? 'Durchschnitts-FPS' : '1%-Low (P99-Frametime)'}</b>
                    <span className={`badge ${c.verdict === 'besser' ? 'jade' : c.verdict === 'schlechter' ? 'danger' : 'warn'}`}>
                      {c.verdict === 'besser' ? 'Besser' : c.verdict === 'schlechter' ? 'Schlechter' : c.verdict === 'uneindeutig' ? 'Kein klarer Vorteil' : 'Zu wenig Daten'}
                    </span>
                  </div>
                  <div className="mono">
                    {fmt(c.baselineMean)} → {fmt(c.variantMean)} ({Number.isFinite(c.deltaPct) ? `${c.deltaPct > 0 ? '+' : ''}${fmt(c.deltaPct)} %` : '—'})
                  </div>
                  <div className="small muted">{c.explanation}</div>
                </div>
              ))}
            </div>
            <FrametimeChart base={base[0]} vari={vari[0]} />
            <div className="small muted">
              {bottleneckHint(gb.length ? gb.reduce((a, b) => a + b, 0) / gb.length : null).label}: {bottleneckHint(gb.length ? gb.reduce((a, b) => a + b, 0) / gb.length : null).explanation}
            </div>
            <details className="tech">
              <summary>Berechnung</summary>
              Durchschnitts-FPS = Frames ÷ Gesamtzeit. 1%-Low = 1000 ÷ 99. Perzentil der Frametimes (lineare Interpolation). Zusätzlich angezeigt: Mittel der langsamsten 1 % Frames. Ein Unterschied gilt nur als klar bei ≥ 2 Läufen je
              Variante, nicht überlappenden Messbereichen und einer Differenz größer als die beobachtete Schwankung (mind. 3 %). FPS-Ziele sind Ziele, keine Garantie.
            </details>
          </div>

          <div className="panel panel-pad col">
            <h3 className="panel-title">5 · Entscheidung</h3>
            {cur.decision && <Notice kind="ok">Entschieden am {fmtDate(cur.decision.at, true)}: {cur.decision.kept ? 'behalten' : 'wiederhergestellt'}.</Notice>}
            <div className="row">
              <button
                className="btn primary"
                disabled={!app.lastApply}
                onClick={async () => {
                  await app.confirmWorking();
                  await save({ ...cur, decision: { at: new Date().toISOString(), kept: true } });
                }}
              >
                Behalten
              </button>
              <button
                className="btn"
                disabled={!app.lastApply || !isDesktop}
                onClick={async () => {
                  try {
                    await platform.restoreBackup(app.lastApply!.backupId, app.installation?.buildId ?? null);
                    await app.reload();
                    await save({ ...cur, decision: { at: new Date().toISOString(), kept: false } });
                    app.toast('ok', 'Vorheriger Stand wiederhergestellt (der aktuelle wurde vorher gesichert).');
                  } catch (e) {
                    app.toast('error', errorMessage(e));
                  }
                }}
              >
                Vorherigen Stand wiederherstellen
              </button>
            </div>
          </div>

          <ScreenshotCompare />
        </div>
      )}
    </div>
  );
}

function RunsTable({ runs, onDelete }: { runs: BenchmarkRun[]; onDelete: (id: string) => void }) {
  if (!runs.length) return <div className="muted small">Noch keine Messung. Für eine Aussage mindestens zwei Wiederholungen.</div>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Quelle</th>
          <th>Ø FPS</th>
          <th>1%-Low</th>
          <th>1%-Low (Ø)</th>
          <th>P99 ms</th>
          <th>Dauer</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td className="small">
              {r.source}
              <div className="muted">
                {r.stats.frames} Frames · Spalte {r.column} · {r.warmupDropped} Aufwärm-Frames verworfen
              </div>
            </td>
            <td className="mono">{fmt(r.stats.avgFps)}</td>
            <td className="mono">{fmt(r.stats.low1PercentileFps)}</td>
            <td className="mono">{fmt(r.stats.low1AverageFps)}</td>
            <td className="mono">{fmt(r.stats.p99FrametimeMs, 2)}</td>
            <td className="mono">{fmt(r.stats.durationS, 0)} s</td>
            <td>
              <button className="btn ghost sm" onClick={() => onDelete(r.id)} aria-label="Messung löschen">
                ✕
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FrametimeChart({ base, vari }: { base?: BenchmarkRun; vari?: BenchmarkRun }) {
  const series = [base && { r: base, color: '#8d8578', label: 'Baseline' }, vari && { r: vari, color: '#5fbf9f', label: 'Variante' }].filter(Boolean) as { r: BenchmarkRun; color: string; label: string }[];
  if (!series.length) return null;
  const W = 900;
  const H = 200;
  const maxT = Math.max(...series.map((s) => s.r.preview[s.r.preview.length - 1]?.t ?? 1));
  const maxMs = Math.min(100, Math.max(...series.flatMap((s) => s.r.preview.map((p) => p.ms))) * 1.1);
  return (
    <div className="col">
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label} (Frametime, Spitzen je Zeitfenster)
          </span>
        ))}
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Frametime-Verlauf">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="#2e2c29" />
        ))}
        {series.map((s) => (
          <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={1.4} points={s.r.preview.map((p) => `${(p.t / maxT) * W},${H - (Math.min(p.ms, maxMs) / maxMs) * H}`).join(' ')} />
        ))}
        <text x={6} y={14} fill="#8d8578" fontSize={11}>
          {fmt(maxMs, 0)} ms
        </text>
      </svg>
    </div>
  );
}

function ScreenshotCompare() {
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const pick = (set: (s: string | null) => void, prev: string | null) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (prev) URL.revokeObjectURL(prev);
    set(URL.createObjectURL(f));
  };
  return (
    <div className="panel panel-pad col">
      <h3 className="panel-title">Bildqualität vergleichen (eigene Screenshots)</h3>
      <div className="small muted">Lade zwei eigene Screenshots derselben Szene – vorher und nachher. CITADEL erzeugt keine Vergleichsbilder.</div>
      <div className="grid g2">
        {[
          [a, setA, 'Vorher'],
          [b, setB, 'Nachher'],
        ].map(([src, set, label]) => (
          <div key={label as string} className="col">
            <label className="btn sm" style={{ alignSelf: 'flex-start' }}>
              {label as string} wählen
              <input type="file" accept="image/*" hidden onChange={pick(set as (s: string | null) => void, src as string | null)} />
            </label>
            {src ? <img src={src as string} alt={label as string} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line-soft)' }} /> : <div className="xh-bg" style={{ background: 'var(--bg)' }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
