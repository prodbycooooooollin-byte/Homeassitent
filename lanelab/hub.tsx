// The hub keeps one session per player: the running mode, the menu, the last
// result, the player's route and sandbox tools. It routes frames, hits and
// commands, and draws the screen.
import {
  addBot, type DamageEvent, type DamageResult, type DamagedEvent, hide,
  type Player, players, removeEntities, serverCommand, show, toast,
} from 'modlock'

import {
  AIM_LENGTHS, BLEED, defaultSel, DUEL_REACTION, FLOW_LINE, RUSH_SIZE, type Sel,
} from './lib/catalog'
import { polar } from './lib/math'
import { SCENARIOS, scenarioById } from './lib/scenarios'
import { AimMode } from './modes/aim'
import { DuelMode } from './modes/duel'
import { FlowMode } from './modes/flow'
import { LastHitMode } from './modes/lasthit'
import { type Bots, enemyTeam, forgetSlot, type Mode, type Result } from './modes/mode'
import { RushMode } from './modes/rush'
import { RouteBook, RouteRunMode } from './modes/routes'
import { DpsBadge, Hud } from './ui/hud'
import { Menu, type MenuActions } from './ui/menu'
import { ResultCard } from './ui/result'
import { accentOf, C } from './ui/theme'

/** serverConfig keeps frames running on an empty server and the lanes quiet. */
export const serverConfig = [
  'sv_hibernate_when_empty 0',
  'citadel_trooper_spawn_enabled 0',
  'citadel_neutral_spawn_enabled 0',
  'citadel_spawn_practice_bots 0',
  'citadel_bot_test_mode 1',
  'citadel_bot_brain_disable_attacks 1',
  'citadel_bot_brain_disable_movement 1',
]

const profiles: Record<Exclude<Bots, 'none'>, string[]> = {
  passive: ['citadel_bot_brain_disable_attacks 1', 'citadel_bot_brain_disable_movement 1'],
  hostile: ['citadel_bot_brain_disable_attacks 0', 'citadel_bot_brain_disable_movement 0'],
}

const resultSeconds = 18
const dpsWindow = 5

interface Session {
  player: Player
  mode?: Mode
  result?: Result
  resultAt: number
  menu: boolean
  sel: Sel
  book: RouteBook
  /** again restarts the last mode with the same options. */
  again?: () => void
  dpsOn: boolean
  hits: Array<{ t: number; dealt: number }>
  peak: number
  total: number
  bots: Player[]
  botProfile: Bots
  welcomed: boolean
}

export class Hub {
  now = 0
  private readonly sessions = new Map<number, Session>()

  start(): void {
    for (const line of serverConfig) serverCommand(line)
  }

  world(): void {
    for (const s of this.sessions.values()) {
      s.mode?.stop()
      s.mode = undefined
      s.book.forget()
      s.bots = []
      s.botProfile = 'none'
    }
  }

  private session(player: Player): Session {
    let s = this.sessions.get(player.slot)
    if (!s) {
      s = {
        player, menu: false, sel: defaultSel(), book: new RouteBook(), resultAt: 0,
        dpsOn: false, hits: [], peak: 0, total: 0, bots: [], botProfile: 'none', welcomed: false,
      }
      this.sessions.set(player.slot, s)
    }
    return s
  }

  // ---------- frames and hits ----------

  frame(now: number): void {
    this.now = now
    const live = players().filter((c) => !c.bot && c.ready)
    const present = new Set(live.map((c) => c.player.slot))
    for (const [slot, s] of this.sessions) {
      if (!present.has(slot)) {
        s.mode?.stop()
        s.book.hide()
        for (const b of s.bots) b.removeBot()
        forgetSlot(slot)
        this.sessions.delete(slot)
      }
    }
    for (const c of live) {
      const s = this.session(c.player)
      if (!s.welcomed) {
        s.welcomed = true
        s.menu = true
      }
      s.hits = s.hits.filter((h) => now - h.t < dpsWindow)
      if (s.mode) {
        s.mode.frame(now)
        if (s.mode.done) this.end(s)
      }
      if (s.result && now - s.resultAt > resultSeconds) s.result = undefined
      this.draw(s)
    }
  }

  hit(hit: DamageEvent): DamageResult | undefined {
    for (const s of this.sessions.values()) {
      const r = s.mode?.hit(hit)
      if (r) return r
    }
    return undefined
  }

  damaged(hit: DamagedEvent): void {
    for (const s of this.sessions.values()) {
      if (s.player.pawn()?.entity === hit.attacker && hit.dealt > 0) {
        s.hits.push({ t: this.now, dealt: hit.dealt })
        s.total += hit.dealt
        const dps = s.hits.reduce((a, h) => a + h.dealt, 0) / dpsWindow
        s.peak = Math.max(s.peak, dps)
      }
      s.mode?.damaged(hit)
    }
  }

