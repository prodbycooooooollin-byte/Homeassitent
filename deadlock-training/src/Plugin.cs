using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>
/// Trainingsmodus fuer Deadlock (Deadworks-Plugin). Menue vor dir zum Draufschiessen (Parry- und Aim-Uebungen gegen
/// echte Bot-Helden), dazu Chat-Befehle. Siehe README.md.
/// </summary>
public class TrainerPlugin : DeadworksPluginBase {
	public override string Name => "Deadlock Trainer";

	private sealed class Hub {
		public Vector3 Feet;
		public float Yaw;
	}

	private readonly HashSet<int> _humans = new();   // slots of real players (not bots)
	private readonly Dictionary<int, PlayerInput> _inputs = new();
	private readonly Dictionary<int, Drill> _drills = new();
	private readonly Dictionary<int, Hub> _hubs = new();
	private readonly Dictionary<int, Level> _levels = new();
	private readonly HashSet<int> _fromHub = new();     // exercise was started from the menu -> return afterwards
	private readonly HashSet<int> _returning = new();   // return trip is already scheduled
	private readonly HashSet<int> _noAutoMenu = new();  // player switched the menu off
	private readonly Dictionary<string, Vector3?> _autoArena = new();

	private bool _debug;
	/// <summary>Optionale rohe Button-Maske, die als Parry-Taste zaehlt (falls ParryActive nicht erkannt wird). 0 = aus.</summary>
	private ulong _parryMask;

	private const InputButton MovementKeys =
		InputButton.Forward | InputButton.Back | InputButton.MoveLeft | InputButton.MoveRight |
		InputButton.Jump | InputButton.Duck | InputButton.Speed | InputButton.TurnLeft | InputButton.TurnRight;

	// ---- Lebenszyklus ---------------------------------------------------------------------------------------------

	public override void OnLoad(bool isReload) {
		Arena.Load();
		Console.WriteLine(isReload ? "[Trainer] neu geladen" : "[Trainer] geladen - im Spiel !train tippen");
	}

	public override void OnUnload() {
		StopAll();
		Console.WriteLine("[Trainer] entladen");
	}

	private bool _cvarsDumped;

	/// <summary>Write all console variables/commands that contain any of the keywords to trainer_cvars_auto.txt (diagnostics).</summary>
	private void DumpCvarsOnce() {
		if (_cvarsDumped) return;
		_cvarsDumped = true;
		try {
			string[] words = ["bot", "unit", "sandbox", "spawn", "create_", "hero_testing", "practice", "dummy"];
			var lines = new List<string>();
			foreach (var v in Server.EnumerateConVars())
				if (words.Any(w => v.Name.Contains(w, StringComparison.OrdinalIgnoreCase)))
					lines.Add($"cvar {v.Name} = {v.Value} | {v.Description}");
			foreach (var c in Server.EnumerateConCommands())
				if (words.Any(w => c.Name.Contains(w, StringComparison.OrdinalIgnoreCase)))
					lines.Add($"cmd  {c.Name} | {c.Description}");
			var path = Path.Combine(Path.GetDirectoryName(typeof(TrainerPlugin).Assembly.Location) ?? ".", "trainer_cvars_auto.txt");
			File.WriteAllLines(path, lines);
			Console.WriteLine($"[Trainer] {lines.Count} bot/spawn related console entries written to {path}");
		} catch (Exception ex) {
			Console.WriteLine($"[Trainer] cvar dump failed: {ex.Message}");
		}
	}

	private bool _arenaCleaned;

	/// <summary>Training server setup: stop new minion waves, neutrals and power-ups (existing NPCs are only removed on request via !tclean; removing them at once crashed the client).</summary>
	private void CleanWorld() {
		try {
			foreach (var cmd in new[] { "sv_cheats 1", "citadel_npc_spawn_enabled 0", "citadel_trooper_spawn_enabled 0", "citadel_neutral_spawn_enabled 0", "citadel_powerup_spawn_enabled 0" })
				Server.ExecuteCommand(cmd);
			TrainerBots.CheatsOffAt = Clock.Ms + 1500;
			Console.WriteLine("[Trainer] World settings applied: no new minion waves / neutrals / power-ups.");
		} catch (Exception ex) { Console.WriteLine($"[Trainer] CleanWorld failed: {ex.Message}"); }
	}

	public override void OnStartupServer() {
		_arenaCleaned = false;
		DumpCvarsOnce();
		StopAll(); // map change: old entities and bots are gone
		TrainerBots.ClearAll();
		_hubs.Clear();
		_fromHub.Clear();
		_returning.Clear();
		_autoArena.Clear();
	}

	public override void OnPrecacheResources() {
		foreach (var h in TrainerConfig.PrecachedHeroes.Concat(TrainerConfig.BotPoolHeroes))
			Precache.AddHero(h);
	}

