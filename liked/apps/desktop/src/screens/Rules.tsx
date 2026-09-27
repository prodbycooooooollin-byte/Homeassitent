import { t } from '../i18n/de';
import { useStore } from '../state/store';
import { Button, Icon, Panel } from '../components/ui';
import { goBackFromSubscreen } from './Settings';

/** Dauerhaft erreichbare Spielregeln – Inhalte entsprechen der Berechnung in game-core. */
export function Rules() {
  const inRoom = useStore((s) => !!s.session);
  return (
    <div className="screen page-screen">
      <header className="page-head">
        <Button variant="quiet" icon="arrowLeft" onClick={goBackFromSubscreen}>
          {inRoom ? t.lobby.backToLobby : t.common.back}
        </Button>
        <h2 className="screen-title">
          <Icon name="book" size={26} /> {t.rules.title}
        </h2>
      </header>
      <div className="rules-wrap">
        <p className="lead">{t.rules.intro}</p>
        <nav className="rules-toc" aria-label={t.rules.title}>
          {t.rules.sections.map((s, i) => (
            <a key={s.q} href={`#rule-${i}`}>
              {s.q}
            </a>
          ))}
        </nav>
        <div className="rules-list">
          {t.rules.sections.map((s, i) => (
            <Panel key={s.q} className="rule" title={<span id={`rule-${i}`}>{s.q}</span>}>
              {s.a.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}
