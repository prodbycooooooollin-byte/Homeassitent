using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>Remembers recently spawned entities so a unit created by a game command can be found and adopted.</summary>
static class SpawnWatch {
	public sealed record Seen(CBaseEntity Entity, string Designer, double At);

	private static readonly List<Seen> _seen = new();
	/// <summary>Log every spawned entity to the server window (for diagnostics, enabled while a bot is requested).</summary>
	public static bool Log;

	public static void Record(CBaseEntity e) {
		double now = Clock.Ms;
		string d;
		try { d = e.DesignerName ?? ""; } catch { d = ""; }
		_seen.Add(new Seen(e, d, now));
		if (_seen.Count > 600) _seen.RemoveRange(0, _seen.Count - 600);
		if (_seen.Count > 0 && now - _seen[0].At > 12000) _seen.RemoveAll(s => now - s.At > 12000);
		if (Log && (d.StartsWith("npc_") || d == "player" || d.Contains("hero") || d.Contains("pawn") || d.Contains("unit") || d.Contains("bot")))
			Console.WriteLine($"[Trainer/Spawn] {d} idx={e.EntityIndex}");
	}

	public static List<Seen> Since(double t) => _seen.Where(s => s.At >= t).ToList();
}

/// <summary>
/// Bookkeeping for the training bots. A bot is a real hero: either created by the game's own cheat command
/// <c>citadel_create_unit</c> (default) or as a plugin-made fake client (fallback). It has real hitboxes; the plugin
/// drives its position, view direction and (for pawns) its melee attacks.
/// </summary>
static class TrainerBots {
	private static readonly HashSet<int> _slots = new();
	private static readonly Dictionary<int, (int Team, Heroes Hero)> _wanted = new();
	private static readonly HashSet<int> _configured = new();

	public static string LastError = "";
	/// <summary>When to switch cheats off again after a unit command (Clock.Ms), or -1.</summary>
	public static double CheatsOffAt = -1;

	public static bool IsBotSlot(int slot) => _slots.Contains(slot);

	/// <summary>A controller that belongs to an adopted unit (created by a game command).</summary>
	public static void Adopt(int slot) => _slots.Add(slot);

	/// <summary>Does the game have the unit-spawn command?</summary>
	public static bool UnitCommandExists() {
		try { return Server.EnumerateConCommands().Any(c => c.Name.Equals("citadel_create_unit", StringComparison.OrdinalIgnoreCase)); }
		catch { return false; }
	}

	/// <summary>Ask the game to spawn a hero dummy in front of the player (needs cheats, switched on briefly).</summary>
	/// <summary>Spawn one game practice bot from the server (a real player-like bot). Experimental: it used to crash the client while it sat at the world origin.</summary>
	public static void RequestPractice(int count) {
		SpawnWatch.Log = true;
		Console.WriteLine($"[Trainer] Requesting {count} practice bot(s) (automatic mode)");
		try {
			Server.ExecuteCommand("sv_cheats 1");
			Server.ExecuteCommand("citadel_bot_test_mode 1");
			Server.ExecuteCommand("citadel_spawn_practice_bots 0");
			Server.ExecuteCommand($"citadel_spawn_practice_bots_count {Math.Clamp(count, 1, 8)}");
			Server.ExecuteCommand("citadel_spawn_practice_bots 1");
			CheatsOffAt = Clock.Ms + 2500;
		} catch (Exception ex) { LastError = ex.Message; }
	}

	private static readonly List<(double At, int Slot, string Cmd)> _queue = new();
	private static readonly List<(double At, string Cmd)> _cmds = new();
	private static double _lastPrompt;

	/// <summary>Run a server console command after delayMs.</summary>
	public static void Schedule(double delayMs, string cmd) => _cmds.Add((Clock.Ms + delayMs, cmd));

