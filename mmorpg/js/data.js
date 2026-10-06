'use strict';
// =====================================================================
//  AETHERMOOR – Spieldaten: Zonen, Orte, NPCs, Monster, Bosse,
//  Klassen, Fertigkeitenbäume, Gegenstände, Quests, Rezepte
// =====================================================================
const TILE = 32, MW = 160, MH = 140, MAX_LEVEL = 30;

const ZONES = [
  { id: 0, name: 'Eichenhain-Auen', lv: [1, 5], g: ['#5d9a3e', '#66a443', '#5a9139', '#6aa847'], mm: '#5d9a3e' },
  { id: 1, name: 'Grünwald', lv: [5, 10], g: ['#3e7a37', '#448339', '#3a7233', '#478840'], mm: '#2f6a2c' },
  { id: 2, name: 'Moorfall-Sumpf', lv: [10, 15], g: ['#4a5b34', '#52653a', '#465630', '#57683d'], mm: '#445a30' },
  { id: 3, name: 'Sandsturm-Wüste', lv: [10, 15], g: ['#d2b46a', '#dabd74', '#cdae62', '#dfc47c'], mm: '#d2b46a' },
  { id: 4, name: 'Eisenzinnen', lv: [15, 22], g: ['#8a929c', '#959ea8', '#838b95', '#a0a8b2'], mm: '#8a929c' },
  { id: 5, name: 'Aschenlande', lv: [15, 22], g: ['#4a2e2c', '#553431', '#432927', '#5c3835'], mm: '#4a2e2c' },
  { id: 6, name: 'Schattenfestung', lv: [22, 30], g: ['#38304a', '#40375a', '#322a42', '#463c60'], mm: '#38304a' },
];

// Siedlungen (Tile-Koordinaten). safe = Radius, in dem keine Monster angreifen
const HUBS = [
  { id: 'eichenhain', name: 'Eichenhain', x: 80, y: 120, zone: 0, lv: 1 },
  { id: 'waldwacht', name: 'Waldwacht', x: 80, y: 88, zone: 1, lv: 6 },
  { id: 'schilfend', name: 'Schilfend', x: 30, y: 60, zone: 2, lv: 11 },
  { id: 'sandtor', name: 'Oase Sandtor', x: 130, y: 60, zone: 3, lv: 11 },
  { id: 'kaldrim', name: 'Kaldrim', x: 30, y: 24, zone: 4, lv: 16 },
  { id: 'glutlager', name: 'Glutlager', x: 130, y: 24, zone: 5, lv: 16 },
  { id: 'bastion', name: 'Letzte Bastion', x: 80, y: 44, zone: 6, lv: 22 },
];
const HUB_SAFE = 11;

// Wege zwischen den Siedlungen
const ROADS = [
  ['eichenhain', 'waldwacht'], ['waldwacht', 'schilfend'], ['waldwacht', 'sandtor'],
  ['schilfend', 'kaldrim'], ['sandtor', 'glutlager'], ['waldwacht', 'bastion'],
  ['schilfend', 'bastion'], ['sandtor', 'bastion'],
];

// Sehenswürdigkeiten (Erkundungsziele)
const POIS = {
  brunnen: { name: 'Der Alte Brunnen', x: 52, y: 112 },
  hexenhain: { name: 'Der Hexenhain', x: 58, y: 70 },
  grab: { name: 'Das Verfluchte Grab', x: 112, y: 70 },
  mine: { name: 'Die Verlassene Mine', x: 12, y: 30 },
  krater: { name: 'Der Glutkrater', x: 150, y: 36 },
};

// Gebäude-Layout relativ zur Siedlungsmitte [dx, dy, breite, höhe, Typ]
const HUB_BUILDINGS = [[-9, -7, 4, 3, 0], [5, -7, 4, 3, 1], [-9, 6, 4, 3, 2], [5, 6, 4, 3, 3]];
// NPC-Standplätze relativ zur Siedlungsmitte
const NPC_SPOTS = [[-7, -3], [7, -3], [-7, 4], [7, 4], [0, -6], [0, 6]];

// ---------------------------------------------------------------------
//  NPCs
// ---------------------------------------------------------------------
const NPCS = [
  { id: 'aldric', name: 'Aldric', title: 'Dorfältester', hub: 'eichenhain', spot: 0, c: '#6a4a8a', hair: '#cfcfcf', greet: 'Willkommen in Eichenhain, Reisende(r). Dunkle Zeiten brechen an – die Schattenkrone erwacht im Norden.' },
  { id: 'hilda', name: 'Hilda', title: 'Händlerin', hub: 'eichenhain', spot: 1, c: '#a0522d', hair: '#7a4a2a', vendor: 0, greet: 'Frische Waren, faire Preise! Was darf es sein?' },
  { id: 'brogan', name: 'Brogan', title: 'Schmied', hub: 'eichenhain', spot: 2, c: '#555555', hair: '#3a2a1a', vendor: 0, craft: 'smith', greet: 'Bring mir Erz, und ich schmiede dir etwas Anständiges.' },
  { id: 'marta', name: 'Marta', title: 'Kräuterfrau', hub: 'eichenhain', spot: 3, c: '#3f8f4f', hair: '#a07040', craft: 'alchemy', greet: 'Kräuter, Tränke, Elixiere – alles aus der Natur.' },
  { id: 'torben', name: 'Torben', title: 'Torwache', hub: 'eichenhain', spot: 4, c: '#4a5a7a', hair: '#2a2a2a', greet: 'Halt die Augen offen. Draußen wimmelt es von Viechern.' },
  { id: 'pip', name: 'Pip', title: 'Neugieriges Kind', hub: 'eichenhain', spot: 5, c: '#c9a24a', hair: '#e0b050', greet: 'Hast du schon den Alten Brunnen gesehen? Da spukt es!' },

  { id: 'reinhild', name: 'Hauptmann Reinhild', title: 'Kommandantin der Waldwacht', hub: 'waldwacht', spot: 0, c: '#8a2a2a', hair: '#7a3a1a', greet: 'Die Waldwacht hält die Stellung. Aber wir brauchen jede Klinge.' },
  { id: 'osric', name: 'Osric', title: 'Händler', hub: 'waldwacht', spot: 1, c: '#7a5a2a', hair: '#555', vendor: 1, greet: 'Ausrüstung für Abenteurer – nur das Beste!' },
  { id: 'edda', name: 'Edda', title: 'Stallmeisterin', hub: 'waldwacht', spot: 2, c: '#6a4a2a', hair: '#c9a24a', mount: true, greet: 'Ein gutes Pferd ist Gold wert. Interesse an einem Reittier?' },
  { id: 'fenn', name: 'Fenn', title: 'Jäger', hub: 'waldwacht', spot: 3, c: '#3a6a3a', hair: '#4a3a2a', greet: 'Die Goblins werden dreister. Und die Spinnen erst!' },

  { id: 'gudrun', name: 'Gudrun', title: 'Moorfischerin', hub: 'schilfend', spot: 0, c: '#4a6a7a', hair: '#8a8a8a', greet: 'Das Moor holt sich alles, was nicht aufpasst.' },
  { id: 'tobias', name: 'Tobias', title: 'Sumpfhändler', hub: 'schilfend', spot: 1, c: '#6a6a3a', hair: '#3a2a1a', vendor: 2, greet: 'Handel im Sumpf? Ja, das gibt es. Sieh dich um.' },
  { id: 'zahir', name: 'Zahir', title: 'Karawanenführer', hub: 'sandtor', spot: 0, c: '#c0392b', hair: '#222', greet: 'Möge der Sand dir gnädig sein, Fremde(r).' },
  { id: 'basim', name: 'Basim', title: 'Oasenhändler', hub: 'sandtor', spot: 1, c: '#d4a017', hair: '#222', vendor: 3, greet: 'Wasser, Waffen, Wunder – alles im Angebot!' },
  { id: 'thrain', name: 'Thrain Eisenbart', title: 'Zwergenhauptmann', hub: 'kaldrim', spot: 0, c: '#7a4a2a', hair: '#c9822a', greet: 'Bei meinem Bart! Endlich jemand, der eine Axt halten kann.' },
  { id: 'borin', name: 'Borin', title: 'Zwergenschmied', hub: 'kaldrim', spot: 1, c: '#555', hair: '#aaa', vendor: 4, craft: 'smith', greet: 'Gutes Erz, gutes Eisen. Was brauchst du?' },
  { id: 'sera', name: 'Kommandantin Sera', title: 'Wächterin der Glut', hub: 'glutlager', spot: 0, c: '#c0432b', hair: '#222', greet: 'Hitze und Asche. Gewöhn dich dran.' },
  { id: 'valkor', name: 'Valkor', title: 'Glutschmied', hub: 'glutlager', spot: 1, c: '#8a3a1a', hair: '#111', vendor: 5, craft: 'smith', greet: 'Aus Glutstein schmiede ich Legenden.' },
  { id: 'ardan', name: 'Ritter Ardan', title: 'Hüter der Letzten Bastion', hub: 'bastion', spot: 0, c: '#aaaaaa', hair: '#c9a24a', greet: 'Dies ist die letzte Bastion gegen die Schatten. Du kommst gerade recht.' },
  { id: 'mirelle', name: 'Mirelle', title: 'Ausrüsterin', hub: 'bastion', spot: 1, c: '#7a5aa0', hair: '#eee', vendor: 6, craft: 'alchemy', greet: 'Wer in die Festung geht, sollte gut ausgerüstet sein.' },
];

