// Option tables behind the menu buttons.
export const AIM_LENGTHS = [30, 60, 90] as const
export const BLEED = { slow: 30, normal: 45, fast: 70 } as const
export const RUSH_COUNT = [6, 10, 15] as const
export const RUSH_SIZE = { tight: 600, medium: 900, wide: 1400 } as const
export const FLOW_LINE = { easy: 300, normal: 380, hard: 480 } as const
export const DUEL_REACTION = { easy: 0.7, normal: 0.4, hard: 0.18 } as const

export type Level = 'easy' | 'normal' | 'hard'

export interface Sel {
  aim: string
  len: number
  bleed: keyof typeof BLEED
  deny: boolean
  rushCount: number
  rushSize: keyof typeof RUSH_SIZE
  flow: Level
  duel: Level
}

export const defaultSel = (): Sel => ({
  aim: 'click', len: 60, bleed: 'normal', deny: true,
  rushCount: 10, rushSize: 'medium', flow: 'normal', duel: 'normal',
})
