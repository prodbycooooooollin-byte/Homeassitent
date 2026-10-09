# Deadlock Trainer

An in-game training mode for **Deadlock**, running on a local offline server. It is a plugin for
[Deadworks](https://github.com/Deadworks-net/deadworks) (server-side modding for Deadlock, C#).

Spawn on a normal map, a **menu floats in front of you**, shoot an exercise to start it, and you get the result **in chat**
(hits, early/late in ms, reaction times, rates). You are moved to a free area automatically and brought back afterwards.

## Exercises (version 0.5)

The menu has four categories and a difficulty row (EASY / NORMAL / HARD). All opponents are **bot heroes** (fake clients
that play a real hero - by default the *same hero as you*): they have real hitboxes and can do real melee attacks. The
plugin drives them (position, view direction, attack timing). Bots cannot kill you during an exercise.

| Category | Exercise | What happens |
| --- | --- | --- |
| PARRY | **Single** | One bot stands in front of you and swings at irregular intervals. You parry. |
| PARRY | **Multiple** | Three bots in a half circle; a random one swings. |
| PARRY | **Burst** | Several swings in a row (3 / 4 / 5 by difficulty). |
| FLICK | **Flick** | The bot jumps to new spots around you. Hit it (real damage counts) for a point + reaction time. |
| FLICK | **Switch** | Three bots at once - hit all of them (target switching). |
| FLICK | **Long Range** | One bot, far away. |
| TRACK | **Strafe** | The bot moves steadily back and forth. Keep the crosshair on it and shoot. |
| TRACK | **Random** | Same, but with abrupt direction changes. |
| OTHER | **Reaction** | Wait for the green "CLICK!" and shoot. Early clicks repeat the round. |
| OTHER | **Deny Souls** | Soul orbs rise from a "dead minion"; shoot each one before a rival grabs it (green -> yellow -> red). |
| OTHER | **Last Hit** | A minion's health drops as allies hit it; shoot to land the *killing* blow - not too early, not too late. |

Chat shows, per swing: **PARRIED!** with your press point in ms relative to the hit, or **HIT** with "too early / too late / no
parry". At the end you get the rate and a session best. Aim drills show the reaction time above the bot per hit and, for
tracking, the live hit rate above it.

**Difficulty:** easy = long warning (red `>>` above the head), big distances; normal = short warning; hard = no warning (read
the animation), short gaps, faster and wider aim targets.

**Exercise area:** during an exercise an invisible wall keeps you inside the training area (a few meters around your start
point). `!tstop` leaves the exercise.

**Where bots come from:** by default the plugin asks the game itself to spawn a hero dummy with its own cheat command
`citadel_create_unit <hero> <team>` (cheats are switched on for ~1.5 s and off again) and then drives it. If that produces nothing,
it falls back to a plugin-made fake client (`!tbot method fake`). The server writes `trainer_cvars_auto.txt` next to the plugin DLL
with all bot/spawn related console entries - useful for debugging.

**Aim markers:** every bot also gets a visible `O` marker at its chest by default, so you can always see where it is, even if
a bot model does not render. Hits still register on the bot itself. `!tmarker off` hides them.

## Commands

| Command | Purpose |
| --- | --- |
| `!train` / `!train off` | Open the menu here / switch it off |
| `!parry [single\|multi\|burst] [rounds] [level]` | Start parry directly |
| `!flick [flick\|switch\|long] [count] [level]` | Start flick directly |
| `!track [strafe\|random] [seconds] [level]` | Start tracking directly |
| `!reaction [rounds] [level]` | Reaction test |
| `!deny [count] [level]`, `!lasthit [count] [level]` | Deny souls / last-hit trainer |
| `!tlevel easy\|normal\|hard` | Default difficulty |
| `!tstop` | Abort the current exercise |
| `!tcam` | Shows whether your client's camera data is received (aiming uses the third-person camera ray, not the head) |
| `!tbot on` | Opt in to the game's own practice bots. **Off by default**: they crash the client on spawn (null pointer in client.dll). Default targets are hero-model props, hits are measured by geometry |
| `!tbot test` | **Bot self-test**: creates a bot, lets it swing, reports in chat (hero, model, events) |
| `!tbot method unit\|fake` | How bots are created (unit = game command, fake = fake client) |
| `!tbot hero <name\|same>` | Bot hero (same = your hero) |
| `!toffset <right> <up>` | Calibrate texts if the visible text is shifted relative to where it reacts |
| `!tbot off` / `!tbot on` | Emergency mode without bots (text targets) |
| `!tmarker on\|off` | Aim markers on bots |
| `!tarena` / `!tarena reset` | *Optional*: set your own arena / back to automatic |
| `!tcvars bot` | Search console commands/variables for "bot", writes `trainer_cvars.txt` |
| `!tface`, `!tfont`, `!tinput dwell`, `!tdebug`, `!tparrykey` | Troubleshooting helpers |

## Install (Windows)

Requirements: Deadlock (Steam) and the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0).

1. **Get Deadworks** from the [releases](https://github.com/Deadworks-net/deadworks/releases) (`deadworks-vX.Y.Z.zip`) and copy
   the contents of its `game` folder into `...\Deadlock\game`. Afterwards `...\Deadlock\game\bin\win64\deadworks.exe` exists.
2. **Build the plugin** (PowerShell, in this folder). With the default Steam path a plain build is enough:
   ```
   dotnet build -c Release
   ```
   (or `.\build.ps1`; for another install location pass the `win64` folder: `.\build.ps1 "D:\Games\Deadlock\game\bin\win64"`).
   This copies `DeadlockTrainer.dll` to `...\win64\managed\plugins\`.
3. **Start the server:** run `deadworks.exe` from `...\win64\` (keep the window open).
4. **Start Deadlock**, open the console (enable it in the settings, then F7) and run `connect localhost:27067`.
5. Pick a hero, spawn, and the menu appears (or type `!train`).

### Updating

`git pull`, close the server window, rebuild (same command), restart `deadworks.exe` (a restart is required), reconnect.

## First test (5 minutes)

Written against the real Deadworks API and compiled, but **not tested in the game**. The riskiest part is the bots, so there is
a self-test:

1. **`!tbot test`** creates a bot in front of you, shows its hero/model, makes it swing once and reports the events.
   - "No bot hero came into existence" -> the server gave no slot or `SelectHero` does not work for fake clients.
   - "The bot has NO model" -> its hero data did not load; it is invisible (use the markers).
   - "NO melee event" -> the bot stands but does not swing; parry then falls back to a simulation.
2. **`!train`** -> shoot *Single*: are you moved to an open area? Is a bot (or at least an `O` marker) in front of you?
3. Try Flick / Strafe: do hits register on the bot?

Report what does not work, ideally with the chat text and the server window output.

## Layout

- `src/Plugin.cs` - commands and hooks (input, parry state, frame loop, menu/arena flow)
- `src/Drills.cs` - base class and the menu; `src/ParryDrill.cs` - parry; `src/AimDrills.cs` - flick, tracking, reaction, bot self-test
- `src/Bots.cs` - bot management (fake clients); `src/Config.cs` - settings and difficulty numbers
- `src/Arena.cs` - automatic search for an open area; `src/Util.cs` - geometry, clock, input state, records

## Not there yet

- Counterspell/ability exercises against bots, headshot scoring, a movement course, records that survive restarts.
- A nicer UI than text in the world and chat.