// ---------------------------------------------------------------------
//  Monster
// ---------------------------------------------------------------------
const MOBS = {};
function M(id, name, zone, lv, kind, c1, c2, sc, hpm, dmgm, spd, o) {
  MOBS[id] = Object.assign({ id, name, zone, lv, kind, c1, c2, sc, hpm, dmgm, spd, aggro: 190, ranged: false, passive: false }, o || {});
}
// Eichenhain-Auen
M('hase', 'Feldhase', 0, [1, 2], 'beast', '#b79a74', '#efe4cf', 0.55, 0.45, 0.4, 95, { passive: true });
M('schleim', 'Wiesenschleim', 0, [1, 3], 'blob', '#6fd06f', '#c0f5c0', 0.8, 0.8, 0.8, 55);
M('wolf', 'Streunender Wolf', 0, [2, 5], 'beast', '#7c7c84', '#c5c5cd', 1, 1, 1, 120);
M('eber', 'Wildschwein', 0, [2, 5], 'beast', '#6d4a35', '#b08560', 1, 1.3, 1, 100);
M('dieb', 'Straßendieb', 0, [3, 6], 'human', '#5a4a6a', '#c9a27a', 1, 1, 1.1, 105);
// Grünwald
M('spinne', 'Waldspinne', 1, [5, 9], 'spider', '#2b2b2b', '#b03030', 1, 0.9, 1.1, 115);
M('goblin', 'Goblin-Späher', 1, [5, 9], 'human', '#5aa03c', '#3a6a28', 0.85, 1, 1, 112);
M('schamane', 'Goblin-Schamane', 1, [7, 10], 'human', '#7a3ca0', '#5aa03c', 0.9, 0.8, 1.3, 90, { ranged: true, bolt: '#b66cff' });
M('baer', 'Höhlenbär', 1, [7, 10], 'beast', '#5a3a22', '#8a6240', 1.3, 1.6, 1.2, 100);
M('wegelagerer', 'Wegelagerer', 1, [8, 10], 'human', '#6a4a2a', '#d2a679', 1, 1.1, 1.1, 108);
M('ent', 'Wilder Ent', 1, [9, 11], 'bulky', '#4a3a22', '#3a8a32', 1.5, 2, 1, 70);
// Moorfall-Sumpf
M('sumpfschleim', 'Sumpfschleim', 2, [10, 13], 'blob', '#6b8a3a', '#a9c95e', 0.95, 1, 1, 60);
M('moorleiche', 'Moorleiche', 2, [10, 14], 'human', '#6a7a5a', '#8a9a6a', 1, 1.2, 1, 70);
M('frosch', 'Riesenfrosch', 2, [11, 14], 'blob', '#4c9a4c', '#9be07a', 1, 1, 1.1, 115);
M('irrlicht', 'Irrlicht', 2, [12, 15], 'ghost', '#6fd0ff', '#e8ffff', 0.8, 0.7, 1.3, 100, { ranged: true, bolt: '#7fe0ff' });
M('echse', 'Sumpfechse', 2, [12, 15], 'beast', '#4a6a3a', '#8aa05a', 1.2, 1.4, 1.2, 115);
M('hexenschuelerin', 'Moorhexen-Schülerin', 2, [13, 15], 'human', '#3a5a3a', '#d2b08a', 1, 0.8, 1.4, 95, { ranged: true, bolt: '#7aff7a' });
// Sandsturm-Wüste
M('skorpion', 'Wüstenskorpion', 3, [10, 13], 'spider', '#c98a2a', '#7a4a10', 1, 1, 1.2, 120);
M('geier', 'Sandgeier', 3, [10, 14], 'flyer', '#8a6a4a', '#d8c09a', 1, 0.8, 1, 135);
M('mumie', 'Wandelnde Mumie', 3, [12, 15], 'human', '#d8d0b0', '#a89c78', 1.05, 1.4, 1.1, 75);
M('wuestenraeuber', 'Wüstenräuber', 3, [11, 14], 'human', '#a0623a', '#d9a679', 1, 1.1, 1.1, 112);
M('sandelementar', 'Sandelementar', 3, [13, 15], 'bulky', '#c9a24a', '#ecd078', 1.4, 1.8, 1.2, 80);
M('dschinn', 'Verfluchter Dschinn', 3, [14, 15], 'ghost', '#4ab0d0', '#c0f4ff', 1, 0.9, 1.4, 95, { ranged: true, bolt: '#5fd0ff' });
// Eisenzinnen
M('eiswolf', 'Eiswolf', 4, [15, 19], 'beast', '#b8d4e8', '#f0f9ff', 1.1, 1.2, 1.2, 130);
M('bergtroll', 'Bergtroll', 4, [16, 20], 'bulky', '#6a7a6a', '#8a9a7a', 1.7, 2.2, 1.3, 78);
M('schneegeist', 'Schneegeist', 4, [17, 21], 'ghost', '#cfe9ff', '#ffffff', 0.9, 0.8, 1.4, 100, { ranged: true, bolt: '#cfefff' });
M('zwergenabtruennig', 'Zwergen-Abtrünniger', 4, [16, 21], 'human', '#7a5a3a', '#c9a27a', 0.95, 1.3, 1.3, 100);
M('steingolem', 'Steingolem', 4, [19, 22], 'bulky', '#7a7a82', '#a8a8b2', 1.8, 2.8, 1.2, 65);
M('greif', 'Gebirgsgreif', 4, [18, 22], 'flyer', '#a07a3a', '#e8d8b0', 1.2, 1.2, 1.3, 140);
// Aschenlande
M('glutimp', 'Glutimp', 5, [15, 19], 'flyer', '#d83a1a', '#ffb040', 0.8, 0.7, 1.2, 125, { ranged: true, bolt: '#ff7a2a' });
M('lavaelementar', 'Lavaelementar', 5, [17, 21], 'bulky', '#e0541a', '#ffc040', 1.5, 2, 1.4, 80);
M('aschenwolf', 'Aschenwolf', 5, [16, 20], 'beast', '#3a2a2a', '#e0541a', 1.1, 1.3, 1.3, 135);
M('feuerkultist', 'Feuerkultist', 5, [17, 21], 'human', '#8a1a1a', '#d9a679', 1, 0.9, 1.5, 100, { ranged: true, bolt: '#ff5a1a' });
M('drachenwelpe', 'Drachenwelpe', 5, [19, 22], 'flyer', '#a02a1a', '#e8803a', 1.3, 1.6, 1.3, 120);
M('obsidiangolem', 'Obsidiangolem', 5, [20, 22], 'bulky', '#22222e', '#7a3a9a', 1.8, 3, 1.3, 65);
// Schattenfestung
M('skelett', 'Skelettkrieger', 6, [22, 27], 'human', '#d8d8c8', '#8a8a7a', 1, 1.3, 1.3, 105);
M('skelettschuetze', 'Skelettschütze', 6, [22, 28], 'human', '#cfcfbf', '#8a8a7a', 1, 0.9, 1.4, 100, { ranged: true, bolt: '#e8e8d0' });
M('geisterritter', 'Geisterritter', 6, [24, 29], 'ghost', '#6a7aa0', '#b0bde8', 1.1, 1.5, 1.5, 95);
M('todesbeschwoerer', 'Todesbeschwörer', 6, [25, 30], 'human', '#2a1a3a', '#9a50d0', 1, 1, 1.7, 90, { ranged: true, bolt: '#a050ff' });
M('schattenhund', 'Schattenhund', 6, [24, 29], 'beast', '#1a1a2a', '#7a3ad0', 1.2, 1.4, 1.5, 140);
M('verfluchter', 'Verfluchter Ritter', 6, [26, 30], 'bulky', '#3a3a5a', '#aab0d0', 1.3, 2.2, 1.6, 90);

// Reihenfolge, in der Monster in einer Zone gespawnt werden (Gewichte)
const ZONE_SPAWNS = {
  0: [['hase', 1], ['schleim', 3], ['wolf', 3], ['eber', 3], ['dieb', 2]],
  1: [['spinne', 3], ['goblin', 3], ['schamane', 2], ['baer', 2], ['wegelagerer', 2], ['ent', 1]],
  2: [['sumpfschleim', 3], ['moorleiche', 3], ['frosch', 3], ['irrlicht', 2], ['echse', 2], ['hexenschuelerin', 2]],
  3: [['skorpion', 3], ['geier', 3], ['mumie', 2], ['wuestenraeuber', 3], ['sandelementar', 2], ['dschinn', 1]],
  4: [['eiswolf', 3], ['bergtroll', 2], ['schneegeist', 2], ['zwergenabtruennig', 3], ['steingolem', 1], ['greif', 2]],
  5: [['glutimp', 3], ['lavaelementar', 2], ['aschenwolf', 3], ['feuerkultist', 3], ['drachenwelpe', 2], ['obsidiangolem', 1]],
  6: [['skelett', 4], ['skelettschuetze', 3], ['geisterritter', 2], ['todesbeschwoerer', 2], ['schattenhund', 2], ['verfluchter', 2]],
};