	/// <summary>
	/// citadel_create_unit only works when the PLAYER runs it from their own console (the server cannot send it: the client
	/// rejects commands from the server that lack the right flag, and from the server console it spawns nothing).
	/// So the plugin keeps cheats on and tells the player to press a key bound to the command; the new unit is adopted.
	/// </summary>
	public static void RequestUnit(CCitadelPlayerController ctl, Heroes hero) {
		SpawnWatch.Log = true;
		try {
			Server.ExecuteCommand("sv_cheats 1");
			CheatsOffAt = Clock.Ms + 120000;
			if (Clock.Ms - _lastPrompt > 4000) {
				_lastPrompt = Clock.Ms;
				Chat.PrintToChat(ctl, "[Training] Press KP_PLUS (numpad +) to spawn each target bot. (One-time setup in the console: bind kp_plus \"citadel_create_unit my_hero\")");
			}
		} catch (Exception ex) {
			LastError = ex.Message;
		}
	}

	/// <summary>Send queued unit commands to the player's client once cheats are on.</summary>
	public static void Pump(double nowMs) {
		for (int j = 0; j < _cmds.Count; j++) {
			if (nowMs < _cmds[j].At) continue;
			var c = _cmds[j]; _cmds.RemoveAt(j--);
			try { Server.ExecuteCommand(c.Cmd); } catch { }
		}
		for (int i = 0; i < _queue.Count; i++) {
			var q = _queue[i];
			if (nowMs < q.At) continue;
			_queue.RemoveAt(i--);
			try { Server.ClientCommand(q.Slot, q.Cmd); }
			catch (Exception ex) { LastError = ex.Message; }
		}
	}

	/// <summary>Creates a plugin-made fake client. Returns its slot or -1.</summary>
	public static int Create(int team, Heroes hero, string name) {
		int slot;
		try { slot = Server.CreateFakeClient(name); }
		catch (Exception ex) { LastError = ex.Message; return -1; }
		if (slot < 0) {
			LastError = "CreateFakeClient returned -1 (no free slot)";
			return -1;
		}
		_slots.Add(slot);
		_wanted[slot] = (team, hero);
		Configure(slot);
		return slot;
	}

	/// <summary>Set team and hero. Tried right after creation and again on FullConnect.</summary>
	public static void Configure(int slot) {
		if (_configured.Contains(slot) || !_wanted.TryGetValue(slot, out var w)) return;
		var ctl = Players.FromSlot(slot);
		if (ctl == null) return;
		_configured.Add(slot);
		try {
			ctl.ChangeTeam(w.Team);
			ctl.SelectHero(w.Hero);
		} catch (Exception ex) {
			LastError = ex.Message;
			_configured.Remove(slot);
		}
	}

	public static void Remove(int slot) {
		if (!_slots.Remove(slot)) return;
		_wanted.Remove(slot);
		_configured.Remove(slot);
		try { Server.Kick(slot); } catch { /* already gone */ }
	}

	/// <summary>The engine already removed the slot; only clean up our bookkeeping.</summary>
	public static void Forget(int slot) {
		_slots.Remove(slot);
		_wanted.Remove(slot);
		_configured.Remove(slot);
	}

	public static void ClearAll() {
		foreach (var s in _slots.ToArray()) Remove(s);
	}
}


/// <summary>
/// Bot units the player spawned once with their own key (citadel_create_unit cannot be run by the server). The plugin keeps
/// them for the whole session: they are lent to the exercises and parked in the hub in between.
/// </summary>
static class BotPool {
	public static int Target = 4;
	public static bool Active;

	private static readonly List<uint> _all = new();
	private static readonly List<uint> _free = new();
	private static double _lastScanAt, _lastPromptAt, _lastReviveAt, _autoRequestAt, _autoNextAt;
	private static readonly HashSet<int> _knownSlots = new();
	private static readonly List<int> _pendingCtl = new();
	private static bool _autoWaiting;
	private static int _autoTries;
	private static Vector3 _park;

	// ---- crash guard: if the game client crashed while bots were being spawned, automatic spawning stays off until re-enabled ----
	private static string StatePath => Path.Combine(Environment.CurrentDirectory, "trainer_auto_state.txt");
	private static double _guardArmedAt;
	public static string? GuardNotice;

	/// <summary>Called when the plugin loads.</summary>
	public static void GuardLoad() {
		try {
			if (!File.Exists(StatePath)) return;
			string st = File.ReadAllText(StatePath).Trim();
			if (st == "spawning" || st == "disabled") {
				File.WriteAllText(StatePath, "disabled");
				TrainerConfig.AutoSpawn = false;
				GuardNotice = st == "spawning"
					? "Automatic bot spawning crashed the game last time, so it is switched off. Use your key, or try again with !tbot auto on."
					: "Automatic bot spawning is switched off (it crashed before). Use your key, or try again with !tbot auto on.";
				Console.WriteLine("[Trainer] " + GuardNotice);
			}
		} catch { }
	}

