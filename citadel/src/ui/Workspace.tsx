// Auswahl des Arbeitsbereichs: erkannte Installation, manuelle Ordnerwahl oder Datei-Import.

import { useState } from 'react';
import { useApp } from './state.tsx';
import { FileDrop, Icons, Notice, fmtDate } from './components.tsx';
import { isDesktop } from '../platform/index.ts';
import { detectKind, explainConfig, importInto, type ConfigExplanation, type ImportReport } from '../core/config.ts';
import type { ConfigFileKind, SettingGroup } from '../core/catalog.ts';
import { Modal } from './components.tsx';

export async function readDropped(files: File[]): Promise<{ kind: ConfigFileKind; name: string; text: string }[]> {
  const out: { kind: ConfigFileKind; name: string; text: string }[] = [];
  for (const f of files) {
    if (f.size > 4 * 1024 * 1024) continue;
    const text = await f.text();
    const kind = detectKind(f.name, text);
    if (kind) out.push({ kind, name: f.name, text: text.replace(/^﻿/, '') });
  }
  return out;
}

export function InstallationChooser() {
  const app = useApp();
  if (!isDesktop) return null;
  return (
    <div className="panel panel-pad">
      <h3 className="panel-title">Deadlock-Installation</h3>
      {app.installations.length === 0 && (
        <Notice kind="warn">Keine Installation über die Steam-Bibliotheken gefunden. Wähle den Ordner manuell (…/steamapps/common/Deadlock) oder importiere einzelne Dateien.</Notice>
      )}
      {app.installations.length > 1 && !app.installation && <Notice kind="info">Mehrere Installationen gefunden – bitte auswählen. CITADEL wählt nicht stillschweigend.</Notice>}
      <div className="col" style={{ marginTop: 10 }}>
        {app.installations.map((i) => (
          <button key={i.id} className={`nav-item ${app.installation?.id === i.id ? 'active' : ''}`} onClick={() => app.chooseInstallation(i)}>
            {Icons.folder}
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="mono">{i.root}</span>
              <span className="small muted">
                Build {i.buildId ?? 'unbekannt'} · aktualisiert {fmtDate(i.lastUpdated)} · {i.detectedVia === 'manual' ? 'manuell gewählt' : 'Steam-Bibliothek'}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={app.pickInstallationFolder}>
          {Icons.folder} Ordner wählen …
        </button>
        <button className="btn ghost" onClick={app.detect}>
          {Icons.refresh} Erneut suchen
        </button>
      </div>
    </div>
  );
}

const GROUPS: { id: SettingGroup; label: string }[] = [
  { id: 'grafik', label: 'Grafik' },
  { id: 'anzeige', label: 'Anzeige' },
  { id: 'crosshair', label: 'Crosshair' },
  { id: 'eingabe', label: 'Maus & Eingabe' },
];

/** Import einer fremden Config in den eigenen Entwurf – mit regelbasierter Erklärung. */
export function ImportDialog({ file, onClose, defaultGroups }: { file: { kind: ConfigFileKind; name: string; text: string }; onClose: () => void; defaultGroups?: SettingGroup[] }) {
  const app = useApp();
  const local = app.draft[file.kind] ?? '';
  const ex: ConfigExplanation = explainConfig(file.kind, file.text, local);
  const [groups, setGroups] = useState<SettingGroup[]>(defaultGroups ?? (file.kind === 'autoexec.cfg' ? ['crosshair'] : ['grafik']));
  const report: ImportReport = importInto(file.kind, local, file.text, { groups });
  return (
    <Modal
      title={`Config erklären: ${file.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={!report.adopted.length}
            onClick={() => {
              app.setDraftText(file.kind, report.draftText);
              app.toast('ok', `${report.adopted.length} Werte in den Entwurf übernommen – noch nichts geschrieben.`);
              onClose();
            }}
          >
            {report.adopted.length} Werte in Entwurf übernehmen
          </button>
        </>
      }
    >
      <div className="grid g2">
        <div className="col">
          <div className="small muted">Erkannter Typ: <b>{file.kind}</b>. Übernommen wird nie die ganze Datei – nur geprüfte Einzelwerte der gewählten Bereiche.</div>
          <div className="row wrap">
            {GROUPS.map((g) => (
              <label key={g.id} className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={groups.includes(g.id)} onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))} /> {g.label}
              </label>
            ))}
          </div>
          <h4 className="panel-title" style={{ marginTop: 10 }}>Wird übernommen ({report.adopted.length})</h4>
          {report.adopted.length ? (
            <table className="table">
              <tbody>
                {report.adopted.map((a) => (
                  <tr key={a.key}>
                    <td>{a.label}</td>
                    <td className="mono">{a.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted small">Keine abweichenden, zulässigen Werte in den gewählten Bereichen.</div>
          )}
          {ex.modHints.length > 0 && (
            <Notice kind="warn">
              Mögliche Mod-Abhängigkeit: {ex.modHints.join(' ')} CITADEL installiert keine Mods.
            </Notice>
          )}
          {ex.parseIssues.length > 0 && <Notice kind="warn">Syntaxhinweise: {ex.parseIssues.slice(0, 4).join('; ')}</Notice>}
        </div>
        <div className="col small">
          <h4 className="panel-title">Nicht übernommen</h4>
          {report.skippedDevice.length > 0 && <div><b>Gerätespezifisch (nie übernommen):</b> {report.skippedDevice.join(', ')}</div>}
          {report.skippedNotInLocal.length > 0 && <div><b>Im lokalen Build nicht vorhanden:</b> {report.skippedNotInLocal.join(', ')}</div>}
          {report.skippedDraftOnly.length > 0 && <div><b>Nur als Entwurf analysierbar:</b> {report.skippedDraftOnly.join(', ')}</div>}
          {report.skippedGroup.length > 0 && <div><b>Andere Bereiche (abgewählt):</b> {report.skippedGroup.length} Werte</div>}
          {report.notAdopted.length > 0 && (
            <details open={report.notAdopted.length < 12}>
              <summary>
                <b>Unbekannt / abgelehnt ({report.notAdopted.length})</b>
              </summary>
              <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                {report.notAdopted.slice(0, 200).map((n, i) => (
                  <li key={i}>
                    <span className="mono">{n.key} {n.value}</span> – {n.why}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {ex.duplicates.length > 0 && (
            <div>
              <b>Doppelte Einträge:</b> {ex.duplicates.map((d) => `${d.key} (Zeilen ${d.lines.join(', ')}; wirksam: ${d.values[d.values.length - 1]})`).join('; ')}
            </div>
          )}
          <div className="muted">
            Erhalten bleiben: alle übrigen Einträge, Kommentare, Reihenfolge und Formatierung deiner eigenen Datei.
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function WorkspaceGate() {
  const app = useApp();
  const [pending, setPending] = useState<{ kind: ConfigFileKind; name: string; text: string } | null>(null);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Config Studio</h1>
          <p className="page-sub">Wähle deine Installation oder importiere Config-Dateien.</p>
        </div>
      </div>
      <div className="grid g2">
        <InstallationChooser />
        <div className="panel panel-pad">
          <h3 className="panel-title">Dateien importieren</h3>
          <FileDrop
            onFiles={async (fs) => {
              const list = await readDropped(fs);
              if (!list.length) return app.toast('error', 'Keine unterstützte Datei erkannt (video.txt, gameinfo.gi, *.cfg).');
              await app.importFiles(list);
              if (list.length === 1) setPending(null);
            }}
          >
            <div>video.txt, gameinfo.gi oder .cfg hierher ziehen</div>
            <div className="small">
              {isDesktop ? 'Ohne Installation werden geänderte Dateien exportiert statt direkt geschrieben.' : 'In der Browser-Version werden geänderte Dateien bewusst exportiert – kein direkter Zugriff auf den Spielordner.'}
            </div>
          </FileDrop>
        </div>
      </div>
      {pending && <ImportDialog file={pending} onClose={() => setPending(null)} />}
    </div>
  );
}
