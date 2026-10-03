import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { LIMITS, type ClientView } from '../../../shared/protocol.ts';
import { useCmd } from '../App.tsx';
import { play } from '../audio/sound.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { IconChat, IconSend } from '../ui/Icons.tsx';

/**
 * Textchat – optisch klar von Hinweiskarten getrennt (Sprechblasen statt Karten).
 * Inhalte werden ausschließlich als Text gerendert.
 */
export function ChatPanel({
  view,
  title = 'Diskussion',
  compact = false,
  disabledReason,
}: {
  view: ClientView;
  title?: string;
  compact?: boolean;
  disabledReason?: string;
}) {
  const cmd = useCmd();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const msgs = view.lobby.chat;
  const lastCount = useRef(msgs.length);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (msgs.length > lastCount.current && msgs[msgs.length - 1]?.playerId !== view.me.id) play('chat');
    lastCount.current = msgs.length;
  }, [msgs, view.me.id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const r = await cmd({ t: 'chat', text: t });
    if (r.ok) setText('');
  };

  const byId = new Map(view.lobby.players.map((p) => [p.id, p]));

  return (
    <section className={`chat-panel ${compact ? 'compact' : ''}`} aria-label={title}>
      <h2 className="panel-mini-title">
        <IconChat size={16} /> {title}
      </h2>
      <div className="chat-list" ref={listRef} role="log" aria-live="polite">
        {msgs.length === 0 && <p className="muted small chat-empty">Noch keine Nachrichten.</p>}
        <AnimatePresence initial={false}>
          {msgs.map((m) => {
            const p = byId.get(m.playerId);
            const mine = m.playerId === view.me.id;
            return (
              <motion.div
                key={m.id}
                className={`bubble ${mine ? 'mine' : ''}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
              >
                {!mine && <Avatar id={p?.avatar ?? 0} size={22} />}
                <div className="bubble-body">
                  {!mine && <span className="bubble-name">{p?.name ?? 'Unbekannt'}</span>}
                  <span className="bubble-text">{m.text}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <form className="chat-form" onSubmit={send}>
        <input
          className="text-input chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.chatMax}
          placeholder={disabledReason ?? 'Nachricht schreiben …'}
          disabled={!!disabledReason}
          aria-label="Chatnachricht"
        />
        <button className="icon-btn send" type="submit" disabled={!!disabledReason || !text.trim()} aria-label="Nachricht senden">
          <IconSend size={18} />
        </button>
      </form>
    </section>
  );
}
