using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>One floating entry of a menu page. Yaw/Pitch are relative to the menu's centre.</summary>
sealed record MenuItem(string Id, string Label, float Yaw, float Pitch, float Size, bool Selectable, byte R = 255, byte G = 255, byte B = 255, string Desc = "");

/// <summary>The layouts of all menu pages. Ids: pg_* = go to a page, tg_* = toggle in place, lv_* = difficulty, everything else = an action.</summary>
static class MenuPages {
	private static MenuItem Title(string t) => new("title", t, 0f, -24f, 15f, false, 255, 200, 0);
	private static MenuItem Hdr(string id, string t, float yaw) => new(id, t, yaw, -13f, 12f, false, 255, 140, 40);
	private static MenuItem Btn(string id, string t, float yaw, float pitch, float size = 9f, byte r = 255, byte g = 255, byte b = 255, string d = "") => new(id, t, yaw, pitch, size, true, r, g, b, d);

	public static string BotsLabel() => $"Enemy bots: {(BotPool.Target <= 4 ? "normal (7)" : BotPool.Target <= 8 ? "more (11)" : "many (15)")}";

	public static string HeadLabel() => TrainerConfig.FlickHeadOnly ? "Head only: ON" : "Head only: OFF";

	public static List<MenuItem> Main() => new() {
		Title("DEADLOCK TRAINER"),
		Hdr("hp", "REFLEX", -33f),
		Btn("p_single", "Parry", -33f, -8f, d: "Parry ONE melee swing. Heavy and light melee are mixed - heavy is more common."),
		Btn("p_multi", "Parry x3", -33f, -3.5f, d: "Three bots swing at different times. Parry each one."),
		Btn("p_burst", "Parry Burst", -33f, 1f, d: "Short bursts of swings in a row."),
		Btn("c_counter", "Counterspell", -33f, 5.2f, 8f, 140, 200, 255, "A real enemy hero casts an ability at you. Counter it with your item at the right moment."),
		Hdr("hf", "AIM", -11f),
		Btn("f_flick", "Flick", -11f, -8f, d: "Bots appear around you - flick onto each one."),
		Btn("f_switch", "Target Switch", -11f, -3.5f, d: "Several bots at once - switch between them fast."),
		Btn("f_long", "Long Range", -11f, 1f, d: "Bots far away. Needs the long-range spots (!spot)."),
		Btn("tg_head", HeadLabel(), -11f, 5.2f, 7f, 255, 190, 120, "Only headshots count in the aim exercises."),
		Hdr("ht", "TRACK", 11f),
		Btn("t_strafe", "Strafing Target", 11f, -8f, d: "Keep your crosshair on a bot that strafes left and right."),
		Btn("t_random", "Random Target", 11f, -3.5f, d: "A bot with unpredictable movement."),
		Hdr("ho", "GAME SENSE", 33f),
		Btn("o_reaction", "Reaction", 33f, -8f, d: "Shoot as fast as you can when the signal appears."),
		Btn("pg_scen", "Scenarios", 33f, -3.5f, 9f, 255, 160, 160, "Realistic situations: fight, flee, or play around a missing enemy. Includes a shop quiz."),
		Btn("pg_routes", "Routes", 33f, 1f, d: "Record a path and race a ghost of yourself."),
		Btn("lv_easy", "EASY", -12f, 9f, d: "Slower, more forgiving."),
		Btn("lv_normal", "NORMAL", 0f, 9f, d: "The default."),
		Btn("lv_hard", "HARD", 12f, 9f, d: "Faster, stricter."),
		Btn("pg_settings", "SETTINGS", -10f, 14.5f, 6.5f, 170, 170, 170, "Bots, head-only, enemy count."),
		Btn("off", "CLOSE MENU", 10f, 14.5f, 6.5f, 170, 170, 170, "Hides the menu. Type !train to bring it back."),
	};

	public static List<MenuItem> Scenarios() {
		var l = new List<MenuItem> { Title("SCENARIOS - tick what you want to play") };
		for (int i = 0; i < ScenarioSet.Names.Length; i++)
			l.Add(Btn("tg_s" + i, ScenarioSet.Label(i), 0f, -14f + i * 4f, 7.5f, 255, 230, 160, ScenarioSet.Desc[i]));
		l.Add(Btn("sc_start", "START SCENARIOS", -14f, 11f, 9f, 120, 255, 140, "8 situations in random order from the ticked ones."));
		l.Add(Btn("sc_quiz", "SHOP / DECISION QUIZ", 14f, 11f, 8f, 120, 200, 255, "What to buy, what to do - answer by shooting."));
		l.Add(Btn("pg_main", "BACK", 0f, 16.5f, 6.5f, 170, 170, 170));
		return l;
	}

