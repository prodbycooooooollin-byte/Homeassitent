import { useEffect, useMemo, useState } from "react";
import { useLive } from "@/store/live";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { resolveEnvironment, type EnvState } from "./weather";

/** Aktueller Wetter- und Sonnenzustand; aktualisiert sich mindestens minütlich. */
export function useEnvironment(): EnvState {
  const states = useLive((s) => s.states);
  const settings = useProject((s) => s.project?.settings);
  const preview = useUi((s) => s.envPreview);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const t = setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 30_000);
    return () => clearInterval(t);
  }, []);
  const weatherId = settings?.weatherEntityId ?? null;
  const w = weatherId ? states[weatherId] : Object.values(states).find((s) => s.entity_id.startsWith("weather."));
  const sun = states["sun.sun"];
  return useMemo(
    () =>
      resolveEnvironment({
        states: { ...(w ? { [w.entity_id]: w } : {}), ...(sun ? { "sun.sun": sun } : {}) },
        weatherEntityId: w?.entity_id ?? null,
        latitude: settings?.latitude ?? 51.2,
        longitude: settings?.longitude ?? 10.4,
        preview,
        now: new Date(minute * 60000),
      }),
    [w, sun, settings?.latitude, settings?.longitude, preview, minute],
  );
}
