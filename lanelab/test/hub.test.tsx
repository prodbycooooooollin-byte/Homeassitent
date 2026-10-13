import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { type FakePlayer, FakeGame, FakeNpc, capture } from './fakegame'

;(globalThis as any).__modlock = { hostCall: () => new Uint8Array() }
const real = await import('modlock')
const game = new FakeGame()
let traceMode: 'floor' | 'none' = 'floor'

mock.module('modlock', () => ({
  ...real,
  players: () => game.connections(),
  addBot: (o: any) => game.addBot(o),
  show: (p: FakePlayer, root: unknown) => { game.screens.set(p.slot, capture(root)); return true },
  hide: () => true,
  toast: (_p: unknown, t: string) => { game.toasts.push(t); return true },
  serverCommand: (c: string) => { game.commands.push(c); return true },
  removeEntities: () => 3,
  spawnNpc: (o: any) => { const n = new FakeNpc(o.team, o.health, o.maxHealth, o.position); game.npcs.push(n); return n },
  createText: (o: any) => { const t = { text: o.text, removed: false, position: o.position, remove() { t.removed = true; return true } }; game.texts.push(t); return t },
  trace: (o: any) => (traceMode === 'floor' && Math.abs(o.start.z - o.end.z) > 500 ? { position: { x: o.start.x, y: o.start.y, z: 0 }, normal: { x: 0, y: 0, z: 1 }, startSolid: false, entity: 0 } : undefined),
}))

const { Hub } = await import('../hub')

let hub: InstanceType<typeof Hub>
let me: FakePlayer
let t = 0

function tick(seconds: number, step = 0.05): void {
  const end = t + seconds
  while (t < end) { t += step; hub.frame(t) }
}
const screen = () => game.screens.get(me.slot)!
const press = (text: string) => {
  const b = screen().buttons.find((x) => x.text.includes(text))
  if (!b) throw new Error(`no button "${text}" in: ${screen().buttons.map((x) => x.text).join(' | ')}`)
  b.press(me)
}
const hitEvent = (victim: number, attacker: number, hitGroup = 0, amount = 20) =>
  ({ victim, attacker, inflictor: 0, ability: 0, flags: 0n, hitGroup, amount })

beforeEach(() => {
  game.players = []; game.bots = []; game.npcs = []; game.texts = []; game.toasts = []; game.commands = []; game.screens.clear()
  traceMode = 'floor'
  hub = new Hub()
  me = game.human()
  me.pos = { x: 100, y: 200, z: 10 }
  t = 0
  hub.start()
  tick(0.1)
})

describe('menu', () => {
  test('welcome menu shows every mode and valid styles', () => {
    const s = screen()
    const all = s.texts.join(' ')
    for (const word of ['LANELAB', 'Aim Range', 'Last-Hit Lab', 'Checkpoint Rush', 'Flow Meter', 'Route Studio', 'Duel Ladder', 'Sandbox']) {
      expect(all).toContain(word)
    }
    expect(s.buttons.length).toBeGreaterThan(20)
  })
  test('options change selection', () => {
    press('Strafe Flick')
    press('90s')
    tick(0.1)
    press('Start Aim Range')
    tick(0.1)
    expect(screen().texts.join(' ')).toContain('STRAFE FLICK')
  })
  test('/menu toggles', () => {
    hub.setMenu(me as any, false)
    tick(0.1)
    expect(screen().texts.join(' ')).not.toContain('Checkpoint Rush')
    hub.setMenu(me as any, 'toggle')
    tick(0.1)
    expect(screen().texts.join(' ')).toContain('Checkpoint Rush')
  })
})

