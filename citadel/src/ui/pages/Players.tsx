import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state.tsx';
import { Icons, Notice, fmtDate } from '../components.tsx';
import { api, fieldLabel, ORIGIN_LABEL, DEFAULT_API } from '../api.ts';
import { platform } from '../../platform/index.ts';
import type { CoverageDto, PlayerDto, FieldValueDto } from '../../core/models.ts';
import { readValues } from '../../core/config.ts';
import { SETTINGS_BY_ID, findSetting } from '../../core/catalog.ts';
import { createProfile, type ConfigProfile } from '../../core/profiles.ts';
import { eDpi, cm360 } from '../../core/sensitivity.ts';
import { renderSvg, fromConvars } from '../../core/crosshair.ts';

/** Übersetzt veröffentlichte Felder in lokale Einstellungs-IDs. DPI/Auflösung sind Hardware und werden nicht übertragen. */
export function fieldToSettings(f: FieldValueDto): { settingId: string; value: string }[] {
  if (f.field === 'crosshair') return Object.entries(JSON.parse(f.value) as Record<string, string>).map(([k, v]) => ({ settingId: `cfg.${k}`, value: v }));
  if (f.field === 'sensitivity') return [{ settingId: 'cfg.sensitivity', value: f.value }];
  if (f.field === 'zoom_sensitivity_ratio') return [{ settingId: 'cfg.zoom_sensitivity_ratio', value: f.value }];
  if (f.field === 'fov' && f.context === 'citadel_camera_hero_fov') return [{ settingId: 'gi.citadel_camera_hero_fov', value: f.value }];
  if (f.field.startsWith('video.') && SETTINGS_BY_ID.has(f.field)) return [{ settingId: f.field, value: f.value }];
  return [];
}

export function compiledProfile(p: PlayerDto): ConfigProfile {
  const values: Record<string, string> = {};
  for (const f of p.fields) for (const s of fieldToSettings(f)) values[s.settingId] = s.value;
  const prof = createProfile(`${p.displayName} – aus veröffentlichten Einstellungen zusammengestellt`, values, {
    type: 'player-compiled',
    label: 'Aus veröffentlichten Einstellungen zusammengestellt',
    sourceUrls: [...new Set(p.fields.map((f) => f.sourceUrl))],
    playerId: p.id,
  });
  prof.id = `pp_${p.id.replace(/[^\w-]/g, '')}`.slice(0, 80);
  prof.valueOrigins = Object.fromEntries(Object.keys(values).map((k) => [k, 'player' as const]));
  return prof;
}

export function Players() {
  const app = useApp();
  const base = app.prefs.apiUrl || DEFAULT_API;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [withValues, setWithValues] = useState(true);
  const [list, setList] = useState<PlayerDto[] | null>(null);
  const [meta, setMeta] = useState<{ at: string; offline: boolean } | null>(null);
  const [cov, setCov] = useState<CoverageDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<PlayerDto | null>(null);

  useEffect(() => {
    void api
      .status(base)
      .then((r) => setCov(r.data.coverage))
      .catch(() => setCov(null));
  }, [base]);
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .players(base, q, cat)
        .then((r) => {
          setList(r.data.players);
          setMeta({ at: r.fetchedAt, offline: r.offline });
          setErr(null);
          // Gefolgte Spieler: veröffentlichte Settings erscheinen automatisch als aktualisierbares Profil (nicht angewendet).
          for (const p of r.data.players) if (app.prefs.followed.includes(p.id) && p.fields.length) void app.saveProfile(compiledProfile(p));
        })
        .catch((e) => setErr((e as Error).message));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, q, cat]);

  const shown = (list || []).filter((p) => !withValues || p.fields.length > 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Spieler</h1>
          <p className="page-sub">Automatisch recherchierte, quellenbelegte Einstellungen. Nicht veröffentlichte Werte bleiben unbekannt.</p>
        </div>
      </div>
      {cov && <CoveragePanel cov={cov} />}
      {err && <Notice kind="warn">{err}</Notice>}
      {meta?.offline && <Notice kind="info">Offline – lokaler Stand vom {fmtDate(meta.at, true)}.</Notice>}
      <div className="grid" style={{ gridTemplateColumns: sel ? '360px minmax(0,1fr)' : '1fr', alignItems: 'start', marginTop: 16 }}>
        <div className="panel panel-pad col">
          <div className="row wrap">
            <input className="input" placeholder="Name suchen" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Spieler suchen" style={{ flex: 1 }} />
            <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kategorie">
              <option value="">Alle</option>
              <option value="pro">Profis</option>
              <option value="high-rank">Rangliste</option>
            </select>
          </div>
          <label className="row small">
            <input type="checkbox" checked={withValues} onChange={(e) => setWithValues(e.target.checked)} /> nur mit belegten Werten
          </label>
          <table className="table">
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} onClick={() => setSel(p)} style={{ cursor: 'pointer' }} className={sel?.id === p.id ? 'row-diff' : ''}>
                  <td>
                    <button className="src-link" style={{ borderBottom: 0 }} onClick={() => setSel(p)}>
                      {p.displayName}
                    </button>
                    {p.isDemo && <span className="badge warn" style={{ marginLeft: 6 }}>Demo</span>}
                    {app.prefs.followed.includes(p.id) && <span style={{ color: 'var(--brass)', marginLeft: 6 }}>★</span>}
                    <div className="small muted">{p.category === 'pro' ? 'Profi' : p.category === 'high-rank' ? 'Rangliste' : 'Kategorie unbekannt'} · {p.fields.length} Werte</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list && !shown.length && <div className="muted small">Keine Einträge.</div>}
        </div>
        {sel && <PlayerDetail key={sel.id} p={sel} onClose={() => setSel(null)} />}
      </div>
    </div>
  );
}

