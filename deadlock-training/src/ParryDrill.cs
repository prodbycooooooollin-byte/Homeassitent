using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

enum ParryMode { Single, Multi, Burst }

/// <summary>
/// Parry training against bots. In real mode a bot hero actually performs an engine melee attack; the result is whether
/// your parry caught it (ParrySuccess) or you got hit (damage is blocked, you cannot die). If the bot swing does not
/// work, the drill switches to a simulation (timing window with text cues).
/// </summary>
sealed class ParryDrill : Drill {
	private enum Ph { Gap, Telegraph, Await }

	private readonly ParryMode _mode;
	private readonly int _total;           // number of swings in total
	private readonly int _burstSize;
	private int _done;                     // completed swings
	private int _burstLeft;
	private Ph _ph = Ph.Gap;
	private double _nextAt;

	private readonly List<float> _offs = new();   // angle of each attacker relative to the start view
	private float _baseYaw;
	private float _radius;
	private int _cur = -1, _last = -1;

	// current round
	private double _roundStart, _triggerAt, _deadline;
	private bool _realRound;
	private double _evParry = -1, _evHit = -1, _evMelee = -1, _evStart = -1, _firstEv = -1, _outcomeAt = -1;
	private CPointWorldText? _cue;
	// simulation
	private double _strikeAt;
	private bool _sampled, _activeAtStrike;
	private readonly List<double> _simEdges = new();
	private int _edgeSeen;

	private bool _realBroken;
	private int _noAttackStreak;

	// stats
	private int _ok, _early, _late, _missed, _derived;
	private readonly List<double> _offsets = new();
	private readonly List<double> _reactions = new();

	public override string Name => "Parry";
	protected override float LeashRadius => Tuning.LeashParry;

