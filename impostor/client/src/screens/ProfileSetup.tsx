import { motion } from 'motion/react';
import { useState } from 'react';
import { AVATAR_COUNT, LIMITS } from '../../../shared/protocol.ts';
import { play } from '../audio/sound.ts';
import { connection } from '../net/connection.ts';
import { cleanName, nameProblem, profileStore, useProfile } from '../state/storage.ts';
import { AVATARS, Avatar } from '../ui/Avatar.tsx';
import { Logo } from '../ui/common.tsx';
import { IconArrowRight } from '../ui/Icons.tsx';
import { invitedCode } from './invite.ts';

/** Name + Avatar wählen. Wird beim ersten Start und zum Bearbeiten genutzt. */
export function ProfileEditor({
  onDone,
  onCancel,
  submitLabel,
}: {
  onDone: () => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [touched, setTouched] = useState(false);
  const problem = nameProblem(name);
  const showProblem = touched && problem;
  const length = [...name.normalize('NFC').replace(/\s+/g, ' ').trim()].length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) {
      play('error');
      return;
    }
    const p = { name: cleanName(name), avatar };
    profileStore.set({ ...p, set: true });
    if (connection.get().status === 'online') void connection.send({ t: 'setProfile', profile: p });
    play('ready');
    onDone();
  };

  return (
    <form className="profile-editor" onSubmit={submit} noValidate>
      <div className="profile-preview" aria-hidden="true">
        <motion.div key={avatar} initial={{ rotateY: 90, scale: 0.9 }} animate={{ rotateY: 0, scale: 1 }} transition={{ duration: 0.24 }}>
          <div className="player-card paper big-preview">
            <Avatar id={avatar} size={96} />
            <span className="pc-name">{cleanName(name) || 'Dein Name'}</span>
          </div>
        </motion.div>
      </div>
      <div className="profile-fields">
        <label className="field">
          <span className="field-label">Anzeigename</span>
          <input
            className="text-input"
            value={name}
            maxLength={LIMITS.nameMax + 4}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="z. B. Alex"
            autoComplete="nickname"
            data-autofocus
            aria-invalid={!!showProblem}
            aria-describedby="name-hint"
          />
          <span id="name-hint" className={showProblem ? 'field-error' : 'field-hint'} role={showProblem ? 'alert' : undefined}>
            {showProblem ? problem : `${length}/${LIMITS.nameMax} Zeichen · so sehen dich die anderen · kein Konto nötig`}
          </span>
        </label>
        <fieldset className="field">
          <legend className="field-label">Figur – {AVATARS[avatar]?.name}</legend>
          <div className="avatar-grid" role="radiogroup" aria-label="Figur wählen">
            {Array.from({ length: AVATAR_COUNT }, (_, i) => (
              <button
                type="button"
                key={i}
                role="radio"
                aria-checked={avatar === i}
                aria-label={AVATARS[i].name}
                className={`avatar-choice ${avatar === i ? 'selected' : ''}`}
                onClick={() => {
                  setAvatar(i);
                  play('click');
                }}
              >
                <Avatar id={i} size={52} title={AVATARS[i].name} />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="row-actions end">
          {onCancel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Abbrechen
            </button>
          )}
          <button className="btn btn-primary btn-lg" type="submit">
            {submitLabel} <IconArrowRight />
          </button>
        </div>
      </div>
    </form>
  );
}

export function ProfileSetup() {
  const invite = invitedCode();
  return (
    <div className="center-screen">
      <div className="setup-wrap">
        <Logo />
        {invite ? (
          <p className="invite-banner" role="status">
            Du wurdest in die Lobby <strong className="code-inline">{invite}</strong> eingeladen. Wähle Namen und Figur – danach trittst du
            automatisch bei.
          </p>
        ) : (
          <p className="tagline">Ein Wort. Eine Person ohne Ahnung. Wer blufft?</p>
        )}
        <div className="paper panel-card">
          <h1 className="panel-title">Wer spielt mit?</h1>
          <ProfileEditor onDone={() => {}} submitLabel={invite ? 'Weiter zur Lobby' : 'Weiter'} />
        </div>
      </div>
    </div>
  );
}
