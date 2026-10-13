// Route Studio: stand where you want a checkpoint and add it, then run the
// route against the clock. Routes live for the session, per player.
import { createText, type Player, type Vector, type WorldObject } from 'modlock'

import { stopwatch } from '../lib/format'
import { dist2d } from '../lib/math'
import { type HudModel, Mode, bestOf, recordBest } from './mode'

const reach = 130
export const maxPoints = 24

/** RouteBook is one player's route under construction. */
export class RouteBook {
  readonly points: Vector[] = []
  private labels: WorldObject[] = []

  add(p: Vector): number {
    if (this.points.length >= maxPoints) return -1
    this.points.push({ ...p })
    this.redraw()
    return this.points.length
  }

  undo(): boolean {
    if (this.points.pop() === undefined) return false
    this.redraw()
    return true
  }

  clear(): void {
    this.points.length = 0
    this.redraw()
  }

  /** forget drops marker handles after a world change removed them. */
  forget(): void {
    this.labels = []
    this.redraw()
  }

  hide(): void {
    for (const l of this.labels) l.remove()
    this.labels = []
  }

  redraw(): void {
    this.hide()
    this.points.forEach((p, i) => {
      const last = i === this.points.length - 1 && this.points.length > 1
      const text = i === 0 ? 'START' : last ? `FINISH ${i + 1}` : `${i + 1}`
      const label = createText({
        text,
        position: { x: p.x, y: p.y, z: p.z + 130 },
        fontSize: 110,
        color: i === 0 ? 0x7dff9cff : last ? 0xff6f61ff : 0xffd34dff,
        faceCamera: true,
      })
      if (label) this.labels.push(label)
    })
  }
}

export class RouteRunMode extends Mode {
  readonly id = 'route'
  readonly name = 'Route Run'
  private index = 0
  private startedAt = 0
  private lastAt = 0
  private splits: number[] = []

  constructor(player: Player, private readonly book: RouteBook) {
    super(player)
  }

  start(now: number): boolean {
    const pawn = this.player.pawn()
    if (pawn === undefined || pawn.health <= 0 || this.book.points.length < 2) return false
    this.now = now
    return true
  }

  frame(now: number): void {
    this.now = now
    const pawn = this.player.pawn()
    if (pawn === undefined) {
      this.done = true
      return
    }
    const target = this.book.points[this.index]
    if (!target) return
    if (dist2d(pawn.position, target) >= reach || Math.abs(pawn.position.z - target.z) >= 200) return
    if (this.index === 0) {
      this.startedAt = this.lastAt = now
      this.say('GO', 'good')
    } else {
      const split = now - this.lastAt
      this.splits.push(split)
      this.lastAt = now
      this.say(`CP ${this.index + 1}  ${split.toFixed(2)}s`, 'good')
    }
    this.player.sound('Damage.Send.Crit')
    this.index++
    if (this.index >= this.book.points.length) this.finish(now)
  }

  hud(now: number): HudModel {
    const started = this.startedAt > 0
    const best = bestOf(this.player.slot, 'route')
    return {
      title: this.name,
      big: started ? stopwatch(now - this.startedAt) : '0:00.00',
      sub: started ? `checkpoint ${this.index + 1} of ${this.book.points.length}` : 'touch START to begin',
      progress: 1 - this.index / this.book.points.length,
      chips: [
        { label: 'Last split', value: this.splits.length ? `${(this.splits[this.splits.length - 1] as number).toFixed(2)}s` : '-' },
        { label: 'Best', value: best === undefined ? '-' : stopwatch(best) },
      ],
      hint: '/stop to end',
    }
  }

  private finish(now: number): void {
    this.done = true
    const total = now - this.startedAt
    const { best, isNew } = recordBest(this.player.slot, 'route', total, false)
    this.result = {
      title: this.name,
      headline: stopwatch(total),
      lines: [
        ['Checkpoints', String(this.book.points.length)],
        ...this.splits.map((s, i) => [`Leg ${i + 1}`, `${s.toFixed(2)}s`] as [string, string]).slice(0, 8),
      ],
      best: `Session best ${stopwatch(best)}`,
      newBest: isNew,
    }
    this.player.addMetric('route.runs', 1)
  }
}
