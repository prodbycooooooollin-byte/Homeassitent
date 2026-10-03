import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state.tsx';
import { DiffView, Empty, Modal, Notice, fmtDate } from '../components.tsx';
import { platform, isDesktop, errorMessage, downloadText, type BackupManifest } from '../../platform/index.ts';
import { compareProfiles, createProfile, duplicateProfile, importPortable, mixProfiles, portableExport, valuesInGroups, type ConfigProfile, type MixSource } from '../../core/profiles.ts';
import { profileValues } from '../../core/config.ts';
import { SETTINGS_BY_ID, type SettingGroup } from '../../core/catalog.ts';
import { canRestoreWholeFile } from '../../core/patch.ts';

const GROUP_LABEL: Record<SettingGroup, string> = { grafik: 'Grafik', anzeige: 'Anzeige', crosshair: 'Crosshair', eingabe: 'Eingabe', geraet: 'Gerät' };
const GOALS = { competitive: 'Competitive', ausgewogen: 'Ausgewogen', bildqualitaet: 'Bildqualität', eigene: 'Eigene Config' } as const;

export function Backups() {
  const app = useApp();
  const [backups, setBackups] = useState<BackupManifest[]>([]);
  const [restoreOf, setRestoreOf] = useState<BackupManifest | null>(null);
  const [tab, setTab] = useState<'profiles' | 'compare' | 'mixer' | 'backups'>('profiles');
  const load = () => void platform.listBackups().then(setBackups).catch(() => setBackups([]));
  useEffect(load, []);
  const mine = backups.filter((b) => !app.installation || b.installationId === app.installation.id);
  const lastWorking = mine.find((b) => b.working);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Profile &amp; Backups</h1>
          <p className="page-sub">Profile speichern, vergleichen, mischen – und jederzeit zu einem gesicherten Stand zurück.</p>
        </div>
        {isDesktop && (
          <button className="btn primary lg" disabled={!lastWorking} onClick={() => lastWorking && setRestoreOf(lastWorking)} title={lastWorking ? '' : 'Noch kein bestätigt funktionierender Stand'}>
            Letzten funktionierenden Stand wiederherstellen
          </button>
        )}
      </div>
      {isDesktop && !lastWorking && (
        <div style={{ marginBottom: 12 }}>
          <Notice kind="info">„Funktionierend“ heißt: von dir bestätigt oder durch die Spielstart-Prüfung belegt (das Spiel hat die Datei neu geschrieben und die angewendeten Werte behalten). Nach dem Testen im Config Studio „Spiel getestet – funktioniert“ wählen.</Notice>
        </div>
      )}
      <div className="tabs" role="tablist">
        {(
          [
            ['profiles', 'Profile'],
            ['compare', 'Vergleich'],
            ['mixer', 'Profil-Mixer'],
            ['backups', `Backups (${mine.length})`],
          ] as const
        ).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'compare' && <CompareTab />}
      {tab === 'mixer' && <MixerTab />}
      {tab === 'backups' && (
        <div className="panel panel-pad">
          {!isDesktop && <Notice kind="info">Backups gibt es in der Desktop-App (vor jedem Schreiben automatisch).</Notice>}
          {isDesktop && !mine.length && <Empty title="Noch keine Backups">Vor jedem Schreibvorgang legt CITADEL automatisch ein Backup an.</Empty>}
          {mine.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Build</th>
                  <th>Anlass &amp; Änderungen</th>
                  <th>Dateien</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mine.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {fmtDate(b.createdAt, true)}
                      {b.working && (
                        <div>
                          <span className="badge jade">funktionierend ({b.working.how === 'user' ? 'bestätigt' : 'Spielstart-Prüfung'})</span>
                        </div>
                      )}
                    </td>
                    <td className="mono">{b.buildId ?? '?'}</td>
                    <td className="small">
                      <div>{b.reason}</div>
                      {b.changeSummary.slice(0, 4).map((c) => (
                        <div key={c} className="muted mono">
                          {c}
                        </div>
                      ))}
                      {b.changeSummary.length > 4 && <div className="muted">+ {b.changeSummary.length - 4} weitere</div>}
                    </td>
                    <td className="small mono">
                      {b.files.map((f) => (
                        <div key={f.kind}>
                          {f.kind} {f.existed ? `(${f.sha256?.slice(0, 8)})` : '(nicht vorhanden)'}
                        </div>
                      ))}
                    </td>
                    <td>
                      <div className="col">
                        <button className="btn sm" onClick={() => setRestoreOf(b)}>
                          Unterschiede &amp; wiederherstellen
                        </button>
                        {!b.working && (
                          <button
                            className="btn ghost sm"
                            onClick={async () => {
                              await platform.markBackupWorking(b.id, 'user');
                              load();
                            }}
                          >
                            Als funktionierend markieren
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {restoreOf && (
        <RestoreModal
          b={restoreOf}
          onClose={() => setRestoreOf(null)}
          onDone={() => {
            setRestoreOf(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RestoreModal({ b, onClose, onDone }: { b: BackupManifest; onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const [texts, setTexts] = useState<Record<string, string | null>>({});
  useEffect(() => {
    void Promise.all(b.files.map(async (f) => [f.kind, await platform.backupText(b.id, f.kind)] as const)).then((l) => setTexts(Object.fromEntries(l)));
  }, [b]);
  const current = (kind: string) => app.files.find((f) => f.kind === kind)?.text ?? '';
  return (
    <Modal
      title={`Backup vom ${fmtDate(b.createdAt, true)}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={app.gameRunning === true}
            onClick={async () => {
              try {
                const r = await platform.restoreBackup(b.id, app.installation?.buildId ?? null);
                await app.reload();
                app.toast('ok', `Wiederhergestellt: ${r.restored.join(', ')}. Vorheriger Stand gesichert als ${r.preRestoreBackupId}.${r.skipped.length ? ` Übersprungen: ${r.skipped.map((s) => s[1]).join('; ')}` : ''}`);
                onDone();
              } catch (e) {
                app.toast('error', errorMessage(e));
              }
            }}
          >
            {app.gameRunning ? 'Deadlock läuft – bitte erst beenden' : 'Wiederherstellen (aktuellen Stand vorher sichern)'}
          </button>
        </>
      }
    >
      {b.files.map((f) => {
        const ok = canRestoreWholeFile(f.kind, b.buildId, app.installation?.buildId ?? null);
        return (
          <div key={f.kind} className="col" style={{ marginBottom: 14 }}>
            <b className="mono">{f.kind}</b>
            {!ok.ok && <Notice kind="warn">{ok.reason} Tipp: gewünschte Einzelwerte im Config Studio setzen.</Notice>}
            {texts[f.kind] === undefined ? <div className="muted small">Lade …</div> : texts[f.kind] === null ? <div className="small">War nicht vorhanden – wird beim Wiederherstellen entfernt.</div> : <DiffView before={current(f.kind)} after={texts[f.kind]!} />}
          </div>
        );
      })}
    </Modal>
  );
}

function ProfilesTab() {
  const app = useApp();
  const [name, setName] = useState('Mein Profil');
  const [goal, setGoal] = useState<keyof typeof GOALS>('eigene');
  const [rename, setRename] = useState<string | null>(null);
  const [applyGroups, setApplyGroups] = useState<SettingGroup[]>(['grafik', 'anzeige', 'crosshair', 'eingabe']);
  const sorted = [...app.profiles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const applyProfile = (p: ConfigProfile) => {
    const vals = valuesInGroups(p.values, applyGroups);
    const reqs = Object.entries(vals)
      .filter(([id]) => SETTINGS_BY_ID.get(id)?.applyPolicy !== 'draft-only')
      .map(([settingId, value]) => ({ settingId, value }));
    const r = app.setValuesMulti(reqs, `Profil „${p.name}“`);
    app.toast(r.skipped.length ? 'error' : 'ok', `${r.applied} Werte in den Entwurf übernommen${r.skipped.length ? `, ${r.skipped.length} übersprungen` : ''}. Prüfen & anwenden im Config Studio.`);
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel panel-pad row wrap">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Profilname" />
        <select className="select" value={goal} onChange={(e) => setGoal(e.target.value as keyof typeof GOALS)} aria-label="Ziel">
          {Object.entries(GOALS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button
          className="btn primary"
          disabled={app.workspaceMode === 'none'}
          onClick={async () => {
            const vals = Object.fromEntries([...profileValues(app.draft)].filter(([id]) => SETTINGS_BY_ID.get(id)?.portable));
            await app.saveProfile(createProfile(name, vals, { type: 'local', label: 'Aus eigenen Dateien' }, goal));
            app.toast('ok', 'Profil gespeichert.');
          }}
        >
          Aktuellen Entwurf als Profil speichern
        </button>
        <span className="spacer" />
        <label className="btn">
          Profil importieren (.json)
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await app.saveProfile(importPortable(JSON.parse(await f.text())));
                app.toast('ok', 'Profil importiert – ungültige oder gerätespezifische Werte wurden verworfen.');
              } catch (err) {
                app.toast('error', errorMessage(err));
              }
            }}
          />
        </label>
      </div>
      <div className="small muted row wrap">
        Beim Anwenden übernehmen:
        {(['grafik', 'anzeige', 'crosshair', 'eingabe'] as SettingGroup[]).map((g) => (
          <label key={g} className="row">
            <input type="checkbox" checked={applyGroups.includes(g)} onChange={(e) => setApplyGroups(e.target.checked ? [...applyGroups, g] : applyGroups.filter((x) => x !== g))} /> {GROUP_LABEL[g]}
          </label>
        ))}
      </div>
      {!sorted.length && <Empty title="Noch keine Profile">Profilideen: Competitive, Ausgewogen, Bildqualität, Eigene Config – Ziele, keine universell besten Werte.</Empty>}
      <div className="grid g2">
        {sorted.map((p) => (
          <div key={p.id} className="panel panel-pad col">
            <div className="row">
              {rename === p.id ? (
                <input
                  className="input"
                  autoFocus
                  defaultValue={p.name}
                  onBlur={async (e) => {
                    await app.saveProfile({ ...p, name: e.target.value || p.name, updatedAt: new Date().toISOString() });
                    setRename(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <b>{p.name}</b>
              )}
              <span className="spacer" />
              {p.goal && <span className="badge">{GOALS[p.goal]}</span>}
            </div>
            <div className="small muted">
              {p.origin.type === 'player-compiled' ? 'Aus veröffentlichten Einstellungen zusammengestellt' : p.origin.type === 'player-original' ? 'Original-Config (belegt)' : p.origin.label} · {Object.keys(p.values).length} Werte ·
              aktualisiert {fmtDate(p.updatedAt)}
            </div>
            <div className="row wrap">
              <button className="btn sm primary" disabled={app.workspaceMode === 'none'} onClick={() => applyProfile(p)}>
                In Entwurf übernehmen
              </button>
              <button className="btn sm" onClick={() => setRename(p.id)}>
                Umbenennen
              </button>
              <button className="btn sm" onClick={() => app.saveProfile(duplicateProfile(p))}>
                Duplizieren
              </button>
              <button className="btn sm" onClick={() => downloadText(`${p.name.replace(/[^\w-]+/g, '_')}.citadel.json`, JSON.stringify(portableExport(p), null, 2), 'application/json')}>
                Exportieren
              </button>
              <button className="btn sm danger" onClick={() => app.deleteProfile(p.id)}>
                Löschen
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="small muted">Exporte enthalten nur portable Werte – keine Pfade, Steam-Kennungen, Geräte-IDs oder Diagnosedaten. Teilen erfolgt bewusst durch dich.</div>
    </div>
  );
}

function CompareTab() {
  const app = useApp();
  const current = useMemo(() => Object.fromEntries(profileValues(app.draft)), [app.draft]);
  const options = [{ id: '__current', name: 'Aktueller Entwurf', values: current }, ...app.profiles.map((p) => ({ id: p.id, name: p.name, values: p.values }))];
  const [a, setA] = useState('__current');
  const [b, setB] = useState(options[1]?.id ?? '__current');
  const [onlyDiff, setOnlyDiff] = useState(true);
  const A = options.find((o) => o.id === a) ?? options[0];
  const B = options.find((o) => o.id === b) ?? options[0];
  const rows = compareProfiles(A.values, B.values).filter((r) => !onlyDiff || !r.same);
  const groups: SettingGroup[] = ['grafik', 'anzeige', 'eingabe', 'crosshair', 'geraet'];
  return (
    <div className="panel panel-pad col">
      <div className="row wrap">
        <select className="select" value={a} onChange={(e) => setA(e.target.value)} aria-label="Profil A">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <span>vs.</span>
        <select className="select" value={b} onChange={(e) => setB(e.target.value)} aria-label="Profil B">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <label className="row small">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Nur Unterschiede
        </label>
      </div>
      {groups.map((g) => {
        const rs = rows.filter((r) => r.group === g);
        if (!rs.length) return null;
        return (
          <div key={g}>
            <h3 className="panel-title" style={{ marginTop: 12 }}>
              {GROUP_LABEL[g]}
            </h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Einstellung</th>
                  <th>{A.name}</th>
                  <th>{B.name}</th>
                </tr>
              </thead>
              <tbody>
                {rs.map((r) => (
                  <tr key={r.settingId} className={r.same ? '' : 'row-diff'}>
                    <td>{r.label}</td>
                    <td className="mono">{r.a ?? '—'}</td>
                    <td className="mono">{r.b ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {!rows.length && <div className="muted">Keine Unterschiede.</div>}
    </div>
  );
}

function MixerTab() {
  const app = useApp();
  const current = useMemo(() => createProfile('Aktueller Entwurf', Object.fromEntries(profileValues(app.draft)), { type: 'local', label: 'Entwurf' }), [app.draft]);
  const pool = [current, ...app.profiles];
  const [slots, setSlots] = useState<{ profileId: string; groups: SettingGroup[] }[]>([
    { profileId: current.id, groups: ['eingabe'] },
    { profileId: app.profiles[0]?.id ?? current.id, groups: ['grafik'] },
  ]);
  const [res, setRes] = useState<Record<string, string>>({});
  const sources: MixSource[] = slots.map((s) => ({ profile: pool.find((p) => p.id === s.profileId) ?? current, groups: s.groups }));
  const mix = mixProfiles(sources, res);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel panel-pad col">
        <div className="small muted">Kombiniere Bereiche aus mehreren Profilen – z. B. Crosshair aus A, Grafik aus B, eigene Sensitivität. Eine reine Grafikoptimierung ändert standardmäßig keine Sensitivität, Crosshairs oder Tasten.</div>
        {slots.map((s, i) => (
          <div key={i} className="row wrap">
            <select className="select" value={s.profileId} onChange={(e) => setSlots(slots.map((x, k) => (k === i ? { ...x, profileId: e.target.value } : x)))}>
              {pool.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {(['grafik', 'anzeige', 'crosshair', 'eingabe'] as SettingGroup[]).map((g) => (
              <label key={g} className="row small">
                <input type="checkbox" checked={s.groups.includes(g)} onChange={(e) => setSlots(slots.map((x, k) => (k === i ? { ...x, groups: e.target.checked ? [...x.groups, g] : x.groups.filter((y) => y !== g) } : x)))} /> {GROUP_LABEL[g]}
              </label>
            ))}
            <button className="btn ghost sm" onClick={() => setSlots(slots.filter((_, k) => k !== i))}>
              Entfernen
            </button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSlots([...slots, { profileId: current.id, groups: ['crosshair'] }])}>
          Quelle hinzufügen
        </button>
      </div>
      {mix.conflicts.length > 0 && (
        <div className="panel panel-pad col">
          <h3 className="panel-title">Konflikte – bitte entscheiden ({mix.conflicts.length})</h3>
          {mix.conflicts.map((c) => (
            <div key={c.settingId} className="row wrap small">
              <b style={{ width: 220 }}>{c.label}</b>
              {c.candidates.map((cand) => (
                <label key={cand.profileId} className="row">
                  <input type="radio" name={c.settingId} onChange={() => setRes({ ...res, [c.settingId]: cand.profileId })} /> {cand.profileName}: <span className="mono">{cand.value}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="panel panel-pad row">
        <span>{Object.keys(mix.values).length} Werte im Ergebnis</span>
        <span className="spacer" />
        <button
          className="btn"
          disabled={mix.conflicts.length > 0}
          onClick={async () => {
            await app.saveProfile(createProfile('Gemischtes Profil', mix.values, { type: 'custom', label: 'Profil-Mixer' }));
            app.toast('ok', 'Als Profil gespeichert.');
          }}
        >
          Als Profil speichern
        </button>
        <button
          className="btn primary"
          disabled={mix.conflicts.length > 0 || app.workspaceMode === 'none'}
          onClick={() => {
            const r = app.setValuesMulti(Object.entries(mix.values).filter(([id]) => SETTINGS_BY_ID.get(id)?.applyPolicy !== 'draft-only').map(([settingId, value]) => ({ settingId, value })), 'Profil-Mixer');
            app.toast('ok', `${r.applied} Werte in den Entwurf übernommen.`);
          }}
        >
          In Entwurf übernehmen
        </button>
      </div>
      <div className="small muted">Hinweis: Ein Mix-Ergebnis ist ein eigenes Profil – nie eine „Original-Config“ eines Spielers.</div>
    </div>
  );
}
