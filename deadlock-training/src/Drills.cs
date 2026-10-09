using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>Basis fuer alle Uebungen. Eine Uebung gehoert genau einem Spieler.</summary>
abstract class Drill {
	protected readonly CCitadelPlayerController Ctl;
	protected readonly PlayerInput In;
	protected readonly Level Lvl;
	protected static readonly Random Rng = Random.Shared;

	private readonly List<CPointWorldText> _texts = new();
	protected readonly List<Actor> Actors = new();
	private bool _gated;
	private double _gateDeadline;

	/// <summary>Alle Bots dieser Uebung sind da (false = nur Text-Marker, vereinfachter Modus).</summary>
	protected bool RealBots { get; private set; }

	public bool Finished { get; set; }
	public abstract string Name { get; }

	protected Drill(CCitadelPlayerController ctl, PlayerInput input, Level lvl) {
		Ctl = ctl;
		In = input;
		Lvl = lvl;
	}

	/// <summary>Figuren erzeugen (AddActor) und Meldungen ausgeben. Die Uebung selbst startet erst in <see cref="Ready"/>.</summary>
	protected abstract void Begin(CCitadelPlayerPawn pawn, double nowMs);
	/// <summary>Alle Bots sind bereit (oder aufgegeben). Zeitplaene hier starten.</summary>
	protected abstract void Ready(CCitadelPlayerPawn pawn, double nowMs);
	protected abstract void Tick(CCitadelPlayerPawn pawn, double nowMs);

	/// <summary>Schaden im Spiel (vor dem Anwenden). Stop blockiert ihn.</summary>
	public virtual HookResult OnTakeDamage(TakeDamageEvent e) => HookResult.Continue;
	/// <summary>Modifier-Ereignisse (Parry, Nahkampf, ...). Nur beobachten.</summary>
	public virtual void OnModifier(ModifierEvent e) { }

	public void Start(CCitadelPlayerPawn pawn, double nowMs) {
		Begin(pawn, nowMs);
		if (!TrainerConfig.NoBots && Actors.Any(a => !a.WantsBot)) {
			Say($"[Training] Bot konnte nicht angelegt werden ({TrainerBots.LastError}). Vereinfachter Modus mit Text-Zielen. Mit !tbot test pruefst du den Grund.");
			Console.WriteLine($"[Trainer] Bot-Anlegen fehlgeschlagen: {TrainerBots.LastError}");
		}
		_gated = Actors.Any(a => a.WantsBot);
		_gateDeadline = nowMs + 8000;
		if (!_gated) {
			RealBots = false;
			Ready(pawn, nowMs);
		}
	}

	public void Update(CCitadelPlayerPawn pawn, double nowMs) {
		if (_gated) {
			bool allReady = Actors.Where(a => a.WantsBot).All(a => a.BotReady);
			if (!allReady && nowMs < _gateDeadline) return;

			_gated = false;
			var failed = Actors.Where(a => a.WantsBot && !a.BotReady).ToList();
			foreach (var a in failed) a.DropBot();
			RealBots = failed.Count == 0;
			if (!RealBots) {
				Say($"[Training] Bots nicht verfuegbar ({TrainerBots.LastError}). Vereinfachter Modus mit Text-Zielen. Mit !tbot test pruefst du den Grund.");
				Console.WriteLine($"[Trainer] Bot-Erzeugung fehlgeschlagen: {TrainerBots.LastError}");
			}
			Ready(pawn, nowMs);
		}
		Tick(pawn, nowMs);
	}

	/// <summary>Raeumt alle erzeugten Entities und Bots weg. Wird bei Ende/Abbruch/Unload aufgerufen.</summary>
	public virtual void Stop() {
		foreach (var a in Actors) a.Dispose();
		Actors.Clear();
		foreach (var t in _texts.ToArray()) Kill(t);
		_texts.Clear();
	}

	protected void Say(string text) => Chat.PrintToChat(Ctl, text);

	protected CCitadelPlayerPawn? PlayerPawn => Ctl.GetHeroPawn();

	// ---- Figuren ---------------------------------------------------------------------------------------------------

	/// <summary>Neue Figur an feet. Versucht zuerst einen echten Bot (Gegner-Team) zu erzeugen.</summary>
	protected Actor AddActor(CCitadelPlayerPawn player, Vector3 feet, double nowMs) {
		int slot = -1;
		if (!TrainerConfig.NoBots) {
			int enemy = player.TeamNum == 2 ? 3 : 2;
			slot = TrainerBots.Create(enemy, TrainerConfig.BotHero, "Trainer");
		}
		var a = new Actor(slot, feet, nowMs);
		Actors.Add(a);
		return a;
	}

