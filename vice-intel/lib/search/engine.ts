/**
 * In-memory search engine over the knowledge base.
 *
 * - Field-weighted BM25-style scoring (title > aliases > tags > summary > body)
 * - Typo tolerance (Damerau–Levenshtein within a per-length budget)
 * - Prefix matching for the token being typed (instant suggestions)
 * - Synonym expansion and intent-aware boosting of record kinds
 *
 * The corpus is small enough to index at startup. The SearchIndex interface is
 * the seam for moving to Postgres full-text + pgvector when the corpus grows.
 */
import { getAll, getById } from "@/lib/content/repository";
import type { Entity, EntityKind } from "@/lib/content/schema";
import { detectIntent, type IntentResult } from "./intent";
import { editDistance, normalize, stem, SYNONYMS, tokenize, typoBudget } from "./text";

const FIELD_WEIGHTS = { title: 6, aliases: 5, tags: 3, meta: 2, summary: 2, body: 1 } as const;
type Field = keyof typeof FIELD_WEIGHTS;

interface Doc {
  id: string;
  kind: EntityKind;
  titleNorm: string;
  length: number;
}

export interface SearchHit {
  id: string;
  score: number;
  matched: string[];
}

export interface SearchResponse {
  query: string;
  intent: IntentResult;
  hits: SearchHit[];
  /** Spelling correction when the query only matched through typo tolerance. */
  didYouMean?: string;
  total: number;
}

export interface SearchOptions {
  kinds?: EntityKind[];
  limit?: number;
  /** Treat the final token as a prefix (search-as-you-type). */
  prefix?: boolean;
}

function fieldsOf(e: Entity): Record<Field, string> {
  const body: string[] = [];
  let meta: string[] = [];
  switch (e.kind) {
    case "mission":
      meta = [e.startLocation, e.chapter ?? "", e.difficulty ?? ""];
      e.objectives.forEach((o) => {
        body.push(o.title, ...o.failurePoints, ...o.alternatives);
        o.steps.forEach((s) => body.push(s.title, s.detail));
      });
      e.requirements.forEach((r) => body.push(r.label));
      e.rewards.forEach((r) => body.push(r.value));
      break;
    case "unlock":
      meta = [e.category, e.howTo];
      e.requirements.forEach((r) => body.push(r.label));
      e.steps.forEach((s) => body.push(s.title, s.detail));
      break;
    case "easter-egg":
      meta = [e.category, "easter egg secret"];
      e.conditions.forEach((r) => body.push(r.label));
      e.steps.forEach((s) => body.push(s.title, s.detail));
      if (e.background) body.push(e.background);
      break;
    case "money":
      meta = [e.activityType, "money earn cash", e.progression];
      body.push(...e.strategy);
      e.requirements.forEach((r) => body.push(r.label));
      break;
    case "location":
      meta = [e.region, e.character, "location place region map"];
      body.push(...e.highlights);
      break;
    case "character":
      meta = [e.role, "character"];
      body.push(...e.facts);
      break;
  }
  if (e.locationId) {
    const loc = getById(e.locationId);
    if (loc) meta.push(loc.title, ...loc.aliases);
  }
  return {
    title: e.title,
    aliases: e.aliases.join(" "),
    tags: e.tags.join(" "),
    meta: meta.join(" "),
    summary: e.summary,
    body: body.join(" "),
  };
}

class SearchIndex {
  private docs: Doc[] = [];
  private postings = new Map<string, Map<number, number>>();
  private vocab: string[] = [];
  private avgLen = 1;

  constructor(entities: Entity[]) {
    let total = 0;
    entities.forEach((e, i) => {
      const fields = fieldsOf(e);
      let len = 0;
      (Object.keys(fields) as Field[]).forEach((f) => {
        const toks = tokenize(fields[f]);
        len += toks.length;
        for (const t of toks) {
          let p = this.postings.get(t);
          if (!p) this.postings.set(t, (p = new Map()));
          p.set(i, (p.get(i) ?? 0) + FIELD_WEIGHTS[f]);
        }
      });
      total += len;
      this.docs.push({ id: e.id, kind: e.kind, titleNorm: normalize(e.title), length: len });
    });
    this.avgLen = total / Math.max(1, entities.length);
    this.vocab = [...this.postings.keys()];
  }