	public override void OnClientDisconnect(ClientDisconnectedEvent args) {
		if (TrainerBots.IsBotSlot(args.Slot)) {
			TrainerBots.Forget(args.Slot);
			return;
		}
		StopDrill(args.Slot);
		_humans.Remove(args.Slot);
		_inputs.Remove(args.Slot);
		_hubs.Remove(args.Slot);
		_levels.Remove(args.Slot);
		_fromHub.Remove(args.Slot);
		_returning.Remove(args.Slot);
		_noAutoMenu.Remove(args.Slot);
	}

	public override void OnEntitySpawned(EntitySpawnedEvent e) {
		try { SpawnWatch.Record(e.Entity); } catch { /* entity vanished */ }
	}

	public override void OnClientPutInServer(ClientPutInServerEvent args) {
		if (!args.IsBot && !TrainerBots.IsBotSlot(args.Slot)) _humans.Add(args.Slot);
	}

	/// <summary>A real player (not a bot we created or adopted).</summary>
	private bool IsHuman(int slot, CBaseEntity? ctl = null) {
		if (TrainerBots.IsBotSlot(slot)) return false;
		if (_humans.Contains(slot)) return true;
		// After a hot reload we may not have seen the connect event: accept anything that is not flagged as a bot.
		return _humans.Count == 0 && !(ctl?.IsBot ?? false);
	}

	public override void OnClientFullConnect(ClientFullConnectEvent args) {
		if (TrainerBots.IsBotSlot(args.Slot)) TrainerBots.Configure(args.Slot);
	}

	/// <summary>Sobald ein Held da ist, erscheint das Menue automatisch (ausschalten mit !train off).</summary>
	public override void OnPawnHeroInitialized(CCitadelPlayerPawn pawn) {
		var c = pawn.Controller;
		if (c == null) return;
		int slot = c.EntityIndex - 1;
		if (!IsHuman(slot, c)) return;
		if (!_arenaCleaned) { _arenaCleaned = true; Timer.Once(3.Seconds(), CleanWorld); }
		if (_hubs.ContainsKey(slot) || _noAutoMenu.Contains(slot) || _drills.ContainsKey(slot)) return;

		Timer.Once(2.Seconds(), () => {
			if (_hubs.ContainsKey(slot) || _noAutoMenu.Contains(slot) || _drills.ContainsKey(slot)) return;
			OpenMenu(c, placeHere: true);
		});
	}

	private void StopAll() {
		foreach (var d in _drills.Values) d.Stop();
		_drills.Clear();
	}

	private void StopDrill(int slot) {
		if (_drills.Remove(slot, out var d)) d.Stop();
	}

	private PlayerInput Input(int slot) {
		if (!_inputs.TryGetValue(slot, out var i)) _inputs[slot] = i = new PlayerInput();
		return i;
	}

	private Level LevelOf(int slot) => _levels.TryGetValue(slot, out var l) ? l : Level.Normal;

	// ---- Hooks ----------------------------------------------------------------------------------------------------

	public override void OnAbilityAttempt(AbilityAttemptEvent e) {
		var ctl = e.Controller;
		if (ctl == null || !IsHuman(e.PlayerSlot, ctl)) return;
		var inp = Input(e.PlayerSlot);

		bool attackHeld = (e.HeldButtons & InputButton.Attack) != 0;
		if (attackHeld && (e.ChangedButtons & InputButton.Attack) != 0) {
			var pawn = ctl.GetHeroPawn();
			if (pawn != null)
				inp.RegisterShot(new Shot(Clock.Ms, Aim.Eye(pawn), Aim.Dir(pawn)));
		}
		inp.AttackHeld = attackHeld;

		if (_parryMask != 0) {
			bool held = ((ulong)e.HeldButtons & _parryMask) != 0;
			bool changed = ((ulong)e.ChangedButtons & _parryMask) != 0;
			if (held && changed) inp.RegisterParryEdge(Clock.Ms);
		}

		if (_debug) {
			var changedNonMove = e.ChangedButtons & ~MovementKeys;
			if (changedNonMove != 0)
				ctl.PrintToConsole($"[dbg] buttons changed=0x{(ulong)e.ChangedButtons:X} held=0x{(ulong)e.HeldButtons:X}");
		}
	}

	/// <summary>Remember the client's camera position/angles: the crosshair ray starts at the camera, not at the hero's head.</summary>
	public override void OnProcessUsercmds(ProcessUsercmdsEvent e) {
		try {
			var pawn = e.Controller?.GetHeroPawn();
			if (pawn == null) return;
			for (int i = e.Usercmds.Count - 1; i >= 0; i--) {
				var cmd = e.Usercmds[i];
				if (cmd.VecCameraPosition is { } p)
					CamState.SetPos(pawn.EntityHandle, new Vector3(p.X, p.Y, p.Z));
				if (cmd.Base?.Viewangles is { } a)
					CamState.SetAng(pawn.EntityHandle, new Vector3(a.X, a.Y, a.Z));
				if (cmd.VecCameraPosition != null && cmd.Base?.Viewangles != null) break;
			}
		} catch { /* never disturb input processing */ }
	}