	public static void GuardClear() { try { if (File.Exists(StatePath)) File.Delete(StatePath); } catch { } }

	private static void GuardArm(double nowMs) {
		if (_guardArmedAt > 0) return;
		_guardArmedAt = nowMs;
		try { File.WriteAllText(StatePath, "spawning"); } catch { }
	}

	/// <summary>Controllers of the pooled bots (for hero changes).</summary>
	public static List<CCitadelPlayerController> Controllers() {
		var list = new List<CCitadelPlayerController>();
		foreach (var h in _all) {
			try { var p = CBaseEntity.FromHandle(h)?.As<CCitadelPlayerPawn>(); if (p?.Controller is { } c) list.Add(c); } catch { }
		}
		return list;
	}

	public static int Count => _all.Count;
	public static int FreeCount => _free.Count;

	public static bool Take(out uint handle) {
		handle = CBaseEntity.InvalidEntityHandle;
		while (_free.Count > 0) {
			uint h = _free[0];
			_free.RemoveAt(0);
			var e = CBaseEntity.FromHandle(h);
			if (e == null || !e.IsValid) { _all.Remove(h); continue; }
			handle = h;
			return true;
		}
		return false;
	}

	public static void Release(uint handle) {
		if (!_all.Contains(handle)) return;
		try {
			var e = CBaseEntity.FromHandle(handle);
			if (e != null && e.IsValid) e.Teleport(position: _park, velocity: Vector3.Zero);
		} catch { }
		if (!_free.Contains(handle)) _free.Add(handle);
	}

	public static void Clear() { _all.Clear(); _free.Clear(); _autoTries = 0; _autoWaiting = false; _pendingCtl.Clear(); }
	public static void ResetAuto() { _autoTries = 0; _autoNextAt = 0; }

	/// <summary>Called every frame with the human player's controller.</summary>
	public static void Update(double nowMs, CCitadelPlayerController? human) {
		if (human == null || !TrainerConfig.UsePool) return;
		var pawn = human.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) return;
		if (Active || _autoWaiting || _pendingCtl.Count > 0) _park = pawn.Position - Aim.Forward(0f, pawn.EyeAngles.Y) * 450f;

		// Survived 25 s after the first spawn request: no crash, drop the marker.
		if (_guardArmedAt > 0 && nowMs - _guardArmedAt > 25000) { _guardArmedAt = -1; GuardClear(); }

		// Automatic mode (experimental): the server spawns practice bots and moves each one next to the player in the very frame
		// it appears, before the client ever sees it at the world origin.
		if (TrainerConfig.AutoSpawn) {
			if (_autoWaiting) {
				foreach (var c in Players.GetAllControllers()) {
					int sl = c.EntityIndex - 1;
					if (_knownSlots.Contains(sl)) continue;
					_knownSlots.Add(sl);
					TrainerBots.Adopt(sl);
					_pendingCtl.Add(sl);
					Console.WriteLine($"[Trainer] Auto bot controller in slot {sl}; moving its pawn next to you.");
				}
				if (_autoWaiting && nowMs - _autoRequestAt > 10000) { _autoWaiting = false; Console.WriteLine($"[Trainer] Auto mode: request finished, {_all.Count}/{Target} bots ready."); }
			}
			foreach (var sl in _pendingCtl.ToArray()) {
				var c = Players.FromSlot(sl);
				var bp = c?.GetHeroPawn();
				if (c == null) { _pendingCtl.Remove(sl); continue; }
				if (bp == null || !bp.IsValid) continue;
				try {
					bp.Teleport(position: _park, velocity: Vector3.Zero);
					if (bp.TeamNum == pawn.TeamNum) c.ChangeTeam(pawn.TeamNum == 2 ? 3 : 2);
					_pendingCtl.Remove(sl);
					_all.Add(bp.EntityHandle);
					_free.Add(bp.EntityHandle);
					Console.WriteLine($"[Trainer] Auto bot {_all.Count}/{Target} ready next to you (entity {bp.EntityIndex}, model '{bp.ModelName}').");
					Chat.PrintToChat(human, $"[Training] Bot {_all.Count}/{Target} ready.");
				} catch { }
			}
			if (Active && !_autoWaiting && _pendingCtl.Count == 0 && _all.Count < Target && nowMs >= _autoNextAt && _autoTries < 3) {
				_autoTries++;
				_knownSlots.Clear();
				foreach (var c in Players.GetAllControllers()) _knownSlots.Add(c.EntityIndex - 1);
				_autoWaiting = true;
				_autoRequestAt = nowMs;
				_autoNextAt = nowMs + 12000;
				GuardArm(nowMs);
				TrainerBots.RequestPractice(Target - _all.Count);
			}
		}

