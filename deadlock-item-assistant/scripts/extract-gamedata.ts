import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extractGameData } from '../src/gamedata/extract';

// Liest data/raw/* (siehe fetch-gamedata.ts) und schreibt data/gamedata/*.json.
const r = (f: string) => readFileSync(`data/raw/${f}`, 'utf8');
const ds = extractGameData({
  abilities: r('gt_abilities.vdata'), heroes: r('gt_heroes.vdata'), genericData: r('gt_generic_data.vdata'), steamInf: r('gt_steam.inf'),
  modNames: r('loc_citadel_gc_mod_names_english.txt'), mods: r('loc_citadel_mods_english.txt'),
  heroNames: r('loc_citadel_gc_hero_names_english.txt'), heroesLoc: r('loc_citadel_heroes_english.txt'),
}, 'github.com/SteamDatabase/GameTracking-Deadlock (Spiegel der Spieldateien)');
mkdirSync('data/gamedata', { recursive: true });
writeFileSync('data/gamedata/manifest.json', JSON.stringify(ds.manifest, null, 2));
writeFileSync('data/gamedata/items.json', JSON.stringify(ds.items, null, 1));
writeFileSync('data/gamedata/heroes.json', JSON.stringify(ds.heroes, null, 1));
console.log(`Build ${ds.manifest.build} (${ds.manifest.versionDate}): ${ds.items.length} Items, ${ds.heroes.length} Heroes`);
