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

	private readonly Dictionary<int, PlayerInput> _inputs = new();
	private readonly Dictionary<int, Drill> _drills = new();
	private readonly Dictionary<int, Hub> _hubs = new();
	private readonly Dictionary<int, Level> _levels = new();
	private readonly HashSet<int> _fromHub = new();     // Uebung wurde aus dem Menue gestartet -> danach zurueck
	private readonly HashSet<int> _returning = new();   // Rueckweg ist schon eingeplant
	private readonly HashSet<int> _noAutoMenu = new();  // Spieler hat das Menue ausgeschaltet
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

	public override void OnStartupServer() {
		StopAll(); // Map-Wechsel: alte Entities und Bots sind weg
		TrainerBots.ClearAll();
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
		_inputs.Remove(args.Slot);
		_hubs.Remove(args.Slot);
		_levels.Remove(args.Slot);
		_fromHub.Remove(args.Slot);
		_returning.Remove(args.Slot);
		_noAutoMenu.Remove(args.Slot);
	}

	public override void OnClientFullConnect(ClientFullConnectEvent args) {
		if (TrainerBots.IsBotSlot(args.Slot)) TrainerBots.Configure(args.Slot);
	}

	/// <summary>Sobald ein Held da ist, erscheint das Menue automatisch (ausschalten mit !train off).</summary>
	public override void OnPawnHeroInitialized(CCitadelPlayerPawn pawn) {
		var c = pawn.Controller;
		if (c == null) return;
		int slot = c.EntityIndex - 1;
		if (TrainerBots.IsBotSlot(slot) || c.IsBot) return;
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
		if (ctl == null || TrainerBots.IsBotSlot(e.PlayerSlot)) return;
		var inp = Input(e.PlayerSlot);

		bool attackHeld = (e.HeldButtons & InputButton.Attack) != 0;
		if (attackHeld && (e.ChangedButtons & InputButton.Attack) != 0) {
			var pawn = ctl.GetHeroPawn();
			if (pawn != null)
				inp.RegisterShot(new Shot(Clock.Ms, Aim.Eye(pawn), Aim.Forward(pawn.EyeAngles)));
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
			if (TrainerBots.IsBotSlot(c.EntityIndex - 1) || c.IsBot) continue;
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

		foreach (var c in Players.GetAll()) {
			int slot = c.EntityIndex - 1;
			if (TrainerBots.IsBotSlot(slot) || c.IsBot) continue;
			var pawn = c.GetHeroPawn();
			var inp = Input(slot);

			// Parry-Fenster der Engine beobachten (steigende Flanke = Parry ausgeloest).
			bool parry = pawn?.ModifierProp?.HasModifierState(EModifierState.ParryActive) ?? false;
			if (parry && !inp.ParryActive) inp.RegisterParryEdge(now);
			inp.ParryActive = parry;

			if (!_drills.TryGetValue(slot, out var drill)) continue;

			if (pawn == null || !pawn.IsAlive) {
				Chat.PrintToChat(c, "[Training] Uebung abgebrochen (kein lebender Held).");
				bool wasExercise = drill is not MenuDrill;
				StopDrill(slot);
				if (wasExercise) ScheduleReturn(c, slot);
				continue;
			}

			try {
				drill.Update(pawn, now);
			} catch (Exception ex) {
				Console.WriteLine($"[Trainer] Fehler in {drill.Name}: {ex}");
				Chat.PrintToChat(c, $"[Training] Fehler in {drill.Name}: {ex.Message} (Uebung beendet)");
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
			Chat.PrintToChat(c, "[Training] Du brauchst einen lebenden Helden. Waehle zuerst einen Helden und spawne.");
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
			Chat.PrintToChat(c, "[Training] Du brauchst einen lebenden Helden. Waehle zuerst einen Helden und spawne.");
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

	private void CloseMenu(CCitadelPlayerController c, string? message = "[Training] Menue ausgeschaltet. !train bringt es zurueck.") {
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
			case "a_flick": GoToArenaThen(c, slot, () => StartFlick(c, 0, lvl)); break;
			case "a_strafe": GoToArenaThen(c, slot, () => StartTrack(c, false, 0, lvl)); break;
			case "a_random": GoToArenaThen(c, slot, () => StartTrack(c, true, 0, lvl)); break;
			default: CloseMenu(c); break;
		}
	}

	private bool StartParry(CCitadelPlayerController c, ParryMode mode, int rounds, Level lvl) =>
		Begin(c, input => new ParryDrill(c, input, lvl, mode, rounds));

	private bool StartFlick(CCitadelPlayerController c, int count, Level lvl) =>
		Begin(c, input => new FlickDrill(c, input, lvl, count));

	private bool StartTrack(CCitadelPlayerController c, bool random, int seconds, Level lvl) =>
		Begin(c, input => new TrackDrill(c, input, lvl, random, seconds));

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
			Chat.PrintToChat(c, "[Training] Los geht's - du wurdest in einen freien Bereich gebracht. Nach der Uebung zurueck zum Menue.");
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

	[Command("train", "training", Description = "Trainingsmenue vor dir aufbauen (auf eine Uebung schiessen). train off = ausschalten")]
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

	[Command("tlevel", Description = "Schwierigkeit: tlevel leicht|normal|schwer")]
	public void CmdLevel(CCitadelPlayerController caller, string level = "") {
		int slot = caller.EntityIndex - 1;
		var l = LevelParse.Parse(level, LevelOf(slot));
		_levels[slot] = l;
		Chat.PrintToChat(caller, $"[Training] Stufe: {LevelParse.Label(l)}. Gilt fuer die naechste Uebung (Menue neu oeffnen: !train).");
	}

	[Command("parry", Description = "Parry gegen Bots: parry [einzel|mehrere|salve] [runden=10] [leicht|normal|schwer]")]
	public void CmdParry(CCitadelPlayerController caller, string mode = "mehrere", int rounds = 10, string level = "") {
		int slot = caller.EntityIndex - 1;
		var m = mode.Trim().ToLowerInvariant() switch {
			"einzel" or "single" or "1" => ParryMode.Single,
			"salve" or "burst" => ParryMode.Burst,
			_ => ParryMode.Multi,
		};
		StartParry(caller, m, m == ParryMode.Burst ? Math.Min(rounds, 8) : rounds, LevelParse.Parse(level, LevelOf(slot)));
	}

	[Command("flick", Description = "Flick-Aim gegen einen Bot: flick [anzahl] [leicht|normal|schwer]")]
	public void CmdFlick(CCitadelPlayerController caller, int count = 0, string level = "") =>
		StartFlick(caller, count, LevelParse.Parse(level, LevelOf(caller.EntityIndex - 1)));

	[Command("track", Description = "Tracking gegen einen Bot: track [strafe|zufall] [sekunden=30] [leicht|normal|schwer]")]
	public void CmdTrack(CCitadelPlayerController caller, string mode = "strafe", int seconds = 30, string level = "") {
		bool random = mode.Trim().ToLowerInvariant() is "zufall" or "random" or "z";
		StartTrack(caller, random, seconds, LevelParse.Parse(level, LevelOf(caller.EntityIndex - 1)));
	}

	[Command("tstop", Description = "Aktuelle Trainingsuebung beenden (zurueck zum Menue)")]
	public void CmdStop(CCitadelPlayerController caller) {
		int slot = caller.EntityIndex - 1;
		bool wasExercise = _drills.TryGetValue(slot, out var d) && d is not MenuDrill;
		StopDrill(slot);
		Chat.PrintToChat(caller, "[Training] Uebung beendet.");
		if (wasExercise) ScheduleReturn(caller, slot);
	}

	[Command("tarena", Description = "Optional: eigene Arena festlegen (tarena) oder wieder automatisch (tarena reset)")]
	public void CmdArena(CCitadelPlayerController caller, string sub = "") {
		var pawn = caller.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) { Chat.PrintToChat(caller, "[Training] Du brauchst einen lebenden Helden."); return; }
		string map = Server.MapName;
		if (sub.Trim().Equals("reset", StringComparison.OrdinalIgnoreCase)) {
			Arena.Reset(map);
			_autoArena.Remove(map);
			Chat.PrintToChat(caller, "[Training] Arena zurueckgesetzt - es wird automatisch ein freier Platz gesucht.");
			return;
		}
		Arena.Set(map, pawn.Position + new Vector3(0, 0, 8));
		Chat.PrintToChat(caller, $"[Training] Arena fuer {map} gesetzt: deine aktuelle Position.");
	}

	[Command("thero", Description = "Eigenen Helden wechseln: thero <name>  (z.B. thero wraith)")]
	public void CmdHero(CCitadelPlayerController caller, string name = "") {
		if (string.IsNullOrWhiteSpace(name) || !Enum.TryParse<Heroes>(name.Trim(), ignoreCase: true, out var hero) || !Enum.IsDefined(hero)) {
			Chat.PrintToChat(caller, "[Training] Unbekannter Held. Beispiele: Wraith, Haze, Inferno, Ghost, Hornet, Atlas, Bebop, Shiv, Kelvin, Lash, Mirage, Viper");
			return;
		}
		caller.SelectHero(hero);
		Chat.PrintToChat(caller, $"[Training] Held: {hero}");
	}

	// ---- Bots / Diagnose ------------------------------------------------------------------------------------------

	[Command("tbot", Description = "Bots: tbot test | tbot hero <name> | tbot off | tbot on | tbot view on|off")]
	public void CmdBot(CCitadelPlayerController caller, string sub = "test", string arg = "") {
		switch (sub.Trim().ToLowerInvariant()) {
			case "off":
				TrainerConfig.NoBots = true;
				Chat.PrintToChat(caller, "[Training] Bots aus: Uebungen laufen mit Text-Zielen (vereinfacht).");
				return;
			case "on":
				TrainerConfig.NoBots = false;
				Chat.PrintToChat(caller, "[Training] Bots an.");
				return;
			case "view":
				TrainerConfig.WriteViewAngles = arg.Trim().ToLowerInvariant() is not ("off" or "aus" or "0");
				Chat.PrintToChat(caller, $"[Training] Bot-Blickrichtung schreiben: {(TrainerConfig.WriteViewAngles ? "an" : "aus")}");
				return;
			case "hero":
				if (!Enum.TryParse<Heroes>(arg.Trim(), ignoreCase: true, out var h) || !TrainerConfig.PrecachedHeroes.Contains(h)) {
					Chat.PrintToChat(caller, "[Training] Moegliche Bot-Helden: " + string.Join(", ", TrainerConfig.PrecachedHeroes));
					return;
				}
				TrainerConfig.BotHero = h;
				Chat.PrintToChat(caller, $"[Training] Bot-Held: {h}");
				return;
			default:
				Begin(caller, input => new BotTestDrill(caller, input));
				return;
		}
	}

	[Command("tcvars", Description = "Konsolen-Variablen/Befehle nach Stichwort suchen (z.B. tcvars bot) - schreibt auch trainer_cvars.txt")]
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
			Chat.PrintToChat(caller, $"[Training] {lines.Count} Treffer fuer '{filter}', gespeichert in {path}");
		} catch (Exception ex) {
			Chat.PrintToChat(caller, $"[Training] {lines.Count} Treffer, Datei nicht schreibbar: {ex.Message}");
		}
		foreach (var l in lines.Take(25)) caller.PrintToConsole(l);
	}

	[Command("tdebug", Description = "Debug-Ausgabe an/aus (Buttons, Parry-/Melee-Events)")]
	public void CmdDebug(CCitadelPlayerController caller) {
		_debug = !_debug;
		Chat.PrintToChat(caller, $"[Training] Debug {(_debug ? "AN: Tasten/Parry-Events erscheinen in der Spiel-Konsole (F7)" : "AUS")}");
	}

	[Command("tparrykey", Description = "Parry-Taste per Bitmaske festlegen (Hex, aus !tdebug-Ausgabe). Ohne Wert: aus.")]
	public void CmdParryKey(CCitadelPlayerController caller, string hex = "") {
		hex = hex.Trim();
		if (hex.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) hex = hex[2..];
		if (hex.Length == 0) {
			_parryMask = 0;
			Chat.PrintToChat(caller, "[Training] Zusaetzliche Parry-Taste aus (es zaehlt nur das Engine-Parry-Fenster).");
			return;
		}
		if (!ulong.TryParse(hex, System.Globalization.NumberStyles.HexNumber, null, out var mask)) {
			Chat.PrintToChat(caller, "[Training] Ungueltiger Hex-Wert.");
			return;
		}
		_parryMask = mask;
		Chat.PrintToChat(caller, $"[Training] Parry-Taste: Maske 0x{mask:X}");
	}

	[Command("tinput", Description = "Zielen bestaetigen per 'klick' (Standard) oder 'dwell' (Fadenkreuz kurz halten)")]
	public void CmdInput(CCitadelPlayerController caller, string mode = "") {
		TrainerConfig.Dwell = mode.Trim().ToLowerInvariant() is "dwell" or "halten";
		Chat.PrintToChat(caller, $"[Training] Treffer-Erkennung: {(TrainerConfig.Dwell ? "Dwell (Fadenkreuz halten)" : "Klick")}");
	}

	[Command("tface", Description = "Drehung der Texte aendern (falls spiegelverkehrt/seitlich): tface [grad]")]
	public void CmdFace(CCitadelPlayerController caller, string degrees = "") {
		if (!float.TryParse(degrees, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d))
			d = (TrainerConfig.TextYawOffset + 90f) % 360f;
		TrainerConfig.TextYawOffset = d;
		Chat.PrintToChat(caller, $"[Training] Text-Drehung: {d:0} Grad. Mit !train (Menue neu) pruefen.");
	}

	[Command("tfont", Description = "Schriftart der Texte: tfont <name> | tfont default")]
	public void CmdFont(CCitadelPlayerController caller, string name = "") {
		TrainerConfig.Font = string.IsNullOrWhiteSpace(name) || name.Equals("default", StringComparison.OrdinalIgnoreCase) ? null : name;
		Chat.PrintToChat(caller, $"[Training] Schrift: {TrainerConfig.Font ?? "Standard"}");
	}

	private static void PrintHelp(CCitadelPlayerController c) {
		Chat.PrintToChat(c, "[Training] !train = Menue (draufschiessen) | !parry [einzel|mehrere|salve] | !flick | !track [strafe|zufall] | !tlevel leicht|normal|schwer | !tstop");
		Chat.PrintToChat(c, "[Training] Probleme: !tbot test (Bots pruefen), !tbot off (ohne Bots), !tface, !tfont, !tinput dwell, !tdebug, !tcvars bot");
	}
}
