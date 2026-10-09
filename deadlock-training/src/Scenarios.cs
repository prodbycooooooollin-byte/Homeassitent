using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>The situations a scenario session can show. The menu has a checklist; every ticked one is played in random order.</summary>
enum ScenKind { Lone, Unknown, Group, Behind, Duel, LowHp }

static class ScenarioSet {
	public static readonly bool[] On = { true, true, true, true, true, true };
	public static readonly string[] Names = {
		"Lone enemy, you are ahead", "Enemy missing from the minimap", "Group is pushing you",
		"You are behind, two come", "Even 1v1", "You are low on health",
	};
	public static string Label(int i) => (On[i] ? "[X]  " : "[  ]  ") + Names[i];
	public static bool Any() => On.Any(x => x);
}

/// <summary>
/// Practical decision training. Each round is a believable situation (you are told what the minimap shows and how rich you are),
/// the enemies are NOT spawned in your face - they come from a direction you could have seen coming - and they shoot back.
/// You must make the right decision for real: take a free kill, or get out of a fight you cannot win.
/// The bots' shots are simulated by the trainer (damage on you is applied directly) so you cannot really die; a lethal hit ends the round.
/// </summary>
sealed class ScenarioDrill : Drill {
	private enum Ph { Setup, Wait, Active, Result }

	private sealed class Foe {
		public Actor A = null!;
		public bool On, Aggro, Ambusher;
		public float Speed = 300f, Range = 650f, Phase;
		public double NextShot, AppearAt;
		public Vector3 Home;
		public int StartHp;
	}

	private readonly int _rounds;
	private readonly List<Foe> _foes = new();
	private readonly List<ScenKind> _bag = new();
	private int _round, _right, _kills, _deaths;
	private Ph _ph = Ph.Setup;
	private ScenKind _kind;
	private double _phaseAt, _roundStart, _lastTick, _lastHit, _hudAt, _killedAt;
	private Vector3 _origin;
	private float _yaw, _safeYaw;
	private bool _died, _killedVisible;
	private CPointWorldText? _safe;
	private (string, byte, byte, byte)[]? _hud;
	private string _b1 = "", _b2 = "", _status = "";
	private readonly List<string> _log = new();

	public override string Name => "Scenarios";
	protected override float LeashRadius => 0f;

