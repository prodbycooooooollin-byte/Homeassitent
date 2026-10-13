// The plain-text screen: what a player sees when the panel interface is not
// available. It uses only the game's own center text, so it always works.
import type { Feed, HudModel, Result } from '../modes/mode'

export const MENU_TEXT = [
  'LANELAB  -  type a command in chat',
  '/aim [click|head|strafe|flick|switch|track|long] [30|60|90]',
  '/lasthit [slow|normal|fast]    /rush [6|10|15] [tight|medium|wide]',
  '/flow [easy|normal|hard]    /duel [easy|normal|hard]',
  '/route add|undo|clear|run    /dps  /refill  /souls  /bot  /nobots',
  '/hero <name>    /stop    /ui panel|text|both    /menu closes this',
].join('\n')

/** modeText is one mode's HUD as text: a status line and the latest event. */
export function modeText(model: HudModel, feed: Feed | undefined, now: number): string {
  const head = `${model.title.toUpperCase()}   ${model.big}${model.sub ? '  ' + model.sub : ''}`
  const chips = model.chips.map((c) => `${c.label} ${c.value}`).join('  |  ')
  const live = feed && now - feed.at < 1.8 ? `\n>> ${feed.text}` : ''
  return `${head}${chips ? '\n' + chips : ''}${live}`
}

/** resultText is the result card as text. */
export function resultText(r: Result): string {
  const lines = r.lines.map(([k, v]) => `${k}: ${v}`).join('   ')
  const best = r.newBest ? 'NEW SESSION BEST' : (r.best ?? '')
  return `${r.title.toUpperCase()}\n${r.headline}\n${lines}${best ? '\n' + best : ''}\n/menu  or repeat the command to go again`
}

export type Display = 'text' | 'panel' | 'both'

export function parseDisplay(v: string | undefined): Display {
  return v === 'panel' || v === 'both' ? v : 'text'
}
