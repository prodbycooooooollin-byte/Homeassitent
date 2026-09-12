// Interpretiert einzelne Zeilen aus logs/latest.log. Das Vanilla-Log-Format
// ist über Minecraft-Versionen hinweg stabil: "[HH:MM:SS] [Thread/LEVEL]: Nachricht".
// Es werden bewusst nur eindeutig erkennbare Muster ausgewertet - alles
// andere wird ignoriert statt geraten.
const LINE_RE = /^\[\d{2}:\d{2}:\d{2}\] \[[^\]]+\]: (.*)$/;

const JOIN_RE = /^(\w+) joined the game$/;
const LEAVE_RE = /^(\w+) left the game$/;
const CHAT_RE = /^<(\w+)> (.*)$/;
const ADVANCEMENT_RE = /^(\w+) has (?:made the advancement|completed the challenge|reached the goal) \[(.+)\]$/;
const LINK_COMMAND_RE = /^!link\s+([A-Za-z0-9]+)$/i;

/**
 * Todesnachrichten haben keine einzelne feste Vorlage (~100 Varianten in
 * Vanilla), folgen aber immer dem Muster "<Spielername> <Rest>" OHNE die
 * Chat-Klammern "<...>". Trifft eine Zeile auf einen BEKANNTEN Online-
 * Spielernamen als erstes Wort und keines der anderen Muster, wird sie als
 * Todesereignis gewertet - der volle Text wird als Nachricht übernommen.
 */
export function parseLogLine(rawLine, onlineUsernames) {
  const match = rawLine.match(LINE_RE);
  if (!match) return null;
  const message = match[1];

  const join = message.match(JOIN_RE);
  if (join) return { type: "join", username: join[1] };

  const leave = message.match(LEAVE_RE);
  if (leave) return { type: "leave", username: leave[1] };

  const chat = message.match(CHAT_RE);
  if (chat) {
    const linkMatch = chat[2].trim().match(LINK_COMMAND_RE);
    if (linkMatch) return { type: "link", username: chat[1], code: linkMatch[1] };
    return { type: "chat", username: chat[1], text: chat[2] };
  }

  const advancement = message.match(ADVANCEMENT_RE);
  if (advancement) return { type: "advancement", username: advancement[1], title: advancement[2] };

  for (const username of onlineUsernames) {
    if (message.startsWith(`${username} `) || message === username) {
      return { type: "death", username, message };
    }
  }

  return null;
}
