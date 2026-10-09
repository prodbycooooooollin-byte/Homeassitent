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
	private static readonly List<(double At, int Slot, string Cmd)> _queue = new();

	/// <summary>
	/// Spawn a hero dummy in front of the player with the game's own command. It works only when it runs as the player
	/// (like typing it in the console) AND sv_cheats is already on: so cheats are switched on first and the command is
	/// sent to the player's client a moment later. (From the server console it does nothing; run in the same frame as
	/// the cheats switch it is rejected.)
	/// </summary>
	public static void RequestUnit(int playerSlot, Heroes hero, string teamArg) {
		SpawnWatch.Log = true;
		string cmd = $"citadel_create_unit {hero.ToHeroName()}";
		Console.WriteLine($"[Trainer] Requesting unit: {cmd}");
		try {
			Server.ExecuteCommand("sv_cheats 1");
			double at = Clock.Ms + 700 + 400 * _queue.Count;
			_queue.Add((at, playerSlot, cmd));
			CheatsOffAt = at + 4000;
		} catch (Exception ex) {
			LastError = ex.Message;
		}
	}

	/// <summary>Send queued unit commands to the player's client once cheats are on.</summary>
	public static void Pump(double nowMs) {
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
		BotPool.Forget(slot);
		_slots.Remove(slot);
		_wanted.Remove(slot);
		_configured.Remove(slot);
	}

	public static void ClearAll() {
		foreach (var s in _slots.ToArray()) Remove(s);
	}
}


/// <summary>
/// Bots are created while the player stands still in the menu (spawning them during an exercise, right after the teleport,
/// crashed the client) and are then lent to the exercises. After an exercise they are parked again.
/// </summary>
static class BotPool {
	public static int Target = 4;
	/// <summary>True while the menu is open (a calm moment to spawn).</summary>
	public static bool Active;

	private static readonly List<int> _all = new();
	private static readonly List<int> _free = new();
	private static readonly HashSet<int> _knownSlots = new();
	private static int _pending;
	private static double _requestAt, _nextSpawnAt;

	public static int Count => _all.Count;
	public static int FreeCount => _free.Count;

	public static bool Take(out int slot) {
		slot = -1;
		while (_free.Count > 0) {
			int s = _free[0];
			_free.RemoveAt(0);
			var ctl = Players.FromSlot(s);
			if (ctl?.GetHeroPawn() == null) { Forget(s); continue; }
			slot = s;
			return true;
		}
		return false;
	}

	public static void Release(int slot) {
		if (!_all.Contains(slot)) return;
		try { Players.FromSlot(slot)?.GetHeroPawn()?.Teleport(position: Vector3.Zero); } catch { }
		if (!_free.Contains(slot)) _free.Add(slot);
	}

	public static void Forget(int slot) {
		_all.Remove(slot);
		_free.Remove(slot);
	}

	public static void Clear() {
		_all.Clear(); _free.Clear(); _pending = 0;
	}

	/// <summary>Called every frame with the human player's controller.</summary>
	public static void Update(double nowMs, CCitadelPlayerController? human) {
		if (human == null) return;
		var pawn = human.GetHeroPawn();
		if (pawn == null || !pawn.IsAlive) return;

		if (_pending > 0) {
			foreach (var c in Players.GetAllControllers()) {
				int s = c.EntityIndex - 1;
				if (_knownSlots.Contains(s) || _all.Contains(s)) continue;
				_knownSlots.Add(s);
				TrainerBots.Adopt(s);
				_all.Add(s);
				_free.Add(s);
				_pending = Math.Max(0, _pending - 1);
				try { if (c.GetHeroPawn() is { } bp && bp.TeamNum == pawn.TeamNum) c.ChangeTeam(pawn.TeamNum == 2 ? 3 : 2); } catch { }
				Console.WriteLine($"[Trainer] Pool bot ready in slot {s} ({_all.Count}/{Target}).");
			}
			if (_pending > 0 && nowMs - _requestAt > 8000) { _pending = 0; Console.WriteLine("[Trainer] Pool: no bot appeared after a spawn request."); }
		}

		if (Active && _pending == 0 && _all.Count < Target && nowMs >= _nextSpawnAt && TrainerConfig.UsePool) {
			_knownSlots.Clear();
			foreach (var c in Players.GetAllControllers()) _knownSlots.Add(c.EntityIndex - 1);
			_pending = 1;
			_requestAt = nowMs;
			_nextSpawnAt = nowMs + 7000;
			TrainerBots.RequestUnit(human.EntityIndex - 1, pawn.HeroID, "");
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
		if (TrainerConfig.UsePool && BotPool.Take(out int pooled)) {
			a.Slot = pooled;
			a.Pooled = true;
			a.Method = BotMethod.Unit;
			a.Wants = true;
			return a;
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
			TrainerBots.RequestUnit(a._playerSlot, hero, player.TeamNum == 2 ? "combine" : "rebel");
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
			if (Slot < 0 && _raw == CBaseEntity.InvalidEntityHandle && nowMs - _requestAt > 7000 && !_fellBack) {
				_fellBack = true;
				Console.WriteLine("[Trainer] The unit command produced no unit; using model props instead.");
				var seen = SpawnWatch.Since(_requestAt - 50).Select(s => s.Designer).Where(d => d.Length > 0).Distinct().Take(15);
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
		foreach (var seen in SpawnWatch.Since(_requestAt - 50)) {
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
		if (Pooled && Slot >= 0) { BotPool.Release(Slot); Slot = -1; Wants = false; Pooled = false; return; }
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
	public void Place(Vector3 feet, Vector3 lookAt) {
		Feet = feet;
		var e = Ent;
		if (e == null || !e.IsValid) return;
		float yaw = Aim.YawTo(feet, lookAt);
		try {
			e.Teleport(position: feet, angles: new Vector3(0f, yaw, 0f), velocity: Vector3.Zero);
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