  // ---------- modes ----------

  /** stopMode ends a running mode and shows its result. */
  stopMode(player: Player): void {
    const s = this.session(player)
    if (!s.mode) {
      toast(player, 'No mode is running.')
      return
    }
    this.end(s)
  }

  private end(s: Session): void {
    const mode = s.mode
    if (!mode) return
    mode.stop()
    s.mode = undefined
    s.menu = false
    if (mode.result) {
      s.result = mode.result
      s.resultAt = this.now
      s.player.announce(mode.result.title, mode.result.headline)
    }
    this.applyBots()
  }

  /** wantedProfile says what bot behavior every running mode and sandbox bot needs. */
  private wantedProfile(except?: Session): Bots[] {
    const out: Bots[] = []
    for (const s of this.sessions.values()) {
      if (s === except) continue
      if (s.mode && s.mode.bots !== 'none') out.push(s.mode.bots)
      if (s.bots.length > 0 && s.botProfile !== 'none') out.push(s.botProfile)
    }
    return out
  }

  private applyBots(): void {
    const w = this.wantedProfile()
    const p: Exclude<Bots, 'none'> = w.includes('hostile') ? 'hostile' : 'passive'
    for (const line of profiles[p]) serverCommand(line)
  }

  /** claim reserves a bot behavior, and reports false when another player needs the opposite. */
  private claim(s: Session, profile: Bots): boolean {
    if (profile === 'none') return true
    const others = this.wantedProfile(s)
    if (others.some((o) => o !== profile)) {
      toast(s.player, 'Another player is using bots that behave differently. Try again when they finish.', 6)
      return false
    }
    return true
  }

  private begin(s: Session, mode: Mode): boolean {
    if (s.mode) this.end(s)
    s.result = undefined
    if (!this.claim(s, mode.bots)) return false
    if (!mode.start(this.now)) {
      toast(s.player, 'You need a living hero to start this.')
      mode.stop()
      return false
    }
    s.mode = mode
    s.menu = false
    this.applyBots()
    return true
  }

  startById(player: Player, id: string, arg = ''): void {
    const s = this.session(player)
    const sel = s.sel
    const keep = (make: () => Mode) => {
      s.again = () => { this.begin(s, make()) }
      this.begin(s, make())
    }
    switch (id) {
      case 'aim': {
        const sc = scenarioById(arg) ?? scenarioById(sel.aim) ?? (SCENARIOS[0] as (typeof SCENARIOS)[number])
        sel.aim = sc.id
        const len = Number(player.setting('length')) || sel.len
        keep(() => new AimMode(player, sc, AIM_LENGTHS.includes(len as never) ? len : sel.len))
        break
      }
      case 'lasthit':
        keep(() => new LastHitMode(player, { seconds: 90, bleed: BLEED[sel.bleed], deny: sel.deny }))
        break
      case 'rush':
        keep(() => new RushMode(player, sel.rushCount, RUSH_SIZE[sel.rushSize]))
        break
      case 'flow':
        keep(() => new FlowMode(player, { seconds: 60, line: FLOW_LINE[sel.flow], label: sel.flow }))
        break
      case 'duel':
        keep(() => new DuelMode(player, { reaction: DUEL_REACTION[sel.duel], label: sel.duel, seconds: 420 }))
        break
      case 'route':
        if (s.book.points.length < 2) {
          toast(player, 'Add at least two checkpoints first: stand somewhere and use /route add.', 6)
          return
        }
        keep(() => new RouteRunMode(player, s.book))
        break
    }
  }

  // ---------- sandbox ----------

