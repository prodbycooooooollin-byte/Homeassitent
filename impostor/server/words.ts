import type { CategoryId } from '../shared/protocol.ts';

/**
 * Serverseitige Wortliste. Wird NIE an Clients ausgeliefert.
 *
 * Jeder Eintrag: ID, Hauptwort, Kategorie, Schwierigkeit (1 leicht – 3 schwer),
 * optionale akzeptierte Antwortvarianten (kuratierte Aliasliste für den
 * Rateversuch des Impostors). Groß-/Kleinschreibung, ß/ss, Umlaut-Umschreibung,
 * Bindestriche und Leerzeichen werden ohnehin normalisiert und müssen nicht
 * als Alias gepflegt werden.
 */
export interface WordEntry {
  id: string;
  word: string;
  category: CategoryId;
  difficulty: 1 | 2 | 3;
  aliases: string[];
}

type Row = [slug: string, word: string, difficulty: 1 | 2 | 3, aliases?: string[]];

const DATA: Record<CategoryId, Row[]> = {
  alltag: [
    ['regenschirm', 'Regenschirm', 1, ['Schirm']],
    ['zahnbuerste', 'Zahnbürste', 1],
    ['wecker', 'Wecker', 1],
    ['kuehlschrank', 'Kühlschrank', 1],
    ['schluessel', 'Schlüssel', 1, ['Schlüsselbund']],
    ['brille', 'Brille', 1],
    ['rucksack', 'Rucksack', 1],
    ['kerze', 'Kerze', 1],
    ['spiegel', 'Spiegel', 1],
    ['waschmaschine', 'Waschmaschine', 1],
    ['fernbedienung', 'Fernbedienung', 1],
    ['kopfhoerer', 'Kopfhörer', 1],
    ['sofa', 'Sofa', 1, ['Couch']],
    ['handy', 'Handy', 1, ['Smartphone', 'Mobiltelefon']],
    ['kalender', 'Kalender', 2],
    ['staubsauger', 'Staubsauger', 1],
    ['geldboerse', 'Geldbörse', 2, ['Portemonnaie', 'Portmonee', 'Geldbeutel', 'Brieftasche']],
    ['fahrrad', 'Fahrrad', 1, ['Rad', 'Velo']],
    ['briefkasten', 'Briefkasten', 2],
    ['toaster', 'Toaster', 1],
    ['buegeleisen', 'Bügeleisen', 2],
    ['taschenlampe', 'Taschenlampe', 1],
    ['kissen', 'Kissen', 1, ['Kopfkissen']],
    ['aufzug', 'Aufzug', 2, ['Fahrstuhl', 'Lift']],
    ['muelleimer', 'Mülleimer', 1, ['Abfalleimer', 'Mülltonne']],
    ['schere', 'Schere', 1],
    ['zahnpasta', 'Zahnpasta', 1, ['Zahncreme']],
    ['ladekabel', 'Ladekabel', 2],
    ['kaffeemaschine', 'Kaffeemaschine', 1],
    ['adventskalender', 'Adventskalender', 2],
    ['geburtstag', 'Geburtstag', 1],
    ['luftballon', 'Luftballon', 1, ['Ballon']],
  ],
  essen: [
    ['pizza', 'Pizza', 1],
    ['doener', 'Döner', 1, ['Döner Kebab', 'Dönerkebab', 'Kebab']],
    ['spaghetti', 'Spaghetti', 1],
    ['currywurst', 'Currywurst', 1],
    ['brezel', 'Brezel', 1, ['Breze', 'Brezn']],
    ['pfannkuchen', 'Pfannkuchen', 1, ['Eierkuchen', 'Pancake', 'Pancakes']],
    ['sushi', 'Sushi', 1],
    ['kaese', 'Käse', 1],
    ['schokolade', 'Schokolade', 1],
    ['erdbeere', 'Erdbeere', 1],
    ['banane', 'Banane', 1],
    ['popcorn', 'Popcorn', 1],
    ['kartoffel', 'Kartoffel', 1, ['Erdapfel']],
    ['honig', 'Honig', 1],
    ['apfelstrudel', 'Apfelstrudel', 2, ['Strudel']],
    ['lasagne', 'Lasagne', 1],
    ['burger', 'Burger', 1, ['Hamburger']],
    ['pommes', 'Pommes', 1, ['Pommes frites', 'Fritten']],
    ['kaffee', 'Kaffee', 1],
    ['bier', 'Bier', 1],
    ['eis', 'Eis', 1, ['Eiscreme', 'Speiseeis']],
    ['croissant', 'Croissant', 2],
    ['suppe', 'Suppe', 1],
    ['knoblauch', 'Knoblauch', 2],
    ['zitrone', 'Zitrone', 1],
    ['schnitzel', 'Schnitzel', 1, ['Wiener Schnitzel']],
    ['muesli', 'Müsli', 2],
    ['brokkoli', 'Brokkoli', 2, ['Broccoli']],
    ['waffel', 'Waffel', 1, ['Waffeln']],
    ['gummibaerchen', 'Gummibärchen', 1, ['Gummibär', 'Gummibären']],
    ['raclette', 'Raclette', 2],
    ['wassermelone', 'Wassermelone', 1],
  ],
  sport: [
    ['fussball', 'Fußball', 1, ['Fussball']],
    ['tennis', 'Tennis', 1],
    ['basketball', 'Basketball', 1],
    ['schwimmen', 'Schwimmen', 1],
    ['skifahren', 'Skifahren', 1, ['Ski fahren', 'Ski', 'Skilaufen']],
    ['boxen', 'Boxen', 1],
    ['handball', 'Handball', 1],
    ['volleyball', 'Volleyball', 1, ['Beachvolleyball']],
    ['golf', 'Golf', 2],
    ['marathon', 'Marathon', 2],
    ['tischtennis', 'Tischtennis', 1, ['Ping Pong', 'Pingpong']],
    ['klettern', 'Klettern', 2, ['Bouldern']],
    ['surfen', 'Surfen', 2, ['Wellenreiten']],
    ['eishockey', 'Eishockey', 2],
    ['schach', 'Schach', 2],
    ['formel1', 'Formel 1', 2, ['Formel Eins', 'F1']],
    ['olympia', 'Olympia', 2, ['Olympische Spiele', 'Olympiade']],
    ['yoga', 'Yoga', 1],
    ['reiten', 'Reiten', 2],
    ['darts', 'Darts', 2, ['Dart']],
    ['bowling', 'Bowling', 1, ['Kegeln']],
    ['skateboard', 'Skateboard', 2, ['Skateboarden', 'Skaten']],
    ['hochsprung', 'Hochsprung', 2],
    ['rudern', 'Rudern', 3],
    ['schiedsrichter', 'Schiedsrichter', 2, ['Schiri', 'Referee']],
    ['trikot', 'Trikot', 2],
    ['fitnessstudio', 'Fitnessstudio', 1, ['Fitnesscenter', 'Gym']],
    ['elfmeter', 'Elfmeter', 2, ['Strafstoß', 'Penalty']],
    ['snowboard', 'Snowboard', 2, ['Snowboarden']],
    ['weltmeisterschaft', 'Weltmeisterschaft', 2, ['WM']],
    ['tour-de-france', 'Tour de France', 3],
  ],
  tiere: [
    ['katze', 'Katze', 1, ['Kater']],
    ['hund', 'Hund', 1],
    ['elefant', 'Elefant', 1],
    ['giraffe', 'Giraffe', 1],
    ['pinguin', 'Pinguin', 1],
    ['loewe', 'Löwe', 1],
    ['hai', 'Hai', 1, ['Haifisch']],
    ['delfin', 'Delfin', 1, ['Delphin']],
    ['eule', 'Eule', 1],
    ['fuchs', 'Fuchs', 1],
    ['igel', 'Igel', 1],
    ['kuh', 'Kuh', 1, ['Rind']],
    ['schwein', 'Schwein', 1],
    ['pferd', 'Pferd', 1],
    ['biene', 'Biene', 1],
    ['schmetterling', 'Schmetterling', 1],
    ['krokodil', 'Krokodil', 1],
    ['kaenguru', 'Känguru', 1, ['Känguruh']],
    ['affe', 'Affe', 1],
    ['schildkroete', 'Schildkröte', 1],
    ['papagei', 'Papagei', 1],
    ['frosch', 'Frosch', 1],
    ['hamster', 'Hamster', 1],
    ['eichhoernchen', 'Eichhörnchen', 1],
    ['wal', 'Wal', 1, ['Walfisch']],
    ['oktopus', 'Oktopus', 2, ['Krake', 'Octopus']],
    ['zebra', 'Zebra', 1],
    ['spinne', 'Spinne', 1],
    ['adler', 'Adler', 2],
    ['panda', 'Panda', 1, ['Pandabär', 'Großer Panda']],
    ['faultier', 'Faultier', 2],
    ['flamingo', 'Flamingo', 2],
  ],
  orte: [
    ['strand', 'Strand', 1],
    ['flughafen', 'Flughafen', 1],
    ['bahnhof', 'Bahnhof', 1],
    ['krankenhaus', 'Krankenhaus', 1, ['Klinik', 'Spital']],
    ['schule', 'Schule', 1],
    ['bibliothek', 'Bibliothek', 1, ['Bücherei']],
    ['kino', 'Kino', 1],
    ['museum', 'Museum', 1],
    ['zoo', 'Zoo', 1, ['Tierpark']],
    ['supermarkt', 'Supermarkt', 1],
    ['kirche', 'Kirche', 1],
    ['friedhof', 'Friedhof', 2],
    ['schwimmbad', 'Schwimmbad', 1, ['Hallenbad', 'Freibad']],
    ['wueste', 'Wüste', 1],
    ['insel', 'Insel', 1],
    ['bauernhof', 'Bauernhof', 1],
    ['burg', 'Burg', 2, ['Ritterburg']],
    ['leuchtturm', 'Leuchtturm', 2],
    ['freizeitpark', 'Freizeitpark', 1, ['Vergnügungspark']],
    ['campingplatz', 'Campingplatz', 2],
    ['baeckerei', 'Bäckerei', 1],
    ['paris', 'Paris', 1],
    ['berlin', 'Berlin', 1],
    ['venedig', 'Venedig', 2],
    ['weltall', 'Weltall', 1, ['Weltraum', 'All']],
    ['dschungel', 'Dschungel', 1, ['Regenwald', 'Urwald']],
    ['tankstelle', 'Tankstelle', 2],
    ['gefaengnis', 'Gefängnis', 2, ['Knast']],
    ['hotel', 'Hotel', 1],
    ['stadion', 'Stadion', 1],
    ['oktoberfest', 'Oktoberfest', 2, ['Wiesn']],
    ['nordpol', 'Nordpol', 2, ['Arktis']],
  ],
  berufe: [
    ['arzt', 'Arzt', 1, ['Ärztin', 'Doktor']],
    ['lehrer', 'Lehrer', 1, ['Lehrerin']],
    ['polizist', 'Polizist', 1, ['Polizistin']],
    ['feuerwehrmann', 'Feuerwehrmann', 1, ['Feuerwehrfrau', 'Feuerwehr']],
    ['koch', 'Koch', 1, ['Köchin']],
    ['baecker', 'Bäcker', 1, ['Bäckerin']],
    ['pilot', 'Pilot', 1, ['Pilotin']],
    ['astronaut', 'Astronaut', 1, ['Astronautin', 'Raumfahrer']],
    ['friseur', 'Friseur', 1, ['Friseurin', 'Frisör', 'Frisörin']],
    ['zahnarzt', 'Zahnarzt', 1, ['Zahnärztin']],
    ['tierarzt', 'Tierarzt', 1, ['Tierärztin']],
    ['mechaniker', 'Mechaniker', 2, ['Mechanikerin', 'KFZ-Mechaniker']],
    ['architekt', 'Architekt', 2, ['Architektin']],
    ['journalist', 'Journalist', 2, ['Journalistin', 'Reporter', 'Reporterin']],
    ['programmierer', 'Programmierer', 2, ['Programmiererin', 'Softwareentwickler', 'Entwickler']],
    ['gaertner', 'Gärtner', 2, ['Gärtnerin']],
    ['kellner', 'Kellner', 1, ['Kellnerin']],
    ['richter', 'Richter', 2, ['Richterin']],
    ['anwalt', 'Anwalt', 2, ['Anwältin', 'Rechtsanwalt', 'Rechtsanwältin']],
    ['musiker', 'Musiker', 2, ['Musikerin']],
    ['schauspieler', 'Schauspieler', 1, ['Schauspielerin']],
    ['fotograf', 'Fotograf', 2, ['Fotografin', 'Photograph']],
    ['postbote', 'Postbote', 1, ['Postbotin', 'Briefträger', 'Briefträgerin']],
    ['landwirt', 'Landwirt', 1, ['Landwirtin', 'Bauer', 'Bäuerin']],
    ['tischler', 'Tischler', 2, ['Tischlerin', 'Schreiner', 'Schreinerin']],
    ['elektriker', 'Elektriker', 2, ['Elektrikerin']],
    ['taxifahrer', 'Taxifahrer', 1, ['Taxifahrerin']],
    ['detektiv', 'Detektiv', 2, ['Detektivin', 'Privatdetektiv']],
    ['zauberer', 'Zauberer', 1, ['Zauberin', 'Magier', 'Magierin']],
    ['hebamme', 'Hebamme', 3, ['Entbindungspfleger']],
    ['busfahrer', 'Busfahrer', 1, ['Busfahrerin']],
    ['dj', 'DJ', 2, ['Discjockey', 'DJane']],
  ],
  gaming: [
    ['minecraft', 'Minecraft', 1],
    ['fortnite', 'Fortnite', 1],
    ['tetris', 'Tetris', 1],
    ['super-mario', 'Super Mario', 1, ['Mario']],
    ['pac-man', 'Pac-Man', 1],
    ['zelda', 'Zelda', 2, ['The Legend of Zelda', 'Legend of Zelda']],
    ['pokemon', 'Pokémon', 1, ['Pokemon']],
    ['controller', 'Controller', 1, ['Gamepad']],
    ['konsole', 'Konsole', 1, ['Spielkonsole']],
    ['joystick', 'Joystick', 2],
    ['speicherpunkt', 'Speicherpunkt', 3, ['Savepoint', 'Save Point', 'Checkpoint']],
    ['endgegner', 'Endgegner', 2, ['Endboss', 'Boss']],
    ['level', 'Level', 1],
    ['game-over', 'Game Over', 2],
    ['lootbox', 'Lootbox', 3, ['Loot Box']],
    ['speedrun', 'Speedrun', 3],
    ['streamer', 'Streamer', 2, ['Streamerin']],
    ['headset', 'Headset', 1],
    ['gta', 'Grand Theft Auto', 2, ['GTA']],
    ['sims', 'Die Sims', 2, ['Sims']],
    ['among-us', 'Among Us', 1],
    ['lol', 'League of Legends', 2, ['LoL']],
    ['counter-strike', 'Counter-Strike', 2, ['CS', 'CSGO', 'CS2']],
    ['rocket-league', 'Rocket League', 2],
    ['ea-fc', 'EA FC', 2, ['FIFA', 'EA Sports FC']],
    ['pixel', 'Pixel', 2],
    ['arcade', 'Arcade', 2, ['Spielhalle', 'Arcade-Automat']],
    ['game-boy', 'Game Boy', 2],
    ['respawn', 'Respawn', 3],
    ['mario-kart', 'Mario Kart', 1],
    ['tamagotchi', 'Tamagotchi', 2],
  ],
  film: [
    ['titanic', 'Titanic', 1],
    ['harry-potter', 'Harry Potter', 1],
    ['star-wars', 'Star Wars', 1, ['Krieg der Sterne']],
    ['herr-der-ringe', 'Der Herr der Ringe', 1, ['Herr der Ringe', 'Lord of the Rings']],
    ['eiskoenigin', 'Die Eiskönigin', 1, ['Eiskönigin', 'Frozen']],
    ['koenig-der-loewen', 'Der König der Löwen', 1, ['König der Löwen', 'The Lion King']],
    ['shrek', 'Shrek', 1],
    ['jurassic-park', 'Jurassic Park', 1],
    ['findet-nemo', 'Findet Nemo', 1, ['Nemo', 'Finding Nemo']],
    ['toy-story', 'Toy Story', 1],
    ['batman', 'Batman', 1],
    ['spider-man', 'Spider-Man', 1, ['Spiderman']],
    ['james-bond', 'James Bond', 1, ['007', 'Bond']],
    ['stranger-things', 'Stranger Things', 2],
    ['game-of-thrones', 'Game of Thrones', 2, ['GoT']],
    ['breaking-bad', 'Breaking Bad', 2],
    ['simpsons', 'Die Simpsons', 1, ['Simpsons', 'The Simpsons']],
    ['spongebob', 'SpongeBob', 1, ['SpongeBob Schwammkopf']],
    ['tatort', 'Tatort', 2],
    ['squid-game', 'Squid Game', 2],
    ['friends', 'Friends', 2],
    ['avatar', 'Avatar', 2],
    ['matrix', 'Matrix', 2, ['The Matrix']],
    ['zurueck-in-die-zukunft', 'Zurück in die Zukunft', 2, ['Back to the Future']],
    ['fluch-der-karibik', 'Fluch der Karibik', 2, ['Pirates of the Caribbean']],
    ['ghostbusters', 'Ghostbusters', 2],
    ['dark', 'Dark', 3],
    ['wednesday', 'Wednesday', 2],
    ['barbie', 'Barbie', 1],
    ['minions', 'Minions', 1],
    ['avengers', 'Avengers', 1, ['The Avengers', 'Die Avengers']],
    ['haus-des-geldes', 'Haus des Geldes', 2, ['La Casa de Papel', 'Money Heist']],
  ],
};

