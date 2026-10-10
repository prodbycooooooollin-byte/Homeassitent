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
		public HashSet<string> Zip { get; set; } = new();
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

	public static bool IsZip(string map, string name) { Ensure(); return _d.Zip.Contains(Key(map, name)); }

	public static void Put(string map, string name, List<RoutePoint> pts, bool zip = false) {
		Ensure();
		if (zip) _d.Zip.Add(Key(map, name)); else _d.Zip.Remove(Key(map, name));
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
		_d.Zip.Remove(Key(map, name));
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
	public bool FixedStart;
	/// <summary>The recording began while riding a zipline.</summary>
	public bool StartZip;

	public static bool OnZipline(CCitadelPlayerPawn p) {
		try { return p.ModifierProp?.HasModifierState(EModifierState.UsingZipline) == true; } catch { return false; }
	}
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
/// Route trainer (movement / pathing): a ghost - an exact replay of the recorded run with its real timing - runs ahead of you.
/// You do not have to hit the checkpoints exactly: progress is measured along the recorded path (stay within a wide corridor of it),
/// so you can look for faster lines. PARRY or R restarts the run. If you beat the recorded time, your run becomes the new route.
/// </summary>
sealed class RouteDrill : Drill {
	private readonly string _name;
	private readonly string _map;
	private List<RoutePoint> _pts;
	private readonly List<int> _cps = new(); // indices of the checkpoint samples
	private int _next, _progress;
	private double _goMs, _lastMs;
	private bool _go, _done;
	private int _edges;
	private CBaseEntity? _ghost;
	private bool _zip;
	private double _mountAt, _lastMount;
	private CPointWorldText? _ghostTag;
	private CPointWorldText? _marker, _count;
	private (string, byte, byte, byte)[]? _hudCache;
	private double _hudAt;
	private string _lastSplit = "";
	private RouteRecorder _run = new();
	private const float Corridor = 800f;

	public override string Name => "Route";

	public RouteDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, string name, string map, List<RoutePoint> pts) : base(ctl, input, lvl) {
		_name = name; _map = map; _pts = pts;
		_zip = RouteStore.IsZip(map, name);
		BuildCheckpoints();
	}

	private void BuildCheckpoints() {
		_cps.Clear();
		float acc = 0; Vector3 last = _pts[0].P;
		for (int i = 1; i < _pts.Count; i++) {
			acc += Vector3.Distance(last, _pts[i].P); last = _pts[i].P;
			if (acc >= 500f && i < _pts.Count - 1) { _cps.Add(i); acc = 0; }
		}
		_cps.Add(_pts.Count - 1);
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		try { var m = pawn.ModelName; if (!string.IsNullOrEmpty(m)) Actor.PlayerModel = m; } catch { }
		_ghost = Actor.MakeBody(_pts[0].P);
		try { if (_ghost != null) _ghost.RenderColor = System.Drawing.Color.FromArgb(255, 120, 190, 255); } catch { }
		NoCollide(_ghost, pawn);
		_edges = In.KeyEdges;
	}

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		var best = RouteStore.BestTime(_map, _name);
		_goMs = nowMs + 4000;
		_lastMs = nowMs;
		Freeze(pawn, true);
		Say($"[Route '{_name}'] recorded run {_pts[^1].T / 1000:0.0} s." + (best.HasValue ? $" Your best: {best.Value / 1000:0.0} s." : "") +
			" The ghost starts in 4 s. You need not follow it exactly - find faster lines! PARRY or R restarts. Abort: !tstop");
	}

	/// <summary>Hold the player still during the countdown (movement keys can stay pressed): everybody starts at the same instant as the ghost.</summary>
	private void Freeze(CCitadelPlayerPawn pawn, bool on) { try { pawn.SetMoveType(on ? MoveType.None : MoveType.Walk); } catch { } }

	/// <summary>The ghost must never push or block you.</summary>
	private void NoCollide(CBaseEntity? ghost, CCitadelPlayerPawn pawn) {
		if (ghost == null) return;
		try { ghost.DisableCollisionsWith(pawn); } catch { }
		try { ghost.AcceptInput("DisableCollision"); } catch { }
	}

	private float StartYaw => _pts.Count > 3 ? Aim.YawTo(_pts[0].P, _pts[3].P) : 0f;

	private void Restart(CCitadelPlayerPawn pawn, double nowMs) {
		try { pawn.TeleportWithView(_pts[0].P + new Vector3(0, 0, 8), new Vector3(0f, StartYaw, 0f)); } catch { }
		_go = false; _done = false; _next = 0; _progress = 0;
		_goMs = nowMs + 3000;
		Freeze(pawn, true);
		_run = new RouteRecorder();
		_lastSplit = "";
		Kill(_marker); _marker = null;
		Say("[Route] Restarted - the ghost starts in 3 s.");
	}

	private Vector3 GhostAt(double ms, out float yaw) {
		yaw = StartYaw;
		if (ms <= 0) return _pts[0].P;
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
		if (_done) return;

		if (In.KeyEdges > _edges) { _edges = In.KeyEdges; Restart(pawn, nowMs); return; }

		if (!_go) {
			double left = _goMs - nowMs;
			string c = left > 0 ? $"{Math.Ceiling(left / 1000):0}" : "GO!";
			var cpos = pawn.Position + Aim.Forward(0f, pawn.EyeAngles.Y) * 220f + new Vector3(0, 0, 120f);
			if (_count == null) _count = SpawnText(c, cpos, eye, 26f, 255, 220, 60);
			else _count.SetMessage(c);
			if (_count != null) Face(_count, cpos, eye);
			if (left <= 0) { _go = true; Kill(_count); _count = null; _run = new RouteRecorder(); Freeze(pawn, false); if (_zip) _mountAt = nowMs; }
		}
		if (_zip && _mountAt > 0) {
			// The route began on a zipline: grab it again (a teleport drops you off the rope).
			if (RouteRecorder.OnZipline(pawn) || nowMs - _mountAt > 1500) _mountAt = 0;
			else if (nowMs - _lastMount > 250) { _lastMount = nowMs; try { pawn.ExecuteAbilityBySlot(EAbilitySlot.Ability_ZipLine); } catch { } }
		}
		double ms = _go ? nowMs - _goMs : 0;
		var gp = GhostAt(ms, out var gyaw);
		try {
			if (_ghost == null || !_ghost.IsValid) { _ghost = Actor.MakeBody(gp); if (_ghost != null) _ghost.RenderColor = System.Drawing.Color.FromArgb(255, 120, 190, 255); NoCollide(_ghost, pawn); }
			_ghost?.Teleport(position: gp, angles: new Vector3(0f, gyaw, 0f));
		} catch { }
		// A label above the ghost: even while the client is still streaming the hero model in, you see where the ghost is.
		var lp = gp + new Vector3(0, 0, 150f);
		if (_ghostTag == null) _ghostTag = SpawnText("GHOST", lp, eye, 8f, 120, 190, 255);
		if (_ghostTag != null) Face(_ghostTag, lp, eye);

		if (_go) {
			_run.Update(pawn.Position, nowMs);
			var p = pawn.Position;

			// Progress along the recorded path: the nearest sample just ahead of the current progress, inside a wide corridor.
			int hi = Math.Min(_pts.Count - 1, _progress + 60);
			int bestI = _progress; float bestD = float.MaxValue;
			for (int i = _progress; i <= hi; i++) {
				float d = Vector3.Distance(new Vector3(p.X, p.Y, 0), new Vector3(_pts[i].P.X, _pts[i].P.Y, 0));
				if (d < bestD) { bestD = d; bestI = i; }
			}
			if (bestD <= Corridor && MathF.Abs(p.Z - _pts[bestI].P.Z) < 400f) _progress = Math.Max(_progress, bestI);

			while (_next < _cps.Count - 1 && _progress >= _cps[_next]) {
				double delta = ms - _pts[_cps[_next]].T;
				_lastSplit = delta <= 0 ? $"{-delta / 1000:0.0} s ahead of the ghost" : $"{delta / 1000:0.0} s behind the ghost";
				_next++;
				Kill(_marker); _marker = null;
			}

			var end = _pts[^1].P;
			float toEnd = Vector2.Distance(new Vector2(p.X, p.Y), new Vector2(end.X, end.Y));
			if (toEnd <= 280f && _progress >= (int)(_pts.Count * 0.8f)) { Finish(ms, pawn, nowMs); return; }

			var mp = _pts[_cps[Math.Min(_next, _cps.Count - 1)]].P + new Vector3(0, 0, 110f);
			string text = _next >= _cps.Count - 1 ? "FINISH" : $"> {_next + 1} / {_cps.Count}";
			if (_marker == null) _marker = SpawnText(text, mp, eye, 14f, 255, 220, 60);
			if (_marker != null) Face(_marker, mp, eye);
		}

		if (nowMs >= _hudAt || _hudCache == null) {
			_hudAt = nowMs + 200;
			var best = RouteStore.BestTime(_map, _name);
			_hudCache = new (string, byte, byte, byte)[] {
				($"ROUTE  {_name}", 255, 220, 60),
				($"Time   {Math.Max(0, ms) / 1000:0.0} s" + (best.HasValue ? $"   (best {best.Value / 1000:0.0})" : ""), 255, 160, 60),
				(_lastSplit.Length > 0 ? _lastSplit : "follow the blue ghost - or find a faster way", 150, 210, 255),
				("PARRY or R = restart", 170, 170, 170),
			};
		}
		SetHud(pawn, _hudCache);
	}

	private void Finish(double totalMs, CCitadelPlayerPawn pawn, double nowMs) {
		_done = true;
		double rec = _pts[^1].T;
		Say($"=== Route '{_name}' finished: {totalMs / 1000:0.00} s (recorded run: {rec / 1000:0.00} s) ===");
		if (totalMs < rec - 50 && _run.Points.Count > 3) {
			_run.Finish(pawn.Position, nowMs);
			var faster = _run.Points.Select(q => new RoutePoint(q.P, q.T)).ToList();
			RouteStore.Put(_map, _name, faster, _zip);
			RouteStore.SubmitTime(_map, _name, totalMs);
			Say($"NEW RECORD! You were {(rec - totalMs) / 1000:0.00} s faster than the recording - your run is now the route (the ghost will run it next time).");
		} else {
			bool best = RouteStore.SubmitTime(_map, _name, totalMs);
			Say(best ? "New personal best!" : $"Your best: {(RouteStore.BestTime(_map, _name) ?? totalMs) / 1000:0.00} s");
		}
		Ctl.HudAnnounce("ROUTE DONE", $"{totalMs / 1000:0.0} s");
		Finished = true;
	}

	public override void Stop() {
		try { PlayerPawn?.SetMoveType(MoveType.Walk); } catch { }
		Kill(_marker); Kill(_count);
		try { if (_ghost != null && _ghost.IsValid) _ghost.Remove(); } catch { }
		_ghost = null;
		base.Stop();
	}
}

