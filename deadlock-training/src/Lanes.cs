using System.Numerics;
using System.Text.Json;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>
/// Map knowledge for realistic scenarios: where the guardians/walkers/patrons (they mark the lanes) and the jungle camps stand.
/// Captured from the live map shortly after joining (before the structures are removed) and stored per map in trainer_mapdata.json.
/// </summary>
static class MapData {
	public sealed class Entry { public string D { get; set; } = ""; public int Team { get; set; } public float X { get; set; } public float Y { get; set; } public float Z { get; set; } }

	private static Dictionary<string, List<Entry>> _d = new();
	private static bool _loaded;
	private static string FilePath => Path.Combine(Environment.CurrentDirectory, "trainer_mapdata.json");

	private static void Ensure() {
		if (_loaded) return;
		_loaded = true;
		try { if (File.Exists(FilePath)) _d = JsonSerializer.Deserialize<Dictionary<string, List<Entry>>>(File.ReadAllText(FilePath)) ?? new(); } catch { _d = new(); }
	}

	public static List<Entry> Get(string map) { Ensure(); return _d.TryGetValue(map, out var l) ? l : new(); }

	/// <summary>Remember the structures and jungle camps that exist right now. Call before they are removed.</summary>
	public static void Capture(string map) {
		Ensure();
		string[] prefixes = { "npc_boss", "npc_barrack", "npc_base_defender", "npc_neutral", "npc_super_neutral" };
		var list = new List<Entry>();
		foreach (var e in Entities.All) {
			string d;
			try { d = e.DesignerName ?? ""; } catch { continue; }
			if (!prefixes.Any(d.StartsWith)) continue;
			try { var p = e.Position; list.Add(new Entry { D = d, Team = e.TeamNum, X = p.X, Y = p.Y, Z = p.Z }); } catch { }
		}
		var counts = string.Join(", ", list.GroupBy(x => x.D).Select(g => $"{g.Key} x{g.Count()}"));
		Console.WriteLine($"[Trainer] Map data captured: {list.Count} entities ({counts})");
		if (list.Count == 0) return;
		if (_d.TryGetValue(map, out var old) && old.Count > list.Count) return; // keep the fuller record
		_d[map] = list;
		try { File.WriteAllText(FilePath, JsonSerializer.Serialize(_d)); } catch { }
	}
}

/// <summary>The lanes (polylines from your side to the enemy side) and the jungle camps of a map, derived from <see cref="MapData"/>.</summary>
sealed class LaneModel {
	public sealed class Lane {
		public List<Vector3> Pts = new();
		public float[] Cum = Array.Empty<float>();
		public float Len;

		public void Finish() {
			Cum = new float[Pts.Count];
			for (int i = 1; i < Pts.Count; i++) Cum[i] = Cum[i - 1] + Vector2.Distance(new Vector2(Pts[i].X, Pts[i].Y), new Vector2(Pts[i - 1].X, Pts[i - 1].Y));
			Len = Cum.Length > 0 ? Cum[^1] : 0f;
		}

		/// <summary>Point at arc length s (units from your side).</summary>
		public Vector3 At(float s) {
			s = Math.Clamp(s, 0f, Len);
			for (int i = 1; i < Pts.Count; i++)
				if (s <= Cum[i]) {
					float u = Cum[i] > Cum[i - 1] ? (s - Cum[i - 1]) / (Cum[i] - Cum[i - 1]) : 0f;
					return Vector3.Lerp(Pts[i - 1], Pts[i], u);
				}
			return Pts[^1];
		}

		/// <summary>Yaw pointing along the lane toward the enemy at arc length s.</summary>
		public float Yaw(float s) => Aim.YawTo(At(s - 150f), At(s + 150f));
	}

	public readonly List<Lane> Lanes = new();
	public readonly List<Vector3> Camps = new();
	public bool Ok => Lanes.Count > 0;

	public static LaneModel Build(string map, Vector3 myBase, int myTeam) {
		var m = new LaneModel();
		var all = MapData.Get(map);
		var structs = all.Where(x => x.D.StartsWith("npc_boss")).ToList();
		foreach (var c in all.Where(x => x.D.StartsWith("npc_neutral") || x.D.StartsWith("npc_super_neutral"))) m.Camps.Add(new Vector3(c.X, c.Y, c.Z));
		if (structs.Count < 4) return m;

		var enemy = structs.Where(x => x.Team != myTeam && x.Team > 1).ToList();
		Vector3 enemyBase = enemy.Count > 0
			? new Vector3(enemy.Average(x => x.X), enemy.Average(x => x.Y), enemy.Average(x => x.Z))
			: structs.OrderByDescending(x => Vector2.Distance(new Vector2(x.X, x.Y), new Vector2(myBase.X, myBase.Y))).Select(x => new Vector3(x.X, x.Y, x.Z)).First();
		var axis2 = new Vector2(enemyBase.X - myBase.X, enemyBase.Y - myBase.Y);
		if (axis2.Length() < 500f) return m;
		axis2 = Vector2.Normalize(axis2);
		var perp2 = new Vector2(-axis2.Y, axis2.X);

		var proj = structs.Select(x => {
			var r = new Vector2(x.X - myBase.X, x.Y - myBase.Y);
			return (E: x, T: Vector2.Dot(r, axis2), L: Vector2.Dot(r, perp2));
		}).OrderBy(x => x.L).ToList();

		var clusters = new List<List<(MapData.Entry E, float T, float L)>>();
		foreach (var p in proj) {
			if (clusters.Count == 0 || p.L - clusters[^1][^1].L > 700f) clusters.Add(new());
			clusters[^1].Add(p);
		}
		foreach (var cl in clusters.Where(c => c.Count >= 2).OrderByDescending(c => c.Count).Take(4).OrderBy(c => c[0].L)) {
			var lane = new Lane();
			foreach (var p in cl.OrderBy(x => x.T)) lane.Pts.Add(new Vector3(p.E.X, p.E.Y, p.E.Z));
			lane.Finish();
			if (lane.Len > 1500f) m.Lanes.Add(lane);
		}
		Console.WriteLine($"[Trainer] Lane model: {m.Lanes.Count} lanes ({string.Join(", ", m.Lanes.Select(l => $"{l.Pts.Count} pts/{l.Len:0}u"))}), {m.Camps.Count} camps.");
		return m;
	}
}