// ---------------------------------------------------------------------
//  Bosse  (abilities: slam / nova / summon / bolt / dot / enrage / heal)
// ---------------------------------------------------------------------
function B(id, name, title, zone, lv, x, y, kind, c1, c2, sc, hpm, dmgm, abil, uniques, o) {
  MOBS[id] = Object.assign({
    id, name, title, zone, lv: [lv, lv], kind, c1, c2, sc, hpm, dmgm, spd: 105, aggro: 260, ranged: false, passive: false,
    boss: true, x, y, abil, uniques,
  }, o || {});
}
const BOSS_LIST = [];
B('grunthar', 'Grunthar der Wildeber', 'Schrecken der Felder', 0, 4, 112, 112, 'beast', '#4a3022', '#c9a27a', 1.9, 11, 1.0,
  [{ t: 'slam', cd: 7, r: 70, m: 1.6 }, { t: 'summon', cd: 22, mob: 'eber', n: 2 }, { t: 'enrage', at: 0.3 }],
  [['Hauer des Grunthar', 'weapon', '🦷'], ['Eberleder-Weste', 'chest', '🦺']]);
B('vilara', 'Vilara die Spinnenkönigin', 'Mutter der Netze', 1, 8, 40, 84, 'spider', '#1a1a1a', '#c02080', 2.3, 12, 1.0,
  [{ t: 'dot', cd: 12, m: 2.4 }, { t: 'summon', cd: 20, mob: 'spinne', n: 3 }, { t: 'slam', cd: 8, r: 80, m: 1.4 }, { t: 'enrage', at: 0.25 }],
  [['Giftzahn der Vilara', 'weapon', '🕷️'], ['Netzgespinst-Kapuze', 'head', '🪖'], ['Spinnenseiden-Beinlinge', 'legs', '👖']]);
B('karg', 'Karg der Räuberhauptmann', 'König der Landstraße', 1, 10, 120, 82, 'human', '#7a2a2a', '#d2a679', 1.4, 11, 1.0,
  [{ t: 'slam', cd: 7, r: 80, m: 1.6 }, { t: 'summon', cd: 18, mob: 'wegelagerer', n: 2 }, { t: 'bolt', cd: 6, m: 1.0 }, { t: 'enrage', at: 0.3 }],
  [['Kargs Krummsäbel', 'weapon', '⚔️'], ['Räuberkönigs-Ring', 'ring', '💍'], ['Hauptmanns-Stiefel', 'feet', '🥾']], { ranged: false });
B('morgraine', 'Morgraine die Moorhexe', 'Flüstern im Nebel', 2, 13, 60, 66, 'human', '#2a5a3a', '#cfe0b0', 1.4, 12, 1.0,
  [{ t: 'bolt', cd: 4, m: 1.1 }, { t: 'dot', cd: 11, m: 2.6 }, { t: 'nova', cd: 14, r: 150, m: 1.8 }, { t: 'summon', cd: 25, mob: 'irrlicht', n: 2 }, { t: 'enrage', at: 0.25 }],
  [['Hexenstab der Morgraine', 'weapon', '🪄'], ['Moorhexen-Amulett', 'neck', '📿'], ['Nebelschleier', 'head', '🧙']], { ranged: true, bolt: '#7aff7a' });
B('gorbash', 'Gorbash der Faulige', 'Wanderndes Verderben', 2, 15, 10, 70, 'bulky', '#5a6a3a', '#9ab05a', 2.1, 11, 1.0,
  [{ t: 'slam', cd: 6, r: 95, m: 1.8 }, { t: 'nova', cd: 15, r: 170, m: 1.6 }, { t: 'dot', cd: 14, m: 2.2 }, { t: 'enrage', at: 0.3 }],
  [['Faulholz-Keule', 'weapon', '🏏'], ['Sumpfpanzer', 'chest', '🦺'], ['Trollblut-Ring', 'ring', '💍']]);
B('khetzar', "Khet'zar der Skarabäenkönig", 'Herr der Gräber', 3, 14, 98, 66, 'spider', '#2a6a5a', '#e8c040', 2.2, 11, 1.0,
  [{ t: 'slam', cd: 7, r: 85, m: 1.7 }, { t: 'summon', cd: 18, mob: 'skorpion', n: 3 }, { t: 'dot', cd: 13, m: 2.2 }, { t: 'enrage', at: 0.25 }],
  [['Skarabäen-Sichel', 'weapon', '🗡️'], ['Pharaonenkragen', 'neck', '📿'], ['Goldene Grabmaske', 'head', '🪖']]);
B('duenenschreck', 'Dünenschreck', 'Der Sandwurm', 3, 16, 150, 52, 'worm', '#b08a4a', '#e8d090', 2.6, 12, 1.1,
  [{ t: 'nova', cd: 10, r: 180, m: 1.8 }, { t: 'slam', cd: 6, r: 90, m: 1.8 }, { t: 'summon', cd: 22, mob: 'sandelementar', n: 2 }, { t: 'enrage', at: 0.3 }],
  [['Wurmzahn-Speer', 'weapon', '🔱'], ['Sandschuppen-Harnisch', 'chest', '🦺'], ['Dünenläufer-Stiefel', 'feet', '🥾']]);
B('jorrvik', 'Jorrvik der Frostriese', 'Fürst des Eises', 4, 19, 50, 8, 'bulky', '#9ac0e0', '#e8f6ff', 2.5, 12, 1.1,
  [{ t: 'slam', cd: 6, r: 100, m: 1.8, slow: true }, { t: 'nova', cd: 14, r: 190, m: 1.9 }, { t: 'summon', cd: 22, mob: 'eiswolf', n: 3 }, { t: 'enrage', at: 0.25 }],
  [['Frostriesen-Hammer', 'weapon', '🔨'], ['Eiszapfen-Krone', 'head', '👑'], ['Gletscher-Beinschienen', 'legs', '👖']]);
B('waechter', 'Der Erwachte Wächter', 'Uralter Steinkoloss', 4, 21, 8, 42, 'bulky', '#6a6a76', '#c0a0ff', 2.7, 13, 1.2,
  [{ t: 'slam', cd: 6, r: 105, m: 2.0 }, { t: 'nova', cd: 12, r: 200, m: 2.0 }, { t: 'bolt', cd: 5, m: 1.2 }, { t: 'enrage', at: 0.2 }],
  [['Runenherz des Wächters', 'neck', '📿'], ['Granit-Harnisch', 'chest', '🦺'], ['Wächterfaust', 'weapon', '🔨']], { ranged: false });
B('ignaroth', 'Ignaroth der Glutdrache', 'Flammender Tod', 5, 22, 150, 8, 'flyer', '#b02a1a', '#ffc040', 2.8, 13, 1.2,
  [{ t: 'nova', cd: 10, r: 200, m: 2.0 }, { t: 'slam', cd: 6, r: 95, m: 1.9 }, { t: 'bolt', cd: 4, m: 1.2 }, { t: 'summon', cd: 25, mob: 'drachenwelpe', n: 2 }, { t: 'enrage', at: 0.25 }],
  [['Drachenzahn-Klinge', 'weapon', '🗡️'], ['Drachenschuppen-Harnisch', 'chest', '🦺'], ['Feuerherz-Amulett', 'neck', '📿']], { ranged: true, bolt: '#ff6a1a' });
B('malakor', 'Aschenfürst Malakor', 'Herold der Schatten', 5, 24, 110, 12, 'human', '#4a1a2a', '#ff6a2a', 1.8, 13, 1.2,
  [{ t: 'bolt', cd: 4, m: 1.3 }, { t: 'slam', cd: 7, r: 100, m: 2.0 }, { t: 'dot', cd: 12, m: 2.6 }, { t: 'summon', cd: 22, mob: 'feuerkultist', n: 3 }, { t: 'enrage', at: 0.25 }],
  [['Aschenzepter', 'weapon', '🔱'], ['Krone der Asche', 'head', '👑'], ['Malakors Siegelring', 'ring', '💍']], { ranged: true, bolt: '#ff4a2a' });
B('mortharion', 'Mortharion der Untote König', 'Herrscher der Gebeine', 6, 28, 80, 20, 'human', '#c8c8b8', '#7a50c0', 2.0, 13, 1.3,
  [{ t: 'slam', cd: 6, r: 110, m: 2.1 }, { t: 'nova', cd: 13, r: 210, m: 2.1 }, { t: 'summon', cd: 18, mob: 'skelett', n: 4 }, { t: 'dot', cd: 14, m: 2.6 }, { t: 'enrage', at: 0.25 }],
  [['Totenklinge Mortharions', 'weapon', '⚔️'], ['Knochenkrone', 'head', '👑'], ['Leichentuch-Harnisch', 'chest', '🦺'], ['Siegel der Verdammnis', 'ring', '💍']]);
B('nyxthal', "Nyx'thal der Verhüllte", 'Träger der Schattenkrone', 6, 30, 80, 6, 'ghost', '#20142f', '#b060ff', 2.6, 15, 1.35,
  [{ t: 'bolt', cd: 3.5, m: 1.4 }, { t: 'slam', cd: 6, r: 110, m: 2.2 }, { t: 'nova', cd: 12, r: 230, m: 2.3 }, { t: 'summon', cd: 16, mob: 'schattenhund', n: 3 }, { t: 'dot', cd: 13, m: 3 }, { t: 'heal', at: 0.5 }, { t: 'enrage', at: 0.2 }],
  [['Schattenkrone', 'head', '👑'], ['Klinge der Ewigen Nacht', 'weapon', '🗡️'], ['Mantel der Leere', 'chest', '🦺'], ["Nyx'thals Auge", 'neck', '👁️']], { ranged: true, bolt: '#c070ff' });

