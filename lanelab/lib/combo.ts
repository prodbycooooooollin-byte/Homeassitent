/** Combo scores hits: each hit inside the window raises the multiplier. */
export class Combo {
  score = 0
  hits = 0
  heads = 0
  streak = 0
  bestStreak = 0
  private last = -1e9

  constructor(
    private readonly window = 2.2,
    private readonly step = 0.1,
    private readonly cap = 10,
  ) {}

  multiplier(): number {
    return 1 + Math.min(this.streak, this.cap) * this.step
  }

  /** hit scores one hit worth base points and returns the points awarded. */
  hit(base: number, head: boolean, now: number): number {
    if (now - this.last > this.window) this.streak = 0
    this.last = now
    const points = Math.round(base * this.multiplier())
    this.score += points
    this.hits++
    if (head) this.heads++
    this.streak++
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    return points
  }

  /** drop ends the streak, as a miss or a timeout does. */
  drop(): void {
    this.streak = 0
  }

  /** decay lets a streak lapse when no hit came inside the window. */
  decay(now: number): void {
    if (this.streak > 0 && now - this.last > this.window) this.streak = 0
  }
}
