using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>Settings that can be changed in-game via chat commands.</summary>
static class TrainerConfig {
	/// <summary>Extra yaw for text entities. Default 270 = text faces the player (adjust with !tface).</summary>
	public static float TextYawOffset = 270f;
	/// <summary>Font for world text. null = default. The Deadworks examples use "Reaver" / "Radiance".</summary>
	public static string? Font = null;
	/// <summary>true: confirm menu/targets by holding the crosshair on them instead of clicking (fallback).</summary>
	public static bool Dwell = false;
	public const double DwellMs = 250;

	/// <summary>Hero the training bots play. null = same hero as the player (its model is guaranteed to be loaded).</summary>
	public static Heroes? BotHero = null;
	/// <summary>true = no bots, only text targets (emergency mode if bots do not work on this server).</summary>
	public static bool NoBots = false;
	/// <summary>Write the bots' view direction into memory so their melee swings point at the player.</summary>
	public static bool WriteViewAngles = true;
	/// <summary>Always draw a visible aim marker ('O') on bots, even if their model is visible.</summary>
	public static bool ShowMarkers = true;
	/// <summary>Height of the "chest" above the ground (where the aim point is).</summary>
	public static float CenterZ = 58f;

	/// <summary>Heroes that are preloaded and can be chosen as bot hero.</summary>
	public static readonly Heroes[] PrecachedHeroes = [
		Heroes.Inferno, Heroes.Wraith, Heroes.Haze, Heroes.Ghost, Heroes.Hornet, Heroes.Atlas,
		Heroes.Bebop, Heroes.Shiv, Heroes.Kelvin, Heroes.Lash, Heroes.Mirage, Heroes.Viper,
		Heroes.Gigawatt, Heroes.Dynamo,
	];
}

enum Level { Easy, Normal, Hard }

static class LevelParse {
	public static Level Parse(string? s, Level fallback = Level.Normal) => (s ?? "").Trim().ToLowerInvariant() switch {
		"e" or "easy" or "leicht" or "1" => Level.Easy,
		"n" or "normal" or "mittel" or "medium" or "2" => Level.Normal,
		"h" or "hard" or "schwer" or "3" => Level.Hard,
		_ => fallback,
	};

	public static string Label(Level l) => l switch { Level.Easy => "easy", Level.Hard => "hard", _ => "normal" };
}

/// <summary>All difficulty numbers in one place.</summary>
static class Tuning {
	private static double Lerp(double a, double b, Random r) => a + (b - a) * r.NextDouble();

	// ---- Parry ----
	public static double ParryTelegraphMs(Level l) => l switch { Level.Easy => 900, Level.Normal => 450, _ => 0 };
	public static double ParryGapMs(Level l, Random r) => l switch {
		Level.Easy => Lerp(1800, 3200, r), Level.Normal => Lerp(1200, 3000, r), _ => Lerp(700, 3200, r) };
	public static double ParrySimWindupMs(Level l, Random r) => l switch {
		Level.Easy => 700, Level.Normal => 500, _ => Lerp(300, 550, r) };
	public static int ParryBurstSize(Level l) => l switch { Level.Easy => 3, Level.Normal => 4, _ => 5 };
	public static double ParryBurstSpacingMs(Level l, Random r) => l switch {
		Level.Easy => Lerp(1300, 1700, r), Level.Normal => Lerp(1000, 1400, r), _ => Lerp(800, 1200, r) };

	// ---- Flick ----
	public static int FlickCount(Level l) => l switch { Level.Easy => 12, Level.Normal => 20, _ => 25 };
	public static double FlickTimeoutMs(Level l) => l switch { Level.Easy => 3500, Level.Normal => 2200, _ => 1400 };
	public static (float Min, float Max) FlickYaw(Level l) => l switch { Level.Easy => (20f, 45f), Level.Normal => (25f, 75f), _ => (30f, 130f) };
	public static (float Min, float Max) FlickDist(Level l) => l switch { Level.Easy => (450f, 650f), Level.Normal => (500f, 900f), _ => (600f, 1100f) };
	public static float FlickStrafeSpeed(Level l) => l switch { Level.Easy => 0f, Level.Normal => 60f, _ => 150f };

	// ---- Tracking ----
	public static float TrackSpeed(Level l) => l switch { Level.Easy => 140f, Level.Normal => 240f, _ => 360f };
	public static float TrackRadius(Level l) => l switch { Level.Easy => 38f, Level.Normal => 30f, _ => 24f };

	// ---- Reaction ----
	public static int ReactionRounds(Level l) => l switch { Level.Easy => 5, Level.Normal => 8, _ => 10 };
	public static (double Min, double Max) ReactionDelayMs(Level l) => l switch { Level.Easy => (2000, 4000), Level.Normal => (1200, 3500), _ => (700, 3000) };
}
