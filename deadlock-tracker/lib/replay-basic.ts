import { teamAdvantage } from "./insights";
import type { MatchDetails, MatchPlayer } from "./types";
import type { ReplayAnalysis, Scene, SceneFact } from "./replay-types";

/* Szenen-Analyse ohne Replay: Nur aus den normalen Match-Daten (Todeszeiten, Killer, Respawn-Zeiten, Souls-Verlauf). Positionen und Leben
 * fehlen hier – die Texte sagen deshalb, was sich belegen lässt (Überzahl, Teamfight, Rückstand, Folgetod), nicht mehr. */

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const k = (n: number) => `${(Math.abs(n) / 1000).toFixed(1).replace(".", ",")}k`;
const pick = <T,>(xs: T[], n: number) => xs[Math.abs(Math.round(n)) % xs.length];

export function analyzeBasic(d: MatchDetails, account: number, heroName: (id: number) => string): ReplayAnalysis {
  const me = d.players.find((p) => p.accountId === account);
  const out: ReplayAnalysis = { offset: 0, aligned: true, scenes: [], causes: {} };
  if (!me) return out;
  const bySlot = new Map(d.players.filter((p) => p.slot !== undefined).map((p) => [p.slot as number, p]));
  const kills = d.players.flatMap((p) => (p.deathLog ?? []).map((x) => ({ t: x.t, victim: p, killer: x.killerSlot !== undefined ? bySlot.get(x.killerSlot) : undefined, dur: x.durS ?? 0 }))).sort((a, b) => a.t - b.t);
  const adv = teamAdvantage(d).map((x) => ({ t: x.t, diff: me.team === 0 ? x.diff : -x.diff }));
  const lead = (t: number) => (adv.length ? adv.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), adv[0]).diff : null);
  const alive = (p: MatchPlayer, t: number) => !(p.deathLog ?? []).some((x) => t >= x.t && t < x.t + (x.durS ?? 0));
  const count = (t: number) => ({
    mine: d.players.filter((p) => p.team === me.team && p.accountId !== me.accountId && alive(p, t - 0.5)).length,
    enemy: d.players.filter((p) => p.team !== me.team && alive(p, t - 0.5)).length,
  });
  const name = (p?: MatchPlayer) => (p ? heroName(p.heroId) : "ein Gegner");
  const taken = (t: number) => {
    const tl = me.timeline; if (!tl || tl.t.length < 2) return null;
    const idx = (x: number) => tl.t.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(tl.t[b] - x) ? i : b), 0);
    return tl.taken[idx(t)] - tl.taken[idx(Math.max(0, t - 60))];
  };
  const myDeaths = kills.filter((x) => x.victim === me);

  kills.forEach((e, i) => {
    const isDeath = e.victim === me, isKill = e.killer === me;
    // Assists: aus dem Anstieg der Assist-Zahl der Zeitreihe
    let isAssist = false;
    if (!isDeath && !isKill && me.timeline && e.victim.team !== me.team) {
      const tl = me.timeline; const j = tl.t.findIndex((v) => v >= e.t);
      if (j > 0 && tl.a[j] > tl.a[j - 1] && Math.abs(tl.t[j] - e.t) <= 70) isAssist = true;
    }
    if (!isDeath && !isKill && !isAssist) return;
    const near = kills.filter((x) => x !== e && Math.abs(x.t - e.t) <= 14);
    const ownLost = near.filter((x) => x.victim.team === me.team).length + (e.victim.team === me.team ? 1 : 0);
    const enemyLost = near.filter((x) => x.victim.team !== me.team).length + (e.victim.team !== me.team ? 1 : 0);
    const c = count(e.t);
    const l = lead(e.t);
    const facts: SceneFact[] = [];
    const n = i * 7 + Math.round(e.t);

    if (isDeath) {
      const prev = myDeaths[myDeaths.indexOf(e) - 1];
      const aliveS = prev ? Math.round(e.t - prev.t - prev.dur) : null;
      const trade = kills.find((x) => x !== e && x.victim.team !== me.team && x.t >= e.t - 2 && x.t <= e.t + 9);
      const dmg = taken(e.t);
      const causes: { key: string; w: number }[] = [];
      if (c.enemy >= c.mine + 3) causes.push({ key: "outnumbered", w: 3 + (c.enemy - c.mine) * 0.3 });
      if (ownLost + enemyLost >= 4 && ownLost > enemyLost) causes.push({ key: "teamfight", w: 2.8 });
      if (aliveS !== null && aliveS < 45) causes.push({ key: "fresh", w: 2.6 });
      if (l !== null && l < -4000) causes.push({ key: "behind", w: 2.2 + Math.min(1.5, Math.abs(l) / 8000) });
      if (near.length === 0) causes.push({ key: "isolated", w: 2.4 });
      if (trade) causes.push({ key: "trade", w: 1.5 });
      if (!causes.length) causes.push({ key: "lost", w: 1 });
      causes.sort((a, b) => b.w - a.w);
      const main = causes[0].key;

      facts.push({ key: "killer", tone: "info", text: `Gefallen durch ${name(e.killer)}` });
      facts.push({ key: "num", tone: c.enemy > c.mine + 1 ? "bad" : "info", text: `Lebend zu dem Zeitpunkt: ${c.mine + 1} von euch, ${c.enemy} Gegner` });
      if (near.length) facts.push({ key: "fight", tone: ownLost > enemyLost ? "bad" : "info", text: `${near.length + 1} Tode in 14 s (${ownLost} bei euch, ${enemyLost} bei ihnen)` });
      else facts.push({ key: "alone", tone: "bad", text: "Kein weiterer Tod in der Umgebung – ein einzelner Pick" });
      if (aliveS !== null) facts.push({ key: "alive", tone: aliveS < 45 ? "bad" : "info", text: `${aliveS} s seit dem Respawn` });
      if (l !== null) facts.push({ key: "lead", tone: l < 0 ? "bad" : "good", text: `Souls-Differenz ${l >= 0 ? "+" : "−"}${k(l)}` });
      if (dmg !== null && dmg > 0) facts.push({ key: "dmg", tone: "info", text: `${k(dmg)} Schaden in der Minute vorher eingesteckt` });
      if (e.dur) facts.push({ key: "dur", tone: "bad", text: `${Math.round(e.dur)} s Respawn-Zeit` });
      facts.push({ key: "gain", tone: trade ? "good" : "bad", text: trade ? `Dein Team hat ${name(trade.victim)} danach erwischt` : "Kein Gegenwert danach" });

      const t = { headline: "", why: "", advice: "" };
      const killer = name(e.killer);
      switch (main) {
        case "outnumbered":
          t.headline = `Unterzahl ${c.mine + 1} gegen ${c.enemy} – ${killer}`;
          t.why = `Als du gefallen bist, waren auf deiner Seite ${c.mine + 1}, bei den Gegnern ${c.enemy} Spieler am Leben. In dieser Lage ist jeder Kampf ein Nachteil.`;
          t.advice = `Zähle vor dem Kampf, wer lebt: Bei ${c.enemy - c.mine - 1} fehlenden Mitspielern ist Abstand halten und auf Respawns warten besser als ein Alleingang.`;
          break;
        case "teamfight":
          t.headline = `Teamfight verloren (${ownLost}:${enemyLost}) – ${killer}`;
          t.why = `Innerhalb von 14 Sekunden fielen ${ownLost} von euch und ${enemyLost} von ihnen. Du warst Teil eines Kampfes, den dein Team verloren hat${l !== null && l < 0 ? `, bei einem Souls-Rückstand von ${k(l)}` : ""}.`;
          t.advice = `Bei Teamfights hilft ein klarer Einstieg: Warte, bis eure wichtigsten Fähigkeiten bereit sind, und bleib bei der Gruppe, statt als Erster oder Letzter zu stehen.`;
          break;
        case "fresh":
          t.headline = `Kurz nach dem Respawn wieder gefallen – ${killer}`;
          t.why = `Du warst erst ${aliveS} Sekunden zurück im Spiel. Zwei Tode kurz hintereinander kosten doppelt: ${Math.round(e.dur)} s Wartezeit und Souls.`;
          t.advice = `Nach dem Respawn kurz Lage prüfen und mit dem Team zurückkehren, statt allein an dieselbe Stelle zu laufen.`;
          break;
        case "behind":
          t.headline = `Im Rückstand gefallen – ${killer}`;
          t.why = `Dein Team lag ${k(l ?? 0)} Souls zurück. Mit weniger Items verlierst du direkte Kämpfe häufiger, besonders gegen ${killer}.`;
          t.advice = `Im Rückstand ist sicheres Farmen und das Verteidigen von Objectives wichtiger als Kämpfe in der Mitte – lass die Gegner kommen.`;
          break;
        case "isolated":
          t.headline = `Einzelner Pick durch ${killer}`;
          t.why = `Im Umfeld ist niemand sonst gefallen: Du wurdest gezielt erwischt${aliveS !== null ? `, ${aliveS} s nach dem letzten Respawn` : ""}${dmg ? ` und hattest vorher ${k(dmg)} Schaden eingesteckt` : ""}.`;
          t.advice = pick([
            `Gezielte Picks passieren meist abseits des Teams. Bleib in der Nähe eines Verbündeten, besonders wenn Gegner auf der Karte fehlen.`,
            `Wenn mehrere Gegner nicht zu sehen sind, halte mehr Abstand zu Engstellen und plane deinen Rückweg.`,
          ], n);
          break;
        case "trade":
          t.headline = `Getauscht – ${killer}`;
          t.why = `Kurz nach deinem Tod ist ein Gegner gefallen. Der Tod war nicht umsonst.`;
          t.advice = `Solche Tausche passen, wenn dein Team sie ausnutzt. Prüfe, ob du den Tausch mit mehr Leben hättest gewinnen können.`;
          break;
        default:
          t.headline = `Kampf verloren – ${killer}`;
          t.why = `${c.mine + 1} gegen ${c.enemy}, ${l !== null ? `Souls-Differenz ${l >= 0 ? "+" : "−"}${k(l)}` : "ohne klaren Auslöser in den Daten"}.`;
          t.advice = `Ohne Replay lässt sich hier nicht mehr belegen. Mit der Karte siehst du, wer zuerst Schaden gemacht hat.`;
      }
      out.scenes.push({ id: `d${i}`, kind: "death", t: e.t, rt: e.t, other: -1, otherHero: e.killer?.heroId, helpers: [], ...t, facts, cause: main, basic: true });
      out.causes[main] = (out.causes[main] ?? 0) + 1;
    } else {
      const kind = isKill ? "kill" : "assist";
      const v = name(e.victim);
      const key = near.length === 0 ? "pick" : enemyLost > ownLost ? "teamfight" : "duel";
      facts.push({ key: "victim", tone: "info", text: `${v} gefallen bei ${clock(e.t)}` });
      facts.push({ key: "num", tone: c.mine + 1 > c.enemy ? "good" : "info", text: `Lebend: ${c.mine + 1} von euch, ${c.enemy} Gegner` });
      if (near.length) facts.push({ key: "fight", tone: enemyLost > ownLost ? "good" : "info", text: `${near.length + 1} Tode in 14 s (${enemyLost} bei ihnen, ${ownLost} bei euch)` });
      if (l !== null) facts.push({ key: "lead", tone: l > 0 ? "good" : "info", text: `Souls-Differenz ${l >= 0 ? "+" : "−"}${k(l)}` });
      const verb = isKill ? "erwischt" : "mitgeholfen";
      let headline = "", why = "", advice = "";
      if (key === "pick") {
        headline = `${isKill ? "Pick" : "Assist bei Pick"} auf ${v}`; why = `Im Umfeld ist sonst niemand gefallen – ${v} wurde gezielt ${verb}.`;
        advice = `Gut: gezielt einzelne Gegner erwischen verschafft euch Überzahl und Zeit für Objectives. Nutze das Zeitfenster direkt für ein Gebäude oder Mid Boss.`;
      } else if (key === "teamfight") {
        headline = `Teamfight gewonnen (${enemyLost}:${ownLost}) – ${v}`; why = `${enemyLost} Gegner und ${ownLost} von euch sind in 14 Sekunden gefallen. Du hast an der Seite mitgewirkt, die den Kampf gewonnen hat.`;
        advice = `Setze nach gewonnenen Kämpfen sofort nach (Objective, Souls-Camps), solange die Gegner tot sind.`;
      } else {
        headline = `${isKill ? "Duell gewonnen" : "Unterstützung"} gegen ${v}`; why = `${c.mine + 1} gegen ${c.enemy} am Leben – ${v} fiel in einem Kampf mit mehreren Toden.`;
        advice = `Weiter so: Kämpfe suchen, in denen ihr in der Überzahl seid.`;
      }
      out.scenes.push({ id: `${isKill ? "k" : "a"}${i}`, kind, t: e.t, rt: e.t, other: -1, otherHero: e.victim.heroId, helpers: [], headline, why, advice, facts, cause: key, basic: true });
    }
  });
  return out;
}
