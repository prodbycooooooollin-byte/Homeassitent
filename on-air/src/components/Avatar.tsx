/** Anfangsbuchstabe im Kreis (Zuschauer, Konto) – Farbe stabil aus dem Namen abgeleitet. */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const hue = 200 + (h % 70); // Blau- bis Violetttöne, passend zur Palette
  return (
    <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 32% 34%)` }}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