	public override HookResult OnTakeDamage(TakeDamageEvent args) {
		if (_drills.Count == 0) return HookResult.Continue;
		var result = HookResult.Continue;
		foreach (var d in _drills.Values.ToArray()) {
			try {
				if (d.OnTakeDamage(args) == HookResult.Stop) result = HookResult.Stop;
			} catch (Exception ex) {
				Console.WriteLine($"[Trainer] Fehler in {d.Name}.OnTakeDamage: {ex.Message}");
			}
		}
		return result;
	}

	public override void OnModifierEvent(ModifierEvent e) {
		foreach (var d in _drills.Values.ToArray()) {
			try { d.OnModifier(e); }
			catch (Exception ex) { Console.WriteLine($"[Trainer] Fehler in {d.Name}.OnModifier: {ex.Message}"); }
		}

		if (!_debug) return;
		if (e.Event is not (EModifierEvent.CheckForParry or EModifierEvent.ParrySuccess or
			EModifierEvent.MeleeAttack or EModifierEvent.MeleeAttackStarted)) return;

		foreach (var c in Players.GetAll()) {
			if (!IsHuman(c.EntityIndex - 1, c)) continue;
			var pawn = c.GetHeroPawn();
			if (pawn == null) continue;
			bool involved = e.Caster?.EntityHandle == pawn.EntityHandle || e.Target?.EntityHandle == pawn.EntityHandle;
			if (!involved) continue;
			string msg = $"[dbg] {e.Event} caster={e.Caster?.DesignerName ?? "-"} target={e.Target?.DesignerName ?? "-"}";
			c.PrintToConsole(msg);
			Chat.PrintToChat(c, msg);
		}
	}

	public override void OnGameFrame(bool simulating, bool firstTick, bool lastTick) {
		if (!simulating) return;
		double now = Clock.Ms;

		// Switch cheats off again after a unit-spawn command.
		if (TrainerBots.CheatsOffAt > 0 && now >= TrainerBots.CheatsOffAt) {
			TrainerBots.CheatsOffAt = -1;
			SpawnWatch.Log = false;
			try { Server.ExecuteCommand("sv_cheats 0"); } catch { }
		}

		foreach (var c in Players.GetAll()) {
			int slot = c.EntityIndex - 1;
			if (!IsHuman(slot, c)) continue;
			var pawn = c.GetHeroPawn();
			var inp = Input(slot);

			// Parry-Fenster der Engine beobachten (steigende Flanke = Parry ausgeloest).
			bool parry = pawn?.ModifierProp?.HasModifierState(EModifierState.ParryActive) ?? false;
			if (parry && !inp.ParryActive) inp.RegisterParryEdge(now);
			inp.ParryActive = parry;

			if (!_drills.TryGetValue(slot, out var drill)) continue;

			if (pawn == null || !pawn.IsAlive) {
				Chat.PrintToChat(c, "[Training] Exercise aborted (your hero is not alive).");
				bool wasExercise = drill is not MenuDrill;
				StopDrill(slot);
				if (wasExercise) ScheduleReturn(c, slot);
				continue;
			}

			try {
				drill.Update(pawn, now);
			} catch (Exception ex) {
				Console.WriteLine($"[Trainer] Fehler in {drill.Name}: {ex}");
				Chat.PrintToChat(c, $"[Training] Error in {drill.Name}: {ex.Message} (exercise ended)");
				drill.Finished = true;
			}

			if (drill.Finished && _drills.TryGetValue(slot, out var cur) && ReferenceEquals(cur, drill)) {
				_drills.Remove(slot);
				drill.Stop();
				if (drill is not MenuDrill) ScheduleReturn(c, slot);
			}
		}
	}

	// ---- Menue / Arena --------------------------------------------------------------------------------------------

