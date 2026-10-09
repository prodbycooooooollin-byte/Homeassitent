using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>
/// Trainingsmodus fuer Deadlock (Deadworks-Plugin). Chat-Befehle: !train, !parry, !flick, !track, !tstop, ...
/// Siehe README.md fuer Installation und Bedienung.
/// </summary>
public class TrainerPlugin : DeadworksPluginBase {
	public override string Name => "Deadlock Trainer";

	private readonly Dictionary<int, PlayerInput> _inputs = new();
	private readonly Dictionary<int, Drill> _drills = new();

	private bool _debug;
	/// <summary>Optionale rohe Button-Maske, die als Parry-Taste zaehlt (falls ParryActive nicht erkannt wird). 0 = aus.</summary>
	private ulong _parryMask;

	private const InputButton MovementKeys =
		InputButton.Forward | InputButton.Back | InputButton.MoveLeft | InputButton.MoveRight |
		InputButton.Jump | InputButton.Duck | InputButton.Speed | InputButton.TurnLeft | InputButton.TurnRight;

	// ---- Lebenszyklus ---------------------------------------------------------------------------------------------

	public override void OnLoad(bool isReload) =>
		Console.WriteLine(isReload ? "[Trainer] neu geladen" : "[Trainer] geladen - im Spiel !train tippen");

	public override void OnUnload() {
		StopAll();
		Console.WriteLine("[Trainer] entladen");
	}

	public override void OnStartupServer() => StopAll(); // Map-Wechsel: alte Entities sind weg

	public override void OnPrecacheResources() {
		foreach (var h in new[] { Heroes.Wraith, Heroes.Haze, Heroes.Inferno, Heroes.Ghost, Heroes.Hornet, Heroes.Atlas,
			Heroes.Bebop, Heroes.Shiv, Heroes.Kelvin, Heroes.Lash, Heroes.Mirage, Heroes.Viper })
			Precache.AddHero(h);
	}

	public override void OnClientDisconnect(ClientDisconnectedEvent args) {
		StopDrill(args.Slot);
		_inputs.Remove(args.Slot);
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
				StopDrill(slot);
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
			}
		}
	}

	// ---- Befehle --------------------------------------------------------------------------------------------------

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

	[Command("train", "training", Description = "Trainingsmenue vor dir oeffnen (auf eine Uebung schiessen)")]
	public void CmdTrain(CCitadelPlayerController caller, string sub = "") {
		switch (sub.Trim().ToLowerInvariant()) {
			case "stop": CmdStop(caller); return;
			case "help" or "hilfe" or "?":
				PrintHelp(caller);
				return;
		}
		int slot = caller.EntityIndex - 1;
		Begin(caller, input => new MenuDrill(caller, input, id => OnMenuSelect(caller, slot, id)));
	}

	private void OnMenuSelect(CCitadelPlayerController c, int slot, string id) {
		switch (id) {
			case "parry": CmdParry(c); break;
			case "flick": CmdFlick(c); break;
			case "track": CmdTrack(c); break;
			default: Chat.PrintToChat(c, "[Training] Beendet."); break;
		}
	}

	[Command("parry", Description = "Parry-Training: parry [runden=10] [leicht|normal|schwer]")]
	public void CmdParry(CCitadelPlayerController caller, int rounds = 10, string level = "normal") =>
		Begin(caller, input => new ParryDrill(caller, input, rounds, LevelParse.Parse(level)));

	[Command("flick", Description = "Flick-Aim-Training: flick [anzahl=20] [leicht|normal|schwer]")]
	public void CmdFlick(CCitadelPlayerController caller, int count = 20, string level = "normal") =>
		Begin(caller, input => new FlickDrill(caller, input, count, LevelParse.Parse(level)));

	[Command("track", Description = "Tracking-Aim-Training: track [sekunden=30] [leicht|normal|schwer]")]
	public void CmdTrack(CCitadelPlayerController caller, int seconds = 30, string level = "normal") =>
		Begin(caller, input => new TrackDrill(caller, input, seconds, LevelParse.Parse(level)));

	[Command("tstop", Description = "Aktuelle Trainingsuebung beenden")]
	public void CmdStop(CCitadelPlayerController caller) {
		StopDrill(caller.EntityIndex - 1);
		Chat.PrintToChat(caller, "[Training] Uebung beendet.");
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

	[Command("tface", Description = "Drehung der Zieltexte aendern (falls sie von der Seite/hinten zu sehen sind): tface [grad]")]
	public void CmdFace(CCitadelPlayerController caller, string degrees = "") {
		if (!float.TryParse(degrees, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d))
			d = (TrainerConfig.TextYawOffset + 90f) % 360f;
		TrainerConfig.TextYawOffset = d;
		Chat.PrintToChat(caller, $"[Training] Text-Drehung: {d:0} Grad. Mit !ttest pruefen.");
	}

	[Command("tfont", Description = "Schriftart der Zieltexte: tfont <name> | tfont default")]
	public void CmdFont(CCitadelPlayerController caller, string name = "") {
		TrainerConfig.Font = string.IsNullOrWhiteSpace(name) || name.Equals("default", StringComparison.OrdinalIgnoreCase) ? null : name;
		Chat.PrintToChat(caller, $"[Training] Schrift: {TrainerConfig.Font ?? "Standard"}");
	}

	[Command("ttest", Description = "Test-Text 8 s lang vor dir einblenden (Sichtbarkeit/Ausrichtung pruefen)")]
	public void CmdTest(CCitadelPlayerController caller) =>
		Begin(caller, input => new TextTestDrill(caller, input));

	private static void PrintHelp(CCitadelPlayerController c) {
		Chat.PrintToChat(c, "[Training] !train = Menue (draufschiessen) | !parry [n] [stufe] | !flick [n] [stufe] | !track [sek] [stufe] | !tstop | !thero <name>");
		Chat.PrintToChat(c, "[Training] Stufen: leicht, normal, schwer. Probleme: !ttest, !tface, !tfont, !tinput dwell, !tdebug, !tparrykey");
	}
}

/// <summary>Zeigt kurz einen Text-Pfeil vor dem Spieler, damit man Sichtbarkeit und Drehung pruefen kann.</summary>
sealed class TextTestDrill : Drill {
	private double _until;

	public override string Name => "Texttest";

	public TextTestDrill(CCitadelPlayerController ctl, PlayerInput input) : base(ctl, input) { }

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		_until = nowMs + 8000;
		var eye = Aim.Eye(pawn);
		var pos = eye + Aim.Forward(0f, pawn.EyeAngles.Y) * 400f;
		var t = SpawnText("TEXT-TEST", pos, eye, 30f, 255, 220, 0);
		Say(t == null
			? "[Training] World-Text konnte nicht erzeugt werden."
			: "[Training] Siehst du 'TEXT-TEST' lesbar vor dir? Falls von der Seite/verkehrt: !tface (mehrmals) bis es passt, dann nochmal !ttest.");
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		if (nowMs >= _until) Finished = true;
	}
}