describe('aim range', () => {
  test('scores hits, blocks target damage, finishes with a result', () => {
    hub.startById(me as any, 'aim', 'click')
    tick(0.1)
    expect(game.bots.length).toBe(3)
    expect(game.commands).toContain('citadel_bot_brain_disable_attacks 1')
    tick(3.2) // countdown
    const target = game.bots[0]!
    let r = hub.hit(hitEvent(target.entity, me.entity, 1))
    expect(r).toEqual({ block: true })
    tick(0.1)
    expect(screen().texts.join(' ')).toMatch(/HEADSHOT\s+\+\d+/)
    // someone else's shot never scores
    r = hub.hit(hitEvent(target.entity, 9999, 1))
    expect(r).toEqual({ block: true })
    // a non-target is untouched
    expect(hub.hit(hitEvent(5555, me.entity, 1))).toBeUndefined()
    // bots were teleported into place
    expect(target.teleports.length).toBeGreaterThan(0)
    tick(61)
    expect(game.bots.every((b) => b.removedBot)).toBe(true)
    const text = screen().texts.join(' ')
    expect(text).toContain('Head shots')
    expect(me.metrics.some(([n]) => n === 'aim.score')).toBe(true)
    expect(me.announces.length).toBe(1)
  })
  test('every scenario runs for a minute without throwing', () => {
    for (const id of ['click', 'head', 'strafe', 'flick', 'switch', 'track', 'long']) {
      hub.startById(me as any, 'aim', id)
      tick(5)
      const target = game.bots[game.bots.length - 1]!
      hub.hit(hitEvent(target.entity, me.entity, 0))
      tick(8)
      hub.stopMode(me as any)
      tick(0.1)
    }
  })
  test('headline only counts head shots', () => {
    hub.startById(me as any, 'aim', 'head')
    tick(3.2)
    const target = game.bots[0]!
    hub.hit(hitEvent(target.entity, me.entity, 0))
    tick(0.1)
    expect(screen().texts.join(' ')).toContain('Aim higher')
    hub.hit(hitEvent(target.entity, me.entity, 1))
    tick(0.1)
    expect(screen().texts.join(' ')).toMatch(/HEADSHOT/)
  })
  test('again restarts', () => {
    hub.startById(me as any, 'aim', 'click')
    tick(3 + 60 + 1)
    press('Again')
    tick(0.2)
    expect(game.bots.filter((b) => !b.removedBot).length).toBe(3)
  })
  test('dead hero cannot start', () => {
    me.hasPawn = false
    hub.startById(me as any, 'aim', 'click')
    expect(game.toasts.join(' ')).toContain('living hero')
    expect(game.bots.every((b) => b.removedBot) || game.bots.length === 0).toBe(true)
  })
})

describe('last-hit lab', () => {
  test('clean last hit scores, early kill does not', () => {
    const random = Math.random
    Math.random = () => 0.9 // no ally trooper this time
    try { runLastHit() } finally { Math.random = random }
  })
  const runLastHit = () => {
    hub.startById(me as any, 'lasthit')
    tick(3.2)
    tick(0.2)
    expect(game.npcs.length).toBe(1)
    const npc = game.npcs[0]!
    // early kill
    hub.damaged({ victim: npc.entity, attacker: me.entity, ability: 0, healthLost: 300, healthBefore: 300, dealt: 300 })
    tick(0.1)
    expect(screen().texts.join(' ')).toContain('Too early')
    tick(1)
    const npc2 = game.npcs[1]!
    tick(8) // bleed down
    expect(npc2.hp).toBeLessThan(80)
    hub.damaged({ victim: npc2.entity, attacker: me.entity, ability: 0, healthLost: 40, healthBefore: 40, dealt: 40 })
    tick(0.1)
    expect(screen().texts.join(' ')).toMatch(/LAST HIT\s+\+110/)
    expect(me.souls).toBe(110)
  }
  test('ally trooper can be denied', () => {
    const random = Math.random
    Math.random = () => 0.1 // always an ally
    try {
      hub.startById(me as any, 'lasthit')
      tick(3.3)
      const npc = game.npcs[0]!
      expect(npc.team).toBe(me.team)
      tick(8)
      hub.damaged({ victim: npc.entity, attacker: me.entity, ability: 0, healthLost: 40, healthBefore: 40, dealt: 40 })
      tick(0.1)
      expect(screen().texts.join(' ')).toMatch(/DENIED\s+\+60/)
    } finally { Math.random = random }
  })
  test('trooper that bleeds out counts as missed and is removed', () => {
    hub.startById(me as any, 'lasthit')
    tick(3.2)
    tick(0.2)
    const npc = game.npcs[0]!
    tick(20)
    expect(npc.removed).toBe(true)
    hub.stopMode(me as any)
    tick(0.1)
    expect(screen().texts.join(' ')).toContain('Missed')
  })
})

