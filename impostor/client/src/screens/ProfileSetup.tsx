import { motion } from 'motion/react';
import { useState } from 'react';
import { AVATAR_COUNT, LIMITS } from '../../../shared/protocol.ts';
import { play } from '../audio/sound.ts';
import { connection } from '../net/connection.ts';
import { cleanName, profileStore, useProfile } from '../state/storage.ts';
import { AVATARS, Avatar } from '../ui/Avatar.tsx';
import { Logo } from '../ui/common.tsx';
import { IconArrowRight } from '../ui/Icons.tsx';

/** Name + Avatar wählen. Wird beim ersten Start und zum Bearbeiten genutzt. */
export function ProfileEditor({ onDone, submitLabel }: { onDone: () => void; submitLabel: string }) {
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const valid = cleanName(name).length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const p = { name: cleanName(name), avatar };
    profileStore.set({ ...p, set: true });
    if (connection.get().status === 'online') void connection.send({ t: 'setProfile', profile: p });
    play('ready');
    onDone();
  };

  return (
    <form className="profile-editor" onSubmit={submit}>
      <div className="profile-preview">
        <motion.div key={avatar} initial={{ rotateY: 90, scale: 0.9 }} animate={{ rotateY: 0, scale: 1 }} transition={{ duration: 0.28 }}>
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
            maxLength={LIMITS.nameMax}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Alex"
            autoComplete="nickname"
            data-autofocus
            aria-describedby="name-hint"
          />
          <span id="name-hint" className="field-hint">
            {name.length}/{LIMITS.nameMax} Zeichen · kein Konto nötig
          </span>
        </label>
        <fieldset className="field">
          <legend className="field-label">Figur</legend>
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
        <button className="btn btn-primary btn-lg" type="submit" disabled={!valid}>
          {submitLabel} <IconArrowRight />
        </button>
      </div>
    </form>
  );
}

export function ProfileSetup() {
  return (
    <div className="center-screen">
      <div className="setup-wrap">
        <Logo />
        <p className="tagline">Ein Wort. Eine Person ohne Ahnung. Wer blufft?</p>
        <div className="paper panel-card">
          <h1 className="panel-title">Wer spielt mit?</h1>
          <ProfileEditor onDone={() => {}} submitLabel="Weiter" />
        </div>
      </div>
    </div>
  );
}
