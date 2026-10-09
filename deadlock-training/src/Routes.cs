using System.Numerics;
using System.Text.Json;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>One recorded sample of a route: position and time since the start of the recording (ms).</summary>
readonly record struct RoutePoint(Vector3 P, float T);

/// <summary>Recorded routes (per map) and the best times, stored next to the server in trainer_routes.json.</summary>
static class RouteStore {
	private sealed class Data {
		public Dictionary<string, List<float[]>> Routes { get; set; } = new();
		public Dictionary<string, double> Best { get; set; } = new();
	}

	private static Data _d = new();
	private static bool _loaded;

	private static string FilePath => Path.Combine(Environment.CurrentDirectory, "trainer_routes.json");

	private static void Ensure() {
		if (_loaded) return;
		_loaded = true;
		try { if (File.Exists(FilePath)) _d = JsonSerializer.Deserialize<Data>(File.ReadAllText(FilePath)) ?? new(); } catch { _d = new(); }
	}

	private static void Save() { try { File.WriteAllText(FilePath, JsonSerializer.Serialize(_d)); } catch { } }

	private static string Key(string map, string name) => map + "|" + name.Trim().ToLowerInvariant();

	public static void Put(string map, string name, List<RoutePoint> pts) {
		Ensure();
		_d.Routes[Key(map, name)] = pts.Select(p => new[] { p.P.X, p.P.Y, p.P.Z, p.T }).ToList();
		_d.Best.Remove(Key(map, name));
		Save();
	}

	public static List<RoutePoint>? Get(string map, string name) {
		Ensure();
		if (!_d.Routes.TryGetValue(Key(map, name), out var l)) return null;
		var list = new List<RoutePoint>();
		float t = 0;
		for (int i = 0; i < l.Count; i++) {
			var a = l[i];
			var p = new Vector3(a[0], a[1], a[2]);
			if (a.Length >= 4) t = a[3];
			else if (i > 0) t += Vector3.Distance(p, list[^1].P) / 0.32f; // old routes without times: assume ~320 units/s
			list.Add(new RoutePoint(p, t));
		}
		return list;
	}

	public static List<string> Names(string map) {
		Ensure();
		string pre = map + "|";
		return _d.Routes.Keys.Where(k => k.StartsWith(pre)).Select(k => k[pre.Length..]).OrderBy(x => x).ToList();
	}

	public static bool Delete(string map, string name) {
		Ensure();
		bool ok = _d.Routes.Remove(Key(map, name));
		_d.Best.Remove(Key(map, name));
		if (ok) Save();
		return ok;
	}

	/// <summary>"54.2 s" or "54.2 s  best 51.0 s" for the route list.</summary>
	public static string Info(string map, string name) {
		var pts = Get(map, name);
		string dur = pts != null && pts.Count > 0 ? $"{pts[^1].T / 1000:0.0} s" : "?";
		var best = BestTime(map, name);
		return best.HasValue ? $"{dur}  (best {best.Value / 1000:0.0})" : dur;
	}

	public static string NextName(string map) {
		var names = Names(map);
		for (int i = 1; i < 100; i++) if (!names.Contains($"route-{i}")) return $"route-{i}";
		return "route-x";
	}

	public static double? BestTime(string map, string name) { Ensure(); return _d.Best.TryGetValue(Key(map, name), out var v) ? v : null; }

	public static bool SubmitTime(string map, string name, double ms) {
		Ensure();
		var k = Key(map, name);
		if (_d.Best.TryGetValue(k, out var old) && old <= ms) return false;
		_d.Best[k] = ms;
		Save();
		return true;
	}
}

/// <summary>Records the player's run: a sample every ~100 ms (when they moved at least 20 units) with the time.</summary>
sealed class RouteRecorder {
	public string Name = "";
	public Vector3 StartPos;
	public float StartYaw;
	public readonly List<RoutePoint> Points = new();
	private double _t0 = -1, _lastAt;
	public double DurationMs => Points.Count > 0 ? Points[^1].T : 0;

	public void Update(Vector3 pos, double nowMs) {
		if (_t0 < 0) { _t0 = nowMs; Points.Add(new RoutePoint(pos, 0)); }
		if (nowMs - _lastAt < 100) return;
		_lastAt = nowMs;
		if (Vector3.Distance(Points[^1].P, pos) >= 20f) Points.Add(new RoutePoint(pos, (float)(nowMs - _t0)));
	}