  tool(player: Player, op: string, arg = ''): void {
    const s = this.session(player)
    const pawn = player.pawn()
    switch (op) {
      case 'dps':
        s.dpsOn = !s.dpsOn
        if (s.dpsOn) { s.peak = 0; s.total = 0; s.hits = [] }
        toast(player, s.dpsOn ? 'DPS meter on.' : 'DPS meter off.')
        break
      case 'refill':
        if (!pawn || pawn.health <= 0) return void toast(player, 'You need a living hero.')
        player.heal(100000)
        player.restoreStamina()
        for (const a of player.abilities()) player.refreshAbility(a.name)
        toast(player, 'Health, stamina and abilities refilled.')
        break
      case 'souls': {
        const n = Math.max(1, Math.min(500000, Number(arg) || 50000))
        player.adjustSouls(n)
        toast(player, `+${n} souls.`)
        break
      }
      case 'bot': {
        if (!pawn || pawn.health <= 0) return void toast(player, 'You need a living hero.')
        const [heroArg, mode] = arg.trim().split(/\s+/)
        const fight = mode === 'fight' || heroArg === 'fight'
        const profile: Bots = fight ? 'hostile' : 'passive'
        if (!this.claim(s, profile)) return
        const hero = heroArg && heroArg !== 'fight' ? (heroArg.startsWith('hero_') ? heroArg : `hero_${heroArg}`) : 'hero_wraith'
        const bot = addBot({
          name: fight ? 'Sparring Bot' : 'Practice Dummy',
          team: enemyTeam(pawn.team), hero,
          position: polar(pawn.position, pawn.eyeAngles.yaw, 700, 0),
        })
        if (!bot) return void toast(player, 'The bot could not join. Check the hero name.')
        s.bots.push(bot)
        s.botProfile = profile
        this.applyBots()
        toast(player, fight ? 'A sparring bot joins and fights back.' : 'A practice dummy joins.')
        break
      }
      case 'nobots':
        for (const b of s.bots) b.removeBot()
        toast(player, s.bots.length ? 'Bots removed.' : 'You have no bots.')
        s.bots = []
        s.botProfile = 'none'
        this.applyBots()
        break
      case 'clean': {
        const n = removeEntities('npc_trooper') ?? 0
        toast(player, `${n} troopers removed.`)
        break
      }
    }
  }

  route(player: Player, op: string): void {
    const s = this.session(player)
    const pawn = player.pawn()
    switch (op) {
      case 'add': {
        if (!pawn || pawn.health <= 0) return void toast(player, 'You need a living hero.')
        const n = s.book.add(pawn.position)
        toast(player, n < 0 ? 'A route holds at most 24 checkpoints.' : n === 1 ? 'START set. Add more with /route add.' : `Checkpoint ${n} set.`)
        break
      }
      case 'undo':
        toast(player, s.book.undo() ? 'Last checkpoint removed.' : 'Nothing to undo.')
        break
      case 'clear':
        s.book.clear()
        toast(player, 'Route cleared.')
        break
      case 'run':
        this.startById(player, 'route')
        break
      case 'list':
        toast(player, `${s.book.points.length} checkpoint${s.book.points.length === 1 ? '' : 's'} set.`)
        break
    }
  }

  setMenu(player: Player, open: boolean | 'toggle'): void {
    const s = this.session(player)
    s.menu = open === 'toggle' ? !s.menu : open
    if (s.menu) s.result = undefined
  }

  // ---------- drawing ----------

  private readonly actions: MenuActions = {
    set: (player, key, value) => { this.session(player).sel[key] = value },
    start: (player, id) => this.startById(player, id),
    close: (player) => this.setMenu(player, false),
    route: (player, op) => this.route(player, op),
    tool: (player, op) => this.tool(player, op),
    stop: (player) => this.stopMode(player),
  }

  private draw(s: Session): void {
    const accent = accentOf(s.player.setting('accent'))
    const compact = s.player.setting('hud') === 'compact'
    const dps = s.dpsOn
      ? { dps: s.hits.reduce((a, h) => a + h.dealt, 0) / dpsWindow, peak: s.peak, total: s.total }
      : undefined
    show(
      s.player,
      <panel style={{ width: '100%', height: '100%' }}>
        {s.mode ? (
          <Hud model={s.mode.hud(this.now)} feed={s.mode.feed} now={this.now} accent={accent} compact={compact} />
        ) : null}
        {dps ? <DpsBadge dps={dps} accent={accent} /> : null}
        {s.menu ? (
          <Menu sel={s.sel} accent={accent} actions={this.actions} routePoints={s.book.points.length} dpsOn={s.dpsOn} busy={!!s.mode} />
        ) : null}
        {!s.menu && !s.mode && s.result ? (
          <ResultCard
            result={s.result}
            accent={accent}
            onAgain={() => { const again = s.again; s.result = undefined; again?.() }}
            onMenu={() => { s.result = undefined; s.menu = true }}
          />
        ) : null}
        {!s.menu && !s.mode && !s.result ? (
          <label style={{ horizontalAlign: 'center', verticalAlign: 'top', margin: [14, 0, 0, 0], padding: [6, 14], background: C.panel, borderRadius: 4, fontSize: 14, color: C.dim }}>
            LANELAB  ·  /menu to train
          </label>
        ) : null}
      </panel>,
    )
  }

  /** hideAll clears the screens, as when the mod stops. */
  hideAll(): void {
    for (const s of this.sessions.values()) hide(s.player)
  }
}
