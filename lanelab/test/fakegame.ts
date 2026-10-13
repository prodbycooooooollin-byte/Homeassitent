// A fake game for integration tests: players, bots, troopers, text objects and
// a screen that records what the mod shows, with the style rules checked.
import type { Angles, Vector } from 'modlock'

let ids = 100

export class FakeNpc {
  entity = ++ids
  removed = false
  constructor(public team: number, public hp: number, public maxHp: number, public position: Vector) {}
  read() {
    return this.removed ? undefined : { position: this.position, facing: { pitch: 0, yaw: 0, roll: 0 }, health: this.hp, maxHealth: this.maxHp, team: this.team }
  }
  setHealth(h: number, m?: number) { this.hp = h; if (m) this.maxHp = m; return !this.removed }
  remove() { const r = !this.removed; this.removed = true; return r }
}

export class FakePlayer {
  entity = ++ids
  hp = 700
  pos: Vector = { x: 0, y: 0, z: 0 }
  vel: Vector = { x: 0, y: 0, z: 0 }
  yaw = 0
  team = 2
  hero: string | number = 'hero_wraith'
  souls = 0
  settings: Record<string, string> = {}
  metrics: Array<[string, number, string | undefined]> = []
  announces: string[] = []
  sounds: string[] = []
  centers: string[] = []
  chats: string[] = []
  teleports: Vector[] = []
  frozen = false
  removedBot = false
  hasPawn = true
  constructor(public slot: number, public isBot = false) {}
  pawn() {
    if (!this.hasPawn) return undefined
    return {
      entity: this.entity, hero: 1, team: this.team, health: this.hp, maxHealth: 700,
      position: this.pos, eyeAngles: { pitch: 0, yaw: this.yaw, roll: 0 }, cameraAngles: { pitch: 0, yaw: this.yaw, roll: 0 },
      generation: 1, souls: this.souls, eyePosition: { ...this.pos, z: this.pos.z + 60 }, velocity: this.vel,
    }
  }
  setting(k: string) { return this.settings[k] }
  setSetting(k: string, v: string) { this.settings[k] = v; return true }
  centerText(t: string) { this.centers.push(t); return true }
  chat(t: string) { this.chats.push(t); return true }
  sound(s: string) { this.sounds.push(s); return true }
  announce(t: string, x: string) { this.announces.push(`${t}: ${x}`); return true }
  addMetric(n: string, v: number, l?: string) { this.metrics.push([n, v, l]); return true }
  adjustSouls(d: number) { this.souls += d; return true }
  teleport(p: Vector, _f: Angles) { this.pos = { ...p }; this.teleports.push({ ...p }); return true }
  freeze(f = true) { this.frozen = f; return true }
  heal(a: number) { this.hp = Math.min(700, this.hp + a); return true }
  restoreStamina() { return true }
  refreshAbility(_a: string) { return true }
  abilities() { return [{ name: 'a1' }, { name: 'a2' }] }
  removeBot() { this.removedBot = true; return true }
  selectHero(h: string | number, team: number) { if (String(h).includes('missing')) return undefined; this.hero = h; this.team = team; return 1 }
  respawn() { this.hp = 700; return true }
}

export class FakeGame {
  players: FakePlayer[] = []
  bots: FakePlayer[] = []
  npcs: FakeNpc[] = []
  texts: Array<{ text: string; removed: boolean; position: Vector }> = []
  toasts: string[] = []
  commands: string[] = []
  screens = new Map<number, ScreenInfo>()
  slot = 0

  human(): FakePlayer {
    const p = new FakePlayer(this.slot++)
    this.players.push(p)
    return p
  }
  addBot(o: { name: string; team: number; hero?: string | number; position?: Vector }) {
    const b = new FakePlayer(this.slot++, true)
    b.team = o.team
    if (o.position) b.pos = { ...o.position }
    b.hero = o.hero ?? 'hero_wraith'
    this.bots.push(b)
    return b
  }
  connections() {
    return [...this.players, ...this.bots.filter((b) => !b.removedBot)].map((p) => ({
      player: p, steamId: 0n, name: 'p' + p.slot, bot: p.isBot, ready: true, generation: 1,
    }))
  }
}

const STYLE_KEYS = new Set([
  'width', 'height', 'flow', 'horizontalAlign', 'verticalAlign', 'margin', 'padding', 'background',
  'color', 'fontSize', 'bold', 'textAlign', 'borderRadius', 'opacity',
])

export interface ScreenInfo {
  texts: string[]
  buttons: Array<{ text: string; press: (p: unknown) => void }>
  nodes: number
}

type El = { type: unknown; props: Record<string, any> }

/** capture expands a JSX tree into text and buttons, and checks each style. */
export function capture(root: unknown): ScreenInfo {
  const info: ScreenInfo = { texts: [], buttons: [], nodes: 0 }
  const textOf = (c: unknown): string => {
    if (c === null || c === undefined || typeof c === 'boolean') return ''
    if (typeof c === 'string' || typeof c === 'number') return String(c)
    if (Array.isArray(c)) return c.map(textOf).join('')
    const e = c as El
    return textOf(e.props?.children)
  }
  const walk = (c: unknown): void => {
    if (c === null || c === undefined || typeof c === 'boolean') return
    if (typeof c === 'string' || typeof c === 'number') { info.texts.push(String(c)); return }
    if (Array.isArray(c)) { c.forEach(walk); return }
    const e = c as El
    if (typeof e.type === 'function') { walk((e.type as (p: unknown) => unknown)(e.props)); return }
    info.nodes++
    const s = e.props.style
    if (s) {
      for (const [k, v] of Object.entries(s)) {
        if (!STYLE_KEYS.has(k)) throw new Error(`unknown style key ${k}`)
        if (v === undefined) continue
        if (k === 'width' || k === 'height') {
          const ok = typeof v === 'number' || v === 'fit' || v === 'fill' || /^\d+(\.\d+)?%$/.test(String(v))
          if (!ok) throw new Error(`bad length ${k}=${String(v)}`)
        }
        if (k === 'margin' || k === 'padding') {
          const ok = typeof v === 'number' || (Array.isArray(v) && (v.length === 2 || v.length === 4) && v.every((n) => typeof n === 'number'))
          if (!ok) throw new Error(`bad edges ${k}=${JSON.stringify(v)}`)
        }
        if ((k === 'background' || k === 'color') && !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(String(v))) {
          throw new Error(`bad color ${k}=${String(v)}`)
        }
        if (k === 'opacity' && (typeof v !== 'number' || v < 0 || v > 1)) throw new Error(`bad opacity ${String(v)}`)
        if (k === 'fontSize' && typeof v !== 'number') throw new Error('bad fontSize')
      }
    }
    if (e.type === 'button') info.buttons.push({ text: textOf(e.props.children), press: e.props.onPress })
    if (e.type === 'label') info.texts.push(textOf(e.props.children))
    else walk(e.props.children)
  }
  walk(root)
  return info
}
