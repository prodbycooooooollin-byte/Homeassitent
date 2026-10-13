// The hub menu: one card per training mode with its options and a start button.
import type { Player } from 'modlock'

import {
  AIM_LENGTHS, BLEED, defaultSel, FLOW_LINE, RUSH_COUNT, RUSH_SIZE, type Sel,
} from '../lib/catalog'
import { SCENARIOS, scenarioById } from '../lib/scenarios'
import { Action, Pill } from './parts'
import { C } from './theme'

export interface MenuActions {
  set: <K extends keyof Sel>(player: Player, key: K, value: Sel[K]) => void
  start: (player: Player, id: string) => void
  close: (player: Player) => void
  route: (player: Player, op: 'add' | 'undo' | 'clear') => void
  tool: (player: Player, op: 'dps' | 'refill' | 'souls' | 'bot' | 'nobots' | 'clean') => void
  stop: (player: Player) => void
}

export interface MenuProps {
  sel: Sel
  accent: string
  actions: MenuActions
  routePoints: number
  dpsOn: boolean
  busy: boolean
}

function Card(props: {
  title: string
  tag: string
  blurb: string
  accent: string
  cmd: string
  children: unknown
}) {
  return (
    <panel
      style={{
        flow: 'down',
        width: 'fill',
        margin: [0, 10, 10, 0],
        padding: 14,
        background: C.card,
        borderRadius: 6,
      }}
    >
      <panel style={{ flow: 'right', width: '100%' }}>
        <label style={{ fontSize: 20, bold: true, width: 'fill' }}>{props.title}</label>
        <label style={{ fontSize: 12, bold: true, color: props.accent }}>{props.tag}</label>
      </panel>
      <label style={{ fontSize: 14, color: C.dim, margin: [4, 0, 8, 0] }}>{props.blurb}</label>
      {props.children as never}
      <label style={{ fontSize: 12, color: C.dim, margin: [6, 0, 0, 0] }}>{props.cmd}</label>
    </panel>
  )
}

