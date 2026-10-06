export type Level = 1 | 2 | 3 | 4 | 5;

export interface ItemEntry {
  id: string;
  name: string;
  count: number;
  done: boolean;
}

export interface Farm {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt?: string;
  views?: number;
  likes?: number;
  durationSec?: number;
  description: string;
  versions: string[];
  difficulty: Level;
  efficiency: Level;
  ratePerHour?: number;
  items: Omit<ItemEntry, 'id' | 'done'>[];
  manual?: boolean;
}

export interface Build {
  id: string;
  farm: Farm;
  items: ItemEntry[];
  notes: string;
  coords: string;
  createdAt: number;
  done: boolean;
}
