/** Plus/Minus-Zusatz aus einer Notenbezeichnung wie "B+" oder "D−". */
export function subOf(label: string | null | undefined): "+" | "−" | undefined {
  if (!label) return undefined;
  if (label.endsWith("+")) return "+";
  if (label.endsWith("−") || label.endsWith("-")) return "−";
  return undefined;
}
