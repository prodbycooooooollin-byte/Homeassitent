// Brücke zur Desktop-App (Electron). Im Browser nicht vorhanden.
interface Bridge { download(url: string): Promise<ArrayBuffer>; isDesktop: true }
declare global { interface Window { farmfinder?: Bridge } }

export const isDesktop = () => Boolean(window.farmfinder?.isDesktop);

/** Lädt eine Datei. Desktop: ohne CORS-Einschränkung; Browser: nur wenn der Server CORS erlaubt. */
export async function downloadFile(url: string): Promise<ArrayBuffer> {
  if (window.farmfinder) return window.farmfinder.download(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
  return res.arrayBuffer();
}