for (const k in MOBS) if (MOBS[k].boss) BOSS_LIST.push(k);

// ---------------------------------------------------------------------
//  Gegenstände
// ---------------------------------------------------------------------
const SLOTS = { weapon: 'Waffe', head: 'Kopf', chest: 'Brust', legs: 'Beine', feet: 'Füße', ring: 'Ring', neck: 'Amulett' };
const SLOT_ORDER = ['head', 'neck', 'chest', 'legs', 'feet', 'ring', 'weapon'];
const RARITY = [
  { n: 'Gewöhnlich', c: '#d0d0d0', m: 1, sell: 1 },
  { n: 'Ungewöhnlich', c: '#4fd34f', m: 1.3, sell: 2.2 },
  { n: 'Selten', c: '#4a9bff', m: 1.7, sell: 4.5 },
  { n: 'Episch', c: '#b25cff', m: 2.2, sell: 9 },
  { n: 'Legendär', c: '#ff9a1f', m: 3, sell: 20 },
];
const WEAPON_TYPES = [
  { n: 'Schwert', ic: '🗡️', stat: 'str', adj: ['Rostiges', 'Stählernes', 'Scharfes', 'Glänzendes', 'Meisterliches'] },
  { n: 'Axt', ic: '🪓', stat: 'str', adj: ['Stumpfe', 'Eiserne', 'Schwere', 'Blutdürstige', 'Titanische'] },
  { n: 'Bogen', ic: '🏹', stat: 'dex', adj: ['Einfacher', 'Eibenholz-', 'Verstärkter', 'Elfen-', 'Sturm-'] },
  { n: 'Dolch', ic: '🔪', stat: 'dex', adj: ['Stumpfer', 'Spitzer', 'Giftiger', 'Schatten-', 'Mörder-'] },
  { n: 'Stab', ic: '🪄', stat: 'int', adj: ['Knorriger', 'Eichen-', 'Runen-', 'Arkaner', 'Erzmagier-'] },
  { n: 'Zepter', ic: '🔱', stat: 'int', adj: ['Schlichtes', 'Silbernes', 'Geweihtes', 'Heiliges', 'Göttliches'] },
];
const ARMOR_TYPES = {
  head: { n: ['Lederkappe', 'Eisenhelm', 'Kapuze', 'Kronreif'], ic: '🪖', arm: 0.7 },
  chest: { n: ['Wams', 'Harnisch', 'Robe', 'Kettenhemd'], ic: '🦺', arm: 1.3 },
  legs: { n: ['Beinlinge', 'Beinschienen', 'Hose', 'Kilt'], ic: '👖', arm: 1 },
  feet: { n: ['Stiefel', 'Eisenschuhe', 'Sandalen', 'Treter'], ic: '🥾', arm: 0.5 },
  ring: { n: ['Ring', 'Siegelring', 'Reif', 'Band'], ic: '💍', arm: 0 },
  neck: { n: ['Amulett', 'Kette', 'Talisman', 'Anhänger'], ic: '📿', arm: 0 },
};
const STAT_NAMES = { str: 'Stärke', dex: 'Geschick', int: 'Intellekt', vit: 'Ausdauer', armor: 'Rüstung', crit: 'Krit. Chance' };
const SUFFIX = { str: 'des Bären', dex: 'des Falken', int: 'des Weisen', vit: 'des Titanen' };

// Verbrauchsgüter und Materialien
const BASEITEMS = {
  hp1: { name: 'Kleiner Heiltrank', ic: '🧪', type: 'consumable', stack: 20, price: 12, hp: 0.3, lv: 1, c: '#e04a4a' },
  hp2: { name: 'Heiltrank', ic: '🧪', type: 'consumable', stack: 20, price: 45, hp: 0.45, lv: 8, c: '#e04a4a' },
  hp3: { name: 'Großer Heiltrank', ic: '🧪', type: 'consumable', stack: 20, price: 130, hp: 0.6, lv: 16, c: '#e04a4a' },
  hp4: { name: 'Mächtiger Heiltrank', ic: '🧪', type: 'consumable', stack: 20, price: 320, hp: 0.75, lv: 24, c: '#e04a4a' },
  mp1: { name: 'Kleiner Manatrank', ic: '🫙', type: 'consumable', stack: 20, price: 12, mp: 0.3, lv: 1, c: '#4a7ae0' },
  mp2: { name: 'Manatrank', ic: '🫙', type: 'consumable', stack: 20, price: 45, mp: 0.45, lv: 8, c: '#4a7ae0' },
  mp3: { name: 'Großer Manatrank', ic: '🫙', type: 'consumable', stack: 20, price: 130, mp: 0.6, lv: 16, c: '#4a7ae0' },
  mp4: { name: 'Mächtiger Manatrank', ic: '🫙', type: 'consumable', stack: 20, price: 320, mp: 0.75, lv: 24, c: '#4a7ae0' },
  elixier: { name: 'Elixier der Macht', ic: '⚗️', type: 'consumable', stack: 10, price: 90, buff: { dur: 600, apPct: 15, critAdd: 3 }, lv: 5, c: '#c070ff', desc: '+15% Angriffskraft, +3% Krit für 10 Min.' },
  friedwurz: { name: 'Friedwurz', ic: '🌿', type: 'material', stack: 50, price: 2, c: '#7ad07a' },
  silberblatt: { name: 'Silberblatt', ic: '🍃', type: 'material', stack: 50, price: 4, c: '#b0d8c0' },
  sumpfmoos: { name: 'Sumpfmoos', ic: '🍀', type: 'material', stack: 50, price: 7, c: '#7a9a4a' },
  sandkristall: { name: 'Sandkristall', ic: '💎', type: 'material', stack: 50, price: 9, c: '#e8c870' },
  eisenerz: { name: 'Eisenerz', ic: '🪨', type: 'material', stack: 50, price: 12, c: '#a0a8b8' },
  glutstein: { name: 'Glutstein', ic: '🔥', type: 'material', stack: 50, price: 16, c: '#ff7a2a' },
};

// Sammelpunkte
const NODE_TYPES = {
  friedwurz: { name: 'Friedwurz', ic: '🌿', zone: 0, col: '#7ad07a', kind: 'herb' },
  silberblatt: { name: 'Silberblatt', ic: '🍃', zone: 1, col: '#b0d8c0', kind: 'herb' },
  sumpfmoos: { name: 'Sumpfmoos', ic: '🍀', zone: 2, col: '#7a9a4a', kind: 'herb' },
  sandkristall: { name: 'Sandkristall', ic: '💎', zone: 3, col: '#e8c870', kind: 'ore' },
  eisenerz: { name: 'Eisenerz-Ader', ic: '🪨', zone: 4, col: '#a0a8b8', kind: 'ore' },
  glutstein: { name: 'Glutstein-Ader', ic: '🔥', zone: 5, col: '#ff7a2a', kind: 'ore' },
};

// Handwerksrezepte
const RECIPES = [
  { id: 'r_hp1', craft: 'alchemy', name: 'Kleiner Heiltrank', out: 'hp1', n: 2, in: { friedwurz: 2 } },
  { id: 'r_mp1', craft: 'alchemy', name: 'Kleiner Manatrank', out: 'mp1', n: 2, in: { friedwurz: 2 } },
  { id: 'r_hp2', craft: 'alchemy', name: 'Heiltrank', out: 'hp2', n: 2, in: { silberblatt: 3 } },
  { id: 'r_mp2', craft: 'alchemy', name: 'Manatrank', out: 'mp2', n: 2, in: { silberblatt: 3 } },
  { id: 'r_hp3', craft: 'alchemy', name: 'Großer Heiltrank', out: 'hp3', n: 2, in: { sumpfmoos: 3, sandkristall: 1 } },
  { id: 'r_mp3', craft: 'alchemy', name: 'Großer Manatrank', out: 'mp3', n: 2, in: { sumpfmoos: 3, sandkristall: 1 } },
  { id: 'r_hp4', craft: 'alchemy', name: 'Mächtiger Heiltrank', out: 'hp4', n: 2, in: { glutstein: 2, eisenerz: 2 } },
  { id: 'r_el', craft: 'alchemy', name: 'Elixier der Macht', out: 'elixier', n: 1, in: { sandkristall: 3, silberblatt: 2 } },
  { id: 'r_w1', craft: 'smith', name: 'Geschmiedete Waffe', gen: { slot: 'weapon', rar: 2 }, gold: 60, in: { eisenerz: 6 } },
  { id: 'r_c1', craft: 'smith', name: 'Geschmiedeter Harnisch', gen: { slot: 'chest', rar: 2 }, gold: 60, in: { eisenerz: 8 } },
  { id: 'r_l1', craft: 'smith', name: 'Geschmiedete Beinschienen', gen: { slot: 'legs', rar: 2 }, gold: 50, in: { eisenerz: 6 } },
  { id: 'r_w2', craft: 'smith', name: 'Glutgeschmiedete Klinge', gen: { slot: 'weapon', rar: 3 }, gold: 200, in: { glutstein: 10, eisenerz: 5 } },
  { id: 'r_c2', craft: 'smith', name: 'Glutgeschmiedeter Harnisch', gen: { slot: 'chest', rar: 3 }, gold: 200, in: { glutstein: 10, eisenerz: 6 } },
];

