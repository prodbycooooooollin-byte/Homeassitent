import { clamp, rand, dist, angTo, TAU, hasLOS } from "./util.js";
import { HEROES, WEAPONS } from "./heroes.js";
import { sfx } from "./audio.js";

let UID = 1;
export class Actor {
  constructor(o = {}) {
    this.id = UID++;
    this.kind = o.kind || "hero"; // hero | minion | target | dummy
    this.x = o.x || 0; this.y = o.y || 0; this.vx = 0; this.vy = 0;
    this.r = o.r || 15; this.team = o.team ?? 0;
    this.heroId = o.heroId || "vanguard";
    const h = HEROES[this.heroId];
    this.color = o.color || h.color;
    this.name = o.name || h.name;
    this.maxhp = o.hp || h.hp; this.hp = this.maxhp;
    this.baseSpeed = o.speed ?? h.speed;
    this.weaponId = o.weapon || h.weapon;
    this.ang = o.ang || 0;
    this.ammo = WEAPONS[this.weaponId].mag; this.reloadT = 0; this.fireT = 0;
    this.dashCharges = 2; this.dashRecharge = 0; this.dashT = 0;
    this.cd = [0, 0]; this.stun = 0; this.slow = 0; this.boost = 0; this.shield = 0; this.shieldT = 0;
    this.flash = 0; this.dead = false; this.respawnT = 0;
    this.kills = 0; this.deaths = 0; this.souls = 0; this.assists = 0;
    this.cmd = { wx: 0, wy: 0, aim: 0, fire: false, dash: false, q: false, e: false, reload: false };
    this.fireHeld = false;
    this.mul = { dmg: 1, speed: 1, rate: 1, reload: 1, taken: 1, hp: 1 };
    this.isPlayer = !!o.isPlayer;
    this.ai = o.ai || null;
    this.hittable = o.hittable !== false;
    this.static = !!o.static;
    this.lastHitBy = null; this.lastHitAt = 0;
    this.meta = o.meta || {};
    this.scale = 1;
  }
  get weapon() { return WEAPONS[this.weaponId]; }
  get hero() { return HEROES[this.heroId]; }
  setWeapon(id) { this.weaponId = id; this.ammo = WEAPONS[id].mag; this.reloadT = 0; }
}

