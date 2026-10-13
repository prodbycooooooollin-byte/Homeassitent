// Flow Meter: keep your speed above a line. Every second you hold it the
// multiplier climbs; a slow moment breaks the chain. Learn to chain dashes,
// slides, jumps and zip lines without losing momentum.
import type { Player } from 'modlock'

import { clock, thousands } from '../lib/format'
import { speed2d } from '../lib/math'
import { type HudModel, Mode, bestOf, recordBest } from './mode'

export interface FlowOptions {
  seconds: number
  /** line is the speed in units per second that keeps the chain. */
  line: number
  label: string
}

const countdown = 3
const grace = 1.1
const maxMult = 8

export class FlowMode extends Mode {
  readonly id = 'flow'
  readonly name = 'Flow Meter'
  private armedAt = 0
  private endsAt = 0
  private last = 0
  private score = 0
  private mult = 1
  private chain = 0
  private bestChain = 0
  private below = 0
  private top = 0
  private speed = 0
  private breaks = 0
  private timeAbove = 0

  constructor(player: Player, private readonly o: FlowOptions) {
    super(player)
  }

  start(now: number): boolean {
    const pawn = this.player.pawn()
    if (pawn === undefined || pawn.health <= 0) return false
    this.now = this.last = now
    this.armedAt = now + countdown
    this.endsAt = this.armedAt + this.o.seconds
    return true
  }

  frame(now: number): void {
    const dt = Math.min(0.1, Math.max(0, now - this.last))
    this.last = this.now = now
    const pawn = this.player.pawn()
    if (pawn === undefined || now >= this.endsAt) return this.finish()
    this.speed = speed2d(pawn.velocity)
    if (now < this.armedAt) return
    this.top = Math.max(this.top, this.speed)
    if (this.speed >= this.o.line) {
      this.below = 0
      this.chain += dt
      this.timeAbove += dt
      this.bestChain = Math.max(this.bestChain, this.chain)
      this.mult = Math.min(maxMult, this.mult + dt * 0.35)
      this.score += (this.speed / 100) * this.mult * dt * 10
    } else if (this.speed >= this.o.line * 0.8) {
      this.below += dt * 0.5
    } else {
      this.below += dt
    }
    if (this.below > grace && this.mult > 1) {
      this.say(`Chain broken at x${this.mult.toFixed(1)}`, 'bad')
      this.breaks++
      this.mult = 1
      this.chain = 0
      this.below = 0
    }
  }

  hud(now: number): HudModel {
    if (now < this.armedAt) {
      return {
        title: this.name, big: String(Math.ceil(this.armedAt - now)), sub: 'Get ready',
        chips: [{ label: 'Line', value: `${this.o.line} u/s` }],
        hint: `Stay above ${this.o.line} units/s to build a chain.`, progress: 1,
      }
    }
    const left = Math.max(0, this.endsAt - now)
    const best = bestOf(this.player.slot, `flow.${this.o.label}`)
    return {
      title: `${this.name} · ${this.o.label}`,
      big: thousands(this.score),
      sub: clock(left),
      progress: left / this.o.seconds,
      chips: [
        { label: 'Speed', value: `${Math.round(this.speed)}`, tone: this.speed >= this.o.line ? 'good' : 'bad' },
        { label: 'Multiplier', value: `x${this.mult.toFixed(1)}`, tone: this.mult >= 4 ? 'good' : undefined },
        { label: 'Chain', value: `${this.chain.toFixed(1)}s` },
        { label: 'Top', value: `${Math.round(this.top)}` },
        { label: 'Best', value: best === undefined ? '-' : thousands(best) },
      ],
      hint: '/stop to end',
    }
  }

  private finish(): void {
    if (this.done) return
    this.done = true
    const { best, isNew } = recordBest(this.player.slot, `flow.${this.o.label}`, this.score)
    this.result = {
      title: `${this.name} · ${this.o.label}`,
      headline: `${thousands(this.score)} points`,
      lines: [
        ['Top speed', `${Math.round(this.top)} u/s`],
        ['Longest chain', `${this.bestChain.toFixed(1)}s`],
        ['Time above line', `${this.timeAbove.toFixed(1)}s`],
        ['Chains broken', String(this.breaks)],
      ],
      best: `Session best ${thousands(best)}`,
      newBest: isNew,
    }
    this.player.addMetric('flow.score', Math.round(this.score))
    this.player.addMetric('flow.top', Math.round(this.top))
  }

  override stop(): void {
    this.finish()
  }
}