export const WORDS: WordEntry[] = Object.entries(DATA).flatMap(([category, rows]) =>
  rows.map(([slug, word, difficulty, aliases]) => ({
    id: `${category}:${slug}`,
    word,
    category: category as CategoryId,
    difficulty,
    aliases: aliases ?? [],
  })),
);

/**
 * Normalisierung für den Rateversuch. Bewusst deterministisch und eng:
 *  - Unicode NFKC, Kleinschreibung (de)
 *  - ß → ss, ä/ö/ü → ae/oe/ue (eindeutige Umschreibung)
 *  - Akzente entfernt (é → e)
 *  - typografische Apostrophe vereinheitlicht
 *  - Leerzeichen, Bindestriche, Punkte werden ignoriert („Pac Man" = „Pac-Man" = „PacMan")
 * Kein Teilstring- oder Ähnlichkeitsvergleich: „Ball" ≠ „Fußball".
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[\s\-–—_.·]+/g, '')
    .trim();
}

export function isCorrectGuess(entry: WordEntry, guess: string): boolean {
  const g = normalizeAnswer(guess);
  if (!g) return false;
  if (normalizeAnswer(entry.word) === g) return true;
  return entry.aliases.some((a) => normalizeAnswer(a) === g);
}

/** Vergleichsschlüssel für Hinweis-Duplikate (rollenunabhängig, ohne Wortbezug). */
export function clueKey(raw: string): string {
  return raw.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();
}
