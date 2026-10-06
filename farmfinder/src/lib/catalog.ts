export interface FarmType {
  id: string;
  emoji: string;
  de: string;
  en: string;
  aliases: string[];
  info: string;
}

export const FARM_TYPES: FarmType[] = [
  { id: 'bonemeal', emoji: '🦴', de: 'Knochenmehl', en: 'bone meal', aliases: ['knochenmehl', 'bonemeal', 'bone meal', 'skeleton'], info: 'Knochenmehl für Pflanzenwachstum – meist über Skelett-Spawner oder Skeleton-Farmen.' },
  { id: 'iron', emoji: '⚙️', de: 'Eisen', en: 'iron', aliases: ['eisen', 'iron', 'golem'], info: 'Eisengolem-Farmen liefern Eisenbarren in großen Mengen.' },
  { id: 'gold', emoji: '🥇', de: 'Gold', en: 'gold', aliases: ['gold', 'piglin', 'zombified'], info: 'Gold über Zombie-Piglins oder Piglin-Tauschen.' },
  { id: 'xp', emoji: '✨', de: 'XP', en: 'xp', aliases: ['xp', 'erfahrung', 'experience', 'mob grinder', 'mobfarm', 'mob farm'], info: 'Erfahrungspunkte, meist über Mobfarmen/Grinder.' },
  { id: 'wheat', emoji: '🌾', de: 'Weizen / Getreide', en: 'wheat crop', aliases: ['weizen', 'wheat', 'getreide', 'crop', 'karotte', 'kartoffel', 'carrot', 'potato'], info: 'Getreide- und Gemüsefarmen mit Villagern oder Kolben.' },
  { id: 'sugarcane', emoji: '🎋', de: 'Zuckerrohr', en: 'sugar cane', aliases: ['zuckerrohr', 'sugar cane', 'sugarcane', 'papier', 'paper', 'bambus', 'bamboo'], info: 'Zuckerrohr/Bambus – automatisch per Beobachter und Kolben.' },
  { id: 'melon', emoji: '🍉', de: 'Kürbis / Melone', en: 'melon pumpkin', aliases: ['melone', 'melon', 'kürbis', 'pumpkin'], info: 'Kürbis- und Melonenfarmen mit Beobachtern.' },
  { id: 'kelp', emoji: '🌊', de: 'Seetang', en: 'kelp', aliases: ['seetang', 'kelp', 'ofenbrennstoff'], info: 'Seetang als Brennstoff und Futter.' },
  { id: 'tree', emoji: '🌳', de: 'Holz / Bäume', en: 'tree wood', aliases: ['holz', 'baum', 'tree', 'wood', 'log'], info: 'Automatische Baumfarmen mit TNT oder Knochenmehl.' },
  { id: 'creeper', emoji: '💥', de: 'Schwarzpulver', en: 'creeper gunpowder', aliases: ['creeper', 'schwarzpulver', 'gunpowder', 'tnt'], info: 'Creeper-Farmen für Schwarzpulver (Raketen, TNT).' },
  { id: 'enderman', emoji: '🟣', de: 'Enderperlen', en: 'enderman', aliases: ['enderman', 'enderperle', 'ender pearl', 'ender'], info: 'Endermen-Farmen liefern Enderperlen und XP.' },
  { id: 'villager', emoji: '🧑‍🌾', de: 'Dorfbewohner', en: 'villager trading hall', aliases: ['villager', 'dorfbewohner', 'trading', 'handel', 'zombie curing'], info: 'Villager-Zucht und Handelshallen.' },
  { id: 'raid', emoji: '🛡️', de: 'Raid / Totems', en: 'raid', aliases: ['raid', 'totem', 'pillager', 'plünderer'], info: 'Raidfarmen für Totems, Smaragde und mehr.' },
  { id: 'honey', emoji: '🍯', de: 'Honig', en: 'honey', aliases: ['honig', 'honey', 'bee', 'biene', 'honeycomb'], info: 'Honig- und Bienenwabenfarmen.' },
  { id: 'wither', emoji: '💀', de: 'Wither-Skelett', en: 'wither skeleton', aliases: ['wither', 'wither skeleton', 'schädel', 'skull'], info: 'Wither-Skelett-Schädel & Kohle aus dem Nether.' },
  { id: 'guardian', emoji: '🐟', de: 'Wächter', en: 'guardian', aliases: ['wächter', 'guardian', 'prismarin', 'prismarine', 'sponge', 'schwamm'], info: 'Wächter/Ozeanmonument für Prismarin und Schwämme.' },
  { id: 'slime', emoji: '🟢', de: 'Schleim', en: 'slime', aliases: ['schleim', 'slime'], info: 'Schleimbälle für Kolben und Redstone.' },
  { id: 'cobble', emoji: '🪨', de: 'Stein / Generator', en: 'cobblestone generator', aliases: ['stein', 'cobble', 'cobblestone', 'generator', 'basalt', 'obsidian'], info: 'Stein-, Basalt- und Obsidiangeneratoren.' },
  { id: 'fish', emoji: '🎣', de: 'Angel / AFK', en: 'fishing afk', aliases: ['angel', 'fish', 'fishing', 'afk', 'fisch'], info: 'AFK-Angelfarmen für Verzauberungen und Schätze.' },
  { id: 'cow', emoji: '🐄', de: 'Tierfarm', en: 'animal farm', aliases: ['kuh', 'cow', 'tier', 'animal', 'chicken', 'huhn', 'schaf', 'sheep', 'pig', 'schwein'], info: 'Automatische Tierfarmen für Essen, Leder, Wolle.' },
];

export interface ResolvedQuery {
  type?: FarmType;
  ytQuery: string;
}

/** Deutsche und englische Begriffe auf eine Farm-Kategorie abbilden und einen YouTube-Suchtext bauen. */
export function resolveQuery(input: string, version: string | null): ResolvedQuery {
  const q = input.toLowerCase().replace(/[-–]?\s*farm(en)?/g, '').trim();
  const type = FARM_TYPES.find((t) => t.aliases.some((a) => q.includes(a)));
  const topic = type ? type.en : q || input;
  return {
    type,
    ytQuery: `minecraft ${topic} farm tutorial${version ? ` ${version}` : ''}`,
  };
}
