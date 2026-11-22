/** Builds filter options with counts from a list (server-safe). */
export function facetOptions<T>(items: T[], get: (t: T) => string, label: (v: string) => string = (v) => v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, " ")) {
  const counts = new Map<string, number>();
  items.forEach((i) => counts.set(get(i), (counts.get(get(i)) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: label(value), count }));
}