	protected void PlaceActor(Actor a, Vector3 feet, Vector3 lookAt, Vector3 eye, float labelHeight) {
		a.Feet = feet;
		if (a.WantsBot) a.Place(feet, lookAt);
		if (a.Marker != null) Face(a.Marker, feet + new Vector3(0, 0, labelHeight), eye);
	}

	protected bool IsPlayer(CBaseEntity? e) {
		var p = PlayerPawn;
		return e != null && p != null && e.EntityHandle == p.EntityHandle;
	}

	protected Actor? ActorOf(CBaseEntity? e) {
		if (e == null) return null;
		foreach (var a in Actors) {
			var p = a.Pawn;
			if (p != null && p.EntityHandle == e.EntityHandle) return a;
		}
		return null;
	}

	/// <summary>Wie weit man ab dem Spieler in Richtung yaw (auf Brusthoehe) frei sehen kann, hoechstens wanted.</summary>
	protected float ClearDist(CCitadelPlayerPawn pawn, float yaw, float wanted) {
		try {
			var start = pawn.Position + new Vector3(0, 0, 60f);
			var end = start + Aim.Forward(0f, yaw) * wanted;
			var r = Trace.Ray(start, end, InteractionLayer.Solid, pawn);
			if (!r.DidHit) return wanted;
			return MathF.Max(0f, r.Fraction * wanted - 90f);
		} catch {
			return wanted;
		}
	}

	// ---- Text ------------------------------------------------------------------------------------------------------

	protected CPointWorldText? SpawnText(string msg, Vector3 pos, Vector3 eye, float radius, byte r, byte g, byte b) {
		try {
			var t = CPointWorldText.Create(msg, pos, fontSize: 100f, r: r, g: g, b: b, fontName: TrainerConfig.Font, reorientMode: 0);
			if (t == null) return null;
			t.WorldUnitsPerPx = radius / 35f;
			t.JustifyHorizontal = HorizontalJustify.Center;
			t.JustifyVertical = VerticalJustify.Center;
			Face(t, pos, eye);
			_texts.Add(t);
			return t;
		} catch (Exception ex) {
			Console.WriteLine($"[Trainer] Text konnte nicht erzeugt werden: {ex.Message}");
			return null;
		}
	}

	protected static void Face(CPointWorldText t, Vector3 pos, Vector3 eye) {
		try {
			t.Teleport(position: pos, angles: new Vector3(180f, Aim.YawTo(pos, eye) + TrainerConfig.TextYawOffset, 270f));
		} catch { /* Entity gerade weg */ }
	}