// ---------------------------------------------------------------------
//  Klassen
// ---------------------------------------------------------------------
const CLASSES = {
  krieger: {
    name: 'Krieger', ic: '⚔️', col: '#c8c8d8', res: 'Ausdauer', resCol: '#d9a02b', primary: 'str', ranged: false, range: 56,
    apMul: 1.12, armorMul: 1.3, base: { str: 10, dex: 5, int: 2, vit: 9 }, grow: { str: 2.3, dex: 0.8, int: 0.3, vit: 2.1 }, weapon: 'Schwert',
    desc: 'Unerschütterlicher Frontkämpfer in schwerer Rüstung. Teilt mächtige Hiebe aus und steckt noch mehr ein.',
  },
  magier: {
    name: 'Magier', ic: '🔮', col: '#9a7aff', res: 'Mana', resCol: '#3a7aff', primary: 'int', ranged: true, range: 270,
    apMul: 0.78, armorMul: 0.8, base: { str: 2, dex: 4, int: 11, vit: 5 }, grow: { str: 0.3, dex: 0.7, int: 2.3, vit: 1.5 }, weapon: 'Stab',
    desc: 'Meister der Elemente. Entfesselt Feuer, Frost und arkane Macht – verheerend, aber zerbrechlich.',
  },
  waldlaeufer: {
    name: 'Waldläufer', ic: '🏹', col: '#6ad06a', res: 'Energie', resCol: '#e8e040', primary: 'dex', ranged: true, range: 310,
    apMul: 0.9, armorMul: 1, base: { str: 4, dex: 11, int: 3, vit: 7 }, grow: { str: 0.7, dex: 2.4, int: 0.4, vit: 1.5 }, weapon: 'Bogen',
    desc: 'Treffsicherer Jäger der Wildnis. Bekämpft Feinde aus der Ferne und überlebt dank Naturkunde.',
  },
  priester: {
    name: 'Priester', ic: '✨', col: '#f8f0b0', res: 'Mana', resCol: '#3a7aff', primary: 'int', ranged: true, range: 260,
    apMul: 0.85, armorMul: 0.9, base: { str: 3, dex: 3, int: 10, vit: 7 }, grow: { str: 0.4, dex: 0.5, int: 2.2, vit: 1.6 }, weapon: 'Zepter',
    desc: 'Diener des Lichts. Heilt Wunden, schützt sich selbst und schmettert Feinde mit heiliger oder dunkler Macht nieder.',
  },
};

