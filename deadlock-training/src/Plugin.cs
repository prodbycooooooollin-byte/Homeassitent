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
		BotPool.GuardLoad();
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
	private readonly HashSet<int> _infiniteAmmo = new();

	/// <summary>Training server setup: stop new minion waves, neutrals and power-ups (existing NPCs are only removed on request via !tclean; removing them at once crashed the client).</summary>
	private void CleanWorld() {
		// Intentionally empty. Switching off npc/trooper/neutral spawns with cvars coincided with every client crash after the
		// bot spawn (the cvars replicate to the client); runs before that change worked. Use !tclean for single groups instead.
	}

	public override void OnStartupServer() {
		_arenaCleaned = false;
		Actor.BodyReadyAt = 0;
		DumpCvarsOnce();
		StopAll(); // map change: old entities and bots are gone
		TrainerBots.ClearAll();
		BotPool.Clear();
		_hubs.Clear();
		_fromHub.Clear();
		_returning.Clear();
		_autoArena.Clear();
	}

	public override void OnPrecacheResources() {
		foreach (var h in TrainerConfig.PrecachedHeroes)
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
		if (BotPool.GuardNotice != null) { var n = BotPool.GuardNotice; BotPool.GuardNotice = null; Timer.Once(6.Seconds(), () => { try { Chat.PrintToChat(c, "[Training] " + n); } catch { } }); }
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

		TrainerBots.Pump(now);

		// Switch cheats off again after a unit-spawn command.
		if (TrainerBots.CheatsOffAt > 0 && now >= TrainerBots.CheatsOffAt) {
			TrainerBots.CheatsOffAt = -1;
			SpawnWatch.Log = false;
			try { Server.ExecuteCommand("sv_cheats 0"); } catch { }
		}

		var human = Players.GetAll().FirstOrDefault(p => IsHuman(p.EntityIndex - 1, p));
		if (human != null) {
			BotPool.Active = _drills.TryGetValue(human.EntityIndex - 1, out var cd) && cd is MenuDrill;
			try { BotPool.Update(now, human); } catch (Exception ex) { Console.WriteLine($"[Trainer] Pool error: {ex.Message}"); }
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

			// Unlimited ammo during exercises (not in the menu).
			try {
				bool exercise = _drills.TryGetValue(slot, out var dr) && dr is not MenuDrill;
				if (exercise) { pawn?.ModifierProp?.SetModifierState(EModifierState.InfiniteClip, true); _infiniteAmmo.Add(slot); }
				else if (_infiniteAmmo.Remove(slot)) pawn?.ModifierProp?.SetModifierState(EModifierState.InfiniteClip, false);
			} catch { }

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
		WarmUpBody(pawn);
		if (placeHere || !_hubs.ContainsKey(slot))
			_hubs[slot] = new Hub { Feet = pawn.Position, Yaw = pawn.EyeAngles.Y };
		_noAutoMenu.Remove(slot);
		var hub = _hubs[slot];
		Begin(c, input => new MenuDrill(c, input, LevelOf(slot), l => _levels[slot] = l, id => OnMenuSelect(c, slot, id),
			hub.Feet + new Vector3(0, 0, 64), hub.Yaw));
	}

	private CBaseEntity? _warmBody;

	/// <summary>Spawn one stand-in body behind the player while the menu is open, so the client has streamed the model in by the time an exercise starts.</summary>
	private void WarmUpBody(CCitadelPlayerPawn pawn, int attempt = 0) {
		if (!TrainerConfig.NoBots || Actor.BodyReadyAt > 0) return;
		string m = "";
		try { m = pawn.ModelName ?? ""; } catch { }
		if (string.IsNullOrEmpty(m)) {
			Console.WriteLine($"[Trainer] Warm-up body: the hero has no model yet (attempt {attempt}).");
			if (attempt < 8) Timer.Once(2.Seconds(), () => { try { if (pawn.IsValid) WarmUpBody(pawn, attempt + 1); } catch { } });
			return;
		}
		Actor.PlayerModel = m;
		_warmBody = Actor.MakeBody(pawn.Position - Aim.Forward(0f, pawn.EyeAngles.Y) * 350f);
		Console.WriteLine($"[Trainer] Warm-up body created: model '{m}', entity {(_warmBody != null ? _warmBody.EntityIndex.ToString() : "none")}");
		Timer.Once(60.Seconds(), () => { try { if (_warmBody != null && _warmBody.IsValid) _warmBody.Remove(); } catch { } _warmBody = null; });
	}

	[Command("tbothero", Description = "Experimental: switch the pooled bots to a hero: tbothero <name> [number]  (e.g. tbothero haze 1). Only heroes from the precached list work.")]
	public void CmdBotHero(CCitadelPlayerController caller, string name = "", string which = "") {
		if (!Enum.TryParse<Heroes>(name.Trim(), ignoreCase: true, out var hero) || !TrainerConfig.PrecachedHeroes.Contains(hero)) {
			Chat.PrintToChat(caller, "[Training] Heroes: " + string.Join(", ", TrainerConfig.PrecachedHeroes));
			return;
		}
		var list = BotPool.Controllers();
		if (list.Count == 0) { Chat.PrintToChat(caller, "[Training] No pooled bots yet."); return; }
		int idx = int.TryParse(which.Trim(), out var n) ? Math.Clamp(n, 1, list.Count) - 1 : 0;
		try {
			list[idx].SelectHero(hero);
			Chat.PrintToChat(caller, $"[Training] Bot {idx + 1}/{list.Count} -> {hero}. Check the top bar and whether the bot changed. (experimental)");
		} catch (Exception ex) { Chat.PrintToChat(caller, $"[Training] Could not change the hero: {ex.Message}"); }
	}

	[Command("tpos", Description = "Print your exact position and view direction (so good training spots can be built in as defaults)")]
	public void CmdPos(CCitadelPlayerController caller, string label = "") {
		var pawn = caller.GetHeroPawn();
		if (pawn == null) { Chat.PrintToChat(caller, "[Training] You need a hero."); return; }
		var p = pawn.Position;
		float yaw = pawn.EyeAngles.Y;
		string line = $"POS {label.Trim()} map={Server.MapName} x={p.X:0} y={p.Y:0} z={p.Z:0} yaw={yaw:0}";
		Console.WriteLine("[Trainer] " + line);
		Chat.PrintToChat(caller, "[Training] " + line);
	}

	[Command("tscan", Description = "Rescan the map for training spots and show what was found")]
	public void CmdScan(CCitadelPlayerController caller) {
		var pawn = caller.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) { Chat.PrintToChat(caller, "[Training] You need a living hero."); return; }
		string map = Server.MapName;
		Arena.Reset(map + "#auto"); Arena.Reset(map + "#autolong"); _scanned.Remove(map); _autoArena.Remove(map);
		_scanned.Add(map);
		string msg;
		try { msg = Arena.FindGlobal(map, _hubs.TryGetValue(caller.EntityIndex - 1, out var h) ? h.Feet : pawn.Position, pawn); }
		catch (Exception ex) { msg = "scan failed: " + ex.Message; }
		Chat.PrintToChat(caller, "[Training] Scan: " + (msg.Length > 230 ? msg[..230] : msg));
	}

	[Command("tbotz", Description = "Raise (or lower) the bots if they stand in the ground: tbotz 30")]
	public void CmdBotZ(CCitadelPlayerController caller, string v = "") {
		if (float.TryParse(v.Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var f)) TrainerConfig.BotZOffset = Math.Clamp(f, -100f, 150f);
		Chat.PrintToChat(caller, $"[Training] Bot height offset: {TrainerConfig.BotZOffset:0} (applies the next time a bot is placed)");
	}

	[Command("tflags", Description = "List console commands the server may run on your client (ServerCanExecute): tflags <keyword>. Saved to trainer_flags.txt")]
	public void CmdFlags(CCitadelPlayerController caller, string filter = "") {
		filter = filter.Trim();
		var lines = new List<string>();
		foreach (var c in Server.EnumerateConCommands()) {
			if (filter.Length > 0 && !c.Name.Contains(filter, StringComparison.OrdinalIgnoreCase)) continue;
			var f = (FCVar)c.Flags;
			lines.Add($"{(f.HasFlag(FCVar.ServerCanExecute) ? "[SERVER-OK]" : "[no]       ")} {(f.HasFlag(FCVar.Cheat) ? "[cheat]" : "       ")} {c.Name} | {c.Description}");
		}
		int ok = lines.Count(l => l.StartsWith("[SERVER-OK]"));
		Console.WriteLine($"[Trainer/Flags] '{filter}': {lines.Count} commands, {ok} server-executable");
		foreach (var l in lines.Where(l => l.StartsWith("[SERVER-OK]")).Take(60)) Console.WriteLine("[Trainer/Flags] " + (l.Length > 200 ? l[..200] : l));
		var names = lines.Where(l => l.StartsWith("[SERVER-OK]")).Select(l => l.Split(' ', StringSplitOptions.RemoveEmptyEntries).Skip(1).FirstOrDefault(w => !w.StartsWith("[")) ?? "").Take(8);
		Chat.PrintToChat(caller, $"[Training] {lines.Count} commands match '{filter}', {ok} server-executable" + (ok > 0 ? ": " + string.Join(", ", names) : ".") + " (details in the server window)");
	}

	[Command("tcheats", Description = "Switch sv_cheats on/off for testing (lets you type game cheat commands such as citadel_create_unit in your own console)")]
	public void CmdCheats(CCitadelPlayerController caller, string arg = "on") {
		bool on = arg.Trim().ToLowerInvariant() is not ("off" or "0" or "aus");
		TrainerBots.CheatsOffAt = -1;
		Server.ExecuteCommand(on ? "sv_cheats 1" : "sv_cheats 0");
		Chat.PrintToChat(caller, $"[Training] sv_cheats {(on ? "1 (on)" : "0 (off)")}. Try in your own console (F7 / ~): citadel_create_unit hero_wraith");
	}

	[Command("tbody", Description = "Spawn a stand-in hero model 350 units behind you (diagnostic for the target models)")]
	public void CmdBody(CCitadelPlayerController caller) {
		var pawn = caller.GetHeroPawn();
		if (pawn == null) { Chat.PrintToChat(caller, "[Training] You need a hero."); return; }
		string m = "";
		try { m = pawn.ModelName ?? ""; } catch { }
		Chat.PrintToChat(caller, $"[Training] Hero model: '{(m.Length > 0 ? m : "(empty)")}'");
		if (m.Length == 0) return;
		Actor.PlayerModel = m;
		var b = Actor.MakeBody(pawn.Position - Aim.Forward(0f, pawn.EyeAngles.Y) * 350f);
		Chat.PrintToChat(caller, b != null ? "[Training] Body spawned behind you. It may take ~10 s to become visible." : "[Training] Could not create the body (see the server window).");
		if (b != null) Timer.Once(60.Seconds(), () => { try { if (b.IsValid) b.Remove(); } catch { } });
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
			case "f_long": GoToArenaThen(c, slot, () => StartFlick(c, FlickMode.Long, 0, lvl), longRange: true); break;
			case "t_strafe": GoToArenaThen(c, slot, () => StartTrack(c, false, 0, lvl)); break;
			case "t_random": GoToArenaThen(c, slot, () => StartTrack(c, true, 0, lvl)); break;
			case "o_reaction": GoToArenaThen(c, slot, () => StartReaction(c, 0, lvl)); break;
			case "o_deny": GoToArenaThen(c, slot, () => StartOrb(c, OrbMode.Deny, 0, lvl)); break;
			case "o_lasthit": GoToArenaThen(c, slot, () => StartOrb(c, OrbMode.LastHit, 0, lvl)); break;
			case "sp_arena":
			case "sp_long":
			case "sp_reset": SetSpot(c, slot, id); break;
			default: CloseMenu(c); break;
		}
	}

	/// <summary>Menu entries to choose training spots: the spot is where you stood when the menu was opened (!train opens it where you are).</summary>
	private void SetSpot(CCitadelPlayerController c, int slot, string id) {
		string map = Server.MapName;
		if (!_hubs.TryGetValue(slot, out var hub)) { Timer.Once(500.Milliseconds(), () => OpenMenu(c, true)); return; }
		var pos = hub.Feet + new Vector3(0, 0, 8);
		switch (id) {
			case "sp_arena":
				Arena.SetWithYaw(map, pos, hub.Yaw);
				Chat.PrintToChat(c, "[Training] Training spot saved: all exercises now start where this menu stands, looking the way you looked.");
				break;
			case "sp_long":
				Arena.SetWithYaw(map + "#long", pos, hub.Yaw);
				Chat.PrintToChat(c, "[Training] Long-range spot saved: Long Range now starts here and the targets appear in the direction you were looking.");
				break;
			default:
				Arena.Reset(map); Arena.Reset(map + "#long"); Arena.Reset(map + "#auto"); Arena.Reset(map + "#autolong");
				_autoArena.Remove(map); _scanned.Remove(map);
				Chat.PrintToChat(c, "[Training] Spots reset.");
				break;
		}
		Timer.Once(500.Milliseconds(), () => { if (!_drills.ContainsKey(slot)) OpenMenu(c, false); });
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

	/// <summary>Where to train: your own spot (!tarena), else the best spots found by scanning the map once (saved per map).</summary>
	private (Vector3 Pos, float? Yaw)? ArenaFor(Hub hub, CCitadelPlayerPawn pawn, bool longRange = false) {
		string map = Server.MapName;
		if (longRange && Arena.TryGet(map + "#long", out var savedLong)) return (savedLong, Arena.TryGetYaw(map + "#long", out var ly) ? ly : null);
		if (Arena.TryGet(map, out var saved)) return (saved, Arena.TryGetYaw(map, out var ny) ? ny : null);

		if (!Arena.TryGet(map + "#auto", out _) && !Arena.TryGetAutoLong(map, out _, out _) && !_scanned.Contains(map)) {
			_scanned.Add(map);
			try { Arena.FindGlobal(map, hub.Feet, pawn); }
			catch (Exception ex) { Console.WriteLine($"[Trainer] Map scan failed: {ex.Message}"); }
		}
		if (longRange && Arena.TryGetAutoLong(map, out var lp, out var lyaw)) return (lp, lyaw);
		if (Arena.TryGet(map + "#auto", out var auto)) return (auto, null);

		if (!_autoArena.TryGetValue(map, out var local)) {
			try { local = Arena.Find(hub.Feet, pawn); }
			catch (Exception ex) { Console.WriteLine($"[Trainer] Arena-Suche fehlgeschlagen: {ex.Message}"); local = null; }
			_autoArena[map] = local;
		}
		return local.HasValue ? (local.Value, null) : null;
	}

	private readonly HashSet<string> _scanned = new();

	private void GoToArenaThen(CCitadelPlayerController c, int slot, Action start, bool longRange = false) {
		var pawn = c.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) return;
		if (!_hubs.TryGetValue(slot, out var hub)) {
			_hubs[slot] = hub = new Hub { Feet = pawn.Position, Yaw = pawn.EyeAngles.Y };
		}

		var arena = ArenaFor(hub, pawn, longRange);
		_fromHub.Add(slot);
		if (arena.HasValue) {
			pawn.TeleportWithView(arena.Value.Pos, new Vector3(0f, arena.Value.Yaw ?? hub.Yaw, 0f));
			Chat.PrintToChat(c, "[Training] Here we go - you were moved to an open area. After the exercise you return to the menu.");
		} else {
			Chat.PrintToChat(c, "[Training] No open area found near here, so you train where you stand. Better: walk to a good spot and type !tarena (for Long Range: !tarena long).");
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

	[Command("tarena", Description = "Set your own arena where you stand: tarena | tarena long (for Long Range) | tarena reset | tarena reset long")]
	public void CmdArena(CCitadelPlayerController caller, string sub = "", string sub2 = "") {
		var pawn = caller.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) { Chat.PrintToChat(caller, "[Training] You need a living hero."); return; }
		string map = Server.MapName;
		string a = sub.Trim().ToLowerInvariant(), b = sub2.Trim().ToLowerInvariant();
		if (a == "reset") {
			string key = b == "long" ? map + "#long" : map;
			Arena.Reset(key);
			if (b != "long") { Arena.Reset(map + "#auto"); Arena.Reset(map + "#autolong"); _scanned.Remove(map); }
			_autoArena.Remove(map);
			Chat.PrintToChat(caller, b == "long" ? "[Training] Long Range arena reset (the normal arena is used)." : "[Training] Arena reset - an open area is searched automatically.");
			return;
		}
		string k = a == "long" ? map + "#long" : map;
		Arena.SetWithYaw(k, pawn.Position + new Vector3(0, 0, 8), pawn.EyeAngles.Y);
		Chat.PrintToChat(caller, a == "long" ? "[Training] Long Range arena set to your current position. Face along the direction you want the targets to appear." : $"[Training] Arena for {map} set to your current position.");
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
			case "pool":
				if (int.TryParse(arg.Trim(), out int pn)) { TrainerConfig.UsePool = pn > 0; BotPool.Target = Math.Clamp(pn, 0, 8); }
				Chat.PrintToChat(caller, $"[Training] Bot pool: {(TrainerConfig.UsePool ? "on" : "off")}, target {BotPool.Target}, ready {BotPool.Count} (free {BotPool.FreeCount}). Spawn bots with your numpad + key while the menu is open.");
				return;
			case "auto":
				TrainerConfig.AutoSpawn = arg.Trim().ToLowerInvariant() is not ("off" or "0" or "aus");
				TrainerConfig.UsePool = true;
				if (TrainerConfig.AutoSpawn) { BotPool.GuardClear(); BotPool.ResetAuto(); }
				Chat.PrintToChat(caller, $"[Training] Automatic bot spawn: {(TrainerConfig.AutoSpawn ? "ON (experimental - may crash your game; tell me what happens)" : "off (use your key)")}. Open the menu (!train) to start.");
				return;
			case "troopers":
				TrainerConfig.UseTroopers = arg.Trim().ToLowerInvariant() is not ("off" or "0" or "aus");
				Chat.PrintToChat(caller, $"[Training] Borrowed trooper targets: {(TrainerConfig.UseTroopers ? "on (health bar, damage numbers, animation)" : "off (hero-model props)")}");
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
		new[] { "citadel_spawn_practice_bots 0", "citadel_spawn_practice_bots_count 1", "citadel_spawn_practice_bots 1" },
		new[] { "spawn_hero_testing_controller" },
		new[] { "citadel_spawn_practice_bots 0", "citadel_bot_practice_opponent hero_wraith", "citadel_bot_practice_teammate hero_wraith", "citadel_spawn_practice_bots_count 1", "citadel_spawn_practice_bots 1" },
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
