import type { EntityKind } from "@/lib/content/schema";
import { normalize } from "./text";

export type Intent = "locate" | "unlock" | "mission" | "money" | "secret" | "general";

export interface IntentResult {
  intent: Intent;
  /** Kinds to boost, strongest first. */
  boost: EntityKind[];
  confidence: number;
}

const RULES: { intent: Intent; boost: EntityKind[]; patterns: RegExp[] }[] = [
  {
    intent: "money",
    boost: ["money"],
    patterns: [/\b(money|cash|earn|earning|rich|payout|profit|grind|income|\$)/, /\bmake (some )?(money|cash)\b/, /\bgeld\b/],
  },
  {
    intent: "secret",
    boost: ["easter-egg"],
    patterns: [/\beaster ?eggs?\b/, /\b(secret|secrets|hidden|mystery|mysteries|ufo|alien|ghost|reference)\b/, /\bgeheim/],
  },
  {
    intent: "unlock",
    boost: ["unlock"],
    patterns: [/\bunlock/, /\bhow (do|can) i (get|obtain|buy|unlock)\b/, /\b(obtain|acquire|buy|purchase|requirements?|freischalt)/],
  },
  {
    intent: "mission",
    boost: ["mission"],
    patterns: [
      /\bmissions?\b/,
      /\b(stuck|walkthrough|objective|complete|beat|fail|failing|detected|stealth|chase|escape)\b/,
      /\bhow (do|can) i (complete|finish|beat|pass)\b/,
    ],
  },
  {
    intent: "locate",
    boost: ["location", "easter-egg", "unlock"],
    patterns: [/\bwhere\b/, /\b(location|locate|find|map|spawn|located)\b/, /\bwo (ist|finde)\b/],
  },
];

export function detectIntent(query: string): IntentResult {
  const q = normalize(query.replace(/\$/g, " $ "));
  const raw = query.toLowerCase();
  let best: IntentResult = { intent: "general", boost: [], confidence: 0 };
  for (const rule of RULES) {
    const hits = rule.patterns.filter((p) => p.test(q) || p.test(raw)).length;
    if (hits === 0) continue;
    const confidence = Math.min(1, 0.5 + hits * 0.25);
    // Earlier rules win ties: "where can I earn money" is a money question.
    if (confidence > best.confidence) best = { intent: rule.intent, boost: rule.boost, confidence };
  }
  return best;
}

export const INTENT_LABEL: Record<Intent, string> = {
  locate: "Location lookup",
  unlock: "Unlock requirements",
  mission: "Mission help",
  money: "Money making",
  secret: "Secrets & Easter eggs",
  general: "General search",
};