		// Keep the pooled bots alive: base defenders shoot enemy-team units standing in the hub.
		foreach (var h in _all.ToArray()) {
			try {
				var e = CBaseEntity.FromHandle(h);
				if (e == null || !e.IsValid) { _all.Remove(h); _free.Remove(h); continue; }
				if (e.Health <= 0 || !e.IsAlive) {
					if (nowMs - _lastReviveAt > 1500) {
						_lastReviveAt = nowMs;
						e.As<CCitadelPlayerPawn>()?.ForceRespawn();
						Console.WriteLine($"[Trainer] Pool bot {e.EntityIndex} was dead: respawning it.");
					}
				} else if (e.Health < e.MaxHealth) {
					e.Health = e.MaxHealth;
				}
			} catch { }
		}

		// New units the player spawned: a hero pawn without a human controller, near the player.
		foreach (var seen in SpawnWatch.Since(nowMs - 11000)) {
			var e = seen.Entity;
			try {
				if (!e.IsValid || e.EntityHandle == pawn.EntityHandle || _all.Contains(e.EntityHandle)) continue;
				if (!e.Is<CCitadelPlayerPawn>() || e.Health <= 0) continue;
				var p = e.As<CCitadelPlayerPawn>();
				var ctl = p?.Controller;
				if (ctl != null && !ctl.IsBot) continue;
				if (Vector3.Distance(e.Position, pawn.Position) > 2500f) continue;
				e.TeamNum = pawn.TeamNum == 2 ? 3 : 2;
				_all.Add(e.EntityHandle);
				_free.Add(e.EntityHandle);
				Console.WriteLine($"[Trainer] Pool: bot {_all.Count}/{Target} adopted (entity {e.EntityIndex}, model '{e.ModelName}').");
				Chat.PrintToChat(human, $"[Training] Bot {_all.Count}/{Target} ready." + (_all.Count >= Target ? " That is enough - the exercises use them now." : ""));
				if (_all.Count >= Target) { try { Server.ExecuteCommand("sv_cheats 0"); } catch { } TrainerBots.CheatsOffAt = -1; }
			} catch { }
		}
		_lastScanAt = nowMs;

		if (!TrainerConfig.AutoSpawn && Active && _all.Count < Target && nowMs - _lastPromptAt > 25000) {
			_lastPromptAt = nowMs;
			try { Server.ExecuteCommand("sv_cheats 1"); } catch { }
			TrainerBots.CheatsOffAt = -1;
			SpawnWatch.Log = true;
			Chat.PrintToChat(human, $"[Training] Bots: press NUMPAD + {Target - _all.Count} time(s) to spawn them (once per session; setup in the console: bind kp_plus \"citadel_create_unit my_hero\"). Without bots the exercises use static models.");
		}
	}
}

/// <summary>One figure in a drill: a bot (if possible) and/or a text marker.</summary>
sealed class Actor {
	public BotMethod Method { get; private set; }
	public int Slot { get; private set; } = -1;
	public Heroes Hero { get; }
	public CPointWorldText? Marker;
	public Vector3 Feet;
	public double CreatedAtMs;

	/// <summary>The drill wants a bot here (true until it is given up).</summary>
	public bool Wants { get; private set; }

	private uint _raw = CBaseEntity.InvalidEntityHandle;
	private readonly HashSet<int> _known = new();
	private int _playerSlot, _playerTeam, _enemyTeam;
	private uint _playerPawn = CBaseEntity.InvalidEntityHandle;
	private double _requestAt;
	private bool _fellBack;
	private static readonly HashSet<uint> _usedUnits = new();
	private int _recoverStep;
	private double _heroAt = -1;