	public void Finish(Vector3 pos, double nowMs) {
		if (_t0 < 0) return;
		Points.Add(new RoutePoint(pos, (float)(nowMs - _t0)));
	}
}

/// <summary>
/// Route trainer (movement / pathing): a ghost - an exact replay of the recorded run, with its real timing - runs ahead of you;
/// follow it. Checkpoints on the way tell you how far ahead or behind the recording you are. The finish time is saved.
/// </summary>
sealed class RouteDrill : Drill {
	private readonly string _name;
	private readonly string _map;
	private readonly List<RoutePoint> _pts;
	private readonly List<int> _cps = new(); // indices of the checkpoint samples
	private int _next;
	private double _goMs;
	private bool _go;
	private CBaseEntity? _ghost;
	private CPointWorldText? _marker, _count;
	private (string, byte, byte, byte)[]? _hudCache;
	private double _hudAt;
	private string _lastSplit = "";
	private bool _modelWarned;

	public override string Name => "Route";

	public RouteDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, string name, string map, List<RoutePoint> pts) : base(ctl, input, lvl) {
		_name = name; _map = map; _pts = pts;
		float acc = 0; Vector3 last = pts[0].P;
		for (int i = 1; i < pts.Count; i++) {
			acc += Vector3.Distance(last, pts[i].P); last = pts[i].P;
			if (acc >= 450f && i < pts.Count - 1) { _cps.Add(i); acc = 0; }
		}
		_cps.Add(pts.Count - 1);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		try { var m = pawn.ModelName; if (!string.IsNullOrEmpty(m)) Actor.PlayerModel = m; } catch { }
		_ghost = Actor.MakeBody(_pts[0].P);
		if (_ghost == null && !_modelWarned) { _modelWarned = true; Say("[Route] No ghost model available - using markers only."); }
		try { if (_ghost != null) _ghost.RenderColor = System.Drawing.Color.FromArgb(255, 120, 190, 255); } catch { }
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		var best = RouteStore.BestTime(_map, _name);
		_goMs = nowMs + 4000;
		Say($"[Route '{_name}'] {_pts[^1].T / 1000:0.0} s recorded run. Stand at the start; the ghost starts running in 4 s - follow it!" + (best.HasValue ? $" Your best: {best.Value / 1000:0.0} s." : "") + " Abort: !tstop");
	}

	private float Radius => Lvl switch { Level.Easy => 200f, Level.Hard => 100f, _ => 140f };

	private Vector3 GhostAt(double ms, out float yaw) {
		yaw = 0;
		if (ms <= 0) { if (_pts.Count > 1) yaw = Aim.YawTo(_pts[0].P, _pts[1].P); return _pts[0].P; }
		for (int i = 1; i < _pts.Count; i++) {
			if (ms <= _pts[i].T) {
				var a = _pts[i - 1]; var b = _pts[i];
				float u = b.T > a.T ? (float)((ms - a.T) / (b.T - a.T)) : 1f;
				yaw = Aim.YawTo(a.P, b.P);
				return Vector3.Lerp(a.P, b.P, u);
			}
		}
		if (_pts.Count > 1) yaw = Aim.YawTo(_pts[^2].P, _pts[^1].P);
		return _pts[^1].P;
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);

		// Countdown and ghost.
		if (!_go) {
			double left = _goMs - nowMs;
			string c = left > 0 ? $"{Math.Ceiling(left / 1000):0}" : "GO!";
			var cpos = pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 220f + new Vector3(0, 0, 120f);
			if (_count == null) _count = SpawnText(c, cpos, eye, 26f, 255, 220, 60);
			else _count.SetMessage(c);
			if (_count != null) Face(_count, cpos, eye);
			if (left <= 0) { _go = true; Kill(_count); _count = null; }
		}
		double ms = _go ? nowMs - _goMs : 0;
		var gp = GhostAt(ms, out var gyaw);
		try { _ghost?.Teleport(position: gp, angles: new Vector3(0f, gyaw, 0f)); } catch { }

		if (_go) {
			// Checkpoint reached?
			var p = pawn.Position;
			var cp = _pts[_cps[_next]].P;
			float flat = Vector2.Distance(new Vector2(p.X, p.Y), new Vector2(cp.X, cp.Y));
			if (flat <= Radius && MathF.Abs(p.Z - cp.Z) < 250f) {
				double delta = ms - _pts[_cps[_next]].T;
				_lastSplit = delta <= 0 ? $"{-delta / 1000:0.00} s AHEAD of the ghost" : $"{delta / 1000:0.00} s behind the ghost";
				Say($"[Route] Checkpoint {_next + 1}/{_cps.Count}: {_lastSplit}");
				_next++;
				Kill(_marker); _marker = null;
				if (_next >= _cps.Count) { Finish(ms); return; }
			}
			var mp = _pts[_cps[_next]].P + new Vector3(0, 0, 110f);
			string text = _next == _cps.Count - 1 ? "FINISH" : $"> {_next + 1} / {_cps.Count}";
			if (_marker == null) _marker = SpawnText(text, mp, eye, 14f, 255, 220, 60);
			if (_marker != null) Face(_marker, mp, eye);
		}

		if (nowMs >= _hudAt || _hudCache == null) {
			_hudAt = nowMs + 200;
			var best = RouteStore.BestTime(_map, _name);
			_hudCache = new (string, byte, byte, byte)[] {
				($"ROUTE  {_name}", 255, 220, 60),
				($"Checkpoint   {Math.Min(_next + 1, _cps.Count)} / {_cps.Count}", 255, 255, 255),
				($"Time   {Math.Max(0, ms) / 1000:0.0} s" + (best.HasValue ? $"   (best {best.Value / 1000:0.0})" : ""), 255, 160, 60),
				(_lastSplit.Length > 0 ? _lastSplit : "follow the blue ghost", 150, 210, 255),
			};
		}
		SetHud(pawn, _hudCache);
	}

	private void Finish(double totalMs) {
		bool best = RouteStore.SubmitTime(_map, _name, totalMs);
		double rec = _pts[^1].T;
		Say($"=== Route '{_name}' finished: {totalMs / 1000:0.00} s (recorded run: {rec / 1000:0.00} s) ===");
		Say(best ? "New personal best!" : $"Your best: {(RouteStore.BestTime(_map, _name) ?? totalMs) / 1000:0.00} s");
		Ctl.HudAnnounce("ROUTE DONE", $"{totalMs / 1000:0.0} s");
		Finished = true;
	}

	public override void Stop() {
		Kill(_marker); Kill(_count);
		try { if (_ghost != null && _ghost.IsValid) _ghost.Remove(); } catch { }
		_ghost = null;
		base.Stop();
	}
}


