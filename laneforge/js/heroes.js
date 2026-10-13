export const WEAPONS = {
  rifle:   { name: "Pulse Rifle",   dmg: 11, rate: 9,   mag: 30, reload: 1.7, spd: 1100, spread: 2.2, pellets: 1, range: 900,  auto: true,  heavy: 0 },
  sniper:  { name: "Longbow",       dmg: 95, rate: 1.1, mag: 6,  reload: 2.4, spd: 2300, spread: 0.1, pellets: 1, range: 1900, auto: false, heavy: 1 },
  shotgun: { name: "Scatter Cannon",dmg: 9,  rate: 1.5, mag: 6,  reload: 2.2, spd: 1000, spread: 9,   pellets: 8, range: 460,  auto: false, heavy: 1 },
  smg:     { name: "Needle SMG",    dmg: 6.5,rate: 15,  mag: 40, reload: 1.6, spd: 1150, spread: 3.2, pellets: 1, range: 700,  auto: true,  heavy: 0 },
  pistol:  { name: "Hand Cannon",   dmg: 30, rate: 3.6, mag: 10, reload: 1.3, spd: 1400, spread: 0.9, pellets: 1, range: 1100, auto: false, heavy: 0.5 },
  lmg:     { name: "Rift Chaingun", dmg: 8.5,rate: 12,  mag: 70, reload: 3.0, spd: 1050, spread: 4.5, pellets: 1, range: 850,  auto: true,  heavy: 0.3 },
};

// Fähigkeiten: type = aoe | blink | heal | boost | slow | shield
export const HEROES = {
  vanguard: {
    name: "Vanguard", role: "Allrounder", color: "#ffd36b", hp: 700, speed: 235, weapon: "rifle",
    q: { name: "Shockwave", type: "aoe", cd: 8, radius: 170, dmg: 70, stun: 0.7 },
    e: { name: "Aegis", type: "shield", cd: 12, amount: 200, dur: 4 },
    blurb: "Solide Standardwaffe, Schockwelle und Schild.",
  },
  marksman: {
    name: "Marksman", role: "Scharfschütze", color: "#7fd1ff", hp: 560, speed: 225, weapon: "sniper",
    q: { name: "Snare Field", type: "slow", cd: 10, radius: 150, dur: 3.5 },
    e: { name: "Blink", type: "blink", cd: 9, dist: 300 },
    blurb: "Ein Schuss, hoher Schaden. Präzision wird belohnt.",
  },
  breacher: {
    name: "Breacher", role: "Nahkampf", color: "#ff7a59", hp: 900, speed: 245, weapon: "shotgun",
    q: { name: "Breach Charge", type: "aoe", cd: 9, radius: 200, dmg: 110, stun: 0.4, knock: 520 },
    e: { name: "Rush", type: "boost", cd: 11, dur: 3 },
    blurb: "Viel Leben, brutal auf kurze Distanz.",
  },
  phantom: {
    name: "Phantom", role: "Assassine", color: "#c58bff", hp: 520, speed: 260, weapon: "smg",
    q: { name: "Mend", type: "heal", cd: 12, amount: 220 },
    e: { name: "Phase Step", type: "blink", cd: 7, dist: 340 },
    blurb: "Schnell und tödlich im Tracking.",
  },
};
export const HERO_IDS = Object.keys(HEROES);
