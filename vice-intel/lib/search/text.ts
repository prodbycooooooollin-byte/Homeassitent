/** Text utilities for the search engine: normalisation, tokenising, light stemming, edit distance. */

const STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "at", "for", "and", "or", "is", "are", "be", "do", "does",
  "i", "me", "my", "you", "your", "it", "this", "that", "with", "can", "how", "what", "where", "who",
  "which", "there", "get", "find", "show", "need", "want", "without", "from", "by", "about", "into",
  "der", "die", "das", "und", "wie", "wo", "ich", "ein", "eine", "finde", "zeig",
]);

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”„"'’`]/g, "")
    .replace(/[^a-z0-9$\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Very light English stemmer — enough to merge plurals and simple verb forms. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("es") && /(sh|ch|x|z|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenize(input: string, { keepStopwords = false } = {}): string[] {
  return normalize(input)
    .split(/[\s-]+/)
    .filter((t) => t.length > 0 && (keepStopwords || !STOPWORDS.has(t)))
    .map(stem);
}

/** Damerau–Levenshtein (optimal string alignment) with an early-exit bound. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Allowed typo budget by token length. */
export function typoBudget(len: number): number {
  if (len < 4) return 0;
  if (len < 8) return 1;
  return 2;
}

/** Query-side synonym expansion (stemmed forms). */
export const SYNONYMS: Record<string, string[]> = {
  car: ["vehicle", "supercar"],
  vehicle: ["car", "boat", "truck"],
  ride: ["vehicle", "car"],
  gun: ["weapon", "rifle", "smg"],
  weapon: ["gun", "rifle", "smg"],
  cash: ["money", "payout"],
  money: ["cash", "payout", "earn"],
  earn: ["money", "payout"],
  egg: ["easter", "secret"],
  secret: ["hidden", "mystery", "easter"],
  hidden: ["secret", "mystery"],
  ufo: ["alien", "saucer"],
  alien: ["ufo", "saucer"],
  undetected: ["stealth"],
  detect: ["stealth"],
  sneak: ["stealth"],
  stealth: ["undetected"],
  swamp: ["wetland", "grassriver"],
  everglade: ["grassriver", "wetland", "swamp"],
  miami: ["vice", "city"],
  hat: ["cap"],
  cap: ["hat"],
  boat: ["speedboat", "airboat"],
  house: ["property", "garage", "bungalow"],
  property: ["house", "garage"],
  sniper: ["rifle", "marksman"],
  heist: ["depot", "vault"],
};