export class World {
  constructor(w, h, walls = []) {
    this.w = w; this.h = h; this.walls = walls;
    this.actors = []; this.bullets = []; this.fx = []; this.rings = []; this.texts = [];
    this.zones = []; this.pickups = []; this.t = 0; this.hooks = {};
    this.mods = { grip: 1, speed: 1, dmg: 1, ricochet: false, lifesteal: 0, rate: 1, giant: 1 };
    this.player = null; this.shake = 0; this.listener = null;
    this.infiniteAmmo = false; this.noCooldown = false; this.god = false;
  }
  add(a) { this.actors.push(a); return a; }
  remove(a) { a.removed = true; }
  enemiesOf(a) { return this.actors.filter((o) => !o.dead && !o.removed && o.team !== a.team && o.hittable); }
  spark(x, y, color, n = 6, spd = 160, life = 0.35, size = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(spd * 0.3, spd);
      this.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size });
    }
  }
  ring(x, y, r, color, t = 0.4, fill = false) { this.rings.push({ x, y, r, t, max: t, color, fill }); }
  text(x, y, txt, color = "#fff", big = false) {
    this.texts.push({ x: x + rand(-8, 8), y: y - 10, txt, color, big, t: 0.9, max: 0.9 });
  }
  addShake(v) { this.shake = Math.min(14, this.shake + v); }
  volumeAt(x, y) {
    if (!this.listener) return 1;
    return clamp(1 - dist(x, y, this.listener.x, this.listener.y) / 1400, 0, 1);
  }

  // ---------- Kampf ----------
  maxSpeed(a) {
    let s = a.baseSpeed * a.mul.speed * this.mods.speed;
    if (a.slow > 0) s *= 0.5;
    if (a.boost > 0) s *= 1.4;
    return s;
  }
  tryFire(a) {
    const wp = a.weapon;
    if (a.reloadT > 0 || a.fireT > 0 || a.stun > 0 || a.dead) return false;
    if (a.ammo <= 0) { this.startReload(a); return false; }
    a.fireT = 1 / (wp.rate * a.mul.rate * this.mods.rate);
    if (!this.infiniteAmmo) a.ammo--;
    const pellets = wp.pellets;
    for (let i = 0; i < pellets; i++) {
      const sp = (wp.spread * Math.PI) / 180;
      const ang = a.cmd.aim + rand(-sp, sp);
      this.bullets.push({
        x: a.x + Math.cos(a.cmd.aim) * (a.r + 4), y: a.y + Math.sin(a.cmd.aim) * (a.r + 4),
        vx: Math.cos(ang) * wp.spd, vy: Math.sin(ang) * wp.spd, r: wp.pellets > 1 ? 3 : 3.5,
        dmg: wp.dmg * a.mul.dmg * this.mods.dmg, team: a.team, owner: a, life: wp.range / wp.spd,
        color: a.color, bounces: 0, hit: false, big: wp.heavy >= 1 && wp.pellets === 1,
      });
    }
    a.recoil = 1;
    this.spark(a.x + Math.cos(a.cmd.aim) * (a.r + 6), a.y + Math.sin(a.cmd.aim) * (a.r + 6), a.color, 3, 120, 0.12, 2);
    if (this.hooks.onShot) this.hooks.onShot(a);
    const v = this.volumeAt(a.x, a.y);
    if (v > 0.05) sfx.shot(wp.heavy, v * (a.isPlayer ? 1 : 0.6));
    if (a.ammo <= 0 && !this.infiniteAmmo) this.startReload(a);
    return true;
  }
  startReload(a) {
    if (a.reloadT > 0 || a.ammo >= a.weapon.mag) return;
    a.reloadT = a.weapon.reload * a.mul.reload;
    if (a.isPlayer) sfx.reload();
  }
  useAbility(a, slot) {
    const ab = slot === 0 ? a.hero.q : a.hero.e;
    if (a.cd[slot] > 0 || a.stun > 0 || a.dead) return false;
    a.cd[slot] = this.noCooldown ? 0.5 : ab.cd;
    switch (ab.type) {
      case "aoe":
        for (const o of this.enemiesOf(a)) {
          const d = dist(a.x, a.y, o.x, o.y);
          if (d < ab.radius + o.r) {
            this.damage(o, ab.dmg * a.mul.dmg, a, false);
            o.stun = Math.max(o.stun, ab.stun || 0);
            if (ab.knock && !o.static) {
              const an = angTo(a.x, a.y, o.x, o.y);
              o.vx += Math.cos(an) * ab.knock; o.vy += Math.sin(an) * ab.knock;
            }
          }
        }
        this.ring(a.x, a.y, ab.radius, a.color, 0.45, true);
        this.spark(a.x, a.y, a.color, 18, 320, 0.5);
        this.addShake(5); sfx.boom();
        break;
      case "blink": {
        const d = Math.hypot(a.cmd.wx, a.cmd.wy) > 0.1 ? Math.atan2(a.cmd.wy, a.cmd.wx) : a.cmd.aim;
        let nx = a.x, ny = a.y;
        for (let s = 10; s <= ab.dist; s += 10) {
          const tx = a.x + Math.cos(d) * s, ty = a.y + Math.sin(d) * s;
          if (this.blocked(tx, ty, a.r) || tx < a.r || ty < a.r || tx > this.w - a.r || ty > this.h - a.r) break;
          nx = tx; ny = ty;
        }
        this.spark(a.x, a.y, a.color, 10, 200); this.ring(a.x, a.y, 40, a.color, 0.3);
        a.x = nx; a.y = ny;
        this.spark(a.x, a.y, a.color, 10, 200); this.ring(a.x, a.y, 40, a.color, 0.3);
        sfx.ability();
        break;
      }
      case "heal":
        a.hp = Math.min(a.maxhp, a.hp + ab.amount);
        this.text(a.x, a.y - 20, "+" + ab.amount, "#7dff9c", true);
        this.ring(a.x, a.y, 60, "#7dff9c", 0.5); sfx.ability();
        break;
      case "boost":
        a.boost = ab.dur; this.ring(a.x, a.y, 60, a.color, 0.4); sfx.ability();
        break;
      case "shield":
        a.shield = ab.amount; a.shieldT = ab.dur; this.ring(a.x, a.y, 50, "#9fd8ff", 0.4); sfx.ability();
        break;
      case "slow": {
        const tx = a.isPlayer ? a.cmd.tx ?? a.x : a.x + Math.cos(a.cmd.aim) * 350;
        const ty = a.isPlayer ? a.cmd.ty ?? a.y : a.y + Math.sin(a.cmd.aim) * 350;
        this.zones.push({ kind: "slow", x: tx, y: ty, r: ab.radius, t: ab.dur, max: ab.dur, team: a.team, color: a.color });
        sfx.ability();
        break;
      }
    }
    if (this.hooks.onAbility) this.hooks.onAbility(a, ab);
    return true;
  }
  damage(t, amount, src, crit = false) {
    if (t.dead || t.removed) return 0;
    if (this.god && t.isPlayer) return 0;
    amount *= t.mul.taken;
    if (t.shield > 0) {
      const ab = Math.min(t.shield, amount);
      t.shield -= ab; amount -= ab;
    }
    t.flash = 0.12;
    if (amount <= 0) return 0;
    const dealt = Math.min(t.hp, amount);
    t.hp -= amount;
    if (src) { t.lastHitBy = src; t.lastHitAt = this.t; }
    if (src && this.mods.lifesteal && !src.dead) src.hp = Math.min(src.maxhp, src.hp + dealt * this.mods.lifesteal);
    if (this.hooks.onDamage) this.hooks.onDamage(t, dealt, src, crit);
    if (t.hp <= 0) {
      t.hp = 0; t.dead = true;
      this.spark(t.x, t.y, t.color, 14, 260, 0.5, 3);
      if (this.hooks.onKill) this.hooks.onKill(t, src);
    }
    return dealt;
  }
  blocked(x, y, r) {
    for (const w of this.walls) {
      const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  }
  pushOut(a) {
    for (const w of this.walls) {
      const cx = clamp(a.x, w.x, w.x + w.w), cy = clamp(a.y, w.y, w.y + w.h);
      let dx = a.x - cx, dy = a.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < a.r * a.r) {
        if (d2 < 0.0001) { // Mittelpunkt im Rechteck: zur nächsten Kante schieben
          const l = a.x - w.x, rr = w.x + w.w - a.x, t = a.y - w.y, b = w.y + w.h - a.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) a.x = w.x - a.r; else if (m === rr) a.x = w.x + w.w + a.r;
          else if (m === t) a.y = w.y - a.r; else a.y = w.y + w.h + a.r;
          continue;
        }
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        a.x = cx + nx * a.r; a.y = cy + ny * a.r;
        const vn = a.vx * nx + a.vy * ny;
        if (vn < 0) { a.vx -= vn * nx; a.vy -= vn * ny; }
      }
    }
  }

  // ---------- Update ----------
  updateActor(a, dt) {
    if (a.dead || a.removed) return;
    const c = a.cmd;
    a.flash = Math.max(0, a.flash - dt);
    a.fireT = Math.max(0, a.fireT - dt);
    a.recoil = Math.max(0, (a.recoil || 0) - dt * 8);
    a.stun = Math.max(0, a.stun - dt); a.slow = Math.max(0, a.slow - dt); a.boost = Math.max(0, a.boost - dt);
    if (a.shieldT > 0) { a.shieldT -= dt; if (a.shieldT <= 0) a.shield = 0; }
    for (let i = 0; i < 2; i++) a.cd[i] = Math.max(0, a.cd[i] - dt);
    if (a.dashCharges < 2) {
      a.dashRecharge -= dt;
      if (a.dashRecharge <= 0) { a.dashCharges++; a.dashRecharge = 3.2; }
    }
    if (a.reloadT > 0) {
      a.reloadT -= dt;
      if (a.reloadT <= 0) a.ammo = a.weapon.mag;
    }
    if (a.kind === "target" || a.static) { this.integrate(a, dt); return; }
    const stunned = a.stun > 0;
    a.ang = c.aim;
    if (!stunned) {
      if (c.reload) this.startReload(a);
      if (c.q) this.useAbility(a, 0);
      if (c.e) this.useAbility(a, 1);
      if (c.dash && a.dashCharges > 0 && a.kind === "hero") {
        const m = Math.hypot(c.wx, c.wy);
        const dx = m > 0.1 ? c.wx / m : Math.cos(c.aim), dy = m > 0.1 ? c.wy / m : Math.sin(c.aim);
        a.vx = dx * 640; a.vy = dy * 640; a.dashT = 0.2;
        if (a.dashCharges === 2) a.dashRecharge = 3.2;
        a.dashCharges--;
        this.spark(a.x, a.y, a.color, 6, 120, 0.25);
        if (a.isPlayer) sfx.dash();
      }
      if (c.fire) {
        const w = a.weapon;
        if (w.auto || !a.fireHeld) this.tryFire(a);
      }
    }
    a.fireHeld = c.fire;
    a.dashT = Math.max(0, a.dashT - dt);
    // Bewegung
    const sp = this.maxSpeed(a);
    let wx = stunned ? 0 : c.wx, wy = stunned ? 0 : c.wy;
    const m = Math.hypot(wx, wy);
    if (m > 1) { wx /= m; wy /= m; }
    const tvx = wx * sp, tvy = wy * sp;
    const speed = Math.hypot(a.vx, a.vy);
    const grip = this.mods.grip;
    const accel = (speed > sp * 1.15 ? 520 : 2800) * grip;
    const dvx = tvx - a.vx, dvy = tvy - a.vy, dl = Math.hypot(dvx, dvy);
    if (dl > 0) {
      const step = Math.min(dl, accel * dt);
      a.vx += (dvx / dl) * step; a.vy += (dvy / dl) * step;
    }
    this.integrate(a, dt);
  }
  integrate(a, dt) {
    a.x += a.vx * dt; a.y += a.vy * dt;
    this.pushOut(a);
    a.x = clamp(a.x, a.r, this.w - a.r); a.y = clamp(a.y, a.r, this.h - a.r);
  }
  update(dt) {
    this.t += dt;
    for (const a of this.actors) this.updateActor(a, dt);
    this.updateBullets(dt);
    for (const z of this.zones) {
      z.t -= dt;
      if (z.kind === "slow") {
        for (const o of this.actors) if (!o.dead && o.team !== z.team && dist(o.x, o.y, z.x, z.y) < z.r) o.slow = Math.max(o.slow, 0.3);
      } else if (z.kind === "meteor") {
        if (z.t <= 0 && !z.done) {
          z.done = true;
          for (const o of this.actors) if (!o.dead && o.hittable && dist(o.x, o.y, z.x, z.y) < z.r + o.r) this.damage(o, z.dmg, null);
          this.ring(z.x, z.y, z.r, "#ff6a3d", 0.5, true); this.spark(z.x, z.y, "#ff9a5d", 24, 380, 0.6, 3);
          this.addShake(this.listener ? 6 * this.volumeAt(z.x, z.y) : 4); sfx.boom();
        }
      } else if (z.kind === "hazard") {
        for (const o of this.actors) {
          if (o.dead || !o.hittable || o.kind !== "hero") continue;
          if (dist(o.x, o.y, z.x, z.y) < z.r + o.r * 0.5) { z.tick = (z.tick || 0) - dt; if (z.tick <= 0) { z.tick = 0.4; this.damage(o, z.dmg, null); } }
        }
        if (z.move) { z.x += z.move.vx * dt; z.y += z.move.vy * dt; if (z.x < z.r || z.x > this.w - z.r) z.move.vx *= -1; if (z.y < z.r || z.y > this.h - z.r) z.move.vy *= -1; }
      }
    }
    this.zones = this.zones.filter((z) => z.kind === "hazard" || z.t > -0.05);
    for (const f of this.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; }
    this.fx = this.fx.filter((f) => f.life > 0);
    for (const r of this.rings) r.t -= dt;
    this.rings = this.rings.filter((r) => r.t > 0);
    for (const t of this.texts) { t.t -= dt; t.y -= 38 * dt; }
    this.texts = this.texts.filter((t) => t.t > 0);
    this.actors = this.actors.filter((a) => !a.removed);
    this.shake = Math.max(0, this.shake - dt * 22);
    // Pickups
    for (const p of this.pickups) {
      p.cd = Math.max(0, (p.cd || 0) - dt);
      if (p.cd > 0 && !p.respawn) continue;
      for (const a of this.actors) {
        if (a.dead || a.kind !== "hero" || p.cd > 0 || p.gone) continue;
        if (dist(a.x, a.y, p.x, p.y) < a.r + p.r) {
          if (p.type === "health") { if (a.hp >= a.maxhp) continue; a.hp = Math.min(a.maxhp, a.hp + a.maxhp * 0.4); }
          if (this.hooks.onPickup) this.hooks.onPickup(a, p);
          if (a.isPlayer) sfx.soul();
          this.ring(p.x, p.y, 30, p.color || "#7dff9c", 0.4);
          if (p.respawn) p.cd = p.respawn; else p.gone = true;
        }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.gone);
  }
  updateBullets(dt) {
    const alive = [];
    for (const b of this.bullets) {
      const spd = Math.hypot(b.vx, b.vy);
      const steps = Math.max(1, Math.ceil((spd * dt) / 10));
      const sdt = dt / steps;
      let dead = false;
      b.life -= dt;
      for (let s = 0; s < steps && !dead; s++) {
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        if (b.x < 0 || b.y < 0 || b.x > this.w || b.y > this.h) { dead = true; break; }
        for (const w of this.walls) {
          if (b.x > w.x - b.r && b.x < w.x + w.w + b.r && b.y > w.y - b.r && b.y < w.y + w.h + b.r) {
            if (this.mods.ricochet && b.bounces < 2) {
              const cx = b.x - (b.vx * sdt), cy = b.y - (b.vy * sdt);
              const inX = cx > w.x - b.r && cx < w.x + w.w + b.r;
              if (inX) b.vy *= -1; else b.vx *= -1;
              b.x = cx; b.y = cy; b.bounces++;
              this.spark(b.x, b.y, b.color, 3, 100, 0.2);
            } else { this.spark(b.x, b.y, "#aaa", 3, 90, 0.2); dead = true; }
            break;
          }
        }
        if (dead) break;
        for (const a of this.actors) {
          if (a.dead || a.removed || !a.hittable || a.team === b.team || a === b.owner) continue;
          if (a.meta.noBullets) continue;
          const d = dist(a.x, a.y, b.x, b.y);
          if (d < a.r + b.r) {
            const crit = d < a.r * 0.4 && (a.kind === "target" || a.kind === "dummy" || a.kind === "hero");
            const dmg = b.dmg * (crit ? 1.5 : 1);
            b.hit = true;
            if (this.hooks.onBulletHit) this.hooks.onBulletHit(b, a, crit);
            this.damage(a, dmg, b.owner, crit);
            this.spark(b.x, b.y, a.kind === "target" ? "#fff" : a.color, crit ? 7 : 4, 150, 0.25);
            dead = true; break;
          }
        }
      }
      if (b.life <= 0) dead = true;
      if (dead) { if (!b.hit && this.hooks.onMiss) this.hooks.onMiss(b); }
      else alive.push(b);
    }
    this.bullets = alive;
  }
}