	public ParryDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, ParryMode mode, int rounds)
		: base(ctl, input, lvl) {
		_mode = mode;
		_burstSize = mode == ParryMode.Burst ? Tuning.ParryBurstSize(lvl) : 1;
		_total = Math.Clamp(rounds, 1, 60) * _burstSize;
	}

	private int AttackerCount => _mode == ParryMode.Single ? 1 : 3;

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		// citadel_bot_melee is a cheat variable: cheats must already be on when it is set.
		try { Server.ExecuteCommand("sv_cheats 1"); TrainerBots.CheatsOffAt = -1; _cheatsOn = true; } catch { }
		_baseYaw = pawn.EyeAngles.Y;
		_radius = _mode == ParryMode.Single ? 135f : 165f;
		int n = AttackerCount;
		for (int i = 0; i < n; i++) {
			float frac = n == 1 ? 0.5f : i / (float)(n - 1);
			float off = n == 1 ? 0f : -48f + frac * 96f;
			_offs.Add(off);
			AddActor(pawn, HomeFor(pawn.Position, i), nowMs);
		}
	}

	private Vector3 HomeFor(Vector3 playerFeet, int i) =>
		new Vector3(playerFeet.X, playerFeet.Y, playerFeet.Z) + Aim.Forward(0f, _baseYaw + _offs[i]) * _radius;

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		_nextAt = nowMs + 2500;
		_edgeSeen = In.ParryEdges;
		var eye = Aim.Eye(pawn);

		for (int i = 0; i < Actors.Count; i++) {
			Actors[i].Feet = HomeFor(pawn.Position, i);
			EnsureMarker(Actors[i], eye, 12f, 150, 150, 150);
		}

		string modeText = _mode switch {
			ParryMode.Single => "Single (1 attacker)",
			ParryMode.Multi => "Multiple (3 attackers, random order)",
			_ => $"Burst ({_burstSize} swings in a row)"
		};
		Say($"[Parry] {modeText}, difficulty {LevelParse.Label(Lvl)}, {_total} swings.");
		if (RealBots) {
			Say("[Parry] The bots really swing at you. Parry with your normal parry key - the game itself judges your parry.");
			if (Tuning.ParryTelegraphMs(Lvl) > 0) Say("[Parry] A red '>>' above a bot = it is about to swing (easy/normal only).");
			else Say("[Parry] Hard: no warning - read the animation.");
		} else {
			Say("[Parry] Simplified mode: red '>>   <<' = a swing is coming, '!!!' = now. Parry so that your window covers the swing.");
		}
		Say("[Parry] Abort: !tstop");
	}

	// ---- Events ----------------------------------------------------------------------------------------------------

	public override void OnModifier(ModifierEvent e) {
		if (_ph != Ph.Await) return;
		var player = PlayerPawn;
		if (player == null) return;
		double now = Clock.Ms;
		bool playerInvolved = e.Caster?.EntityHandle == player.EntityHandle || e.Target?.EntityHandle == player.EntityHandle;
		bool botCaster = ActorOf(e.Caster) != null;

		switch (e.Event) {
			case EModifierEvent.ParrySuccess when playerInvolved:
				if (_evParry < 0) _evParry = now;
				_outcomeAt = _outcomeAt < 0 ? now : _outcomeAt;
				Touch(now);
				break;
			case EModifierEvent.MeleeAttack when botCaster:
				if (_evMelee < 0) _evMelee = now;
				Touch(now);
				break;
			case EModifierEvent.MeleeAttackStarted when botCaster:
				if (_evStart < 0) _evStart = now;
				Touch(now);
				break;
		}
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		// Bots must not hurt you in this exercise: block the damage but count it as "hit".
		if (IsPlayer(e.Entity) && (ActorOf(e.Info.Attacker) != null || ActorOf(e.Info.Inflictor) != null)) {
			if (_ph == Ph.Await && _evHit < 0) {
				double now = Clock.Ms;
				_evHit = now;
				_outcomeAt = _outcomeAt < 0 ? now : _outcomeAt;
				Touch(now);
			}
			return HookResult.Stop;
		}
		// Bots should not die.
		if (ActorOf(e.Entity) is { } bot && bot.Ent is { } be && be.Health - e.Info.Damage <= 50)
			be.Health = be.MaxHealth;
		return HookResult.Continue;
	}

	private void Touch(double now) { if (_firstEv < 0) _firstEv = now; }

	// ---- Flow ------------------------------------------------------------------------------------------------------

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var player = pawn.Position;
		var eye = Aim.Eye(pawn);

		// All attackers stand in a ring around the player and look at him.
		for (int i = 0; i < Actors.Count; i++)
			PlaceActor(Actors[i], HomeFor(player, i), player, eye, TrainerConfig.CenterZ);

		if (In.ParryEdges != _edgeSeen) {
			_edgeSeen = In.ParryEdges;
			if (_ph != Ph.Gap && !_realRound) _simEdges.Add(In.LastParryEdgeMs);
		}

		switch (_ph) {
			case Ph.Gap:
				if (nowMs >= _nextAt) StartRound(nowMs, eye);
				break;
			case Ph.Telegraph:
				KeepCue(eye);
				if (nowMs >= _triggerAt) Trigger(nowMs);
				break;
			case Ph.Await:
				KeepCue(eye);
				if (_realRound) AwaitReal(nowMs);
				else AwaitSim(pawn, nowMs);
				break;
		}
	}

	private Vector3 CuePos() {
		var a = Actors[_cur];
		return a.Feet + new Vector3(0, 0, 155f);
	}

	private void KeepCue(Vector3 eye) {
		if (_cue != null) Face(_cue, CuePos(), eye);
	}

	private void SetCue(string text, byte r, byte g, byte b, Vector3 eye) {
		if (_cue == null) _cue = SpawnText(text, CuePos(), eye, 20f, r, g, b);
		else { _cue.SetMessage(text); _cue.SetColor(r, g, b); }
	}

	private void ClearCue() {
		Kill(_cue);
		_cue = null;
	}

	private void StartRound(double nowMs, Vector3 eye) {
		do { _cur = Rng.Next(Actors.Count); } while (Actors.Count > 1 && _cur == _last);
		_last = _cur;

		_realRound = RealBots && !_realBroken && Actors[_cur].BotReady;
		_roundStart = nowMs;
		_evParry = _evHit = _evMelee = _evStart = _firstEv = _outcomeAt = -1;
		_simEdges.Clear();
		_edgeSeen = In.ParryEdges;
		_sampled = false;
		_activeAtStrike = false;

		if (_realRound) {
			double tg = Tuning.ParryTelegraphMs(Lvl);
			_triggerAt = nowMs + Math.Max(tg, 200);
			if (tg > 0) SetCue(">>", 255, 50, 50, eye);
		} else {
			double wind = Tuning.ParrySimWindupMs(Lvl, Rng);
			_triggerAt = nowMs;
			_strikeAt = nowMs + wind;
			SetCue(">>   <<", 255, 50, 50, eye);
		}
		_ph = Ph.Telegraph;
	}

	private void Trigger(double nowMs) {
		_ph = Ph.Await;
		if (_realRound) {
			var bot = Actors[_cur].Pawn;
			int rc = -99;
			try { if (bot != null) rc = bot.ExecuteAbilityBySlot(EAbilitySlot.WeaponMelee); }
			catch (Exception ex) { Console.WriteLine($"[Trainer] Bot melee failed: {ex.Message}"); }
			Console.WriteLine($"[Trainer] Parry swing {_done + 1}: bot melee rc={rc}");
			if (rc != 0) {
				// The ability call did not make the bot swing: use the game's own "bots melee" switch for a moment
				// (cheats are already on for the whole drill, see Begin).
				try {
					Server.ExecuteCommand("citadel_bot_melee 1");
					TrainerBots.Schedule(170, "citadel_bot_melee 0");
				} catch { }
			}
			_deadline = nowMs + 1700;
		} else {
			_deadline = _strikeAt + 450;
		}
	}

	// ---- Evaluation: real bot --------------------------------------------------------------------------------------

	private void AwaitReal(double nowMs) {
		bool settled =
			(_outcomeAt >= 0 && nowMs >= _outcomeAt + 220) ||
			(_firstEv >= 0 && nowMs >= _firstEv + 750) ||
			nowMs >= _deadline;
		if (settled) FinishReal(nowMs);
	}

	private void FinishReal(double nowMs) {
		ClearCue();
		bool anyEvent = _evParry >= 0 || _evHit >= 0 || _evMelee >= 0 || _evStart >= 0;
		if (!anyEvent) {
			_noAttackStreak++;
			if (_noAttackStreak >= 2) {
				_realBroken = true;
				Say("[Parry] The bot's swing does not arrive (no melee event). Switching to the simple simulation. More: !tbot test");
			} else {
				Say("[Parry] The bot did not swing - repeating this one.");
			}
			_nextAt = nowMs + 1200;
			_ph = Ph.Gap;
			return;
		}
		_noAttackStreak = 0;

		string head = $"[Parry {_done + 1}/{_total}]";
		bool parried = _evParry >= 0 || (_evHit < 0);
		double tHit = _evParry >= 0 ? _evParry : _evHit >= 0 ? _evHit : _evMelee >= 0 ? _evMelee : _evStart + 300;
		bool derived = _evParry < 0 && _evHit < 0;

		double? before = null, after = null;
		foreach (var t in In.ParryEdgeTimes) {
			if (t < _roundStart - 100) continue;
			if (t <= tHit + 30) before = t;
			else if (after == null && t <= tHit + 600) after = t;
		}

		if (parried) {
			_ok++;
			if (derived) _derived++;
			string tail = derived ? " (inferred: the bot swung and you were not hit)" : "";
			if (before != null) {
				double off = before.Value - tHit;
				_offsets.Add(off);
				_reactions.Add(before.Value - _roundStart);
				string where = off < -90 ? "early" : off > 20 ? "late" : "good";
				Say($"{head} PARRIED! Pressed {Fmt.Signed(off)} relative to the hit ({where}){tail}");
			} else {
				Say($"{head} PARRIED!{tail}");
			}
		} else {
			if (before != null) {
				_early++;
				Say($"{head} HIT - too early: pressed {Fmt.Ms(tHit - before.Value)} before the hit, the window had already closed.");
			} else if (after != null) {
				_late++;
				Say($"{head} HIT - too late: pressed {Fmt.Ms(after.Value - tHit)} after the hit.");
			} else {
				_missed++;
				Say($"{head} HIT - no parry pressed.");
			}
		}
		AfterRound(nowMs);
	}

	// ---- Evaluation: simulation ------------------------------------------------------------------------------------

	private void AwaitSim(CCitadelPlayerPawn pawn, double nowMs) {
		if (!_sampled && nowMs >= _strikeAt) {
			_sampled = true;
			_activeAtStrike = In.ParryActive;
			SetCue("!!!", 255, 255, 255, Aim.Eye(pawn));
			pawn.EmitSound("Damage.Send.Crit", volume: 0.5f);
		}
		if (_sampled && nowMs >= _strikeAt + 450) FinishSim(nowMs);
	}

	private void FinishSim(double nowMs) {
		ClearCue();
		double t = _strikeAt;
		string head = $"[Parry {_done + 1}/{_total}]";
		bool success = _activeAtStrike || _simEdges.Any(e => e >= t && e <= t + 40);
		if (success) {
			_ok++;
			double first = _simEdges.Count > 0 ? _simEdges[0] : t;
			double off = first - t;
			_offsets.Add(off);
			if (_simEdges.Count > 0) _reactions.Add(first - _roundStart);
			string where = off < -90 ? "early" : off > 20 ? "late" : "good";
			Say($"{head} PARRIED! Pressed {Fmt.Signed(off)} relative to the swing ({where}) [simulation]");
		} else if (_simEdges.Count > 0) {
			double e = _simEdges[^1];
			if (e > t) { _late++; Say($"{head} TOO LATE: {Fmt.Ms(e - t)} after the swing. [simulation]"); }
			else { _early++; Say($"{head} TOO EARLY: pressed {Fmt.Ms(t - e)} before the swing, the window had closed. [simulation]"); }
		} else {
			_missed++;
			Say($"{head} MISSED - no parry pressed. [simulation]");
		}
		AfterRound(nowMs);
	}

	// ---- Shared ----------------------------------------------------------------------------------------------------

	private void AfterRound(double nowMs) {
		_done++;
		if (_done >= _total) {
			Summarize();
			Finished = true;
			return;
		}
		if (_mode == ParryMode.Burst) {
			if (_burstLeft <= 0) _burstLeft = _burstSize;
			_burstLeft--;
			if (_burstLeft > 0) {
				_nextAt = nowMs + Tuning.ParryBurstSpacingMs(Lvl, Rng);
				_ph = Ph.Gap;
				return;
			}
		}
		_nextAt = nowMs + Tuning.ParryGapMs(Lvl, Rng);
		_ph = Ph.Gap;
	}

	private void Summarize() {
		double rate = _total > 0 ? 100.0 * _ok / _total : 0;
		Say($"=== Parry finished ({_mode}, {LevelParse.Label(Lvl)}) ===");
		Say($"Parried: {_ok}/{_total} ({rate:0}%) | too early {_early} | too late {_late} | no parry {_missed}");
		if (_offsets.Count > 0)
			Say($"Avg press point: {Fmt.Signed(_offsets.Average())} relative to the hit | avg reaction since round start: " +
				(_reactions.Count > 0 ? Fmt.Ms(_reactions.Average()) : "-"));
		if (_derived > 0) Say($"({_derived} parries were only inferred - the engine 'ParrySuccess' event did not arrive.)");
		string key = $"parry_{_mode}_{Lvl}";
		bool best = Records.Submit(key, rate);
		Say(best ? $"New best this session: {rate:0}%" : $"Best this session: {Records.Get(key):0}%");
		Ctl.HudAnnounce("PARRY DONE", $"{_ok}/{_total} ({rate:0}%)");
	}

	private bool _cheatsOn;

	public override void Stop() {
		if (_cheatsOn) { _cheatsOn = false; try { Server.ExecuteCommand("citadel_bot_melee 0"); Server.ExecuteCommand("sv_cheats 0"); } catch { } }
		ClearCue();
		base.Stop();
	}
}
