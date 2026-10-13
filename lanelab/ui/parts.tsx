// Small building blocks shared by the HUD, the menu and the result card.
import type { Player } from 'modlock'

import type { Chip } from '../modes/mode'
import { C, toneColor } from './theme'

export function Pill(props: {
  label: string
  active?: boolean
  accent: string
  onPress: (player: Player) => void
  width?: number
}) {
  return (
    <button
      onPress={props.onPress}
      style={{
        width: props.width,
        margin: [0, 6, 6, 0],
        padding: [7, 13],
        background: props.active ? props.accent : '#ffffff10',
        borderRadius: 14,
      }}
    >
      <label
        style={{
          fontSize: 14,
          bold: !!props.active,
          color: props.active ? '#120d0d' : C.text,
          textAlign: 'center',
        }}
      >
        {props.label}
      </label>
    </button>
  )
}

export function Action(props: {
  label: string
  accent: string
  primary?: boolean
  onPress: (player: Player) => void
}) {
  return (
    <button
      onPress={props.onPress}
      style={{
        margin: [4, 8, 0, 0],
        padding: [9, 20],
        background: props.primary ? props.accent : '#ffffff14',
        borderRadius: 4,
      }}
    >
      <label
        style={{
          fontSize: 16,
          bold: true,
          color: props.primary ? '#120d0d' : C.text,
          textAlign: 'center',
        }}
      >
        {props.label}
      </label>
    </button>
  )
}

export function ChipView(props: { chip: Chip; compact?: boolean }) {
  const { chip } = props
  return (
    <panel style={{ flow: 'down', margin: [0, 0, 0, 14], padding: [2, 0] }}>
      <label style={{ fontSize: 11, color: C.dim, textAlign: 'right', bold: true }}>
        {chip.label.toUpperCase()}
      </label>
      <label
        style={{
          fontSize: props.compact ? 16 : 20,
          bold: true,
          textAlign: 'right',
          color: toneColor(chip.tone) ?? C.text,
        }}
      >
        {chip.value}
      </label>
    </panel>
  )
}

export function Bar(props: { value: number; accent: string; height?: number }) {
  const v = Math.max(0, Math.min(1, props.value))
  return (
    <panel
      style={{
        width: '100%',
        height: props.height ?? 4,
        background: '#ffffff12',
        borderRadius: 2,
      }}
    >
      <panel
        style={{
          width: `${Math.round(v * 100)}%`,
          height: props.height ?? 4,
          background: props.accent,
          borderRadius: 2,
        }}
      />
    </panel>
  )
}