  private idf(term: string): number {
    const df = this.postings.get(term)?.size ?? 0;
    const n = this.docs.length;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** Candidate index terms for one query token, with a match-quality weight. */
  private expand(token: string, isPrefix: boolean): { term: string; w: number; typo: boolean }[] {
    const out = new Map<string, { w: number; typo: boolean }>();
    const add = (term: string, w: number, typo = false) => {
      if (!this.postings.has(term)) return;
      const prev = out.get(term);
      if (!prev || prev.w < w) out.set(term, { w, typo });
    };
    add(token, 1);
    for (const syn of SYNONYMS[token] ?? []) add(stem(syn), 0.6);
    if (isPrefix && token.length >= 2) {
      for (const t of this.vocab) if (t.startsWith(token) && t !== token) add(t, 0.85);
    }
    const budget = typoBudget(token.length);
    if (budget > 0 && !out.has(token)) {
      for (const t of this.vocab) {
        if (Math.abs(t.length - token.length) > budget) continue;
        const d = editDistance(token, t, budget);
        if (d <= budget) add(t, d === 1 ? 0.7 : 0.5, true);
      }
    }
    return [...out.entries()].map(([term, v]) => ({ term, ...v }));
  }

  search(query: string, opts: SearchOptions = {}): SearchResponse {
    const intent = detectIntent(query);
    const tokens = tokenize(query);
    const empty: SearchResponse = { query, intent, hits: [], total: 0 };
    if (tokens.length === 0) return empty;

    const k1 = 1.2;
    const b = 0.5;
    const scores = new Map<number, { score: number; matchedTokens: Set<number>; matched: Set<string> }>();
    const corrections: string[] = [];
    let usedTypoOnly = false;

    tokens.forEach((tok, ti) => {
      const isPrefix = Boolean(opts.prefix) && ti === tokens.length - 1;
      const candidates = this.expand(tok, isPrefix);
      if (candidates.length > 0 && candidates.every((c) => c.typo)) {
        usedTypoOnly = true;
        const best = candidates.sort((a, b2) => b2.w - a.w)[0];
        corrections.push(best.term);
      } else {
        corrections.push(tok);
      }
      // Per doc keep the best candidate for this token (no double counting).
      const perDoc = new Map<number, { s: number; term: string }>();
      for (const c of candidates) {
        const idf = this.idf(c.term);
        for (const [doc, tf] of this.postings.get(c.term)!) {
          const len = this.docs[doc].length;
          const sat = (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / this.avgLen));
          const s = sat * idf * c.w;
          const prev = perDoc.get(doc);
          if (!prev || prev.s < s) perDoc.set(doc, { s, term: c.term });
        }
      }
      for (const [doc, { s, term }] of perDoc) {
        let entry = scores.get(doc);
        if (!entry) scores.set(doc, (entry = { score: 0, matchedTokens: new Set(), matched: new Set() }));
        entry.score += s;
        entry.matchedTokens.add(ti);
        entry.matched.add(term);
      }
    });

    const qNorm = normalize(query);
    const boosted = new Set(intent.boost);
    let hits: SearchHit[] = [];
    for (const [doc, entry] of scores) {
      const d = this.docs[doc];
      if (opts.kinds && opts.kinds.length > 0 && !opts.kinds.includes(d.kind)) continue;
      const coverage = entry.matchedTokens.size / tokens.length;
      let score = entry.score * (0.35 + 0.65 * coverage * coverage);
      if (qNorm.length > 2 && d.titleNorm.includes(qNorm)) score *= 1.8;
      else if (qNorm.length > 2 && qNorm.includes(d.titleNorm)) score *= 1.5;
      if (boosted.has(d.kind)) score *= 1 + 0.4 * intent.confidence;
      hits.push({ id: d.id, score, matched: [...entry.matched] });
    }
    hits.sort((a, b2) => b2.score - a.score);
    // Drop the long tail: anything far below the best hit is noise.
    if (hits.length > 0) {
      const top = hits[0].score;
      hits = hits.filter((h) => h.score >= top * 0.12);
    }
    const total = hits.length;
    return {
      query,
      intent,
      hits: hits.slice(0, opts.limit ?? 30),
      total,
      didYouMean: usedTypoOnly ? corrections.join(" ") : undefined,
    };
  }

  /** Title suggestions for search-as-you-type. */
  suggest(query: string, limit = 6): string[] {
    const q = normalize(query);
    if (q.length < 2) return [];
    const res = this.search(query, { prefix: true, limit });
    return res.hits.map((h) => getById(h.id)!.title);
  }
}

let index: SearchIndex | null = null;

export function getIndex(): SearchIndex {
  if (!index) index = new SearchIndex(getAll());
  return index;
}

export function search(query: string, opts?: SearchOptions): SearchResponse {
  return getIndex().search(query, opts);
}
