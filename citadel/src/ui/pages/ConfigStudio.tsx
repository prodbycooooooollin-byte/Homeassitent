import { useMemo, useState } from 'react';
import { useApp, REL } from '../state.tsx';
import { CATEGORY_LABELS, EVIDENCE, SETTINGS, STATUS_LABELS, type ConfigFileKind, type SettingCategory, type SettingDefinition } from '../../core/catalog.ts';
import { readValues, applicableText, explainConfig } from '../../core/config.ts';
import { bindings, parseCfg } from '../../core/cfg.ts';
import { parseKv } from '../../core/kv.ts';
import { CodeEditor } from '../Editor.tsx';
import { DiffView, FileDrop, Icons, Modal, Notice, Toggle, fmtDate } from '../components.tsx';
import { ImportDialog, WorkspaceGate, readDropped } from '../Workspace.tsx';
import { downloadText, platform } from '../../platform/index.ts';
import { api } from '../api.ts';

type View = { type: 'cat'; cat: SettingCategory } | { type: 'binds' } | { type: 'text'; kind: ConfigFileKind } | { type: 'import' };

export function ConfigStudio() {
  const app = useApp();
  const [view, setView] = useState<View>({ type: 'cat', cat: 'anzeige' });
  const [sideOpen, setSideOpen] = useState(true);
  const [importing, setImporting] = useState<{ kind: ConfigFileKind; name: string; text: string } | null>(null);

  const current = useMemo(() => {
    const m = new Map<ConfigFileKind, Map<string, string>>();
    for (const f of app.files) m.set(f.kind, new Map([...readValues(f.kind, f.text)].map(([k, v]) => [k, v.value])));
    return m;
  }, [app.files]);
  const planned = useMemo(() => {
    const m = new Map<ConfigFileKind, Map<string, string>>();
    for (const f of app.files) m.set(f.kind, new Map([...readValues(f.kind, app.draft[f.kind] ?? '')].map(([k, v]) => [k, v.value])));
    return m;
  }, [app.files, app.draft]);

  if (app.workspaceMode === 'none') return <WorkspaceGate />;

  const cats = (Object.keys(CATEGORY_LABELS) as SettingCategory[]).filter((c) => SETTINGS.some((s) => s.category === c));
  const changedIds = new Set(app.changeSet.files.flatMap((f) => f.items.map((i) => i.def?.id).filter(Boolean) as string[]));

  return (
    <div className="studio">
      <aside className="studio-cats" aria-label="Kategorien">
        <div className="panel-title" style={{ padding: '0 10px' }}>Einfach</div>
        {cats.map((c) => (
          <button key={c} className={`nav-item ${view.type === 'cat' && view.cat === c ? 'active' : ''}`} onClick={() => setView({ type: 'cat', cat: c })}>
            {CATEGORY_LABELS[c]}
            <span className="count">{SETTINGS.filter((s) => s.category === c && changedIds.has(s.id)).length || ''}</span>
          </button>
        ))}
        <button className={`nav-item ${view.type === 'binds' ? 'active' : ''}`} onClick={() => setView({ type: 'binds' })}>
          Tastenbelegung
        </button>
        <div className="panel-title" style={{ padding: '14px 10px 0' }}>Experte</div>
        {app.files.map((f) => (
          <button key={f.kind} className={`nav-item ${view.type === 'text' && view.kind === f.kind ? 'active' : ''}`} onClick={() => setView({ type: 'text', kind: f.kind })}>
            <span className="mono">{f.kind}</span>
            {!f.exists && <span className="count">neu</span>}
          </button>
        ))}
        <div className="panel-title" style={{ padding: '14px 10px 0' }}>Import</div>
        <button className={`nav-item ${view.type === 'import' ? 'active' : ''}`} onClick={() => setView({ type: 'import' })}>
          Config importieren &amp; erklären
        </button>
      </aside>

      <section className="studio-main">
        <StudioHeader onToggleSide={() => setSideOpen(!sideOpen)} sideOpen={sideOpen} />
        {view.type === 'cat' && (
          <div className="panel panel-pad">
            <h2 className="panel-title">{CATEGORY_LABELS[view.cat]}</h2>
            {(() => {
              const defs = SETTINGS.filter((s) => s.category === view.cat);
              const missing = defs.filter((d) => d.applyPolicy === 'if-present' && current.get(d.file)?.get(d.key.toLowerCase()) === undefined);
              const shown = defs.filter((d) => !missing.includes(d));
              return (
                <>
                  {shown.map((def) => (
                    <SettingRow key={def.id} def={def} current={current.get(def.file)?.get(def.key.toLowerCase())} planned={planned.get(def.file)?.get(def.key.toLowerCase())} fileExists={app.files.find((f) => f.kind === def.file)?.exists ?? false} />
                  ))}
                  {!shown.length && <div className="muted small">Keine anwendbaren Einstellungen in dieser Kategorie für die eingelesenen Dateien.</div>}
                  {missing.length > 0 && (
                    <details className="tech" style={{ marginTop: 12 }}>
                      <summary>
                        {missing.length} Einstellungen nicht in deiner Datei – vom installierten Build nicht angelegt, daher nicht anwendbar
                      </summary>
                      <div className="small" style={{ marginTop: 6 }}>
                        {missing.map((d) => (
                          <div key={d.id}>
                            {d.label} <span className="mono muted">{d.key}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              );
            })()}
          </div>
        )}
        {view.type === 'binds' && <BindingsView />}
        {view.type === 'text' && <TextView kind={view.kind} />}
        {view.type === 'import' && <ImportView onPick={setImporting} />}
        <div className="pending-bar">
          <span className="pending-count" aria-label="Ausstehende Änderungen">{app.pendingCount}</span>
          <span>{app.pendingCount === 1 ? 'ausstehende Änderung' : 'ausstehende Änderungen'}</span>
          {app.gameRunning && <span className="badge warn">Deadlock läuft – wird als Entwurf vorgemerkt</span>}
          <span className="spacer" />
          <button className="btn ghost" disabled={!app.pendingCount} onClick={() => app.resetDraft()}>
            Entwurf verwerfen
          </button>
          <button className="btn primary" disabled={!app.pendingCount} onClick={() => app.setReviewOpen(true)}>
            Änderungen prüfen
          </button>
        </div>
      </section>

      <aside className={`studio-side ${sideOpen ? '' : 'closed'}`} aria-label="Änderungsvorschau">
        {sideOpen && <SidePreview />}
      </aside>
      {app.reviewOpen && <ReviewModal />}
      {importing && <ImportDialog file={importing} onClose={() => setImporting(null)} />}
    </div>
  );
}

function StudioHeader({ onToggleSide, sideOpen }: { onToggleSide: () => void; sideOpen: boolean }) {
  const app = useApp();
  const la = app.lastApply;
  return (
    <div className="col" style={{ marginBottom: 16 }}>
      <div className="page-head" style={{ marginBottom: 6 }}>
        <div>
          <h1 className="page-title">Config Studio</h1>
          <p className="page-sub">
            {app.workspaceMode === 'installation' ? (
              <>
                <span className="mono">{app.installation?.root}</span> · Build {app.installation?.buildId ?? 'unbekannt'}
              </>
            ) : (
              'Import-Arbeitsbereich – Änderungen werden als Dateien exportiert'
            )}
          </p>
        </div>
        <div className="row">
          {app.workspaceMode === 'installation' && (
            <button className="btn ghost sm" onClick={app.reload}>
              {Icons.refresh} Neu einlesen
            </button>
          )}
          <button className="btn ghost sm" onClick={onToggleSide}>
            {sideOpen ? 'Vorschau ausblenden' : 'Vorschau einblenden'}
          </button>
        </div>
      </div>
      {Object.entries(app.readOnlyReasons).map(([k, r]) => (
        <Notice key={k} kind="warn">
          {k}: {r}
        </Notice>
      ))}
      {la && la.installationId === app.installation?.id && (
        <div className="panel panel-pad row wrap" style={{ gap: 14 }}>
          <span className="badge jade">{Icons.check} Gespeichert {fmtDate(la.at, true)}</span>
          <span className="badge jade">{Icons.check} Zurückgelesen</span>
          {la.restartRequired && <span className="badge warn">Neustart des Spiels erforderlich</span>}
          {la.confirmed ? (
            <span className="badge jade">Übernahme bestätigt ({la.confirmed.how === 'user' ? 'von dir' : 'Spiel hat Werte beibehalten'})</span>
          ) : la.gameResetValues?.length ? (
            <span className="badge danger">Spiel hat Werte zurückgesetzt: {la.gameResetValues.join(', ')}</span>
          ) : (
            <span className="badge">Übernahme durch das Spiel noch nicht bestätigt</span>
          )}
          <span className="spacer" />
          {!la.confirmed && (
            <button className="btn sm" onClick={app.confirmWorking}>
              Spiel getestet – funktioniert
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function evidenceList(def: SettingDefinition) {
  return def.evidence.map((id) => EVIDENCE[id]).filter(Boolean);
}

function SettingRow({ def, current, planned, fileExists }: { def: SettingDefinition; current?: string; planned?: string; fileExists: boolean }) {
  const app = useApp();
  const presentLocally = current !== undefined;
  const missingInBuild = def.applyPolicy === 'if-present' && !presentLocally;
  const disabled = missingInBuild || !def.portable || Boolean(app.readOnlyReasons[def.file]);
  const changed = planned !== current;
  const value = planned ?? current ?? def.default ?? '';
  const set = (v: string) => app.setValues(def.file, [{ settingId: def.id, value: v }], 'Manuell im Config Studio geändert');
  const num = def.type === 'int' || def.type === 'float';
  const bool = def.type === 'bool01' || def.type === 'boolword';
  const on = value === '1' || value === 'true';
  return (
    <div className={`setting ${changed ? 'changed' : ''}`}>
      <div>
        <div className="setting-name">
          {def.label}
          {def.status !== 'confirmed' && <span className="badge">{STATUS_LABELS[def.status]}</span>}
          {def.applyPolicy === 'draft-only' && <span className="badge warn">Nur Entwurf</span>}
          {def.restartRequired && <span className="badge info">Neustart</span>}
          {!def.portable && <span className="badge brass">gerätespezifisch</span>}
        </div>
        <div className="setting-desc">{def.description}</div>
        {def.impact && (
          <div className="setting-desc">
            Darstellung: {def.impact.visual} · Leistung: {def.impact.performance} <span className="badge" style={{ marginLeft: 4 }}>Evidenz: {def.impact.level}</span>
          </div>
        )}
        <details className="tech">
          <summary>Technische Details</summary>
          <div className="mono">
            {def.file} · {def.block ? `${def.block.join(' › ')} › ` : ''}
            {def.key}
          </div>
          {def.dependsOn && <div>Abhängig von: {def.dependsOn.join(', ')}</div>}
          {def.note && <div>{def.note}</div>}
          {evidenceList(def).map((e) => (
            <div key={e.id}>
              Quelle: <button className="src-link" onClick={() => void platform.openUrl(e.url)}>{e.title}</button> ({e.date}, geprüft {e.retrieved}) – {e.note}
            </div>
          ))}
        </details>
      </div>
      <div className="setting-ctl">
        {missingInBuild ? (
          <div className="small muted">
            {fileExists ? 'Die lokale Datei enthält diesen Schlüssel nicht – der installierte Build legt ihn nicht an. Nicht anwendbar.' : `${def.file} fehlt.`}
          </div>
        ) : bool ? (
          <div className="row">
            <Toggle on={on} label={def.label} disabled={disabled} onChange={(v) => set(def.type === 'bool01' ? (v ? '1' : '0') : v ? 'true' : 'false')} />
            <span>{on ? 'An' : 'Aus'}</span>
          </div>
        ) : def.options ? (
          <select className="select" value={value} disabled={disabled} onChange={(e) => set(e.target.value)} aria-label={def.label}>
            {!def.options.some((o) => o.value === value) && <option value={value}>{value || '—'}</option>}
            {def.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : num ? (
          <NumberControl def={def} value={value} disabled={disabled} onCommit={set} />
        ) : null}
        <div className="setting-values">
          <span>
            Aktuell: <b className="mono">{current ?? 'nicht gesetzt'}</b>
          </span>
          {changed && (
            <span>
              Geplant: <b className="mono" style={{ color: 'var(--brass)' }}>{planned ?? 'entfernt'}</b>
            </span>
          )}
          {changed && (
            <button className="btn ghost sm" onClick={() => app.setValues(def.file, [{ settingId: def.id, value: current ?? null }])}>
              {Icons.undo} zurück
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NumberControl({ def, value, disabled, onCommit }: { def: SettingDefinition; value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [focus, setFocus] = useState(false);
  const shown = focus ? text : value;
  const n = Number(shown);
  const invalid = shown !== '' && (Number.isNaN(n) || (def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max));
  const slider = def.min !== undefined && def.max !== undefined && def.max - def.min <= 1000;
  return (
    <div className="row">
      {slider && (
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step ?? (def.type === 'int' ? 1 : 0.01)}
          value={Number.isFinite(n) ? n : 0}
          disabled={disabled}
          aria-label={def.label}
          onChange={(e) => onCommit(def.type === 'int' ? String(Math.round(Number(e.target.value))) : e.target.value)}
        />
      )}
      <input
        className={`input mono ${invalid ? 'invalid' : ''}`}
        style={{ width: 96 }}
        value={shown}
        disabled={disabled}
        aria-label={`${def.label} Wert`}
        aria-invalid={invalid}
        onFocus={() => {
          setText(value);
          setFocus(true);
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocus(false);
          if (!invalid && text !== value && text !== '') onCommit(text);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {invalid && <span className="small" style={{ color: 'var(--danger)' }}>{def.min}–{def.max}</span>}
    </div>
  );
}

function BindingsView() {
  const app = useApp();
  const text = app.draft['autoexec.cfg'] ?? '';
  const list = [...bindings(parseCfg(text)).values()];
  return (
    <div className="panel panel-pad">
      <h2 className="panel-title">Tastenbelegung (autoexec.cfg)</h2>
      <p className="small muted">
        Angezeigt werden bind-Befehle aus deiner autoexec.cfg. Deadlocks eigene Menü-Belegungen liegen in einer anderen, noch ungeprüften Datei und werden nicht verändert. Bearbeiten im Expertenmodus
        (autoexec.cfg).
      </p>
      {list.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Taste</th>
              <th>Befehl</th>
              <th>Zeile</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.key}>
                <td className="mono">{b.key}</td>
                <td className="mono">{b.command}</td>
                <td>{b.line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="muted">Keine bind-Befehle in autoexec.cfg.</div>
      )}
    </div>
  );
}

function TextView({ kind }: { kind: ConfigFileKind }) {
  const app = useApp();
  const text = app.draft[kind] ?? '';
  const ex = useMemo(() => explainConfig(kind, text), [kind, text]);
  const issues = kind === 'autoexec.cfg' ? [] : parseKv(text).issues;
  return (
    <div className="col">
      <div className="row small muted">
        <span className="mono">{REL[kind]}</span>
        <span className="spacer" />
        <span>Strg+F: Suchen · Strg+Z: Rückgängig</span>
      </div>
      <CodeEditor value={text} kind={kind === 'autoexec.cfg' ? 'cfg' : 'kv'} readOnly={Boolean(app.readOnlyReasons[kind])} onChange={(v) => app.setDraftText(kind, v)} />
      {issues.length > 0 && <Notice kind="warn">Syntax: {issues.slice(0, 5).map((i) => `Zeile ${i.line}: ${i.message}`).join(' · ')}</Notice>}
      <div className="grid g3">
        <div className="panel panel-pad small">
          <div className="panel-title">Bekannte Einträge ({ex.known.length})</div>
          {ex.known.slice(0, 60).map((k) => (
            <div key={k.key}>
              <span className="mono">{k.key}</span> – {k.label} <span className="muted">({k.status})</span>
            </div>
          ))}
        </div>
        <div className="panel panel-pad small">
          <div className="panel-title">Unbekannt – bleibt unverändert ({ex.unknown.length})</div>
          {ex.unknown.slice(0, 60).map((k) => (
            <div key={k.key} className="mono">
              {k.key} {k.value}
            </div>
          ))}
        </div>
        <div className="panel panel-pad small">
          <div className="panel-title">Gerätespezifisch &amp; Duplikate</div>
          {ex.device.map((d) => (
            <div key={d} className="mono">
              {d}
            </div>
          ))}
          {ex.duplicates.map((d) => (
            <div key={d.key}>
              Doppelt: <span className="mono">{d.key}</span> (Zeilen {d.lines.join(', ')}, wirksam: {d.values[d.values.length - 1]})
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImportView({ onPick }: { onPick: (f: { kind: ConfigFileKind; name: string; text: string }) => void }) {
  const app = useApp();
  const [arts, setArts] = useState<{ id: string; fileName: string; kind: string; attribution: string; license: string | null; relation: string; retrievedAt: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const base = app.prefs.apiUrl || (import.meta.env.VITE_CITADEL_API as string | undefined) || 'http://127.0.0.1:8787';
  return (
    <div className="grid g2">
      <div className="panel panel-pad">
        <h2 className="panel-title">Eigene Datei</h2>
        <FileDrop
          onFiles={async (fs) => {
            const list = await readDropped(fs);
            if (!list.length) return app.toast('error', 'Keine unterstützte Datei erkannt.');
            onPick(list[0]);
          }}
        >
          Datei hierher ziehen – CITADEL erklärt, was sie verändert
        </FileDrop>
      </div>
      <div className="panel panel-pad">
        <h2 className="panel-title">Veröffentlichte Configs aus der Datenbank</h2>
        {!arts && (
          <button
            className="btn"
            onClick={async () => {
              try {
                const r = await api.artifacts(base);
                setArts(r.data.artifacts);
                if (r.offline) setErr(`Offline – Stand vom ${fmtDate(r.fetchedAt, true)}`);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Liste laden
          </button>
        )}
        {err && <Notice kind="warn">{err}</Notice>}
        {arts && (
          <table className="table">
            <tbody>
              {arts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="mono">{a.fileName}</div>
                    <div className="small muted">
                      {a.attribution} · {a.license ?? 'Lizenz unbekannt'} · {a.relation === 'player-original' ? 'Original-Config des Spielers (belegt)' : 'Community-Preset'} · abgerufen {fmtDate(a.retrievedAt)}
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        try {
                          const text = await api.artifactRaw(base, a.id);
                          onPick({ kind: a.kind as ConfigFileKind, name: a.fileName, text });
                        } catch (e) {
                          app.toast('error', (e as Error).message);
                        }
                      }}
                    >
                      Erklären
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SidePreview() {
  const app = useApp();
  return (
    <div className="col">
      <div className="panel-title">Änderungsvorschau</div>
      {!app.changeSet.files.length && <div className="muted small">Noch keine Änderungen. Werte links anpassen – geschrieben wird erst nach „Änderungen prüfen“.</div>}
      {app.changeSet.files.map((f) => (
        <div key={f.kind} className="col" style={{ marginBottom: 12 }}>
          <div className="row">
            <b className="mono">{f.kind}</b>
            {!f.existed && <span className="badge">wird angelegt</span>}
          </div>
          {f.items.map((i, k) => (
            <div key={k} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <div>{i.def?.label || i.key}</div>
              <div className="mono">
                {i.before ?? '—'} → <span style={{ color: i.blocked ? 'var(--danger)' : 'var(--brass)' }}>{i.after ?? 'entfernt'}</span>
              </div>
              {i.blocked && <div style={{ color: 'var(--danger)' }}>Nicht anwendbar: {i.blocked.message}</div>}
              {i.reason && <div className="muted">Grund: {i.reason}</div>}
            </div>
          ))}
          {f.otherLineChanges > 0 && <div className="small muted">+ {f.otherLineChanges} weitere Textzeilen (Expertenmodus)</div>}
        </div>
      ))}
      {app.changeSet.warnings.map((w) => (
        <Notice key={w} kind="warn">
          {w}
        </Notice>
      ))}
    </div>
  );
}

function ReviewModal() {
  const app = useApp();
  const cs = app.changeSet;
  const importMode = app.workspaceMode === 'import';
  const anyApplicable = cs.files.some((f) => applicableText(f) !== null && applicableText(f) !== f.beforeText);
  return (
    <Modal
      title="Änderungen prüfen"
      wide
      onClose={() => app.setReviewOpen(false)}
      footer={
        <>
          {!importMode && (
            <button className="btn ghost" onClick={app.reloadAndMerge}>
              Neu einlesen und zusammenführen
            </button>
          )}
          <span className="spacer" />
          <button className="btn ghost" onClick={() => app.setReviewOpen(false)}>
            Weiter bearbeiten
          </button>
          {importMode ? (
            <button
              className="btn primary"
              disabled={!anyApplicable}
              onClick={() => {
                for (const f of cs.files) {
                  const t = applicableText(f);
                  if (t !== null && t !== f.beforeText) downloadText(f.path.split(/[\\/]/).pop() || f.kind, t);
                }
                app.toast('ok', 'Geänderte Dateien exportiert. Vor dem Ersetzen im Spielordner das Spiel schließen und eine Sicherung anlegen.');
              }}
            >
              Geänderte Dateien exportieren
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={!anyApplicable || Boolean(app.busy)}
              onClick={async () => {
                const r = await app.apply();
                if (r) app.setReviewOpen(false);
              }}
            >
              {app.gameRunning ? 'Deadlock läuft – als Entwurf behalten' : 'Änderungen anwenden'}
            </button>
          )}
        </>
      }
    >
      {app.gameRunning && <Notice kind="warn">Deadlock läuft. CITADEL beendet das Spiel nicht. Die Änderungen bleiben als Entwurf gespeichert, bis das Spiel geschlossen ist.</Notice>}
      {!importMode && <p className="small muted">Vor dem Schreiben prüft CITADEL, ob sich die Dateien seit dem Einlesen verändert haben, und legt ein Backup an. Danach wird zurückgelesen und kontrolliert.</p>}
      {cs.files.map((f) => {
        const t = applicableText(f);
        return (
          <div key={f.kind} className="col" style={{ marginBottom: 18 }}>
            <div className="row">
              <h3 style={{ margin: 0, fontSize: 15 }} className="mono">
                {f.kind}
              </h3>
              <span className="small muted mono">{f.path}</span>
              <span className="spacer" />
              {!f.applicable && t !== null && <span className="badge warn">teilweise anwendbar</span>}
              {t === null && <span className="badge danger">nicht anwendbar</span>}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Einstellung</th>
                  <th>Vorher</th>
                  <th>Nachher</th>
                  <th>Grund / Status</th>
                </tr>
              </thead>
              <tbody>
                {f.items.map((i, k) => (
                  <tr key={k}>
                    <td>
                      {i.def?.label || i.key}
                      <div className="small muted mono">{i.key}</div>
                    </td>
                    <td className="mono">{i.before ?? '—'}</td>
                    <td className="mono">{i.after ?? 'entfernt'}</td>
                    <td className="small">
                      {i.blocked ? <span style={{ color: 'var(--danger)' }}>Wird nicht geschrieben: {i.blocked.message}</span> : i.reason || 'Manuelle Änderung'}
                      {!i.blocked && i.restartRequired && <div className="muted">Neustart erforderlich</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {t !== null && <DiffView before={f.beforeText} after={t} />}
          </div>
        );
      })}
      {cs.warnings.map((w) => (
        <Notice key={w} kind="warn">
          {w}
        </Notice>
      ))}
    </Modal>
  );
}
