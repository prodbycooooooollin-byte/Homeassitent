using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>Base class for all exercises. An exercise belongs to exactly one player.</summary>
abstract class Drill {
	protected readonly CCitadelPlayerController Ctl;
	protected readonly PlayerInput In;
	protected readonly Level Lvl;
	protected static readonly Random Rng = Random.Shared;

	private readonly List<CPointWorldText> _texts = new();
	protected readonly List<Actor> Actors = new();
	private bool _gated;
	private double _gateDeadline;

	/// <summary>All bots of this exercise exist (false = text markers only, simplified mode).</summary>
	protected bool RealBots { get; private set; }

	public bool Finished { get; set; }
	public abstract string Name { get; }

	protected Drill(CCitadelPlayerController ctl, PlayerInput input, Level lvl) {
		Ctl = ctl;
		In = input;
		Lvl = lvl;
	}

	/// <summary>Create the figures (AddActor) and print intro messages. The exercise itself starts in <see cref="Ready"/>.</summary>
	protected abstract void Begin(CCitadelPlayerPawn pawn, double nowMs);
	/// <summary>All bots are ready (or given up). Start schedules here.</summary>
	protected abstract void Ready(CCitadelPlayerPawn pawn, double nowMs);
	protected abstract void Tick(CCitadelPlayerPawn pawn, double nowMs);

	/// <summary>Damage in the game (before it is applied). Stop blocks it.</summary>
	public virtual HookResult OnTakeDamage(TakeDamageEvent e) => HookResult.Continue;
	/// <summary>Modifier events (parry, melee, ...). Observe only.</summary>
	public virtual void OnModifier(ModifierEvent e) { }

	public void Start(CCitadelPlayerPawn pawn, double nowMs) {
		Begin(pawn, nowMs);
		if (!TrainerConfig.NoBots && Actors.Any(a => !a.WantsBot)) {
			Say($"[Training] Could not create a bot ({TrainerBots.LastError}). Simplified mode with text targets. Run !tbot test to see why.");
			Console.WriteLine($"[Trainer] Bot creation failed: {TrainerBots.LastError}");
		}
		_gated = Actors.Any(a => a.WantsBot);
		_gateDeadline = nowMs + 10000;
		if (!_gated) {
			RealBots = false;
			Ready(pawn, nowMs);
		}
	}

	public void Update(CCitadelPlayerPawn pawn, double nowMs) {
		if (_gated) {
			var bots = Actors.Where(a => a.WantsBot).ToList();
			foreach (var b in bots) if (b.BotReady && !b.HasModel) b.Recover(nowMs);

			bool allAlive = bots.All(a => a.BotReady);
			bool allModels = bots.All(a => a.HasModel || nowMs - a.CreatedAtMs > 5500);
			if (!(allAlive && allModels) && nowMs < _gateDeadline) return;

			_gated = false;
			var failed = bots.Where(a => !a.BotReady).ToList();
			foreach (var a in failed) a.DropBot();
			RealBots = failed.Count == 0;
			if (!RealBots) {
				Say($"[Training] Bots are not available ({TrainerBots.LastError}). Simplified mode with text targets. Run !tbot test to see why.");
				Console.WriteLine($"[Trainer] Bot creation failed: {TrainerBots.LastError}");
			} else {
				foreach (var a in bots.Where(x => x.WantsBot)) {
					Console.WriteLine($"[Trainer] Bot slot {a.Slot} ready: hero {a.Hero}, model '{a.ModelName}'");
					if (!a.HasModel) {
						Say("[Training] The bot has no model (it may be invisible). Using aim markers 'O' - shoot those, hits still register on the bot.");
						break;
					}
				}
			}
			Ready(pawn, nowMs);
		}
		Tick(pawn, nowMs);
	}

	/// <summary>Remove all created entities and bots. Called on finish/abort/unload.</summary>
	public virtual void Stop() {
		foreach (var a in Actors) a.Dispose();
		Actors.Clear();
		foreach (var t in _texts.ToArray()) Kill(t);
		_texts.Clear();
	}

	protected void Say(string text) => Chat.PrintToChat(Ctl, text);

	protected CCitadelPlayerPawn? PlayerPawn => Ctl.GetHeroPawn();

	// ---- Figures ---------------------------------------------------------------------------------------------------

	/// <summary>New figure at feet. First tries to create a real bot on the enemy team, playing the same hero as the player.</summary>
	protected Actor AddActor(CCitadelPlayerPawn player, Vector3 feet, double nowMs) {
		var hero = TrainerConfig.BotHero ?? (Enum.IsDefined(player.HeroID) ? player.HeroID : Heroes.Inferno);
		int slot = -1;
		if (!TrainerConfig.NoBots) {
			int enemy = player.TeamNum == 2 ? 3 : 2;
			slot = TrainerBots.Create(enemy, hero, "Trainer");
		}
		var a = new Actor(slot, hero, feet, nowMs);
		Actors.Add(a);
		return a;
	}

	/// <summary>Create the aim marker 'O' on an actor if it is needed (no bot, no model, or markers enabled).</summary>
	protected void EnsureMarker(Actor a, Vector3 eye, float radius, byte r, byte g, byte b, string text = "O") {
		if (a.Marker != null) return;
		bool need = TrainerConfig.ShowMarkers || !a.WantsBot || !a.HasModel;
		if (!need) return;
		a.Marker = SpawnText(text, a.Center, eye, radius, r, g, b);
	}

