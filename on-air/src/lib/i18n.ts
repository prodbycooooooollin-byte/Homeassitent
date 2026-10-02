import { de, type DictKey } from "../i18n/de";
import { en } from "../i18n/en";

export type Lang = "de" | "en";
let lang: Lang = "de";

export function setLang(l: Lang) {
  lang = l === "en" ? "en" : "de";
  document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return lang;
}

export function t(key: DictKey, vars?: Record<string, string | number>): string {
  const dict = lang === "en" ? en : de;
  let s: string = dict[key] ?? de[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function hasKey(key: string): key is DictKey {
  return key in de;
}