	public ScenarioDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, int rounds) : base(ctl, input, lvl) {
		_rounds = Math.Clamp(rounds, 1, 30);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		_origin = pawn.Position;
		_yaw = pawn.EyeAngles.Y;
		for (int i = 0; i < 4; i++) {
			var a = AddActor(pawn, _origin + Aim.Forward(0f, _yaw) * 800f, nowMs);
			a.KeepHealth = true;
			_foes.Add(new Foe { A = a });
		}
		foreach (var a in Actors) if (a.Wants) { try { var e = a.Ent; if (e != null) BotPool.Exempt.Add(e.EntityHandle); } catch { } }
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		if (!RealBots) { Say("[Scenarios] This needs real bots (wait until they have loaded, or switch Automatic bots on in Settings)."); Finished = true; return; }
		_phaseAt = nowMs + 1500;
		Say($"[Scenarios] {_rounds} situations in random order. Read the briefing on the right side of the screen, then decide. Enemies shoot back. Abort: !tstop");
	}

	// ---- helpers -----------------------------------------------------------------------------------------------------

	private bool Dead(Actor a) { try { var e = a.Ent; return e == null || e.Health <= 0 || !e.IsAlive; } catch { return true; } }

	private static float Norm(float a) { while (a > 180f) a -= 360f; while (a < -180f) a += 360f; return a; }

	/// <summary>A direction (yaw) with at least dist free space, preferring the given range of angles away from the start view.</summary>
	private float PickDir(CCitadelPlayerPawn pawn, float dist, float avoidYaw = float.NaN) {
		float best = _yaw, bestClear = -1f;
		for (int i = 0; i < 18; i++) {
			float y = (float)(Rng.NextDouble() * 360.0);
			if (!float.IsNaN(avoidYaw) && MathF.Abs(Norm(y - avoidYaw)) < 70f) continue;
			float c = ClearDist(pawn, y, dist);
			if (c >= dist * 0.92f) return y;
			if (c > bestClear) { bestClear = c; best = y; }
		}
		return best;
	}

	private string Clock(float worldYaw) {
		float rel = Norm(worldYaw - _yaw); // positive = left of the start view
		int h = ((int)MathF.Round(-rel / 30f) % 12 + 12) % 12;
		return (h == 0 ? 12 : h) + " o'clock";
	}

	private Vector3 Spot(float yaw, float dist, float side = 0f) =>
		_origin + Aim.Forward(0f, yaw) * dist + Aim.Right(yaw) * side;

	private Vector3 SafePos() => _origin + Aim.Forward(0f, _safeYaw) * 900f;

	// ---- main loop ---------------------------------------------------------------------------------------------------

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		double dt = _lastTick > 0 ? Math.Min(0.2, (nowMs - _lastTick) / 1000.0) : 0.016;
		_lastTick = nowMs;

		switch (_ph) {
			case Ph.Setup:
				if (nowMs < _phaseAt) break;
				if (_round >= _rounds) { Summarize(); Finished = true; return; }
				SetupRound(pawn, nowMs);
				break;
			case Ph.Wait:
				if (nowMs >= _phaseAt) { StartRound(pawn, nowMs); }
				break;
			case Ph.Active:
				foreach (var f in _foes) { MoveFoe(f, pawn, nowMs, dt); Shoot(f, pawn, nowMs); }
				CheckAmbusher(pawn, nowMs);
				if (pawn.Health <= 1) { pawn.Health = pawn.MaxHealth; _died = true; }
				Evaluate(pawn, nowMs);
				break;
			case Ph.Result:
				if (nowMs >= _phaseAt) { _ph = Ph.Setup; _phaseAt = nowMs + 300; }
				break;
		}
		if (_safe != null) Face(_safe, SafePos() + new Vector3(0, 0, 100f), eye);

		if (nowMs >= _hudAt || _hud == null) {
			_hudAt = nowMs + 250;
			_hud = new (string, byte, byte, byte)[] {
				($"SCENARIO  {Math.Min(_round, _rounds)}/{_rounds}   right: {_right}", 255, 220, 60),
				(_b1, 255, 255, 255),
				(_b2, 150, 210, 255),
				(_status, nowMs - _lastHit < 900 ? (byte)255 : (byte)200, nowMs - _lastHit < 900 ? (byte)90 : (byte)200, nowMs - _lastHit < 900 ? (byte)90 : (byte)200),
			};
		}
		SetHud(pawn, _hud);
	}

	private ScenKind NextKind() {
		if (_bag.Count == 0) {
			for (int i = 0; i < ScenarioSet.On.Length; i++) if (ScenarioSet.On[i]) _bag.Add((ScenKind)i);
			if (_bag.Count == 0) _bag.Add(ScenKind.Duel);
			for (int i = _bag.Count - 1; i > 0; i--) { int j = Rng.Next(i + 1); (_bag[i], _bag[j]) = (_bag[j], _bag[i]); }
		}
		var k = _bag[^1];
		_bag.RemoveAt(_bag.Count - 1);
		return k;
	}

	private void SetupRound(CCitadelPlayerPawn pawn, double nowMs) {
		_round++;
		_kind = NextKind();
		Kill(_safe); _safe = null;
		try { pawn.TeleportWithView(_origin + new Vector3(0, 0, 8), new Vector3(0f, _yaw, 0f)); pawn.Health = pawn.MaxHealth; } catch { }
		foreach (var f in _foes) {
			f.On = false; f.Aggro = false; f.Ambusher = false;
			try { var bp = f.A.Pawn; if (bp != null && (bp.Health <= 0 || !bp.IsAlive)) bp.ForceRespawn(); } catch { }
			try { f.A.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
		}
		_b1 = "Next situation..."; _b2 = ""; _status = "";
		_ph = Ph.Wait;
		_phaseAt = nowMs + 1800;
	}

	private void Arm(Foe f, Vector3 pos, float hpFrac, bool aggro, float speed, float range, double nowMs) {
		f.On = true; f.Aggro = aggro; f.Speed = speed; f.Range = range; f.Home = pos; f.Phase = (float)(Rng.NextDouble() * 6.28);
		f.NextShot = nowMs + 900;
		try {
			var e = f.A.Ent;
			if (e == null) return;
			e.Health = Math.Max(1, (int)(e.MaxHealth * hpFrac));
			f.StartHp = e.Health;
			e.Teleport(position: new Vector3(pos.X, pos.Y, _origin.Z + 8f), angles: new Vector3(0f, Aim.YawTo(pos, _origin), 0f), velocity: Vector3.Zero);
		} catch { }
	}

	private void StartRound(CCitadelPlayerPawn pawn, double nowMs) {
		_ph = Ph.Active; _roundStart = nowMs; _died = false; _killedVisible = false; _killedAt = 0; _lastHit = 0;
		float aggroSpeed = Lvl == Level.Easy ? 250f : Lvl == Level.Hard ? 340f : 300f;
		float dirA = PickDir(pawn, 1150f);
		float dist = Math.Min(1250f, Math.Max(700f, ClearDist(pawn, dirA, 1250f)));
		string clk = Clock(dirA);
		int meters = (int)(dist / 39f);
		_safeYaw = 0f;
		_status = "";

		switch (_kind) {
			case ScenKind.Lone:
				Arm(_foes[0], Spot(dirA, dist), 0.55f, false, aggroSpeed, 600f, nowMs);
				_b1 = "You are 4000 souls AHEAD of everyone. His team: 2 at their base, 1 dead.";
				_b2 = $"Minimap: ONE enemy at {clk}, ~{meters} m, farming and unaware, hurt (about half health).";
				break;
			case ScenKind.Unknown:
				Arm(_foes[0], Spot(dirA, dist), 0.7f, false, aggroSpeed, 600f, nowMs);
				_foes[1].Ambusher = true;
				_foes[1].AppearAt = nowMs + 8000 + Rng.NextDouble() * 4000;
				_b1 = "You are 4000 souls AHEAD. His team: 1 dead, 1 far away, 1 in front of you.";
				_b2 = $"Minimap: one enemy at {clk}, ~{meters} m. The LAST one is not on the minimap - he can be anywhere.";
				break;
			case ScenKind.Group:
				for (int i = 0; i < 4; i++) Arm(_foes[i], Spot(dirA, dist + i * 50f, (i - 1.5f) * 200f), 1f, true, aggroSpeed * 0.9f, 650f, nowMs);
				SetSafe(pawn, dirA);
				_b1 = "Even souls. You are alone, your team is far away.";
				_b2 = $"Minimap: FOUR enemies grouped at {clk}, ~{meters} m, walking at you. Safe zone is marked behind you.";
				break;
			case ScenKind.Behind:
				for (int i = 0; i < 2; i++) Arm(_foes[i], Spot(dirA, dist + i * 60f, (i - 0.5f) * 220f), 1f, true, aggroSpeed, 600f, nowMs);
				SetSafe(pawn, dirA);
				_b1 = "You are 3000 souls BEHIND. Your team is dead or far away.";
				_b2 = $"Minimap: TWO enemies at {clk}, ~{meters} m, pushing you. Safe zone is marked behind you.";
				break;
			case ScenKind.LowHp:
				try { pawn.Health = Math.Max(2, (int)(pawn.MaxHealth * 0.25f)); } catch { }
				Arm(_foes[0], Spot(dirA, dist), 1f, true, aggroSpeed, 600f, nowMs);
				SetSafe(pawn, dirA);
				_b1 = "Even souls, but you are at 25% HEALTH.";
				_b2 = $"Minimap: one enemy at {clk}, ~{meters} m, full health, coming at you. Safe zone is marked behind you.";
				break;
			default:
				Arm(_foes[0], Spot(dirA, dist), 1f, true, aggroSpeed, 600f, nowMs);
				_b1 = "Even souls, full health, nobody else around.";
				_b2 = $"Minimap: one enemy at {clk}, ~{meters} m, walking at you. Win the duel.";
				break;
		}
		Say($"[Scenario {_round}/{_rounds}] {_b1} {_b2}");
	}

	private void SetSafe(CCitadelPlayerPawn pawn, float enemyYaw) {
		_safeYaw = PickDir(pawn, 900f, enemyYaw);
		// choose the clearest direction pointing away from the enemies when possible
		float away = enemyYaw + 180f;
		if (ClearDist(pawn, away, 900f) >= 830f) _safeYaw = away;
		_safe = SpawnText("SAFE ZONE", SafePos() + new Vector3(0, 0, 100f), Aim.Eye(pawn), 20f, 120, 255, 140);
	}

	private void MoveFoe(Foe f, CCitadelPlayerPawn pawn, double nowMs, double dt) {
		if (!f.On || Dead(f.A)) return;
		var e = f.A.Ent;
		if (e == null) return;
		var cur = e.Position;
		var pp = pawn.Position;
		var to = new Vector3(pp.X - cur.X, pp.Y - cur.Y, 0f);
		float dist = MathF.Max(1f, to.Length());
		var dir = to / dist;

		if (!f.Aggro && (dist < 650f || e.Health < f.StartHp - 5)) {
			f.Aggro = true;
			Say("[Scenario] He noticed you.");
		}

		Vector3 move = Vector3.Zero, look;
		if (!f.Aggro) {
			f.Phase += (float)dt * 0.6f;
			var tgt = f.Home + new Vector3(MathF.Cos(f.Phase) * 180f, MathF.Sin(f.Phase) * 180f, 0f);
			var d = tgt - cur; d.Z = 0;
			if (d.Length() > 10f) move = Vector3.Normalize(d) * 90f;
			look = tgt;
		} else {
			if (dist > f.Range + 60f) move = dir * f.Speed;
			else if (dist < f.Range - 160f) move = -dir * f.Speed * 0.6f;
			else {
				f.Phase += (float)dt * 1.7f;
				move = new Vector3(-dir.Y, dir.X, 0f) * MathF.Sign(MathF.Sin(f.Phase)) * f.Speed * 0.7f;
			}
			look = pp;
		}
		f.A.Place(new Vector3(cur.X, cur.Y, _origin.Z) + move / 7f, look);
	}

	private void Shoot(Foe f, CCitadelPlayerPawn pawn, double nowMs) {
		if (!f.On || !f.Aggro || nowMs < f.NextShot || Dead(f.A)) return;
		f.NextShot = nowMs + 230 + Rng.Next(120);
		var e = f.A.Ent;
		if (e == null) return;
		var from = e.Position + new Vector3(0, 0, 70f);
		var to = pawn.Position + new Vector3(0, 0, 60f);
		float dist = Vector3.Distance(from, to);
		if (dist > 1700f) return;
		try {
			var r = Trace.Ray(from, to, InteractionLayer.Solid, e);
			if (r.DidHit && r.Fraction < 0.92f) return; // no line of sight
		} catch { }
		float acc = Lvl == Level.Easy ? 0.14f : Lvl == Level.Hard ? 0.34f : 0.22f;
		acc *= dist < 500f ? 1.3f : dist > 1100f ? 0.55f : 1f;
		if (Rng.NextDouble() > acc) return;
		pawn.Health = (int)(pawn.Health - pawn.MaxHealth * 0.032f);
		_lastHit = nowMs;
	}

	private void CheckAmbusher(CCitadelPlayerPawn pawn, double nowMs) {
		foreach (var f in _foes) {
			if (!f.Ambusher || f.On || nowMs < f.AppearAt) continue;
			float dirB = PickDir(pawn, 900f, 9999f);
			Arm(f, Spot(dirB, Math.Min(900f, Math.Max(500f, ClearDist(pawn, dirB, 900f)))), 1f, true, 320f, 550f, nowMs);
			Say($"[Scenario] Enemy spotted at {Clock(dirB)} - that was the missing one!");
		}
	}

	private void Evaluate(CCitadelPlayerPawn pawn, double nowMs) {
		double t = (nowMs - _roundStart) / 1000.0;
		double limit = _kind switch { ScenKind.Lone => 30, ScenKind.Unknown => 45, ScenKind.Duel => 45, ScenKind.LowHp => 14, _ => 14 };
		int hp = Math.Max(0, pawn.Health * 100 / Math.Max(1, pawn.MaxHealth));
		_status = $"{t:0} / {limit:0} s     your health {hp}%" + (nowMs - _lastHit < 900 ? "     UNDER FIRE" : "");

		if (_died) { _deaths++; Conclude(false, "You died.", Why(false), nowMs); return; }

		var p = pawn.Position;
		bool atSafe = _safe != null && Vector2.Distance(new Vector2(p.X, p.Y), new Vector2(SafePos().X, SafePos().Y)) <= 260f;

		switch (_kind) {
			case ScenKind.Lone:
				if (Dead(_foes[0].A)) { _kills++; Conclude(true, $"Killed him in {t:0.0} s.", Why(true), nowMs); return; }
				break;
			case ScenKind.Unknown: {
				if (!_killedVisible && Dead(_foes[0].A)) { _killedVisible = true; _killedAt = nowMs; _kills++; }
				var amb = _foes[1];
				if (_killedVisible && amb.On && Dead(amb.A)) { _kills++; Conclude(true, "You killed the visible one AND handled the one from the jungle.", Why(true), nowMs); return; }
				if (_killedVisible && amb.On && nowMs - amb.AppearAt > 16000) { Conclude(true, "You killed the visible one and survived the ambush.", Why(true), nowMs); return; }
				break;
			}
			case ScenKind.Duel:
				if (Dead(_foes[0].A)) { _kills++; Conclude(true, $"Duel won in {t:0.0} s.", Why(true), nowMs); return; }
				break;
			case ScenKind.LowHp:
				if (atSafe) { Conclude(true, $"You disengaged at low health in {t:0.0} s.", Why(true), nowMs); return; }
				if (Dead(_foes[0].A)) { _kills++; Conclude(true, "You won the fight even at low health - risky, but it worked.", Why(true), nowMs); return; }
				break;
			case ScenKind.Group:
				if (atSafe) { Conclude(true, $"You got away from four enemies in {t:0.0} s.", Why(true), nowMs); return; }
				break;
			case ScenKind.Behind:
				if (atSafe) { Conclude(true, $"You avoided a fight you could not afford ({t:0.0} s).", Why(true), nowMs); return; }
				if (Dead(_foes[0].A) && Dead(_foes[1].A)) { _kills += 2; Conclude(true, "You won 1v2 while behind - strong, but that fight was not necessary.", Why(true), nowMs); return; }
				break;
		}
		if (t >= limit) Conclude(false, TimeoutText(), Why(false), nowMs);
	}

	private string TimeoutText() => _kind switch {
		ScenKind.Lone => "Too slow. A hurt, unaware enemy is a free kill - you wasted your lead.",
		ScenKind.Unknown => "You did not finish the situation in time.",
		ScenKind.Duel => "The duel was not decided in time.",
		ScenKind.LowHp => "You stayed in range at low health.",
		_ => "You stayed in front of the enemies instead of leaving.",
	};

	private string Why(bool ok) => _kind switch {
		ScenKind.Lone => "Why: with a big soul lead and the rest of his team far away, a lone hurt enemy is a free kill. Take it fast, before help arrives.",
		ScenKind.Unknown => "Why: one missing enemy is a reason to be aware, not to skip a free kill. Kill, then look around - the last one can come from the jungle.",
		ScenKind.Group => "Why: four against one is not a fight, even at equal souls. Leave while you still have health and use your own side.",
		ScenKind.Behind => "Why: when behind, avoid trades you can lose. Give up the lane space, not your life, and wait for your team.",
		ScenKind.LowHp => "Why: at 25% health every trade is lost. Retreat to heal; a dead hero gives away souls.",
		_ => "Why: an even duel is decided by positioning, strafing and who lands the first hits.",
	};

	private void Conclude(bool ok, string text, string why, double nowMs) {
		if (ok) _right++;
		Say($"[Scenario {_round}/{_rounds}] {(ok ? "RIGHT" : "WRONG")}: {text}");
		Say(why);
		_b1 = ok ? "Round won" : "Round lost"; _b2 = text; _status = "";
		_log.Add($"{ScenarioSet.Names[(int)_kind]}: {(ok ? "ok" : "wrong")}");
		foreach (var f in _foes) { f.On = false; try { f.A.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { } }
		Kill(_safe); _safe = null;
		_ph = Ph.Result;
		_phaseAt = nowMs + 3500;
		_died = false;
	}

	private void Summarize() {
		Say($"=== Scenarios finished: {_right}/{_rounds} right ({Fmt.Pct(_right, _rounds)}) | kills {_kills} | deaths {_deaths} ===");
		string key = $"scen_{Lvl}";
		bool best = Records.Submit(key, 100.0 * _right / _rounds);
		Say(best ? $"New best this session: {100.0 * _right / _rounds:0}%" : $"Best this session: {Records.Get(key):0}%");
		Ctl.HudAnnounce("SCENARIOS DONE", $"{_right}/{_rounds}");
	}

	public override void Stop() {
		Kill(_safe); _safe = null;
		foreach (var a in Actors) {
			try { var e = a.Ent; if (e != null) BotPool.Exempt.Remove(e.EntityHandle); } catch { }
			try { a.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
			a.KeepHealth = false;
		}
		base.Stop();
	}
}

/// <summary>
/// Counterspell training. In every round a different hero appears in front of you, casts an ability that Counterspell can stop, and is gone again.
/// The hero's name and ability are shown above him with a cast bar. Use your Counterspell item (any item key) after the cast starts and before it lands.
/// The casts are simulated by the trainer (the model is always your own hero's; the label tells you who it is supposed to be).
/// </summary>
sealed class CounterspellDrill : Drill {
	private enum Ph { Gap, Cast, Result }

	private static readonly (string Hero, string Ability, float Mult)[] Casts = {
		("Haze", "Sleep Dagger", 1.0f), ("Infernus", "Concussive Combustion", 1.2f), ("Grey Talon", "Spirit Snare", 1.1f),
		("Lady Geist", "Essence Bomb", 1.0f), ("Lady Geist", "Life Drain", 0.9f), ("Kelvin", "Frost Grenade", 1.0f),
		("Bebop", "Sticky Bomb", 1.0f), ("Dynamo", "Kinetic Pulse", 1.1f), ("Ivy", "Kudzu Bomb", 1.0f),
		("Lash", "Grapple", 0.9f), ("Mo & Krill", "Scorn", 0.9f), ("Paradox", "Pulse Grenade", 1.0f),
		("Seven", "Lightning Ball", 1.1f), ("Shiv", "Serrated Knives", 0.9f), ("Vindicta", "Stake", 1.0f),
		("Viscous", "Splatter", 1.0f), ("Warden", "Alchemical Flask", 1.0f), ("Warden", "Binding Word", 0.9f),
		("Wraith", "Telekinesis", 0.9f), ("Yamato", "Power Slash", 1.0f), ("Holliday", "Spirit Lasso", 1.0f),
		("Vyper", "Screwjab Dagger", 0.9f), ("Abrams", "Siphon Life", 0.9f), ("Sinclair", "Vexing Bolt", 1.0f),
	};

	private readonly int _total;
	private int _done, _ok, _late, _early;
	private readonly List<double> _react = new();
	private Ph _ph = Ph.Gap;
	private double _nextAt, _castAt, _hitAt, _hudAt, _barAt;
	private int _cur = -1, _last = -1, _items0;
	private double _firstPress;
	private bool _itemOk;
	private CPointWorldText? _label;
	private Vector3 _pos;
	private string _b1 = "", _b2 = "";
	private (string, byte, byte, byte)[]? _hud;

	public override string Name => "Counterspell";
	protected override float LeashRadius => 0f;

	public CounterspellDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, int rounds) : base(ctl, input, lvl) {
		_total = Math.Clamp(rounds, 1, 40);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		string[] names = { "upgrade_counterspell", "upgrade_counter_spell", "upgrade_counterspell_item" };
		foreach (var n in names) {
			try { if (pawn.AddItem(n) != null) { _itemOk = true; Console.WriteLine($"[Trainer] Counterspell item granted as '{n}'."); break; } } catch { }
		}
		AddActor(pawn, pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 600f, nowMs);
		foreach (var a in Actors) if (a.Wants) { try { var e = a.Ent; if (e != null) BotPool.Exempt.Add(e.EntityHandle); } catch { } }
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		if (!RealBots) { Say("[Counterspell] This needs real bots."); Finished = true; return; }
		_nextAt = nowMs + 2500;
		Say($"[Counterspell] {_total} rounds. A hero appears, a cast bar fills above him - use your Counterspell BEFORE the bar is full.");
		Say(_itemOk ? "[Counterspell] The item was added to your inventory. Any item key counts as the press."
			: "[Counterspell] I could not add the item automatically: put Counterspell in an item slot (buy it in the shop). Any item key counts as the press.");
	}

	private float Windup(int i) {
		float basis = Lvl == Level.Easy ? 1500f : Lvl == Level.Hard ? 650f : 1000f;
		return basis * Casts[i].Mult;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var a = Actors[0];
		var lp = _pos + new Vector3(0, 0, 190f);

		switch (_ph) {
			case Ph.Gap:
				try { a.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
				_b1 = "Next hero..."; _b2 = "";
				if (nowMs < _nextAt) break;
				if (_done >= _total) { Summarize(); Finished = true; return; }
				BeginCast(pawn, a, nowMs);
				break;
			case Ph.Cast: {
				try { a.Place(_pos, pawn.Position); } catch { }
				if (_label != null) Face(_label, lp, eye);
				// the first item press after the cast started
				if (_firstPress <= 0 && In.ItemPresses > _items0) _firstPress = In.LastItemPressMs;
				if (_firstPress > 0 && _firstPress >= _castAt - 1500 && _firstPress < _castAt) { Resolve(false, true, nowMs); break; }
				if (_firstPress >= _castAt && _firstPress <= _hitAt + 120) { Resolve(true, false, nowMs); break; }
				if (nowMs >= _barAt && _label != null) {
					_barAt = nowMs + 80;
					double f = Math.Clamp((nowMs - _castAt) / (_hitAt - _castAt), 0, 1);
					int n = (int)(f * 10);
					_label.SetMessage($"{Casts[_cur].Hero.ToUpperInvariant()} casts {Casts[_cur].Ability.ToUpperInvariant()}\n[{new string('#', n)}{new string('.', 10 - n)}]");
				}
				if (nowMs > _hitAt + 120) Resolve(false, false, nowMs);
				break;
			}
			case Ph.Result:
				if (nowMs >= _nextAt) { Kill(_label); _label = null; _ph = Ph.Gap; _nextAt = nowMs + 300; }
				break;
		}

		if (nowMs >= _hudAt || _hud == null) {
			_hudAt = nowMs + 250;
			_hud = new (string, byte, byte, byte)[] {
				($"COUNTERSPELL  {Math.Min(_done + (_ph == Ph.Cast ? 1 : 0), _total)}/{_total}   countered: {_ok}", 255, 220, 60),
				(_b1, 255, 255, 255),
				(_b2, 150, 210, 255),
			};
		}
		SetHud(pawn, _hud);
	}

	private void BeginCast(CCitadelPlayerPawn pawn, Actor a, double nowMs) {
		do { _cur = Rng.Next(Casts.Length); } while (_cur == _last && Casts.Length > 1);
		_last = _cur;
		// a different place every time, not always straight ahead
		float yaw = pawn.EyeAngles.Y + (float)(Rng.NextDouble() * 80.0 - 40.0);
		float dist = Math.Min(620f + (float)Rng.NextDouble() * 280f, ClearDist(pawn, yaw, 900f));
		dist = Math.Max(380f, dist);
		_pos = pawn.Position + Aim.Forward(0f, yaw) * dist;
		try { a.Ent?.Teleport(position: new Vector3(_pos.X, _pos.Y, pawn.Position.Z + 8f), velocity: Vector3.Zero); } catch { }
		_castAt = nowMs + 450; // a short moment to see who it is
		_hitAt = _castAt + Windup(_cur);
		_items0 = In.ItemPresses;
		_firstPress = 0;
		_ph = Ph.Cast;
		Kill(_label);
		_label = SpawnText($"{Casts[_cur].Hero.ToUpperInvariant()} casts {Casts[_cur].Ability.ToUpperInvariant()}\n[..........]", _pos + new Vector3(0, 0, 190f), Aim.Eye(pawn), 14f, 255, 90, 90);
		_b1 = $"{Casts[_cur].Hero}: {Casts[_cur].Ability}";
		_b2 = "Use Counterspell BEFORE the bar is full!";
	}

	private void Resolve(bool countered, bool early, double nowMs) {
		_done++;
		var c = Casts[_cur];
		if (countered) {
			_ok++;
			double ms = _firstPress - _castAt;
			_react.Add(ms);
			Say($"[Counterspell {_done}/{_total}] COUNTERED {c.Hero} - {c.Ability}: you reacted {ms:0} ms after the cast started (the cast takes {_hitAt - _castAt:0} ms).");
			_b1 = $"COUNTERED  ({ms:0} ms)"; _b2 = "";
		} else if (early) {
			_early++;
			Say($"[Counterspell {_done}/{_total}] TOO EARLY: you pressed before {c.Hero} even started casting - the Counterspell is wasted. Wait for the cast.");
			_b1 = "TOO EARLY"; _b2 = "Wait until the cast starts.";
		} else {
			_late++;
			Say($"[Counterspell {_done}/{_total}] TOO LATE: {c.Hero}'s {c.Ability} would have landed (cast time {_hitAt - _castAt:0} ms). React the moment the bar starts.");
			_b1 = "TOO LATE - it hit you"; _b2 = "";
		}
		Kill(_label);
		_label = SpawnText(countered ? "COUNTERED" : early ? "TOO EARLY" : "HIT", _pos + new Vector3(0, 0, 190f), Aim.Eye(PlayerPawn!), 16f,
			countered ? (byte)90 : (byte)255, countered ? (byte)255 : (byte)90, 90);
		_ph = Ph.Result;
		_nextAt = nowMs + 900 + Rng.NextDouble() * 900;
	}

	private void Summarize() {
		string avg = _react.Count > 0 ? $" | average reaction {_react.Average():0} ms" : "";
		Say($"=== Counterspell finished: countered {_ok} | too late {_late} | too early {_early} of {_total}{avg} ===");
		string key = $"counter_{Lvl}";
		bool best = Records.Submit(key, 100.0 * _ok / _total);
		Say(best ? $"New best this session: {100.0 * _ok / _total:0}%" : $"Best this session: {Records.Get(key):0}%");
		Ctl.HudAnnounce("COUNTERSPELL DONE", $"{_ok}/{_total}");
	}

	public override void Stop() {
		Kill(_label); _label = null;
		foreach (var a in Actors) {
			try { var e = a.Ent; if (e != null) BotPool.Exempt.Remove(e.EntityHandle); } catch { }
			try { a.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
		}
		base.Stop();
	}
}