	private Actor(Heroes hero, Vector3 feet, double nowMs) {
		Hero = hero;
		Feet = feet;
		CreatedAtMs = nowMs;
	}

	public bool Pooled { get; private set; }

	public static Actor Create(CCitadelPlayerController playerCtl, CCitadelPlayerPawn player, Heroes hero, Vector3 feet, double nowMs) {
		var a = new Actor(hero, feet, nowMs) {
			_playerSlot = playerCtl.EntityIndex - 1,
			_playerTeam = player.TeamNum,
			_enemyTeam = player.TeamNum == 2 ? 3 : 2,
			_playerPawn = player.EntityHandle,
		};
		if (TrainerConfig.UsePool) {
			if (BotPool.Take(out uint pooled)) {
				a._raw = pooled;
				a.Pooled = true;
				a.Method = BotMethod.Unit;
				a.Wants = true;
				return a;
			}
			return a; // no pooled bot: the exercise uses static stand-ins
		}
		if (TrainerConfig.NoBots) {
			if (TrainerConfig.UseTroopers && a.TryAdoptTrooper(a._enemyTeam, player.Position)) a.Wants = true;
			return a;
		}
		a.Wants = true;

		if (TrainerConfig.BotMethod == BotMethod.Unit) {
			a.Method = BotMethod.Unit;
			foreach (var c in Players.GetAllControllers()) a._known.Add(c.EntityIndex - 1);
			a._requestAt = nowMs;
			// Team argument: the game's own names; if the unit lands on our team, the team is corrected after adoption.
			TrainerBots.RequestUnit(playerCtl, hero);
		} else {
			if (TrainerConfig.BotMethod == BotMethod.Unit) Console.WriteLine("[Trainer] citadel_create_unit is not available on this server; using fake clients.");
			a.StartFake();
		}
		return a;
	}

	// ---- borrowed trooper NPCs --------------------------------------------------------------------------------------

	private static readonly HashSet<uint> _usedNpcs = new();
	private Vector3 _npcOrigin;
	private int _npcTeam;

	/// <summary>Take a living trooper NPC of the map as target: it has a health bar, damage numbers and animations. Returns false if none exists.</summary>
	private bool TryAdoptTrooper(int enemyTeam, Vector3 near) {
		try {
			CBaseEntity? best = null;
			float bestD = float.MaxValue;
			foreach (var e in Entities.All) {
				string d;
				try { d = e.DesignerName ?? ""; } catch { continue; }
				if (!d.StartsWith("npc_trooper") || _usedNpcs.Contains(e.EntityHandle)) continue;
				if (!e.IsValid || e.Health <= 0) continue;
				float dist = Vector3.Distance(e.Position, near);
				if (dist < bestD) { bestD = dist; best = e; }
			}
			if (best == null) return false;
			_raw = best.EntityHandle;
			_usedNpcs.Add(_raw);
			_npcOrigin = best.Position;
			_npcTeam = best.TeamNum;
			best.TeamNum = enemyTeam;
			Method = BotMethod.Npc;
			Console.WriteLine($"[Trainer] Borrowed trooper idx {best.EntityIndex} as target (model '{best.ModelName}').");
			return true;
		} catch (Exception ex) {
			Console.WriteLine($"[Trainer] Could not borrow a trooper: {ex.Message}");
			return false;
		}
	}

	private void ReleaseNpc() {
		if (Method != BotMethod.Npc || _raw == CBaseEntity.InvalidEntityHandle) return;
		try {
			var e = CBaseEntity.FromHandle(_raw);
			if (e != null && e.IsValid) {
				e.TeamNum = _npcTeam;
				e.Teleport(position: _npcOrigin);
			}
		} catch { }
		_usedNpcs.Remove(_raw);
		_raw = CBaseEntity.InvalidEntityHandle;
	}

	private void StartFake() {
		Method = BotMethod.Fake;
		Slot = TrainerBots.Create(_enemyTeam, Hero, "Trainer");
		if (Slot < 0) Wants = false;
	}

	// ---- the bot's entity ------------------------------------------------------------------------------------------

