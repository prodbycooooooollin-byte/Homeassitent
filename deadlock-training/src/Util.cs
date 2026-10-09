using System.Diagnostics;
using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>Monotonic Uhr in Millisekunden (unabhaengig vom Tick-Raster).</summary>
static class Clock {
	private static readonly long _t0 = Stopwatch.GetTimestamp();
	public static double Ms => (Stopwatch.GetTimestamp() - _t0) * 1000.0 / Stopwatch.Frequency;
}

/// <summary>Zielgeometrie: Blickrichtung, Winkel zum Ziel, Punkte im Raum.</summary>
static class Aim {
	private const float Deg2Rad = MathF.PI / 180f;
	private const float Rad2Deg = 180f / MathF.PI;

	/// <summary>Source-2-Winkel (Pitch, Yaw, Roll in Grad) -> Blickvektor. Positiver Pitch = nach unten.</summary>
	public static Vector3 Forward(Vector3 angles) {
		float p = angles.X * Deg2Rad;
		float y = angles.Y * Deg2Rad;
		return new Vector3(MathF.Cos(p) * MathF.Cos(y), MathF.Cos(p) * MathF.Sin(y), -MathF.Sin(p));
	}

	public static Vector3 Forward(float pitchDeg, float yawDeg) => Forward(new Vector3(pitchDeg, yawDeg, 0f));

	/// <summary>Vektor nach rechts (horizontal) zu einem Yaw.</summary>
	public static Vector3 Right(float yawDeg) {
		float y = yawDeg * Deg2Rad;
		return new Vector3(MathF.Sin(y), -MathF.Cos(y), 0f);
	}

	/// <summary>
	/// Origin of the crosshair ray. Deadlock is third person, so the crosshair aims from the CAMERA, not from the hero's head;
	/// the client sends its camera position with every input command (CamState). Falls back to the head position.
	/// </summary>
	public static Vector3 Eye(CCitadelPlayerPawn pawn) {
		if (CamState.TryGetPos(pawn.EntityHandle, out var cam)) return cam;
		var e = pawn.EyePosition;
		return e == Vector3.Zero ? pawn.Position + new Vector3(0f, 0f, 64f) : e;
	}

	/// <summary>Direction of the crosshair ray (camera view angles from the client, else the pawn's eye angles).</summary>
	public static Vector3 Dir(CCitadelPlayerPawn pawn) =>
		Forward(CamState.TryGetAng(pawn.EntityHandle, out var ang) ? ang : pawn.EyeAngles);

	/// <summary>Winkel in Grad zwischen der Blickrichtung (ab eye) und dem Punkt target.</summary>
	public static float AngleTo(Vector3 eye, Vector3 forward, Vector3 target) {
		var d = target - eye;
		if (d.LengthSquared() < 1e-3f) return 0f;
		d = Vector3.Normalize(d);
		float dot = Math.Clamp(Vector3.Dot(Vector3.Normalize(forward), d), -1f, 1f);
		return MathF.Acos(dot) * Rad2Deg;
	}

	/// <summary>Winkelradius (Grad), unter dem ein Ziel mit Radius radius im Abstand dist erscheint.</summary>
	public static float AngularRadius(float radius, float dist) => MathF.Atan2(radius, MathF.Max(dist, 1f)) * Rad2Deg;

	/// <summary>Yaw in Grad der Richtung from -> to (nur XY).</summary>
	public static float YawTo(Vector3 from, Vector3 to) => MathF.Atan2(to.Y - from.Y, to.X - from.X) * Rad2Deg;
}

static class Fmt {
	public static string Ms(double ms) => $"{ms:0} ms";
	public static string Signed(double ms) => ms >= 0 ? $"+{ms:0} ms" : $"{ms:0} ms";
	public static string Pct(double num, double den) => den <= 0 ? "0%" : $"{100.0 * num / den:0}%";
}

/// <summary>Ein Schuss/Klick des Spielers, inklusive Blickrichtung im Moment des Klicks.</summary>
readonly record struct Shot(double TimeMs, Vector3 Eye, Vector3 Forward);

/// <summary>Eingabezustand eines Spielers. Wird von Plugin.OnAbilityAttempt / OnGameFrame befuellt.</summary>
sealed class PlayerInput {
	public bool AttackHeld;

	/// <summary>Parry-Fenster der Engine ist gerade aktiv (EModifierState.ParryActive).</summary>
	public bool ParryActive;
	public int ParryEdges;
	public double LastParryEdgeMs = -1;
	/// <summary>Zeitpunkte der letzten Parry-Ausloesungen (steigende Flanken), aelteste zuerst.</summary>
	public readonly List<double> ParryEdgeTimes = new();

	public readonly Queue<Shot> Shots = new();
	public int ShotsFired;

	public void RegisterParryEdge(double nowMs) {
		ParryEdges++;
		LastParryEdgeMs = nowMs;
		ParryEdgeTimes.Add(nowMs);
		if (ParryEdgeTimes.Count > 24) ParryEdgeTimes.RemoveAt(0);
	}

	public void RegisterShot(Shot s) {
		ShotsFired++;
		Shots.Enqueue(s);
		while (Shots.Count > 32) Shots.Dequeue();
	}
}

/// <summary>Persoenliche Bestwerte (nur fuer diese Server-Sitzung).</summary>
static class Records {
	private static readonly Dictionary<string, double> _best = new();

	/// <summary>Meldet einen Wert; true, wenn es ein neuer Bestwert ist (hoeher = besser, sonst niedriger = besser).</summary>
	public static bool Submit(string key, double value, bool higherIsBetter = true) {
		if (_best.TryGetValue(key, out var old) && !(higherIsBetter ? value > old : value < old))
			return false;
		_best[key] = value;
		return true;
	}

	public static double? Get(string key) => _best.TryGetValue(key, out var v) ? v : null;
}


/// <summary>The client's camera position and view angles, taken from its input commands (OnProcessUsercmds).</summary>
static class CamState {
	private sealed class Cam { public Vector3 Pos, Ang; public double PosAt = -1e9, AngAt = -1e9; }
	private static readonly Dictionary<uint, Cam> _cams = new();

	public static void SetPos(uint pawn, Vector3 pos) {
		if (!_cams.TryGetValue(pawn, out var c)) _cams[pawn] = c = new Cam();
		c.Pos = pos; c.PosAt = Clock.Ms;
	}

	public static void SetAng(uint pawn, Vector3 ang) {
		if (!_cams.TryGetValue(pawn, out var c)) _cams[pawn] = c = new Cam();
		c.Ang = ang; c.AngAt = Clock.Ms;
	}

	public static bool TryGetPos(uint pawn, out Vector3 pos) {
		pos = default;
		if (!_cams.TryGetValue(pawn, out var c) || Clock.Ms - c.PosAt > 600) return false;
		pos = c.Pos;
		return true;
	}

	public static bool TryGetAng(uint pawn, out Vector3 ang) {
		ang = default;
		if (!_cams.TryGetValue(pawn, out var c) || Clock.Ms - c.AngAt > 600) return false;
		ang = c.Ang;
		return true;
	}

	public static void Clear() => _cams.Clear();
}