function CoveragePanel({ cov }: { cov: CoverageDto }) {
  return (
    <div className="panel panel-pad">
      <div className="grid g4">
        <div className="stat">
          <span className="stat-label">Automatisch gefunden</span>
          <span className="stat-value">{cov.players.total}</span>
          <span className="small muted">
            {cov.players.pro} Profis · {cov.players.highRank} Rangliste
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Mit belegten Werten</span>
          <span className="stat-value">{cov.players.withAnyField}</span>
          <span className="small muted">{Object.entries(cov.fields).map(([f, n]) => `${fieldLabel(f)} ${n}`).slice(0, 4).join(' · ') || 'noch keine'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Letzte erfolgreiche Aktualisierung</span>
          <span className="stat-value" style={{ fontSize: 15 }}>
            {fmtDate(cov.lastSuccessfulUpdate, true)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Automatische Suche / AI</span>
          <span className="stat-value" style={{ fontSize: 15 }}>
            {cov.searchActive ? 'Suche aktiv' : 'Suche nicht aktiv'} · {cov.aiActive ? 'AI verfügbar' : 'ohne AI'}
          </span>
        </div>
      </div>
      <details className="tech" style={{ marginTop: 10 }}>
        <summary>Quellen ({cov.sources.length}) – Status und Ausfälle</summary>
        <table className="table">
          <thead>
            <tr>
              <th>Quelle</th>
              <th>Status</th>
              <th>Zuletzt erfolgreich</th>
              <th>Letzter Fehler</th>
            </tr>
          </thead>
          <tbody>
            {cov.sources.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  <div className="small muted">{s.reason}</div>
                </td>
                <td>
                  <span className={`badge ${s.status === 'ok' ? 'jade' : s.status === 'fehler' ? 'danger' : 'warn'}`}>{s.status}</span>
                </td>
                <td>{fmtDate(s.lastSuccessAt, true)}</td>
                <td className="small">{s.lastError ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function PlayerDetail({ p, onClose }: { p: PlayerDto; onClose: () => void }) {
  const app = useApp();
  const [myDpi, setMyDpi] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const followed = app.prefs.followed.includes(p.id);
  const mine = useMemo(() => {
    const out = new Map<string, string>();
    for (const kind of ['video.txt', 'autoexec.cfg', 'gameinfo.gi'] as const) {
      const t = app.draft[kind];
      if (!t) continue;
      for (const [k, v] of readValues(kind, t)) {
        const def = findSetting(kind, k);
        if (def) out.set(def.id, v.value);
      }
    }
    return out;
  }, [app.draft]);
  const localVideoKeys = useMemo(() => new Set([...readValues('video.txt', app.draft['video.txt'] ?? '').keys()]), [app.draft]);
  const sens = p.fields.find((f) => f.field === 'sensitivity');
  const dpi = p.fields.find((f) => f.field === 'dpi');
  const crosshair = p.fields.find((f) => f.field === 'crosshair');

  const take = (fields: FieldValueDto[], label: string) => {
    const reqs = fields.flatMap(fieldToSettings);
    const incompatible = reqs.filter((r) => r.settingId.startsWith('video.') && !localVideoKeys.has(SETTINGS_BY_ID.get(r.settingId)!.key.toLowerCase()));
    const ok = reqs.filter((r) => !incompatible.includes(r) && SETTINGS_BY_ID.get(r.settingId)?.applyPolicy !== 'draft-only');
    if (!ok.length) return app.toast('info', 'Nichts übertragbar (Werte fehlen, sind Hardware-Angaben oder im lokalen Build nicht vorhanden).');
    const r = app.setValuesMulti(ok, `Von ${p.displayName} übernommen (${label})`);
    app.toast('ok', `${r.applied} Werte in den Entwurf übernommen${incompatible.length ? `, ${incompatible.length} nicht kompatibel mit deinem Build` : ''}. Noch nichts geschrieben.`);
  };

  return (
    <div className="panel panel-pad col">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: 18 }}>{p.displayName}</h2>
        <span className={`badge ${p.category === 'pro' ? 'brass' : 'jade'}`}>{p.category === 'pro' ? 'Profi' : p.category === 'high-rank' ? 'Rangliste' : 'unbekannt'}</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => app.updatePrefs({ followed: followed ? app.prefs.followed.filter((x) => x !== p.id) : [...app.prefs.followed, p.id] })}>
          {followed ? Icons.starFill : Icons.star} {followed ? 'Gefolgt' : 'Folgen'}
        </button>
        <button className="btn ghost sm" onClick={onClose} aria-label="Schließen">
          {Icons.x}
        </button>
      </div>
      <div className="small muted">Einstufung: {p.categoryEvidence}</div>
      {p.aliases.length > 0 && <div className="small muted">Weitere Namen: {p.aliases.join(', ')}</div>}
      <div className="row wrap small">
        {p.identities.map((i) => (
          <span key={i.platform + i.handle} className="badge">
            {i.platform}: {i.url ? <button className="src-link" onClick={() => void platform.openUrl(i.url!)}>{i.handle}</button> : i.handle}
            <span className="muted">({i.linkType === 'wiki-listed' ? 'laut Wiki' : i.linkType === 'api-id' ? 'API-ID' : 'selbst angegeben'})</span>
          </span>
        ))}
      </div>

      <h3 className="panel-title" style={{ marginTop: 10 }}>Belegte Werte</h3>
      {!p.fields.length && <div className="muted">Für diesen Spieler wurden noch keine öffentlich belegten Einstellungen gefunden. Nichts wird geschätzt.</div>}
      {p.fields.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>Feld</th>
              <th>Wert</th>
              <th>Deins</th>
              <th>Herkunft</th>
              <th>Datum</th>
            </tr>
          </thead>
          <tbody>
            {p.fields.map((f) => {
              const settings = fieldToSettings(f);
              const my = settings.length === 1 ? mine.get(settings[0].settingId) : undefined;
              const key = `${f.field}:${f.context ?? ''}`;
              return (
                <tr key={key}>
                  <td>
                    <input
                      type="checkbox"
                      disabled={!settings.length}
                      aria-label={`${fieldLabel(f.field)} auswählen`}
                      checked={picked.has(key)}
                      onChange={(e) => {
                        const n = new Set(picked);
                        if (e.target.checked) n.add(key);
                        else n.delete(key);
                        setPicked(n);
                      }}
                    />
                  </td>
                  <td>
                    {fieldLabel(f.field)}
                    {f.context && f.context !== 'ingame' && <div className="small muted">{f.context}</div>}
                  </td>
                  <td className="mono">
                    {f.field === 'crosshair' ? (
                      <span dangerouslySetInnerHTML={{ __html: renderSvg(fromConvars(JSON.parse(f.value)).params, { size: 40 }) }} style={{ background: '#2b2f33', display: 'inline-block', borderRadius: 4 }} />
                    ) : (
                      f.value
                    )}
                    {f.unit && <span className="muted"> {f.unit}</span>}
                  </td>
                  <td className="mono">{settings.length === 1 ? my ?? '—' : settings.length ? '' : 'Hardware'}</td>
                  <td className="small">
                    <span className={`badge ${f.origin === 'auto-primary' ? 'jade' : ''}`}>{ORIGIN_LABEL[f.origin]}</span>
                    <div>
                      <button className="src-link" onClick={() => void platform.openUrl(f.sourceUrl)}>
                        {new URL(f.sourceUrl).hostname}
                      </button>
                    </div>
                    <div className="muted" title={f.evidence}>
                      „{f.evidence.slice(0, 90)}
                      {f.evidence.length > 90 ? '…' : ''}“
                    </div>
                  </td>
                  <td className="small">
                    <div>Vom Spieler zuletzt bestätigt: {f.playerConfirmedAt ? fmtDate(f.playerConfirmedAt) : 'unbekannt'}</div>
                    <div className="muted">Veröffentlicht/geändert: {fmtDate(f.publishedAt)}</div>
                    <div className="muted">Zuletzt abgerufen: {fmtDate(f.retrievedAt)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {p.conflicts.length > 0 && (
        <Notice kind="warn">
          Widersprüchliche Angaben (nicht übernommen): {p.conflicts.map((c) => `${fieldLabel(c.field.split(':')[0])}: ${c.candidates.map((x) => x.value).join(' / ')}`).join('; ')}
        </Notice>
      )}
      <div className="row wrap">
        <button className="btn sm" disabled={!crosshair} onClick={() => take([crosshair!], 'nur Crosshair')}>
          Nur Crosshair übernehmen
        </button>
        <button className="btn sm" disabled={!p.fields.some((f) => f.field.startsWith('video.'))} onClick={() => take(p.fields.filter((f) => f.field.startsWith('video.')), 'nur Grafik')}>
          Nur Grafik übernehmen
        </button>
        <button className="btn sm" disabled={!picked.size} onClick={() => take(p.fields.filter((f) => picked.has(`${f.field}:${f.context ?? ''}`)), 'Auswahl')}>
          Auswahl übernehmen ({picked.size})
        </button>
        <button
          className="btn sm ghost"
          disabled={!p.fields.length}
          onClick={async () => {
            await app.saveProfile(compiledProfile(p));
            app.toast('ok', 'Profil „Aus veröffentlichten Einstellungen zusammengestellt“ gespeichert.');
          }}
        >
          Als Profil speichern
        </button>
      </div>
      <div className="small muted">Eine Übernahme ändert nur den Entwurf. Fremde Grafikwerte werden nur übernommen, wenn dein Build den Schlüssel kennt.</div>

      <h3 className="panel-title" style={{ marginTop: 10 }}>Sensitivitätshelfer</h3>
      <div className="grid g3 small">
        <div>
          <div className="muted">eDPI {p.displayName}</div>
          <div className="mono">{eDpi(sens ? Number(sens.value) : null, dpi ? Number(dpi.value) : null) ?? 'unbekannt (DPI oder Sensitivität fehlt)'}</div>
        </div>
        <div>
          <label className="field">
            Deine DPI
            <input className="input" style={{ width: 100 }} value={myDpi} onChange={(e) => setMyDpi(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
          </label>
          <div className="muted">Deine eDPI: {eDpi(mine.get('cfg.sensitivity') ? Number(mine.get('cfg.sensitivity')) : null, myDpi ? Number(myDpi) : null) ?? '—'}</div>
        </div>
        <div className="muted">cm/360: {cm360(null, null).explanation}</div>
      </div>

      {p.configArtifacts.length > 0 && (
        <>
          <h3 className="panel-title" style={{ marginTop: 10 }}>Config-Dateien</h3>
          {p.configArtifacts.map((a) => (
            <div key={a.id} className="small">
              <span className="mono">{a.fileName}</span> – {a.relation === 'player-original' ? 'Original-Config des Spielers (Zuordnung belegt)' : 'Community-Preset'} · {a.attribution} · abgerufen {fmtDate(a.retrievedAt)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
