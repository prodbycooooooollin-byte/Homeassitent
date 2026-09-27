// Typen der patchgebundenen Spieldaten. Alles hier stammt aus den Spieldateien
// (scripts/*.vdata + englische Lokalisierung), gespiegelt vom SteamDB-Repository
// "GameTracking-Deadlock". Kuratierte Einschätzungen liegen getrennt in data/knowledge.

export type ItemSlot = 'weapon' | 'vitality' | 'spirit';
export type Activation = 'passive' | 'active' | 'toggle';

export interface ItemDef {
  className: string;
  /** Offizieller englischer Name aus der Lokalisierung der Spieldateien. */
  nameEn: string;
  /** Optional: Name in der Spielsprache (aus Assets-Sync), niemals selbst übersetzt. */
  nameLocalized?: Record<string, string>;
  slot: ItemSlot;
  tier: 1 | 2 | 3 | 4;
  /** Listenpreis laut m_nItemPricePerTier. */
  cost: number;
  /** Komponenten, die beim Kauf verbraucht werden (m_vecComponentItems). */
  components: string[];
  activation: Activation;
  /** Numerische Eigenschaften (m_mapAbilityProperties.*.m_strValue), nur Werte ≠ 0. */
  props: Record<string, number>;
  description: string;
  shopFilters: string[];
  /** Numerische ID im Spiel (Hash). Aus Assets-Sync bestätigt oder berechnet – siehe idSource. */
  id?: number;
  idSource?: 'assets-sync' | 'computed-murmur2';
  imageUrl?: string;
}

export interface HeroAbilityDef {
  className: string;
  slot: string;
  props: Record<string, number>;
  description: string;
}

export interface HeroDef {
  className: string;
  heroId: number;
  nameEn: string;
  nameLocalized?: Record<string, string>;
  role: string;
  abilities: HeroAbilityDef[];
  startingStats: Record<string, number>;
  imageUrl?: string;
}

export interface GameDataManifest {
  build: number;
  versionDate: string;
  source: string;
  sourceFiles: string[];
  extractedAt: string;
  itemPricePerTier: number[];
  itemCount: number;
  heroCount: number;
}

export interface GameDataSet {
  manifest: GameDataManifest;
  items: ItemDef[];
  heroes: HeroDef[];
}