	public static List<MenuItem> Quiz(QuizQuestion q, int[] order) {
		var l = new List<MenuItem> { Title("QUIZ") };
		var lines = q.Text.Split('|');
		for (int i = 0; i < lines.Length; i++) l.Add(new("q" + i, lines[i], 0f, -17f + i * 3.5f, 7.5f, false, 255, 255, 255));
		for (int i = 0; i < order.Length; i++) l.Add(Btn("qz:" + order[i], q.Options[order[i]], 0f, -3f + i * 4.6f, 8f));
		l.Add(Btn("sc_quiz_end", "END QUIZ", 0f, 16.5f, 6.5f, 170, 170, 170));
		return l;
	}

	public static List<MenuItem> Routes(List<(string Name, string Info)> routes) {
		var l = new List<MenuItem> { Title("ROUTES") };
		if (routes.Count == 0) l.Add(new("none", "No routes yet - record your first one!", 0f, -8f, 8f, false, 200, 200, 200));
		for (int i = 0; i < routes.Count && i < 10; i++) {
			bool right = i >= 5;
			int row = right ? i - 5 : i;
			l.Add(Btn("rt:" + routes[i].Name, $"{routes[i].Name}   {routes[i].Info}", right ? 18f : -18f, -10f + row * 4.2f, 7.5f));
		}
		l.Add(Btn("rec_new", "+ RECORD NEW ROUTE", -14f, 12f, 8f, 120, 255, 140));
		if (routes.Count > 0) l.Add(Btn("pg_routes_del", "DELETE A ROUTE", 14f, 12f, 8f, 255, 130, 130));
		l.Add(Btn("pg_main", "BACK", 0f, 16.5f, 6.5f, 170, 170, 170));
		return l;
	}

	public static List<MenuItem> RoutesDelete(List<(string Name, string Info)> routes) {
		var l = new List<MenuItem> { Title("DELETE WHICH ROUTE?") };
		for (int i = 0; i < routes.Count && i < 10; i++) {
			bool right = i >= 5;
			int row = right ? i - 5 : i;
			l.Add(Btn("del:" + routes[i].Name, "DELETE  " + routes[i].Name, right ? 18f : -18f, -10f + row * 4.2f, 7.5f, 255, 130, 130));
		}
		l.Add(Btn("pg_routes", "BACK", 0f, 16.5f, 6.5f, 170, 170, 170));
		return l;
	}

	public static List<MenuItem> Attempt(double seconds) => new() {
		Title($"ROUTE RECORDED - {seconds:0.0} s"),
		Btn("att_save", "SAVE THIS ROUTE", 0f, -8f, 10f, 120, 255, 140),
		Btn("att_redo", "TRY AGAIN (back to the start)", 0f, -2f, 8f),
		Btn("att_discard", "DISCARD", 0f, 4f, 8f, 255, 130, 130),
	};

	public static List<MenuItem> Settings() => new() {
		Title("SETTINGS"),
		Btn("tg_head", HeadLabel(), 0f, -10f, 9f, 255, 190, 120),
		Btn("tg_pool", TrainerConfig.AutoSpawn ? "Automatic bots: ON" : "Automatic bots: OFF", 0f, -5.5f, 9f, 255, 190, 120),
		Btn("tg_bots", BotsLabel(), 0f, -1f, 9f, 255, 190, 120, "How many enemy bots (and heroes) are loaded. More = more variety, but a higher risk of invisible heroes."),
		new("hint1", "Training spots: walk to the place you want, type  !spot", 0f, 3f, 6.5f, false, 200, 200, 200),
		new("hint2", "and choose from the menu that appears there.", 0f, 6f, 6.5f, false, 200, 200, 200),
		Btn("pg_main", "BACK", 0f, 14f, 6.5f, 170, 170, 170),
	};

	public static List<MenuItem> Spots() => new() {
		Title("TRAINING SPOTS - HERE"),
		Btn("sp_arena", "SET TRAINING SPOT HERE", 0f, -8f, 8.5f, 120, 200, 255),
		Btn("sp_long_me", "LONG RANGE: I STAND HERE", 0f, -3.5f, 8.5f, 120, 200, 255),
		Btn("sp_long_target", "LONG RANGE: BOTS APPEAR HERE", 0f, 1f, 8.5f, 120, 200, 255),
		Btn("sp_reset", "RESET ALL SPOTS", 0f, 5.5f, 8.5f, 255, 130, 130),
		Btn("off_popup", "CLOSE", 0f, 10f, 6.5f, 170, 170, 170),
	};
}
