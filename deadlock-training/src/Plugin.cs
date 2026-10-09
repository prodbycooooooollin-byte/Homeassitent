using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>
/// Trainingsmodus fuer Deadlock (Deadworks-Plugin). Menue vor dir zum Draufschiessen, dazu Chat-Befehle:
/// !train, !parry, !flick, !track, !tstop, ... Siehe README.md.
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
		StopAll(); // Map-Wechsel: alte Entities sind weg
		_hubs.Clear();
		_fromHub.Clear();
		_returning.Clear();
		_autoArena.Clear();
	}

	public override void OnPrecacheResources() {
		Precache.AddResource(Models.Werewolf);
		foreach (var h in new[] { Heroes.Wraith, Heroes.Haze, Heroes.Inferno, Heroes.Ghost, Heroes.Hornet, Heroes.Atlas,
			Heroes.Bebop, Heroes.Shiv, Heroes.Kelvin, Heroes.Lash, Heroes.Mirage, Heroes.Viper })
			Precache.AddHero(h);
	}

	public override void OnClientDisconnect(ClientDisconnectedEvent args) {
		StopDrill(args.Slot);
		_inputs.Remove(args.Slot);
		_hubs.Remove(args.Slot);
		_fromHub.Remove(args.Slot);
		_returning.Remove(args.Slot);
		_noAutoMenu.Remove(args.Slot);
	}

	/// <summary>Sobald ein Held da ist, erscheint das Menue automatisch (ausschalten mit !train off).</summary>
	public override void OnPawnHeroInitialized(CCitadelPlayerPawn pawn) {
		var c = pawn.Controller;
		if (c == null || c.IsBot) return;
		int slot = c.EntityIndex - 1;
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

	// ---- Hooks ----------------------------------------------------------------------------------------------------

	public override void OnAbilityAttempt(AbilityAttemptEvent e) {
		var ctl = e.Controller;
		if (ctl == null) return;
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

	public override void OnModifierEvent(ModifierEvent e) {
		if (!_debug) return;
		if (e.Event is not (EModifierEvent.CheckForParry or EModifierEvent.ParrySuccess or
			EModifierEvent.MeleeAttack or EModifierEvent.MeleeAttackStarted)) return;

		foreach (var c in Players.GetAll()) {
			if (c.IsBot) continue;
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
			if (c.IsBot) continue;
			int slot = c.EntityIndex - 1;
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
		Begin(c, input => new MenuDrill(c, input, id => OnMenuSelect(c, slot, id), hub.Feet + new Vector3(0, 0, 64), hub.Yaw));
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
		switch (id) {
			case "parry": GoToArenaThen(c, slot, () => CmdParry(c)); break;
			case "flick": GoToArenaThen(c, slot, () => CmdFlick(c)); break;
			case "track": GoToArenaThen(c, slot, () => CmdTrack(c)); break;
			default: CloseMenu(c); break;
		}
	}

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
			Chat.PrintToChat(c, "[Training] Du wurdest in die Arena teleportiert. Nach der Uebung geht es zurueck zum Menue. (Eigene Arena: !tarena)");
		} else {
			Chat.PrintToChat(c, "[Training] Keinen freien Platz gefunden - Uebung startet hier. Mit !tarena kannst du selbst einen Platz festlegen.");
		}
		// Kurz warten, bis Position und Blickrichtung beim Spieler angekommen sind.
		Timer.Once(800.Milliseconds(), () => {
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
		Timer.Once(2500.Milliseconds(), () => TryReturn(c, slot, teleportBack, 0));
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
		Timer.Once(600.Milliseconds(), () => {
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

	[Command("parry", Description = "Parry-Training: parry [runden=10] [leicht|normal|schwer] [angreifer=3]")]
	public void CmdParry(CCitadelPlayerController caller, int rounds = 10, string level = "normal", int attackers = 3) =>
		Begin(caller, input => new ParryDrill(caller, input, rounds, LevelParse.Parse(level), attackers));

	[Command("flick", Description = "Flick-Aim-Training: flick [anzahl=20] [leicht|normal|schwer]")]
	public void CmdFlick(CCitadelPlayerController caller, int count = 20, string level = "normal") =>
		Begin(caller, input => new FlickDrill(caller, input, count, LevelParse.Parse(level)));

	[Command("track", Description = "Tracking-Aim-Training: track [sekunden=30] [leicht|normal|schwer]")]
	public void CmdTrack(CCitadelPlayerController caller, int seconds = 30, string level = "normal") =>
		Begin(caller, input => new TrackDrill(caller, input, seconds, LevelParse.Parse(level)));

	[Command("tstop", Description = "Aktuelle Trainingsuebung beenden (zurueck zum Menue)")]
	public void CmdStop(CCitadelPlayerController caller) {
		int slot = caller.EntityIndex - 1;
		bool wasExercise = _drills.TryGetValue(slot, out var d) && d is not MenuDrill;
		StopDrill(slot);
		Chat.PrintToChat(caller, "[Training] Uebung beendet.");
		if (wasExercise) ScheduleReturn(caller, slot);
	}

	[Command("tarena", Description = "Arena festlegen: tarena (hier) | tarena reset (wieder automatisch suchen)")]
	public void CmdArena(CCitadelPlayerController caller, string sub = "") {
		var pawn = caller.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) { Chat.PrintToChat(caller, "[Training] Du brauchst einen lebenden Helden."); return; }
		string map = Server.MapName;
		if (sub.Trim().Equals("reset", StringComparison.OrdinalIgnoreCase)) {
			Arena.Reset(map);
			_autoArena.Remove(map);
			Chat.PrintToChat(caller, "[Training] Arena zurueckgesetzt - es wird wieder automatisch ein freier Platz gesucht.");
			return;
		}
		Arena.Set(map, pawn.Position + new Vector3(0, 0, 8));
		Chat.PrintToChat(caller, $"[Training] Arena fuer {map} gesetzt: deine aktuelle Position. Sie bleibt auch nach einem Neustart gespeichert.");
	}

	[Command("thero", Description = "Helden wechseln: thero <name>  (z.B. thero wraith)")]
	public void CmdHero(CCitadelPlayerController caller, string name = "") {
		if (string.IsNullOrWhiteSpace(name) || !Enum.TryParse<Heroes>(name.Trim(), ignoreCase: true, out var hero) || !Enum.IsDefined(hero)) {
			Chat.PrintToChat(caller, "[Training] Unbekannter Held. Beispiele: Wraith, Haze, Inferno, Ghost, Hornet, Atlas, Bebop, Shiv, Kelvin, Lash, Mirage, Viper");
			return;
		}
		caller.SelectHero(hero);
		Chat.PrintToChat(caller, $"[Training] Held: {hero}");
	}

	// ---- Diagnose / Einstellungen (fuer den ersten Test im Spiel) -------------------------------------------------

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

	[Command("tinput", Description = "Zielen bestaetigen per 'klick' (Standard) oder 'dwell' (Fadenkreuz 0,25 s halten)")]
	public void CmdInput(CCitadelPlayerController caller, string mode = "") {
		TrainerConfig.Dwell = mode.Trim().ToLowerInvariant() is "dwell" or "halten";
		Chat.PrintToChat(caller, $"[Training] Treffer-Erkennung: {(TrainerConfig.Dwell ? "Dwell (Fadenkreuz halten)" : "Klick")}");
	}

	[Command("tface", Description = "Drehung der Texte aendern (falls spiegelverkehrt/seitlich): tface [grad]")]
	public void CmdFace(CCitadelPlayerController caller, string degrees = "") {
		if (!float.TryParse(degrees, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d))
			d = (TrainerConfig.TextYawOffset + 90f) % 360f;
		TrainerConfig.TextYawOffset = d;
		Chat.PrintToChat(caller, $"[Training] Text-Drehung: {d:0} Grad. Mit !train (Menue neu) oder !ttest pruefen.");
	}

	[Command("tfont", Description = "Schriftart der Texte: tfont <name> | tfont default")]
	public void CmdFont(CCitadelPlayerController caller, string name = "") {
		TrainerConfig.Font = string.IsNullOrWhiteSpace(name) || name.Equals("default", StringComparison.OrdinalIgnoreCase) ? null : name;
		Chat.PrintToChat(caller, $"[Training] Schrift: {TrainerConfig.Font ?? "Standard"}");
	}

	[Command("tmodel", Description = "Modell der Figuren: tmodel <pfad.vmdl> [brusthoehe] | tmodel default")]
	public void CmdModel(CCitadelPlayerController caller, string path = "", float chestHeight = 0f) {
		if (string.IsNullOrWhiteSpace(path) || path.Equals("default", StringComparison.OrdinalIgnoreCase)) {
			TrainerConfig.BodyModel = Models.Werewolf;
			TrainerConfig.CenterZ = 55f;
		} else {
			TrainerConfig.BodyModel = path.Trim();
			if (chestHeight > 0f) TrainerConfig.CenterZ = chestHeight;
		}
		Chat.PrintToChat(caller, $"[Training] Figuren-Modell: {TrainerConfig.BodyModel} (Brusthoehe {TrainerConfig.CenterZ:0}). Mit !ttest pruefen.");
	}

	[Command("ttest", Description = "Test-Figur und Test-Text 8 s lang vor dir einblenden (Sichtbarkeit/Ausrichtung pruefen)")]
	public void CmdTest(CCitadelPlayerController caller) =>
		Begin(caller, input => new TextTestDrill(caller, input));

	private static void PrintHelp(CCitadelPlayerController c) {
		Chat.PrintToChat(c, "[Training] !train = Menue (draufschiessen) | !parry [n] [stufe] [angreifer] | !flick [n] [stufe] | !track [sek] [stufe] | !tstop | !tarena | !thero <name>");
		Chat.PrintToChat(c, "[Training] Stufen: leicht, normal, schwer. Probleme: !ttest, !tface, !tfont, !tmodel, !tinput dwell, !tdebug, !tparrykey");
	}
}

/// <summary>Zeigt kurz eine Figur und einen Text vor dem Spieler, damit man Sichtbarkeit und Drehung pruefen kann.</summary>
sealed class TextTestDrill : Drill {
	private double _until;

	public override string Name => "Test";

	public TextTestDrill(CCitadelPlayerController ctl, PlayerInput input) : base(ctl, input) { }

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		_until = nowMs + 8000;
		var eye = Aim.Eye(pawn);
		float yaw = pawn.EyeAngles.Y;
		var origin = pawn.Position;
		var feet = origin + Aim.Forward(0f, yaw) * 350f;
		var body = SpawnBody(feet, Aim.YawTo(feet, origin), 1f, pawn);
		var text = SpawnText("TEXT-TEST", eye + Aim.Forward(0f, yaw - 25f) * 400f, eye, 30f, 255, 220, 0);
		Say(body == null
			? "[Training] Figur konnte NICHT erzeugt werden (Modell/prop_dynamic). Siehe Server-Fenster und !tmodel."
			: "[Training] Figur steht vor dir (8 s).");
		Say(text == null
			? "[Training] World-Text konnte nicht erzeugt werden."
			: "[Training] Ist 'TEXT-TEST' lesbar (nicht gespiegelt)? Sonst: !tface (mehrmals) und !ttest wiederholen.");
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		if (nowMs >= _until) Finished = true;
	}
}
