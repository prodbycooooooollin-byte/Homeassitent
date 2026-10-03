import { LIMITS, TIMINGS } from '../../../shared/protocol.ts';
import { Dialog } from '../ui/common.tsx';
import { IconArrowRight, IconChat, IconEye, IconVote } from '../ui/Icons.tsx';

/**
 * Spielregeln. Inhalte entsprechen der serverseitigen Logik (server/modes/classic.ts).
 * Grundregeln oben, Sonderfälle in aufklappbaren Abschnitten.
 */
export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Spielregeln" wide>
      <div className="rules">
        <ol className="rules-flow" aria-label="Ablauf einer Partie">
          <li>
            <IconEye size={20} />
            <span>Rolle ansehen</span>
          </li>
          <li aria-hidden="true" className="flow-arrow">
            <IconArrowRight size={16} />
          </li>
          <li>
            <IconChat size={20} />
            <span>Hinweise geben</span>
          </li>
          <li aria-hidden="true" className="flow-arrow">
            <IconArrowRight size={16} />
          </li>
          <li>
            <IconChat size={20} />
            <span>Diskutieren</span>
          </li>
          <li aria-hidden="true" className="flow-arrow">
            <IconArrowRight size={16} />
          </li>
          <li>
            <IconVote size={20} />
            <span>Abstimmen</span>
          </li>
        </ol>

        <section>
          <h3>Ziel</h3>
          <p>
            Alle außer einer Person kennen dasselbe geheime Wort. Die <strong>Eingeweihten</strong> wollen den <strong>Impostor</strong>{' '}
            entlarven. Der Impostor will unerkannt bleiben oder das Wort erraten.
          </p>
        </section>

        <section>
          <h3>Begriffe</h3>
          <dl className="terms">
            <dt>Zug</dt>
            <dd>Eine Person gibt einen Hinweis ab.</dd>
            <dt>Durchgang</dt>
            <dd>Alle waren einmal an der Reihe. Die Startperson rückt danach einen Platz weiter.</dd>
            <dt>Partie</dt>
            <dd>Von der Rollenverteilung bis zum Sieg eines Teams.</dd>
            <dt>Lobby</dt>
            <dd>Eure Gruppe – sie bleibt über mehrere Partien zusammen.</dd>
          </dl>
        </section>

        <section>
          <h3>1 · Hinweise</h3>
          <p>
            In deinem Zug tippst du ein Wort oder einen kurzen Ausdruck (höchstens {LIMITS.clueMax} Zeichen) und legst ihn mit Enter ab.{' '}
            <strong>Tabu:</strong> das geheime Wort, seine Formen (z. B. Mehrzahl) und Buchstabieren – das haltet ihr selbst ein.
          </p>
        </section>

        <section>
          <h3>2 · Abstimmung</h3>
          <p>
            Nach dem letzten Durchgang folgen Diskussion ({TIMINGS.discussionMs / 1000} s) und geheime Wahl ({TIMINGS.votingMs / 1000} s).
            Jede Person wählt genau eine <em>andere</em> Person. <strong>Überführt ist, wer mehr als die Hälfte aller möglichen Stimmen</strong>{' '}
            bekommt.
          </p>
          <ul className="examples">
            <li>4 Personen → 3 Stimmen nötig · 5 Personen → 3 · 6 Personen → 4</li>
            <li>Mehrheit auf dem Impostor → die Eingeweihten gewinnen.</li>
            <li>Mehrheit auf einer unschuldigen Person → der Impostor gewinnt.</li>
            <li>
              Keine Mehrheit (z. B. 2 : 2 : 1 bei 5 Personen) in der <strong>Schlussabstimmung → der Impostor gewinnt</strong>, weil er nicht
              eindeutig erkannt wurde.
            </li>
          </ul>
        </section>

        <section>
          <h3>3 · Rateversuch des Impostors</h3>
          <p>
            Während <strong>Hinweisphase und Diskussion</strong> kann der Impostor einmal verbindlich raten – auch außerhalb seines Zugs.
            Richtig: sofortiger Sieg. Falsch: sofortige Niederlage. <strong>Ab Beginn der Wahl ist Raten gesperrt.</strong>
          </p>
        </section>

        <details>
          <summary>Vorzeitige Abstimmung</summary>
          <p>
            Einmal pro Durchgang kann jede Person „Abstimmung vorschlagen“. Andere können unterstützen und ihre Unterstützung bis zur
            Auslösung zurücknehmen. Stimmen mehr als die Hälfte zu, beginnen sofort Diskussion und Wahl. Vorschläge verfallen am Ende des
            Durchgangs.
          </p>
          <p>
            Ohne Mehrheit geht die Partie am unterbrochenen Zug mit der gespeicherten Restzeit weiter; im selben Durchgang ist dann kein
            weiterer Vorschlag möglich.
          </p>
        </details>

        <details>
          <summary>Enthaltungen, Unentschieden, Zeitablauf</summary>
          <ul>
            <li>Wer bis zum Ende der Wahl nicht abstimmt, enthält sich. Enthaltungen zählen nicht für eine Person – die Mehrheit bleibt „mehr als die Hälfte aller Teilnehmenden“.</li>
            <li>Gleichstand ohne Mehrheit gilt als „keine Mehrheit“ (siehe oben).</li>
            <li>Läuft die Zugzeit ab, erscheint „Kein Hinweis abgegeben“ und die nächste Person ist dran.</li>
            <li>Leere und bereits gegebene Hinweise werden abgelehnt – für alle Rollen gleich.</li>
            <li>Die Diskussion endet früher, wenn alle „Bereit zur Wahl“ drücken.</li>
          </ul>
        </details>

        <details>
          <summary>Wann zählt ein Rateversuch als richtig?</summary>
          <p>
            Groß-/Kleinschreibung, Leerzeichen, Bindestriche, ß/ss und ä/ae, ö/oe, ü/ue werden angeglichen. Außerdem zählen festgelegte
            Varianten (z. B. „Portemonnaie“ für „Geldbörse“). Teilwörter zählen nicht: „Ball“ ist nicht „Fußball“.
          </p>
        </details>

        <details>
          <summary>Verbindungsabbrüche und Verlassen</summary>
          <ul>
            <li>Verliert jemand die Verbindung, pausiert die Partie für alle. Die Restzeit bleibt erhalten.</li>
            <li>
              Rückkehr ist bis zu {TIMINGS.reconnectGraceMs / 1000} s möglich, insgesamt höchstens {TIMINGS.disconnectBudgetMs / 1000} s pro
              Person und Partie. Danach endet die Partie ohne Wertung.
            </li>
            <li>Wer zurückkommt, behält Rolle, Hinweise und Stimme.</li>
            <li>Wer eine laufende Partie verlässt, beendet sie ohne Wertung. Die Lobby bleibt bestehen.</li>
            <li>Verlässt der Host die Lobby oder ist er außerhalb einer Partie getrennt, übernimmt die am längsten anwesende verbundene Person.</li>
          </ul>
        </details>

        <details>
          <summary>Punkte</summary>
          <p>Jede siegreiche Person erhält einen Lobby-Punkt. Partien ohne Wertung geben keine Punkte. Der Punktestand ist abschaltbar.</p>
        </details>
      </div>
    </Dialog>
  );
}
