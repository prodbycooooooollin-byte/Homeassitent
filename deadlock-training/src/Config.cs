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

	/// <summary>How bots are created: Unit = the game's own "citadel_create_unit" cheat command (real hero dummy); Fake = plugin-made fake client.</summary>
	public static BotMethod BotMethod = BotMethod.Unit;
	/// <summary>Shift texts relative to their aim point (units, from the viewer's perspective). For calibration with !toffset.</summary>
	public static float TextOffsetRight = 0f;
	public static float TextOffsetUp = 0f;

	/// <summary>Hero the training bots play. null = same hero as the player (its model is guaranteed to be loaded).</summary>
	public static Heroes? BotHero = null;
	/// <summary>true = no bots, only text targets (emergency mode if bots do not work on this server).</summary>
	/// <summary>Default: no game bots (the game's bot spawn crashes the client); targets are hero-model props measured by geometry. Opt in with !tbot on.</summary>
	public static bool NoBots = false;
	/// <summary>Write the bots' view direction into memory so their melee swings point at the player.</summary>
	public static bool WriteViewAngles = true;
	/// <summary>Always draw a visible aim marker ('O') on bots, even if their model is visible.</summary>
	public static bool ShowMarkers = false;
	/// <summary>Height of the "chest" above the ground (where the aim point is).</summary>
	public static float CenterZ = 58f;

	/// <summary>Heroes that are preloaded and can be chosen as bot hero.</summary>
	public static readonly Heroes[] PrecachedHeroes = [
		Heroes.Inferno, Heroes.Wraith, Heroes.Haze, Heroes.Ghost, Heroes.Hornet, Heroes.Atlas,
		Heroes.Bebop, Heroes.Shiv, Heroes.Kelvin, Heroes.Lash, Heroes.Mirage, Heroes.Viper,
		Heroes.Gigawatt, Heroes.Dynamo,
	];

	/// <summary>The game's practice bots pick a random hero; every hero they might pick must be precached or the bot is invisible.</summary>
	public static readonly Heroes[] BotPoolHeroes = [
		Heroes.Forge, Heroes.Chrono, Heroes.Astro, Heroes.Nano, Heroes.Orion, Heroes.Krill, Heroes.Tengu, Heroes.Kali,
		Heroes.Warden, Heroes.Yamato, Heroes.Viscous, Heroes.Gunslinger, Heroes.Wrecker, Heroes.Rutger, Heroes.Synth,
		Heroes.Thumper, Heroes.Slork, Heroes.Cadence, Heroes.Vandal, Heroes.Magician, Heroes.Trapper, Heroes.Operative,
		Heroes.VampireBat, Heroes.Drifter, Heroes.Priest, Heroes.Frank, Heroes.Bookworm, Heroes.Boho, Heroes.Doorman,
		Heroes.Skyrunner, Heroes.Swan, Heroes.PunkGoat, Heroes.Druid, Heroes.Graf, Heroes.Fortuna, Heroes.Necro, Heroes.Fencer,
	];
}

enum BotMethod { Unit, Fake }

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

	// ---- Orbs (Deny / Last Hit) ----
	public static int OrbTotal(Level l) => l switch { Level.Easy => 10, Level.Normal => 16, _ => 24 };
	public static int OrbPerWave(Level l) => l switch { Level.Easy => 1, Level.Normal => 2, _ => 3 };
	public static double OrbStealMs(Level l, Random r) => (l switch { Level.Easy => 2600.0, Level.Normal => 1800.0, _ => 1200.0 }) * (0.8 + 0.4 * r.NextDouble());
	public static float OrbRadius(Level l) => l switch { Level.Easy => 30f, Level.Normal => 22f, _ => 16f };
	public static float LastHitDamage(Level l) => l switch { Level.Easy => 45f, Level.Normal => 34f, _ => 28f };
	public static (float Min, float Max) LastHitAllyDps(Level l) => l switch { Level.Easy => (12f, 18f), Level.Normal => (16f, 26f), _ => (20f, 32f) };
	public static int LastHitPerWave(Level l) => l == Level.Hard ? 2 : 1;

	// ---- Exercise area ("invisible wall") ----
	public static float LeashParry => 520f;
	public static float LeashTrack => 520f;
	public static float LeashFlick(bool longRange) => longRange ? 900f : 650f;
	public static float LeashOther => 600f;
}