export function Menu(props: MenuProps) {
  const { sel, accent, actions: a } = props
  const sc = scenarioById(sel.aim) ?? SCENARIOS[0]
  const lv = (p: Player, k: 'flow' | 'duel') => (l: 'easy' | 'normal' | 'hard') => a.set(p, k, l)
  const levels = ['easy', 'normal', 'hard'] as const
  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'center',
        verticalAlign: 'center',
        width: 1040,
        padding: 22,
        background: C.panel,
        borderRadius: 10,
      }}
    >
      <panel style={{ flow: 'right', width: '100%', margin: [0, 0, 14, 0] }}>
        <panel style={{ width: 6, height: 54, background: accent, borderRadius: 2, margin: [0, 14, 0, 0] }} />
        <panel style={{ flow: 'down', width: 'fill' }}>
          <label style={{ fontSize: 32, bold: true }}>LANELAB</label>
          <label style={{ fontSize: 14, color: C.dim }}>
            Solo training for aim, last hits, movement and duels. Type /menu to reopen.
          </label>
        </panel>
        {props.busy ? <Action label="Stop mode" accent={accent} onPress={a.stop} /> : null}
        <Action label="Close" accent={accent} onPress={a.close} />
      </panel>

      <panel style={{ flow: 'right', width: '100%' }}>
        <Card title="Aim Range" tag="SOLO" accent={accent} cmd="/aim [scenario]"
          blurb={sc?.blurb ?? ''}>
          <panel style={{ flow: 'right', width: '100%' }}>
            {SCENARIOS.map((s) => (
              <Pill label={s.name} active={s.id === sel.aim} accent={accent} onPress={(p) => a.set(p, 'aim', s.id)} />
            ))}
          </panel>
          <panel style={{ flow: 'right' }}>
            {AIM_LENGTHS.map((n) => (
              <Pill label={`${n}s`} active={n === sel.len} accent={accent} onPress={(p) => a.set(p, 'len', n)} />
            ))}
          </panel>
          <Action label="Start Aim Range" primary accent={accent} onPress={(p) => a.start(p, 'aim')} />
        </Card>

        <Card title="Last-Hit Lab" tag="SOLO" accent={accent} cmd="/lasthit"
          blurb="Troopers bleed down. Land the killing blow while they are low, deny the ally ones.">
          <panel style={{ flow: 'right' }}>
            {(Object.keys(BLEED) as Array<keyof typeof BLEED>).map((k) => (
              <Pill label={`Bleed ${k}`} active={k === sel.bleed} accent={accent} onPress={(p) => a.set(p, 'bleed', k)} />
            ))}
            <Pill label={sel.deny ? 'Denies on' : 'Denies off'} active={sel.deny} accent={accent} onPress={(p) => a.set(p, 'deny', !sel.deny)} />
          </panel>
          <Action label="Start Last-Hit Lab" primary accent={accent} onPress={(p) => a.start(p, 'lasthit')} />
        </Card>
      </panel>

      <panel style={{ flow: 'right', width: '100%' }}>
        <Card title="Checkpoint Rush" tag="MOVEMENT" accent={accent} cmd="/rush"
          blurb="Fresh floor markers around you every run. Touch them in order, fast.">
          <panel style={{ flow: 'right' }}>
            {RUSH_COUNT.map((n) => (
              <Pill label={`${n} points`} active={n === sel.rushCount} accent={accent} onPress={(p) => a.set(p, 'rushCount', n)} />
            ))}
            {(Object.keys(RUSH_SIZE) as Array<keyof typeof RUSH_SIZE>).map((k) => (
              <Pill label={k} active={k === sel.rushSize} accent={accent} onPress={(p) => a.set(p, 'rushSize', k)} />
            ))}
          </panel>
          <Action label="Start Rush" primary accent={accent} onPress={(p) => a.start(p, 'rush')} />
        </Card>

        <Card title="Flow Meter" tag="MOVEMENT" accent={accent} cmd="/flow"
          blurb="Hold your speed over the line to grow a multiplier. Chain dashes and slides.">
          <panel style={{ flow: 'right' }}>
            {levels.map((k) => (
              <Pill label={`${k} · ${FLOW_LINE[k]}`} active={k === sel.flow} accent={accent} onPress={(p) => lv(p, 'flow')(k)} />
            ))}
          </panel>
          <Action label="Start Flow Meter" primary accent={accent} onPress={(p) => a.start(p, 'flow')} />
        </Card>
      </panel>

      <panel style={{ flow: 'right', width: '100%' }}>
        <Card title="Route Studio" tag="MOVEMENT" accent={accent} cmd="/route add · undo · clear · run"
          blurb={`Build your own route where you stand, then race the clock. ${props.routePoints} checkpoint${props.routePoints === 1 ? '' : 's'} set.`}>
          <panel style={{ flow: 'right' }}>
            <Pill label="Add here" accent={accent} onPress={(p) => a.route(p, 'add')} />
            <Pill label="Undo" accent={accent} onPress={(p) => a.route(p, 'undo')} />
            <Pill label="Clear" accent={accent} onPress={(p) => a.route(p, 'clear')} />
          </panel>
          <Action label="Run route" primary accent={accent} onPress={(p) => a.start(p, 'route')} />
        </Card>

        <Card title="Duel Ladder" tag="1V1" accent={accent} cmd="/duel"
          blurb="Beat a bot with eight heroes in a row. Every win moves you up a rung.">
          <panel style={{ flow: 'right' }}>
            {levels.map((k) => (
              <Pill label={k} active={k === sel.duel} accent={accent} onPress={(p) => lv(p, 'duel')(k)} />
            ))}
          </panel>
          <Action label="Start Duel Ladder" primary accent={accent} onPress={(p) => a.start(p, 'duel')} />
        </Card>
      </panel>

      <panel style={{ flow: 'right', width: '100%' }}>
        <Card title="Sandbox" tag="TOOLS" accent={accent} cmd="/dps · /refill · /souls · /bot · /nobots"
          blurb="Free practice tools that work alongside any mode.">
          <panel style={{ flow: 'right', width: '100%' }}>
            <Pill label={props.dpsOn ? 'DPS meter on' : 'DPS meter'} active={props.dpsOn} accent={accent} onPress={(p) => a.tool(p, 'dps')} />
            <Pill label="Refill all" accent={accent} onPress={(p) => a.tool(p, 'refill')} />
            <Pill label="+50k souls" accent={accent} onPress={(p) => a.tool(p, 'souls')} />
            <Pill label="Add bot" accent={accent} onPress={(p) => a.tool(p, 'bot')} />
            <Pill label="Remove bots" accent={accent} onPress={(p) => a.tool(p, 'nobots')} />
            <Pill label="Clear troopers" accent={accent} onPress={(p) => a.tool(p, 'clean')} />
          </panel>
        </Card>
      </panel>
    </panel>
  )
}

export { defaultSel }
