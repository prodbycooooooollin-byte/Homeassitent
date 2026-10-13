// The in-mode HUD: a top bar with the main readout, a stat strip, a thin
// progress line and a feed line for the latest event.
import type { Feed, HudModel } from '../modes/mode'
import { Bar, ChipView } from './parts'
import { C, toneColor } from './theme'

export interface DpsView {
  dps: number
  peak: number
  total: number
}

export function Hud(props: {
  model: HudModel
  feed?: Feed
  now: number
  accent: string
  compact: boolean
}) {
  const { model, accent, compact } = props
  const feed = props.feed && props.now - props.feed.at < 1.8 ? props.feed : undefined
  const fade = feed ? Math.max(0.15, 1 - (props.now - feed.at) / 1.8) : 0
  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'center',
        verticalAlign: 'top',
        margin: [14, 0, 0, 0],
        width: compact ? 700 : 860,
      }}
    >
      <panel
        style={{
          flow: 'right',
          width: '100%',
          background: C.panel,
          borderRadius: 6,
          padding: [10, 18, 10, 0],
        }}
      >
        <panel style={{ width: 5, height: compact ? 44 : 58, background: accent, borderRadius: 2, margin: [0, 14, 0, 0] }} />
        <panel style={{ flow: 'down', width: compact ? 230 : 270 }}>
          <label style={{ fontSize: 13, bold: true, color: accent }}>
            {model.title.toUpperCase()}
          </label>
          {model.sub ? (
            <label style={{ fontSize: compact ? 15 : 17, color: C.dim }}>{model.sub}</label>
          ) : null}
        </panel>
        <panel style={{ width: 'fill' }}>
          <label
            style={{
              width: '100%',
              fontSize: compact ? 34 : 44,
              bold: true,
              textAlign: 'center',
              color: C.text,
            }}
          >
            {model.big}
          </label>
        </panel>
        <panel style={{ flow: 'right', horizontalAlign: 'right' }}>
          {model.chips.map((chip) => (
            <ChipView chip={chip} compact={compact} />
          ))}
        </panel>
      </panel>
      {model.progress !== undefined ? <Bar value={model.progress} accent={accent} /> : null}
      {feed ? (
        <label
          style={{
            width: '100%',
            margin: [10, 0, 0, 0],
            fontSize: 26,
            bold: true,
            textAlign: 'center',
            color: toneColor(feed.tone) ?? C.text,
            opacity: fade,
          }}
        >
          {feed.text}
        </label>
      ) : null}
      {model.hint && !compact ? (
        <label style={{ width: '100%', margin: [6, 0, 0, 0], fontSize: 13, textAlign: 'center', color: C.dim }}>
          {model.hint}
        </label>
      ) : null}
    </panel>
  )
}

/** DpsBadge is the damage-per-second readout the sandbox shows in a corner. */
export function DpsBadge(props: { dps: DpsView; accent: string }) {
  const { dps, accent } = props
  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'left',
        verticalAlign: 'top',
        margin: [14, 0, 0, 16],
        padding: [10, 16],
        background: C.panel,
        borderRadius: 6,
      }}
    >
      <label style={{ fontSize: 12, bold: true, color: accent }}>DPS · LAST 5S</label>
      <label style={{ fontSize: 34, bold: true }}>{Math.round(dps.dps)}</label>
      <label style={{ fontSize: 13, color: C.dim }}>
        peak {Math.round(dps.peak)} · total {Math.round(dps.total)}
      </label>
    </panel>
  )
}