	protected void PlaceActor(Actor a, Vector3 feet, Vector3 lookAt, Vector3 eye, float markerHeight) {
		a.Feet = feet;
		if (a.WantsBot) a.Place(feet, lookAt);
		if (a.Marker != null) Face(a.Marker, feet + new Vector3(0, 0, markerHeight), eye);
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

	/// <summary>How far you can see (at chest height) from the player in direction yaw, at most wanted.</summary>
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
			Console.WriteLine($"[Trainer] Could not create text: {ex.Message}");
			return null;
		}
	}

	protected static void Face(CPointWorldText t, Vector3 pos, Vector3 eye) {
		try {
			t.Teleport(position: pos, angles: new Vector3(180f, Aim.YawTo(pos, eye) + TrainerConfig.TextYawOffset, 270f));
		} catch { /* entity just got removed */ }
	}

	protected void Kill(CPointWorldText? t) {
		if (t == null) return;
		_texts.Remove(t);
		try { if (t.IsValid) t.Remove(); } catch { /* already gone */ }
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Menu: permanent in the world, in categories. Shoot an entry to choose it. Stays until "CLOSE MENU".
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
	private const float HitDeg = 3.4f;
	private const float StatusPitch = -19.5f;
	private int _hover = -1;
	private double _hoverSince;

	public override string Name => "Menu";

	public MenuDrill(CCitadelPlayerController ctl, PlayerInput input, Level level, Action<Level> onLevel, Action<string> onSelect,
		Vector3 anchorEye, float anchorYaw) : base(ctl, input, level) {
		_level = level;
		_onLevel = onLevel;
		_onSelect = onSelect;
		_anchorEye = anchorEye;
		_anchorYaw = anchorYaw;
	}

	private static IEnumerable<Item> Layout() {
		yield return new("title", "DEADLOCK TRAINER", 0f, -24f, 15f, false, 255, 200, 0);

		// Four columns: PARRY | FLICK | TRACK | OTHER
		yield return new("hdr_parry", "PARRY", -33f, -13f, 12f, false, 255, 140, 40);
		yield return new("p_single", "Single", -33f, -8f, 9f, true, 255, 255, 255);
		yield return new("p_multi", "Multiple", -33f, -3.5f, 9f, true, 255, 255, 255);
		yield return new("p_burst", "Burst", -33f, 1f, 9f, true, 255, 255, 255);

		yield return new("hdr_flick", "FLICK", -11f, -13f, 12f, false, 255, 140, 40);
		yield return new("f_flick", "Flick", -11f, -8f, 9f, true, 255, 255, 255);
		yield return new("f_switch", "Switch", -11f, -3.5f, 9f, true, 255, 255, 255);
		yield return new("f_long", "Long Range", -11f, 1f, 9f, true, 255, 255, 255);

		yield return new("hdr_track", "TRACK", 11f, -13f, 12f, false, 255, 140, 40);
		yield return new("t_strafe", "Strafe", 11f, -8f, 9f, true, 255, 255, 255);
		yield return new("t_random", "Random", 11f, -3.5f, 9f, true, 255, 255, 255);

		yield return new("hdr_other", "OTHER", 33f, -13f, 12f, false, 255, 140, 40);
		yield return new("o_reaction", "Reaction", 33f, -8f, 9f, true, 255, 255, 255);

		yield return new("lv_easy", "EASY", -12f, 9f, 9f, true, 255, 255, 255);
		yield return new("lv_normal", "NORMAL", 0f, 9f, 9f, true, 255, 255, 255);
		yield return new("lv_hard", "HARD", 12f, 9f, 9f, true, 255, 255, 255);

		yield return new("off", "CLOSE MENU", 0f, 14.5f, 6.5f, true, 170, 170, 170);
	}

	private static string LevelId(Level l) => l switch { Level.Easy => "lv_easy", Level.Hard => "lv_hard", _ => "lv_normal" };

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		foreach (var it in Layout()) {
			var pos = _anchorEye + Aim.Forward(it.Pitch, _anchorYaw + it.Yaw) * Dist;
			var t = SpawnText(it.Label, pos, eye, it.Size, it.R, it.G, it.B);
			_items.Add((it, t, pos));
		}
		_status = SpawnText(StatusText(), StatusPos(), eye, 6.5f, 200, 200, 200);
		RefreshColors(-1);
		while (In.Shots.Count > 0) In.Shots.Dequeue(); // drop old clicks
	}

	private Vector3 StatusPos() => _anchorEye + Aim.Forward(StatusPitch, _anchorYaw) * Dist;

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) =>
		Say("[Training] Menu is up: aim at an exercise (it turns yellow) and shoot it. Choose the difficulty at the bottom. (!train off closes it)");

	private string StatusText() => $"Difficulty: {LevelParse.Label(_level).ToUpperInvariant()}  -  shoot an exercise to start";

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
		if (_status != null) Face(_status, StatusPos(), eye);

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

	/// <summary>The nearest selectable entry inside the hit zone, else -1.</summary>
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
