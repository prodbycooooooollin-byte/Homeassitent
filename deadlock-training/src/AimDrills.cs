using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

// ---------------------------------------------------------------------------------------------------------------------
// Flick: Ein Bot-Held springt an immer neue Stellen um dich herum. Treffen (echter Schaden) = Punkt + Reaktionszeit.
// ---------------------------------------------------------------------------------------------------------------------
sealed class FlickDrill : Drill {
	private readonly int _count;
	private Actor _a = null!;
	private int _spawned, _hits, _timeouts;
	private int _shotsAtStart;
	private readonly List<double> _reactions = new();

	private CPointWorldText? _label;
	private Vector3 _feet;
	private float _groundZ;
	private float _strafeDir = 1f;
	private float _tolDeg;
	private bool _active;
	private double _spawnAtMs, _targetSpawnMs, _timeoutAt, _resultUntil, _dwellSince, _damageAt = -1, _lastMs;

	public override string Name => "Flick";

	public FlickDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, int count) : base(ctl, input, lvl) {
		_count = count > 0 ? Math.Clamp(count, 1, 200) : Tuning.FlickCount(lvl);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		_groundZ = pawn.Position.Z;
		_feet = new Vector3(pawn.Position.X, pawn.Position.Y, _groundZ) + Aim.Forward(0f, pawn.EyeAngles.Y) * 600f;
		_a = AddActor(pawn, _feet, nowMs);
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		_spawnAtMs = nowMs + 2000;
		_lastMs = nowMs;
		_shotsAtStart = In.ShotsFired;
		while (In.Shots.Count > 0) In.Shots.Dequeue();
		Say($"[Flick] {_count} Ziele, Stufe {LevelParse.Label(Lvl)}. Der Gegner springt an neue Stellen - so schnell wie moeglich treffen. Abbruch: !tstop");
		if (!RealBots) Say("[Flick] Vereinfachter Modus: rote Kugel 'O' statt Bot. Treffer zaehlt, wenn du draufschiesst.");
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (_a == null) return HookResult.Continue;
		if (ActorOf(e.Entity) is { } bot && IsPlayer(e.Info.Attacker)) {
			if (_active && e.Info.Damage > 0) _damageAt = Clock.Ms;
			if (bot.Pawn is { } bp && bp.Health - e.Info.Damage <= 80) bp.Health = bp.MaxHealth;
		}
		return HookResult.Continue;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var fwd = Aim.Forward(pawn.EyeAngles);
		double dt = Math.Clamp(nowMs - _lastMs, 0, 100) / 1000.0;
		_lastMs = nowMs;

		// Klicks (fuer Geometrie-Treffer im vereinfachten Modus und als Zusatz).
		while (In.Shots.Count > 0) {
			var s = In.Shots.Dequeue();
			if (!_active || RealBots) continue; // mit echtem Bot zaehlt nur echter Schaden
			if (s.TimeMs >= _targetSpawnMs && Aim.AngleTo(s.Eye, s.Forward, _a.Center) <= _tolDeg)
				Hit(pawn, s.TimeMs, eye);
		}

		if (_active && _damageAt >= _targetSpawnMs) Hit(pawn, _damageAt, eye);

		if (_active && TrainerConfig.Dwell) {
			if (Aim.AngleTo(eye, fwd, _a.Center) <= _tolDeg) {
				if (_dwellSince == 0) _dwellSince = nowMs;
				else if (nowMs - _dwellSince >= TrainerConfig.DwellMs) Hit(pawn, nowMs, eye);
			} else _dwellSince = 0;
		}

		if (_active && nowMs >= _timeoutAt) {
			_timeouts++;
			_active = false;
			_resultUntil = nowMs + 450;
			_a.Tint(150, 150, 150);
			Kill(_label);
			_label = SpawnText("MISS", _a.Feet + new Vector3(0, 0, 150), eye, 16f, 220, 220, 220);
		}

		if (!_active && nowMs >= _resultUntil && _spawned > 0 && _spawned >= _count) {
			Summarize();
			Finished = true;
			return;
		}

		if (!_active && nowMs >= _spawnAtMs && nowMs >= _resultUntil && _spawned < _count)
			Spawn(pawn, eye, nowMs);

		// Seitlich laufen (Normal/Schwer), solange das Ziel aktiv ist.
		if (_active) {
			float speed = Tuning.FlickStrafeSpeed(Lvl);
			if (speed > 0f) {
				var right = Aim.Right(Aim.YawTo(pawn.Position, _feet));
				_feet += right * _strafeDir * speed * (float)dt;
				if (Rng.Next(100) < 2) _strafeDir = -_strafeDir;
			}
		}

		PlaceActor(_a, _feet, pawn.Position, eye, TrainerConfig.CenterZ);
		if (_label != null) Face(_label, _label.Position, eye);
	}

	private void Spawn(CCitadelPlayerPawn pawn, Vector3 eye, double nowMs) {
		Kill(_label);
		_label = null;
		var (yMin, yMax) = Tuning.FlickYaw(Lvl);
		var (dMin, dMax) = Tuning.FlickDist(Lvl);
		var origin = pawn.Position;
		float viewYaw = pawn.EyeAngles.Y;

		Vector3 feet = _feet;
		for (int tries = 0; tries < 8; tries++) {
			float yaw = viewYaw + (Rng.Next(2) == 0 ? -1 : 1) * (yMin + (float)Rng.NextDouble() * (yMax - yMin));
			float wanted = dMin + (float)Rng.NextDouble() * (dMax - dMin);
			float dist = ClearDist(pawn, yaw, wanted);
			if (dist < 260f) continue;
			feet = new Vector3(origin.X, origin.Y, _groundZ) + Aim.Forward(0f, yaw) * dist;
			break;
		}
		_feet = feet;
		_tolDeg = Aim.AngularRadius(30f, Vector3.Distance(origin, feet));
		_a.Feet = feet;

		if (!RealBots && _a.Marker == null)
			_a.Marker = SpawnText("O", _a.Center, eye, 26f, 255, 50, 50);
		_a.Tint(255, 90, 90);
		_a.Place(feet, origin);

		_spawned++;
		_active = true;
		_targetSpawnMs = nowMs;
		_timeoutAt = nowMs + Tuning.FlickTimeoutMs(Lvl);
		_damageAt = -1;
		_dwellSince = 0;
	}

	private void Hit(CCitadelPlayerPawn pawn, double atMs, Vector3 eye) {
		double react = atMs - _targetSpawnMs;
		_hits++;
		_reactions.Add(react);
		_active = false;
		_resultUntil = atMs + 450;
		_spawnAtMs = atMs + 350 + Rng.NextDouble() * 500;
		_a.Tint(80, 255, 110);
		Kill(_label);
		_label = SpawnText($"{react:0} ms", _a.Feet + new Vector3(0, 0, 150), eye, 18f, 80, 255, 110);
		if (_a.Marker != null) _a.Marker.SetColor(80, 255, 110);
	}

	private void Summarize() {
		int shots = In.ShotsFired - _shotsAtStart;
		Say($"=== Flick fertig ({LevelParse.Label(Lvl)}) ===");
		Say($"Treffer: {_hits}/{_count} ({Fmt.Pct(_hits, _count)}) | verpasst: {_timeouts} | Schuesse: {shots}");
		if (_reactions.Count > 0) {
			var sorted = _reactions.OrderBy(x => x).ToList();
			double avg = _reactions.Average();
			Say($"Reaktion: Ø {Fmt.Ms(avg)} | Median {Fmt.Ms(sorted[sorted.Count / 2])} | beste {Fmt.Ms(sorted[0])}");
			string key = $"flick_{Lvl}";
			bool best = Records.Submit(key, avg, higherIsBetter: false);
			Say(best ? $"Neuer Bestwert (Ø Reaktion): {avg:0} ms" : $"Bestwert diese Sitzung: {Records.Get(key):0} ms");
		}
		Ctl.HudAnnounce("FLICK FERTIG", $"{_hits}/{_count}");
	}

	public override void Stop() {
		Kill(_label);
		base.Stop();
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Tracking: Ein Bot-Held bewegt sich vor dir; Fadenkreuz draufhalten und dabei schiessen.
// Strafe = gleichmaessiges Hin und Her. Zufall = ruckartige Richtungswechsel.
// ---------------------------------------------------------------------------------------------------------------------
sealed class TrackDrill : Drill {
	private readonly bool _random;
	private readonly double _durationMs;
	private Actor _a = null!;
	private Vector3 _center, _right, _fwd;
	private float _groundZ;
	private double _startMs, _lastMs, _labelAt;
	private double _total, _onTarget, _firing, _firingOn;
	private double _damage;
	private bool _wasOn;
	private CPointWorldText? _label;

	// Strafe
	private readonly double _p1, _p2;
	// Zufall
	private Vector2 _vel, _velTarget; // x = seitlich, y = Tiefe
	private double _nextTurn;
	private Vector2 _off;

	public override string Name => "Tracking";

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
		if (!RealBots)
			_a.Marker = SpawnText("O", _center + new Vector3(0, 0, TrainerConfig.CenterZ), Aim.Eye(pawn), 26f, 255, 50, 50);
		Say($"[Tracking] {(_random ? "Zufall" : "Strafe")}, {_durationMs / 1000:0} s, Stufe {LevelParse.Label(Lvl)}. Halte das Fadenkreuz auf dem Gegner und schiesse dabei. Die Zahl ueber ihm zeigt deine Trefferquote. Abbruch: !tstop");
		if (!RealBots) Say("[Tracking] Vereinfachter Modus: rote Kugel 'O' statt Bot (gruen = auf dem Ziel).");
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (_a == null) return HookResult.Continue;
		if (ActorOf(e.Entity) is { } bot && IsPlayer(e.Info.Attacker)) {
			_damage += Math.Max(0, e.Info.Damage);
			if (bot.Pawn is { } bp && bp.Health - e.Info.Damage <= 80) bp.Health = bp.MaxHealth;
		}
		return HookResult.Continue;
	}

	private Vector3 NextFeet(double elapsedMs, double dt) {
		float speed = Tuning.TrackSpeed(Lvl);
		if (!_random) {
			// Gleichmaessig: zwei Sinuswellen, Spitzengeschwindigkeit ~ speed.
			double t = elapsedMs / 1000.0;
			double w = speed / 450.0;
			double lat = 330 * Math.Sin(w * t + _p1) + 120 * Math.Sin(2.3 * w * t + _p2);
			double depth = 90 * Math.Sin(0.6 * w * t + _p2);
			return _center + _right * (float)lat + _fwd * (float)depth;
		}

		// Zufall: Zielgeschwindigkeit wechselt in unregelmaessigen Abstaenden, Beschleunigung begrenzt.
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
		// Grenzen: seitlich +-420, Tiefe +-150; am Rand umdrehen.
		if (MathF.Abs(_off.X) > 420f) { _off.X = MathF.Sign(_off.X) * 420f; _vel.X = -_vel.X; _velTarget.X = -_velTarget.X; }
		if (MathF.Abs(_off.Y) > 150f) { _off.Y = MathF.Sign(_off.Y) * 150f; _vel.Y = -_vel.Y; _velTarget.Y = -_velTarget.Y; }
		return _center + _right * _off.X + _fwd * _off.Y;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		while (In.Shots.Count > 0) In.Shots.Dequeue(); // Einzelklicks sind hier egal; gezaehlt wird "gehalten".

		double elapsed = nowMs - _startMs;
		double dt = Math.Clamp(nowMs - _lastMs, 0, 100) / 1000.0;
		_lastMs = nowMs;

		var eye = Aim.Eye(pawn);
		var fwd = Aim.Forward(pawn.EyeAngles);
		var feet = NextFeet(elapsed, dt);
		PlaceActor(_a, feet, pawn.Position, eye, TrainerConfig.CenterZ);

		var center = feet + new Vector3(0, 0, TrainerConfig.CenterZ);
		float dist = Vector3.Distance(eye, center);
		bool on = Aim.AngleTo(eye, fwd, center) <= Aim.AngularRadius(Tuning.TrackRadius(Lvl), dist);

		_total += dt * 1000.0;
		if (on) _onTarget += dt * 1000.0;
		if (In.AttackHeld) { _firing += dt * 1000.0; if (on) _firingOn += dt * 1000.0; }

		if (on != _wasOn) {
			_wasOn = on;
			if (on) { _a.Tint(80, 255, 110); _a.Marker?.SetColor(80, 255, 110); }
			else { _a.Tint(255, 90, 90); _a.Marker?.SetColor(255, 50, 50); }
		}

		// Live-Anzeige ueber dem Kopf.
		if (nowMs >= _labelAt) {
			_labelAt = nowMs + 400;
			double shown = _firing > 800 ? 100.0 * _firingOn / _firing : 100.0 * _onTarget / Math.Max(_total, 1);
			string text = $"{shown:0}%";
			if (_label == null) _label = SpawnText(text, feet + new Vector3(0, 0, 160), eye, 16f, 255, 220, 0);
			else _label.SetMessage(text);
		}
		if (_label != null) Face(_label, feet + new Vector3(0, 0, 160), eye);

		if (elapsed >= _durationMs) {
			Summarize();
			Finished = true;
		}
	}

	private void Summarize() {
		Say($"=== Tracking fertig ({(_random ? "Zufall" : "Strafe")}, {LevelParse.Label(Lvl)}) ===");
		Say($"Auf dem Ziel: {Fmt.Pct(_onTarget, _total)} der Zeit | beim Schiessen: {Fmt.Pct(_firingOn, _firing)} | Feuer an: {Fmt.Pct(_firing, _total)}");
		if (_damage > 0) Say($"Schaden am Bot: {_damage:0}");
		double score = _firing > 2000 ? 100.0 * _firingOn / _firing : 100.0 * _onTarget / Math.Max(_total, 1);
		string key = $"track_{(_random ? "rand" : "strafe")}_{Lvl}";
		bool best = Records.Submit(key, score);
		Say(best ? $"Neuer Bestwert: {score:0}%" : $"Bestwert diese Sitzung: {Records.Get(key):0}%");
		Ctl.HudAnnounce("TRACKING FERTIG", Fmt.Pct(_onTarget, _total) + " auf dem Ziel");
	}

	public override void Stop() {
		Kill(_label);
		base.Stop();
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Selbsttest: erzeugt einen Bot, laesst ihn zuschlagen und berichtet im Chat Schritt fuer Schritt.
// ---------------------------------------------------------------------------------------------------------------------
sealed class BotTestDrill : Drill {
	private Actor _a = null!;
	private double _stage1At, _endAt;
	private int _stage;
	private readonly List<string> _log = new();

	public override string Name => "Bot-Test";

	public BotTestDrill(CCitadelPlayerController ctl, PlayerInput input) : base(ctl, input, Level.Normal) { }

	private void Note(string s) {
		_log.Add(s);
		Console.WriteLine($"[Trainer/Test] {s}");
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		var feet = pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 140f;
		Say($"[Bot-Test] Erzeuge Bot ({TrainerConfig.BotHero}, Gegner-Team) ...");
		_a = AddActor(pawn, feet, nowMs);
		if (!_a.WantsBot) Say($"[Bot-Test] FEHLER: Bot-Slot nicht erhalten: {TrainerBots.LastError}");
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		if (!_a.WantsBot || !RealBots) {
			Say($"[Bot-Test] Kein Bot-Held entstanden. Grund: {TrainerBots.LastError}. Der Server hat keine freien Slots oder SelectHero greift nicht fuer Fake-Clients.");
			Say("[Bot-Test] Bitte schick mir die letzten Zeilen aus dem Server-Fenster. Bis dahin laufen die Uebungen im vereinfachten Modus (Text-Ziele).");
			Finished = true;
			return;
		}
		var bp = _a.Pawn!;
		Say($"[Bot-Test] Bot ist da: Held {bp.HeroID}, Team {bp.TeamNum} (du: {pawn.TeamNum}), HP {bp.Health}/{bp.MaxHealth}.");
		_stage1At = nowMs + 1200;
		_stage = 0;
	}

	public override void OnModifier(ModifierEvent e) {
		if (e.Event is EModifierEvent.MeleeAttack or EModifierEvent.MeleeAttackStarted or EModifierEvent.ParrySuccess or EModifierEvent.CheckForParry)
			Note($"Event {e.Event}: caster={e.Caster?.DesignerName ?? "-"} target={e.Target?.DesignerName ?? "-"}");
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		if (_stage >= 1) {
			if (IsPlayer(e.Entity) && ActorOf(e.Info.Attacker) != null) {
				Note($"Schaden am Spieler vom Bot: {e.Info.Damage:0} (geblockt), Flags={e.Info.DamageFlags}");
				return HookResult.Stop;
			}
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
			catch (Exception ex) { Note($"ExecuteAbilityBySlot warf: {ex.Message}"); }
			Say($"[Bot-Test] Bot schlaegt zu (Rueckgabe {rc}). Parry jetzt oder lass dich treffen ...");
			_endAt = nowMs + 2500;
		}
		if (_stage == 1 && nowMs >= _endAt) {
			_stage = 2;
			Say(_log.Count == 0
				? "[Bot-Test] Ergebnis: KEIN Nahkampf-Ereignis und kein Schaden vom Bot. Der Bot-Schlag kommt nicht an. Schick mir bitte die Server-Fenster-Ausgabe."
				: $"[Bot-Test] Ergebnis: {_log.Count} Ereignisse:");
			foreach (var l in _log.Take(8)) Say($"  {l}");
			Say("[Bot-Test] Fertig. (Kopiere mir diese Zeilen, falls etwas nicht stimmt.)");
			Finished = true;
		}
	}
}