	protected void Kill(CPointWorldText? t) {
		if (t == null) return;
		_texts.Remove(t);
		try { if (t.IsValid) t.Remove(); } catch { /* Entity schon weg */ }
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Menue: dauerhaft in der Welt, in Kategorien. Draufschiessen waehlt. Bleibt bestehen, bis "MENUE AUS".
// ---------------------------------------------------------------------------------------------------------------------
sealed class MenuDrill : Drill {
	private sealed record Item(string Id, string Label, float Yaw, float Pitch, float Size, bool Selectable, byte R, byte G, byte B);

	private readonly Action<string> _onSelect;
	private readonly Action<Level> _onLevel;
	private readonly Vector3 _anchorEye;
	private readonly float _anchorYaw;
	private Level _level;

	private readonly List<(Item Item, CPointWorldText? Text, Vector3 Pos)> _items = new();
	private CPointWorldText? _status;
	private const float Dist = 430f;
	private const float HitDeg = 4.2f;
	private int _hover = -1;
	private double _hoverSince;

	public override string Name => "Menue";

	public MenuDrill(CCitadelPlayerController ctl, PlayerInput input, Level level, Action<Level> onLevel, Action<string> onSelect,
		Vector3 anchorEye, float anchorYaw) : base(ctl, input, level) {
		_level = level;
		_onLevel = onLevel;
		_onSelect = onSelect;
		_anchorEye = anchorEye;
		_anchorYaw = anchorYaw;
	}

	private static IEnumerable<Item> Layout() {
		yield return new("title", "DEADLOCK TRAINER", 0f, -27f, 17f, false, 255, 200, 0);

		yield return new("hdr_parry", "PARRY", -24f, -15f, 14f, false, 255, 140, 40);
		yield return new("p_single", "Einzel", -24f, -8f, 11f, true, 255, 255, 255);
		yield return new("p_multi", "Mehrere", -24f, -2f, 11f, true, 255, 255, 255);
		yield return new("p_burst", "Salve", -24f, 4f, 11f, true, 255, 255, 255);

		yield return new("hdr_aim", "AIM", 24f, -15f, 14f, false, 255, 140, 40);
		yield return new("a_flick", "Flick", 24f, -8f, 11f, true, 255, 255, 255);
		yield return new("a_strafe", "Strafe", 24f, -2f, 11f, true, 255, 255, 255);
		yield return new("a_random", "Zufall", 24f, 4f, 11f, true, 255, 255, 255);

		yield return new("lv_easy", "LEICHT", -12f, 13f, 10f, true, 255, 255, 255);
		yield return new("lv_normal", "NORMAL", 0f, 13f, 10f, true, 255, 255, 255);
		yield return new("lv_hard", "SCHWER", 12f, 13f, 10f, true, 255, 255, 255);

		yield return new("off", "MENUE AUS", 0f, 20f, 7f, true, 170, 170, 170);
	}

	private static string LevelId(Level l) => l switch { Level.Easy => "lv_easy", Level.Hard => "lv_hard", _ => "lv_normal" };

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		foreach (var it in Layout()) {
			var pos = _anchorEye + Aim.Forward(it.Pitch, _anchorYaw + it.Yaw) * Dist;
			var t = SpawnText(it.Label, pos, eye, it.Size, it.R, it.G, it.B);
			_items.Add((it, t, pos));
		}
		var statusPos = _anchorEye + Aim.Forward(-22.5f, _anchorYaw) * Dist;
		_status = SpawnText(StatusText(), statusPos, eye, 7f, 200, 200, 200);
		RefreshColors(-1);
		while (In.Shots.Count > 0) In.Shots.Dequeue(); // alte Klicks verwerfen
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) =>
		Say("[Training] Menue ist da: Fadenkreuz auf eine Uebung (wird gelb) und schiessen. Stufe waehlst du unten. (!train off schliesst es)");

	private string StatusText() => $"Stufe: {LevelParse.Label(_level).ToUpperInvariant()}  -  schiess auf eine Uebung";

	private void RefreshColors(int hover) {
		string lv = LevelId(_level);
		for (int i = 0; i < _items.Count; i++) {
			var (it, text, _) = _items[i];
			if (!it.Selectable || text == null) continue;
			if (i == hover) text.SetColor(255, 220, 0);
			else if (it.Id == lv) text.SetColor(70, 255, 110);
			else text.SetColor(it.R, it.G, it.B);
		}
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var fwd = Aim.Forward(pawn.EyeAngles);

		int hover = NearestItem(eye, fwd);
		if (hover != _hover) {
			_hover = hover;
			_hoverSince = nowMs;
			RefreshColors(hover);
		}

		foreach (var (_, text, pos) in _items) if (text != null) Face(text, pos, eye);
		if (_status != null) Face(_status, _anchorEye + Aim.Forward(-22.5f, _anchorYaw) * Dist, eye);

		int chosen = -1;
		while (In.Shots.Count > 0) {
			var s = In.Shots.Dequeue();
			int idx = NearestItem(s.Eye, s.Forward);
			if (idx >= 0) { chosen = idx; break; }
		}
		if (chosen < 0 && TrainerConfig.Dwell && _hover >= 0 && nowMs - _hoverSince >= 1000) chosen = _hover;
		if (chosen < 0) return;

		var id = _items[chosen].Item.Id;
		if (id.StartsWith("lv_")) {
			_level = id switch { "lv_easy" => Level.Easy, "lv_hard" => Level.Hard, _ => Level.Normal };
			_onLevel(_level);
			_status?.SetMessage(StatusText());
			RefreshColors(_hover);
			return;
		}
		Finished = true;
		Stop();
		_onSelect(id);
	}

	/// <summary>Naechstes anwaehlbares Feld innerhalb der Trefferzone, sonst -1.</summary>
	private int NearestItem(Vector3 eye, Vector3 forward) {
		int best = -1;
		float bestAngle = HitDeg;
		for (int i = 0; i < _items.Count; i++) {
			if (!_items[i].Item.Selectable) continue;
			float a = Aim.AngleTo(eye, forward, _items[i].Pos);
			if (a <= bestAngle) { bestAngle = a; best = i; }
		}
		return best;
	}
}
