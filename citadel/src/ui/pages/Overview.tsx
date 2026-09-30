import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state.tsx';
import { InstallationChooser } from '../Workspace.tsx';
import { Notice, fmtDate } from '../components.tsx';
import { comparePatch, snapshotState } from '../../core/patch.ts';
import { platform, isDesktop } from '../../platform/index.ts';
import { api, fieldLabel, DEFAULT_API } from '../api.ts';
import type { ChangeEventDto, CoverageDto } from '../../core/models.ts';

export function Overview() {
  const app = useApp();
  const hw = app.hardware;
  const gpu = hw?.gpus.value?.[hw.activeGpuIndex ?? 0] ?? null;
  const display = hw?.displays.value?.find((d) => d.primary) ?? hw?.displays.value?.[0] ?? null;
  const base = app.prefs.apiUrl || DEFAULT_API;
  const [feed, setFeed] = useState<ChangeEventDto[] | null>(null);
  const [cov, setCov] = useState<{ c: CoverageDto; at: string; offline: boolean } | null>(null);

  const patch = useMemo(() => {
    if (!app.installation || !app.installState || app.workspaceMode !== 'installation') return null;
    const cur = snapshotState(app.installation.buildId, app.files.map((f) => ({ kind: f.kind, sha256: f.exists ? f.sha256 : null, text: f.exists ? f.text : null })));
    return comparePatch(app.installState, cur);
  }, [app.installation, app.installState, app.files, app.workspaceMode]);

  useEffect(() => {
    void api
      .status(base)
      .then((r) => setCov({ c: r.data.coverage, at: r.fetchedAt, offline: r.offline }))
      .catch(() => setCov(null));
    if (app.prefs.followed.length)
      void api
        .changes(base, 0, app.prefs.followed)
        .then((r) => setFeed(r.data.changes.slice(-12).reverse()))
        .catch(() => setFeed(null));
  }, [base, app.prefs.followed]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Übersicht</h1>
          <p className="page-sub">Deine Deadlock-Settings verstehen, schnell ändern und nachvollziehen, ob es besser wird.</p>
        </div>
      </div>

      {app.startupNotes.map((n) => (
        <Notice key={n} kind="warn">
          {n}
        </Notice>
      ))}

      <div className="hero" style={{ marginBottom: 16 }}>
        <div className="grid g2">
          <button className="cta" onClick={() => app.go('studio')}>
            <span className="badge jade" style={{ alignSelf: 'flex-start' }}>Config Studio</span>
            <h3>Config bearbeiten</h3>
            <p>Grafik, Anzeige, Crosshair und Maus mit Vorschau, Backup und Wiederherstellung.</p>
          </button>
          <button className="cta" onClick={() => app.go('optimize')}>
            <span className="badge brass" style={{ alignSelf: 'flex-start' }}>Performance Advisor</span>
            <h3>PC analysieren</h3>
            <p>Hardware erkennen, Ziele wählen, begründete Empfehlungen erhalten und messen.</p>
          </button>
        </div>
        <div className="panel panel-pad">
          <h3 className="panel-title">Status</h3>
          <dl className="kv">
            <dt>Arbeitsbereich</dt>
            <dd>{app.workspaceMode === 'installation' ? 'Installation' : app.workspaceMode === 'import' ? 'Importierte Dateien' : 'noch keiner'}</dd>
            <dt>Build</dt>
            <dd>{app.installation?.buildId ?? 'unbekannt'}</dd>
            <dt>Entwurf</dt>
            <dd>{app.pendingCount ? `${app.pendingCount} ausstehende Änderungen` : 'keine offenen Änderungen'}</dd>
            <dt>Zuletzt angewendet</dt>
            <dd>{app.lastApply ? `${fmtDate(app.lastApply.at, true)} – ${app.lastApply.confirmed ? 'bestätigt' : 'Übernahme ungeprüft'}` : '—'}</dd>
            <dt>Deadlock läuft</dt>
            <dd>{app.gameRunning === null ? 'nicht ermittelbar' : app.gameRunning ? 'ja' : 'nein'}</dd>
          </dl>
        </div>
      </div>

      {patch && (patch.buildChanged || patch.changedFiles.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <Notice kind="warn">
            <b>Patch-Check:</b> {patch.buildChanged ? `Spielupdate erkannt (Build ${patch.oldBuild ?? '?'} → ${patch.newBuild}). ` : ''}
            {patch.changedFiles.length ? `Geänderte Dateien seit der letzten Prüfung: ${patch.changedFiles.join(', ')}. ` : ''}
            {patch.removedKeys.length ? `Nicht mehr vorhanden: ${patch.removedKeys.slice(0, 6).join(', ')}. ` : ''}
            {patch.newUnknownKeys.length ? `Neue unbekannte Schlüssel: ${patch.newUnknownKeys.slice(0, 6).join(', ')}. ` : ''}
            {patch.buildChanged && 'Erneute Prüfung nötig: Alte Werte werden nicht automatisch erneut erzwungen.'}
            {patch.gameinfoReplaced && ' Die gameinfo.gi wurde durch das Update ersetzt – frühere Änderungen daran sind nicht mehr aktiv.'}
            <div style={{ marginTop: 8 }}>
              <button
                className="btn sm"
                onClick={async () => {
                  const cur = snapshotState(app.installation!.buildId, app.files.map((f) => ({ kind: f.kind, sha256: f.exists ? f.sha256 : null, text: f.exists ? f.text : null })));
                  await platform.store.put('install-state', app.installation!.id, cur);
                  await app.reload();
                  app.toast('ok', 'Aktueller Stand als geprüfte Referenz gespeichert.');
                }}
              >
                Geprüft – als neue Referenz übernehmen
              </button>
            </div>
          </Notice>
        </div>
      )}

      <div className="grid g3">
        <div className="panel panel-pad">
          <h3 className="panel-title">Erkanntes System</h3>
          {hw ? (
            <dl className="kv">
              <dt>CPU</dt>
              <dd>{hw.cpu.value ? `${hw.cpu.value.name} (${hw.cpu.value.cores ?? '?'}C/${hw.cpu.value.threads ?? '?'}T)` : 'Nicht ermittelbar'}</dd>
              <dt>GPU</dt>
              <dd>{gpu ? gpu.name : hw.gpus.value && hw.gpus.value.length > 1 ? 'Mehrere – Auswahl unter „Optimieren“' : 'Nicht ermittelbar'}</dd>
              <dt>RAM</dt>
              <dd>{hw.ramTotalMb.value ? `${Math.round(hw.ramTotalMb.value / 1024)} GB` : 'Nicht ermittelbar'}</dd>
              <dt>Anzeige</dt>
              <dd>{display ? `${display.currentWidth}×${display.currentHeight} @ ${display.currentHz ?? '?'} Hz` : 'Nicht ermittelbar'}</dd>
              <dt>Erfasst</dt>
              <dd>{fmtDate(hw.capturedAt, true)}</dd>
            </dl>
          ) : (
            <div className="muted">Noch nicht analysiert. {isDesktop ? '„PC analysieren“ startet die Erfassung.' : 'In der Browser-Version kannst du deine Hardware manuell eintragen.'}</div>
          )}
        </div>
        {isDesktop ? <InstallationChooser /> : (
          <div className="panel panel-pad">
            <h3 className="panel-title">Browser-Version</h3>
            <p className="small muted">Crosshair-Suche, Spielerprofile, manuelle Hardware-Eingabe sowie Config-Import und -Export funktionieren hier. Hardware-Erkennung und direktes Anwenden gibt es in der Desktop-App.</p>
          </div>
        )}
        <div className="panel panel-pad">
          <h3 className="panel-title">Spielerdaten</h3>
          {cov ? (
            <dl className="kv">
              <dt>Profile</dt>
              <dd>
                {cov.c.players.total} (Profis {cov.c.players.pro}, Rangliste {cov.c.players.highRank})
              </dd>
              <dt>mit belegten Werten</dt>
              <dd>{cov.c.players.withAnyField}</dd>
              <dt>Automatische Suche</dt>
              <dd>{cov.c.searchActive ? 'aktiv' : 'nicht aktiv'}</dd>
              <dt>Stand</dt>
              <dd>
                {fmtDate(cov.c.lastSuccessfulUpdate, true)}
                {cov.offline && ' (offline, lokaler Stand)'}
              </dd>
            </dl>
          ) : (
            <div className="muted small">Recherche-Dienst nicht erreichbar und kein lokaler Stand vorhanden.</div>
          )}
        </div>
      </div>

      {app.prefs.followed.length > 0 && (
        <div className="panel panel-pad" style={{ marginTop: 16 }}>
          <h3 className="panel-title">Gefolgte Spieler – veröffentlichte Änderungen</h3>
          {!feed?.length && <div className="muted small">Keine Änderungen.</div>}
          {feed?.map((e) => (
            <div key={e.id} className="feed-item">
              <span className="muted small">{fmtDate(e.at, true)}</span>
              <span>
                <b>{fieldLabel(e.field)}</b> {e.kind === 'source-gone' ? 'Quelle nicht mehr erreichbar' : e.kind === 'new' ? `neu: ${e.newValue}` : `${e.oldValue} → ${e.newValue}`}{' '}
                <button className="src-link small" onClick={() => void platform.openUrl(e.sourceUrl)}>
                  Quelle
                </button>
              </span>
            </div>
          ))}
          <div className="small muted" style={{ marginTop: 8 }}>
            Updates der Datenbank verändern nie automatisch deine lokale Config – übernehmen nur über den Anwenden-Schritt.
          </div>
        </div>
      )}
    </div>
  );
}
