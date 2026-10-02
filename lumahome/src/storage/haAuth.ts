// Anmeldedaten für den Webseiten-Betrieb. Sie bleiben ausschließlich in
// diesem Browser: dauerhaft (localStorage) bei „Angemeldet bleiben“, sonst nur
// bis zum Schließen des Tabs (sessionStorage). Sie sind nie Teil von Projekt,
// Export oder Home-Assistant-Benutzerdaten.
const KEY = "lumahome.ha.v1";

export interface HaCredentials {
  url: string;
  token: string;
}

function read(store: Storage | undefined): HaCredentials | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as HaCredentials;
    return typeof c.url === "string" && typeof c.token === "string" ? c : null;
  } catch {
    return null;
  }
}

export function loadCredentials(): (HaCredentials & { remember: boolean }) | null {
  const local = read(typeof localStorage !== "undefined" ? localStorage : undefined);
  if (local) return { ...local, remember: true };
  const session = read(typeof sessionStorage !== "undefined" ? sessionStorage : undefined);
  return session ? { ...session, remember: false } : null;
}

export function saveCredentials(c: HaCredentials, remember: boolean) {
  clearCredentials();
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify({ url: c.url, token: c.token }));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function clearCredentials() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}