// ---------------------------------------------------------------------
//  Fertigkeiten  (3 Pfade × 5 Stufen je Klasse)
// ---------------------------------------------------------------------
const SKILLS = {};
const TREES = {};
const TIER_LV = [1, 4, 9, 14, 20];
const BRANCH_NAMES = {
  krieger: ['Waffenmeister', 'Bollwerk', 'Kriegsführung'],
  magier: ['Feuer', 'Frost', 'Arkane Künste'],
  waldlaeufer: ['Treffsicherheit', 'Überleben', 'Wildnis'],
  priester: ['Licht', 'Heilung', 'Schatten'],
};
function SK(cls, br, tier, id, name, ic, o) {
  const sk = Object.assign({ id, name, ic, cls, br, tier, max: 3, cd: 0, cost: 0, type: 'melee', pow: [1, 1, 1] }, o);
  if (tier === 4 && !o.max) sk.max = 1;
  sk.lv = TIER_LV[tier];
  TREES[cls] = TREES[cls] || [[], [], []];
  TREES[cls][br][tier] = sk;
  sk.parent = tier > 0 ? TREES[cls][br][tier - 1].id : null;
  SKILLS[id] = sk;
}
// --- Krieger
SK('krieger', 0, 0, 'heldenstoss', 'Heldenstoß', '⚔️', { type: 'melee', cd: 3, cost: 12, pow: [1.6, 1.9, 2.2] });
SK('krieger', 0, 1, 'wirbelwind', 'Wirbelwind', '🌪️', { type: 'nova', cd: 8, cost: 25, r: 95, pow: [1.1, 1.3, 1.5] });
SK('krieger', 0, 2, 'klaffende', 'Klaffende Wunde', '🩸', { type: 'melee', cd: 10, cost: 20, pow: [0.8, 0.9, 1], dot: { pow: [1.2, 1.7, 2.2], dur: 8 } });
SK('krieger', 0, 3, 'berserker', 'Berserkerwut', '😡', { type: 'buff', cd: 45, cost: 20, dur: 12, mods: { apPct: [30, 40, 50], armorPct: [-20, -20, -20] } });
SK('krieger', 0, 4, 'zerschmettern', 'Zerschmettern', '💥', { type: 'melee', cd: 20, cost: 40, pow: [5], stun: [1.5], cleave: 90 });
SK('krieger', 1, 0, 'schildhieb', 'Schildhieb', '🛡️', { type: 'melee', cd: 14, cost: 15, pow: [0.8, 0.9, 1], stun: [1.5, 2, 2.5] });
SK('krieger', 1, 1, 'eiserne_haut', 'Eiserne Haut', '🔩', { type: 'passive', mods: { armorPct: [8, 16, 24] } });
SK('krieger', 1, 2, 'trotz', 'Trotz', '🧱', { type: 'buff', cd: 30, cost: 15, dur: 10, mods: { dmgRed: [25, 35, 45] } });
SK('krieger', 1, 3, 'kampfschrei', 'Kampfschrei', '📢', { type: 'nova', cd: 25, cost: 20, r: 150, pow: [0.5, 0.6, 0.7], slow: { pct: 50, dur: [4, 5, 6] } });
SK('krieger', 1, 4, 'letztes_gefecht', 'Letztes Gefecht', '✨', { type: 'buff', cd: 120, cost: 30, dur: 8, shield: [8], heal: [30] });
SK('krieger', 2, 0, 'sturmangriff', 'Sturmangriff', '🏇', { type: 'dash', cd: 15, cost: 10, pow: [1, 1.2, 1.4], stun: [1, 1, 1.5] });
SK('krieger', 2, 1, 'zaehigkeit', 'Zähigkeit', '❤️', { type: 'passive', mods: { hpPct: [4, 8, 12] } });
SK('krieger', 2, 2, 'eilmarsch', 'Eilmarsch', '💨', { type: 'buff', cd: 25, cost: 10, dur: 8, mods: { spdPct: [30, 40, 50] } });
SK('krieger', 2, 3, 'blutrausch', 'Blutrausch', '🧛', { type: 'passive', mods: { lifesteal: [3, 6, 9] } });
SK('krieger', 2, 4, 'titanenschlag', 'Titanenschlag', '🔨', { type: 'nova', cd: 45, cost: 40, r: 170, pow: [3.2], stun: [2] });
// --- Magier
SK('magier', 0, 0, 'feuerball', 'Feuerball', '🔥', { type: 'proj', cd: 2.5, cost: 14, pow: [1.5, 1.8, 2.1], col: '#ff7a1a', dot: { pow: [0.6, 0.8, 1], dur: 4 } });
SK('magier', 0, 1, 'flammennova', 'Flammennova', '🌋', { type: 'nova', cd: 10, cost: 28, r: 120, pow: [1.4, 1.7, 2] });
SK('magier', 0, 2, 'meteor', 'Meteor', '☄️', { type: 'gaoe', cd: 22, cost: 45, r: 130, pow: [3, 3.6, 4.2] });
SK('magier', 0, 3, 'zuendung', 'Zündung', '💥', { type: 'passive', mods: { critAdd: [3, 6, 9] } });
SK('magier', 0, 4, 'inferno', 'Inferno', '🌞', { type: 'nova', cd: 60, cost: 60, r: 220, pow: [5.5], dot: { pow: [2], dur: 6 } });
SK('magier', 1, 0, 'frostblitz', 'Frostblitz', '❄️', { type: 'proj', cd: 3, cost: 15, pow: [1.3, 1.5, 1.7], col: '#8fdcff', slow: { pct: 40, dur: [3, 4, 5] } });
SK('magier', 1, 1, 'eisruestung', 'Eisrüstung', '🧊', { type: 'buff', cd: 30, cost: 20, dur: 15, shield: [3, 4, 5], mods: { armorPct: [10, 15, 20] } });
SK('magier', 1, 2, 'blizzard', 'Blizzard', '🌨️', { type: 'gaoe', cd: 18, cost: 40, r: 150, pow: [2, 2.4, 2.8], slow: { pct: 50, dur: 4 } });
SK('magier', 1, 3, 'kaelte', 'Eisige Konzentration', '🥶', { type: 'passive', mods: { cdr: [4, 8, 12] } });
SK('magier', 1, 4, 'nullpunkt', 'Absoluter Nullpunkt', '💠', { type: 'nova', cd: 90, cost: 50, r: 180, pow: [2.5], stun: [4] });
SK('magier', 2, 0, 'arkane_geschosse', 'Arkane Geschosse', '✨', { type: 'proj', cd: 1.5, cost: 12, pow: [0.9, 1.1, 1.3], col: '#d08aff' });
SK('magier', 2, 1, 'gelehrsamkeit', 'Gelehrsamkeit', '📘', { type: 'passive', mods: { apPct: [4, 8, 12] } });
SK('magier', 2, 2, 'blinzeln', 'Blinzeln', '🌀', { type: 'blink', cd: 12, cost: 15, dist: 240 });
SK('magier', 2, 3, 'manaschild', 'Manaschild', '🔮', { type: 'buff', cd: 35, cost: 10, dur: 12, shield: [4, 5, 6] });
SK('magier', 2, 4, 'arkansturm', 'Arkaner Sturm', '🌟', { type: 'proj', cd: 30, cost: 55, pow: [7], col: '#ff8aff' });
// --- Waldläufer
SK('waldlaeufer', 0, 0, 'praezisionsschuss', 'Präzisionsschuss', '🎯', { type: 'proj', cd: 3, cost: 15, pow: [1.8, 2.1, 2.4], col: '#e8d8a0' });
SK('waldlaeufer', 0, 1, 'salve', 'Salvenfeuer', '🏹', { type: 'gaoe', cd: 10, cost: 25, r: 100, pow: [1.3, 1.6, 1.9] });
SK('waldlaeufer', 0, 2, 'adlerauge', 'Adlerauge', '🦅', { type: 'passive', mods: { critAdd: [4, 8, 12] } });
SK('waldlaeufer', 0, 3, 'giftpfeil', 'Giftpfeil', '🐍', { type: 'proj', cd: 12, cost: 20, pow: [0.6, 0.7, 0.8], col: '#7aff5a', dot: { pow: [2, 2.6, 3.2], dur: 10 } });
SK('waldlaeufer', 0, 4, 'todesschuss', 'Todesschuss', '💀', { type: 'proj', cd: 40, cost: 45, pow: [6], col: '#ff4a4a', exec: { below: 30, mult: 2 } });
SK('waldlaeufer', 1, 0, 'fangnetz', 'Fangnetz', '🕸️', { type: 'proj', cd: 16, cost: 15, pow: [0.4, 0.5, 0.6], col: '#dddddd', stun: [1.5, 2, 2.5] });
SK('waldlaeufer', 1, 1, 'naturheilung', 'Naturheilung', '🌿', { type: 'heal', cd: 10, cost: 20, pow: [1.5, 2, 2.5] });
SK('waldlaeufer', 1, 2, 'rindenhaut', 'Rindenhaut', '🌳', { type: 'passive', mods: { armorPct: [8, 16, 24] } });
SK('waldlaeufer', 1, 3, 'schattenschritt', 'Schattenschritt', '🌫️', { type: 'buff', cd: 30, cost: 20, dur: 8, mods: { dmgRed: [30, 40, 50], spdPct: [10, 15, 20] } });
SK('waldlaeufer', 1, 4, 'waldgeist', 'Geist des Waldes', '🧚', { type: 'buff', cd: 120, cost: 30, dur: 15, mods: { regenPct: [4], spdPct: [20], apPct: [20] } });
SK('waldlaeufer', 2, 0, 'raubtierhieb', 'Raubtierhieb', '🐺', { type: 'melee', cd: 6, cost: 15, pow: [1.8, 2.1, 2.4], range: 62 });
SK('waldlaeufer', 2, 1, 'sprung', 'Ausweichsprung', '🦘', { type: 'blink', cd: 12, cost: 10, dist: 210, back: true });
SK('waldlaeufer', 2, 2, 'schnelle_fuesse', 'Schnelle Füße', '👟', { type: 'passive', mods: { spdPct: [4, 8, 12] } });
SK('waldlaeufer', 2, 3, 'pfeilhagel', 'Pfeilhagel', '🌧️', { type: 'gaoe', cd: 25, cost: 40, r: 140, pow: [2.4, 2.9, 3.4] });
SK('waldlaeufer', 2, 4, 'jagdfieber', 'Jagdfieber', '🔥', { type: 'buff', cd: 60, cost: 20, dur: 15, mods: { apPct: [40], critAdd: [20] } });
// --- Priester
SK('priester', 0, 0, 'heiliger_blitz', 'Heiliger Blitz', '⚡', { type: 'proj', cd: 1.8, cost: 12, pow: [1.5, 1.8, 2.1], col: '#fff2a0' });
SK('priester', 0, 1, 'laeuterung', 'Läuterung', '🔆', { type: 'nova', cd: 10, cost: 28, r: 120, pow: [1.3, 1.6, 1.9] });
SK('priester', 0, 2, 'strafgericht', 'Strafgericht', '⚖️', { type: 'proj', cd: 18, cost: 30, pow: [1.8, 2.1, 2.4], col: '#ffe070', stun: [2, 2.5, 3] });
SK('priester', 0, 3, 'eifer', 'Eifer', '🙏', { type: 'passive', mods: { apPct: [4, 8, 12] } });
SK('priester', 0, 4, 'himmelsfeuer', 'Himmelsfeuer', '☀️', { type: 'gaoe', cd: 40, cost: 55, r: 170, pow: [6] });
SK('priester', 1, 0, 'heilung', 'Heilung', '💚', { type: 'heal', cd: 6, cost: 22, pow: [1.7, 2.2, 2.7] });
SK('priester', 1, 1, 'erneuerung', 'Erneuerung', '🌱', { type: 'heal', cd: 10, cost: 15, pow: [0], hot: { pow: [2.5, 3.2, 4], dur: 12 } });
SK('priester', 1, 2, 'schutzschild', 'Schutzschild', '🛡️', { type: 'buff', cd: 24, cost: 20, dur: 10, shield: [2.5, 3.2, 4] });
SK('priester', 1, 3, 'gnade', 'Gnade', '🕊️', { type: 'passive', mods: { healPct: [8, 16, 24] } });
SK('priester', 1, 4, 'gunst', 'Göttliche Gunst', '😇', { type: 'buff', cd: 180, cost: 40, dur: 10, heal: [100], mods: { dmgRed: [30] } });
SK('priester', 2, 0, 'schattenwort', 'Schattenwort: Schmerz', '🌑', { type: 'dot', cd: 8, cost: 14, dot: { pow: [2.2, 2.8, 3.4], dur: 9 }, col: '#9a50d0' });
SK('priester', 2, 1, 'vampirgriff', 'Vampirgriff', '🦇', { type: 'proj', cd: 10, cost: 22, pow: [1.4, 1.7, 2], col: '#c04080', lifesteal: [50, 75, 100] });
SK('priester', 2, 2, 'furcht', 'Panisches Entsetzen', '😱', { type: 'nova', cd: 30, cost: 25, r: 140, pow: [0.3, 0.4, 0.5], stun: [3, 3.5, 4] });
SK('priester', 2, 3, 'dunkle_macht', 'Dunkle Macht', '🕯️', { type: 'passive', mods: { critAdd: [3, 6, 9] } });
SK('priester', 2, 4, 'seelenernte', 'Seelenernte', '👻', { type: 'proj', cd: 45, cost: 50, pow: [6], col: '#7a30b0', lifesteal: [100] });

const MOD_TEXT = {
  apPct: v => `+${v}% Angriffskraft`, armorPct: v => `${v > 0 ? '+' : ''}${v}% Rüstung`, hpPct: v => `+${v}% Lebenspunkte`,
  spdPct: v => `+${v}% Bewegungstempo`, dmgRed: v => `-${v}% erlittener Schaden`, critAdd: v => `+${v}% Kritische Trefferchance`,
  lifesteal: v => `${v}% Lebensraub`, cdr: v => `-${v}% Abklingzeiten`, healPct: v => `+${v}% Heilung`, regenPct: v => `${v}% Leben pro Sekunde`,
};
function skillDesc(sk, rank) {
  const r = Math.max(1, rank), L = [];
  const ap = v => `${Math.round(rv(v, r) * 100)}% Angriffskraft`;
  if (sk.type === 'melee') L.push(`Nahkampfangriff: ${ap(sk.pow)} Schaden.`);
  if (sk.type === 'proj') L.push(`Fernangriff: ${ap(sk.pow)} Schaden.`);
  if (sk.type === 'nova') L.push(`Trifft alle Feinde im Umkreis von ${sk.r}: ${ap(sk.pow)} Schaden.`);
  if (sk.type === 'gaoe') L.push(`Flächenangriff auf das Ziel (Radius ${sk.r}): ${ap(sk.pow)} Schaden.`);
  if (sk.type === 'dash') L.push(`Stürmt zum Ziel: ${ap(sk.pow)} Schaden.`);
  if (sk.type === 'blink') L.push(sk.back ? `Springt ${sk.dist} Einheiten vom Ziel weg.` : `Teleportiert dich ${sk.dist} Einheiten in Zielrichtung.`);
  if (sk.type === 'heal' && sk.pow && rv(sk.pow, r)) L.push(`Heilt dich um ${ap(sk.pow).replace('Angriffskraft', 'der Kraft')}.`);
  if (sk.type === 'dot') L.push('Belegt das Ziel mit einem Fluch.');
  if (sk.hot) L.push(`Heilt über ${sk.hot.dur}s insgesamt ${ap(sk.hot.pow).replace('Angriffskraft', 'der Kraft')}.`);
  if (sk.dot) L.push(`Zusätzlich ${ap(sk.dot.pow)} Schaden über ${sk.dot.dur}s.`);
  if (sk.stun) L.push(`Betäubt das Ziel für ${rv(sk.stun, r)}s.`);
  if (sk.slow) L.push(`Verlangsamt um ${sk.slow.pct}% für ${rv(sk.slow.dur, r)}s.`);
  if (sk.cleave) L.push(`Trifft auch Feinde in der Nähe.`);
  if (sk.exec) L.push(`Doppelter Schaden bei Zielen unter ${sk.exec.below}% Leben.`);
  if (sk.lifesteal && sk.type !== 'passive') L.push(`Du heilst dich um ${rv(sk.lifesteal, r)}% des Schadens.`);
  if (sk.shield) L.push(`Schild, das ${ap(sk.shield).replace('Angriffskraft', 'der Kraft')} Schaden absorbiert.`);
  if (sk.heal && sk.type === 'buff') L.push(`Heilt sofort ${rv(sk.heal, r)}% deiner Lebenspunkte.`);
  if (sk.mods) for (const k in sk.mods) L.push(MOD_TEXT[k](rv(sk.mods[k], r)) + (sk.type === 'buff' ? ` (${sk.dur}s)` : ''));
  return L;
}

