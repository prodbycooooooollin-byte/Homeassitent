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
	public static readonly string[] Desc = {
		"You are far ahead. One hurt enemy farms alone while his team is far away.",
		"You are ahead, one enemy is visible and the last one is hiding somewhere.",
		"Four enemies walk at you. Is this a fight?",
		"You are behind in souls and two enemies come.",
		"Equal strength, one enemy, nobody else near.",
		"You have 25% health and an enemy is coming.",
	};
	public static string Label(int i) => (On[i] ? "[X]  " : "[  ]  ") + Names[i];
	public static bool Any() => On.Any(x => x);
}

/// <summary>The game's own bot AI switches (fighting, shooting, dodging, parrying, abilities). Unknown ones are simply ignored by the console.</summary>
static class FightAi {
	private static readonly string[] Switches = { "citadel_bot_shoot", "citadel_bot_zig_zag", "citadel_bot_parry", "citadel_bot_attack_enemies", "citadel_bot_use_random_abilities" };

	/// <summary>Everything off, bots idle. These switches are global and stay on until switched off: always reset before an exercise that must not have fighting bots.</summary>
	public static void Reset() {
		try {
			Server.ExecuteCommand("sv_cheats 1");
			Server.ExecuteCommand("citadel_bot_test_mode 1");
			foreach (var c in Switches) Server.ExecuteCommand(c + " 0");
			Server.ExecuteCommand("citadel_bot_melee 0");
			Server.ExecuteCommand("citadel_bot_use_ability 0");
			TrainerBots.CheatsOffAt = -1;
		} catch { }
	}
	public static void Prepare() => Reset();
	public static void On() {
		try {
			Server.ExecuteCommand("citadel_bot_test_mode 0");
			foreach (var c in Switches) Server.ExecuteCommand(c + " 1");
		} catch { }
	}
	public static void Idle() {
		try {
			Server.ExecuteCommand("citadel_bot_test_mode 1");
			foreach (var c in Switches) Server.ExecuteCommand(c + " 0");
		} catch { }
	}
	public static void Release() { Reset(); TrainerBots.CheatsOffAt = Clock.Ms + 800; }
}

/// <summary>
/// Practical decision training anywhere on the map. Every round you are put at a random street spot, you get a briefing (souls, health, minimap),
/// the enemies are spawned far away in a direction you can see, and then you must make the right call for real:
/// fight (kill them) or retreat (get far away and out of their sight). The game's own bot AI is switched on; if the bots do not move or shoot
/// by themselves, the trainer drives them (walking at you, simulated shots) instead. You cannot die: a lethal hit ends the round as lost.
/// </summary>
sealed class ScenarioDrill : Drill {
	private enum Ph { Setup, Wait, Read, Brief, Active, Result }

	private sealed class Foe {
		public Actor A = null!;
		public bool On, Aggro, Ambusher;
		public float Speed = 250f, Range = 650f, Phase;
		public double NextShot, AppearAt, TagAt;
		public Vector3 Home, P0;
		public int StartHp;
		public CPointWorldText? Tag;
	}

