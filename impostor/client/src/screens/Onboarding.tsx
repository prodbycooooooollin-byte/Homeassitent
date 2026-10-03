import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { play } from '../audio/sound.ts';
import { settingsStore } from '../state/storage.ts';
import { Logo } from '../ui/common.tsx';
import { IconArrowRight, IconBack, IconChat, IconEye, IconVote } from '../ui/Icons.tsx';

const STEPS = [
  {
    icon: <IconEye size={34} />,
    kicker: '1',
    title: 'Wort ansehen',
    text: 'Alle bekommen eine verdeckte Karte. Dreh deine eigene um: Entweder steht dort das geheime Wort – oder du bist der Impostor und kennst es nicht. Niemand sieht die Karten der anderen.',
  },
  {
    icon: <IconChat size={34} />,
    kicker: '2',
    title: 'Hinweise geben',
    text: 'Reihum tippt jede Person in ihrem Zug einen kurzen Hinweis (max. 40 Zeichen) in die App. Das Wort selbst, seine Formen und Buchstabieren sind tabu. Reden könnt ihr zusätzlich über Discord o. Ä. – die App hat keinen Sprachchat.',
  },
  {
    icon: <IconVote size={34} />,
    kicker: '3',
    title: 'Impostor finden oder Wort erraten',
    text: 'Nach der Diskussion wählt ihr geheim, wer blufft – eine Mehrheit überführt. Der Impostor darf während Hinweisphase und Diskussion einmal verbindlich raten: richtig = Sieg, falsch = sofortige Niederlage. Ab Beginn der Wahl ist Raten gesperrt.',
  },
];

export function OnboardingCards({ onFinish, finishLabel = "Los geht's" }: { onFinish: () => void; finishLabel?: string }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="onboarding">
      <div className="onb-stage">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.article
            key={step}
            className="onb-card paper"
            initial={{ x: 120, rotate: 6, opacity: 0 }}
            animate={{ x: 0, rotate: [-1.5, 1, 0][step], opacity: 1 }}
            exit={{ x: -140, rotate: -8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            aria-live="polite"
          >
            <span className="onb-kicker">{s.kicker}</span>
            <span className="onb-icon">{s.icon}</span>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </motion.article>
        </AnimatePresence>
      </div>
      <div className="onb-dots" aria-hidden="true">
        {STEPS.map((_, i) => (
          <span key={i} className={i === step ? 'on' : ''} />
        ))}
      </div>
      <div className="onb-actions">
        <button className="btn btn-ghost" onClick={() => (step === 0 ? onFinish() : setStep(step - 1))}>
          {step === 0 ? 'Überspringen' : (
            <>
              <IconBack /> Zurück
            </>
          )}
        </button>
        <button
          className="btn btn-primary"
          data-autofocus
          onClick={() => {
            play('deal');
            if (last) onFinish();
            else setStep(step + 1);
          }}
        >
          {last ? finishLabel : 'Weiter'} <IconArrowRight />
        </button>
      </div>
    </div>
  );
}

export function Onboarding() {
  return (
    <div className="center-screen">
      <div className="setup-wrap">
        <Logo size="sm" />
        <OnboardingCards onFinish={() => settingsStore.set({ onboardingDone: true })} />
      </div>
    </div>
  );
}
