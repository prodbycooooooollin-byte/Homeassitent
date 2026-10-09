using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

enum FlickMode { Flick, Switch, Long }

// ---------------------------------------------------------------------------------------------------------------------
// Flick: a bot hero jumps to new places around you; hitting it (real damage) = a point + reaction time.
//   Flick  = one target at a time
//   Switch = three targets at once (target switching)
//   Long   = one target, far away
// ---------------------------------------------------------------------------------------------------------------------
sealed class FlickDrill : Drill {
	private sealed class T {
		public Actor A = null!;
		public bool Active;
		public Vector3 Feet;
		public float Tol;
		public double DmgAt = -1;
		public float Dir = 1f;
		public bool Head, Hidden;
		public CPointWorldText? Label;
	}

	private readonly FlickMode _mode;
	private readonly int _k;
	private readonly int _waves;
	private readonly List<T> _ts = new();

	private int _wavesStarted, _hits, _timeouts, _headHits, _shotsInWaves;
	private int _shotsAtStart;
	private bool _waveActive;
	private float _groundZ;
	private double _waveStart, _waveTimeout, _nextWaveAt, _lastHitAt, _resultUntil, _lastMs;
	private readonly List<double> _reactions = new();
	private readonly List<double> _switches = new();

	public override string Name => "Flick";
	protected override float LeashRadius => Tuning.LeashFlick(_mode == FlickMode.Long);

