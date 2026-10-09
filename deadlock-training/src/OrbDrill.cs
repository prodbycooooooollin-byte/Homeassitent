using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

enum OrbMode { Deny, LastHit }

/// <summary>
/// Two classic laning skills, trained with floating targets (no bots needed):
///  Deny    - soul orbs rise from a "dead minion"; shoot them before a rival grabs them (green -> yellow -> red).
///  LastHit - a minion's health bar drops as your allies hit it; land the killing blow, neither too early nor too late.
/// </summary>
sealed class OrbDrill : Drill {
	private sealed class O {
		public CPointWorldText? Body, Label;
		public Vector3 Base, Pos;
		public bool Active;
		public double SpawnAt, StealAt, RemoveAt;
		public float Hp, AllyDps;
	}

	private readonly OrbMode _mode;
	private readonly int _total;
	private readonly List<O> _orbs = new();

	private int _spawned, _good, _lost, _chips, _shotsAtStart;
	private double _nextWaveAt, _lastMs;
	private float _groundZ;
	private readonly List<double> _times = new();

	public override string Name => _mode == OrbMode.Deny ? "Deny Souls" : "Last Hit";
	protected override float LeashRadius => Tuning.LeashOther;

	public OrbDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, OrbMode mode, int count) : base(ctl, input, lvl) {
		_mode = mode;
		_total = count > 0 ? Math.Clamp(count, 1, 100) : Tuning.OrbTotal(lvl);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) { }

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		_groundZ = pawn.Position.Z;
		_nextWaveAt = nowMs + 2000;
		_lastMs = nowMs;
		_shotsAtStart = In.ShotsFired;
		while (In.Shots.Count > 0) In.Shots.Dequeue();
		if (_mode == OrbMode.Deny)
			Say($"[Deny Souls] {_total} soul orbs, difficulty {LevelParse.Label(Lvl)}. Shoot each orb before a rival grabs it: green = safe, yellow = hurry, red = about to be lost. Abort: !tstop");
		else
			Say($"[Last Hit] {_total} minions, difficulty {LevelParse.Label(Lvl)}. Allies are hitting the minions; their health drops. Shoot to land the KILLING blow - the number turns green when your shot would kill. Shooting too early wastes a hit; waiting too long loses it. Abort: !tstop");
	}

	private bool IsDeny => _mode == OrbMode.Deny;

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		double dt = Math.Clamp(nowMs - _lastMs, 0, 100) / 1000.0;
		_lastMs = nowMs;

		// Shots.
		while (In.Shots.Count > 0) {
			var s = In.Shots.Dequeue();
			O? hit = null;
			float best = float.MaxValue;
			foreach (var o in _orbs) {
				if (!o.Active) continue;
				float tol = Aim.AngularRadius(Tuning.OrbRadius(Lvl), Vector3.Distance(s.Eye, o.Pos));
				float a = Aim.AngleTo(s.Eye, s.Forward, o.Pos);
				if (a <= tol && a < best) { best = a; hit = o; }
			}
			if (hit != null) Shoot(hit, s.TimeMs, eye);
		}

		// Orb state.
		foreach (var o in _orbs) {
			if (o.Active) {
				if (IsDeny) {
					double age = nowMs - o.SpawnAt;
					o.Pos = o.Base + new Vector3(0f, 0f, (float)(age / 1000.0 * 90.0)) + Aim.Right(Aim.YawTo(pawn.Position, o.Base)) * (float)(Math.Sin(age / 400.0) * 12.0);
					double left = o.StealAt - nowMs;
					if (left <= 0) { Lose(o, eye, "LOST"); continue; }
					o.Body?.SetColor(left > 800 ? (byte)60 : (byte)255, left > 800 ? (byte)255 : left > 400 ? (byte)220 : (byte)50, 60);
					o.Label?.SetMessage($"{left / 1000.0:0.0}");
				} else {
					o.Hp -= o.AllyDps * (float)dt;
					if (o.Hp <= 0f) { Lose(o, eye, "LOST"); continue; }
					bool kill = o.Hp <= Tuning.LastHitDamage(Lvl);
					o.Body?.SetColor(kill ? (byte)60 : (byte)255, 255, kill ? (byte)60 : (byte)255);
					o.Label?.SetMessage($"{Math.Ceiling(o.Hp):0}");
					o.Label?.SetColor(kill ? (byte)60 : (byte)255, 255, kill ? (byte)60 : (byte)255);
				}
			}
			if (o.Body != null) Face(o.Body, o.Pos, eye);
			if (o.Label != null) Face(o.Label, o.Pos + new Vector3(0, 0, IsDeny ? 38f : 34f), eye);
		}

		// Remove resolved orbs after their result flash.
		foreach (var o in _orbs.Where(x => !x.Active && x.RemoveAt > 0 && nowMs >= x.RemoveAt).ToList()) {
			Kill(o.Body);
			Kill(o.Label);
			_orbs.Remove(o);
		}

		bool anyActive = _orbs.Any(x => x.Active);
		if (!anyActive && _spawned >= _total && _orbs.Count == 0) {
			Summarize();
			Finished = true;
			return;
		}
		if (!anyActive && _spawned < _total && nowMs >= _nextWaveAt && _orbs.Count == 0)
			SpawnWave(pawn, eye, nowMs);
	}

	private void SpawnWave(CCitadelPlayerPawn pawn, Vector3 eye, double nowMs) {
		int k = Math.Min(IsDeny ? Tuning.OrbPerWave(Lvl) : Tuning.LastHitPerWave(Lvl), _total - _spawned);
		var origin = pawn.Position;
		float viewYaw = pawn.EyeAngles.Y;
		var yaws = new List<float>();

		for (int i = 0; i < k; i++) {
			float chosen = viewYaw;
			for (int tries = 0; tries < 40; tries++) {
				float y = viewYaw + (Rng.Next(2) == 0 ? -1 : 1) * (22f + (float)Rng.NextDouble() * 55f);
				chosen = y;
				if (yaws.All(a => MathF.Abs(MathF.IEEERemainder(a - y, 360f)) >= 26f)) break;
			}
			yaws.Add(chosen);

			float dist = 0f;
			for (int tries = 0; tries < 8; tries++) {
				dist = ClearDist(pawn, chosen, 420f + (float)Rng.NextDouble() * 330f);
				if (dist >= 260f) break;
			}
			if (dist < 260f) dist = 260f;

			var baseP = new Vector3(origin.X, origin.Y, _groundZ + (IsDeny ? 70f : TrainerConfig.CenterZ)) + Aim.Forward(0f, chosen) * dist;
			var o = new O { Base = baseP, Pos = baseP, Active = true, SpawnAt = nowMs };
			if (IsDeny) {
				o.StealAt = nowMs + Tuning.OrbStealMs(Lvl, Rng);
			} else {
				o.Hp = 100f;
				var (dMin, dMax) = Tuning.LastHitAllyDps(Lvl);
				o.AllyDps = dMin + (float)Rng.NextDouble() * (dMax - dMin);
			}
			float radius = Tuning.OrbRadius(Lvl);
			o.Body = SpawnText("O", baseP, eye, radius, IsDeny ? (byte)60 : (byte)255, IsDeny ? (byte)255 : (byte)255, IsDeny ? (byte)60 : (byte)255);
			o.Label = SpawnText(IsDeny ? "" : "100", baseP + new Vector3(0, 0, 36), eye, 12f, 255, 255, 255);
			_orbs.Add(o);
			_spawned++;
		}
	}

	private void Shoot(O o, double atMs, Vector3 eye) {
		if (IsDeny) {
			_good++;
			double t = atMs - o.SpawnAt;
			_times.Add(t);
			Resolve(o, atMs, eye, $"DENIED {t:0} ms", 80, 255, 110);
			return;
		}
		o.Hp -= Tuning.LastHitDamage(Lvl);
		if (o.Hp <= 0f) {
			_good++;
			double t = atMs - o.SpawnAt;
			_times.Add(t);
			Resolve(o, atMs, eye, "LAST HIT!", 80, 255, 110);
		} else {
			_chips++; // hit it but it survived: a wasted shot
			o.Label?.SetColor(255, 160, 50);
		}
	}

	private void Resolve(O o, double nowMs, Vector3 eye, string text, byte r, byte g, byte b) {
		o.Active = false;
		o.RemoveAt = nowMs + 700;
		_nextWaveAt = nowMs + 600 + Rng.NextDouble() * 500;
		o.Body?.SetColor(r, g, b);
		o.Label?.SetMessage(text);
		o.Label?.SetColor(r, g, b);
	}

	private void Lose(O o, Vector3 eye, string text) {
		double now = Clock.Ms;
		_lost++;
		Resolve(o, now, eye, text, 255, 60, 60);
	}

	private void Summarize() {
		int shots = In.ShotsFired - _shotsAtStart;
		string label = IsDeny ? "Deny Souls" : "Last Hit";
		Say($"=== {label} finished ({LevelParse.Label(Lvl)}) ===");
		if (IsDeny)
			Say($"Denied: {_good}/{_total} ({Fmt.Pct(_good, _total)}) | lost to the rival: {_lost} | shots fired: {shots}" +
				(_times.Count > 0 ? $" | avg time to deny: {Fmt.Ms(_times.Average())}" : ""));
		else
			Say($"Last hits: {_good}/{_total} ({Fmt.Pct(_good, _total)}) | lost to allies: {_lost} | wasted shots: {_chips} | shots fired: {shots}");
		string key = $"orb_{_mode}_{Lvl}";
		double rate = _total > 0 ? 100.0 * _good / _total : 0;
		bool best = Records.Submit(key, rate);
		Say(best ? $"New best this session: {rate:0}%" : $"Best this session: {Records.Get(key):0}%");
		Ctl.HudAnnounce(label.ToUpperInvariant() + " DONE", $"{_good}/{_total}");
	}

	public override void Stop() {
		foreach (var o in _orbs) { Kill(o.Body); Kill(o.Label); }
		_orbs.Clear();
		base.Stop();
	}
}
