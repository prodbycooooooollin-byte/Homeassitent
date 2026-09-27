import type { RawGameFiles } from './extract';

// Rohdateien aus dem öffentlichen SteamDB-Spiegel der Deadlock-Spieldateien.
export const RAW_BASE = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Deadlock/master/game/citadel';
export const RAW_FILES: { key: keyof RawGameFiles; path: string; local: string }[] = [
  { key: 'abilities', path: 'pak01_dir/scripts/abilities.vdata', local: 'gt_abilities.vdata' },
  { key: 'heroes', path: 'pak01_dir/scripts/heroes.vdata', local: 'gt_heroes.vdata' },
  { key: 'genericData', path: 'pak01_dir/scripts/generic_data.vdata', local: 'gt_generic_data.vdata' },
  { key: 'steamInf', path: 'steam.inf', local: 'gt_steam.inf' },
  { key: 'modNames', path: 'resource/localization/citadel_gc_mod_names/citadel_gc_mod_names_english.txt', local: 'loc_citadel_gc_mod_names_english.txt' },
  { key: 'mods', path: 'resource/localization/citadel_mods/citadel_mods_english.txt', local: 'loc_citadel_mods_english.txt' },
  { key: 'heroNames', path: 'resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt', local: 'loc_citadel_gc_hero_names_english.txt' },
  { key: 'heroesLoc', path: 'resource/localization/citadel_heroes/citadel_heroes_english.txt', local: 'loc_citadel_heroes_english.txt' },
];

export async function fetchRawGameFiles(fetchImpl: typeof fetch, retries = 3): Promise<RawGameFiles> {
  const out = {} as RawGameFiles;
  for (const f of RAW_FILES) {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchImpl(`${RAW_BASE}/${f.path}`);
        if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
        out[f.key] = await res.text();
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    if (lastErr) throw lastErr;
  }
  return out;
}