// ---------------------------------------------------------------------
//  Quests
// ---------------------------------------------------------------------
const QUESTS = [];
const kill = (m, n) => ({ t: 'kill', m, n });
const coll = (label, m, n, ch = 0.65) => ({ t: 'collect', label, m, n, ch });
const talk = npc => ({ t: 'talk', npc });
const expl = (poi) => ({ t: 'explore', poi, r: 4 });
const gath = (node, n) => ({ t: 'gather', node, n });
function Q(id, name, giver, turn, lv, text, obj, o) {
  QUESTS.push(Object.assign({ id, name, giver, turn, lv, text, obj, xp: 1, gold: 1, rar: -1, pre: [], done: 'Gut gemacht! Hier ist deine Belohnung.' }, o));
}
// --- Eichenhain
Q('q_willkommen', 'Ein neuer Stern in Eichenhain', 'aldric', 'marta', 1, 'Die Kräuterfrau Marta wartet schon auf dich. Sprich mit ihr, sie hat Arbeit für Neuankömmlinge. (Tipp: Mit K öffnest du den Fertigkeitenbaum – du hast bereits Punkte zu verteilen!)', [talk('marta')], { xp: 0.5, done: 'Ah, Aldric schickt dich. Gut, ich kann Hilfe gebrauchen!' });
Q('q_schleim', 'Ungebetene Gäste', 'marta', 'marta', 1, 'Auf meinen Feldern machen sich Wiesenschleime breit. Töte fünf davon, bevor sie meine Kräuter zersetzen.', [kill('schleim', 5)], { pre: ['q_willkommen'] });
Q('q_kraeuter', 'Martas Kräuter', 'marta', 'marta', 2, 'Ich brauche Friedwurz für meine Tränke. Sammle fünf Pflanzen in den Auen – sie glitzern leicht.', [gath('friedwurz', 5)], { pre: ['q_schleim'], done: 'Wundervoll! Mit Friedwurz kann ich bei mir Tränke brauen – frag mich später danach.' });
Q('q_wolf', 'Wolfsplage', 'torben', 'torben', 2, 'Streunende Wölfe reißen unser Vieh. Erlege sechs von ihnen und bring mir fünf Wolfsfelle als Beweis.', [kill('wolf', 6), coll('Wolfsfell', 'wolf', 5)], {});
Q('q_brunnen', 'Der Alte Brunnen', 'pip', 'pip', 3, 'Im Alten Brunnen westlich des Dorfes spukt es, sagen alle! Geh hin und sieh nach – aber erzähl es nicht meiner Mutter!', [expl('brunnen')], { done: 'Du warst wirklich da?! Cool! Und nichts ist passiert? Schade...' });
Q('q_dieb', 'Diebesgesindel', 'torben', 'torben', 3, 'Straßendiebe belästigen Reisende auf den Wegen. Schalte vier von ihnen aus und nimm ihre Beute an dich.', [kill('dieb', 4), coll('Gestohlene Börse', 'dieb', 4, 0.8)], { pre: ['q_wolf'] });
Q('q_grunthar', 'Grunthar, der Wildeber', 'aldric', 'aldric', 4, 'Ein gewaltiger Eber verwüstet unsere Felder im Südosten. Die Bauern nennen ihn Grunthar. Töte dieses Ungetüm!', [kill('grunthar', 1)], { xp: 1.4, gold: 2, rar: 2, pre: ['q_wolf'], done: 'Grunthar ist tot! Eichenhain steht in deiner Schuld. Nimm das hier.' });
Q('q_waldwacht', 'Der Ruf der Waldwacht', 'aldric', 'reinhild', 5, 'Die Schattenkrone erwacht – ich spüre es. Reise nach Norden zur Waldwacht und melde dich bei Hauptmann Reinhild. Folge der Straße.', [talk('reinhild')], { xp: 0.8, pre: ['q_grunthar'], done: 'Aldric schickt dich? Dann ist es ernst. Willkommen in der Waldwacht.' });
// --- Waldwacht
Q('q_spinnen', 'Spinnenplage', 'reinhild', 'reinhild', 6, 'Riesige Waldspinnen bedrohen unsere Patrouillen. Töte acht von ihnen.', [kill('spinne', 8)], { pre: ['q_waldwacht'] });
Q('q_goblins', 'Goblinlager', 'fenn', 'fenn', 6, 'Goblin-Späher belauern unsere Straßen. Erledige acht und bring mir ihre Zähne.', [kill('goblin', 8), coll('Goblinzahn', 'goblin', 6)], { pre: ['q_waldwacht'] });
Q('q_silber', 'Silberblatt-Ernte', 'edda', 'edda', 7, 'Für das Futter meiner Pferde brauche ich Silberblatt. Sammle sechs Pflanzen im Grünwald.', [gath('silberblatt', 6)], { pre: ['q_waldwacht'] });
Q('q_schamanen', 'Der Stab des Schamanen', 'fenn', 'fenn', 8, 'Goblin-Schamanen beschwören üble Magie. Töte vier von ihnen und bring mir einen Schamanenstab.', [kill('schamane', 4), coll('Schamanenstab', 'schamane', 1, 0.5)], { pre: ['q_goblins'] });
Q('q_vilara', 'Vilara, die Spinnenkönigin', 'reinhild', 'reinhild', 8, 'Im Westen haust Vilara, Mutter aller Waldspinnen. Solange sie lebt, gibt es keinen Frieden. Zerstöre ihr Nest!', [kill('vilara', 1)], { xp: 1.4, gold: 2, rar: 2, pre: ['q_spinnen'] });
Q('q_baeren', 'Hungrige Bären', 'edda', 'edda', 9, 'Höhlenbären haben meine Stuten angegriffen. Erlege sechs von ihnen.', [kill('baer', 6)], { pre: ['q_silber'] });
Q('q_wege', 'Wegelagerer', 'osric', 'osric', 9, 'Mein Karrenzug wurde überfallen! Bring mir meine Waren zurück – die Wegelagerer haben sie.', [kill('wegelagerer', 7), coll('Gestohlene Ware', 'wegelagerer', 5, 0.8)], { pre: ['q_waldwacht'] });
Q('q_karg', 'Karg, der Räuberhauptmann', 'reinhild', 'reinhild', 10, 'Karg führt die Banditen an. Er lagert im Osten. Bring uns seinen Kopf – oder zumindest sein Ende.', [kill('karg', 1)], { xp: 1.4, gold: 2, rar: 2, pre: ['q_wege'] });
Q('q_moor', 'Ins Moor', 'reinhild', 'gudrun', 11, 'Eine Krankheit breitet sich im Moorfall-Sumpf aus. Die Fischerin Gudrun in Schilfend bittet um Hilfe. Folge der Straße nach Nordwesten.', [talk('gudrun')], { xp: 0.8, pre: ['q_karg'], done: 'Endlich Hilfe! Das Moor wird immer unheimlicher.' });
// --- Schilfend
Q('q_moorleichen', 'Unruhige Tote', 'gudrun', 'gudrun', 11, 'Die Toten im Moor ruhen nicht mehr. Schicke acht Moorleichen zurück in die Erde.', [kill('moorleiche', 8)], { pre: ['q_moor'] });
Q('q_frosch', 'Quakende Plage', 'gudrun', 'gudrun', 12, 'Die Riesenfrösche vertreiben meine Fische. Erlege zehn und bring mir sechs Froschschenkel – für die Suppe.', [kill('frosch', 10), coll('Froschschenkel', 'frosch', 6)], { pre: ['q_moor'] });
Q('q_moos', 'Heilendes Moos', 'tobias', 'tobias', 12, 'Sumpfmoos ist gefragt wie nie. Sammle sechs Büschel.', [gath('sumpfmoos', 6)], { pre: ['q_moor'] });
Q('q_irrlichter', 'Irrlichter', 'tobias', 'tobias', 13, 'Irrlichter locken Reisende in den Tod. Lösche sechs von ihnen aus.', [kill('irrlicht', 6)], { pre: ['q_moos'] });
Q('q_hexenhain', 'Der Hexenhain', 'gudrun', 'gudrun', 13, 'Eine Hexe soll im Moor ihr Unwesen treiben. Erkunde den Hexenhain im Osten von Schilfend.', [expl('hexenhain')], { pre: ['q_moorleichen'] });
Q('q_morgraine', 'Morgraine, die Moorhexe', 'gudrun', 'gudrun', 13, 'Morgraine ist die Quelle der Seuche. Stelle sie in ihrem Hain und beende ihr Treiben!', [kill('morgraine', 1)], { xp: 1.4, gold: 2, rar: 2, pre: ['q_hexenhain'] });
Q('q_gorbash', 'Gorbash, der Faulige', 'tobias', 'tobias', 15, 'Ein verfaulter Troll, größer als jedes Haus, wandert durch den Westen des Sumpfes. Töte Gorbash.', [kill('gorbash', 1)], { xp: 1.5, gold: 2, rar: 3, pre: ['q_irrlichter'] });
Q('q_zinnen', 'Der Weg nach Kaldrim', 'gudrun', 'thrain', 15, 'Die Zwerge von Kaldrim im Norden kämpfen gegen etwas Uraltes. Überbringe ihnen unsere Botschaft.', [talk('thrain')], { xp: 0.8, pre: ['q_morgraine'], done: 'Eine Botschaft? Gut, gut. Und eine weitere Axt dazu!' });
// --- Sandtor
Q('q_sandtor', 'Karawane in Not', 'zahir', 'zahir', 11, 'Skorpione haben meine Karawane belagert. Erschlage acht davon und bringe mir fünf Stachel.', [kill('skorpion', 8), coll('Skorpionstachel', 'skorpion', 5)], {});
Q('q_geier', 'Aasfresser', 'zahir', 'zahir', 12, 'Sandgeier kreisen über meinen Kamelen. Vertreibe acht von ihnen.', [kill('geier', 8)], { pre: ['q_sandtor'] });
Q('q_kristalle', 'Sandkristalle', 'basim', 'basim', 12, 'Sandkristalle bringen Gold auf dem Markt. Sammle sechs davon in der Wüste.', [gath('sandkristall', 6)], {});
Q('q_grab', 'Das Verfluchte Grab', 'zahir', 'zahir', 13, 'Ein uraltes Grab im Westen der Oase wurde geöffnet. Erkunde es – und räume die Mumien dort auf.', [expl('grab'), kill('mumie', 6)], { pre: ['q_geier'] });
Q('q_raeuber', 'Wüstenräuber', 'basim', 'basim', 14, 'Wüstenräuber überfallen meine Händler. Töte sieben von ihnen.', [kill('wuestenraeuber', 7)], { pre: ['q_kristalle'] });
Q('q_khetzar', "Khet'zar, der Skarabäenkönig", 'zahir', 'zahir', 14, "Im Grab regiert Khet'zar, ein Skarabäenkönig. Solange er lebt, kehrt Ruhe nicht zurück.", [kill('khetzar', 1)], { xp: 1.4, gold: 2, rar: 2, pre: ['q_grab'] });
Q('q_wurm', 'Der Dünenschreck', 'zahir', 'zahir', 16, 'Im Osten wühlt ein Sandwurm von gewaltiger Größe. Er verschlingt ganze Karawanen. Töte ihn!', [kill('duenenschreck', 1)], { xp: 1.5, gold: 2, rar: 3, pre: ['q_khetzar'] });
Q('q_glut', 'Der Weg nach Glutlager', 'zahir', 'sera', 16, 'Im Nordosten brennt das Land. Kommandantin Sera in Glutlager sucht Verstärkung. Zieh nach Norden.', [talk('sera')], { xp: 0.8, pre: ['q_wurm'], done: 'Noch ein Kämpfer? Gut. Wir brauchen jeden gegen die Glut.' });
// --- Kaldrim
Q('q_trolle', 'Trolle im Pass', 'thrain', 'thrain', 16, 'Bergtrolle blockieren unsere Pässe. Erschlage acht von ihnen.', [kill('bergtroll', 8)], { pre: ['q_zinnen'] });
Q('q_eiswoelfe', 'Eiswölfe', 'thrain', 'thrain', 17, 'Rudel von Eiswölfen reißen unsere Minenarbeiter. Töte zehn und bring mir sechs Pelze.', [kill('eiswolf', 10), coll('Eiswolf-Pelz', 'eiswolf', 6)], { pre: ['q_zinnen'] });
Q('q_erz', 'Erz für die Schmiede', 'borin', 'borin', 17, 'Mir geht das Erz aus. Baue acht Eisenerz-Adern in den Zinnen ab.', [gath('eisenerz', 8)], { pre: ['q_zinnen'] });
Q('q_mine', 'Die Verlassene Mine', 'thrain', 'thrain', 18, 'Unsere alte Mine im Südwesten ist verstummt. Sieh nach, was dort geschehen ist.', [expl('mine'), kill('zwergenabtruennig', 8)], { pre: ['q_trolle'] });
Q('q_jorrvik', 'Jorrvik, der Frostriese', 'thrain', 'thrain', 19, 'Der Frostriese Jorrvik erwacht im Norden. Wenn er die Pässe erreicht, ist Kaldrim verloren.', [kill('jorrvik', 1)], { xp: 1.4, gold: 2, rar: 3, pre: ['q_mine'] });
Q('q_waechter', 'Der Erwachte Wächter', 'borin', 'borin', 21, 'Der uralte Steinwächter im Südwesten hat sich erhoben. Zerstöre ihn, bevor er Kaldrim erreicht.', [kill('waechter', 1)], { xp: 1.5, gold: 2, rar: 3, pre: ['q_jorrvik'] });
// --- Glutlager
Q('q_imps', 'Imps im Anflug', 'sera', 'sera', 16, 'Glutimps beschießen unser Lager. Erlege zehn von ihnen.', [kill('glutimp', 10)], { pre: ['q_glut'] });
Q('q_kultisten', 'Die Feuerkultisten', 'sera', 'sera', 17, 'Ein Kult huldigt Malakor. Töte acht Kultisten und bring ihre Amulette.', [kill('feuerkultist', 8), coll('Kultistenamulett', 'feuerkultist', 5)], { pre: ['q_glut'] });
Q('q_glutstein', 'Glutstein', 'valkor', 'valkor', 18, 'Ich brauche Glutstein für meine Esse. Baue acht Adern in den Aschenlanden ab.', [gath('glutstein', 8)], { pre: ['q_glut'] });
Q('q_krater', 'Der Glutkrater', 'sera', 'sera', 19, 'Im Südosten klafft ein Krater, aus dem Feuerwesen steigen. Erkunde ihn und vernichte die Lavaelementare.', [expl('krater'), kill('lavaelementar', 6)], { pre: ['q_imps'] });
Q('q_ignaroth', 'Ignaroth, der Glutdrache', 'sera', 'sera', 22, 'Ein Drache kreist über dem Norden. Ignaroth muss fallen, sonst verbrennt die ganze Welt.', [kill('ignaroth', 1)], { xp: 1.4, gold: 2, rar: 3, pre: ['q_krater'] });
Q('q_malakor', 'Aschenfürst Malakor', 'valkor', 'valkor', 24, 'Malakor, Herold der Schatten, sammelt seine Heerscharen im Nordwesten der Aschenlande. Beende seine Pläne.', [kill('malakor', 1)], { xp: 1.5, gold: 2, rar: 3, pre: ['q_ignaroth'] });
Q('q_bastion', 'Die Letzte Bastion', 'sera', 'ardan', 22, 'Die Schatten sammeln sich in der Festung im Norden. Ritter Ardan hält dort die Letzte Bastion. Er braucht dich – folge den Straßen nach Nordwesten.', [talk('ardan')], { xp: 0.8, pre: ['q_krater'], done: 'Du kommst im richtigen Moment. Die Schatten werden stärker.' });
// --- Bastion
Q('q_legion', 'Skelettlegion', 'ardan', 'ardan', 22, 'Skelettkrieger marschieren aus der Festung. Zerschlage zehn von ihnen.', [kill('skelett', 10)], { pre: ['q_bastion'] });
Q('q_ritter', 'Verfluchte Ritter', 'ardan', 'ardan', 24, 'Ehemalige Ritter wandeln verflucht durch die Ruinen. Erlöse acht von ihnen und bringe ihre Wappen.', [kill('verfluchter', 8), coll('Ritterwappen', 'verfluchter', 5)], { pre: ['q_legion'] });
Q('q_beschwoerer', 'Todesbeschwörer', 'mirelle', 'mirelle', 25, 'Todesbeschwörer erwecken die Gefallenen immer wieder. Töte sechs von ihnen.', [kill('todesbeschwoerer', 6)], { pre: ['q_bastion'] });
Q('q_mortharion', 'Mortharion, der Untote König', 'ardan', 'ardan', 28, 'Im Herzen der Festung thront Mortharion, der Untote König. Töte ihn – und öffne den Weg zur Schattenkrone.', [kill('mortharion', 1)], { xp: 1.5, gold: 2, rar: 3, pre: ['q_ritter'] });
Q('q_nyxthal', 'Das Ende der Schatten', 'ardan', 'ardan', 30, "Nyx'thal, der Verhüllte, trägt die Schattenkrone. Dringe bis ans Ende der Festung vor und zerstöre ihn. Das Schicksal Aethermoors liegt in deinen Händen.", [kill('nyxthal', 1)], { xp: 2, gold: 5, rar: 4, pre: ['q_mortharion'], done: 'Es ist vollbracht! Die Schattenkrone ist zerstört. Aethermoor ist frei – und du bist seine Heldin oder sein Held!' });