	public CBaseEntity? Ent {
		get {
			try {
				if (Slot >= 0) return Players.FromSlot(Slot)?.GetHeroPawn();
				return _raw != CBaseEntity.InvalidEntityHandle ? CBaseEntity.FromHandle(_raw) : null;
			} catch { return null; }
		}
	}

	public CCitadelPlayerPawn? Pawn {
		get {
			try {
				if (Slot >= 0) return Players.FromSlot(Slot)?.GetHeroPawn();
				return Ent?.As<CCitadelPlayerPawn>();
			} catch { return null; }
		}
	}

	/// <summary>The bot exists and is alive.</summary>
	public bool BotReady {
		get {
			var e = Ent;
			try { return e != null && e.IsValid && e.Health > 0; }
			catch { return false; }
		}
	}

	public string ModelName {
		get {
			try { return Ent?.ModelName ?? ""; }
			catch { return ""; }
		}
	}

	/// <summary>The entity has a model (an empty name means the hero data did not load - it would be invisible).</summary>
	public bool HasModel => !string.IsNullOrEmpty(ModelName);

	public Vector3 Center => Feet + new Vector3(0, 0, TrainerConfig.CenterZ);

	// ---- acquiring the bot -----------------------------------------------------------------------------------------

	/// <summary>Called every frame while the drill waits for its bots: adopts a spawned unit, falls back, repairs.</summary>
	public void Poll(double nowMs) {
		if (!Wants) return;
		if (_heroAt > 0 && nowMs >= _heroAt && Slot >= 0) {
			_heroAt = -1;
			try { Players.FromSlot(Slot)?.SelectHero(Hero); Console.WriteLine($"[Trainer] Bot hero set to {Hero}"); }
			catch (Exception ex) { Console.WriteLine($"[Trainer] Bot SelectHero failed: {ex.Message}"); }
		}

		if (Method == BotMethod.Unit && Slot < 0 && _raw == CBaseEntity.InvalidEntityHandle) {
			TryAdoptUnit();
			if (Slot < 0 && _raw == CBaseEntity.InvalidEntityHandle && nowMs - _requestAt > 60000 && !_fellBack) {
				_fellBack = true;
				Console.WriteLine("[Trainer] The unit command produced no unit; using model props instead.");
				var seen = SpawnWatch.Since(_requestAt - 4000).Select(s => s.Designer).Where(d => d.Length > 0).Distinct().Take(15);
				Console.WriteLine($"[Trainer] Entities spawned meanwhile: {string.Join(", ", seen)}");
				Wants = false;
			}
		}
		if (Slot >= 0 && Method == BotMethod.Fake && BotReady && !HasModel) Recover(nowMs);
	}

	private void TryAdoptUnit() {
		// 1) a new player controller (the unit is a real player-like bot)
		foreach (var c in Players.GetAllControllers()) {
			int s = c.EntityIndex - 1;
			if (s == _playerSlot || _known.Contains(s) || TrainerBots.IsBotSlot(s)) continue;
			Slot = s;
			TrainerBots.Adopt(s);
			Console.WriteLine($"[Trainer] Adopted unit in player slot {s}.");
			try {
				var pawn = c.GetHeroPawn();
				if (pawn != null && pawn.TeamNum == _playerTeam) c.ChangeTeam(_enemyTeam);
			} catch { }
			// The practice bot picked a random hero whose model the client may not have loaded (invisible, and loading it
			// mid-game crashed the client). Switch it to our hero, whose resources are precached.
			// (switching the bot's hero right after the spawn is disabled: the one run that worked did not do it)
			return;
		}

		// 2) a new pawn or NPC entity near the player (a unit without a controller)
		var player = CBaseEntity.FromHandle(_playerPawn);
		if (player == null) return;
		var ppos = player.Position;
		foreach (var seen in SpawnWatch.Since(_requestAt - 4000)) {
			var e = seen.Entity;
			try {
				if (!e.IsValid || e.EntityHandle == _playerPawn) continue;
				bool isPawn = e.Is<CCitadelPlayerPawn>();
				bool npc = seen.Designer.StartsWith("npc_") && !new[] { "npc_trooper", "npc_boss", "npc_neutral", "npc_super", "npc_barrack", "npc_base", "npc_player_bot_brain" }.Any(seen.Designer.StartsWith);
				if (!isPawn && !npc) continue;
				if (_usedUnits.Contains(e.EntityHandle)) continue;
				if (e.Health <= 0) continue;
				if (Vector3.Distance(e.Position, ppos) > 800f) continue;
				_raw = e.EntityHandle;
				_usedUnits.Add(_raw);
				Console.WriteLine($"[Trainer] Adopted unit entity '{seen.Designer}' (idx {e.EntityIndex}).");
				if (e.TeamNum == _playerTeam) e.TeamNum = _enemyTeam;
				return;
			} catch { /* entity vanished */ }
		}
	}