	public FlickDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, FlickMode mode, int count) : base(ctl, input, lvl) {
		_mode = mode;
		_k = mode == FlickMode.Switch ? 3 : 1;
		int total = count > 0 ? Math.Clamp(count, 1, 200) : Tuning.FlickCount(lvl);
		_waves = Math.Max(1, total / _k);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		_groundZ = pawn.Position.Z;
		for (int i = 0; i < _k; i++) {
			var feet = new Vector3(pawn.Position.X, pawn.Position.Y, _groundZ) + Aim.Forward(0f, pawn.EyeAngles.Y + (i - (_k - 1) / 2f) * 25f) * 600f;
			_ts.Add(new T { A = AddActor(pawn, feet, nowMs), Feet = feet });
		}
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		_nextWaveAt = nowMs + 2000;
		_lastMs = nowMs;
		_shotsAtStart = In.ShotsFired;
		while (In.Shots.Count > 0) In.Shots.Dequeue();
		var eye = Aim.Eye(pawn);
		foreach (var t in _ts) EnsureMarker(t.A, eye, 14f, 150, 150, 150);
		string what = _mode switch {
			FlickMode.Switch => "Three bots appear at once - hit all of them.",
			FlickMode.Long => "The bot appears far away - hit it.",
			_ => "The bot jumps to new spots - hit it as fast as you can.",
		};
		Say($"[{Title()}] {_waves * _k} targets, difficulty {LevelParse.Label(Lvl)}. {what} Abort: !tstop");
		if (!RealBots) Say("[Flick] Simplified mode: a red 'O' instead of a bot. A hit counts when you shoot at it.");
	}

	private string Title() => _mode switch { FlickMode.Switch => "Switch", FlickMode.Long => "Long Range", _ => "Flick" };

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (ActorOf(e.Entity) is { } bot && IsPlayer(e.Info.Attacker)) {
			var t = _ts.FirstOrDefault(x => ReferenceEquals(x.A, bot));
			if (t != null && t.Active && e.Info.Damage > 0) {
				bool head = IsHeadshot(bot);
				if (!TrainerConfig.FlickHeadOnly || head) { t.DmgAt = Clock.Ms; t.Head = head; }
			}
			if (bot.Ent is { } be && be.Health - e.Info.Damage <= 80) be.Health = be.MaxHealth;
		}
		return HookResult.Continue;
	}

	/// <summary>Was the player's crosshair on the bot's head (geometry: ray vs head sphere)?</summary>
	private bool IsHeadshot(Actor bot) {
		var p = PlayerPawn;
		if (p == null || bot.Ent == null) return false;
		var eye = Aim.Eye(p);
		var head = TrainerConfig.HeadOf(bot.Ent);
		return Aim.AngleTo(eye, Aim.Dir(p), head) <= Aim.AngularRadius(TrainerConfig.HeadRadius * 1.5f, Vector3.Distance(eye, head));
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var fwd = Aim.Dir(pawn);
		double dt = Math.Clamp(nowMs - _lastMs, 0, 100) / 1000.0;
		_lastMs = nowMs;

		// Clicks count for hits only in simplified mode (with real bots only real damage counts).
		while (In.Shots.Count > 0) {
			var s = In.Shots.Dequeue();
			if (_waveActive) _shotsInWaves++;
			if (!_waveActive || RealBots) continue;
			foreach (var t in _ts)
				if (t.Active && s.TimeMs >= _waveStart && Aim.AngleTo(s.Eye, s.Forward, t.A.Center) <= t.Tol)
					Hit(t, s.TimeMs, eye);
		}

		if (_waveActive) {
			foreach (var t in _ts)
				if (t.Active && t.DmgAt >= _waveStart) Hit(t, t.DmgAt, eye);

			if (TrainerConfig.Dwell) {
				foreach (var t in _ts)
					if (t.Active && Aim.AngleTo(eye, fwd, t.A.Center) <= t.Tol && nowMs - _waveStart > TrainerConfig.DwellMs + 400)
						Hit(t, nowMs, eye);
			}

			if (nowMs >= _waveTimeout) {
				foreach (var t in _ts.Where(x => x.Active).ToList()) {
					t.Active = false;
					_timeouts++;
					t.A.Tint(150, 150, 150);
					t.A.Marker?.SetColor(150, 150, 150);
					Kill(t.Label);
					t.Label = SpawnText("MISS", t.A.Feet + new Vector3(0, 0, 150), eye, 14f, 220, 220, 220);
				}
			}

			if (_ts.All(x => !x.Active)) {
				_waveActive = false;
				_resultUntil = nowMs + 500;
				_nextWaveAt = nowMs + 600 + Rng.NextDouble() * 500;
			}
		}

		if (!_waveActive && _wavesStarted >= _waves && nowMs >= _resultUntil) {
			Summarize();
			Finished = true;
			return;
		}
		if (!_waveActive && _wavesStarted < _waves && nowMs >= _nextWaveAt && nowMs >= _resultUntil)
			SpawnWave(pawn, eye, nowMs);

		// Move sideways (normal/hard) while a target is active.
		float speed = Tuning.FlickStrafeSpeed(Lvl);
		foreach (var t in _ts) {
			if (t.Active && speed > 0f) {
				var right = Aim.Right(Aim.YawTo(pawn.Position, t.Feet));
				t.Feet += right * t.Dir * speed * (float)dt;
				if (Rng.Next(100) < 2) t.Dir = -t.Dir;
			}
			if (!t.Hidden) PlaceActor(t.A, t.Feet, pawn.Position, eye, TrainerConfig.CenterZ);
			if (t.Label != null) Face(t.Label, t.Label.Position, eye);
		}
	}

	private void SpawnWave(CCitadelPlayerPawn pawn, Vector3 eye, double nowMs) {
		var (yMin, yMax) = Tuning.FlickYaw(Lvl);
		var (dMin, dMax) = Tuning.FlickDist(Lvl);
		float distScale = _mode == FlickMode.Long ? 1.7f : 1f;
		var origin = pawn.Position;
		float viewYaw = pawn.EyeAngles.Y;

		var yaws = new List<float>();
		foreach (var t in _ts) {
			Kill(t.Label);
			t.Label = null;
			float chosen = viewYaw;
			for (int tries = 0; tries < 40; tries++) {
				float y = viewYaw + (Rng.Next(2) == 0 ? -1 : 1) * (yMin + (float)Rng.NextDouble() * (yMax - yMin));
				if (yaws.All(a => MathF.Abs(MathF.IEEERemainder(a - y, 360f)) >= 24f)) { chosen = y; break; }
				chosen = y;
			}
			yaws.Add(chosen);

			float dist = 0f;
			for (int tries = 0; tries < 8; tries++) {
				float wanted = (dMin + (float)Rng.NextDouble() * (dMax - dMin)) * distScale;
				dist = ClearDist(pawn, chosen, wanted);
				if (dist >= 260f) break;
			}
			if (dist < 260f) dist = 260f;

			t.Feet = new Vector3(origin.X, origin.Y, _groundZ) + Aim.Forward(0f, chosen) * dist;
			// Long Range with a saved target spot (!tlong target): the bot appears around that spot, e.g. on the bridge.
			if (_mode == FlickMode.Long && Arena.TryGet(Server.MapName + "#longtarget", out var lt)) {
				float toYaw = Aim.YawTo(origin, lt);
				float side = ((float)Rng.NextDouble() * 2f - 1f) * 220f;
				float depth = ((float)Rng.NextDouble() * 2f - 1f) * 90f;
				t.Feet = new Vector3(lt.X, lt.Y, lt.Z) + Aim.Right(toYaw) * side + Aim.Forward(0f, toYaw) * depth;
			}
			t.Tol = Aim.AngularRadius(30f, Vector3.Distance(origin, t.Feet));
			t.A.Feet = t.Feet;
			t.Hidden = false;
			t.A.Place(t.Feet, origin);
			t.A.Tint(255, 90, 90);
			t.A.Marker?.SetColor(255, 60, 60);
			t.Active = true;
			t.DmgAt = -1;
		}

		_wavesStarted++;
		_waveActive = true;
		_waveStart = nowMs;
		double perTarget = Tuning.FlickTimeoutMs(Lvl) * (_mode == FlickMode.Long ? 1.4 : 1.0);
		_waveTimeout = nowMs + perTarget * (1 + 0.6 * (_k - 1));
	}

	private void Hit(T t, double atMs, Vector3 eye) {
		double react = atMs - _waveStart;
		t.Active = false;
		_hits++;
		_reactions.Add(react);
		if (_lastHitAt > _waveStart) _switches.Add(atMs - _lastHitAt);
		_lastHitAt = atMs;
		if (t.Head) _headHits++;
		t.A.Tint(80, 255, 110);
		t.A.Marker?.SetColor(80, 255, 110);
		Kill(t.Label);
		double acc = _shotsInWaves > 0 ? 100.0 * _hits / _shotsInWaves : 100.0;
		t.Label = SpawnText($"{react:0} ms{(t.Head ? "  HEAD" : "")}  |  acc {acc:0}%", t.A.Feet + new Vector3(0, 0, 150), eye, 12f, 80, 255, 110);
		// One shot, one kill: the bot disappears at once (it is parked and comes back with the next wave).
		if (RealBots && t.A.Wants) { t.Hidden = true; try { t.A.Ent?.Teleport(position: BotPool.ParkPos, velocity: Vector3.Zero); } catch { } }
	}

	private void Summarize() {
		int shots = In.ShotsFired - _shotsAtStart;
		int total = _waves * _k;
		Say($"=== {Title()} finished ({LevelParse.Label(Lvl)}) ===");
		Say($"Hits: {_hits}/{total} ({Fmt.Pct(_hits, total)}) | missed: {_timeouts} | shots fired: {shots}");
		Say($"Accuracy: {(_shotsInWaves > 0 ? 100.0 * _hits / _shotsInWaves : 0):0}% ({_hits} hits / {_shotsInWaves} shots while a target was up) | headshots: {_headHits}/{_hits}{(TrainerConfig.FlickHeadOnly ? " (head-only mode)" : "")}");
		if (_reactions.Count > 0) {
			var sorted = _reactions.OrderBy(x => x).ToList();
			double avg = _reactions.Average();
			Say($"Reaction: avg {Fmt.Ms(avg)} | median {Fmt.Ms(sorted[sorted.Count / 2])} | best {Fmt.Ms(sorted[0])}");
			if (_switches.Count > 0) Say($"Target switch time: avg {Fmt.Ms(_switches.Average())}");
			string key = $"flick_{_mode}_{Lvl}";
			bool best = Records.Submit(key, avg, higherIsBetter: false);
			Say(best ? $"New best this session (avg reaction): {avg:0} ms" : $"Best this session: {Records.Get(key):0} ms");
		}
		Ctl.HudAnnounce($"{Title().ToUpperInvariant()} DONE", $"{_hits}/{total}");
	}

	public override void Stop() {
		foreach (var t in _ts) Kill(t.Label);
		base.Stop();
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Tracking: a bot hero moves in front of you; keep the crosshair on it and shoot.
// Strafe = steady back and forth. Random = abrupt direction changes.
// ---------------------------------------------------------------------------------------------------------------------
sealed class TrackDrill : Drill {
	private readonly bool _random;
	private readonly double _durationMs;
	private Actor _a = null!;
	private Vector3 _center, _right, _fwd;
	private float _groundZ;
	private double _startMs, _lastMs, _labelAt;
	private double _total, _onTarget, _firing, _firingOn, _onHead, _firingHead;
	private double _damage;
	private bool _wasOn;
	private CPointWorldText? _label;
	private (string Text, byte R, byte G, byte B)[]? _hudCache;

	// Strafe
	private readonly double _p1, _p2;
	// Random
	private Vector2 _vel, _velTarget; // x = sideways, y = depth
	private double _nextTurn;
	private Vector2 _off;

	public override string Name => "Tracking";
	protected override float LeashRadius => Tuning.LeashTrack;

	public TrackDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, bool random, int seconds) : base(ctl, input, lvl) {
		_random = random;
		_durationMs = Math.Clamp(seconds <= 0 ? 30 : seconds, 5, 300) * 1000.0;
		_p1 = Rng.NextDouble() * Math.PI * 2;
		_p2 = Rng.NextDouble() * Math.PI * 2;
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		var origin = pawn.Position;
		float yaw = pawn.EyeAngles.Y;
		_groundZ = origin.Z;
		_fwd = Aim.Forward(0f, yaw);
		_right = Aim.Right(yaw);
		float dist = Math.Min(700f, ClearDist(pawn, yaw, 700f));
		if (dist < 380f) dist = 380f;
		_center = new Vector3(origin.X, origin.Y, _groundZ) + _fwd * dist;
		_a = AddActor(pawn, _center, nowMs);
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		_startMs = _lastMs = nowMs;
		_nextTurn = nowMs + 600;
		EnsureMarker(_a, Aim.Eye(pawn), 14f, 255, 60, 60);
		Say($"[Tracking] {(_random ? "Random" : "Strafe")}, {_durationMs / 1000:0} s, difficulty {LevelParse.Label(Lvl)}. Keep the crosshair on the target and shoot. The number above it is your hit rate. Abort: !tstop");
		if (!RealBots) Say("[Tracking] Simplified mode: a red 'O' instead of a bot (green = on target).");
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (_a == null) return HookResult.Continue;
		if (ActorOf(e.Entity) is { } bot && IsPlayer(e.Info.Attacker)) {
			_damage += Math.Max(0, e.Info.Damage);
			if (bot.Ent is { } be && be.Health - e.Info.Damage <= 80) be.Health = be.MaxHealth;
		}
		return HookResult.Continue;
	}

	private Vector3 NextFeet(double elapsedMs, double dt) {
		float speed = Tuning.TrackSpeed(Lvl);
		if (!_random) {
			// Steady: two sine waves, peak speed ~ speed.
			double t = elapsedMs / 1000.0;
			double w = speed / 450.0;
			double lat = 330 * Math.Sin(w * t + _p1) + 120 * Math.Sin(2.3 * w * t + _p2);
			double depth = 90 * Math.Sin(0.6 * w * t + _p2);
			return _center + _right * (float)lat + _fwd * (float)depth;
		}

		// Random: the target velocity changes at irregular intervals, acceleration is limited.
		if (elapsedMs + _startMs >= _nextTurn) {
			double a = Rng.NextDouble() * Math.PI * 2;
			double mag = speed * (0.4 + 0.6 * Rng.NextDouble());
			_velTarget = new Vector2((float)(Math.Cos(a) * mag), (float)(Math.Sin(a) * mag * 0.35));
			_nextTurn = _startMs + elapsedMs + 350 + Rng.NextDouble() * 900;
		}
		var diff = _velTarget - _vel;
		float maxStep = (float)(speed * 5.0 * dt);
		if (diff.Length() > maxStep) diff = Vector2.Normalize(diff) * maxStep;
		_vel += diff;
		_off += _vel * (float)dt;
		// Bounds: sideways +-420, depth +-150; turn around at the edge.
		if (MathF.Abs(_off.X) > 420f) { _off.X = MathF.Sign(_off.X) * 420f; _vel.X = -_vel.X; _velTarget.X = -_velTarget.X; }
		if (MathF.Abs(_off.Y) > 150f) { _off.Y = MathF.Sign(_off.Y) * 150f; _vel.Y = -_vel.Y; _velTarget.Y = -_velTarget.Y; }
		return _center + _right * _off.X + _fwd * _off.Y;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		while (In.Shots.Count > 0) In.Shots.Dequeue(); // single clicks do not matter here; "held" is what counts

		double elapsed = nowMs - _startMs;
		double dt = Math.Clamp(nowMs - _lastMs, 0, 100) / 1000.0;
		_lastMs = nowMs;

		var eye = Aim.Eye(pawn);
		var fwd = Aim.Dir(pawn);
		var feet = NextFeet(elapsed, dt);
		PlaceActor(_a, feet, pawn.Position, eye, TrainerConfig.CenterZ);

		// With a real bot the hit zones follow the bot's real position (it lags behind the target spot).
		var basePos = feet;
		if (_a.Wants && _a.Ent is { } realEnt) { try { if (realEnt.IsValid && realEnt.Health > 0) basePos = realEnt.Position; } catch { } }
		var center = basePos + new Vector3(0, 0, TrainerConfig.CenterZ);
		float dist = Vector3.Distance(eye, center);
		bool on = Aim.AngleTo(eye, fwd, center) <= Aim.AngularRadius(Tuning.TrackRadius(Lvl), dist);

		var headPos = (_a.Wants && _a.Ent is { } he && he.IsValid) ? TrainerConfig.HeadOf(he) : basePos + new Vector3(0, 0, TrainerConfig.HeadZ);
		bool head = Aim.AngleTo(eye, fwd, headPos) <= Aim.AngularRadius(TrainerConfig.HeadRadius, Vector3.Distance(eye, headPos));
		if (head) on = true; // the head is part of the target

		_total += dt * 1000.0;
		if (on) _onTarget += dt * 1000.0;
		if (head) _onHead += dt * 1000.0;
		if (In.AttackHeld) { _firing += dt * 1000.0; if (on) _firingOn += dt * 1000.0; if (head) _firingHead += dt * 1000.0; }

		if (on != _wasOn) {
			_wasOn = on;
			if (on) { _a.Tint(80, 255, 110); _a.Marker?.SetColor(80, 255, 110); }
			else { _a.Tint(255, 90, 90); _a.Marker?.SetColor(255, 60, 60); }
		}

		// Live readout: a small panel in the top-left of the screen (text refreshed 4x/s, position glued to the camera every tick).
		if (nowMs >= _labelAt || _hudCache == null) {
			_labelAt = nowMs + 250;
			double shown = _firing > 800 ? 100.0 * _firingOn / _firing : 100.0 * _onTarget / Math.Max(_total, 1);
			double headShown = _firing > 800 ? 100.0 * _firingHead / _firing : 100.0 * _onHead / Math.Max(_total, 1);
			double left = Math.Max(0, (_durationMs - elapsed) / 1000.0);
			_hudCache = new (string, byte, byte, byte)[] {
				($"TRACKING  {left:0} s", 255, 220, 60),
				($"On target   {shown:0}%", 255, 255, 255),
				($"Headshots   {headShown:0}%", 255, 160, 60),
			};
		}
		SetHud(pawn, _hudCache);

		if (elapsed >= _durationMs) {
			Summarize();
			Finished = true;
		}
	}

	private void Summarize() {
		Say($"=== Tracking finished ({(_random ? "Random" : "Strafe")}, {LevelParse.Label(Lvl)}) ===");
		Say($"On target: {Fmt.Pct(_onTarget, _total)} of the time | while firing: {Fmt.Pct(_firingOn, _firing)} | firing: {Fmt.Pct(_firing, _total)} of the time");
		Say($"Head: {Fmt.Pct(_onHead, _total)} of the time on the head | while firing: {Fmt.Pct(_firingHead, _firing)}");
		if (_damage > 0) Say($"Damage dealt to the bot: {_damage:0}");
		double body = _firing > 2000 ? 100.0 * _firingOn / _firing : 100.0 * _onTarget / Math.Max(_total, 1);
		double headPct = _firing > 2000 ? 100.0 * _firingHead / _firing : 100.0 * _onHead / Math.Max(_total, 1);
		double score = body + headPct * 0.5; // body counts fully, head hits give a bonus
		string key = $"track_{(_random ? "rand" : "strafe")}_{Lvl}";
		bool best = Records.Submit(key, score);
		Say(best ? $"New best: {score:0}%" : $"Best this session: {Records.Get(key):0}%");
		Ctl.HudAnnounce("TRACKING DONE", Fmt.Pct(_onTarget, _total) + " on target");
	}

	public override void Stop() {
		Kill(_label);
		base.Stop();
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Reaction: wait for the green "CLICK!" and shoot as fast as you can. Clicking too early repeats the round.
// ---------------------------------------------------------------------------------------------------------------------
sealed class ReactionDrill : Drill {
	private enum Ph { Wait, Go, Result }

	private readonly int _rounds;
	private int _done, _falseStarts;
	private Ph _ph = Ph.Wait;
	private double _goAt, _goShownAt, _resultUntil;
	private CPointWorldText? _text;
	private readonly List<double> _times = new();

	public override string Name => "Reaction";
	protected override float LeashRadius => Tuning.LeashOther;

	public ReactionDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, int rounds) : base(ctl, input, lvl) {
		_rounds = rounds > 0 ? Math.Clamp(rounds, 1, 50) : Tuning.ReactionRounds(lvl);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) { }

	private Vector3 Pos(CCitadelPlayerPawn pawn) => Aim.Eye(pawn) + Aim.Forward(-2f, pawn.EyeAngles.Y) * 320f;

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		while (In.Shots.Count > 0) In.Shots.Dequeue();
		_text = SpawnText("WAIT...", Pos(pawn), Aim.Eye(pawn), 28f, 255, 60, 60);
		ScheduleGo(nowMs);
		Say($"[Reaction] {_rounds} rounds, difficulty {LevelParse.Label(Lvl)}. Wait for the green 'CLICK!' and shoot as fast as you can. Do not click early! Abort: !tstop");
	}

	private void ScheduleGo(double nowMs) {
		var (min, max) = Tuning.ReactionDelayMs(Lvl);
		_goAt = nowMs + min + Rng.NextDouble() * (max - min);
		_ph = Ph.Wait;
		_text?.SetMessage("WAIT...");
		_text?.SetColor(255, 60, 60);
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		if (_text != null) Face(_text, Pos(pawn), Aim.Eye(pawn));

		while (In.Shots.Count > 0) {
			var s = In.Shots.Dequeue();
			if (_ph == Ph.Wait) {
				_falseStarts++;
				Say("[Reaction] Too early! Wait for the green text.");
				ScheduleGo(nowMs + 600);
			} else if (_ph == Ph.Go) {
				double ms = s.TimeMs - _goShownAt;
				_times.Add(ms);
				_done++;
				_ph = Ph.Result;
				_resultUntil = nowMs + 1000;
				_text?.SetMessage($"{ms:0} ms");
				_text?.SetColor(80, 255, 110);
				Say($"[Reaction {_done}/{_rounds}] {Fmt.Ms(ms)}");
			}
		}

		if (_ph == Ph.Wait && nowMs >= _goAt) {
			_ph = Ph.Go;
			_goShownAt = nowMs;
			_text?.SetMessage("CLICK!");
			_text?.SetColor(80, 255, 110);
			pawn.EmitSound("Damage.Send.Crit", volume: 0.4f);
		}
		if (_ph == Ph.Result && nowMs >= _resultUntil) {
			if (_done >= _rounds) { Summarize(); Finished = true; return; }
			ScheduleGo(nowMs);
		}
	}

	private void Summarize() {
		var sorted = _times.OrderBy(x => x).ToList();
		double avg = _times.Average();
		Say($"=== Reaction finished ({LevelParse.Label(Lvl)}) ===");
		Say($"avg {Fmt.Ms(avg)} | median {Fmt.Ms(sorted[sorted.Count / 2])} | best {Fmt.Ms(sorted[0])} | false starts {_falseStarts}");
		string key = $"reaction_{Lvl}";
		bool best = Records.Submit(key, avg, higherIsBetter: false);
		Say(best ? $"New best this session: {avg:0} ms" : $"Best this session: {Records.Get(key):0} ms");
		Ctl.HudAnnounce("REACTION DONE", $"avg {avg:0} ms");
	}

	public override void Stop() {
		Kill(_text);
		base.Stop();
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Self-test: creates a bot, lets it swing, and reports step by step in chat (including model diagnostics).
// ---------------------------------------------------------------------------------------------------------------------
sealed class BotTestDrill : Drill {
	private Actor _a = null!;
	private double _stage1At, _endAt;
	private int _stage;
	private readonly List<string> _log = new();

	public override string Name => "Bot test";

	public BotTestDrill(CCitadelPlayerController ctl, PlayerInput input) : base(ctl, input, Level.Normal) { }

	private void Note(string s) {
		_log.Add(s);
		Console.WriteLine($"[Trainer/Test] {s}");
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		var feet = pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 140f;
		Say("[Bot test] Creating a bot (enemy team, same hero as you) ...");
		_a = AddActor(pawn, feet, nowMs);
		if (!_a.Wants) Say($"[Bot test] ERROR: could not request a bot: {TrainerBots.LastError}");
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		if (!_a.Wants || !RealBots) {
			Say($"[Bot test] No bot hero came into existence. Reason: {TrainerBots.LastError}. The server may have no free slots, or SelectHero does not work for fake clients.");
			Say("[Bot test] Please send me the last lines of the server window. Until then the exercises run in simplified mode (text targets).");
			Finished = true;
			return;
		}
		var be = _a.Ent!;
		var bp = _a.Pawn;
		var render = "?";
		try { var c = be.RenderColor; render = $"rgba({c.R},{c.G},{c.B},{c.A})"; } catch { }
		string heroTxt = bp != null ? bp.HeroID.ToString() : "(not a hero pawn)";
		Say($"[Bot test] Bot is there (method {_a.Method}): entity '{be.DesignerName}', hero {heroTxt}, team {be.TeamNum} (you: {pawn.TeamNum}), HP {be.Health}/{be.MaxHealth}.");
		Say($"[Bot test] Model: '{_a.ModelName}'  render color: {render}  move type: {be.MoveType}  flags: {be.Flags}");
		Say(_a.HasModel
			? "[Bot test] The bot has a model. Do you SEE it standing in front of you? (If not, tell me - it is then a client-side loading issue.)"
			: "[Bot test] The bot has NO model - that is why it is invisible. Markers 'O' show where it is.");
		EnsureMarker(_a, Aim.Eye(pawn), 14f, 255, 220, 0);
		_stage1At = nowMs + 3000;
		_stage = 0;
	}

	public override void OnModifier(ModifierEvent e) {
		if (e.Event is EModifierEvent.MeleeAttack or EModifierEvent.MeleeAttackStarted or EModifierEvent.ParrySuccess or EModifierEvent.CheckForParry)
			Note($"Event {e.Event}: caster={e.Caster?.DesignerName ?? "-"} target={e.Target?.DesignerName ?? "-"}");
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (_stage >= 1 && IsPlayer(e.Entity) && ActorOf(e.Info.Attacker) != null) {
			Note($"Damage to you from the bot: {e.Info.Damage:0} (blocked), flags={e.Info.DamageFlags}");
			return HookResult.Stop;
		}
		return HookResult.Continue;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var feet = pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 140f;
		PlaceActor(_a, feet, pawn.Position, eye, TrainerConfig.CenterZ);

		if (_stage == 0 && nowMs >= _stage1At) {
			_stage = 1;
			var bp = _a.Pawn;
			int rc = -99;
			try { if (bp != null) rc = bp.ExecuteAbilityBySlot(EAbilitySlot.WeaponMelee); }
			catch (Exception ex) { Note($"ExecuteAbilityBySlot threw: {ex.Message}"); }
			Say($"[Bot test] The bot swings now (return value {rc}). Parry or take the hit ...");
			_endAt = nowMs + 2500;
		}
		if (_stage == 1 && nowMs >= _endAt) {
			_stage = 2;
			Say(_log.Count == 0
				? "[Bot test] Result: NO melee event and no damage from the bot. The bot's swing does not arrive. Please send me the server window output."
				: $"[Bot test] Result: {_log.Count} events:");
			foreach (var l in _log.Take(8)) Say($"  {l}");
			Say("[Bot test] Done. (Copy these lines to me if something is wrong.)");
			Finished = true;
		}
	}
}