	private readonly int _rounds;
	private readonly List<Foe> _foes = new();
	private readonly List<ScenKind> _bag = new();
	private int _round, _right, _kills, _deaths;
	private Ph _ph = Ph.Setup;
	private ScenKind _kind;
	private double _phaseAt, _roundStart, _lastTick, _lastHit, _hudAt, _hiddenSince = -1;
	private Vector3 _origin;
	private float _yaw, _top = 300f, _dirA;
	private bool _died, _killedVisible;
	private bool _aiOn, _aiDecided, _realAi, _realDamage, _simShots;
	private double _aiStartAt;
	private (string, byte, byte, byte)[]? _hud;
	private string _b1 = "", _b2 = "", _status = "";
	private LaneModel _lanes = new();
	private LaneModel.Lane? _lane;
	private Vector3 _hub;
	private int _team;
	private float _sPlayer;

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
		FightAi.Prepare();
		_hub = pawn.Position;
		_team = pawn.TeamNum;
		try { _lanes = LaneModel.Build(Server.MapName, _hub, _team); } catch (Exception ex) { Console.WriteLine($"[Trainer] Lane model failed: {ex.Message}"); }
		if (!_lanes.Ok) Arena.RandomSpot(Server.MapName, pawn); // fallback spots (a short hitch once per map)
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		if (!RealBots) { Say("[Scenarios] This needs real bots (wait until they have loaded, or switch Automatic bots on in Settings)."); Finished = true; return; }
		_phaseAt = nowMs + 1500;
		if (!_lanes.Ok) Say("[Scenarios] The lane layout of this map is not known yet (the trainer reads it ~15 s after you join, before the guardians are removed). Restart the server once, wait 30 s after joining, then start again. For now: random street spots.");
		Say($"[Scenarios] {_rounds} situations at random places on the map. Each round: read the briefing at the top of your screen (souls, health, minimap), then DECIDE:");
		Say("  FIGHT = kill the enemies   |   RETREAT = get far away from them and out of their sight. The right choice depends on souls, numbers and health. Abort: !tstop");
	}

	// ---- helpers -----------------------------------------------------------------------------------------------------

	private bool Dead(Actor a) { try { var e = a.Ent; return e == null || e.Health <= 0 || !e.IsAlive; } catch { return true; } }

	private static float Norm(float a) { while (a > 180f) a -= 360f; while (a < -180f) a += 360f; return a; }

	/// <summary>Free distance at chest height from the round's start spot in direction yaw.</summary>
	private float ClearFrom(float yaw, float wanted) {
		try {
			var start = _origin + new Vector3(0, 0, 60f);
			var r = Trace.Ray(start, start + Aim.Forward(0f, yaw) * wanted, InteractionLayer.Solid);
			return r.DidHit ? MathF.Max(0f, r.Fraction * wanted - 90f) : wanted;
		} catch { return wanted; }
	}

	private float PickDir(float dist, float avoidYaw = float.NaN) {
		float best = _yaw, bestClear = -1f;
		for (int i = 0; i < 24; i++) {
			float y = (float)(Rng.NextDouble() * 360.0);
			if (!float.IsNaN(avoidYaw) && MathF.Abs(Norm(y - avoidYaw)) < 70f) continue;
			float c = ClearFrom(y, dist);
			if (c >= dist * 0.92f) return y;
			if (c > bestClear) { bestClear = c; best = y; }
		}
		return best;
	}

	private string ClockDir(float worldYaw) {
		float rel = Norm(worldYaw - _yaw);
		int h = ((int)MathF.Round(-rel / 30f) % 12 + 12) % 12;
		return (h == 0 ? 12 : h) + " o'clock";
	}

	private Vector3 Ground(Vector3 p, float refZ) {
		try {
			var r = Trace.Ray(new Vector3(p.X, p.Y, refZ + 200f), new Vector3(p.X, p.Y, refZ - 500f), InteractionLayer.Solid);
			if (r.DidHit && !r.Trace.StartInSolid && MathF.Abs(r.HitPosition.Z - refZ) <= 350f) return r.HitPosition + new Vector3(0, 0, 8f);
		} catch { }
		return new Vector3(p.X, p.Y, refZ + 8f);
	}

	private Vector3 Spot(float yaw, float dist, float side = 0f) {
		var p = _origin + Aim.Forward(0f, yaw) * dist + Aim.Right(yaw) * side;
		return Ground(p, _origin.Z);
	}

	/// <summary>A point on the lane 'ahead' units further toward the enemy than the player, shifted sideways.</summary>
	private Vector3 LaneAhead(float ahead, float side = 0f) {
		if (_lane == null) return Spot(_yaw, ahead, side);
		float s = _sPlayer + ahead;
		var p = _lane.At(s) + Aim.Right(_lane.Yaw(s)) * side;
		return Ground(p, _lane.At(s).Z);
	}

	private bool HasLos(Foe f, CCitadelPlayerPawn pawn) {
		try {
			var e = f.A.Ent;
			if (e == null) return false;
			var r = Trace.Ray(e.Position + new Vector3(0, 0, 70f), pawn.Position + new Vector3(0, 0, 60f), InteractionLayer.Solid, e);
			return !(r.DidHit && r.Fraction < 0.95f);
		} catch { return true; }
	}

	// ---- main loop ---------------------------------------------------------------------------------------------------

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (_ph == Ph.Active && IsPlayer(e.Entity) && (ActorOf(e.Info.Attacker) != null || ActorOf(e.Info.Inflictor) != null) && e.Entity is { } p) {
			_realDamage = true; // the game's own bot AI really hits you
			_lastHit = Clock.Ms;
			if (p.Health - e.Info.Damage <= 1) { e.Info.Damage = 0; p.Health = p.MaxHealth; _died = true; }
		}
		return HookResult.Continue;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		double dt = _lastTick > 0 ? Math.Min(0.2, (nowMs - _lastTick) / 1000.0) : 0.016;
		_lastTick = nowMs;
		try { var v = pawn.AbsVelocity; float sp = MathF.Sqrt(v.X * v.X + v.Y * v.Y); if (sp > _top && sp < 900f) _top = sp; } catch { }

		switch (_ph) {
			case Ph.Setup:
				if (nowMs < _phaseAt) break;
				if (_round >= _rounds) { Summarize(); Finished = true; return; }
				SetupRound(pawn, nowMs);
				break;
			case Ph.Wait:
				if (nowMs >= _phaseAt) StartRound(pawn, nowMs);
				break;
			case Ph.Read:
				foreach (var f in _foes) UpdateTag(f, pawn, nowMs);
				_status = "Take your time. Shoot when you are ready.";
				if (nowMs >= _phaseAt && In.Shots.Count > 0) {
					while (In.Shots.Count > 0) In.Shots.Dequeue();
					ClearBriefing();
					try { pawn.SetMoveType(MoveType.Walk); } catch { }
					_ph = Ph.Brief; _phaseAt = nowMs + 1500;
				}
				break;
			case Ph.Brief:
				foreach (var f in _foes) UpdateTag(f, pawn, nowMs);
				_status = "Go!";
				if (nowMs >= _phaseAt) BeginActive(nowMs);
				break;
			case Ph.Active:
				ActiveTick(pawn, nowMs, dt);
				break;
			case Ph.Result:
				if (nowMs >= _phaseAt) { _ph = Ph.Setup; _phaseAt = nowMs + 300; }
				break;
		}

		if (nowMs >= _hudAt || _hud == null) {
			_hudAt = nowMs + 250;
			bool hit = nowMs - _lastHit < 900;
			_hud = new (string, byte, byte, byte)[] {
				($"SCENARIO  {Math.Min(_round, _rounds)}/{_rounds}   right: {_right}", 255, 220, 60),
				(_b1, 255, 255, 255),
				(_b2, 150, 210, 255),
				("FIGHT (kill them)  or  RETREAT (far away + out of sight)", 255, 200, 120),
				(_status, hit ? (byte)255 : (byte)200, hit ? (byte)90 : (byte)200, hit ? (byte)90 : (byte)200),
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
		FightAi.Idle();
		_aiOn = _aiDecided = _realAi = _simShots = false;
		_hiddenSince = -1;
		// a believable place: on a lane (or, without map data, at a random street spot away from the base)
		_lane = null;
		if (_lanes.Ok) {
			_lane = _lanes.Lanes[Rng.Next(_lanes.Lanes.Count)];
			float frac = _kind switch { ScenKind.Group => 0.84f, ScenKind.Behind => 0.42f, ScenKind.LowHp => 0.55f, ScenKind.Duel => 0.5f, _ => 0.62f };
			frac = Math.Clamp(frac + (float)(Rng.NextDouble() * 0.08 - 0.04), 0.1f, 0.95f);
			_sPlayer = _lane.Len * frac;
			var lp = _lane.At(_sPlayer);
			_origin = Ground(lp, lp.Z);
			_yaw = _lane.Yaw(_sPlayer) + (float)(Rng.NextDouble() * 90.0 - 45.0);
		} else {
			var sp = Arena.RandomSpot(Server.MapName, pawn, _hub);
			for (int i = 0; i < 8 && sp.HasValue && Vector3.Distance(sp.Value.Pos, _hub) < 1800f; i++) sp = Arena.RandomSpot(Server.MapName, pawn, _hub);
			if (sp.HasValue && Vector3.Distance(sp.Value.Pos, _hub) >= 1800f) { _origin = sp.Value.Pos; _yaw = sp.Value.Yaw; }
		}
		try { pawn.TeleportWithView(_origin + new Vector3(0, 0, 8), new Vector3(0f, _yaw, 0f)); pawn.Health = pawn.MaxHealth; } catch { }
		foreach (var f in _foes) {
			f.On = false; f.Aggro = false; f.Ambusher = false; Kill(f.Tag); f.Tag = null;
			try { var bp = f.A.Pawn; if (bp != null && (bp.Health <= 0 || !bp.IsAlive)) bp.ForceRespawn(); } catch { }
			try { f.A.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
		}
		_b1 = "Next situation..."; _b2 = ""; _status = "";
		_ph = Ph.Wait;
		_phaseAt = nowMs + 2200;
	}

	private void Arm(Foe f, Vector3 pos, float hpFrac, bool aggro, float speed, float range) {
		f.On = true; f.Aggro = aggro; f.Speed = speed; f.Range = range; f.Home = pos; f.Phase = (float)(Rng.NextDouble() * 6.28);
		f.NextShot = double.MaxValue;
		try {
			var e = f.A.Ent;
			if (e == null) return;
			e.Health = Math.Max(1, (int)(e.MaxHealth * hpFrac));
			f.StartHp = e.Health;
			e.Teleport(position: pos, angles: new Vector3(0f, Aim.YawTo(pos, _origin), 0f), velocity: Vector3.Zero);
		} catch { }
	}

	private void StartRound(CCitadelPlayerPawn pawn, double nowMs) {
		_ph = Ph.Read; _phaseAt = nowMs + 1200; _roundStart = nowMs; _died = false; _killedVisible = false; _lastHit = 0; _realDamage = false;
		float k = Lvl == Level.Easy ? 0.62f : Lvl == Level.Hard ? 0.86f : 0.74f;
		float spd = Math.Clamp(_top * k, 150f, 420f); // enemies are slower than you: running away can work
		Vector3 first;
		string where;

		switch (_kind) {
			case ScenKind.Lone: {
				// a jungle camp near the lane if there is one, otherwise farming on the lane
				Vector3? camp = null;
				foreach (var c in _lanes.Camps.OrderBy(_ => Rng.Next()))
					if (Vector3.Distance(c, _origin) is > 900f and < 2400f) { camp = c; break; }
				first = camp.HasValue ? Ground(camp.Value, camp.Value.Z) : LaneAhead(1300f);
				where = camp.HasValue ? "farming a jungle camp" : "farming in the lane";
				Arm(_foes[0], first, 0.55f, false, spd, 600f);
				_b1 = "You are 4000 souls AHEAD of everyone. His team: 2 at their base, 1 dead.";
				_b2 = $"Minimap: ONE enemy at {ClockDir(Aim.YawTo(_origin, first))}, ~{(int)(Vector3.Distance(_origin, first) / 39f)} m, {where}, unaware and hurt.";
				break;
			}
			case ScenKind.Unknown:
				first = LaneAhead(1300f);
				Arm(_foes[0], first, 0.7f, false, spd, 600f);
				_foes[1].Ambusher = true;
				_foes[1].AppearAt = _phaseAt + 8000 + Rng.NextDouble() * 4000;
				_b1 = "You are 4000 souls AHEAD. His team: 1 dead, 1 far away, 1 in front of you.";
				_b2 = $"Minimap: one enemy at {ClockDir(Aim.YawTo(_origin, first))}, ~{(int)(Vector3.Distance(_origin, first) / 39f)} m. The LAST one is not on the minimap - he can be anywhere.";
				break;
			case ScenKind.Group:
				first = LaneAhead(1500f);
				for (int i = 0; i < 4; i++) Arm(_foes[i], LaneAhead(1500f + i * 60f, (i - 1.5f) * 200f), 1f, true, spd * 0.95f, 650f);
				_b1 = "You pushed far into their side of the lane and are OVEREXTENDED. Even souls, your team is far away.";
				_b2 = $"Minimap: FOUR enemies coming from their base at {ClockDir(Aim.YawTo(_origin, first))}, ~{(int)(Vector3.Distance(_origin, first) / 39f)} m.";
				break;
			case ScenKind.Behind:
				first = LaneAhead(1400f);
				for (int i = 0; i < 2; i++) Arm(_foes[i], LaneAhead(1400f + i * 60f, (i - 0.5f) * 220f), 1f, true, spd, 600f);
				_b1 = "You are 3000 souls BEHIND. Your team is dead or far away.";
				_b2 = $"Minimap: TWO enemies at {ClockDir(Aim.YawTo(_origin, first))}, ~{(int)(Vector3.Distance(_origin, first) / 39f)} m, pushing the lane at you.";
				break;
			case ScenKind.LowHp:
				try { pawn.Health = Math.Max(2, (int)(pawn.MaxHealth * 0.25f)); } catch { }
				first = LaneAhead(1300f);
				Arm(_foes[0], first, 1f, true, spd, 600f);
				_b1 = "Even souls, but you are at 25% HEALTH.";
				_b2 = $"Minimap: one enemy at {ClockDir(Aim.YawTo(_origin, first))}, ~{(int)(Vector3.Distance(_origin, first) / 39f)} m, full health, coming at you.";
				break;
			default:
				first = LaneAhead(1300f);
				Arm(_foes[0], first, 1f, true, spd, 600f);
				_b1 = "Even souls, full health, nobody else around.";
				_b2 = $"Minimap: one enemy at {ClockDir(Aim.YawTo(_origin, first))}, ~{(int)(Vector3.Distance(_origin, first) / 39f)} m, walking at you. Win the duel.";
				break;
		}
		_dirA = Aim.YawTo(_origin, first);
		ShowBriefing(pawn);
		Say($"[Scenario {_round}/{_rounds}] {_b1} {_b2}");
	}

	private readonly List<CPointWorldText> _read = new();
	private Vector3 _readBase;

	/// <summary>The situation as big text in front of you. You are held still and can read as long as you like; one shot starts the round.</summary>
	private void ShowBriefing(CCitadelPlayerPawn pawn) {
		ClearBriefing();
		while (In.Shots.Count > 0) In.Shots.Dequeue();
		try { pawn.SetMoveType(MoveType.None); } catch { }
		var eye = Aim.Eye(pawn);
		float yaw = pawn.EyeAngles.Y;
		_readBase = eye + Aim.Forward(0f, yaw) * 150f;
		var lines = new List<(string, float, byte, byte, byte)> {
			($"SCENARIO {_round}/{_rounds}", 7f, 255, 220, 60),
			(_b1, 4.2f, 255, 255, 255),
			(_b2, 4.2f, 150, 210, 255),
			(FleeKind ? "Think: can you win this? If not, get away." : "Think: is this a fight you should take?", 4.2f, 255, 200, 120),
			("FIGHT = kill them     RETREAT = far away + out of sight", 4.2f, 255, 200, 120),
			(">>>  SHOOT TO START  <<<", 6f, 120, 255, 140),
		};
		float pitch = -12f;
		foreach (var (text, size, r, g, b) in lines) {
			var pos = eye + Aim.Forward(pitch, yaw) * 150f;
			var t = SpawnText(text, pos, eye, size, r, g, b);
			if (t != null) _read.Add(t);
			pitch += size >= 6f ? 6.5f : 5.2f;
		}
	}

	private void ClearBriefing() { foreach (var t in _read) Kill(t); _read.Clear(); }

	private void BeginActive(double nowMs) {
		_ph = Ph.Active;
		_roundStart = nowMs;
		if (_foes.Any(f => f.On && f.Aggro)) StartAi(nowMs);
	}

	private void StartAi(double nowMs) {
		// The game's own bot AI shoots wherever it likes, not at you: the trainer aims, moves and fires the bots itself.
		if (_aiOn) return;
		_aiOn = true; _aiStartAt = nowMs; _aiDecided = true; _realAi = false;
		foreach (var f in _foes) f.NextShot = nowMs + 500;
	}

	private void ActiveTick(CCitadelPlayerPawn pawn, double nowMs, double dt) {
		foreach (var f in _foes) {
			MoveFoe(f, pawn, nowMs, dt);
			Shoot(f, pawn, nowMs);
			UpdateTag(f, pawn, nowMs);
		}
		CheckAmbusher(nowMs);
		if (pawn.Health <= 1) { pawn.Health = pawn.MaxHealth; _died = true; }
		Evaluate(pawn, nowMs);
	}

	private void UpdateTag(Foe f, CCitadelPlayerPawn pawn, double nowMs) {
		var e = f.A.Ent;
		if (!f.On || e == null || Dead(f.A)) { if (f.Tag != null) { Kill(f.Tag); f.Tag = null; } return; }
		var pos = e.Position + new Vector3(0, 0, 210f);
		var eye = Aim.Eye(pawn);
		float dist = Vector3.Distance(pawn.Position, e.Position);
		if (f.Tag == null) f.Tag = SpawnText("ENEMY", pos, eye, Math.Clamp(dist / 55f, 14f, 34f), 255, 70, 70);
		if (f.Tag == null) return;
		Face(f.Tag, pos, eye);
		if (nowMs >= f.TagAt) {
			f.TagAt = nowMs + 250;
			int hp = Math.Max(0, e.Health * 100 / Math.Max(1, e.MaxHealth));
			f.Tag.SetMessage($"ENEMY  {(int)(dist / 39f)} m  {hp}%");
		}
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
			StartAi(nowMs);
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
		float floor = Ground(cur, pawn.Position.Z).Z - 8f;
		f.A.Place(new Vector3(cur.X, cur.Y, floor) + move / 7f, look);
	}

	private void Shoot(Foe f, CCitadelPlayerPawn pawn, double nowMs) {
		if (!f.On || !f.Aggro || nowMs < f.NextShot || Dead(f.A)) return;
		f.NextShot = nowMs + 230 + Rng.Next(120);
		try { f.A.Pawn?.ExecuteAbilityBySlot(EAbilitySlot.WeaponPrimary); } catch { } // it faces you: real bullets if the game lets it
		var e = f.A.Ent;
		if (e == null) return;
		float dist = Vector3.Distance(e.Position, pawn.Position);
		if (dist > 1700f || !HasLos(f, pawn)) return;
		float acc = Lvl == Level.Easy ? 0.14f : Lvl == Level.Hard ? 0.34f : 0.22f;
		acc *= dist < 500f ? 1.3f : dist > 1100f ? 0.55f : 1f;
		if (Rng.NextDouble() > acc || _realDamage) return; // once real bullets hurt you, the simulated hits stop
		pawn.Health = (int)(pawn.Health - pawn.MaxHealth * 0.032f);
		_lastHit = nowMs;
	}

	private void CheckAmbusher(double nowMs) {
		foreach (var f in _foes) {
			if (!f.Ambusher || f.On || nowMs < f.AppearAt) continue;
			float dirB;
			Vector3 at;
			if (_lane != null) {
				// out of the jungle, from the side of the lane
				float side = Rng.Next(2) == 0 ? 1000f : -1000f;
				at = Ground(_origin + Aim.Right(_lane.Yaw(_sPlayer)) * side, _origin.Z);
				dirB = Aim.YawTo(_origin, at);
			} else {
				dirB = PickDir(900f, _dirA);
				at = Spot(dirB, Math.Clamp(ClearFrom(dirB, 1100f), 500f, 1100f));
			}
			Arm(f, at, 1f, true, Math.Clamp(_top * 0.8f, 150f, 420f), 550f);
			f.NextShot = nowMs + 600;
			StartAi(nowMs);
			Say($"[Scenario] Enemy spotted at {ClockDir(dirB)} - that was the missing one!");
		}
	}

	/// <summary>Far enough away and out of sight: no danger left.</summary>
	private bool Escaped(CCitadelPlayerPawn pawn, double nowMs, out float nearest, out bool seen) {
		nearest = float.MaxValue; seen = false;
		bool any = false;
		foreach (var f in _foes) {
			if (!f.On || Dead(f.A) || f.A.Ent == null) continue;
			any = true;
			var ep = f.A.Ent.Position;
			float d = Vector2.Distance(new Vector2(ep.X, ep.Y), new Vector2(pawn.Position.X, pawn.Position.Y));
			nearest = MathF.Min(nearest, d);
			if (d < 2200f && HasLos(f, pawn)) seen = true;
		}
		if (!any) { nearest = 9999f; return true; }
		if (nearest >= 2400f) return true;
		if (nearest >= 1300f && !seen) {
			if (_hiddenSince < 0) _hiddenSince = nowMs;
			return nowMs - _hiddenSince >= 2500;
		}
		_hiddenSince = -1;
		return false;
	}

	private bool FleeKind => _kind is ScenKind.Group or ScenKind.Behind or ScenKind.LowHp;

	private void Evaluate(CCitadelPlayerPawn pawn, double nowMs) {
		double t = (nowMs - _roundStart) / 1000.0;
		double limit = _kind switch { ScenKind.Lone => 35, ScenKind.Unknown => 50, ScenKind.Duel => 50, _ => 45 };
		int hp = Math.Max(0, pawn.Health * 100 / Math.Max(1, pawn.MaxHealth));
		bool escaped = Escaped(pawn, nowMs, out float nearest, out bool seen);
		_status = $"{t:0} / {limit:0} s     your health {hp}%     nearest enemy {(nearest > 9000 ? "-" : (int)(nearest / 39f) + " m")}{(seen ? "  (he sees you)" : "")}" +
			(nowMs - _lastHit < 900 ? "     UNDER FIRE" : "");

		if (_died) { _deaths++; Conclude(false, "You died.", Why(false), nowMs); return; }

		bool allDead = _foes.Where(f => f.On).All(f => Dead(f.A));
		switch (_kind) {
			case ScenKind.Lone:
				if (allDead) { _kills++; Conclude(true, $"Killed him in {t:0.0} s.", Why(true), nowMs); return; }
				if (t > 6 && escaped) { Conclude(false, "You got away although this was a free kill.", Why(false), nowMs); return; }
				break;
			case ScenKind.Unknown: {
				if (!_killedVisible && Dead(_foes[0].A)) { _killedVisible = true; _kills++; }
				var amb = _foes[1];
				if (_killedVisible && amb.On && Dead(amb.A)) { _kills++; Conclude(true, "You killed the visible one AND handled the one from the jungle.", Why(true), nowMs); return; }
				if (_killedVisible && amb.On && nowMs - amb.AppearAt > 16000) { Conclude(true, "You killed the visible one and survived the ambush.", Why(true), nowMs); return; }
				if (!_killedVisible && t > 8 && escaped) { Conclude(false, "You left although you were far ahead and one enemy was alone.", Why(false), nowMs); return; }
				break;
			}
			case ScenKind.Duel:
				if (allDead) { _kills++; Conclude(true, $"Duel won in {t:0.0} s.", Why(true), nowMs); return; }
				if (t > 6 && escaped) { Conclude(false, "You ran from an even 1v1 - take fights you can win.", Why(false), nowMs); return; }
				break;
			case ScenKind.LowHp:
				if (allDead) { _kills++; Conclude(true, "You won the fight even at low health - risky, but it worked.", Why(true), nowMs); return; }
				if (t > 4 && escaped) { Conclude(true, $"You got out of danger at low health ({t:0.0} s).", Why(true), nowMs); return; }
				break;
			case ScenKind.Group:
				if (allDead) { _kills += 4; Conclude(true, "You killed all four. Impressive - and rarely possible.", Why(true), nowMs); return; }
				if (t > 4 && escaped) { Conclude(true, $"You got away from four enemies ({t:0.0} s).", Why(true), nowMs); return; }
				break;
			case ScenKind.Behind:
				if (allDead) { _kills += 2; Conclude(true, "You won 1v2 while behind - strong, but that fight was not necessary.", Why(true), nowMs); return; }
				if (t > 4 && escaped) { Conclude(true, $"You avoided a fight you could not afford ({t:0.0} s).", Why(true), nowMs); return; }
				break;
		}
		if (t >= limit) Conclude(false, TimeoutText(), Why(false), nowMs);
	}

	private string TimeoutText() => _kind switch {
		ScenKind.Lone => "Too slow. A hurt, unaware enemy is a free kill - you wasted your lead.",
		ScenKind.Unknown => "You did not finish the situation in time.",
		ScenKind.Duel => "The duel was not decided in time.",
		_ => "You stayed in danger instead of getting away.",
	};

	private string Why(bool ok) => _kind switch {
		ScenKind.Lone => "Why: with a big soul lead and the rest of his team far away, a lone hurt enemy is a free kill. Take it fast, before help arrives.",
		ScenKind.Unknown => "Why: one missing enemy is a reason to be aware, not to skip a free kill. Kill, then look around - the last one can come from the jungle.",
		ScenKind.Group => "Why: four against one is not a fight, even at equal souls. Leave while you still have health. Being far away and out of sight ends the danger.",
		ScenKind.Behind => "Why: when behind, avoid trades you can lose. Give up space, not your life, and wait for your team.",
		ScenKind.LowHp => "Why: at 25% health every trade is lost. Break line of sight, get away and heal; a dead hero gives away souls.",
		_ => "Why: an even duel is decided by positioning, strafing and who lands the first hits.",
	};

	private void Conclude(bool ok, string text, string why, double nowMs) {
		if (ok) _right++;
		Say($"[Scenario {_round}/{_rounds}] {(ok ? "RIGHT" : "WRONG")}: {text}");
		Say(why);
		_b1 = ok ? "Round won" : "Round lost"; _b2 = text; _status = "";
		FightAi.Idle();
		_aiOn = false;
		foreach (var f in _foes) { f.On = false; Kill(f.Tag); f.Tag = null; try { f.A.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { } }
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
		ClearBriefing();
		try { PlayerPawn?.SetMoveType(MoveType.Walk); } catch { }
		foreach (var f in _foes) { Kill(f.Tag); f.Tag = null; }
		foreach (var a in Actors) {
			try { var e = a.Ent; if (e != null) BotPool.Exempt.Remove(e.EntityHandle); } catch { }
			try { a.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
			a.KeepHealth = false;
		}
		FightAi.Release();
		base.Stop();
	}
}

/// <summary>
/// Counterspell training with real enemy heroes and real ability casts. Every round a different hero bot steps up in front of you and uses
/// one of its abilities on you (the game's own bot command), then disappears. Use your Counterspell item (any item key) once you see the
/// ability coming. The result comes from what really happened: pressed and nothing hit you = countered; hit anyway or no press = hit.
/// The ability slot per hero is my best knowledge; heroes without an entry cast their ultimate (slot 4).
/// </summary>
sealed class CounterspellDrill : Drill {
	private enum Ph { Gap, Intro, Cast, Result }

	// Only abilities that target or hit you directly and that Counterspell can answer. Heroes without an entry are never used.
	private static readonly Dictionary<Heroes, (string Name, string Ability, int Slot)> Table = new() {
		[Heroes.Inferno] = ("Infernus", "Concussive Combustion", 4),
		[Heroes.Bebop] = ("Bebop", "Sticky Bomb", 2),
		[Heroes.Haze] = ("Haze", "Sleep Dagger", 1),
		[Heroes.Wraith] = ("Wraith", "Telekinesis", 3),
		[Heroes.Astro] = ("Holliday", "Spirit Lasso", 4),
		[Heroes.Hornet] = ("Vindicta", "Stake", 1),
		[Heroes.Chrono] = ("Paradox", "Pulse Grenade", 1),
		[Heroes.Gigawatt] = ("Seven", "Lightning Ball", 1),
	};

	private readonly int _total;
	private int _done, _ok, _hit, _late, _early, _lastActor = -1, _cur = -1, _items0, _slot;
	private readonly List<double> _react = new();
	private Ph _ph = Ph.Gap;
	private double _nextAt, _phaseAt, _castAt, _pressAt, _hudAt;
	private bool _gotDamage, _itemOk, _cast;
	private string _heroName = "", _ability = "";
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
		FightAi.Prepare();
		try { Server.ExecuteCommand("citadel_bot_give_all_abilities"); } catch { } // unlocks the abilities; nothing is cast by it
		int n2 = Math.Clamp(BotPool.FreeCount, 1, 12);
		for (int i = 0; i < n2; i++) AddActor(pawn, pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 700f, nowMs);
		foreach (var a in Actors) if (a.Wants) { try { var e = a.Ent; if (e != null) BotPool.Exempt.Add(e.EntityHandle); } catch { } }
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		if (!RealBots) { Say("[Counterspell] This needs real bots."); Finished = true; return; }
		_nextAt = nowMs + 2500;
		var heroes = Actors.Select(HeroOf).Where(h => h.HasValue && Table.ContainsKey(h!.Value)).Select(h => Table[h!.Value].Name).Distinct().ToList();
		Say($"[Counterspell] {_total} rounds against real heroes: {string.Join(", ", heroes)}.");
		Say("A hero steps up and casts at you for real. Press your Counterspell item (any item key) when you see it coming. Nothing hits you = countered.");
		if (!_itemOk) Say("I could not add the item automatically: put Counterspell in an item slot (buy it in the shop).");
	}

	private Heroes? HeroOf(Actor a) { try { var p = a.Pawn; return p == null ? null : p.HeroID; } catch { return null; } }

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (IsPlayer(e.Entity) && e.Entity is { } p) {
			var by = ActorOf(e.Info.Attacker) ?? ActorOf(e.Info.Inflictor);
			if (by != null) {
				bool current = _cur >= 0 && _cur < Actors.Count && ReferenceEquals(by, Actors[_cur]);
				if (!current) { e.Info.Damage = 0; return HookResult.Stop; } // only the hero in front of you counts
				if (_ph == Ph.Cast && e.Info.Damage > 0) _gotDamage = true;
				if (p.Health - e.Info.Damage <= 1) e.Info.Damage = 0; // you cannot die here
			}
		}
		return HookResult.Continue;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		if (_cur >= 0 && _ph != Ph.Gap && _ph != Ph.Result) {
			try { Actors[_cur].Place(_pos, pawn.Position); } catch { }
		}
		if (_label != null) Face(_label, _pos + new Vector3(0, 0, 215f), eye);

		switch (_ph) {
			case Ph.Gap:
				_b1 = "Next hero..."; _b2 = "";
				if (nowMs < _nextAt) break;
				if (_done >= _total) { Summarize(); Finished = true; return; }
				Spawn(pawn, nowMs);
				break;
			case Ph.Intro:
				if (In.ItemPresses > _items0) { _early++; _done++; Say($"[Counterspell {_done}/{_total}] TOO EARLY: you used it before {_heroName} cast anything."); Finish(pawn, nowMs, "TOO EARLY"); break; }
				if (nowMs >= _phaseAt) {
					_ph = Ph.Cast; _castAt = nowMs; _gotDamage = false; _cast = true; _pressAt = 0; _items0 = In.ItemPresses;
					// Only THIS hero casts (per-bot call; the console command would make every bot cast). It faces you while it does.
					try {
						Actors[_cur].Place(_pos, pawn.Position);
						Actors[_cur].Pawn?.ExecuteAbilityBySlot((EAbilitySlot)(_slot - 1));
					} catch { }
					_b1 = $"{_heroName}: {_ability}"; _b2 = "Counter it!";
				}
				break;
			case Ph.Cast:
				if (_pressAt <= 0 && In.ItemPresses > _items0) _pressAt = In.LastItemPressMs;
				bool settled = (_pressAt > 0 && nowMs >= _pressAt + 1100) || nowMs >= _castAt + 2600;
				if (settled) Resolve(pawn, nowMs);
				break;
			case Ph.Result:
				if (nowMs >= _nextAt) {
					Kill(_label); _label = null;
					try { Actors[_cur].Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
					_cur = -1; _ph = Ph.Gap; _nextAt = nowMs + 500 + Rng.NextDouble() * 700;
				}
				break;
		}

		if (nowMs >= _hudAt || _hud == null) {
			_hudAt = nowMs + 200;
			_hud = new (string, byte, byte, byte)[] {
				($"COUNTERSPELL  {Math.Min(_done + 1, _total)}/{_total}   countered: {_ok}", 255, 220, 60),
				(_b1, 255, 255, 255),
				(_b2, 150, 210, 255),
			};
		}
		SetHud(pawn, _hud);
	}

	private void Spawn(CCitadelPlayerPawn pawn, double nowMs) {
		var ok = new List<int>();
		for (int i = 0; i < Actors.Count; i++) if (Actors[i].BotReady && i != _lastActor && HeroOf(Actors[i]) is { } h1 && Table.ContainsKey(h1)) ok.Add(i);
		if (ok.Count == 0) for (int i = 0; i < Actors.Count; i++) if (Actors[i].BotReady && HeroOf(Actors[i]) is { } h2 && Table.ContainsKey(h2)) ok.Add(i);
		if (ok.Count == 0) { Say("[Counterspell] None of the heroes in the bot pool has a counterable ability on my list (Infernus, Bebop, Haze, Wraith, Holliday, Vindicta, Paradox, Seven). Settings > Enemy bots > more adds variety."); Finished = true; return; }
		_cur = ok[Rng.Next(ok.Count)];
		_lastActor = _cur;
		var hero = HeroOf(Actors[_cur]);
		if (hero.HasValue && Table.TryGetValue(hero.Value, out var t)) { _heroName = t.Name; _ability = t.Ability; _slot = t.Slot; }
		else { Finished = true; return; }

		float yaw = pawn.EyeAngles.Y + (float)(Rng.NextDouble() * 60.0 - 30.0);
		float dist = Math.Max(350f, Math.Min(450f + (float)Rng.NextDouble() * 250f, ClearDist(pawn, yaw, 700f)));
		_pos = pawn.Position + Aim.Forward(0f, yaw) * dist;
		try { pawn.Health = pawn.MaxHealth; Actors[_cur].Ent?.Teleport(position: new Vector3(_pos.X, _pos.Y, pawn.Position.Z + 8f), velocity: Vector3.Zero); } catch { }

		_ph = Ph.Intro; _phaseAt = nowMs + 900; _items0 = In.ItemPresses; _cast = false;
		Kill(_label); _label = null;
		_label = SpawnText($"{_heroName.ToUpperInvariant()}", _pos + new Vector3(0, 0, 215f), Aim.Eye(pawn), 16f, 255, 255, 255);
		_b1 = _heroName; _b2 = "Get ready.";
	}

	private void Resolve(CCitadelPlayerPawn pawn, double nowMs) {
		bool pressed = _pressAt > 0;
		if (!pressed && !_gotDamage) {
			Say($"[Counterspell] Nothing reached you from {_heroName} - the cast missed or did not happen. Round repeated.");
			Finish(pawn, nowMs, "NOTHING HIT YOU - repeat");
			return;
		}
		_done++;
		if (pressed && !_gotDamage) {
			_ok++;
			double ms = _pressAt - _castAt;
			_react.Add(ms);
			Say($"[Counterspell {_done}/{_total}] COUNTERED {_heroName} - {_ability}: nothing hit you, you pressed {ms:0} ms after the cast.");
			Finish(pawn, nowMs, $"COUNTERED  ({ms:0} ms)");
		} else if (pressed) {
			_late++;
			Say($"[Counterspell {_done}/{_total}] TOO LATE (or not counterable): {_heroName}'s {_ability} still hit you, although you pressed {(_pressAt - _castAt):0} ms after the cast.");
			Finish(pawn, nowMs, "HIT ANYWAY");
		} else {
			_hit++;
			Say($"[Counterspell {_done}/{_total}] HIT: {_heroName}'s {_ability} landed and you did not use Counterspell.");
			Finish(pawn, nowMs, "HIT");
		}
	}

	private void Finish(CCitadelPlayerPawn pawn, double nowMs, string big) {
		_b1 = big; _b2 = "";
		Kill(_label);
		bool good = big.StartsWith("COUNTERED");
		_label = SpawnText(big, _pos + new Vector3(0, 0, 215f), Aim.Eye(pawn), 18f, good ? (byte)90 : (byte)255, good ? (byte)255 : (byte)90, 90);
		try { Server.ExecuteCommand("citadel_bot_use_ability 0"); } catch { }
		_ph = Ph.Result;
		_nextAt = nowMs + 1300;
	}

	private void Summarize() {
		string avg = _react.Count > 0 ? $" | average reaction {_react.Average():0} ms" : "";
		Say($"=== Counterspell finished: countered {_ok} | hit {_hit} | late/not counterable {_late} | too early {_early} of {_total}{avg} ===");
		string key = $"counter_{Lvl}";
		bool best = Records.Submit(key, 100.0 * _ok / _total);
		Say(best ? $"New best this session: {100.0 * _ok / _total:0}%" : $"Best this session: {Records.Get(key):0}%");
		Ctl.HudAnnounce("COUNTERSPELL DONE", $"{_ok}/{_total}");
	}

	public override void Stop() {
		Kill(_label); _label = null;
		try { Server.ExecuteCommand("citadel_bot_use_ability 0"); } catch { }
		foreach (var a in Actors) {
			try { var e = a.Ent; if (e != null) BotPool.Exempt.Remove(e.EntityHandle); } catch { }
			try { a.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
		}
		FightAi.Release();
		base.Stop();
	}
}
