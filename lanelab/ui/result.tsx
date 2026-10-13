// The card shown when a mode ends.
import type { Player } from 'modlock'

import type { Result } from '../modes/mode'
import { Action } from './parts'
import { C } from './theme'

export function ResultCard(props: {
  result: Result
  accent: string
  onAgain: (player: Player) => void
  onMenu: (player: Player) => void
}) {
  const { result, accent } = props
  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'center',
        verticalAlign: 'center',
        width: 520,
        padding: 24,
        background: C.panel,
        borderRadius: 10,
      }}
    >
      <label style={{ fontSize: 13, bold: true, color: accent }}>{result.title.toUpperCase()}</label>
      <label style={{ fontSize: 46, bold: true, margin: [4, 0, 2, 0] }}>{result.headline}</label>
      {result.newBest ? (
        <label style={{ fontSize: 16, bold: true, color: C.good }}>NEW SESSION BEST</label>
      ) : result.best ? (
        <label style={{ fontSize: 14, color: C.dim }}>{result.best}</label>
      ) : null}
      <panel style={{ flow: 'down', width: '100%', margin: [14, 0, 14, 0] }}>
        {result.lines.map(([k, v]) => (
          <panel style={{ flow: 'right', width: '100%', margin: [3, 0, 0, 0], padding: [5, 10], background: '#ffffff0b', borderRadius: 3 }}>
            <label style={{ width: 'fill', fontSize: 16, color: C.dim }}>{k}</label>
            <label style={{ fontSize: 16, bold: true }}>{v}</label>
          </panel>
        ))}
      </panel>
      <panel style={{ flow: 'right' }}>
        <Action label="Again" primary accent={accent} onPress={props.onAgain} />
        <Action label="Menu" accent={accent} onPress={props.onMenu} />
      </panel>
    </panel>
  )
}
