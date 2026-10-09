using System.Numerics;
using System.Text.Json;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>Recorded routes (lists of checkpoints per map) and the best times, stored next to the server in trainer_routes.json.</summary>
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

	public static void Put(string map, string name, List<Vector3> pts) {
		Ensure();
		_d.Routes[Key(map, name)] = pts.Select(p => new[] { p.X, p.Y, p.Z }).ToList();
		_d.Best.Remove(Key(map, name));
		Save();
	}

	public static List<Vector3>? Get(string map, string name) {
		Ensure();
		return _d.Routes.TryGetValue(Key(map, name), out var l) ? l.Select(a => new Vector3(a[0], a[1], a[2])).ToList() : null;
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

/// <summary>Records the player's path as checkpoints while they walk it (sampled every ~0.2 s, one point per ~180 units).</summary>
sealed class RouteRecorder {
	public string Name = "";
	public readonly List<Vector3> Points = new();
	private double _lastAt;

	public void Update(Vector3 pos, double nowMs) {
		if (nowMs - _lastAt < 200) return;
		_lastAt = nowMs;
		if (Points.Count == 0 || Vector3.Distance(Points[^1], pos) >= 180f) Points.Add(pos);
	}
}

/// <summary>
/// Route trainer (movement / pathing): walk through a recorded route as fast as you can. The next checkpoint is shown as a marker
/// in the world, you get split times against your best run, and the finish time is saved. Record routes with !troute rec.
/// </summary>
sealed class RouteDrill : Drill {
	private readonly string _name;
	private readonly string _map;
	private readonly List<Vector3> _pts;
	private readonly List<double> _splits = new();
	private readonly List<double> _bestSplits = new();
	private int _idx;
	private double _startMs;
	private bool _started;
	private CPointWorldText? _marker, _markerNext;
	private (string, byte, byte, byte)[]? _hudCache;
	private double _hudAt;

	public override string Name => "Route";

	public RouteDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, string name, string map, List<Vector3> pts) : base(ctl, input, lvl) {
		_name = name; _map = map; _pts = pts;
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) { }

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		var best = RouteStore.BestTime(_map, _name);
		Say($"[Route '{_name}'] {_pts.Count} checkpoints. Run to the marker; the timer starts at checkpoint 1." + (best.HasValue ? $" Your best: {best.Value / 1000:0.0} s." : "") + " Abort: !tstop");
	}

	private float Radius => Lvl switch { Level.Easy => 190f, Level.Hard => 90f, _ => 130f };

	private void UpdateMarkers(CCitadelPlayerPawn pawn) {
		var eye = Aim.Eye(pawn);
		var cur = _pts[Math.Min(_idx, _pts.Count - 1)] + new Vector3(0, 0, 110f);
		string text = _idx == _pts.Count - 1 ? "FINISH" : $"> {_idx + 1} / {_pts.Count}";
		if (_marker == null) _marker = SpawnText(text, cur, eye, 16f, 255, 220, 60);
		else _marker.SetMessage(text);
		if (_marker != null) Face(_marker, cur, eye);
		if (_idx + 1 < _pts.Count) {
			var nx = _pts[_idx + 1] + new Vector3(0, 0, 80f);
			if (_markerNext == null) _markerNext = SpawnText("next", nx, eye, 9f, 150, 150, 150);
			else Face(_markerNext, nx, eye);
			_markerNext?.Teleport(position: nx);
		} else if (_markerNext != null) { Kill(_markerNext); _markerNext = null; }
		_marker?.Teleport(position: cur);
	}

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var p = pawn.Position;
		var target = _pts[_idx];
		float flat = Vector2.Distance(new Vector2(p.X, p.Y), new Vector2(target.X, target.Y));
		if (flat <= Radius && MathF.Abs(p.Z - target.Z) < 220f) {
			if (!_started) { _started = true; _startMs = nowMs; }
			double t = nowMs - _startMs;
			_splits.Add(t);
			_idx++;
			if (_idx >= _pts.Count) { Finish(t); return; }
			Kill(_marker); _marker = null; // re-created on the next UpdateMarkers (new text)
		}
		UpdateMarkers(pawn);

		if (nowMs >= _hudAt || _hudCache == null) {
			_hudAt = nowMs + 200;
			double el = _started ? (nowMs - _startMs) / 1000.0 : 0;
			var best = RouteStore.BestTime(_map, _name);
			_hudCache = new (string, byte, byte, byte)[] {
				($"ROUTE  {_name}", 255, 220, 60),
				($"Checkpoint   {Math.Min(_idx + 1, _pts.Count)} / {_pts.Count}", 255, 255, 255),
				($"Time   {el:0.0} s" + (best.HasValue ? $"   (best {best.Value / 1000:0.0})" : ""), 255, 160, 60),
			};
		}
		SetHud(pawn, _hudCache);
	}

	private void Finish(double totalMs) {
		bool best = RouteStore.SubmitTime(_map, _name, totalMs);
		Say($"=== Route '{_name}' finished: {totalMs / 1000:0.00} s ===");
		Say(best ? "New personal best!" : $"Best: {(RouteStore.BestTime(_map, _name) ?? totalMs) / 1000:0.00} s");
		Ctl.HudAnnounce("ROUTE DONE", $"{totalMs / 1000:0.0} s");
		Finished = true;
	}

	public override void Stop() {
		Kill(_marker); Kill(_markerNext);
		base.Stop();
	}
}