describe('checkpoint rush', () => {
  test('touching every checkpoint finishes the run', () => {
    hub.startById(me as any, 'rush')
    tick(3.1)
    for (let i = 0; i < 10; i++) {
      const next = game.texts.filter((x) => !x.removed)[0]!
      me.pos = { x: next.position.x, y: next.position.y, z: next.position.z - 150 }
      tick(0.5)
    }
    expect(screen().texts.join(' ')).toMatch(/Checkpoints/)
    expect(me.metrics.some(([n]) => n === 'rush.runs')).toBe(true)
    expect(game.texts.every((x) => x.removed)).toBe(true)
  })
  test('works when the floor cannot be found', () => {
    traceMode = 'none'
    hub.startById(me as any, 'rush')
    tick(1)
    hub.stopMode(me as any)
  })
})

describe('flow meter', () => {
  test('speed above the line builds score, slow breaks the chain', () => {
    hub.startById(me as any, 'flow')
    tick(3.1)
    me.vel = { x: 600, y: 0, z: 0 }
    tick(5)
    me.vel = { x: 0, y: 0, z: 0 }
    tick(3)
    hub.stopMode(me as any)
    tick(0.1)
    const text = screen().texts.join(' ')
    expect(text).toContain('Top speed')
    expect(text).toContain('600 u/s')
    expect(text).toContain('Chains broken')
  })
})

describe('route studio', () => {
  test('needs two points, then runs and times', () => {
    hub.route(me as any, 'add')
    hub.startById(me as any, 'route')
    expect(game.toasts.join(' ')).toContain('at least two')
    me.pos = { x: 1000, y: 0, z: 10 }
    hub.route(me as any, 'add')
    me.pos = { x: 2000, y: 0, z: 10 }
    hub.route(me as any, 'add')
    expect(game.texts.filter((x) => !x.removed).length).toBe(3)
    me.pos = { x: 100, y: 200, z: 10 }
    hub.startById(me as any, 'route')
    tick(0.2)
    me.pos = { x: 100, y: 200, z: 10 }
    tick(0.2)
    me.pos = { x: 1000, y: 0, z: 10 }
    tick(0.5)
    me.pos = { x: 2000, y: 0, z: 10 }
    tick(0.2)
    expect(screen().texts.join(' ')).toContain('Checkpoints')
    hub.route(me as any, 'clear')
    expect(game.texts.filter((x) => !x.removed).length).toBe(0)
  })
})

describe('duel ladder', () => {
  test('climbs rung by rung, skipping a hero the server lacks', () => {
    hub.startById(me as any, 'duel')
    tick(3.2)
    expect(game.commands.filter((c) => c.includes('disable_attacks 0')).length).toBeGreaterThan(0)
    const bot = game.bots[0]!
    for (let i = 0; i < 8; i++) {
      hub.damaged({ victim: bot.entity, attacker: me.entity, ability: 0, healthLost: 700, healthBefore: 700, dealt: 700 })
      tick(0.1)
    }
    tick(0.1)
    expect(screen().texts.join(' ')).toContain('Ladder cleared')
    expect(bot.removedBot).toBe(true)
    expect(me.frozen).toBe(false)
  })
  test('player death respawns and resets', () => {
    hub.startById(me as any, 'duel')
    tick(3.2)
    me.hp = 0
    tick(3)
    expect(me.hp).toBeGreaterThan(0)
    hub.stopMode(me as any)
  })
})

describe('sandbox and conflicts', () => {
  test('dps meter counts damage', () => {
    hub.tool(me as any, 'dps')
    hub.damaged({ victim: 1, attacker: me.entity, ability: 0, healthLost: 50, healthBefore: 100, dealt: 50 })
    tick(0.1)
    expect(screen().texts.join(' ')).toContain('DPS')
  })
  test('hostile and passive bots cannot mix across players', () => {
    const other = game.human()
    other.pos = { x: 0, y: 0, z: 0 }
    tick(0.1)
    hub.startById(me as any, 'aim', 'click')
    hub.startById(other as any, 'duel')
    expect(game.toasts.join(' ')).toContain('Another player')
  })
  test('leaving cleans up', () => {
    hub.startById(me as any, 'aim', 'click')
    tick(0.1)
    game.players = []
    tick(0.1)
    expect(game.bots.every((b) => b.removedBot)).toBe(true)
  })
  test('bot and nobots', () => {
    hub.tool(me as any, 'bot', 'haze')
    expect(game.bots.length).toBe(1)
    hub.tool(me as any, 'nobots')
    expect(game.bots[0]!.removedBot).toBe(true)
  })
})