	/// <summary>Gently try to repair a bot whose hero did not finish loading: re-select the hero, then force a respawn.</summary>
	private void Recover(double nowMs) {
		double age = nowMs - CreatedAtMs;
		var ctl = Players.FromSlot(Slot);
		if (ctl == null) return;
		try {
			if (_recoverStep == 0 && age > 2500) {
				_recoverStep = 1;
				Console.WriteLine($"[Trainer] Bot {Slot}: no model after {age:0} ms, selecting hero {Hero} again");
				ctl.SelectHero(Hero);
			} else if (_recoverStep == 1 && age > 4500) {
				_recoverStep = 2;
				Console.WriteLine($"[Trainer] Bot {Slot}: still no model, forcing respawn");
				ctl.GetHeroPawn()?.ForceRespawn();
			}
		} catch (Exception ex) {
			Console.WriteLine($"[Trainer] Bot recovery failed: {ex.Message}");
		}
	}

	/// <summary>Give up the bot (e.g. it never appeared) and continue with a marker only.</summary>
	public void DropBot() {
		if (Pooled) { BotPool.Release(_raw); _raw = CBaseEntity.InvalidEntityHandle; Wants = false; Pooled = false; return; }
		if (Method == BotMethod.Npc) { ReleaseNpc(); Wants = false; return; }
		if (Slot >= 0) TrainerBots.Remove(Slot);
		else if (_raw != CBaseEntity.InvalidEntityHandle) {
			_usedUnits.Remove(_raw);
			try { CBaseEntity.FromHandle(_raw)?.Remove(); } catch { }
		}
		Slot = -1;
		_raw = CBaseEntity.InvalidEntityHandle;
		Wants = false;
	}

	// ---- driving the bot -------------------------------------------------------------------------------------------

	/// <summary>Teleport the bot to feet and turn it toward lookAt. Keeps its health full.</summary>
	public double FirstPlaceAt;
	private bool _placed;
	private double _lastGroundCheck;
	private float _groundZ = -1e9f;

	public void Place(Vector3 feet, Vector3 lookAt) {
		Feet = feet;
		if (FirstPlaceAt <= 0) FirstPlaceAt = Clock.Ms;
		var e = Ent;
		if (e == null || !e.IsValid) return;
		float yaw = Aim.YawTo(feet, lookAt);
		try {
			// Teleporting every frame froze the bot in a T-pose in mid-air with no animation. Teleport only to get it into place,
			// then let it walk: set its horizontal velocity toward the target and leave gravity/animation to the game.
			var cur = e.Position;
			var d = new Vector3(feet.X - cur.X, feet.Y - cur.Y, 0f);
			float len = d.Length();
			if (!_placed || len > 220f || MathF.Abs(feet.Z - cur.Z) > 160f) {
				float gz = feet.Z;
				try {
					var r = Trace.Ray(feet + new Vector3(0f, 0f, 120f), feet - new Vector3(0f, 0f, 300f), InteractionLayer.Solid, e);
					if (r.DidHit) gz = feet.Z + 120f - r.Fraction * 420f; // ground height under the target spot
				} catch { }
				e.Teleport(position: new Vector3(feet.X, feet.Y, gz + 4f + TrainerConfig.BotZOffset), angles: new Vector3(0f, yaw, 0f), velocity: Vector3.Zero);
				_placed = true;
				_groundZ = gz + TrainerConfig.BotZOffset;
			} else {
				var v = len > 6f ? d / len * MathF.Min(len * 7f, 420f) : Vector3.Zero;
				// Ground height under the bot, measured every 400 ms; the vertical velocity is steered smoothly toward it
				// (teleporting up and down made the bot hover and jitter).
				double nowT = Clock.Ms;
				if (nowT - _lastGroundCheck > 400) {
					_lastGroundCheck = nowT;
					try {
						var r = Trace.Ray(cur + new Vector3(0f, 0f, 150f), cur - new Vector3(0f, 0f, 400f), InteractionLayer.Solid, e);
						if (r.DidHit) _groundZ = cur.Z + 150f - r.Fraction * 550f + TrainerConfig.BotZOffset;
					} catch { }
				}
				float vz = e.AbsVelocity.Z;
				if (_groundZ > -1e8f) {
					float dz = _groundZ - cur.Z;
					if (MathF.Abs(dz) > 220f) e.Teleport(position: new Vector3(cur.X, cur.Y, _groundZ + 2f));
					else vz = MathF.Abs(dz) > 3f ? Math.Clamp(dz * 9f, -350f, 350f) : 0f;
				}
				e.Teleport(velocity: new Vector3(v.X, v.Y, vz));
			}
			if (e.Is<CCitadelPlayerPawn>()) SetView(e.As<CCitadelPlayerPawn>()!, yaw);
			if (e.Health < e.MaxHealth) e.Health = e.MaxHealth;
		} catch { /* being rebuilt */ }
	}