/// <summary>
/// Records the player's run. Position yourself anywhere first; the first press of PARRY (or RELOAD) starts the recording, the next one
/// ends it. The plugin then shows the "save / try again / discard" menu.
/// </summary>
sealed class RecordDrill : Drill {
	public readonly RouteRecorder Rec;
	private int _edges;
	private bool _recording;
	private double _t0 = -1, _hudAt;
	private (string, byte, byte, byte)[]? _hud;

	public override string Name => "Record route";
	public override bool ReturnsToMenu => false;

	public RecordDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, RouteRecorder rec) : base(ctl, input, lvl) {
		Rec = rec;
		_edges = input.KeyEdges;
	}

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) { }

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) =>
		Say($"[Route] '{Rec.Name}': walk to where the route should START (anywhere on the map). Then press PARRY (or R) to start recording, and again at the end point.");

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		bool pressed = In.KeyEdges > _edges;
		if (pressed) _edges = In.KeyEdges;

		if (!_recording) {
			if (pressed) {
				_recording = true;
				_t0 = nowMs;
				if (!Rec.FixedStart) { Rec.StartPos = pawn.Position; Rec.StartYaw = pawn.EyeAngles.Y; }
				Rec.StartZip = RouteRecorder.OnZipline(pawn);
				if (Rec.StartZip) Say("[Route] Zipline start detected - the replay will try to put you on the zipline again.");
				Say($"[Route] RECORDING '{Rec.Name}' - run your route now. Press PARRY (or R) at the end point.");
				return;
			}
			if (nowMs >= _hudAt || _hud == null) {
				_hudAt = nowMs + 300;
				_hud = new (string, byte, byte, byte)[] {
					($"NEW ROUTE  {Rec.Name}", 255, 220, 60),
					("Go to the START point", 255, 255, 255),
					("then press PARRY (or R)", 255, 200, 120),
				};
			}
			SetHud(pawn, _hud);
			return;
		}

		Rec.Update(pawn.Position, nowMs);
		if (pressed && nowMs - _t0 > 1500) {
			Rec.Finish(pawn.Position, nowMs);
			Finished = true;
			return;
		}
		if (nowMs >= _hudAt || _hud == null) {
			_hudAt = nowMs + 200;
			_hud = new (string, byte, byte, byte)[] {
				($"RECORDING  {Rec.Name}", 255, 90, 90),
				($"Time   {(nowMs - _t0) / 1000:0.0} s", 255, 255, 255),
				("Press PARRY (or R) at the end point", 255, 200, 120),
			};
		}
		SetHud(pawn, _hud);
	}
}
