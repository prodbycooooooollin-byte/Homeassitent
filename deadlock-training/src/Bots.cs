using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>
/// Bookkeeping for the training bots. A bot is a "fake client" (Deadworks: Server.CreateFakeClient) with a real hero:
/// it has real hitboxes and can perform real melee attacks. The plugin drives it (position, view direction, attacks).
/// </summary>
static class TrainerBots {
	private static readonly HashSet<int> _slots = new();
	private static readonly Dictionary<int, (int Team, Heroes Hero)> _wanted = new();
	private static readonly HashSet<int> _configured = new();

	public static string LastError = "";

	public static bool IsBotSlot(int slot) => _slots.Contains(slot);

	/// <summary>Creates a bot. Returns its slot or -1.</summary>
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

/// <summary>One figure in a drill: a bot (if possible) and/or a text marker.</summary>
sealed class Actor {
	public int Slot { get; private set; }
	public Heroes Hero { get; }
	public CPointWorldText? Marker;
	public Vector3 Feet;
	public double CreatedAtMs;
	private int _recoverStep;

	public bool WantsBot => Slot >= 0;

	public Actor(int slot, Heroes hero, Vector3 feet, double nowMs) {
		Slot = slot;
		Hero = hero;
		Feet = feet;
		CreatedAtMs = nowMs;
	}

	public CCitadelPlayerController? Ctl => Slot >= 0 ? Players.FromSlot(Slot) : null;

	public CCitadelPlayerPawn? Pawn {
		get {
			try { return Ctl?.GetHeroPawn(); }
			catch { return null; }
		}
	}

	/// <summary>The bot has a living hero pawn.</summary>
	public bool BotReady {
		get {
			var p = Pawn;
			return p != null && p.IsValid && p.IsAlive;
		}
	}

	/// <summary>The pawn has a model name (an empty one means the hero data did not load - the bot would be invisible).</summary>
	public string ModelName {
		get {
			try { return Pawn?.ModelName ?? ""; }
			catch { return ""; }
		}
	}

	public bool HasModel => !string.IsNullOrEmpty(ModelName);

	public Vector3 Center => Feet + new Vector3(0, 0, TrainerConfig.CenterZ);

	/// <summary>Gently try to repair a bot whose hero did not finish loading: re-select the hero, then force a respawn.</summary>
	public void Recover(double nowMs) {
		if (Slot < 0) return;
		double age = nowMs - CreatedAtMs;
		var ctl = Ctl;
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
		if (Slot >= 0) TrainerBots.Remove(Slot);
		Slot = -1;
	}

	/// <summary>Teleport the bot to feet and turn it toward lookAt. Keeps its health full.</summary>
	public void Place(Vector3 feet, Vector3 lookAt) {
		Feet = feet;
		var pawn = Pawn;
		if (pawn == null || !pawn.IsValid) return;
		float yaw = Aim.YawTo(feet, lookAt);
		try {
			pawn.Teleport(position: feet, angles: new Vector3(0f, yaw, 0f), velocity: Vector3.Zero);
			SetView(pawn, yaw);
			if (pawn.Health < pawn.MaxHealth) pawn.Health = pawn.MaxHealth;
		} catch { /* pawn is being rebuilt */ }
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
		var pawn = Pawn;
		if (pawn == null) return;
		try { pawn.RenderColor = System.Drawing.Color.FromArgb(255, r, g, b); } catch { /* no model entity */ }
	}

	public void KillMarker() {
		var m = Marker;
		Marker = null;
		if (m == null) return;
		try { if (m.IsValid) m.Remove(); } catch { }
	}

	public void Dispose() {
		KillMarker();
		DropBot();
	}
}
