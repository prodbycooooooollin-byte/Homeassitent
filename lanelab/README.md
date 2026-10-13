# Lanelab

Solo training modes for Deadlock, written as a [Modlock](https://github.com/paralin/modlock)
mod in TypeScript. Open `/menu` in game for the interface; every mode also has a chat command.

| Mode | Command | What it trains |
| --- | --- | --- |
| Aim Range | `/aim [click\|head\|strafe\|flick\|switch\|track\|long]` | Clicking, head height, strafe leading, reflex flicks, target switching, tracking, long shots. Combo multiplier, head-shot bonus, session best. |
| Last-Hit Lab | `/lasthit` | Troopers bleed down; land the killing blow while they are low, deny ally troopers. Efficiency and streak. |
| Checkpoint Rush | `/rush` | New floor checkpoints around you every run; splits, session best. Works on any map. |
| Flow Meter | `/flow` | Hold speed over a line to grow a multiplier; chain dashes and slides. |
| Route Studio | `/route add\|undo\|clear\|run` | Build your own route where you stand and race it. |
| Duel Ladder | `/duel` | Beat a bot with eight heroes in a row. |
| Sandbox | `/dps` `/refill` `/souls [n]` `/bot [hero] [fight]` `/nobots` `/clean` | DPS meter, refills, souls, practice dummies or sparring bots. |

`/stop` ends the running mode and shows its result. Settings (accent color, HUD size,
Aim Range length) live in the game's mod settings.

## Run it

**Windows, automatisch:** Doppelklick auf `Start-Lanelab.cmd`. Es lädt Modlock selbst herunter, baut den Mod, startet den Server und öffnet Deadlock über Steam.

**Manuell:**

1. Download `modlock` from the [releases](https://github.com/paralin/modlock/releases).
2. `cd lanelab && modlock dev`

`modlock publish` uploads it to hyperline.gg.

## Develop

```sh
modlock build        # type-check and bundle
bun test             # logic and a fake game that drives every mode and the UI
```

`bun test` needs `node_modules/modlock`, which `modlock new` / `modlock build` creates.

## Honest limits

This was written without access to the game, so what the tests prove is the logic, the
event handling and the UI tree against a fake game. Things to check on a real server:

- **Hero ids** in the Duel Ladder (`hero_haze`, `hero_inferno`, `hero_orion`, `hero_hornet`,
  `hero_bebop`, `hero_shiv`, `hero_atlas`). Only `hero_wraith` and `hero_inferno` appear in
  the Modlock sources. An id the server lacks is skipped.
- **Bot behavior** is switched with `citadel_bot_brain_disable_attacks` and
  `..._disable_movement`. They are server wide, so a passive mode (Aim Range) and a hostile
  one (Duel Ladder, `/bot fight`) cannot run at the same time; the mod refuses the second.
- **Buttons** need a cursor in game; the chat commands always work.
- Layout is built from Modlock's panel/label/button elements; sizes may need a tweak.