	private bool Begin(CCitadelPlayerController c, Func<PlayerInput, Drill> make) {
		var pawn = c.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) {
			Chat.PrintToChat(c, "[Training] You need a living hero. Pick a hero and spawn first.");
			return false;
		}
		int slot = c.EntityIndex - 1;
		StopDrill(slot);
		var drill = make(Input(slot));
		_drills[slot] = drill;
		drill.Start(pawn, Clock.Ms);
		return true;
	}

	/// <summary>Zeigt das Menue vor dem Spieler. placeHere = Menue-Ort auf die aktuelle Position setzen.</summary>
	private void OpenMenu(CCitadelPlayerController c, bool placeHere) {
		var pawn = c.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) {
			Chat.PrintToChat(c, "[Training] You need a living hero. Pick a hero and spawn first.");
			return;
		}
		int slot = c.EntityIndex - 1;
		if (placeHere || !_hubs.ContainsKey(slot))
			_hubs[slot] = new Hub { Feet = pawn.Position, Yaw = pawn.EyeAngles.Y };
		_noAutoMenu.Remove(slot);
		var hub = _hubs[slot];
		Begin(c, input => new MenuDrill(c, input, LevelOf(slot), l => _levels[slot] = l, id => OnMenuSelect(c, slot, id),
			hub.Feet + new Vector3(0, 0, 64), hub.Yaw));
	}

	private void CloseMenu(CCitadelPlayerController c, string? message = "[Training] Menu switched off. !train brings it back.") {
		int slot = c.EntityIndex - 1;
		StopDrill(slot);
		_hubs.Remove(slot);
		_fromHub.Remove(slot);
		_noAutoMenu.Add(slot);
		if (message != null) Chat.PrintToChat(c, message);
	}

	private void OnMenuSelect(CCitadelPlayerController c, int slot, string id) {
		var lvl = LevelOf(slot);
		switch (id) {
			case "p_single": GoToArenaThen(c, slot, () => StartParry(c, ParryMode.Single, 10, lvl)); break;
			case "p_multi": GoToArenaThen(c, slot, () => StartParry(c, ParryMode.Multi, 10, lvl)); break;
			case "p_burst": GoToArenaThen(c, slot, () => StartParry(c, ParryMode.Burst, 4, lvl)); break;
			case "f_flick": GoToArenaThen(c, slot, () => StartFlick(c, FlickMode.Flick, 0, lvl)); break;
			case "f_switch": GoToArenaThen(c, slot, () => StartFlick(c, FlickMode.Switch, 0, lvl)); break;
			case "f_long": GoToArenaThen(c, slot, () => StartFlick(c, FlickMode.Long, 0, lvl)); break;
			case "t_strafe": GoToArenaThen(c, slot, () => StartTrack(c, false, 0, lvl)); break;
			case "t_random": GoToArenaThen(c, slot, () => StartTrack(c, true, 0, lvl)); break;
			case "o_reaction": GoToArenaThen(c, slot, () => StartReaction(c, 0, lvl)); break;
			case "o_deny": GoToArenaThen(c, slot, () => StartOrb(c, OrbMode.Deny, 0, lvl)); break;
			case "o_lasthit": GoToArenaThen(c, slot, () => StartOrb(c, OrbMode.LastHit, 0, lvl)); break;
			default: CloseMenu(c); break;
		}
	}

	private bool StartParry(CCitadelPlayerController c, ParryMode mode, int rounds, Level lvl) =>
		Begin(c, input => new ParryDrill(c, input, lvl, mode, rounds));

	private bool StartFlick(CCitadelPlayerController c, FlickMode mode, int count, Level lvl) =>
		Begin(c, input => new FlickDrill(c, input, lvl, mode, count));

	private bool StartTrack(CCitadelPlayerController c, bool random, int seconds, Level lvl) =>
		Begin(c, input => new TrackDrill(c, input, lvl, random, seconds));

	private bool StartReaction(CCitadelPlayerController c, int rounds, Level lvl) =>
		Begin(c, input => new ReactionDrill(c, input, lvl, rounds));

	private bool StartOrb(CCitadelPlayerController c, OrbMode mode, int count, Level lvl) =>
		Begin(c, input => new OrbDrill(c, input, lvl, mode, count));

	private Vector3? ArenaFor(Hub hub, CCitadelPlayerPawn pawn) {
		string map = Server.MapName;
		if (Arena.TryGet(map, out var saved)) return saved;
		if (!_autoArena.TryGetValue(map, out var auto)) {
			try { auto = Arena.Find(hub.Feet, pawn); }
			catch (Exception ex) { Console.WriteLine($"[Trainer] Arena-Suche fehlgeschlagen: {ex.Message}"); auto = null; }
			_autoArena[map] = auto;
		}
		return auto;
	}

	private void GoToArenaThen(CCitadelPlayerController c, int slot, Action start) {
		var pawn = c.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) return;
		if (!_hubs.TryGetValue(slot, out var hub)) {
			_hubs[slot] = hub = new Hub { Feet = pawn.Position, Yaw = pawn.EyeAngles.Y };
		}

		var arena = ArenaFor(hub, pawn);
		_fromHub.Add(slot);
		if (arena.HasValue) {
			pawn.TeleportWithView(arena.Value, new Vector3(0f, hub.Yaw, 0f));
			Chat.PrintToChat(c, "[Training] Here we go - you were moved to an open area. After the exercise you return to the menu.");
		}
		// Kurz warten, bis Position und Blickrichtung beim Spieler angekommen sind.
		Timer.Once(900.Milliseconds(), () => {
			if (_drills.ContainsKey(slot)) return; // inzwischen etwas anderes gestartet
			start();
		});
	}

	/// <summary>
	/// Nach einer Uebung das Menue wieder aufbauen. Wurde sie aus dem Menue gestartet, geht es vorher zurueck zum
	/// Menue-Ort; bei direkt getippten Befehlen (!parry ...) erscheint das Menue dort, wo du gerade stehst.
	/// </summary>
	private void ScheduleReturn(CCitadelPlayerController c, int slot) {
		bool teleportBack = _fromHub.Remove(slot);
		if (!_hubs.ContainsKey(slot) || !_returning.Add(slot)) return;
		Timer.Once(3.Seconds(), () => TryReturn(c, slot, teleportBack, 0));
	}

	private void TryReturn(CCitadelPlayerController c, int slot, bool teleportBack, int attempt) {
		if (!_hubs.TryGetValue(slot, out var hub)) { _returning.Remove(slot); return; }
		var pawn = c.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) {
			if (attempt >= 15) { _returning.Remove(slot); return; }
			Timer.Once(2.Seconds(), () => TryReturn(c, slot, teleportBack, attempt + 1));
			return;
		}
		_returning.Remove(slot);
		if (_drills.ContainsKey(slot)) return; // Spieler hat schon etwas Neues gestartet
		if (teleportBack)
			pawn.TeleportWithView(hub.Feet + new Vector3(0, 0, 8), new Vector3(0f, hub.Yaw, 0f));
		Timer.Once(700.Milliseconds(), () => {
			if (_drills.ContainsKey(slot)) return;
			OpenMenu(c, placeHere: !teleportBack);
		});
	}

	// ---- Befehle --------------------------------------------------------------------------------------------------

	[Command("train", "training", Description = "Open the training menu in front of you (shoot an exercise). train off = close it")]
	public void CmdTrain(CCitadelPlayerController caller, string sub = "") {
		switch (sub.Trim().ToLowerInvariant()) {
			case "off" or "aus" or "stop":
				CloseMenu(caller);
				return;
			case "help" or "hilfe" or "?":
				PrintHelp(caller);
				return;
		}
		OpenMenu(caller, placeHere: true);
	}

	[Command("tlevel", Description = "Difficulty: tlevel easy|normal|hard")]
	public void CmdLevel(CCitadelPlayerController caller, string level = "") {
		int slot = caller.EntityIndex - 1;
		var l = LevelParse.Parse(level, LevelOf(slot));
		_levels[slot] = l;
		Chat.PrintToChat(caller, $"[Training] Difficulty: {LevelParse.Label(l)}. Applies to the next exercise (reopen the menu with !train).");
	}

	[Command("parry", Description = "Parry against bots: parry [single|multi|burst] [rounds=10] [easy|normal|hard]")]
	public void CmdParry(CCitadelPlayerController caller, string mode = "multi", int rounds = 10, string level = "") {
		int slot = caller.EntityIndex - 1;
		var m = mode.Trim().ToLowerInvariant() switch {
			"single" or "einzel" or "1" => ParryMode.Single,
			"burst" or "salve" => ParryMode.Burst,
			_ => ParryMode.Multi,
		};
		StartParry(caller, m, m == ParryMode.Burst ? Math.Min(rounds, 8) : rounds, LevelParse.Parse(level, LevelOf(slot)));
	}

	[Command("flick", Description = "Flick aim against a bot: flick [flick|switch|long] [count] [easy|normal|hard]")]
	public void CmdFlick(CCitadelPlayerController caller, string mode = "flick", int count = 0, string level = "") {
		var m = mode.Trim().ToLowerInvariant() switch {
			"switch" or "multi" => FlickMode.Switch,
			"long" or "far" => FlickMode.Long,
			_ => FlickMode.Flick,
		};
		StartFlick(caller, m, count, LevelParse.Parse(level, LevelOf(caller.EntityIndex - 1)));
	}

	[Command("track", Description = "Tracking against a bot: track [strafe|random] [seconds=30] [easy|normal|hard]")]
	public void CmdTrack(CCitadelPlayerController caller, string mode = "strafe", int seconds = 30, string level = "") {
		bool random = mode.Trim().ToLowerInvariant() is "random" or "zufall" or "r";
		StartTrack(caller, random, seconds, LevelParse.Parse(level, LevelOf(caller.EntityIndex - 1)));
	}

	[Command("reaction", Description = "Reaction test: reaction [rounds] [easy|normal|hard]")]
	public void CmdReaction(CCitadelPlayerController caller, int rounds = 0, string level = "") =>
		StartReaction(caller, rounds, LevelParse.Parse(level, LevelOf(caller.EntityIndex - 1)));

	[Command("deny", Description = "Deny soul orbs before a rival grabs them: deny [count] [easy|normal|hard]")]
	public void CmdDeny(CCitadelPlayerController caller, int count = 0, string level = "") =>
		StartOrb(caller, OrbMode.Deny, count, LevelParse.Parse(level, LevelOf(caller.EntityIndex - 1)));

	[Command("lasthit", Description = "Last-hit trainer: land the killing blow on a minion: lasthit [count] [easy|normal|hard]")]
	public void CmdLastHit(CCitadelPlayerController caller, int count = 0, string level = "") =>
		StartOrb(caller, OrbMode.LastHit, count, LevelParse.Parse(level, LevelOf(caller.EntityIndex - 1)));

	[Command("tstop", Description = "End the current exercise (back to the menu)")]
	public void CmdStop(CCitadelPlayerController caller) {
		int slot = caller.EntityIndex - 1;
		bool wasExercise = _drills.TryGetValue(slot, out var d) && d is not MenuDrill;
		StopDrill(slot);
		Chat.PrintToChat(caller, "[Training] Exercise ended.");
		if (wasExercise) ScheduleReturn(caller, slot);
	}

	[Command("tarena", Description = "Optional: set your own arena (tarena) or go back to automatic (tarena reset)")]
	public void CmdArena(CCitadelPlayerController caller, string sub = "") {
		var pawn = caller.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) { Chat.PrintToChat(caller, "[Training] You need a living hero."); return; }
		string map = Server.MapName;
		if (sub.Trim().Equals("reset", StringComparison.OrdinalIgnoreCase)) {
			Arena.Reset(map);
			_autoArena.Remove(map);
			Chat.PrintToChat(caller, "[Training] Arena reset - an open area is searched automatically.");
			return;
		}
		Arena.Set(map, pawn.Position + new Vector3(0, 0, 8));
		Chat.PrintToChat(caller, $"[Training] Arena for {map} set to your current position.");
	}

	[Command("thero", Description = "Change your own hero: thero <name>  (e.g. thero wraith)")]
	public void CmdHero(CCitadelPlayerController caller, string name = "") {
		if (string.IsNullOrWhiteSpace(name) || !Enum.TryParse<Heroes>(name.Trim(), ignoreCase: true, out var hero) || !Enum.IsDefined(hero)) {
			Chat.PrintToChat(caller, "[Training] Unknown hero. Examples: Wraith, Haze, Inferno, Ghost, Hornet, Atlas, Bebop, Shiv, Kelvin, Lash, Mirage, Viper");
			return;
		}
		caller.SelectHero(hero);
		Chat.PrintToChat(caller, $"[Training] Hero: {hero}");
	}

	// ---- Bots / diagnostics ---------------------------------------------------------------------------------------

	[Command("tbot", Description = "Bots: tbot test | tbot method unit|fake | tbot hero <name|same> | tbot off | tbot on | tbot view on|off")]
	public void CmdBot(CCitadelPlayerController caller, string sub = "test", string arg = "") {
		switch (sub.Trim().ToLowerInvariant()) {
			case "off":
				TrainerConfig.NoBots = true;
				Chat.PrintToChat(caller, "[Training] Bots off: exercises use text targets (simplified).");
				return;
			case "on":
				TrainerConfig.NoBots = false;
				Chat.PrintToChat(caller, "[Training] Bots on.");
				return;
			case "method":
				TrainerConfig.BotMethod = arg.Trim().ToLowerInvariant() is "fake" or "client" ? BotMethod.Fake : BotMethod.Unit;
				Chat.PrintToChat(caller, $"[Training] Bot method: {TrainerConfig.BotMethod} (unit = the game's citadel_create_unit, fake = plugin fake client). citadel_create_unit exists: {TrainerBots.UnitCommandExists()}");
				return;
			case "view":
				TrainerConfig.WriteViewAngles = arg.Trim().ToLowerInvariant() is not ("off" or "aus" or "0");
				Chat.PrintToChat(caller, $"[Training] Writing the bots' view direction: {(TrainerConfig.WriteViewAngles ? "on" : "off")}");
				return;
			case "hero":
				if (arg.Trim().Equals("same", StringComparison.OrdinalIgnoreCase)) {
					TrainerConfig.BotHero = null;
					Chat.PrintToChat(caller, "[Training] Bot hero: same as yours.");
					return;
				}
				if (!Enum.TryParse<Heroes>(arg.Trim(), ignoreCase: true, out var h) || !TrainerConfig.PrecachedHeroes.Contains(h)) {
					Chat.PrintToChat(caller, "[Training] Possible bot heroes: same, " + string.Join(", ", TrainerConfig.PrecachedHeroes));
					return;
				}
				TrainerConfig.BotHero = h;
				Chat.PrintToChat(caller, $"[Training] Bot hero: {h}");
				return;
			case "try":
				TryBotVariant(caller, arg.Trim());
				return;
			case "kick":
				try { Server.ExecuteCommand("bot_kick_all"); } catch { }
				Chat.PrintToChat(caller, "[Training] bot_kick_all sent.");
				return;
			default:
				Begin(caller, input => new BotTestDrill(caller, input));
				return;
		}
	}

	private static readonly string[][] BotVariants = {
		new[] { "citadel_create_unit hero_wraith" },
		new[] { "citadel_create_unit my_hero" },
		new[] { "citadel_create_unit hero_wraith 2" },
		new[] { "citadel_create_unit hero_wraith 3" },
		new[] { "citadel_bot_practice_opponent hero_wraith", "citadel_spawn_practice_bots_count 1", "citadel_spawn_practice_bots 1" },
		new[] { "citadel_spawn_all_heroes_in_a_line" },
	};

	/// <summary>Diagnostic: run one candidate bot-spawn command (with cheats), capture its output, report what spawned.</summary>
	private void TryBotVariant(CCitadelPlayerController caller, string arg) {
		if (!int.TryParse(arg, out int n) || n < 1 || n > BotVariants.Length) {
			Chat.PrintToChat(caller, $"[Training] Use !tbot try 1..{BotVariants.Length}. Then see what appears; !tbot kick removes bots.");
			return;
		}
		var cmds = BotVariants[n - 1];
		double t0 = Clock.Ms;
		SpawnWatch.Log = true;
		Console.WriteLine($"[Trainer/Try] variant {n}: {string.Join(" ; ", cmds)}");
		Server.ExecuteCommand("sv_cheats 1");
		foreach (var c in cmds) {
			string cmd = c;
			Server.ExecuteCommand(cmd, o => {
				Console.WriteLine($"[Trainer/Try] '{cmd}' output: {o}");
				// The captured text can be huge and multi-line (it contained other log lines); an oversized chat message crashes the client.
				string one = string.IsNullOrWhiteSpace(o) ? "(no output)" : string.Join(" ", o.Split('\r', '\n', StringSplitOptions.RemoveEmptyEntries)).Trim();
				if (one.Length > 100) one = one[..100] + "...";
				Chat.PrintToChat(caller, $"[Try {n}] {cmd} -> {one}");
			});
		}
		TrainerBots.CheatsOffAt = Clock.Ms + 4000;
		Timer.Once(3.Seconds(), () => {
			var seen = SpawnWatch.Since(t0 - 50).Select(x => x.Designer).Where(d => d.Length > 0).GroupBy(d => d).Select(g => $"{g.Key} x{g.Count()}").Take(12);
			Chat.PrintToChat(caller, $"[Try {n}] spawned within 3 s: " + (seen.Any() ? string.Join(", ", seen) : "nothing"));
			SpawnWatch.Log = false;
		});
	}

	[Command("tclean", Description = "Remove NPCs: tclean troopers | neutrals | guardians | all (experimental - removing many at once crashed a client)")]
	public void CmdClean(CCitadelPlayerController caller, string what = "") {
		string[] prefixes = what.Trim().ToLowerInvariant() switch {
			"troopers" => new[] { "npc_trooper" },
			"neutrals" => new[] { "npc_neutral", "npc_super_neutral" },
			"guardians" => new[] { "npc_boss", "npc_barrack", "npc_base_defender" },
			"all" => new[] { "npc_trooper", "npc_neutral", "npc_super_neutral", "npc_boss", "npc_barrack", "npc_base_defender" },
			_ => Array.Empty<string>(),
		};
		if (prefixes.Length == 0) { Chat.PrintToChat(caller, "[Training] Use: !tclean troopers | neutrals | guardians | all"); return; }
		int n = 0;
		foreach (var e in Entities.All) {
			string d;
			try { d = e.DesignerName ?? ""; } catch { continue; }
			if (!prefixes.Any(d.StartsWith)) continue;
			// Spread the removal over time: a big burst hitches the server.
			int delay = 10 * (n / 5);
			var ent = e;
			Timer.Once(delay.Milliseconds(), () => { try { if (ent.IsValid) ent.Remove(); } catch { } });
			n++;
		}
		Chat.PrintToChat(caller, $"[Training] Removing {n} NPCs ('{what}') in small steps.");
	}

	[Command("tcam", Description = "Show where your camera and crosshair ray start (diagnostic for aiming offsets)")]
	public void CmdCam(CCitadelPlayerController caller) {
		var pawn = caller.GetHeroPawn();
		if (pawn == null) { Chat.PrintToChat(caller, "[Training] You need a hero."); return; }
		var head = pawn.EyePosition;
		bool hasPos = CamState.TryGetPos(pawn.EntityHandle, out var cam);
		bool hasAng = CamState.TryGetAng(pawn.EntityHandle, out var ang);
		Chat.PrintToChat(caller, $"[Training] head ({head.X:0},{head.Y:0},{head.Z:0}) | camera " + (hasPos ? $"({cam.X:0},{cam.Y:0},{cam.Z:0}) distance to head {Vector3.Distance(head, cam):0}" : "NOT received"));
		Chat.PrintToChat(caller, $"[Training] eye angles ({pawn.EyeAngles.X:0.0},{pawn.EyeAngles.Y:0.0}) | camera angles " + (hasAng ? $"({ang.X:0.0},{ang.Y:0.0})" : "NOT received"));
	}

	[Command("tmarker", Description = "Aim markers 'O' on bots: tmarker on|off (on by default so you always see the target)")]
	public void CmdMarker(CCitadelPlayerController caller, string arg = "") {
		TrainerConfig.ShowMarkers = arg.Trim().ToLowerInvariant() is not ("off" or "aus" or "0");
		Chat.PrintToChat(caller, $"[Training] Aim markers: {(TrainerConfig.ShowMarkers ? "on" : "off (only shown when the bot has no model)")}");
	}

	[Command("tcvars", Description = "Search console variables/commands by keyword (e.g. tcvars bot) - also writes trainer_cvars.txt")]
	public void CmdCvars(CCitadelPlayerController caller, string filter = "bot") {
		filter = filter.Trim();
		var lines = new List<string>();
		foreach (var v in Server.EnumerateConVars())
			if (v.Name.Contains(filter, StringComparison.OrdinalIgnoreCase) || v.Description.Contains(filter, StringComparison.OrdinalIgnoreCase))
				lines.Add($"cvar {v.Name} = {v.Value} ({v.Description})");
		foreach (var c in Server.EnumerateConCommands())
			if (c.Name.Contains(filter, StringComparison.OrdinalIgnoreCase) || c.Description.Contains(filter, StringComparison.OrdinalIgnoreCase))
				lines.Add($"cmd  {c.Name} ({c.Description})");
		try {
			var path = Path.Combine(Path.GetDirectoryName(typeof(TrainerPlugin).Assembly.Location) ?? ".", "trainer_cvars.txt");
			File.WriteAllLines(path, lines);
			Chat.PrintToChat(caller, $"[Training] {lines.Count} matches for '{filter}', saved to {path}");
		} catch (Exception ex) {
			Chat.PrintToChat(caller, $"[Training] {lines.Count} matches, file not writable: {ex.Message}");
		}
		foreach (var l in lines.Take(25)) caller.PrintToConsole(l);
	}

	[Command("tdebug", Description = "Debug output on/off (buttons, parry/melee events)")]
	public void CmdDebug(CCitadelPlayerController caller) {
		_debug = !_debug;
		Chat.PrintToChat(caller, $"[Training] Debug {(_debug ? "ON: buttons/parry events appear in the game console (F7)" : "OFF")}");
	}

	[Command("tparrykey", Description = "Set the parry key by bitmask (hex, from !tdebug output). No value: off.")]
	public void CmdParryKey(CCitadelPlayerController caller, string hex = "") {
		hex = hex.Trim();
		if (hex.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) hex = hex[2..];
		if (hex.Length == 0) {
			_parryMask = 0;
			Chat.PrintToChat(caller, "[Training] Extra parry key off (only the engine's parry window counts).");
			return;
		}
		if (!ulong.TryParse(hex, System.Globalization.NumberStyles.HexNumber, null, out var mask)) {
			Chat.PrintToChat(caller, "[Training] Invalid hex value.");
			return;
		}
		_parryMask = mask;
		Chat.PrintToChat(caller, $"[Training] Parry key: mask 0x{mask:X}");
	}

	[Command("tinput", Description = "Confirm aiming by 'click' (default) or 'dwell' (hold the crosshair briefly)")]
	public void CmdInput(CCitadelPlayerController caller, string mode = "") {
		TrainerConfig.Dwell = mode.Trim().ToLowerInvariant() is "dwell" or "halten";
		Chat.PrintToChat(caller, $"[Training] Hit detection: {(TrainerConfig.Dwell ? "dwell (hold the crosshair)" : "click")}");
	}

	[Command("tface", Description = "Rotate texts if they are mirrored/sideways: tface [degrees]")]
	public void CmdFace(CCitadelPlayerController caller, string degrees = "") {
		if (!float.TryParse(degrees, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d))
			d = (TrainerConfig.TextYawOffset + 90f) % 360f;
		TrainerConfig.TextYawOffset = d;
		Chat.PrintToChat(caller, $"[Training] Text rotation: {d:0} degrees. Reopen the menu with !train to check.");
	}

	[Command("toffset", Description = "Shift all texts relative to their aim point (calibration): toffset <right> <up>  (units, 0 0 = none)")]
	public void CmdOffset(CCitadelPlayerController caller, float right = 0f, float up = 0f) {
		TrainerConfig.TextOffsetRight = right;
		TrainerConfig.TextOffsetUp = up;
		Chat.PrintToChat(caller, $"[Training] Text offset: right {right:0}, up {up:0}. Reopen the menu with !train to check.");
	}

	[Command("tfont", Description = "Font for texts: tfont <name> | tfont default")]
	public void CmdFont(CCitadelPlayerController caller, string name = "") {
		TrainerConfig.Font = string.IsNullOrWhiteSpace(name) || name.Equals("default", StringComparison.OrdinalIgnoreCase) ? null : name;
		Chat.PrintToChat(caller, $"[Training] Font: {TrainerConfig.Font ?? "default"}");
	}

	private static void PrintHelp(CCitadelPlayerController c) {
		Chat.PrintToChat(c, "[Training] !train = menu (shoot an exercise) | !parry [single|multi|burst] | !flick [flick|switch|long] | !track [strafe|random] | !reaction | !deny | !lasthit | !tlevel easy|normal|hard | !tstop");
		Chat.PrintToChat(c, "[Training] Problems: !tbot test (check bots), !tbot off, !tmarker off, !tface, !tfont, !tinput dwell, !tdebug, !tcvars bot");
	}
}
