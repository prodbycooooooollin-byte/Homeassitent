/**
 * Öffentliche Seiten für die TikTok-App-Einreichung: Nutzungsbedingungen und Datenschutzerklärung.
 * Inhalte beschreiben das tatsächliche Verhalten von LIKED (siehe docs/ARCHITECTURE.md).
 * Betreiberangaben kommen aus OPERATOR_NAME / OPERATOR_CONTACT – ohne sie erscheint ein Hinweis.
 * Keine Rechtsberatung: der Betreiber ist für die Richtigkeit verantwortlich.
 */
export interface Operator {
  name: string | null;
  contact: string | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LIKED – ${esc(title)}</title>
<style>body{background:#0c0c10;color:#e8e8f0;font:16px/1.6 system-ui,Segoe UI,sans-serif;margin:0}
main{max-width:760px;margin:0 auto;padding:32px 20px 64px}h1{color:#a855f7;letter-spacing:.04em}h2{margin-top:2em;color:#22d3ee;font-size:1.1em}
a{color:#22d3ee}.muted{color:#9a9ab0}hr{border:0;border-top:1px solid #2a2a38;margin:40px 0}</style></head>
<body><main>${body}</main></body></html>`;
}

function operatorBlock(op: Operator, lang: 'de' | 'en'): string {
  if (!op.name || !op.contact) {
    return lang === 'de'
      ? '<p class="muted">Betreiberangaben werden vom Betreiber ergänzt (OPERATOR_NAME, OPERATOR_CONTACT).</p>'
      : '<p class="muted">Operator details to be added by the operator (OPERATOR_NAME, OPERATOR_CONTACT).</p>';
  }
  return `<p>${esc(op.name)}<br>${lang === 'de' ? 'Kontakt' : 'Contact'}: ${esc(op.contact)}</p>`;
}

export function privacyPage(op: Operator, updated: string): string {
  return layout(
    'Datenschutzerklärung / Privacy Policy',
    `<h1>LIKED – Datenschutzerklärung</h1><p class="muted">Stand: ${esc(updated)}</p>
<h2>Verantwortlicher</h2>${operatorBlock(op, 'de')}
<h2>Worum es geht</h2><p>LIKED ist ein privates Multiplayer-Partyspiel für Freundesgruppen. Spieler raten, aus wessen TikTok-Likes ein Clip stammt.</p>
<h2>Welche Daten verarbeitet werden</h2><ul>
<li><b>Spielprofil:</b> selbst gewählter Anzeigename, Avatar und eine zufällige Geräte-Kennung. Es gibt keine Konten und keine Passwörter.</li>
<li><b>TikTok-Verbindung (nur mit deiner Zustimmung):</b> über das offizielle TikTok Login Kit erhält der Server Zugriffstoken, deine TikTok-Kennung (open_id) und deinen Anzeigenamen. Über die TikTok Data Portability API fordert er die Kategorie „Aktivität“ an. Aus diesem Archiv wird <b>ausschließlich die Like-Liste</b> (Video-ID und Datum) ausgelesen; alle anderen Inhalte (z. B. Nachrichten, Suchverlauf) werden nicht gespeichert, und das Archiv wird unmittelbar nach dem Auslesen gelöscht.</li>
<li><b>Spielablauf:</b> Raumcode, Tipps, Punkte und die für eine Partie ausgewählten Video-IDs deiner Likes.</li></ul>
<h2>Zweck</h2><p>Die Daten werden ausschließlich verwendet, um das Spiel bereitzustellen: Clips deiner Likes werden während einer Partie den Mitspielern deines Raums gezeigt, zusammen mit der Auflösung, dass der Clip aus deinen Likes stammt. Einzelne Clips kannst du in der App ausschließen.</p>
<h2>Speicherdauer</h2><ul>
<li>Räume und Spielstände liegen nur im Arbeitsspeicher und werden spätestens 30 Minuten nach Spielende gelöscht.</li>
<li>Importierte Like-IDs werden einmalig an deine App übertragen und danach auf dem Server gelöscht (spätestens nach 24 Stunden). Deine App speichert höchstens 5.000 Einträge lokal auf deinem PC.</li>
<li>TikTok-Zugriffstoken werden verschlüsselt gespeichert, bis du die Verbindung trennst, spätestens nach 90 Tagen ohne Nutzung.</li>
<li>Server-Protokolle enthalten keine Namen, Likes, Tokens oder Clip-Zuordnungen.</li></ul>
<h2>Weitergabe</h2><p>Keine Weitergabe an Dritte, keine Werbung, kein Tracking. Videos werden direkt vom offiziellen TikTok-Player geladen; dabei gelten die Datenschutzbestimmungen von TikTok. Der Server wird bei Render (render.com) betrieben.</p>
<h2>Deine Rechte</h2><p>In der App unter „Einstellungen → TikTok → Verbindung trennen“ widerrufst du den TikTok-Zugriff; Token und gespeicherte Daten werden gelöscht. „Lokale Spieldaten löschen“ entfernt alle Daten auf deinem PC. Du kannst die App-Berechtigung außerdem jederzeit in deinen TikTok-Einstellungen entziehen. Für Auskunft, Berichtigung oder Löschung wende dich an den oben genannten Kontakt. Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.</p>
<hr>
<h1>LIKED – Privacy Policy</h1><p class="muted">Last updated: ${esc(updated)}</p>
<h2>Controller</h2>${operatorBlock(op, 'en')}
<h2>Data we process</h2><ul>
<li><b>Game profile:</b> display name, avatar and a random device ID. No accounts or passwords.</li>
<li><b>TikTok connection (only with your consent):</b> via the official TikTok Login Kit the server receives access tokens, your open_id and display name. Via the TikTok Data Portability API it requests the "activity" category and extracts <b>only your Like List</b> (video ID and date). Everything else is discarded and the archive is deleted right after extraction.</li>
<li><b>Gameplay:</b> room code, guesses, scores and the video IDs selected for a match.</li></ul>
<h2>Purpose</h2><p>Solely to run the game: clips from your likes are shown to the players in your room during a match, including the reveal that the clip came from your likes. You can exclude individual clips in the app.</p>
<h2>Retention</h2><p>Rooms live in memory only and are deleted at the latest 30 minutes after a match. Imported like IDs are delivered once to your app and then deleted from the server (at the latest after 24 hours). TikTok tokens are stored encrypted until you disconnect, at most 90 days without use. Logs contain no names, likes, tokens or clip assignments.</p>
<h2>Sharing</h2><p>No sale or sharing with third parties, no ads, no tracking. Videos are played by TikTok's official embed player. The server is hosted on Render (render.com).</p>
<h2>Your rights</h2><p>Use "Settings → TikTok → Disconnect" in the app to revoke access and delete tokens and data; you can also revoke access in your TikTok settings. Contact the controller above for access, correction or deletion requests.</p>`
  );
}

export function termsPage(op: Operator, updated: string): string {
  return layout(
    'Nutzungsbedingungen / Terms of Service',
    `<h1>LIKED – Nutzungsbedingungen</h1><p class="muted">Stand: ${esc(updated)}</p>
<h2>Anbieter</h2>${operatorBlock(op, 'de')}
<ol>
<li><b>Leistung:</b> LIKED ist ein kostenloses, privates Partyspiel für Freundesgruppen. Es besteht kein Anspruch auf dauerhafte Verfügbarkeit; der Dienst kann jederzeit geändert oder eingestellt werden.</li>
<li><b>TikTok:</b> Die Verbindung mit TikTok ist freiwillig und erfolgt über die offiziellen Schnittstellen von TikTok. Es gelten zusätzlich die Bedingungen von TikTok. LIKED ist nicht mit TikTok verbunden und wird nicht von TikTok unterstützt.</li>
<li><b>Einverständnis:</b> Wer mit TikTok-Likes spielt, ist damit einverstanden, dass ausgewählte gelikte Clips und die Zuordnung zu ihm während der Partie den Mitspielern seines Raums gezeigt werden.</li>
<li><b>Verhalten:</b> Keine beleidigenden Anzeigenamen, kein Missbrauch, kein Umgehen technischer Schutzmaßnahmen, keine automatisierten Zugriffe auf den Server.</li>
<li><b>Inhalte:</b> Clips bleiben Inhalte ihrer jeweiligen Urheber und werden ausschließlich über den offiziellen TikTok-Player angezeigt.</li>
<li><b>Haftung:</b> Die Nutzung erfolgt auf eigenes Risiko. Die Haftung ist, soweit gesetzlich zulässig, auf Vorsatz und grobe Fahrlässigkeit beschränkt.</li>
<li><b>Datenschutz:</b> siehe <a href="/privacy">Datenschutzerklärung</a>.</li></ol>
<hr>
<h1>LIKED – Terms of Service</h1><p class="muted">Last updated: ${esc(updated)}</p>
<h2>Provider</h2>${operatorBlock(op, 'en')}
<ol>
<li>LIKED is a free, private party game for groups of friends, provided as is without guaranteed availability.</li>
<li>Connecting TikTok is optional and uses TikTok's official APIs; TikTok's terms also apply. LIKED is not affiliated with or endorsed by TikTok.</li>
<li>By playing with your TikTok likes you agree that selected liked clips and their attribution to you are shown to the players in your room during a match.</li>
<li>No abusive names, misuse, circumvention of protections or automated access.</li>
<li>Clips remain the content of their creators and are shown only through TikTok's official player.</li>
<li>Use at your own risk; liability is limited to the extent permitted by law.</li>
<li>Privacy: see the <a href="/privacy">Privacy Policy</a>.</li></ol>`
  );
}
