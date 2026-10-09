using System.Numerics;
using System.Text.Json;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>
/// Arena = Ort, an den du aus dem Menue heraus teleportiert wirst. Entweder von dir mit !tarena gesetzt
/// (wird pro Map in trainer_arenas.json neben der Plugin-DLL gespeichert) oder automatisch per Raycasts gesucht:
/// freier Boden, kein Dach, mindestens ~6,5 m Platz in alle Richtungen.
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
			Console.WriteLine($"[Trainer] Arena-Datei nicht lesbar: {ex.Message}");
		}
	}

	private static void Save() {
		try { File.WriteAllText(FilePath, JsonSerializer.Serialize(_saved)); }
		catch (Exception ex) { Console.WriteLine($"[Trainer] Arena-Datei nicht schreibbar: {ex.Message}"); }
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

	private const float MinClear = 650f;
	private const float ProbeLen = 900f;

	/// <summary>Sucht rund um origin einen freien, ebenen Platz. null, wenn nichts Passendes gefunden wurde.</summary>
	public static Vector3? Find(Vector3 origin, CBaseEntity? ignore) {
		Vector3? best = null;
		float bestScore = float.MinValue;

		foreach (float r in new[] { 500f, 900f, 1400f, 2000f, 2800f }) {
			for (int i = 0; i < 16; i++) {
				float a = i * (MathF.PI / 8f);
				var xy = new Vector3(origin.X + MathF.Cos(a) * r, origin.Y + MathF.Sin(a) * r, 0f);

				// Boden finden.
				var down = Trace.Ray(new Vector3(xy.X, xy.Y, origin.Z + 300f), new Vector3(xy.X, xy.Y, origin.Z - 500f),
					InteractionLayer.Solid, ignore);
				if (!down.DidHit || down.Trace.StartInSolid) continue;
				var ground = down.HitPosition;
				if (MathF.Abs(ground.Z - origin.Z) > 250f) continue; // ungefaehr gleiche Hoehe wie das Menue

				// Kein Dach / keine niedrige Decke.
				var up = Trace.Ray(ground + new Vector3(0, 0, 10), ground + new Vector3(0, 0, 500), InteractionLayer.Solid, ignore);
				if (up.DidHit) continue;

				// Platz in 8 Richtungen auf Brusthoehe.
				float clear = float.MaxValue;
				var chest = ground + new Vector3(0, 0, 60);
				for (int k = 0; k < 8; k++) {
					float b = k * (MathF.PI / 4f);
					var dir = new Vector3(MathF.Cos(b), MathF.Sin(b), 0f);
					var h = Trace.Ray(chest, chest + dir * ProbeLen, InteractionLayer.Solid, ignore);
					clear = MathF.Min(clear, h.Fraction * ProbeLen);
				}
				if (clear < MinClear) continue;

				float score = clear - r * 0.05f; // viel Platz gut, nah dran leicht besser
				if (score > bestScore) { bestScore = score; best = ground + new Vector3(0, 0, 12); }
			}
		}
		return best;
	}
}
