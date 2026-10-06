export interface ItemDef {
  en: string;
  de: string;
  stack: number;
  color: string;
  common?: boolean;
}

const I = (en: string, de: string, color: string, stack = 64, common = false): ItemDef => ({ en, de, color, stack, common });

export const ITEMS: ItemDef[] = [
  I('Hopper', 'Trichter', '#5b5b63', 64, true),
  I('Chest', 'Truhe', '#a0702f', 64, true),
  I('Trapped Chest', 'Redstone-Truhe', '#8d5f2a'),
  I('Barrel', 'Fass', '#8a6234'),
  I('Shulker Box', 'Schulkerkiste', '#8b5cc4', 1),
  I('Redstone Dust', 'Redstone-Staub', '#d02b2b', 64, true),
  I('Redstone Block', 'Redstone-Block', '#b3201f'),
  I('Redstone Torch', 'Redstone-Fackel', '#d63b2a'),
  I('Redstone Repeater', 'Redstone-Verstärker', '#a8a8a8'),
  I('Redstone Comparator', 'Redstone-Komparator', '#c9c2b0'),
  I('Observer', 'Beobachter', '#6b6b6b', 64, true),
  I('Piston', 'Kolben', '#a98c5b', 64, true),
  I('Sticky Piston', 'Klebriger Kolben', '#7fae4a', 64, true),
  I('Dispenser', 'Werfer', '#7a7a7a'),
  I('Dropper', 'Spender', '#7a7a7a'),
  I('Slime Block', 'Schleimblock', '#7ed957', 64, true),
  I('Honey Block', 'Honigblock', '#e8a31b'),
  I('Target Block', 'Zielblock', '#e0b0a5'),
  I('Lever', 'Hebel', '#8f8f8f'),
  I('Button', 'Knopf', '#9a9a9a'),
  I('Stone Button', 'Steinknopf', '#9a9a9a'),
  I('Pressure Plate', 'Druckplatte', '#9a9a9a'),
  I('Tripwire Hook', 'Haken', '#b5b5b5'),
  I('Lectern', 'Lesepult', '#a98c5b'),
  I('Lightning Rod', 'Blitzableiter', '#c47a4a'),
  I('Daylight Detector', 'Tageslichtsensor', '#b8a46a'),
  I('Note Block', 'Notenblock', '#7b4a2a'),
  I('Rail', 'Schiene', '#9b8b6a'),
  I('Powered Rail', 'Antriebsschiene', '#c9a227'),
  I('Detector Rail', 'Sensorschiene', '#b05050'),
  I('Activator Rail', 'Aktivierungsschiene', '#a04040'),
  I('Minecart', 'Lore', '#8c8c8c', 1),
  I('Hopper Minecart', 'Trichterlore', '#6a6a72', 1),
  I('Water Bucket', 'Wassereimer', '#3f76e4', 1, true),
  I('Lava Bucket', 'Lavaeimer', '#e86a13', 1),
  I('Bucket', 'Eimer', '#b0b0b0', 16),
  I('Bone Meal', 'Knochenmehl', '#efefe6'),
  I('Bone', 'Knochen', '#e6e3d3'),
  I('Wheat Seeds', 'Weizensamen', '#7fb04a'),
  I('Wheat', 'Weizen', '#d9b44a'),
  I('Sugar Cane', 'Zuckerrohr', '#9fd16b'),
  I('Bamboo', 'Bambus', '#7aa63a'),
  I('Kelp', 'Seetang', '#2f7d4a'),
  I('Cactus', 'Kaktus', '#3b7a35'),
  I('Pumpkin', 'Kürbis', '#d67a1b'),
  I('Melon', 'Melone', '#7bb53c'),
  I('Carrot', 'Karotte', '#e8751a'),
  I('Potato', 'Kartoffel', '#c9a45b'),
  I('Nether Wart', 'Netherwarze', '#9a2a3a'),
  I('Sweet Berries', 'Süßbeeren', '#b22d4a'),
  I('Cocoa Beans', 'Kakaobohnen', '#7b4a21'),
  I('Sapling', 'Setzling', '#4f8f3a'),
  I('Oak Sapling', 'Eichensetzling', '#4f8f3a'),
  I('Oak Log', 'Eichenstamm', '#6e5532'),
  I('Oak Planks', 'Eichenholzbretter', '#b8945a'),
  I('Stone', 'Stein', '#7d7d7d'),
  I('Cobblestone', 'Bruchstein', '#767676'),
  I('Stone Bricks', 'Steinziegel', '#7a7a7a'),
  I('Smooth Stone', 'Glatter Stein', '#9a9a9a'),
  I('Stone Slab', 'Steinstufe', '#8c8c8c'),
  I('Oak Slab', 'Eichenstufe', '#b8945a'),
  I('Stone Stairs', 'Steintreppe', '#8c8c8c'),
  I('Glass', 'Glas', '#bfe3ea', 64, true),
  I('Glass Pane', 'Glasscheibe', '#bfe3ea'),
  I('Trapdoor', 'Falltür', '#9a7a45'),
  I('Oak Trapdoor', 'Eichenfalltür', '#9a7a45'),
  I('Iron Trapdoor', 'Eisenfalltür', '#c4c4c4'),
  I('Fence', 'Zaun', '#a98c5b'),
  I('Fence Gate', 'Zauntor', '#a98c5b'),
  I('Door', 'Tür', '#a98c5b'),
  I('Sign', 'Schild', '#b8945a', 16),
  I('Ladder', 'Leiter', '#9a7a45'),
  I('Scaffolding', 'Gerüst', '#c9b36a'),
  I('Carpet', 'Teppich', '#cfcfcf'),
  I('Bed', 'Bett', '#c43d3d', 1),
  I('Iron Ingot', 'Eisenbarren', '#d8d8d8'),
  I('Iron Block', 'Eisenblock', '#d0d0d0'),
  I('Gold Ingot', 'Goldbarren', '#f1c93b'),
  I('Gold Block', 'Goldblock', '#f4d03f'),
  I('Diamond', 'Diamant', '#4ee0d6'),
  I('Netherite Ingot', 'Netherit-Barren', '#4a4045'),
  I('Obsidian', 'Obsidian', '#2a1a44'),
  I('Magma Block', 'Magmablock', '#a33a12'),
  I('Soul Sand', 'Seelensand', '#5a4638'),
  I('Soul Soil', 'Seelenerde', '#5a4638'),
  I('Netherrack', 'Netherrack', '#7a3a3a'),
  I('Nether Bricks', 'Netherziegel', '#3d1f24'),
  I('Blue Ice', 'Blaues Eis', '#6fa8ff'),
  I('Ice', 'Eis', '#9ec4ff'),
  I('Packed Ice', 'Packeis', '#8fb4f0'),
  I('Sand', 'Sand', '#e0d6a0'),
  I('Dirt', 'Erde', '#79553a'),
  I('Grass Block', 'Grasblock', '#5a9a3a'),
  I('Farmland', 'Ackerboden', '#6a4a30'),
  I('Hay Bale', 'Heuballen', '#d9b44a'),
  I('Composter', 'Komposter', '#6b8a3a'),
  I('Campfire', 'Lagerfeuer', '#d97a2a'),
  I('Cauldron', 'Kessel', '#4a4a4a'),
  I('Lava', 'Lava', '#e86a13'),
  I('Water', 'Wasser', '#3f76e4'),
  I('Sponge', 'Schwamm', '#d9c84a'),
  I('Wet Sponge', 'Nasser Schwamm', '#b5a83a'),
  I('Spawner', 'Spawner', '#2a3a55', 64),
  I('Villager Spawn Egg', 'Dorfbewohner-Spawn-Ei', '#8a6a4a'),
  I('Name Tag', 'Namensschild', '#c8c8c8'),
  I('Lead', 'Leine', '#b09060'),
  I('Boat', 'Boot', '#a98c5b', 1),
  I('Ender Pearl', 'Enderperle', '#2a8a7a', 16),
  I('Eye of Ender', 'Enderauge', '#2f9a5a'),
  I('End Rod', 'Endstab', '#f0e8ff'),
  I('Armor Stand', 'Rüstungsständer', '#a98c5b', 16),
  I('Pickaxe', 'Spitzhacke', '#9a9a9a', 1),
  I('Axe', 'Axt', '#9a9a9a', 1),
  I('Shovel', 'Schaufel', '#9a9a9a', 1),
  I('Sword', 'Schwert', '#9a9a9a', 1),
  I('Shears', 'Schere', '#c8c8c8', 1),
  I('Flint and Steel', 'Feuerzeug', '#8a8a8a', 1),
  I('Fire Charge', 'Feuerkugel', '#e07a2a'),
  I('Totem of Undying', 'Totem der Unsterblichkeit', '#d8c24a', 1),
  I('Splash Potion', 'Wurftrank', '#c070d0', 1),
  I('Golden Carrot', 'Goldene Karotte', '#f1c93b'),
  I('Lantern', 'Laterne', '#d9a02a'),
  I('Torch', 'Fackel', '#d9a02a'),
  I('Cobweb', 'Spinnennetz', '#e8e8e8'),
  I('Dragon Egg', 'Drachenei', '#2a1a3a', 1),
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9äöüß ]/g, ' ').replace(/\s+/g, ' ').trim();

const strip = (s: string) =>
  norm(s)
    .replace(/^(minecraft|mc) /, '')
    .replace(/(e?s|n)$/, (m, _a, off, str) => (str.length > 5 ? '' : m));

const INDEX = new Map<string, ItemDef>();
for (const it of ITEMS) {
  INDEX.set(norm(it.en), it);
  INDEX.set(norm(it.de), it);
  INDEX.set(strip(it.en), it);
  INDEX.set(strip(it.de), it);
}

export function findItem(name: string): ItemDef | undefined {
  return INDEX.get(norm(name)) ?? INDEX.get(strip(name));
}

export function itemColor(name: string): string {
  const it = findItem(name);
  if (it) return it.color;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 35% 42%)`;
}

export function stackSize(name: string): number {
  return findItem(name)?.stack ?? 64;
}

/** Anzeigename in der gewählten Sprache; unbekannte Namen bleiben unverändert. */
export function displayName(name: string, lang: 'de' | 'en'): string {
  const it = findItem(name);
  return it ? it[lang] : name;
}
