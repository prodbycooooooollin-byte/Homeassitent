import { mkdirSync, writeFileSync } from 'node:fs';
import { RAW_FILES, fetchRawGameFiles } from '../src/gamedata/fetchRaw';

// Lädt die Rohdateien aus dem SteamDB-Spiegel nach data/raw.
mkdirSync('data/raw', { recursive: true });
const files = await fetchRawGameFiles(fetch);
for (const f of RAW_FILES) writeFileSync(`data/raw/${f.local}`, files[f.key]);
console.log('OK:', RAW_FILES.map((f) => f.local).join(', '));