/// <summary>Records the player's run. Press the PARRY key to finish. The plugin then shows the "save / try again / discard" menu.</summary>
sealed class RecordDrill : Drill {
	public readonly RouteRecorder Rec;
	private readonly int _edges0;
	private double _t0 = -1;
	private (string, byte, byte, byte)[]? _hud;
	private double _hudAt;

	public override string Name => "Record route";
	public override bool ReturnsToMenu => false;

	public RecordDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, RouteRecorder rec) : base(ctl, input, lvl) {
		Rec = rec;
		_edges0 = input.ParryEdges;
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) { }

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) =>
		Say($"[Route] RECORDING '{Rec.Name}' - the start is here. Run your route. At the end, press your PARRY key to finish.");

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		Rec.Update(pawn.Position, nowMs);
		if (_t0 < 0) _t0 = nowMs;
		if (In.ParryEdges > _edges0 && nowMs - _t0 > 1500) {
			Rec.Finish(pawn.Position, nowMs);
			Finished = true;
			return;
		}
		if (nowMs >= _hudAt || _hud == null) {
			_hudAt = nowMs + 200;
			_hud = new (string, byte, byte, byte)[] {
				($"RECORDING  {Rec.Name}", 255, 90, 90),
				($"Time   {(nowMs - _t0) / 1000:0.0} s", 255, 255, 255),
				("Press PARRY at the end point", 255, 200, 120),
			};
		}
		SetHud(pawn, _hud);
	}
}
