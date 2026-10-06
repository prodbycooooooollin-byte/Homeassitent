export interface StackBreakdown {
  shulkers: number;
  stacks: number;
  rest: number;
}

/** 1 Shulkerkiste = 27 Stacks. */
export function breakdown(count: number, stackSize = 64): StackBreakdown {
  const total = Math.max(0, Math.floor(count));
  const fullStacks = Math.floor(total / stackSize);
  return {
    shulkers: Math.floor(fullStacks / 27),
    stacks: fullStacks % 27,
    rest: total % stackSize,
  };
}

export function formatBreakdown(count: number, stackSize = 64): string {
  const b = breakdown(count, stackSize);
  const parts: string[] = [];
  if (b.shulkers) parts.push(`${b.shulkers} Shulker`);
  if (b.stacks) parts.push(`${b.stacks} Stack${b.stacks === 1 ? '' : 's'}`);
  if (b.rest || parts.length === 0) parts.push(`${b.rest}`);
  return parts.join(' + ');
}