	/// <summary>Set the bot's view direction: eye angles (schema) and, if enabled, raw v_angle like CCitadelPlayerPawn.ViewAngles reads it.</summary>
	private static unsafe void SetView(CCitadelPlayerPawn pawn, float yaw) {
		try { pawn.SetField<Vector3>("CCitadelPlayerPawn"u8, "m_angEyeAngles"u8, new Vector3(0f, yaw, 0f)); } catch { }
		if (!TrainerConfig.WriteViewAngles) return;
		try {
			float* p = (float*)(pawn.Handle + 0xC48);
			p[0] = 0f; p[1] = yaw; p[2] = 0f;
		} catch { }
	}

	public void Tint(byte r, byte g, byte b) {
		var e = Ent;
		if (e == null) return;
		try { e.RenderColor = System.Drawing.Color.FromArgb(255, r, g, b); } catch { /* no model entity */ }
	}

	/// <summary>Model of the human player's hero (known to be loaded on the client); used for the stand-in body when there is no bot.</summary>
	public static string PlayerModel = "";

	/// <summary>A harmless model prop (no bot, no game AI) that looks like a hero. Hit tests are done by geometry.</summary>
	public CBaseEntity? Body;

	/// <summary>When the first stand-in body was created plus the time the client needs to stream the model in (Clock.Ms), or 0.</summary>
	public static double BodyReadyAt;

	/// <summary>Spawn a stand-in prop with the player's hero model at pos (also used to pre-load the model while the menu is open).</summary>
	public static CBaseEntity? MakeBody(Vector3 pos) {
		if (string.IsNullOrEmpty(PlayerModel)) return null;
		try {
			var ent = CBaseEntity.CreateByName("prop_dynamic");
			if (ent == null) return null;
			ent.Teleport(position: pos);
			var kv = new CEntityKeyValues();
			kv.SetString("model", PlayerModel);
			kv.SetInt("solid", 0);
			ent.Spawn(kv);
			try { ent.SetModel(PlayerModel); } catch { }
			if (BodyReadyAt <= 0) BodyReadyAt = Clock.Ms + 10000;
			return ent;
		} catch (Exception ex) {
			Console.WriteLine($"[Trainer] Stand-in body failed: {ex.Message}");
			PlayerModel = "";
			return null;
		}
	}

	public void PlaceBody(Vector3 feet, Vector3 lookAt) {
		try {
			if (Body == null || !Body.IsValid) Body = MakeBody(feet);
			Body?.Teleport(position: feet, angles: new Vector3(0f, Aim.YawTo(feet, lookAt), 0f));
		} catch { }
	}

	public void KillBody() {
		var b = Body;
		Body = null;
		try { if (b != null && b.IsValid) b.Remove(); } catch { }
	}

	public void KillMarker() {
		var m = Marker;
		Marker = null;
		if (m == null) return;
		try { if (m.IsValid) m.Remove(); } catch { }
	}

	public void Dispose() {
		KillMarker();
		KillBody();
		DropBot();
	}
}
