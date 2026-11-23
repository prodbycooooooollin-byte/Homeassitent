import { useEffect, useState } from "react";

/** true bei Touch-Bedienung oder schmalem Bildschirm → Panels unten statt verankerter Karten. */
export function useTouchLayout(): boolean {
  const q = "(pointer: coarse), (max-width: 767px)";
  const [v, setV] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return v;
}
