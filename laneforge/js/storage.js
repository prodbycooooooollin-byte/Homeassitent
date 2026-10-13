const KEY = "laneforge.v1";
let data = { settings: {}, scores: {}, ghosts: {} };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) data = Object.assign(data, JSON.parse(raw));
} catch (e) { /* privater Modus o. ä. */ }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignorieren */ }
}

export const DEFAULT_SETTINGS = {
  volume: 0.5, crosshair: "#ffd36b", crossSize: 14, crossGap: 5, crossStyle: "cross",
  shake: true, damageNumbers: true, lastHitAssist: true, hero: "vanguard",
};
export function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, data.settings); }
export function setSetting(k, v) { data.settings[k] = v; save(); }
export function getBest(key) { return data.scores[key]; }
// higher=true: größer ist besser
export function submitScore(key, value, higher = true) {
  const old = data.scores[key];
  const better = old === undefined || (higher ? value > old : value < old);
  if (better) { data.scores[key] = value; save(); }
  return { best: better ? value : old, isNew: better && old !== undefined };
}
export function getGhost(key) { return data.ghosts[key]; }
export function setGhost(key, g) { data.ghosts[key] = g; save(); }
export function resetAll() { data = { settings: data.settings, scores: {}, ghosts: {} }; save(); }
