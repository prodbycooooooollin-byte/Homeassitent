using System.Numerics;
using System.Text.Json;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>
/// Arena = the place you are teleported to from the menu. Either set by you with !tarena
/// (stored per map in trainer_arenas.json next to the plugin DLL) or found automatically with raycasts:
/// open ground, no roof, plenty of room in all directions.
/// </summary>
static class Arena {
	private static readonly Dictionary<string, float[]> _saved = new();

	private static string FilePath =>
		Path.Combine(Path.GetDirectoryName(typeof(Arena).Assembly.Location) ?? ".", "trainer_arenas.json");

	public static void Load() {
		try {
			if (!File.Exists(FilePath)) return;
			var d = JsonSerializer.Deserialize<Dictionary<string, float[]>>(File.ReadAllText(FilePath));
			_saved.Clear();
			if (d != null) foreach (var (k, v) in d) if (v.Length == 3) _saved[k] = v;
		} catch (Exception ex) {
			Console.WriteLine($"[Trainer] Arena file not readable: {ex.Message}");
		}
	}

	private static void Save() {
		try { File.WriteAllText(FilePath, JsonSerializer.Serialize(_saved)); }
		catch (Exception ex) { Console.WriteLine($"[Trainer] Arena file not writable: {ex.Message}"); }
	}

	public static void Set(string map, Vector3 p) {
		_saved[map] = [p.X, p.Y, p.Z];
		Save();
	}

	public static bool Reset(string map) {
		bool had = _saved.Remove(map);
		if (had) Save();
		return had;
	}

	public static bool TryGet(string map, out Vector3 p) {
		if (_saved.TryGetValue(map, out var v)) { p = new Vector3(v[0], v[1], v[2]); return true; }
		p = default;
		return false;
	}

	private const float ProbeLen = 900f;

	/// <summary>
	/// Searches around origin for an open spot: ground, no roof, as much room as possible in all directions.
	/// Two passes (strict, then looser). Returns null if nothing was found.
	/// </summary>
	public static Vector3? Find(Vector3 origin, CBaseEntity? ignore) {
		foreach (float minClear in new[] { 700f, 450f, 300f }) {
			Vector3? best = null;
			float bestScore = float.MinValue;
			float bestClear = 0;

			foreach (float r in new[] { 450f, 800f, 1200f, 1700f, 2300f, 3000f, 3800f, 5000f, 6500f }) {
				for (int i = 0; i < 24; i++) {
					float a = i * (MathF.PI / 12f);
					var x = origin.X + MathF.Cos(a) * r;
					var y = origin.Y + MathF.Sin(a) * r;

					// Boden suchen (von oben nach unten).
					var down = Trace.Ray(new Vector3(x, y, origin.Z + 400f), new Vector3(x, y, origin.Z - 700f), InteractionLayer.Solid, ignore);
					if (!down.DidHit || down.Trace.StartInSolid) continue;
					var ground = down.HitPosition;
					if (MathF.Abs(ground.Z - origin.Z) > 500f) continue;

					// Freier Himmel / hohe Decke.
					var up = Trace.Ray(ground + new Vector3(0, 0, 10), ground + new Vector3(0, 0, 450), InteractionLayer.Solid, ignore);
					if (up.DidHit) continue;

					// Platz in 12 Richtungen auf Brusthoehe.
					float clear = float.MaxValue;
					var chest = ground + new Vector3(0, 0, 60);
					for (int k = 0; k < 12; k++) {
						float b = k * (MathF.PI / 6f);
						var dir = new Vector3(MathF.Cos(b), MathF.Sin(b), 0f);
						var h = Trace.Ray(chest, chest + dir * ProbeLen, InteractionLayer.Solid, ignore);
						clear = MathF.Min(clear, h.Fraction * ProbeLen);
					}
					if (clear < minClear) continue;

					// Boden muss ungefaehr eben sein: vier Punkte rundum auf gleicher Hoehe.
					bool flat = true;
					for (int k = 0; k < 4 && flat; k++) {
						float b = k * (MathF.PI / 2f);
						var px = ground.X + MathF.Cos(b) * 150f;
						var py = ground.Y + MathF.Sin(b) * 150f;
						var g = Trace.Ray(new Vector3(px, py, ground.Z + 60f), new Vector3(px, py, ground.Z - 120f), InteractionLayer.Solid, ignore);
						if (!g.DidHit || MathF.Abs(g.HitPosition.Z - ground.Z) > 30f) flat = false;
					}
					if (!flat) continue;

					float score = clear - r * 0.04f;
					if (score > bestScore) { bestScore = score; best = ground + new Vector3(0, 0, 12); bestClear = clear; }
				}
			}
			if (best != null) {
				Console.WriteLine($"[Trainer] Arena found at ({best.Value.X:0},{best.Value.Y:0},{best.Value.Z:0}), room ~{bestClear:0} (threshold {minClear:0})");
				return best;
			}
		}
		Console.WriteLine("[Trainer] No open arena found (traces returned nothing suitable).");
		return null;
	}
}
