import { Dialog } from '../ui/common.tsx';

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Spielregeln" wide>
      <div className="rules">
        <section>
          <h3>Ziel</h3>
          <p>
            Alle bis auf eine Person kennen dasselbe geheime Wort. Die <strong>Eingeweihten</strong> wollen den{' '}
            <strong>Impostor</strong> entlarven. Der Impostor will unerkannt bleiben oder das Wort erraten.
          </p>
        </section>
        <section>
          <h3>Begriffe</h3>
          <ul>
            <li>
              <strong>Zug</strong> – eine Person gibt einen Hinweis ab.
            </li>
            <li>
              <strong>Durchgang</strong> – alle waren einmal an der Reihe. Die Startperson rückt pro Durchgang einen Platz weiter.
            </li>
            <li>
              <strong>Partie</strong> – von der Rollenverteilung bis zum Sieg.
            </li>
            <li>
              <strong>Lobby</strong> – eure Gruppe über mehrere Partien.
            </li>
          </ul>
        </section>
        <section>
          <h3>Hinweise</h3>
          <p>
            Reihum ein Wort oder ein kurzer Ausdruck (max. 40 Zeichen). <strong>Tabu:</strong> das geheime Wort, seine Formen (z. B.
            Mehrzahl) und Buchstabieren – das haltet ihr selbst ein. Doppelte Hinweise sind nicht möglich. Läuft die Zeit ab, gilt
            „Kein Hinweis abgegeben".
          </p>
        </section>
        <section>
          <h3>Abstimmung</h3>
          <ul>
            <li>
              Einmal pro Durchgang kann jede Person eine Abstimmung vorschlagen. Stimmt <strong>mehr als die Hälfte</strong> zu, folgt
              eine Diskussion (45 s) und die geheime Wahl (30 s).
            </li>
            <li>Nach dem letzten Durchgang beginnt die Schlussabstimmung automatisch.</li>
            <li>
              Alle wählen geheim genau eine andere Person. Überführt ist, wer <strong>mehr als die Hälfte aller möglichen Stimmen</strong>{' '}
              erhält (bei 4 Personen: 3). Keine Stimme = Enthaltung.
            </li>
            <li>Mehrheit auf dem Impostor → Eingeweihte gewinnen. Mehrheit auf einer unschuldigen Person → Impostor gewinnt.</li>
            <li>
              Keine Mehrheit bei einer vorzeitigen Abstimmung → es geht am unterbrochenen Zug weiter. Keine Mehrheit bei der{' '}
              <strong>Schlussabstimmung → der Impostor gewinnt</strong>, weil er nicht eindeutig erkannt wurde.
            </li>
          </ul>
        </section>
        <section>
          <h3>Rateversuch des Impostors</h3>
          <p>
            Während Hinweisphase und Diskussion kann der Impostor jederzeit <strong>einmal</strong> verbindlich raten. Richtig: sofortiger
            Sieg. Falsch: sofortige Niederlage. Ab Beginn der Wahl ist Raten gesperrt. Groß-/Kleinschreibung, ß/ss und Umlaute werden
            angeglichen, sonst zählt nur das Wort oder eine festgelegte Variante – „Ball" ist nicht „Fußball".
          </p>
        </section>
        <section>
          <h3>Verbindung & Punkte</h3>
          <p>
            Bricht eine Verbindung ab, pausiert die Partie bis zu 60 s (höchstens 120 s pro Person und Partie). Kommt die Person nicht
            zurück oder verlässt sie die Partie, endet sie ohne Wertung. Jede siegreiche Person erhält einen Lobby-Punkt.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
