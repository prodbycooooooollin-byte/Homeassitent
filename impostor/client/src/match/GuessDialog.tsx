import { useEffect, useState } from 'react';
import { LIMITS } from '../../../shared/protocol.ts';
import { useCmd } from '../App.tsx';
import { Dialog } from '../ui/common.tsx';

/**
 * Rateversuch des Impostors. Öffnen und Abbrechen sind folgenlos und
 * werden niemandem angezeigt; erst die zweite, endgültige Bestätigung sendet.
 */
export function GuessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cmd = useCmd();
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirm(false);
      setSending(false);
    }
  }, [open]);

  const submit = async () => {
    if (sending) return;
    setSending(true);
    await cmd({ t: 'guessWord', text });
    setSending(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Ich kenne das Wort" tone="danger">
      <p className="guess-warning">
        <strong>Du hast einen Versuch. Bei einer falschen Antwort verlierst du sofort.</strong>
      </p>
      {!confirm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) setConfirm(true);
          }}
        >
          <input
            className="text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={LIMITS.guessMax}
            placeholder="Das geheime Wort"
            aria-label="Dein Rateversuch"
            data-autofocus
            autoComplete="off"
            spellCheck={false}
          />
          <p className="muted small">Die Partie läuft währenddessen weiter. Abbrechen hat keine Folgen.</p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              Weiter
            </button>
          </div>
        </form>
      ) : (
        <div>
          <p className="guess-confirm">
            Du rätst: <span className="guess-word">„{text.trim()}"</span>
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)} data-autofocus>
              Zurück
            </button>
            <button type="button" className="btn btn-danger" onClick={submit} disabled={sending}>
              Endgültig raten
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
