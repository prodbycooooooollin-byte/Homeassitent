import { clamp, lerp, rand, dist, angTo, angDiff, hasLOS } from "./util.js";

export const DIFFICULTY = {
  easy:   { label: "Einfach",  skill: 0.2 },
  normal: { label: "Normal",   skill: 0.45 },
  hard:   { label: "Schwer",   skill: 0.75 },
  insane: { label: "Unfair",   skill: 1.0 },
};

export function makeAI(skill = 0.5, role = "fighter") {
  return {
    skill, role, target: null, retarget: 0, react: 0, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: rand(0.8, 2),
    aim: 0, err: 0, errT: 0, burstOn: true, burstT: rand(0.5, 1.2), stuckT: 0, lx: 0, ly: 0, checkT: 0,
    unstick: 0, ux: 0, uy: 0, wander: null, hadTarget: false,
  };
}

function steer(a, w, mx, my) {
  const m = Math.hypot(mx, my);
  if (m < 0.01) return [0, 0];
  mx /= m; my /= m;
  const look = a.r + 34;
  if (!w.blocked(a.x + mx * look, a.y + my * look, a.r * 0.8)) return [mx, my];
  const base = Math.atan2(my, mx);
  for (const off of [0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
    const ax = Math.cos(base + off), ay = Math.sin(base + off);
    if (!w.blocked(a.x + ax * look, a.y + ay * look, a.r * 0.8)) return [ax, ay];
  }
  return [mx, my];
}

export function botThink(a, w, dt, ctx = {}) {
  const ai = a.ai, c = a.cmd, wp = a.weapon, sk = ai.skill;
  c.fire = false; c.dash = false; c.q = false; c.e = false; c.reload = false;
  if (a.dead) { c.wx = c.wy = 0; return; }
  const sight = ctx.sight || 1100;

  // --- Zielwahl ---
  ai.retarget -= dt;
  if (ai.retarget <= 0) {
    ai.retarget = 0.2 + Math.random() * 0.15;
    let best = null, bd = 1e9;
    const cands = ctx.pickTarget ? ctx.pickTarget(a) : w.enemiesOf(a).filter((o) => o.kind === "hero");
    for (const o of cands) {
      if (!o || o.dead) continue;
      const d = dist(a.x, a.y, o.x, o.y);
      if (d > sight || d >= bd) continue;
      if (!hasLOS(w.walls, a.x, a.y, o.x, o.y)) continue;
      best = o; bd = d;
    }
    if (best !== ai.target) ai.react = lerp(0.55, 0.08, sk) + Math.random() * 0.15;
    ai.target = best;
  }
  if (ai.target && (ai.target.dead || ai.target.removed)) ai.target = null;
  const t = ai.target;
  ai.react = Math.max(0, ai.react - dt);

  // --- Zielen ---
  let mx = 0, my = 0;
  if (t) {
    const d = dist(a.x, a.y, t.x, t.y);
    const lead = wp.spd > 0 ? (d / wp.spd) * lerp(0.2, 0.95, sk) : 0;
    const px = t.x + t.vx * lead, py = t.y + t.vy * lead;
    ai.errT -= dt;
    if (ai.errT <= 0) { ai.errT = rand(0.2, 0.5); ai.err = ((rand(-1, 1) * lerp(9, 1.2, sk)) * Math.PI) / 180; }
    const want = angTo(a.x, a.y, px, py) + ai.err * (ctx.errMul ?? 1);
    const diff = angDiff(ai.aim, want);
    const turn = lerp(3.2, 16, sk) * dt;
    ai.aim += clamp(diff, -turn, turn);
    c.aim = ai.aim;
    const tol = Math.atan2(t.r * 0.9, Math.max(d, 1)) + 0.04;
    ai.burstT -= dt;
    if (ai.burstT <= 0) {
      ai.burstOn = !ai.burstOn;
      ai.burstT = ai.burstOn ? rand(0.6, 1.5) * (0.6 + sk) : rand(0.15, 0.6) * (1.6 - sk);
    }
    const inRange = d < wp.range * 0.95;
    const burstOk = wp.auto ? ai.burstOn || sk > 0.9 : true;
    const want_fire = ai.react <= 0 && inRange && Math.abs(angDiff(ai.aim, want)) < tol && burstOk;
    c.fire = want_fire && (wp.auto || !a.fireHeld);
    // Bewegung
    const pref = clamp(wp.range * (ctx.prefMul ?? 0.5), 130, 560);
    const dx = (t.x - a.x) / (d || 1), dy = (t.y - a.y) / (d || 1);
    let rad = 0;
    if (d > pref + 70) rad = 1; else if (d < pref - 70) rad = -1;
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafeDir *= -1; ai.strafeT = rand(0.6, 2.0) * lerp(1.6, 0.7, sk); }
    const strafe = lerp(0.4, 1, sk);
    mx = dx * rad + -dy * ai.strafeDir * strafe;
    my = dy * rad + dx * ai.strafeDir * strafe;
    ai.hadTarget = true;
    // Fähigkeiten
    const hp = a.hp / a.maxhp, h = a.hero;
    for (const [slot, ab] of [[0, h.q], [1, h.e]]) {
      if (a.cd[slot] > 0 || Math.random() > dt * 2.5 * (0.4 + sk)) continue;
      let use = false;
      if (ab.type === "aoe") use = d < ab.radius * 0.9;
      else if (ab.type === "heal") use = hp < 0.5;
      else if (ab.type === "shield") use = hp < 0.8 && d < 600;
      else if (ab.type === "boost") use = d > 450 || hp < 0.4;
      else if (ab.type === "slow") { use = d > 250 && d < 650; c.tx = t.x; c.ty = t.y; }
      else if (ab.type === "blink") use = hp < 0.4;
      if (use) { if (slot === 0) c.q = true; else c.e = true; }
    }
    if (a.flash > 0 && a.dashCharges > 0 && Math.random() < dt * 3 * sk) c.dash = true;
  } else {
    // kein Ziel: Ziel aus Modus oder umherstreifen
    ai.aim += angDiff(ai.aim, a.ang) * 0.3;
    c.aim = ai.aim;
    if (ai.hadTarget && a.ammo < wp.mag * 0.5) c.reload = true;
    const g = ctx.goal ? ctx.goal(a) : null;
    if (g) {
      const d = dist(a.x, a.y, g.x, g.y);
      if (d > (g.stop ?? 40)) { mx = (g.x - a.x) / d; my = (g.y - a.y) / d; }
      if (g.aim !== undefined) ai.aim = g.aim;
    } else {
      if (!ai.wander || dist(a.x, a.y, ai.wander.x, ai.wander.y) < 60) {
        ai.wander = { x: rand(150, w.w - 150), y: rand(150, w.h - 150) };
      }
      const d = dist(a.x, a.y, ai.wander.x, ai.wander.y);
      mx = (ai.wander.x - a.x) / d; my = (ai.wander.y - a.y) / d;
    }
    if (!g || g.aim === undefined) { if (Math.hypot(mx, my) > 0.1) { const wa = Math.atan2(my, mx); ai.aim += angDiff(ai.aim, wa) * Math.min(1, dt * 6); c.aim = ai.aim; } }
  }
  if (a.ammo < wp.mag * 0.3 && !t) c.reload = true;
  if (a.ammo <= 0) c.reload = true;

  // Rückzug
  if (ctx.retreat && a.hp / a.maxhp < (ctx.retreatAt ?? 0.3)) {
    const r = ctx.retreat(a);
    if (r) {
      const d = dist(a.x, a.y, r.x, r.y) || 1;
      mx = (r.x - a.x) / d; my = (r.y - a.y) / d;
      if (a.cd[1] <= 0 && a.hero.e.type === "blink") c.e = true;
    }
  }

  // Hängenbleiben erkennen
  ai.checkT += dt;
  if (ai.checkT > 0.5) {
    const moved = dist(a.x, a.y, ai.lx, ai.ly);
    if (moved < 6 && Math.hypot(mx, my) > 0.3) { ai.unstick = 0.6; const an = rand(0, Math.PI * 2); ai.ux = Math.cos(an); ai.uy = Math.sin(an); }
    ai.lx = a.x; ai.ly = a.y; ai.checkT = 0;
  }
  if (ai.unstick > 0) { ai.unstick -= dt; mx = ai.ux; my = ai.uy; }

  const [sx, sy] = steer(a, w, mx, my);
  const mag = Math.min(1, Math.hypot(mx, my));
  c.wx = sx * mag; c.wy = sy * mag;
}
