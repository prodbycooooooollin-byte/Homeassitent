using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

enum ScenarioMode { FightOrFlight, Duel }

/// <summary>
/// Practical decision training against fighting bots (the bots' own AI is switched on, they really shoot at you).
///  Fight or Flight: each round you see a situation and have to do the right thing for real - kill an isolated, weaker enemy, or run to the
///                   safe zone when a group comes at you.
///  Duel: a plain 1v1 against a hero bot; win it.
/// You cannot actually die here: a lethal hit ends the round as "died" and refills your health.
/// </summary>
sealed class ScenarioDrill : Drill {
	private enum Ph { Setup, Wait, Active, Result }
	private enum Kind { Fight, Flight, Duel }

	private readonly ScenarioMode _mode;
	private readonly int _rounds;
	private int _round, _right, _kills, _deaths;
	private Ph _ph = Ph.Setup;
	private Kind _kind;
	private double _phaseAt, _roundStart;
	private Vector3 _origin;
	private float _yaw;
	private bool _died;
	private CPointWorldText? _safe;
	private (string, byte, byte, byte)[]? _hud;
	private double _hudAt;
	private string _line1 = "", _line2 = "";
	private readonly List<double> _killTimes = new();

	public override string Name => _mode == ScenarioMode.Duel ? "Duel" : "Fight or Flight";
	protected override float LeashRadius => 0f;

