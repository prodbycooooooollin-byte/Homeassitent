// Erzeugt docs/SETTINGS.md aus dem versionierten Einstellungskatalog.
import { writeFileSync } from 'node:fs';
import { CATALOG_VERSION, EVIDENCE, SETTINGS, STATUS_LABELS, CATEGORY_LABELS } from '../src/core/catalog.ts';

const policy = { 'if-present': 'nur wenn der lokale Build den Schlüssel angelegt hat', direct: 'direkt (CITADEL-Abschnitt in autoexec.cfg)', 'draft-only': 'nur Entwurf – wird nicht angewendet' };
let md = `# Einstellungskatalog (Version ${CATALOG_VERSION})\n\nAutomatisch erzeugt aus \`src/core/catalog.ts\` (\`npx tsx scripts/gen-settings-doc.ts\`).\n\n`;
md += `Status: **bestätigt** = Schlüssel, Wirkung und Schreibweg in einem genannten Build geprüft · **noch ungeprüft** = Schlüssel belegt, Wirkung nicht im Spiel geprüft · **veraltet** · **nicht unterstützt**.\n\n`;
md += `Derzeit ist **keine** Einstellung „bestätigt“: In der Entwicklungsumgebung war kein Deadlock-Build verfügbar. Siehe docs/VERIFY.md für das Prüfverfahren.\n\n`;
md += `| Kategorie | Einstellung | Datei | Schlüssel | Typ / Bereich | portabel | Status | Anwendung | Belege |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const s of SETTINGS) {
  const range = s.options ? s.options.map((o) => o.value).join('/') : s.min !== undefined ? `${s.min}–${s.max}` : '';
  md += `| ${CATEGORY_LABELS[s.category]} | ${s.label} | ${s.file} | \`${s.block ? s.block.join('/') + '/' : ''}${s.key}\` | ${s.type} ${range} | ${s.portable ? 'ja' : 'nein'} | ${STATUS_LABELS[s.status]} | ${policy[s.applyPolicy]} | ${s.evidence.join(', ')} |\n`;
}
md += `\nGerätespezifische Kopfeinträge der video.txt (nie übernommen, nie verändert): \`Version\`, \`VendorID\`, \`DeviceID\`.\n\n## Belege\n\n`;
for (const e of Object.values(EVIDENCE)) md += `- **${e.id}** – [${e.title}](${e.url}) (Quelle vom ${e.date}, geprüft ${e.retrieved}): ${e.note}\n`;
writeFileSync('docs/SETTINGS.md', md);
console.log('docs/SETTINGS.md geschrieben');
