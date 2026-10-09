using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>
/// Verwaltung der Trainings-Bots. Ein Bot ist ein "Fake-Client" (Deadworks: Server.CreateFakeClient) mit echtem Helden:
/// Er ist fuer alle Spieler sichtbar, hat echte Hitboxen und kann echte Nahkampfangriffe ausfuehren. Das Plugin steuert
/// ihn (Position, Blickrichtung, Angriffe) selbst.
/// </summary>
static class TrainerBots {
	private static readonly HashSet<int> _slots = new();
	private static readonly Dictionary<int, (int Team, Heroes Hero)> _wanted = new();
	private static readonly HashSet<int> _configured = new();

	public static string LastError = "";

	public static bool IsBotSlot(int slot) => _slots.Contains(slot);

	/// <summary>Legt einen Bot an. Gibt den Slot zurueck oder -1.</summary>
	public static int Create(int team, Heroes hero, string name) {
		int slot;
		try { slot = Server.CreateFakeClient(name); }
		catch (Exception ex) { LastError = ex.Message; return -1; }
		if (slot < 0) {
			LastError = "CreateFakeClient lieferte -1 (kein freier Slot)";
			return -1;
		}
		_slots.Add(slot);
		_wanted[slot] = (team, hero);
		Configure(slot);
		return slot;
	}

	/// <summary>Team und Held setzen. Wird direkt nach dem Anlegen und noch einmal bei FullConnect versucht.</summary>
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
		try { Server.Kick(slot); } catch { /* schon weg */ }
	}

	/// <summary>Der Slot wurde von der Engine entfernt; nur die Buchfuehrung bereinigen.</summary>
	public static void Forget(int slot) {
		_slots.Remove(slot);
		_wanted.Remove(slot);
		_configured.Remove(slot);
	}

	public static void ClearAll() {
		foreach (var s in _slots.ToArray()) Remove(s);
	}
}

/// <summary>Eine Figur in einer Uebung: ein Bot (wenn moeglich) und/oder ein Text-Marker.</summary>
sealed class Actor {
	public int Slot { get; private set; }
	public CPointWorldText? Marker;
	public Vector3 Feet;
	public double CreatedAtMs;

	public bool WantsBot => Slot >= 0;

	public Actor(int slot, Vector3 feet, double nowMs) {
		Slot = slot;
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

	public bool BotReady {
		get {
			var p = Pawn;
			return p != null && p.IsValid && p.IsAlive;
		}
	}

	public Vector3 Center => Feet + new Vector3(0, 0, TrainerConfig.CenterZ);

	/// <summary>Bot aufgeben (z. B. wenn er nicht entsteht) und nur mit Marker weitermachen.</summary>
	public void DropBot() {
		if (Slot >= 0) TrainerBots.Remove(Slot);
		Slot = -1;
	}

	/// <summary>Setzt den Bot an Position feet und dreht ihn zu lookAt (Teleport + Blickrichtung). Haelt ihn bei voller Gesundheit.</summary>
	public void Place(Vector3 feet, Vector3 lookAt) {
		Feet = feet;
		var pawn = Pawn;
		if (pawn == null || !pawn.IsValid) return;
		float yaw = Aim.YawTo(feet, lookAt);
		try {
			pawn.Teleport(position: feet, angles: new Vector3(0f, yaw, 0f), velocity: Vector3.Zero);
			SetView(pawn, yaw);
			if (pawn.Health < pawn.MaxHealth) pawn.Health = pawn.MaxHealth;
		} catch { /* Pawn gerade im Umbau */ }
	}

	/// <summary>Blickrichtung des Bots setzen: Eye-Angles (Schema) und, falls aktiviert, roh v_angle wie in CCitadelPlayerPawn.ViewAngles.</summary>
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
		try { pawn.RenderColor = System.Drawing.Color.FromArgb(255, r, g, b); } catch { /* kein Modell-Entity */ }
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