	public ScenarioDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, ScenarioMode mode, int rounds) : base(ctl, input, lvl) {
		_mode = mode;
		_rounds = Math.Clamp(rounds, 1, 20);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		_origin = pawn.Position;
		_yaw = pawn.EyeAngles.Y;
		int bots = _mode == ScenarioMode.Duel ? 1 : 5;
		for (int i = 0; i < bots; i++) AddActor(pawn, _origin + Aim.Forward(0f, _yaw) * 800f, nowMs);
		try {
			Server.ExecuteCommand("sv_cheats 1");
			Server.ExecuteCommand("citadel_bot_test_mode 0"); // the bots fight for real
			TrainerBots.CheatsOffAt = -1;
			_aiOn = true;
		} catch { }
		foreach (var a in Actors) if (a.Wants) { try { var e = a.Ent; if (e != null) BotPool.Exempt.Add(e.EntityHandle); } catch { } }
	}

	private bool _aiOn;

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		if (!RealBots) { Say("[Scenario] This needs real bots (wait until the menu showed them, or switch Automatic bots on in Settings)."); Finished = true; return; }
		_phaseAt = nowMs + 1500;
		if (_mode == ScenarioMode.Duel) Say($"[Duel] {_rounds} rounds against a hero bot that really fights. Win each duel. Abort: !tstop");
		else Say($"[Fight or Flight] {_rounds} situations. Read each one and do the RIGHT thing for real: a lone weaker enemy = kill him; a group coming at you = reach the SAFE ZONE. Abort: !tstop");
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		// You cannot die here: a lethal hit counts as "died" and the round ends.
		if (IsPlayer(e.Entity) && ActorOf(e.Info.Attacker) != null && e.Entity is { } p) {
			if (p.Health - e.Info.Damage <= 1 && _ph == Ph.Active) {
				e.Info.Damage = 0;
				p.Health = p.MaxHealth;
				_died = true;
			}
		}
		return HookResult.Continue;
	}

	private Vector3 Fwd(float dist, float side = 0f) => _origin + Aim.Forward(0f, _yaw) * dist + Aim.Right(_yaw) * side;

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		switch (_ph) {
			case Ph.Setup:
				if (nowMs < _phaseAt) break;
				if (_round >= _rounds) { Summarize(); Finished = true; return; }
				SetupRound(pawn, nowMs);
				break;
			case Ph.Wait:
				if (nowMs >= _phaseAt) { _ph = Ph.Active; _roundStart = nowMs; _died = false; }
				break;
			case Ph.Active:
				Evaluate(pawn, nowMs);
				break;
			case Ph.Result:
				if (nowMs >= _phaseAt) { _ph = Ph.Setup; _phaseAt = nowMs + 500; }
				break;
		}
		if (_safe != null) Face(_safe, SafePos() + new Vector3(0, 0, 100f), eye);

		if (nowMs >= _hudAt || _hud == null) {
			_hudAt = nowMs + 250;
			_hud = new (string, byte, byte, byte)[] {
				($"{Name.ToUpperInvariant()}  {Math.Min(_round, _rounds)}/{_rounds}", 255, 220, 60),
				(_line1, 255, 255, 255),
				(_line2, 150, 210, 255),
			};
		}
		SetHud(pawn, _hud);
	}

	private Vector3 SafePos() => _origin - Aim.Forward(0f, _yaw) * 900f;

	private void SetupRound(CCitadelPlayerPawn pawn, double nowMs) {
		_round++;
		_kind = _mode == ScenarioMode.Duel ? Kind.Duel : (Rng.Next(2) == 0 ? Kind.Fight : Kind.Flight);
		// Reset the player and revive the bots.
		try { pawn.TeleportWithView(_origin + new Vector3(0, 0, 8), new Vector3(0f, _yaw, 0f)); pawn.Health = pawn.MaxHealth; } catch { }
		foreach (var a in Actors) {
			var bp = a.Pawn;
			try {
				if (bp != null && (bp.Health <= 0 || !bp.IsAlive)) bp.ForceRespawn();
			} catch { }
		}
		// Short wait so respawned bots exist, then place them.
		_ph = Ph.Wait;
		_phaseAt = nowMs + 1800;
		PlaceBotsForRound();
		if (_safe == null && _mode != ScenarioMode.Duel) _safe = SpawnText("SAFE ZONE", SafePos() + new Vector3(0, 0, 100f), Aim.Eye(pawn), 20f, 120, 255, 140);
		switch (_kind) {
			case Kind.Fight: _line1 = "Enemies in sight: 1   |   he looks weaker than you"; _line2 = "Decide - then act."; break;
			case Kind.Flight: _line1 = "Enemies in sight: 4 (and moving at you)"; _line2 = "Decide - then act."; break;
			default: _line1 = "1v1 - win the duel"; _line2 = "Same strength as you."; break;
		}
	}

	private void PlaceBotsForRound() {
		int idx = 0;
		foreach (var a in Actors) {
			var e = a.Ent;
			if (e == null) { idx++; continue; }
			Vector3 pos; bool active = true;
			switch (_kind) {
				case Kind.Fight: active = idx == 0; pos = Fwd(700f, ((float)Rng.NextDouble() * 2f - 1f) * 200f); break;
				case Kind.Flight: active = idx < 4; pos = Fwd(1150f + idx * 40f, (idx - 1.5f) * 220f); break;
				default: pos = Fwd(750f, ((float)Rng.NextDouble() * 2f - 1f) * 150f); break;
			}
			try {
				if (!active) e.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero);
				else {
					float yaw = Aim.YawTo(pos, _origin);
					e.Teleport(position: pos + new Vector3(0, 0, 8), angles: new Vector3(0f, yaw, 0f), velocity: Vector3.Zero);
					if (_kind == Kind.Fight) e.Health = (int)(e.MaxHealth * 0.6f);
					else e.Health = e.MaxHealth;
				}
			} catch { }
			idx++;
		}
	}

	private bool BotDead(Actor a) { try { var e = a.Ent; return e == null || e.Health <= 0 || !e.IsAlive; } catch { return true; } }

	private void Evaluate(CCitadelPlayerPawn pawn, double nowMs) {
		double t = (nowMs - _roundStart) / 1000.0;
		double limit = _kind == Kind.Flight ? 12.0 : _kind == Kind.Fight ? 20.0 : 45.0;
		_line2 = $"{t:0} s / {limit:0} s";

		if (_died) { Conclude(false, _kind == Kind.Flight ? "You were caught by the group." : "You died.", nowMs); _deaths++; return; }

		switch (_kind) {
			case Kind.Fight:
				if (BotDead(Actors[0])) { _kills++; _killTimes.Add(t); Conclude(true, $"Killed him in {t:0.0} s - correct: a lone weaker enemy is a free kill.", nowMs); return; }
				break;
			case Kind.Duel:
				if (BotDead(Actors[0])) { _kills++; _killTimes.Add(t); Conclude(true, $"Duel won in {t:0.0} s.", nowMs); return; }
				break;
			case Kind.Flight: {
				var p = pawn.Position;
				if (Vector2.Distance(new Vector2(p.X, p.Y), new Vector2(SafePos().X, SafePos().Y)) <= 260f) { Conclude(true, $"You got away in {t:0.0} s - correct: 4 enemies are not a fight you take.", nowMs); return; }
				break;
			}
		}
		if (t >= limit) {
			string why = _kind switch {
				Kind.Fight => "Too slow - his team would have arrived. A lone weaker enemy should die fast.",
				Kind.Flight => "You stayed too long in front of the group.",
				_ => "Time is up - the duel was not decided.",
			};
			Conclude(false, why, nowMs);
		}
	}

	private void Conclude(bool ok, string text, double nowMs) {
		if (ok) _right++;
		Say($"[{Name} {_round}/{_rounds}] {(ok ? "OK" : "WRONG")}: {text}");
		_line1 = ok ? "Round won" : "Round lost";
		foreach (var a in Actors) { try { a.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { } }
		_ph = Ph.Result;
		_phaseAt = nowMs + 2500;
		_died = false;
	}

	private void Summarize() {
		Say($"=== {Name} finished: {_right}/{_rounds} rounds correct ({Fmt.Pct(_right, _rounds)}) | kills {_kills} | deaths {_deaths}" +
			(_killTimes.Count > 0 ? $" | avg kill time {_killTimes.Average():0.0} s" : "") + " ===");
		string key = $"scen_{_mode}_{Lvl}";
		bool best = Records.Submit(key, 100.0 * _right / _rounds);
		Say(best ? $"New best this session: {100.0 * _right / _rounds:0}%" : $"Best this session: {Records.Get(key):0}%");
		Ctl.HudAnnounce(Name.ToUpperInvariant() + " DONE", $"{_right}/{_rounds}");
	}

	public override void Stop() {
		Kill(_safe); _safe = null;
		foreach (var a in Actors) {
			try { var e = a.Ent; if (e != null) BotPool.Exempt.Remove(e.EntityHandle); } catch { }
			try { a.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
		}
		if (_aiOn) { try { Server.ExecuteCommand("citadel_bot_test_mode 1"); } catch { } }
		base.Stop();
	}
}

/// <summary>
/// Counterspell training (experimental): you get the Counterspell item, a hero bot casts one of its abilities at you at a random moment,
/// and you have to use Counterspell at the right time. Result per round: countered / hit / nothing happened.
/// </summary>
sealed class CounterspellDrill : Drill {
	private enum Ph { Gap, Warn, Window }

	private readonly int _total;
	private int _done, _ok, _hit, _none;
	private Ph _ph = Ph.Gap;
	private double _nextAt, _castAt, _windowEnd;
	private int _slot;
	private bool _gotHit, _countered;
	private double _itemMs0;
	private int _items0;
	private bool _itemOk, _aiOn;
	private CPointWorldText? _cue;

	public override string Name => "Counterspell";
	protected override float LeashRadius => 0f;

	public CounterspellDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, int rounds) : base(ctl, input, lvl) {
		_total = Math.Clamp(rounds, 1, 30);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		string[] names = { "upgrade_counterspell", "upgrade_counter_spell", "upgrade_counterspell_item" };
		foreach (var n in names) {
			try { if (pawn.AddItem(n) != null) { _itemOk = true; Console.WriteLine($"[Trainer] Counterspell item granted as '{n}'."); break; } } catch { }
		}
		AddActor(pawn, pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 600f, nowMs);
		try {
			Server.ExecuteCommand("sv_cheats 1");
			Server.ExecuteCommand("citadel_bot_give_all_abilities");
			TrainerBots.CheatsOffAt = -1;
			_aiOn = true;
		} catch { }
		foreach (var a in Actors) if (a.Wants) { try { var e = a.Ent; if (e != null) BotPool.Exempt.Add(e.EntityHandle); } catch { } }
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		if (!RealBots) { Say("[Counterspell] This needs real bots."); Finished = true; return; }
		_nextAt = nowMs + 3000;
		Say(_itemOk
			? $"[Counterspell] {_total} rounds. You got the Counterspell item: when the bot starts casting ('!!'), use it at the right moment so the ability is countered."
			: $"[Counterspell] I could not give you the Counterspell item (the internal item name is unknown on this server). Buy it yourself in the shop (cheats are on) and use it when the bot casts. {_total} rounds.");
		Say("[Counterspell] Experimental: the bot casts a random ability at a random moment. Abort: !tstop");
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (IsPlayer(e.Entity) && ActorOf(e.Info.Attacker) != null) {
			if (_ph == Ph.Window && e.Info.Damage > 0) _gotHit = true;
			return HookResult.Stop; // you cannot die here
		}
		return HookResult.Continue;
	}

	public override void OnModifier(ModifierEvent e) {
		if (_ph != Ph.Window) return;
		var player = PlayerPawn;
		if (player == null) return;
		if ((e.Event == EModifierEvent.ParrySuccess) && (e.Caster?.EntityHandle == player.EntityHandle || e.Target?.EntityHandle == player.EntityHandle))
			_countered = true;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var a = Actors[0];
		try { var yawTo = Aim.YawTo(a.Feet, pawn.Position); a.Place(pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 600f, pawn.Position); } catch { }

		switch (_ph) {
			case Ph.Gap:
				if (nowMs >= _nextAt) {
					_slot = 1 + Rng.Next(4);
					_castAt = nowMs + 700 + Rng.NextDouble() * 900;
					_cue = SpawnText("!!", a.Feet + new Vector3(0, 0, 160f), eye, 20f, 255, 80, 80);
					_ph = Ph.Warn;
				}
				break;
			case Ph.Warn:
				if (_cue != null) Face(_cue, a.Feet + new Vector3(0, 0, 160f), eye);
				if (nowMs >= _castAt) {
					_gotHit = _countered = false;
					_itemMs0 = nowMs;
					_items0 = In.ItemPresses;
					try {
						Server.ExecuteCommand($"citadel_bot_use_ability {_slot}");
						TrainerBots.Schedule(350, "citadel_bot_use_ability 0");
					} catch { }
					_windowEnd = nowMs + 2200;
					_ph = Ph.Window;
				}
				break;
			case Ph.Window:
				if (_cue != null) Face(_cue, a.Feet + new Vector3(0, 0, 160f), eye);
				if (nowMs >= _windowEnd) Finish(nowMs);
				break;
		}
	}

	private void Finish(double nowMs) {
		Kill(_cue); _cue = null;
		_done++;
		bool pressed = In.ItemPresses > _items0;
		string delta = pressed ? $"item pressed {In.LastItemPressMs - _itemMs0:0} ms after the cast started" : "you did not press an item key";
		if (_countered) { _ok++; Say($"[Counterspell {_done}/{_total}] COUNTERED ({delta}). ability slot {_slot}"); }
		else if (_gotHit) { _hit++; Say($"[Counterspell {_done}/{_total}] HIT - the ability got through ({delta}). ability slot {_slot}"); }
		else { _none++; Say($"[Counterspell {_done}/{_total}] no effect on you ({delta}) - the bot may not have cast, or it missed. ability slot {_slot}"); }
		_ph = Ph.Gap;
		_nextAt = nowMs + 2500 + Rng.NextDouble() * 3500;
		if (_done >= _total) {
			Say($"=== Counterspell finished: countered {_ok} | hit {_hit} | nothing {_none} of {_total} ===");
			Ctl.HudAnnounce("COUNTERSPELL DONE", $"{_ok}/{_total}");
			Finished = true;
		}
	}

	public override void Stop() {
		Kill(_cue); _cue = null;
		foreach (var a in Actors) {
			try { var e = a.Ent; if (e != null) BotPool.Exempt.Remove(e.EntityHandle); } catch { }
			try { a.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { }
		}
		try { Server.ExecuteCommand("citadel_bot_use_ability 0"); } catch { }
		base.Stop();
	}
}
